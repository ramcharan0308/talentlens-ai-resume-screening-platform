import { prisma } from "@/lib/prisma";
import { AuthenticatedUser } from "@/lib/auth";
import { ApplicationStatus, OrganizationType, UserRole } from "@prisma/client";
import { CLIENT_VISIBLE_APPLICATION_STATUSES } from "@/lib/permissions";

export type ClientDecisionType = "SHORTLIST" | "REJECT" | "PROPOSE_INTERVIEW";

export interface ProcessClientDecisionInput {
  applicationId: string;
  decision: ClientDecisionType;
  rejectionReason?: string;
  proposedSlot?: string; // ISO date string
  proposedNote?: string;
}

export interface ProcessClientDecisionResult {
  success: boolean;
  applicationId?: string;
  candidateReference?: string;
  requisitionTitle?: string;
  previousStatus?: ApplicationStatus;
  newStatus?: ApplicationStatus;
  clientDecisionAt?: string;
  rejectionReason?: string | null;
  proposedSlot?: string | null;
  proposedNote?: string | null;
  error?: string;
  code?: string;
  statusCode: number;
}

/**
 * Validates and processes a Client Hiring Manager decision on an explicitly submitted candidate.
 *
 * Invariants Enforced:
 * 1. Actor must be a CLIENT_HIRING_MGR belonging to a CLIENT organization.
 * 2. Multi-tenant boundary: Application must be explicitly submitted to user's client organization
 *    (application.clientOrganizationId === user.organizationId).
 *    Cross-client requests return 404 to avoid leaking record existence.
 * 3. Application must be in a client-visible status (SUBMITTED_TO_CLIENT, CLIENT_SHORTLISTED, etc.).
 * 4. Permitted State Transitions:
 *    - SHORTLIST: Allowed from SUBMITTED_TO_CLIENT or INTERVIEW_PROPOSED. Blocked from CLIENT_REJECTED.
 *    - REJECT: Allowed from any active state. MANDATORY reason of at least 3 characters.
 *    - PROPOSE_INTERVIEW: Allowed from SUBMITTED_TO_CLIENT or CLIENT_SHORTLISTED.
 *      Requires valid ISO timestamp in the FUTURE. Blocked from CLIENT_REJECTED.
 *    - Client rejection is terminal for client portal; cannot be silently overwritten.
 * 5. Rejection is explicitly marked as a human client decision, not an AI auto-rejection.
 * 6. Generates an append-only AuditLog record capturing actor, client org, decision, reason/slot, and timestamp.
 */
export async function processClientDecision(
  user: AuthenticatedUser,
  input: ProcessClientDecisionInput
): Promise<ProcessClientDecisionResult> {
  // 1. Role & Organization Authorization
  if (user.role !== UserRole.CLIENT_HIRING_MGR) {
    return {
      success: false,
      error: "Only client hiring managers can submit candidate review decisions.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  if (user.organizationType !== OrganizationType.CLIENT) {
    return {
      success: false,
      error: "User does not belong to a client organization.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  const { applicationId, decision, rejectionReason, proposedSlot, proposedNote } = input;

  if (!applicationId || typeof applicationId !== "string") {
    return {
      success: false,
      error: "Application ID is required.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  if (!["SHORTLIST", "REJECT", "PROPOSE_INTERVIEW"].includes(decision)) {
    return {
      success: false,
      error: "Invalid decision. Must be one of: SHORTLIST, REJECT, PROPOSE_INTERVIEW.",
      code: "INVALID_DECISION",
      statusCode: 400,
    };
  }

  // 2. Fetch Application & Enforce Tenant Isolation
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      candidate: true,
      requisition: true,
      clientOrganization: true,
    },
  });

  if (!application) {
    return {
      success: false,
      error: "Application not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  // Multi-tenant barrier: verify destination client matches caller's client organization
  const isTargetClient = application.clientOrganizationId === user.organizationId;

  if (!isTargetClient) {
    // Return 404 Not Found to prevent leaking existence of other client records
    return {
      success: false,
      error: "Application not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  // Verify status is client-accessible
  if (!CLIENT_VISIBLE_APPLICATION_STATUSES.includes(application.status)) {
    return {
      success: false,
      error: "Candidate has not been submitted to client.",
      code: "NOT_SUBMITTED",
      statusCode: 404,
    };
  }

  // 3. State Transition Validation
  const currentStatus = application.status;
  let targetStatus: ApplicationStatus;
  let validatedReason: string | null = null;
  let validatedSlotDate: Date | null = null;

  if (decision === "SHORTLIST") {
    if (currentStatus === ApplicationStatus.CLIENT_REJECTED) {
      return {
        success: false,
        error: "Cannot shortlist an already rejected candidate dossier.",
        code: "INVALID_STATE_TRANSITION",
        statusCode: 422,
      };
    }
    targetStatus = ApplicationStatus.CLIENT_SHORTLISTED;
  } else if (decision === "REJECT") {
    if (currentStatus === ApplicationStatus.CLIENT_REJECTED) {
      return {
        success: false,
        error: "Cannot reject an already rejected candidate dossier.",
        code: "INVALID_STATE_TRANSITION",
        statusCode: 422,
      };
    }
    // Mandatory Rejection Reason
    if (!rejectionReason || typeof rejectionReason !== "string" || rejectionReason.trim().length < 3) {
      return {
        success: false,
        error: "A mandatory rejection reason (at least 3 characters) must be provided.",
        code: "REJECTION_REASON_REQUIRED",
        statusCode: 400,
      };
    }
    validatedReason = rejectionReason.trim();
    targetStatus = ApplicationStatus.CLIENT_REJECTED;
  } else if (decision === "PROPOSE_INTERVIEW") {
    if (currentStatus === ApplicationStatus.CLIENT_REJECTED) {
      return {
        success: false,
        error: "Cannot propose an interview for an already rejected candidate dossier.",
        code: "INVALID_STATE_TRANSITION",
        statusCode: 422,
      };
    }

    if (!proposedSlot || typeof proposedSlot !== "string") {
      return {
        success: false,
        error: "A valid proposed interview date and time must be provided.",
        code: "PROPOSED_SLOT_REQUIRED",
        statusCode: 400,
      };
    }

    const parsedDate = new Date(proposedSlot);
    if (isNaN(parsedDate.getTime())) {
      return {
        success: false,
        error: "Proposed interview slot is not a valid date/time format.",
        code: "INVALID_DATE_FORMAT",
        statusCode: 400,
      };
    }

    // Must be in the future
    if (parsedDate.getTime() <= Date.now()) {
      return {
        success: false,
        error: "Proposed interview slot must be set to a future date and time.",
        code: "PAST_DATE_PROHIBITED",
        statusCode: 400,
      };
    }

    validatedSlotDate = parsedDate;
    targetStatus = ApplicationStatus.INTERVIEW_PROPOSED;
  } else {
    return {
      success: false,
      error: "Unhandled decision type.",
      code: "INVALID_DECISION",
      statusCode: 400,
    };
  }

  const now = new Date();

  // 4. Update Application Record & Audit Log inside a database transaction with row-level locking and conditional update
  const txResult = await prisma.$transaction(
    async (tx) => {
      // Step A: Acquire exclusive row-level lock using SELECT ... FOR UPDATE
      // This serializes concurrent decision requests on PostgreSQL, preventing race conditions
      // where competing transactions read the same initial state before committing.
      const lockedRows = await tx.$queryRaw<
        Array<{
          id: string;
          status: ApplicationStatus;
          clientRejectionReason: string | null;
          proposedInterviewSlot: Date | null;
          proposedInterviewNote: string | null;
        }>
      >`SELECT id, status, "clientRejectionReason", "proposedInterviewSlot", "proposedInterviewNote" FROM "Application" WHERE id = ${application.id} FOR UPDATE`;

      const latest = lockedRows[0];
      if (!latest) {
        return {
          success: false as const,
          error: "Application record not found.",
          code: "NOT_FOUND",
          statusCode: 404,
        };
      }

      // Step B: Terminal Rejection Invariant Enforcement
      // If the candidate dossier is already in CLIENT_REJECTED status, any subsequent decision
      // (SHORTLIST, PROPOSE_INTERVIEW, or repeat REJECT) is forbidden.
      if (latest.status === ApplicationStatus.CLIENT_REJECTED) {
        return {
          success: false as const,
          error: "Cannot modify an already rejected candidate dossier.",
          code: "INVALID_STATE_TRANSITION",
          statusCode: 422,
        };
      }

      // Step C: Conditional Update
      // Even under concurrent execution, updateMany with a status predicate guarantees at the SQL level
      // that we only update the row if it has NOT been transitioned to CLIENT_REJECTED.
      const updateResult = await tx.application.updateMany({
        where: {
          id: application.id,
          status: { not: ApplicationStatus.CLIENT_REJECTED },
        },
        data: {
          status: targetStatus,
          clientDecisionAt: now,
          clientDecisionById: user.id,
          clientOrganizationId: user.organizationId,
          ...(decision === "REJECT" ? { clientRejectionReason: validatedReason } : {}),
          ...(decision === "PROPOSE_INTERVIEW"
            ? {
                proposedInterviewSlot: validatedSlotDate,
                proposedInterviewNote: proposedNote?.trim() || null,
              }
            : {}),
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false as const,
          error: "Cannot modify an already rejected candidate dossier.",
          code: "INVALID_STATE_TRANSITION",
          statusCode: 422,
        };
      }

      // Step D: Retrieve the updated record
      const updatedApp = await tx.application.findUniqueOrThrow({
        where: { id: application.id },
      });

      // Step E: Append-only Audit Log
      // Audit events are ONLY created for successful transitions; failed transitions create no audit logs.
      let auditAction = "CLIENT_CANDIDATE_SHORTLISTED";
      if (decision === "REJECT") auditAction = "CLIENT_CANDIDATE_REJECTED";
      if (decision === "PROPOSE_INTERVIEW") auditAction = "CLIENT_INTERVIEW_PROPOSED";

      await tx.auditLog.create({
        data: {
          action: auditAction,
          actorId: user.id,
          organizationId: user.organizationId,
          entityType: "Application",
          entityId: updatedApp.id,
          metadata: {
            candidateId: application.candidateId,
            candidateReference: application.candidate.candidateReference,
            requisitionId: application.requisitionId,
            requisitionTitle: application.requisition.title,
            previousStatus: latest.status,
            newStatus: targetStatus,
            decision,
            rejectionReason: validatedReason || latest.clientRejectionReason,
            proposedSlot: validatedSlotDate?.toISOString() || latest.proposedInterviewSlot?.toISOString() || null,
            proposedNote: proposedNote?.trim() || latest.proposedInterviewNote || null,
            clientDecisionAt: now.toISOString(),
            isAiAutoDecision: false, // Invariant: explicitly client human decision
          },
        },
      });

      return {
        success: true as const,
        app: updatedApp,
        previousStatus: latest.status,
      };
    },
    { maxWait: 10000, timeout: 15000 }
  );

  if (!txResult.success || !("app" in txResult)) {
    return {
      success: false,
      error: txResult.error,
      code: txResult.code,
      statusCode: txResult.statusCode || 400,
    };
  }

  const updatedApp = txResult.app;

  return {
    success: true,
    applicationId: updatedApp.id,
    candidateReference: application.candidate.candidateReference,
    requisitionTitle: application.requisition.title,
    previousStatus: txResult.previousStatus,
    newStatus: targetStatus,
    clientDecisionAt: now.toISOString(),
    rejectionReason: validatedReason,
    proposedSlot: validatedSlotDate?.toISOString() || null,
    proposedNote: proposedNote?.trim() || null,
    statusCode: 200,
  };
}

