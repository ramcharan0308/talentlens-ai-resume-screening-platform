import { redirect, notFound } from "next/navigation";
import { UserRole, ApplicationStatus } from "@prisma/client";
import { getSessionUser, AuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CLIENT_VISIBLE_APPLICATION_STATUSES } from "@/lib/permissions";

export interface PageAuthOptions {
  callbackUrl: string;
  allowedRoles?: UserRole[];
}

/**
 * 1. Base Server Page Authentication & Role Gate.
 * Verifies active session, checks active status, and enforces role permissions.
 * Redirects unauthenticated to /login and unauthorized roles to /forbidden.
 */
export async function requirePageAuth(options: PageAuthOptions): Promise<AuthenticatedUser> {
  const user = await getSessionUser();

  if (!user || !user.isActive) {
    redirect(`/login?callbackUrl=${encodeURIComponent(options.callbackUrl)}`);
  }

  if (options.allowedRoles && options.allowedRoles.length > 0 && !options.allowedRoles.includes(user.role)) {
    redirect("/forbidden");
  }

  return user;
}

/**
 * Pure authorization checker for Base Page Auth (for unit testing without Next.js navigation throws).
 */
export function checkPageAuthorization(
  user: AuthenticatedUser | null,
  options: { callbackUrl: string; allowedRoles?: UserRole[] }
): { authorized: boolean; action: "ALLOW" | "REDIRECT_LOGIN" | "REDIRECT_FORBIDDEN"; redirectUrl?: string } {
  if (!user || !user.isActive) {
    return {
      authorized: false,
      action: "REDIRECT_LOGIN",
      redirectUrl: `/login?callbackUrl=${encodeURIComponent(options.callbackUrl)}`,
    };
  }

  if (options.allowedRoles && options.allowedRoles.length > 0 && !options.allowedRoles.includes(user.role)) {
    return {
      authorized: false,
      action: "REDIRECT_FORBIDDEN",
      redirectUrl: "/forbidden",
    };
  }

  return { authorized: true, action: "ALLOW" };
}

/**
 * 2. Requisition Detail Page Server Authorization & Tenancy Gate.
 * Enforces server-side authentication, checks tenant ownership, and prevents cross-tenant access.
 */
export async function requireRequisitionDetailPageAuth(requisitionId: string): Promise<{
  user: AuthenticatedUser;
  requisition: any;
}> {
  const user = await requirePageAuth({
    callbackUrl: `/requisitions/${requisitionId}`,
  });

  const requisition = await prisma.requisition.findUnique({
    where: { id: requisitionId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true, type: true } },
      scorecardCriteria: { orderBy: { weight: "desc" } },
      applications: {
        select: { id: true, status: true, clientOrganizationId: true },
      },
      _count: { select: { applications: true, scorecardCriteria: true } },
    },
  });

  const access = checkRequisitionAccess(user, requisition);
  if (!access.allowed) {
    notFound();
  }

  return { user, requisition };
}

/**
 * Pure authorization checker for Requisition Detail access.
 */
export function checkRequisitionAccess(
  user: AuthenticatedUser,
  requisition: {
    organizationId: string;
    clientOrganizationId?: string | null;
    applications?: Array<{ status: ApplicationStatus | string; clientOrganizationId?: string | null }>;
  } | null
): { allowed: boolean; reason?: string } {
  if (!requisition) {
    return { allowed: false, reason: "Requisition not found" };
  }

  if (user.role === UserRole.CLIENT_HIRING_MGR) {
    // Client can only view requisitions where candidates have been submitted to client or assigned to client org
    if (requisition.clientOrganizationId === user.organizationId) {
      return { allowed: true };
    }
    const hasVisibleApp = requisition.applications?.some((app) =>
      CLIENT_VISIBLE_APPLICATION_STATUSES.includes(app.status as ApplicationStatus) &&
      app.clientOrganizationId === user.organizationId
    );
    if (!hasVisibleApp) {
      return { allowed: false, reason: "Client hiring manager cannot access unassigned/unsubmitted requisition" };
    }
    return { allowed: true };
  }

  // Agency staff (RECRUITER, DELIVERY_HEAD): must match user's agency organization
  if (requisition.organizationId !== user.organizationId) {
    return { allowed: false, reason: "Requisition belongs to a different agency tenant" };
  }

  return { allowed: true };
}

/**
 * 3. Requisition Edit Page Server Authorization & Tenancy Gate.
 * Strictly forbids client hiring managers and validates agency ownership.
 */
export async function requireRequisitionEditPageAuth(requisitionId: string): Promise<{
  user: AuthenticatedUser;
  requisition: any;
}> {
  const user = await requirePageAuth({
    callbackUrl: `/requisitions/${requisitionId}/edit`,
    allowedRoles: [UserRole.RECRUITER, UserRole.DELIVERY_HEAD],
  });

  const requisition = await prisma.requisition.findUnique({
    where: { id: requisitionId },
    include: {
      scorecardCriteria: { orderBy: { weight: "desc" } },
    },
  });

  const access = checkRequisitionEditAccess(user, requisition);
  if (!access.allowed) {
    if (access.forbidden) {
      redirect("/forbidden");
    }
    notFound();
  }

  return { user, requisition };
}

/**
 * Pure authorization checker for Requisition Edit access.
 */
export function checkRequisitionEditAccess(
  user: AuthenticatedUser,
  requisition: { organizationId: string } | null
): { allowed: boolean; forbidden?: boolean; reason?: string } {
  // Client hiring managers can NEVER edit requisitions
  if (user.role === UserRole.CLIENT_HIRING_MGR) {
    return { allowed: false, forbidden: true, reason: "Client hiring managers cannot edit requisitions" };
  }

  if (!requisition) {
    return { allowed: false, reason: "Requisition not found" };
  }

  if (requisition.organizationId !== user.organizationId) {
    return { allowed: false, reason: "Requisition belongs to a different agency tenant" };
  }

  return { allowed: true };
}

/**
 * 4. Candidate Detail Page Server Authorization & Tenancy Gate.
 * Enforces ownership:
 * - Agency staff can only access candidates belonging to their agency.
 * - Client hiring managers can ONLY access candidates who have been submitted to client (not unsourced).
 */
export async function requireCandidateDetailPageAuth(candidateId: string): Promise<{
  user: AuthenticatedUser;
  candidate: any;
}> {
  const user = await requirePageAuth({
    callbackUrl: `/candidates/${candidateId}`,
  });

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      applications: {
        include: {
          requisition: {
            select: { id: true, title: true, status: true, department: true, location: true, organizationId: true, clientOrganizationId: true },
          },
        },
      },
      uploadedDocuments: {
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSizeBytes: true,
          fileHash: true,
          processingStatus: true,
          createdAt: true,
        },
      },
    },
  });

  const access = checkCandidateAccess(user, candidate);
  if (!access.allowed) {
    notFound();
  }

  return { user, candidate };
}

/**
 * Pure authorization checker for Candidate Detail access.
 */
export function checkCandidateAccess(
  user: AuthenticatedUser,
  candidate: {
    agencyId: string;
    applications: Array<{
      status: ApplicationStatus | string;
      clientOrganizationId?: string | null;
      requisition?: { organizationId: string; clientOrganizationId?: string | null };
    }>;
  } | null
): { allowed: boolean; reason?: string } {
  if (!candidate) {
    return { allowed: false, reason: "Candidate not found" };
  }

  if (user.role === UserRole.CLIENT_HIRING_MGR) {
    // Client hiring manager can ONLY access candidates who have an application submitted to THIS client
    // Unsourced candidates or candidates only in internal screening MUST be blocked (404)
    const hasSubmittedApplication = candidate.applications.some((app) =>
      CLIENT_VISIBLE_APPLICATION_STATUSES.includes(app.status as ApplicationStatus) &&
      app.clientOrganizationId === user.organizationId
    );

    if (!hasSubmittedApplication) {
      return {
        allowed: false,
        reason: "Candidate has not been submitted to client (unsourced/unsubmitted dossier)",
      };
    }

    return { allowed: true };
  }

  // Agency staff (RECRUITER, DELIVERY_HEAD): candidate must belong to caller's agency
  if (candidate.agencyId !== user.organizationId) {
    return { allowed: false, reason: "Candidate belongs to a different agency tenant" };
  }

  return { allowed: true };
}

/**
 * 5. Resume Upload Page Server Authorization.
 * Only agency RECRUITER can access bulk ingestion.
 */
export async function requireResumeUploadPageAuth(): Promise<AuthenticatedUser> {
  return requirePageAuth({
    callbackUrl: "/resumes/upload",
    allowedRoles: [UserRole.RECRUITER],
  });
}

/**
 * Pure authorization checker for Resume Upload access.
 */
export function checkResumeUploadAccess(user: AuthenticatedUser | null): {
  allowed: boolean;
  action: "ALLOW" | "REDIRECT_LOGIN" | "REDIRECT_FORBIDDEN";
} {
  if (!user || !user.isActive) {
    return { allowed: false, action: "REDIRECT_LOGIN" };
  }
  if (user.role !== UserRole.RECRUITER) {
    return { allowed: false, action: "REDIRECT_FORBIDDEN" };
  }
  return { allowed: true, action: "ALLOW" };
}

/**
 * 6. Retention & Deletion Governance Page Server Authorization.
 * Only Agency RECRUITER or DELIVERY_HEAD can access.
 * Client hiring managers are strictly redirected to /forbidden.
 */
export async function requireRetentionPageAuth(): Promise<AuthenticatedUser> {
  return requirePageAuth({
    callbackUrl: "/retention",
    allowedRoles: [UserRole.RECRUITER, UserRole.DELIVERY_HEAD],
  });
}
