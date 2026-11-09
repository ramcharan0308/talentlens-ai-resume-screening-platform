import { prisma } from "@/lib/prisma";
import { AuthenticatedUser } from "@/lib/auth";
import {
  ConsentStatus,
  ConsentEvidenceType,
  OrganizationType,
  UserRole,
  CandidatePurgeStatus,
} from "@prisma/client";

export const CONSENT_PURPOSES = {
  RECRUITMENT_PROCESSING: "RECRUITMENT_PROCESSING",
  TALENT_POOL_FUTURE_ROLES: "TALENT_POOL_FUTURE_ROLES",
  THIRD_PARTY_SHARING: "THIRD_PARTY_SHARING",
} as const;

export type ConsentPurpose = keyof typeof CONSENT_PURPOSES | string;

export const CONSENT_SOURCES = {
  DIRECT_APPLICATION: "DIRECT_APPLICATION",
  AGENCY_PORTAL: "AGENCY_PORTAL",
  EMAIL_COMMUNICATION: "EMAIL_COMMUNICATION",
  WRITTEN_CONSENT: "WRITTEN_CONSENT",
  MANUAL_RECRUITER_RECORD: "MANUAL_RECRUITER_RECORD",
} as const;

export type ConsentSource = keyof typeof CONSENT_SOURCES | string;

export interface RecordConsentInput {
  candidateId: string;
  purpose: string;
  noticeVersion?: string;
  source?: string;
  legalBasis?: string;
  evidenceType?: ConsentEvidenceType;
  evidenceReference?: string;
  notes?: string;
}

export interface WithdrawConsentInput {
  candidateId: string;
  purpose?: string; // If omitted, withdraws all active recruitment consent records
  reason: string;
  notes?: string;
}

export interface ConsentOperationResult {
  success: boolean;
  consentRecord?: any;
  records?: any[];
  history?: any[];
  error?: string;
  code?: string;
  statusCode: number;
}

/**
 * Validates that the actor is an agency recruiter or delivery head belonging to the candidate's agency.
 * Client hiring managers are strictly forbidden.
 */
function validateAgencyAccess(actor: AuthenticatedUser, targetAgencyId: string): {
  allowed: boolean;
  error?: string;
  code?: string;
  statusCode: number;
} {
  if (actor.role === UserRole.CLIENT_HIRING_MGR) {
    return {
      allowed: false,
      error: "Client hiring managers are forbidden from accessing candidate consent controls.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  if (actor.organizationType !== OrganizationType.AGENCY) {
    return {
      allowed: false,
      error: "Only agency staff can manage candidate consent records.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  if (actor.organizationId !== targetAgencyId) {
    return {
      allowed: false,
      error: "Cross-agency access violation: Candidate belongs to a different agency tenant.",
      code: "CROSS_AGENCY_FORBIDDEN",
      statusCode: 403,
    };
  }

  return { allowed: true, statusCode: 200 };
}

/**
 * 1. Record persistent candidate consent with versioning, purpose, source, and history.
 * CV ingestion does NOT automatically establish valid consent; consent must be explicitly recorded.
 */
export async function recordConsent(
  actor: AuthenticatedUser,
  input: RecordConsentInput
): Promise<ConsentOperationResult> {
  const {
    candidateId,
    purpose = CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
    noticeVersion = "v1.0",
    source = CONSENT_SOURCES.DIRECT_APPLICATION,
    legalBasis = "CONSENT",
    evidenceType = ConsentEvidenceType.PORTAL_AUTH_SESSION,
    evidenceReference = `portal-session-${Date.now()}`,
    notes,
  } = input;

  if (!candidateId) {
    return {
      success: false,
      error: "Candidate ID is required.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  // 1. Fetch Candidate & Verify Agency Tenancy
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      candidateReference: true,
      agencyId: true,
      purgeStatus: true,
    },
  });

  if (!candidate) {
    return {
      success: false,
      error: "Candidate not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  const access = validateAgencyAccess(actor, candidate.agencyId);
  if (!access.allowed) {
    return {
      success: false,
      error: access.error,
      code: access.code,
      statusCode: access.statusCode,
    };
  }

  if (
    candidate.purgeStatus === CandidatePurgeStatus.PURGE_REQUESTED ||
    candidate.purgeStatus === CandidatePurgeStatus.PURGED
  ) {
    return {
      success: false,
      error: "Cannot record consent for a candidate with pending or completed deletion.",
      code: "DELETION_IN_PROGRESS",
      statusCode: 409,
    };
  }

  // 2. Transactionally upsert consent record and append to immutable ConsentHistory
  const result = await prisma.$transaction(async (tx) => {
    // Check if an existing consent record exists for this purpose
    const existing = await tx.consentRecord.findFirst({
      where: {
        candidateId,
        agencyId: candidate.agencyId,
        purpose,
      },
      orderBy: { createdAt: "desc" },
    });

    let consentRecord;
    let action = "GRANTED";

    if (existing) {
      action = existing.status === ConsentStatus.WITHDRAWN ? "RE_GRANTED" : "UPDATED";
      consentRecord = await tx.consentRecord.update({
        where: { id: existing.id },
        data: {
          status: ConsentStatus.ACTIVE,
          candidateReference: candidate.candidateReference,
          noticeVersion,
          source,
          legalBasis,
          evidenceType,
          evidenceReference,
          notes,
          recordedById: actor.id,
          verifiedById: actor.id,
          verifiedAt: new Date(),
          withdrawnAt: null,
          withdrawalReason: null,
          withdrawnById: null,
        },
      });
    } else {
      consentRecord = await tx.consentRecord.create({
        data: {
          candidateId,
          candidateReference: candidate.candidateReference,
          agencyId: candidate.agencyId,
          purpose,
          status: ConsentStatus.ACTIVE,
          noticeVersion,
          source,
          legalBasis,
          evidenceType,
          evidenceReference,
          notes,
          recordedById: actor.id,
          verifiedById: actor.id,
          verifiedAt: new Date(),
        },
      });
    }

    // Append to immutable ConsentHistory
    await tx.consentHistory.create({
      data: {
        consentRecordId: consentRecord.id,
        candidateId: candidate.id,
        candidateReference: candidate.candidateReference,
        agencyId: candidate.agencyId,
        action,
        status: ConsentStatus.ACTIVE,
        purpose,
        noticeVersion,
        source,
        legalBasis,
        actorId: actor.id,
        notes,
      },
    });

    // Write minimal append-only AuditLog tombstone (strictly no PII)
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        organizationId: candidate.agencyId,
        action: "CONSENT_RECORDED",
        entityType: "Candidate",
        entityId: candidate.candidateReference,
        metadata: {
          purpose,
          noticeVersion,
          source,
          legalBasis,
          action,
        },
      },
    });

    return consentRecord;
  }, { maxWait: 15000, timeout: 30000 });

  return {
    success: true,
    consentRecord: result,
    statusCode: 200,
  };
}

/**
 * 2. Get consent records and complete audit history for a candidate.
 */
export async function getConsentHistory(
  actor: AuthenticatedUser,
  candidateId: string
): Promise<ConsentOperationResult> {
  if (!candidateId) {
    return {
      success: false,
      error: "Candidate ID is required.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      candidateReference: true,
      agencyId: true,
    },
  });

  if (!candidate) {
    return {
      success: false,
      error: "Candidate not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  const access = validateAgencyAccess(actor, candidate.agencyId);
  if (!access.allowed) {
    return {
      success: false,
      error: access.error,
      code: access.code,
      statusCode: access.statusCode,
    };
  }

  const records = await prisma.consentRecord.findMany({
    where: { candidateId },
    include: {
      recordedBy: { select: { id: true, name: true, email: true, role: true } },
      verifiedBy: { select: { id: true, name: true, email: true, role: true } },
      withdrawnBy: { select: { id: true, name: true, email: true, role: true } },
      history: {
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    records,
    statusCode: 200,
  };
}

/**
 * 3. Authorized Consent Withdrawal.
 * Records request and timestamp; updates status to WITHDRAWN;
 * prevents further screening and new client submissions.
 * Preserves minimal traceable history.
 */
export async function withdrawConsent(
  actor: AuthenticatedUser,
  input: WithdrawConsentInput
): Promise<ConsentOperationResult> {
  const { candidateId, purpose, reason, notes } = input;

  if (!candidateId) {
    return {
      success: false,
      error: "Candidate ID is required.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return {
      success: false,
      error: "Withdrawal reason is mandatory.",
      code: "REASON_REQUIRED",
      statusCode: 400,
    };
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      candidateReference: true,
      agencyId: true,
      purgeStatus: true,
    },
  });

  if (!candidate) {
    return {
      success: false,
      error: "Candidate not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  const access = validateAgencyAccess(actor, candidate.agencyId);
  if (!access.allowed) {
    return {
      success: false,
      error: access.error,
      code: access.code,
      statusCode: access.statusCode,
    };
  }

  const whereClause: any = {
    candidateId,
    agencyId: candidate.agencyId,
    status: ConsentStatus.ACTIVE,
  };
  if (purpose) {
    whereClause.purpose = purpose;
  }

  const activeRecords = await prisma.consentRecord.findMany({
    where: whereClause,
  });

  if (activeRecords.length === 0) {
    // If no ACTIVE record, check if any record exists at all
    const anyRecord = await prisma.consentRecord.findFirst({
      where: { candidateId, agencyId: candidate.agencyId },
    });

    if (anyRecord && anyRecord.status === ConsentStatus.WITHDRAWN) {
      return {
        success: true,
        consentRecord: anyRecord,
        error: "Consent has already been withdrawn for this candidate.",
        code: "ALREADY_WITHDRAWN",
        statusCode: 200,
      };
    }

    // If no consent record exists, create an explicit WITHDRAWN record to record the withdrawal event
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.consentRecord.create({
        data: {
          candidateId,
          candidateReference: candidate.candidateReference,
          agencyId: candidate.agencyId,
          purpose: purpose || CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
          status: ConsentStatus.WITHDRAWN,
          evidenceType: ConsentEvidenceType.EMAIL_CONFIRMATION,
          evidenceReference: `withdrawal-req-${Date.now()}`,
          withdrawalReason: reason.trim(),
          withdrawnAt: now,
          withdrawnById: actor.id,
          recordedById: actor.id,
          notes,
        },
      });

      await tx.consentHistory.create({
        data: {
          consentRecordId: record.id,
          candidateId: candidate.id,
          candidateReference: candidate.candidateReference,
          agencyId: candidate.agencyId,
          action: "WITHDRAWN",
          status: ConsentStatus.WITHDRAWN,
          purpose: purpose || CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
          noticeVersion: "v1.0",
          source: CONSENT_SOURCES.MANUAL_RECRUITER_RECORD,
          actorId: actor.id,
          notes: `Withdrawal Reason: ${reason.trim()}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          organizationId: candidate.agencyId,
          action: "CONSENT_WITHDRAWN",
          entityType: "Candidate",
          entityId: candidate.candidateReference,
          metadata: {
            purpose: purpose || CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
            reason: reason.trim(),
          },
        },
      });

      return record;
    }, { maxWait: 15000, timeout: 30000 });

    return {
      success: true,
      consentRecord: result,
      statusCode: 200,
    };
  }

  // Withdraw all matching active records
  const now = new Date();
  const updatedRecords = await prisma.$transaction(async (tx) => {
    const updated = [];
    for (const rec of activeRecords) {
      const u = await tx.consentRecord.update({
        where: { id: rec.id },
        data: {
          status: ConsentStatus.WITHDRAWN,
          withdrawnAt: now,
          withdrawalReason: reason.trim(),
          withdrawnById: actor.id,
          notes: notes || rec.notes,
        },
      });
      updated.push(u);

      await tx.consentHistory.create({
        data: {
          consentRecordId: rec.id,
          candidateId: candidate.id,
          candidateReference: candidate.candidateReference,
          agencyId: candidate.agencyId,
          action: "WITHDRAWN",
          status: ConsentStatus.WITHDRAWN,
          purpose: rec.purpose,
          noticeVersion: rec.noticeVersion,
          source: rec.source,
          actorId: actor.id,
          notes: `Withdrawal Reason: ${reason.trim()}`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        organizationId: candidate.agencyId,
        action: "CONSENT_WITHDRAWN",
        entityType: "Candidate",
        entityId: candidate.candidateReference,
        metadata: {
          purposes: activeRecords.map((r) => r.purpose),
          reason: reason.trim(),
        },
      },
    });

    return updated;
  }, { maxWait: 15000, timeout: 30000 });

  return {
    success: true,
    consentRecord: updatedRecords[0],
    records: updatedRecords,
    statusCode: 200,
  };
}

/**
 * 4. Helper to verify if candidate has active, non-withdrawn consent for processing.
 */
export async function checkCandidateConsent(
  candidateId: string,
  agencyId: string,
  purpose: string = CONSENT_PURPOSES.RECRUITMENT_PROCESSING
): Promise<{
  hasConsent: boolean;
  status?: ConsentStatus;
  isWithdrawn: boolean;
  record?: any;
  reason?: string;
}> {
  const consent = await prisma.consentRecord.findFirst({
    where: {
      candidateId,
      agencyId,
      purpose,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!consent) {
    return {
      hasConsent: false,
      isWithdrawn: false,
      reason: "No consent record found for candidate.",
    };
  }

  if (consent.status === ConsentStatus.WITHDRAWN) {
    return {
      hasConsent: false,
      status: ConsentStatus.WITHDRAWN,
      isWithdrawn: true,
      record: consent,
      reason: `Consent for ${purpose} was withdrawn on ${consent.withdrawnAt?.toISOString()}. Reason: ${consent.withdrawalReason || "Not specified"}.`,
    };
  }

  if (consent.status === ConsentStatus.PENDING_VERIFICATION) {
    return {
      hasConsent: false,
      status: ConsentStatus.PENDING_VERIFICATION,
      isWithdrawn: false,
      record: consent,
      reason: "Consent is pending verification.",
    };
  }

  return {
    hasConsent: true,
    status: ConsentStatus.ACTIVE,
    isWithdrawn: false,
    record: consent,
  };
}

