import { prisma } from "@/lib/prisma";
import { AuthenticatedUser } from "@/lib/auth";
import { ApplicationStatus, ConsentStatus, OrganizationType, UserRole } from "@prisma/client";
import { checkCandidateConsent, CONSENT_PURPOSES } from "@/lib/consent/consent-service";

export interface SubmitCandidateInput {
  evaluationId: string;
  clientOrganizationId?: string;
  expectedRequisitionId?: string;
  expectedCandidateId?: string;
  requireThirdPartyConsent?: boolean;
}

export interface SubmitCandidateResult {
  success: boolean;
  applicationId?: string;
  candidateReference?: string;
  requisitionTitle?: string;
  clientOrganizationName?: string;
  status?: ApplicationStatus;
  isAlreadySubmitted?: boolean;
  error?: string;
  code?: string;
  statusCode: number;
}

/**
 * Recruiter-controlled workflow to submit an AI-screened & reviewed candidate
 * to a client organization for a specific requisition.
 *
 * Invariants Enforced:
 * 1. Actor must be an agency RECRUITER or DELIVERY_HEAD in the owning agency.
 * 2. Client hiring managers are strictly forbidden from calling this workflow.
 * 3. The evaluation must belong to the caller's agency.
 * 4. The evaluation must have completed recruiter review (isReviewedByRecruiter === true).
 * 5. Proof that the SAME recruiter inspected the original CV before submission (audit event exists).
 * 6. The candidate, evaluation, and requisition relationships must match.
 * 7. The requisition must be legitimately associated with the target client organization.
 * 8. Safe & idempotent: repeated submissions return the existing application without duplicating records.
 * 9. Creates an append-only AuditLog record for the submission event.
 */
export async function submitCandidateToClient(
  user: AuthenticatedUser,
  input: SubmitCandidateInput
): Promise<SubmitCandidateResult> {
  // 1. Role & Org Guard
  if (user.role === UserRole.CLIENT_HIRING_MGR) {
    return {
      success: false,
      error: "Client hiring managers cannot submit candidates to clients.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  if (user.organizationType !== OrganizationType.AGENCY) {
    return {
      success: false,
      error: "Only staffing agency recruiters can submit candidates to clients.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  const { evaluationId } = input;
  if (!evaluationId || typeof evaluationId !== "string") {
    return {
      success: false,
      error: "Evaluation ID is required for candidate submission.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  // 2. Fetch Evaluation & Verify Agency Ownership
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      candidate: true,
      requisition: {
        include: {
          clientOrganization: true,
        },
      },
      document: true,
    },
  });

  if (!evaluation) {
    return {
      success: false,
      error: "Evaluation not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  if (evaluation.agencyId !== user.organizationId) {
    return {
      success: false,
      error: "Evaluation belongs to a different agency organization.",
      code: "CROSS_AGENCY_FORBIDDEN",
      statusCode: 403,
    };
  }

  // Candidate must belong to user's agency
  if (evaluation.candidate.agencyId !== user.organizationId) {
    return {
      success: false,
      error: "Candidate belongs to a different agency organization.",
      code: "CROSS_AGENCY_FORBIDDEN",
      statusCode: 403,
    };
  }

  // Requisition must belong to user's agency
  if (evaluation.requisition.organizationId !== user.organizationId) {
    return {
      success: false,
      error: "Requisition belongs to a different agency organization.",
      code: "CROSS_AGENCY_FORBIDDEN",
      statusCode: 403,
    };
  }

  // Exact Requisition and Candidate matching invariants
  if (input.expectedRequisitionId && evaluation.requisitionId !== input.expectedRequisitionId) {
    return {
      success: false,
      error: "Evaluation does not belong to the requested requisition.",
      code: "EVALUATION_REQUISITION_MISMATCH",
      statusCode: 400,
    };
  }

  if (input.expectedCandidateId && evaluation.candidateId !== input.expectedCandidateId) {
    return {
      success: false,
      error: "Evaluation does not belong to the requested candidate.",
      code: "EVALUATION_CANDIDATE_MISMATCH",
      statusCode: 400,
    };
  }

  // 2.1 Pending Deletion Guard
  if (
    evaluation.candidate.purgeStatus === "PURGE_REQUESTED" ||
    evaluation.candidate.purgeStatus === "PURGED"
  ) {
    return {
      success: false,
      error: "Candidate has a pending or completed deletion request. Submission to clients is prohibited.",
      code: "CANDIDATE_DELETION_PENDING",
      statusCode: 403,
    };
  }

  const openDeletionRequest = await prisma.candidateDeletionRequest.findFirst({
    where: {
      candidateId: evaluation.candidateId,
      status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] },
    },
  });
  if (openDeletionRequest) {
    return {
      success: false,
      error: "Candidate has an active deletion request in progress. Submission is blocked.",
      code: "CANDIDATE_DELETION_PENDING",
      statusCode: 403,
    };
  }

  // 2.2 Candidate Consent Guard
  // A. Recruitment Processing Consent
  const recruitmentConsent = await checkCandidateConsent(
    evaluation.candidateId,
    evaluation.agencyId,
    CONSENT_PURPOSES.RECRUITMENT_PROCESSING
  );
  if (recruitmentConsent.isWithdrawn) {
    return {
      success: false,
      error: "Candidate has withdrawn consent for recruitment processing. Submissions to clients are blocked.",
      code: "CONSENT_WITHDRAWN",
      statusCode: 403,
    };
  }
  if (recruitmentConsent.status === ConsentStatus.PENDING_VERIFICATION) {
    return {
      success: false,
      error: "Candidate recruitment processing consent is pending verification.",
      code: "CONSENT_PENDING",
      statusCode: 403,
    };
  }

  // B. Independent Third-Party Sharing Consent
  const sharingConsent = await checkCandidateConsent(
    evaluation.candidateId,
    evaluation.agencyId,
    CONSENT_PURPOSES.THIRD_PARTY_SHARING
  );
  if (sharingConsent.isWithdrawn) {
    return {
      success: false,
      error: "Candidate has explicitly withdrawn consent for third-party client sharing. Submissions to clients are blocked.",
      code: "THIRD_PARTY_CONSENT_WITHDRAWN",
      statusCode: 403,
    };
  }
  if (sharingConsent.status === ConsentStatus.PENDING_VERIFICATION) {
    return {
      success: false,
      error: "Candidate third-party client sharing consent is pending verification.",
      code: "THIRD_PARTY_CONSENT_PENDING",
      statusCode: 403,
    };
  }
  if (input.requireThirdPartyConsent && !sharingConsent.hasConsent) {
    return {
      success: false,
      error: "Candidate does not have explicitly recorded third-party sharing consent.",
      code: "THIRD_PARTY_CONSENT_REQUIRED",
      statusCode: 403,
    };
  }

  // 3. Completed Recruiter Review Invariant
  if (!evaluation.isReviewedByRecruiter) {
    return {
      success: false,
      error: "The evaluation must be reviewed by a recruiter before submitting to a client.",
      code: "EVALUATION_NOT_REVIEWED",
      statusCode: 428, // Precondition Required
    };
  }

  // Submitting recruiter must be the reviewer who conducted review
  if (
    evaluation.reviewedById &&
    evaluation.reviewedById !== user.id &&
    user.role === UserRole.RECRUITER
  ) {
    return {
      success: false,
      error: "The submitting recruiter must be the reviewer who completed the evaluation review.",
      code: "SUBMITTER_NOT_REVIEWER",
      statusCode: 428,
    };
  }

  // 4. Original CV Inspection Prerequisite (Same Authenticated Recruiter)
  if (!evaluation.documentId) {
    return {
      success: false,
      error: "Evaluation does not have an associated CV document.",
      code: "NO_DOCUMENT_LINKED",
      statusCode: 400,
    };
  }

  const cvAudit = await prisma.auditLog.findFirst({
    where: {
      action: "ORIGINAL_CV_VIEWED",
      actorId: user.id, // Strictly SAME authenticated recruiter
      entityId: evaluation.documentId,
      entityType: "UploadedDocument",
      organizationId: user.organizationId,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!cvAudit) {
    return {
      success: false,
      error: "The original CV must be inspected by the submitting recruiter before submission to a client.",
      code: "CV_NOT_VIEWED",
      statusCode: 428, // Precondition Required
    };
  }

  // 5. Resolve & Validate Target Client Organization
  let targetClientId = input.clientOrganizationId || evaluation.requisition.clientOrganizationId;

  if (!targetClientId) {
    return {
      success: false,
      error: "Target client organization must be specified or associated with the requisition.",
      code: "CLIENT_ORG_REQUIRED",
      statusCode: 400,
    };
  }

  // If requisition already specifies a client org, submitted client org must match
  if (
    evaluation.requisition.clientOrganizationId &&
    input.clientOrganizationId &&
    evaluation.requisition.clientOrganizationId !== input.clientOrganizationId
  ) {
    return {
      success: false,
      error: "Requisition is already assigned to a different client organization.",
      code: "CLIENT_ORG_MISMATCH",
      statusCode: 400,
    };
  }

  const clientOrg = await prisma.organization.findUnique({
    where: { id: targetClientId },
  });

  if (!clientOrg || clientOrg.type !== OrganizationType.CLIENT) {
    return {
      success: false,
      error: "Target organization is invalid or not a client organization.",
      code: "INVALID_CLIENT_ORG",
      statusCode: 400,
    };
  }

  // Cross-agency check: client organization must belong to user's agency
  if (clientOrg.agencyId && clientOrg.agencyId !== user.organizationId) {
    return {
      success: false,
      error: "Target client organization belongs to another agency. Cross-agency submission is forbidden.",
      code: "CROSS_AGENCY_FORBIDDEN",
      statusCode: 403,
    };
  }

  // 6. Find or Create Application (Idempotency Check)
  const existingApp = await prisma.application.findUnique({
    where: {
      candidateId_requisitionId: {
        candidateId: evaluation.candidateId,
        requisitionId: evaluation.requisitionId,
      },
    },
  });

  // Check if already submitted to this client
  if (
    existingApp &&
    existingApp.clientOrganizationId === clientOrg.id &&
    ([
      ApplicationStatus.SUBMITTED_TO_CLIENT,
      ApplicationStatus.CLIENT_SHORTLISTED,
      ApplicationStatus.CLIENT_REJECTED,
      ApplicationStatus.INTERVIEW_PROPOSED,
    ] as ApplicationStatus[]).includes(existingApp.status)
  ) {
    // Idempotent safe return
    return {
      success: true,
      applicationId: existingApp.id,
      candidateReference: evaluation.candidate.candidateReference,
      requisitionTitle: evaluation.requisition.title,
      clientOrganizationName: clientOrg.name,
      status: existingApp.status,
      isAlreadySubmitted: true,
      statusCode: 200,
    };
  }

  const now = new Date();

  // Create or update application and audit log within an atomic database transaction
  const application = await prisma.$transaction(async (tx) => {
    // If requisition clientOrganizationId is null, associate it now
    if (!evaluation.requisition.clientOrganizationId) {
      await tx.requisition.update({
        where: { id: evaluation.requisitionId },
        data: { clientOrganizationId: clientOrg.id },
      });
    }

    let app;
    if (existingApp) {
      app = await tx.application.update({
        where: { id: existingApp.id },
        data: {
          status: ApplicationStatus.SUBMITTED_TO_CLIENT,
          submittedAt: now,
          submittedById: user.id,
          clientOrganizationId: clientOrg.id,
        },
      });
    } else {
      app = await tx.application.create({
        data: {
          candidateId: evaluation.candidateId,
          requisitionId: evaluation.requisitionId,
          status: ApplicationStatus.SUBMITTED_TO_CLIENT,
          submittedAt: now,
          submittedById: user.id,
          clientOrganizationId: clientOrg.id,
        },
      });
    }

    // Link evaluation to application if not yet linked
    if (!evaluation.applicationId || evaluation.applicationId !== app.id) {
      await tx.evaluation.update({
        where: { id: evaluation.id },
        data: { applicationId: app.id },
      });
    }

    // 7. Audit Log Submission Event
    await tx.auditLog.create({
      data: {
        action: "CANDIDATE_SUBMITTED_TO_CLIENT",
        actorId: user.id,
        organizationId: user.organizationId,
        entityType: "Application",
        entityId: app.id,
        metadata: {
          candidateId: evaluation.candidateId,
          candidateReference: evaluation.candidate.candidateReference,
          requisitionId: evaluation.requisitionId,
          requisitionTitle: evaluation.requisition.title,
          clientOrganizationId: clientOrg.id,
          clientOrganizationName: clientOrg.name,
          evaluationId: evaluation.id,
          submittedAt: now.toISOString(),
        },
      },
    });

    return app;
  }, { maxWait: 15000, timeout: 30000 });

  return {
    success: true,
    applicationId: application.id,
    candidateReference: evaluation.candidate.candidateReference,
    requisitionTitle: evaluation.requisition.title,
    clientOrganizationName: clientOrg.name,
    status: ApplicationStatus.SUBMITTED_TO_CLIENT,
    isAlreadySubmitted: false,
    statusCode: 200,
  };
}
