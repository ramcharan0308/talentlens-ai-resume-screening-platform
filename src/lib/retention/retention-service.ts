import { prisma } from "@/lib/prisma";
import { AuthenticatedUser } from "@/lib/auth";
import { OrganizationType, UserRole, CandidatePurgeStatus } from "@prisma/client";

export interface CreateRetentionPolicyInput {
  name: string;
  description?: string;
  retentionDays: number;
  purpose?: string;
}

export interface RetentionOperationResult {
  success: boolean;
  policy?: any;
  policies?: any[];
  candidates?: any[];
  totalCount?: number;
  error?: string;
  code?: string;
  statusCode: number;
}

/**
 * 1. Create / Configure Agency Retention Policy.
 * Strictly requires DELIVERY_HEAD role.
 */
export async function createRetentionPolicy(
  actor: AuthenticatedUser,
  input: CreateRetentionPolicyInput
): Promise<RetentionOperationResult> {
  if (actor.role === UserRole.CLIENT_HIRING_MGR) {
    return {
      success: false,
      error: "Client hiring managers cannot configure retention policies.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  if (actor.organizationType !== OrganizationType.AGENCY) {
    return {
      success: false,
      error: "Only agency staff can configure retention policies.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  if (actor.role !== UserRole.DELIVERY_HEAD) {
    return {
      success: false,
      error: "Only Delivery Heads are authorized to configure retention policies.",
      code: "DELIVERY_HEAD_REQUIRED",
      statusCode: 403,
    };
  }

  const { name, description, retentionDays, purpose = "RECRUITMENT_PROCESSING" } = input;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return {
      success: false,
      error: "Retention policy name is required.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  if (!retentionDays || typeof retentionDays !== "number" || retentionDays <= 0) {
    return {
      success: false,
      error: "Retention period in days must be a positive integer.",
      code: "INVALID_RETENTION_DAYS",
      statusCode: 400,
    };
  }

  const policy = await prisma.retentionPolicy.create({
    data: {
      agencyId: actor.organizationId,
      name: name.trim(),
      description: description?.trim() || null,
      retentionDays,
      purpose,
      isActive: true,
      createdById: actor.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      organizationId: actor.organizationId,
      action: "RETENTION_POLICY_CREATED",
      entityType: "RetentionPolicy",
      entityId: policy.id,
      metadata: {
        name: policy.name,
        retentionDays: policy.retentionDays,
        purpose: policy.purpose,
      },
    },
  });

  return {
    success: true,
    policy,
    statusCode: 201,
  };
}

/**
 * 2. Get active retention policies for agency.
 */
export async function getRetentionPolicies(
  actor: AuthenticatedUser
): Promise<RetentionOperationResult> {
  if (actor.role === UserRole.CLIENT_HIRING_MGR) {
    return {
      success: false,
      error: "Client hiring managers cannot view internal retention policies.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  const policies = await prisma.retentionPolicy.findMany({
    where: { agencyId: actor.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return {
    success: true,
    policies,
    statusCode: 200,
  };
}

/**
 * 3. Set or update a candidate's explicit retention expiry date.
 */
export async function setCandidateRetentionExpiry(
  actor: AuthenticatedUser,
  candidateId: string,
  expiresAt: Date
): Promise<RetentionOperationResult> {
  if (actor.role === UserRole.CLIENT_HIRING_MGR) {
    return {
      success: false,
      error: "Client hiring managers cannot modify candidate retention dates.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, agencyId: true, candidateReference: true, retentionExpiresAt: true },
  });

  if (!candidate) {
    return {
      success: false,
      error: "Candidate not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  if (candidate.agencyId !== actor.organizationId) {
    return {
      success: false,
      error: "Cross-agency access violation.",
      code: "CROSS_AGENCY_FORBIDDEN",
      statusCode: 403,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: { retentionExpiresAt: expiresAt },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        organizationId: candidate.agencyId,
        action: "CANDIDATE_RETENTION_EXPIRY_UPDATED",
        entityType: "Candidate",
        entityId: candidate.candidateReference,
        metadata: {
          candidateId,
          expiresAt: expiresAt.toISOString(),
          previousExpiresAt: candidate.retentionExpiresAt?.toISOString() || null,
        },
      },
    });
  }, { maxWait: 15000, timeout: 30000 });

  return {
    success: true,
    statusCode: 200,
  };
}

/**
 * 4. Safe Review of Expired / Retention-Flagged Candidates.
 * Identifies records where retentionExpiresAt has passed, or records exceeding active policy thresholds.
 * Strictly does NOT automatically delete.
 * Requires authorized approval for any destructive operations.
 */
export async function getRetentionReviewCandidates(
  actor: AuthenticatedUser,
  options?: { limit?: number; offset?: number }
): Promise<RetentionOperationResult> {
  if (actor.role === UserRole.CLIENT_HIRING_MGR) {
    return {
      success: false,
      error: "Client hiring managers cannot access internal retention review.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  if (actor.organizationType !== OrganizationType.AGENCY) {
    return {
      success: false,
      error: "Only agency staff can access retention review.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  const now = new Date();
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  // Find active agency policies to check default threshold
  const policies = await prisma.retentionPolicy.findMany({
    where: { agencyId: actor.organizationId, isActive: true },
    orderBy: { retentionDays: "asc" },
  });

  // Calculate default cutoff date if a policy exists
  let policyCutoff: Date | undefined;
  if (policies.length > 0) {
    const days = policies[0].retentionDays;
    policyCutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  // Build query for candidates that have either explicit retention expiry passed
  // OR were created before the active policy cutoff (and are still ACTIVE)
  const orConditions: any[] = [
    { retentionExpiresAt: { lte: now } },
  ];

  if (policyCutoff) {
    orConditions.push({ createdAt: { lte: policyCutoff } });
  }

  const candidates = await prisma.candidate.findMany({
    where: {
      agencyId: actor.organizationId,
      purgeStatus: CandidatePurgeStatus.ACTIVE,
      OR: orConditions,
    },
    select: {
      id: true,
      candidateReference: true,
      fullName: true,
      currentRole: true,
      createdAt: true,
      retentionExpiresAt: true,
      purgeStatus: true,
      consentRecords: {
        select: {
          id: true,
          purpose: true,
          status: true,
          withdrawnAt: true,
        },
      },
      deletionRequests: {
        where: {
          status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] },
        },
        select: { id: true, status: true },
      },
    },
    orderBy: { createdAt: "asc" },
    skip: offset,
    take: limit,
  });

  const totalCount = await prisma.candidate.count({
    where: {
      agencyId: actor.organizationId,
      purgeStatus: CandidatePurgeStatus.ACTIVE,
      OR: orConditions,
    },
  });

  return {
    success: true,
    candidates,
    totalCount,
    statusCode: 200,
  };
}

