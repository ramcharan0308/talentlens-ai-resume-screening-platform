import { prisma } from "@/lib/prisma";
import { AuthenticatedUser } from "@/lib/auth";
import { ApplicationStatus, ConsentStatus, OrganizationType, UserRole } from "@prisma/client";
import { CLIENT_VISIBLE_APPLICATION_STATUSES } from "@/lib/permissions";
import { checkCandidateConsent, CONSENT_PURPOSES } from "@/lib/consent/consent-service";

export interface TransitionApplicationInput {
  applicationId: string;
  targetStatus: ApplicationStatus;
  expectedRequisitionId?: string;
  reason?: string;
  scheduledSlot?: string; // ISO date string
  scheduledNote?: string;
  note?: string;
}

export interface TransitionApplicationResult {
  success: boolean;
  application?: any;
  previousStatus?: ApplicationStatus;
  newStatus?: ApplicationStatus;
  error?: string;
  code?: string;
  statusCode: number;
}

/**
 * Valid stage transition mapping.
 * Terminal states (REJECTED, CLIENT_REJECTED, JOINED) have no outgoing transitions.
 */
export const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.SOURCED]: [
    ApplicationStatus.SCREENED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.SCREENED]: [
    ApplicationStatus.SUBMITTED_TO_CLIENT,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.SUBMITTED_TO_CLIENT]: [
    ApplicationStatus.CLIENT_SHORTLISTED,
    ApplicationStatus.CLIENT_REJECTED,
    ApplicationStatus.INTERVIEW_PROPOSED,
    ApplicationStatus.INTERVIEW_SCHEDULED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.CLIENT_SHORTLISTED]: [
    ApplicationStatus.INTERVIEW_PROPOSED,
    ApplicationStatus.INTERVIEW_SCHEDULED,
    ApplicationStatus.OFFERED,
    ApplicationStatus.CLIENT_REJECTED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.INTERVIEW_PROPOSED]: [
    ApplicationStatus.INTERVIEW_SCHEDULED,
    ApplicationStatus.CLIENT_SHORTLISTED,
    ApplicationStatus.CLIENT_REJECTED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.INTERVIEW_SCHEDULED]: [
    ApplicationStatus.INTERVIEW_SCHEDULED, // Slot rescheduling
    ApplicationStatus.INTERVIEW_COMPLETED,
    ApplicationStatus.OFFERED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.INTERVIEW_COMPLETED]: [
    ApplicationStatus.OFFERED,
    ApplicationStatus.INTERVIEW_SCHEDULED, // Second interview round
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.OFFERED]: [
    ApplicationStatus.JOINED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.JOINED]: [], // Positive terminal state
  [ApplicationStatus.CLIENT_REJECTED]: [], // Negative terminal state
  [ApplicationStatus.REJECTED]: [], // Negative terminal state
};

/**
 * Validates whether a role is authorized to perform a specific stage transition.
 */
export function isRoleAuthorizedForTransition(
  role: UserRole,
  currentStatus: ApplicationStatus,
  targetStatus: ApplicationStatus
): boolean {
  // Client Hiring Managers can ONLY perform client review decisions
  if (role === UserRole.CLIENT_HIRING_MGR) {
    const clientAllowedCurrent: ApplicationStatus[] = [
      ApplicationStatus.SUBMITTED_TO_CLIENT,
      ApplicationStatus.CLIENT_SHORTLISTED,
      ApplicationStatus.INTERVIEW_PROPOSED,
    ];
    const clientAllowedTarget: ApplicationStatus[] = [
      ApplicationStatus.CLIENT_SHORTLISTED,
      ApplicationStatus.CLIENT_REJECTED,
      ApplicationStatus.INTERVIEW_PROPOSED,
    ];
    return clientAllowedCurrent.includes(currentStatus) && clientAllowedTarget.includes(targetStatus);
  }

  // Agency Recruiters & Delivery Heads manage pipeline progression
  if (role === UserRole.RECRUITER || role === UserRole.DELIVERY_HEAD) {
    // Agency staff cannot perform client decisions on behalf of clients via generic transition
    // (Client decisions require client hiring manager credentials in client portal)
    if (targetStatus === ApplicationStatus.CLIENT_SHORTLISTED || targetStatus === ApplicationStatus.CLIENT_REJECTED) {
      return false;
    }

    // Agency staff can advance candidates through sourcing, screening, scheduling, offer, joined, and agency rejection
    return true;
  }

  return false;
}

/**
 * Centralized transition service with row-level locking, terminal rejection enforcement,
 * conditional updates, and transactional audit logging.
 */
export async function transitionApplicationStage(
  user: AuthenticatedUser,
  input: TransitionApplicationInput
): Promise<TransitionApplicationResult> {
  const { applicationId, targetStatus, reason, scheduledSlot, scheduledNote, note } = input;

  if (!applicationId || typeof applicationId !== "string") {
    return {
      success: false,
      error: "Application ID is required.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  if (!Object.values(ApplicationStatus).includes(targetStatus)) {
    return {
      success: false,
      error: `Invalid target status: ${targetStatus}`,
      code: "INVALID_STATUS",
      statusCode: 400,
    };
  }

  // 1. Fetch Application & Requisition to check tenant boundaries
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      requisition: true,
      candidate: true,
      clientOrganization: true,
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
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

  // Verify Requisition ID match if expectedRequisitionId is provided (nested route integrity)
  if (input.expectedRequisitionId && application.requisitionId !== input.expectedRequisitionId) {
    return {
      success: false,
      error: "Application not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  // 2. Multi-tenant Authorization
  if (user.organizationType === OrganizationType.AGENCY) {
    if (application.requisition.organizationId !== user.organizationId) {
      return {
        success: false,
        error: "Forbidden: Application belongs to another agency.",
        code: "FORBIDDEN",
        statusCode: 403,
      };
    }
  } else if (user.organizationType === OrganizationType.CLIENT) {
    // Client can only view/act on applications explicitly submitted to their client organization
    const isTargetClient = application.clientOrganizationId === user.organizationId;

    if (!isTargetClient || !CLIENT_VISIBLE_APPLICATION_STATUSES.includes(application.status)) {
      return {
        success: false,
        error: "Application not found.",
        code: "NOT_FOUND",
        statusCode: 404,
      };
    }
  } else {
    return {
      success: false,
      error: "Unauthorized organization type.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  // 2.1 Pending Deletion Guard: Block pipeline progression if deletion requested
  if (
    application.candidate.purgeStatus === "PURGE_REQUESTED" ||
    application.candidate.purgeStatus === "PURGED"
  ) {
    return {
      success: false,
      error: "Candidate has an active deletion request in progress. Stage transitions are blocked.",
      code: "CANDIDATE_DELETION_PENDING",
      statusCode: 403,
    };
  }

  const openDeletionRequest = await prisma.candidateDeletionRequest.findFirst({
    where: {
      candidateId: application.candidateId,
      status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] },
    },
  });
  if (openDeletionRequest) {
    return {
      success: false,
      error: "Candidate has an active deletion request in progress. Stage transitions are blocked.",
      code: "CANDIDATE_DELETION_PENDING",
      statusCode: 403,
    };
  }

  // 3. Pre-validate Role & Permitted Transitions
  if (!isRoleAuthorizedForTransition(user.role, application.status, targetStatus)) {
    return {
      success: false,
      error: `User with role ${user.role} is not permitted to transition application to ${targetStatus}.`,
      code: "FORBIDDEN_TRANSITION",
      statusCode: 403,
    };
  }

  const allowedNext = ALLOWED_TRANSITIONS[application.status] || [];
  if (!allowedNext.includes(targetStatus)) {
    return {
      success: false,
      error: `Invalid state transition from ${application.status} to ${targetStatus}.`,
      code: "INVALID_STATE_TRANSITION",
      statusCode: 422,
    };
  }

  // 4. Validate Specific Transition Requirements
  let validatedReason: string | null = null;
  let validatedSlotDate: Date | null = null;

  // Rejection requires a mandatory reason of >= 3 characters
  if (targetStatus === ApplicationStatus.REJECTED || targetStatus === ApplicationStatus.CLIENT_REJECTED) {
    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return {
        success: false,
        error: "A mandatory rejection reason (at least 3 characters) is required.",
        code: "REJECTION_REASON_REQUIRED",
        statusCode: 400,
      };
    }
    validatedReason = reason.trim();
  }

  // Interview Scheduled requires a valid scheduled slot
  if (targetStatus === ApplicationStatus.INTERVIEW_SCHEDULED) {
    if (!scheduledSlot || typeof scheduledSlot !== "string") {
      return {
        success: false,
        error: "A valid scheduled interview date and time must be provided.",
        code: "SCHEDULED_SLOT_REQUIRED",
        statusCode: 400,
      };
    }
    const parsedSlot = new Date(scheduledSlot);
    if (isNaN(parsedSlot.getTime())) {
      return {
        success: false,
        error: "Invalid date format for scheduled interview slot.",
        code: "INVALID_DATE_FORMAT",
        statusCode: 400,
      };
    }
    validatedSlotDate = parsedSlot;
  }

  // Interview Proposed: parse slot date if provided
  if (targetStatus === ApplicationStatus.INTERVIEW_PROPOSED && scheduledSlot) {
    const parsedSlot = new Date(scheduledSlot);
    if (!isNaN(parsedSlot.getTime())) {
      validatedSlotDate = parsedSlot;
    }
  }

  // Screening -> requires completed evaluation with recruiter review
  if (targetStatus === ApplicationStatus.SCREENED) {
    const latestEval = application.evaluations[0];
    if (!latestEval || latestEval.status !== "COMPLETED") {
      return {
        success: false,
        error: "Cannot mark as SCREENED: AI screening evaluation has not been completed.",
        code: "SCREENING_NOT_COMPLETED",
        statusCode: 422,
      };
    }
    if (!latestEval.isReviewedByRecruiter) {
      return {
        success: false,
        error: "Cannot mark as SCREENED: Evaluation has not been reviewed by a recruiter.",
        code: "RECRUITER_REVIEW_REQUIRED",
        statusCode: 428,
      };
    }
  }

  // Submission -> Requisition must have client organization assigned
  if (targetStatus === ApplicationStatus.SUBMITTED_TO_CLIENT) {
    if (!application.requisition.clientOrganizationId) {
      return {
        success: false,
        error: "Cannot submit to client: Requisition has no assigned client organization.",
        code: "NO_CLIENT_ASSIGNED",
        statusCode: 422,
      };
    }
    // Verify recruiter has inspected CV
    const latestEval = application.evaluations[0];
    if (!latestEval || !latestEval.documentId) {
      return {
        success: false,
        error: "Cannot submit to client: No associated CV document found.",
        code: "NO_CV_DOCUMENT",
        statusCode: 422,
      };
    }
    const cvViewed = await prisma.auditLog.findFirst({
      where: {
        action: "ORIGINAL_CV_VIEWED",
        actorId: user.id,
        organizationId: user.organizationId,
        entityType: "UploadedDocument",
        entityId: latestEval.documentId,
      },
    });
    if (!cvViewed) {
      return {
        success: false,
        error: "Cannot submit to client: Recruiter must inspect the original CV before submission.",
        code: "CV_NOT_VIEWED",
        statusCode: 428,
      };
    }

    // Consent checks for client submission
    const recruitmentConsent = await checkCandidateConsent(
      application.candidateId,
      application.candidate.agencyId,
      CONSENT_PURPOSES.RECRUITMENT_PROCESSING
    );
    if (recruitmentConsent.isWithdrawn) {
      return {
        success: false,
        error: "Cannot submit to client: Candidate has withdrawn consent for recruitment processing.",
        code: "CONSENT_WITHDRAWN",
        statusCode: 403,
      };
    }
    if (recruitmentConsent.status === ConsentStatus.PENDING_VERIFICATION) {
      return {
        success: false,
        error: "Cannot submit to client: Candidate recruitment processing consent is pending verification.",
        code: "CONSENT_PENDING",
        statusCode: 403,
      };
    }

    const sharingConsent = await checkCandidateConsent(
      application.candidateId,
      application.candidate.agencyId,
      CONSENT_PURPOSES.THIRD_PARTY_SHARING
    );
    if (sharingConsent.isWithdrawn) {
      return {
        success: false,
        error: "Cannot submit to client: Candidate has explicitly withdrawn consent for third-party client sharing.",
        code: "THIRD_PARTY_CONSENT_WITHDRAWN",
        statusCode: 403,
      };
    }
    if (sharingConsent.status === ConsentStatus.PENDING_VERIFICATION) {
      return {
        success: false,
        error: "Cannot submit to client: Candidate third-party client sharing consent is pending verification.",
        code: "THIRD_PARTY_CONSENT_PENDING",
        statusCode: 403,
      };
    }
  }

  const now = new Date();

  // 5. Database Transaction with Row-Level Locking and Conditional Updates
  const txResult = await prisma.$transaction(
    async (tx) => {
      // Step A: Acquire exclusive row lock
      const lockedRows = await tx.$queryRaw<
        Array<{
          id: string;
          status: ApplicationStatus;
          clientRejectionReason: string | null;
          rejectionReason: string | null;
          interviewScheduledSlot: Date | null;
          interviewScheduledNote: string | null;
        }>
      >`SELECT id, status, "clientRejectionReason", "rejectionReason", "interviewScheduledSlot", "interviewScheduledNote"
        FROM "Application" WHERE id = ${application.id} FOR UPDATE`;

      const latest = lockedRows[0];
      if (!latest) {
        return {
          success: false as const,
          error: "Application record not found.",
          code: "NOT_FOUND",
          statusCode: 404,
        };
      }

      // Step B: Terminal Rejection Check
      if (
        latest.status === ApplicationStatus.CLIENT_REJECTED ||
        latest.status === ApplicationStatus.REJECTED
      ) {
        return {
          success: false as const,
          error: "Cannot transition an already rejected candidate dossier.",
          code: "INVALID_STATE_TRANSITION",
          statusCode: 422,
        };
      }

      // Step C: Terminal Joined Check
      if (latest.status === ApplicationStatus.JOINED) {
        return {
          success: false as const,
          error: "Cannot transition a candidate who has already joined.",
          code: "INVALID_STATE_TRANSITION",
          statusCode: 422,
        };
      }

      // Step D: Invariant State Transition Check inside lock
      const lockedAllowed = ALLOWED_TRANSITIONS[latest.status] || [];
      if (!lockedAllowed.includes(targetStatus)) {
        return {
          success: false as const,
          error: `Concurrent state transition conflict: application is now ${latest.status}, cannot transition to ${targetStatus}.`,
          code: "CONCURRENT_CONFLICT",
          statusCode: 409,
        };
      }

      // Step E: Conditional Update
      const updateResult = await tx.application.updateMany({
        where: {
          id: application.id,
          status: {
            notIn: [ApplicationStatus.CLIENT_REJECTED, ApplicationStatus.REJECTED, ApplicationStatus.JOINED],
          },
        },
        data: {
          status: targetStatus,
          ...(targetStatus === ApplicationStatus.SUBMITTED_TO_CLIENT
            ? {
                submittedAt: now,
                submittedById: user.id,
                clientOrganizationId: application.requisition.clientOrganizationId,
              }
            : {}),
          ...(targetStatus === ApplicationStatus.INTERVIEW_SCHEDULED
            ? {
                interviewScheduledSlot: validatedSlotDate,
                interviewScheduledNote: scheduledNote?.trim() || null,
              }
            : {}),
          ...(targetStatus === ApplicationStatus.INTERVIEW_PROPOSED
            ? {
                proposedInterviewSlot: validatedSlotDate,
                proposedInterviewNote: (scheduledNote || note || reason)?.trim() || null,
                clientDecisionAt: now,
                clientDecisionById: user.id,
              }
            : {}),
          ...(targetStatus === ApplicationStatus.CLIENT_SHORTLISTED
            ? {
                clientDecisionAt: now,
                clientDecisionById: user.id,
              }
            : {}),
          ...(targetStatus === ApplicationStatus.OFFERED
            ? { offeredAt: now }
            : {}),
          ...(targetStatus === ApplicationStatus.JOINED
            ? { joinedAt: now }
            : {}),
          ...(targetStatus === ApplicationStatus.REJECTED
            ? {
                rejectedAt: now,
                rejectionReason: validatedReason,
              }
            : {}),
          ...(targetStatus === ApplicationStatus.CLIENT_REJECTED
            ? {
                clientDecisionAt: now,
                clientDecisionById: user.id,
                clientRejectionReason: validatedReason,
              }
            : {}),
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false as const,
          error: "Failed to transition application state due to terminal or concurrent status change.",
          code: "INVALID_STATE_TRANSITION",
          statusCode: 422,
        };
      }

      // Step F: Retrieve updated record
      const updatedApp = await tx.application.findUniqueOrThrow({
        where: { id: application.id },
        include: {
          candidate: true,
          requisition: true,
          clientOrganization: true,
        },
      });

      // Step G: Immutable Audit Logging (Created strictly on success)
      let auditAction = `APPLICATION_${targetStatus}`;
      if (targetStatus === ApplicationStatus.SUBMITTED_TO_CLIENT) auditAction = "CANDIDATE_SUBMITTED_TO_CLIENT";
      if (targetStatus === ApplicationStatus.CLIENT_SHORTLISTED) auditAction = "CLIENT_CANDIDATE_SHORTLISTED";
      if (targetStatus === ApplicationStatus.CLIENT_REJECTED) auditAction = "CLIENT_CANDIDATE_REJECTED";
      if (targetStatus === ApplicationStatus.INTERVIEW_PROPOSED) auditAction = "CLIENT_INTERVIEW_PROPOSED";

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
            reason: validatedReason || null,
            scheduledSlot: validatedSlotDate?.toISOString() || null,
            scheduledNote: scheduledNote?.trim() || null,
            note: note?.trim() || null,
            transitionedAt: now.toISOString(),
            isAiAutoDecision: false, // Invariant: AI never auto-transitions
          },
        },
      });

      return {
        success: true as const,
        app: updatedApp,
        previousStatus: latest.status,
      };
    },
    { maxWait: 15000, timeout: 30000 }
  );

  if (!txResult.success || !("app" in txResult)) {
    return {
      success: false,
      error: txResult.error,
      code: txResult.code,
      statusCode: txResult.statusCode || 400,
    };
  }

  return {
    success: true,
    application: txResult.app,
    previousStatus: txResult.previousStatus,
    newStatus: targetStatus,
    statusCode: 200,
  };
}

/**
 * Retrieves the full chronological transition and audit history of an application.
 */
export async function getApplicationTimelineHistory(
  user: AuthenticatedUser,
  applicationId: string,
  expectedRequisitionId?: string
) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      requisition: true,
      candidate: true,
      clientOrganization: true,
      evaluations: {
        include: {
          reviewedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!application) {
    return { success: false, error: "Application not found.", statusCode: 404 };
  }

  // Nested Route Requisition Boundary Check
  if (expectedRequisitionId && application.requisitionId !== expectedRequisitionId) {
    return { success: false, error: "Application not found.", statusCode: 404 };
  }

  const isClientUser = user.organizationType === OrganizationType.CLIENT;

  // Tenant Boundary Check
  if (user.organizationType === OrganizationType.AGENCY) {
    if (application.requisition.organizationId !== user.organizationId) {
      return { success: false, error: "Forbidden.", statusCode: 403 };
    }
  } else if (isClientUser) {
    const isTargetClient = application.clientOrganizationId === user.organizationId;

    if (!isTargetClient || !CLIENT_VISIBLE_APPLICATION_STATUSES.includes(application.status)) {
      return { success: false, error: "Application not found.", statusCode: 404 };
    }
  }

  // Retrieve audit logs related to this application
  // Strict tenant shielding: clients ONLY query Application-level logs to prevent leaking candidate-level cross-requisition logs!
  const auditLogs = await prisma.auditLog.findMany({
    where: isClientUser
      ? {
          entityType: "Application",
          entityId: application.id,
        }
      : {
          OR: [
            { entityType: "Application", entityId: application.id },
            { entityType: "Candidate", entityId: application.candidateId },
          ],
        },
    include: {
      actor: { select: { id: true, name: true, role: true } },
      organization: { select: { id: true, name: true, type: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Construct structured chronological timeline
  const timeline: Array<{
    id: string;
    timestamp: string;
    event: string;
    stage?: ApplicationStatus | string;
    actorName: string;
    actorRole: string;
    organizationName: string;
    details?: Record<string, any>;
  }> = [];

  // Sourcing & internal AI evaluation events are strictly agency-only (client lifecycle begins at submission)
  if (!isClientUser) {
    // 1. Initial Application Creation
    timeline.push({
      id: `creation-${application.id}`,
      timestamp: application.createdAt.toISOString(),
      event: "APPLICATION_CREATED",
      stage: ApplicationStatus.SOURCED,
      actorName: "System / Recruiter",
      actorRole: "RECRUITER",
      organizationName: application.requisition.title,
      details: {
        candidateReference: application.candidate.candidateReference,
        initialStatus: ApplicationStatus.SOURCED,
      },
    });

    // 2. Screening & Reviews
    for (const evaluation of application.evaluations) {
      timeline.push({
        id: `eval-${evaluation.id}`,
        timestamp: evaluation.createdAt.toISOString(),
        event: "SCREENING_COMPLETED",
        stage: ApplicationStatus.SCREENED,
        actorName: "AI Screening Engine",
        actorRole: "SYSTEM",
        organizationName: "TalentLens AI",
        details: {
          overallScore: evaluation.overallScore,
          evidenceCoverage: evaluation.evidenceCoverage,
          status: evaluation.status,
        },
      });

      if (evaluation.isReviewedByRecruiter && evaluation.reviewedAt) {
        timeline.push({
          id: `review-${evaluation.id}`,
          timestamp: evaluation.reviewedAt.toISOString(),
          event: "RECRUITER_REVIEW_COMPLETED",
          stage: ApplicationStatus.SCREENED,
          actorName: evaluation.reviewedBy?.name || "Agency Recruiter",
          actorRole: evaluation.reviewedBy?.role || "RECRUITER",
          organizationName: "Managing Agency",
          details: {
            evaluationId: evaluation.id,
            isReviewedByRecruiter: true,
          },
        });
      }
    }
  }

  // 3. Audit Log events (transitions, submissions, client decisions)
  // For clients: strictly filter out agency-internal actions (CV views, recruiter review notes, ingestion)
  const clientExcludedActions = [
    "APPLICATION_CREATED",
    "ORIGINAL_CV_VIEWED",
    "RECRUITER_EVALUATION_REVIEWED",
    "DOCUMENT_INGESTED",
    "SCORECARD_UPDATED",
    "AI_SCREENING_COMPLETED",
  ];

  for (const log of auditLogs) {
    const meta = (log.metadata as Record<string, any>) || {};

    // Avoid duplicating creation event
    if (log.action === "APPLICATION_CREATED") continue;

    if (isClientUser && clientExcludedActions.includes(log.action)) {
      continue;
    }

    let sanitizedDetails = meta;
    if (isClientUser) {
      sanitizedDetails = {
        previousStatus: meta.previousStatus || undefined,
        newStatus: meta.newStatus || undefined,
        transitionedAt: meta.transitionedAt || log.createdAt.toISOString(),
        scheduledSlot: meta.scheduledSlot || undefined,
        // Only include rejection reason if this was client's own decision
        ...(log.action === "CLIENT_CANDIDATE_REJECTED" ? { reason: meta.reason } : {}),
      };
    }

    timeline.push({
      id: log.id,
      timestamp: log.createdAt.toISOString(),
      event: log.action,
      stage: meta.newStatus || meta.previousStatus || undefined,
      actorName: isClientUser && log.actor?.role !== UserRole.CLIENT_HIRING_MGR
        ? "Recruitment Agency"
        : log.actor?.name || "System Actor",
      actorRole: isClientUser && log.actor?.role !== UserRole.CLIENT_HIRING_MGR
        ? "AGENCY"
        : log.actor?.role || "SYSTEM",
      organizationName: log.organization?.name || "Organization",
      details: sanitizedDetails,
    });
  }

  // Sort chronologically
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    success: true,
    application: {
      id: application.id,
      candidateId: application.candidateId,
      candidateReference: application.candidate.candidateReference,
      requisitionId: application.requisitionId,
      requisitionTitle: application.requisition.title,
      status: application.status,
      clientOrganization: application.clientOrganization?.name || null,
      interviewScheduledSlot: application.interviewScheduledSlot?.toISOString() || null,
      interviewScheduledNote: isClientUser ? null : (application.interviewScheduledNote || null),
      proposedInterviewSlot: application.proposedInterviewSlot?.toISOString() || null,
      proposedInterviewNote: application.proposedInterviewNote || null,
      offeredAt: application.offeredAt?.toISOString() || null,
      joinedAt: application.joinedAt?.toISOString() || null,
      rejectedAt: application.rejectedAt?.toISOString() || null,
      rejectionReason: isClientUser ? null : (application.rejectionReason || null),
      clientRejectionReason: application.clientRejectionReason || null,
    },
    timeline,
    statusCode: 200,
  };
}

/**
 * Retrieves the pipeline state and summary metrics for a given requisition.
 */
export async function getRequisitionPipelineData(
  user: AuthenticatedUser,
  requisitionId: string,
  search?: string,
  stageFilter?: ApplicationStatus
) {
  // 1. Verify Requisition Existence & Tenant Scope
  const requisition = await prisma.requisition.findUnique({
    where: { id: requisitionId },
    include: {
      organization: { select: { id: true, name: true } },
      clientOrganization: { select: { id: true, name: true } },
    },
  });

  if (!requisition) {
    return { success: false, error: "Requisition not found.", statusCode: 404 };
  }

  const isAgencyUser = user.organizationType === OrganizationType.AGENCY;
  const isClientUser = user.organizationType === OrganizationType.CLIENT;

  if (isAgencyUser) {
    if (requisition.organizationId !== user.organizationId) {
      return { success: false, error: "Forbidden: Requisition belongs to another agency.", statusCode: 403 };
    }
  } else if (isClientUser) {
    if (requisition.clientOrganizationId !== user.organizationId) {
      return { success: false, error: "Requisition not found.", statusCode: 404 };
    }
  } else {
    return { success: false, error: "Forbidden.", statusCode: 403 };
  }

  // 2. Query Applications
  const whereClause: any = {
    requisitionId,
  };

  // Client Hiring Managers ONLY see submitted/post-submission applications strictly for their client org
  if (isClientUser) {
    whereClause.status = {
      in: CLIENT_VISIBLE_APPLICATION_STATUSES,
    };
    whereClause.clientOrganizationId = user.organizationId;
  }

  if (stageFilter) {
    whereClause.status = stageFilter;
  }

  if (search && search.trim()) {
    whereClause.candidate = {
      OR: [
        { candidateReference: { contains: search.trim(), mode: "insensitive" } },
        ...(isAgencyUser ? [{ fullName: { contains: search.trim(), mode: "insensitive" } }] : []),
      ],
    };
  }

  const applications = await prisma.application.findMany({
    where: whereClause,
    include: {
      candidate: true,
      clientOrganization: { select: { id: true, name: true } },
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          overallScore: true,
          evidenceCoverage: true,
          hasMustHaveWarnings: true,
          mustHaveWarnings: true,
          isReviewedByRecruiter: true,
          reviewedAt: true,
          documentId: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // 3. Compute Stage Counts across ALL applications for this requisition (unfiltered by search/stage)
  const countWhere: any = { requisitionId };
  if (isClientUser) {
    countWhere.status = { in: CLIENT_VISIBLE_APPLICATION_STATUSES };
    countWhere.clientOrganizationId = user.organizationId;
  }

  const statusCountsRaw = await prisma.application.groupBy({
    by: ["status"],
    where: countWhere,
    _count: { status: true },
  });

  const stageCounts: Record<string, number> = {
    SOURCED: 0,
    SCREENED: 0,
    SUBMITTED_TO_CLIENT: 0,
    CLIENT_SHORTLISTED: 0,
    INTERVIEW_PROPOSED: 0,
    INTERVIEW_SCHEDULED: 0,
    INTERVIEW_COMPLETED: 0,
    OFFERED: 0,
    JOINED: 0,
    CLIENT_REJECTED: 0,
    REJECTED: 0,
    TOTAL: 0,
  };

  for (const item of statusCountsRaw) {
    stageCounts[item.status] = item._count.status;
    stageCounts.TOTAL += item._count.status;
  }

  // 4. Map Applications (Mask PII for clients)
  const mappedApplications = applications.map((app) => {
    const latestEval = app.evaluations[0] || null;
    const isMasked = isClientUser;

    return {
      id: app.id,
      candidateId: app.candidateId,
      candidateReference: app.candidate.candidateReference,
      fullName: isMasked ? undefined : app.candidate.fullName,
      currentRole: app.candidate.currentRole,
      experienceYears: app.candidate.experienceYears,
      keySkills: app.candidate.keySkills,
      noticeDays: app.candidate.noticeDays,
      status: app.status,
      submittedAt: app.submittedAt?.toISOString() || null,
      clientOrganization: app.clientOrganization?.name || null,
      clientRejectionReason: app.clientRejectionReason || null,
      rejectionReason: isClientUser ? null : (app.rejectionReason || null),
      proposedInterviewSlot: app.proposedInterviewSlot?.toISOString() || null,
      proposedInterviewNote: app.proposedInterviewNote || null,
      interviewScheduledSlot: app.interviewScheduledSlot?.toISOString() || null,
      interviewScheduledNote: isClientUser ? null : (app.interviewScheduledNote || null),
      offeredAt: app.offeredAt?.toISOString() || null,
      joinedAt: app.joinedAt?.toISOString() || null,
      rejectedAt: app.rejectedAt?.toISOString() || null,
      evaluation: latestEval
        ? {
            id: latestEval.id,
            status: latestEval.status,
            overallScore: latestEval.overallScore,
            evidenceCoverage: latestEval.evidenceCoverage,
            hasMustHaveWarnings: latestEval.hasMustHaveWarnings,
            mustHaveFailuresCount: latestEval.mustHaveWarnings.length,
            isReviewedByRecruiter: latestEval.isReviewedByRecruiter,
            documentId: isClientUser ? undefined : latestEval.documentId,
          }
        : null,
      updatedAt: app.updatedAt.toISOString(),
      createdAt: app.createdAt.toISOString(),
    };
  });

  return {
    success: true,
    requisition: {
      id: requisition.id,
      title: requisition.title,
      clientOrganization: requisition.clientOrganization?.name || null,
    },
    stageCounts,
    applications: mappedApplications,
    statusCode: 200,
  };
}

/**
 * Retrieves aggregate pipeline summary counts for an agency across all its requisitions.
 */
export async function getAgencyPipelineSummary(user: AuthenticatedUser) {
  if (user.organizationType !== OrganizationType.AGENCY) {
    return { success: false, error: "Agency scope required.", statusCode: 403 };
  }

  const countsRaw = await prisma.application.groupBy({
    by: ["status"],
    where: {
      requisition: {
        organizationId: user.organizationId,
      },
    },
    _count: { status: true },
  });

  const summaryCounts: Record<string, number> = {
    SOURCED: 0,
    SCREENED: 0,
    SUBMITTED_TO_CLIENT: 0,
    CLIENT_SHORTLISTED: 0,
    INTERVIEW_PROPOSED: 0,
    INTERVIEW_SCHEDULED: 0,
    INTERVIEW_COMPLETED: 0,
    OFFERED: 0,
    JOINED: 0,
    CLIENT_REJECTED: 0,
    REJECTED: 0,
    TOTAL: 0,
  };

  for (const item of countsRaw) {
    summaryCounts[item.status] = item._count.status;
    summaryCounts.TOTAL += item._count.status;
  }

  return {
    success: true,
    summaryCounts,
    statusCode: 200,
  };
}
