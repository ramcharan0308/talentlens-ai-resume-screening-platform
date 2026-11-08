import { prisma } from "@/lib/prisma";
import { AuthenticatedUser } from "@/lib/auth";
import {
  DeletionRequestStatus,
  CandidatePurgeStatus,
  OrganizationType,
  UserRole,
} from "@prisma/client";
import { getStorageProvider, StorageProvider } from "@/lib/storage";

export interface CreateDeletionRequestInput {
  candidateId: string;
  reason: string;
}

export interface ReviewDeletionRequestInput {
  requestId: string;
  action: "START_REVIEW" | "REJECT";
  rejectionReason?: string;
}

export interface ApproveDeletionRequestInput {
  requestId: string;
}

export interface ExecuteDeletionRequestInput {
  requestId: string;
  customStorageProvider?: StorageProvider;
}

export interface DeletionOperationResult {
  success: boolean;
  request?: any;
  requests?: any[];
  error?: string;
  code?: string;
  statusCode: number;
  deletedFilesCount?: number;
  totalFilesCount?: number;
}

/**
 * Validates that the actor is an authorized agency user.
 * Client hiring managers are strictly forbidden.
 */
function validateAgencyActor(
  actor: AuthenticatedUser,
  targetAgencyId: string,
  requiredRole?: UserRole
): { allowed: boolean; error?: string; code?: string; statusCode: number } {
  if (actor.role === UserRole.CLIENT_HIRING_MGR) {
    return {
      allowed: false,
      error: "Client hiring managers are forbidden from accessing candidate deletion controls.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  if (actor.organizationType !== OrganizationType.AGENCY) {
    return {
      allowed: false,
      error: "Only agency staff can manage deletion requests.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  if (actor.organizationId !== targetAgencyId) {
    return {
      allowed: false,
      error: "Cross-agency violation: Request belongs to a different agency tenant.",
      code: "CROSS_AGENCY_FORBIDDEN",
      statusCode: 403,
    };
  }

  if (requiredRole && actor.role !== requiredRole) {
    return {
      allowed: false,
      error: `Action requires ${requiredRole} role. Your role is ${actor.role}.`,
      code: "INSUFFICIENT_PERMISSIONS",
      statusCode: 403,
    };
  }

  return { allowed: true, statusCode: 200 };
}

/**
 * 1. Create a Deletion Request (Status: REQUESTED).
 * Can be initiated by agency RECRUITER or DELIVERY_HEAD.
 * Immediately sets candidate purgeStatus to PURGE_REQUESTED, blocking further processing.
 */
export async function createDeletionRequest(
  actor: AuthenticatedUser,
  input: CreateDeletionRequestInput
): Promise<DeletionOperationResult> {
  const { candidateId, reason } = input;

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
      error: "Deletion reason is mandatory.",
      code: "REASON_REQUIRED",
      statusCode: 400,
    };
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      candidateReference: true,
      fullName: true,
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

  const access = validateAgencyActor(actor, candidate.agencyId);
  if (!access.allowed) {
    return {
      success: false,
      error: access.error,
      code: access.code,
      statusCode: access.statusCode,
    };
  }

  // Check if an existing open deletion request exists
  const existingOpenRequest = await prisma.candidateDeletionRequest.findFirst({
    where: {
      candidateId,
      status: {
        in: [
          DeletionRequestStatus.REQUESTED,
          DeletionRequestStatus.UNDER_REVIEW,
          DeletionRequestStatus.APPROVED,
          DeletionRequestStatus.PROCESSING,
        ],
      },
    },
  });

  if (existingOpenRequest) {
    return {
      success: false,
      request: existingOpenRequest,
      error: "An active deletion request already exists for this candidate.",
      code: "DELETION_ALREADY_REQUESTED",
      statusCode: 409,
    };
  }

  const now = new Date();
  const request = await prisma.$transaction(async (tx) => {
    // 1. Create Deletion Request
    const req = await tx.candidateDeletionRequest.create({
      data: {
        agencyId: candidate.agencyId,
        candidateId: candidate.id,
        candidateReference: candidate.candidateReference,
        candidateName: candidate.fullName,
        status: DeletionRequestStatus.REQUESTED,
        reason: reason.trim(),
        requestedById: actor.id,
      },
    });

    // 2. Set Candidate purgeStatus to PURGE_REQUESTED
    await tx.candidate.update({
      where: { id: candidate.id },
      data: {
        purgeStatus: CandidatePurgeStatus.PURGE_REQUESTED,
        purgeRequestedAt: now,
      },
    });

    // 3. Audit tombstone (strictly no PII)
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        organizationId: candidate.agencyId,
        action: "CANDIDATE_DELETION_REQUESTED",
        entityType: "Candidate",
        entityId: candidate.candidateReference,
        metadata: {
          requestId: req.id,
          reason: reason.trim(),
        },
      },
    });

    return req;
  }, { maxWait: 15000, timeout: 30000 });

  return {
    success: true,
    request,
    statusCode: 201,
  };
}

/**
 * 2. Review Deletion Request (UNDER_REVIEW or REJECTED).
 * Strictly requires DELIVERY_HEAD role.
 */
export async function reviewDeletionRequest(
  actor: AuthenticatedUser,
  input: ReviewDeletionRequestInput
): Promise<DeletionOperationResult> {
  const { requestId, action, rejectionReason } = input;

  if (!requestId) {
    return {
      success: false,
      error: "Request ID is required.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  const request = await prisma.candidateDeletionRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    return {
      success: false,
      error: "Deletion request not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  const access = validateAgencyActor(actor, request.agencyId, UserRole.DELIVERY_HEAD);
  if (!access.allowed) {
    return {
      success: false,
      error: access.error,
      code: access.code,
      statusCode: access.statusCode,
    };
  }

  if (request.status !== DeletionRequestStatus.REQUESTED) {
    return {
      success: false,
      error: `Cannot review request currently in ${request.status} status.`,
      code: "INVALID_STATE_TRANSITION",
      statusCode: 422,
    };
  }

  const now = new Date();

  if (action === "REJECT") {
    if (!rejectionReason || rejectionReason.trim().length === 0) {
      return {
        success: false,
        error: "Rejection reason is mandatory when rejecting a deletion request.",
        code: "REJECTION_REASON_REQUIRED",
        statusCode: 400,
      };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.candidateDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: DeletionRequestStatus.REJECTED,
          rejectionReason: rejectionReason.trim(),
          reviewedById: actor.id,
          reviewedAt: now,
        },
      });

      // If candidate is still associated, restore purgeStatus to ACTIVE if no other pending deletion requests
      if (request.candidateId) {
        const otherPending = await tx.candidateDeletionRequest.count({
          where: {
            candidateId: request.candidateId,
            id: { not: requestId },
            status: { in: [DeletionRequestStatus.REQUESTED, DeletionRequestStatus.UNDER_REVIEW, DeletionRequestStatus.APPROVED] },
          },
        });

        if (otherPending === 0) {
          await tx.candidate.update({
            where: { id: request.candidateId },
            data: {
              purgeStatus: CandidatePurgeStatus.ACTIVE,
              purgeRequestedAt: null,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          organizationId: request.agencyId,
          action: "CANDIDATE_DELETION_REJECTED",
          entityType: "Candidate",
          entityId: request.candidateReference,
          metadata: {
            requestId,
            rejectionReason: rejectionReason.trim(),
          },
        },
      });

      return u;
    }, { maxWait: 15000, timeout: 30000 });

    return {
      success: true,
      request: updated,
      statusCode: 200,
    };
  }

  // START_REVIEW
  const updated = await prisma.candidateDeletionRequest.update({
    where: { id: requestId },
    data: {
      status: DeletionRequestStatus.UNDER_REVIEW,
      reviewedById: actor.id,
      reviewedAt: now,
    },
  });

  return {
    success: true,
    request: updated,
    statusCode: 200,
  };
}

/**
 * 3. Approve Deletion Request (Status: APPROVED).
 * Strictly requires DELIVERY_HEAD role.
 */
export async function approveDeletionRequest(
  actor: AuthenticatedUser,
  input: ApproveDeletionRequestInput
): Promise<DeletionOperationResult> {
  const { requestId } = input;

  if (!requestId) {
    return {
      success: false,
      error: "Request ID is required.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  const request = await prisma.candidateDeletionRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    return {
      success: false,
      error: "Deletion request not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  const access = validateAgencyActor(actor, request.agencyId, UserRole.DELIVERY_HEAD);
  if (!access.allowed) {
    return {
      success: false,
      error: access.error,
      code: access.code,
      statusCode: access.statusCode,
    };
  }

  if (
    request.status !== DeletionRequestStatus.REQUESTED &&
    request.status !== DeletionRequestStatus.UNDER_REVIEW
  ) {
    return {
      success: false,
      error: `Cannot approve request currently in ${request.status} status.`,
      code: "INVALID_STATE_TRANSITION",
      statusCode: 422,
    };
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.candidateDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: DeletionRequestStatus.APPROVED,
        approvedById: actor.id,
        approvedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        organizationId: request.agencyId,
        action: "CANDIDATE_DELETION_APPROVED",
        entityType: "Candidate",
        entityId: request.candidateReference,
        metadata: {
          requestId,
        },
      },
    });

    return u;
  }, { maxWait: 15000, timeout: 30000 });

  return {
    success: true,
    request: updated,
    statusCode: 200,
  };
}

/**
 * 4. Execute Deletion (Idempotent, Multi-step, Recoverable).
 * Strictly requires DELIVERY_HEAD role.
 * Removes physical files from storage, then scrubs database personal data.
 * If storage fails, does not report partial deletion as complete; supports safe retries.
 */
export async function executeDeletionRequest(
  actor: AuthenticatedUser,
  input: ExecuteDeletionRequestInput
): Promise<DeletionOperationResult> {
  const { requestId, customStorageProvider } = input;

  if (!requestId) {
    return {
      success: false,
      error: "Request ID is required.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  const request = await prisma.candidateDeletionRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    return {
      success: false,
      error: "Deletion request not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  const access = validateAgencyActor(actor, request.agencyId, UserRole.DELIVERY_HEAD);
  if (!access.allowed) {
    return {
      success: false,
      error: access.error,
      code: access.code,
      statusCode: access.statusCode,
    };
  }

  // Idempotency: If already COMPLETED, return successful tombstone safely
  if (request.status === DeletionRequestStatus.COMPLETED) {
    return {
      success: true,
      request,
      statusCode: 200,
      deletedFilesCount: request.deletedFilesCount,
      totalFilesCount: request.totalFilesCount,
    };
  }

  // Atomic concurrency guard: transition to PROCESSING and IN_PROGRESS lock
  // Only if request is currently APPROVED, or PROCESSING with storageCleanupStatus not IN_PROGRESS
  const lockResult = await prisma.candidateDeletionRequest.updateMany({
    where: {
      id: requestId,
      status: { in: [DeletionRequestStatus.APPROVED, DeletionRequestStatus.PROCESSING] },
      OR: [
        { storageCleanupStatus: null },
        { storageCleanupStatus: "PENDING" },
        { storageCleanupStatus: "FAILED" },
      ],
    },
    data: {
      status: DeletionRequestStatus.PROCESSING,
      executedById: actor.id,
      executedAt: new Date(),
      storageCleanupStatus: "IN_PROGRESS",
      failureReason: null,
    },
  });

  if (lockResult.count === 0) {
    const current = await prisma.candidateDeletionRequest.findUnique({
      where: { id: requestId },
    });
    if (current?.status === DeletionRequestStatus.COMPLETED) {
      return {
        success: true,
        request: current,
        statusCode: 200,
        deletedFilesCount: current.deletedFilesCount,
        totalFilesCount: current.totalFilesCount,
      };
    }
    if (current?.storageCleanupStatus === "IN_PROGRESS") {
      return {
        success: false,
        error: "Deletion execution is already in progress for this request.",
        code: "CONCURRENT_EXECUTION_BLOCKED",
        statusCode: 409,
      };
    }
    return {
      success: false,
      error: `Cannot execute deletion for request in ${current?.status || "UNKNOWN"} status. Request must be APPROVED.`,
      code: "REQUEST_NOT_APPROVED",
      statusCode: 422,
    };
  }

  const storage = customStorageProvider || getStorageProvider();
  const candidateId = request.candidateId;

  // Step A: Find all documents associated with the candidate (or orphaned documents matching reference)
  let documents: Array<{ id: string; storageKey: string; fileName: string }> = [];
  if (candidateId) {
    documents = await prisma.uploadedDocument.findMany({
      where: { candidateId },
      select: { id: true, storageKey: true, fileName: true },
    });
  }

  const totalFilesCount = documents.length;
  const existingMetadata = ((request.metadata as Record<string, any>) || {}) as Record<string, any>;
  const alreadyDeletedKeys: string[] = Array.isArray(existingMetadata.deletedStorageKeys)
    ? [...existingMetadata.deletedStorageKeys]
    : [];
  let deletedFilesCount = 0;

  // Step B: Delete physical files from Storage Provider with individual key tracking
  try {
    for (const doc of documents) {
      if (doc.storageKey) {
        if (alreadyDeletedKeys.includes(doc.storageKey)) {
          // Already confirmed deleted in a previous execution attempt
          deletedFilesCount++;
          continue;
        }
        await storage.delete(doc.storageKey);
        alreadyDeletedKeys.push(doc.storageKey);
        deletedFilesCount++;
      }
    }
  } catch (storageErr: unknown) {
    const errorMsg = storageErr instanceof Error ? storageErr.message : "Physical file storage deletion failed.";
    // DO NOT report partial deletion as complete!
    // Track individual deleted keys in metadata so safe retries skip already-deleted files
    await prisma.candidateDeletionRequest.update({
      where: { id: requestId },
      data: {
        storageCleanupStatus: "FAILED",
        failureReason: `Storage deletion failed: ${errorMsg}`,
        deletedFilesCount,
        totalFilesCount,
        metadata: {
          ...existingMetadata,
          deletedStorageKeys: alreadyDeletedKeys,
        },
      },
    });

    return {
      success: false,
      error: `Deletion aborted due to storage failure: ${errorMsg}. State preserved for safe retry.`,
      code: "STORAGE_DELETION_FAILED",
      statusCode: 500,
      deletedFilesCount,
      totalFilesCount,
    };
  }

  // Step C: Transactional Database Personal Data Scrubbing
  const completedAt = new Date();
  const docIds = documents.map((d) => d.id);
  let evalIds: string[] = [];
  if (candidateId) {
    const evaluations = await prisma.evaluation.findMany({
      where: { candidateId },
      select: { id: true },
    });
    evalIds = evaluations.map((e) => e.id);
  }

  // Step C: Transactional Database Personal Data Scrubbing (with safe retry on transient connection resets)
  let dbSuccess = false;
  let lastDbError: unknown = null;

  for (let attempt = 1; attempt <= 2 && !dbSuccess; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          if (candidateId) {
            // 1. Delete CriterionScores (evidence quotes & rubric scores)
            if (evalIds.length > 0) {
              await tx.evaluationCriterionScore.deleteMany({
                where: { evaluationId: { in: evalIds } },
              });

              // 2. Delete Evaluations
              await tx.evaluation.deleteMany({
                where: { id: { in: evalIds } },
              });
            }

            // 3. Delete Applications
            await tx.application.deleteMany({
              where: { candidateId },
            });

            // 4. Scrub and unlink BatchFileItems referencing candidate's documents
            if (docIds.length > 0) {
              await tx.batchFileItem.updateMany({
                where: { documentId: { in: docIds } },
                data: {
                  documentId: null,
                  originalFileName: "[REDACTED_DELETED_FILE]",
                  errorMessage: null,
                },
              });

              // 5. Delete UploadedDocuments
              await tx.uploadedDocument.deleteMany({
                where: { id: { in: docIds } },
              });
            }

            // 6. Delete ConsentHistory and ConsentRecords for this candidate
            await tx.consentHistory.deleteMany({
              where: { candidateId },
            });
            await tx.consentRecord.deleteMany({
              where: { candidateId },
            });

            // 7. Delete the Candidate record completely
            await tx.candidate.delete({
              where: { id: candidateId },
            });
          }

          // 8. Update CandidateDeletionRequest to COMPLETED tombstone
          await tx.candidateDeletionRequest.update({
            where: { id: requestId },
            data: {
              candidateId: null, // Candidate record is deleted
              candidateName: null, // Scrub PII from request
              status: DeletionRequestStatus.COMPLETED,
              completedAt,
              storageCleanupStatus: "COMPLETED",
              deletedFilesCount,
              totalFilesCount,
              metadata: {
                candidateReference: request.candidateReference,
                deletedDocumentsCount: totalFilesCount,
                deletedStorageKeys: alreadyDeletedKeys,
                completedAt: completedAt.toISOString(),
                outcome: "SUCCESS",
              },
            },
          });

          // 9. Write minimal append-only AuditLog tombstone (Strictly NO PII)
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              organizationId: request.agencyId,
              action: "CANDIDATE_DATA_DELETED",
              entityType: "Candidate",
              entityId: request.candidateReference,
              metadata: {
                requestId,
                candidateReference: request.candidateReference,
                deletedDocumentsCount: totalFilesCount,
                completedAt: completedAt.toISOString(),
                outcome: "SUCCESS",
              },
            },
          });
        },
        { maxWait: 15000, timeout: 30000 }
      );
      dbSuccess = true;
    } catch (dbErr: unknown) {
      lastDbError = dbErr;
      const errorMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      const isConnectionError =
        errorMsg.includes("closed the connection") ||
        errorMsg.includes("ConnectionReset") ||
        errorMsg.includes("forcibly closed") ||
        errorMsg.includes("Connection terminated");

      if (attempt === 1 && isConnectionError) {
        // Wait briefly and retry once on fresh connection
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      break;
    }
  }

  if (!dbSuccess) {
    const errorMsg = lastDbError instanceof Error ? lastDbError.message : "Database deletion transaction failed.";
    await prisma.candidateDeletionRequest.update({
      where: { id: requestId },
      data: {
        failureReason: `Database transaction error: ${errorMsg}`,
      },
    });

    return {
      success: false,
      error: `Database personal data deletion failed: ${errorMsg}`,
      code: "DATABASE_DELETION_FAILED",
      statusCode: 500,
    };
  }

  const finalRequest = await prisma.candidateDeletionRequest.findUnique({
    where: { id: requestId },
  });

  return {
    success: true,
    request: finalRequest,
    statusCode: 200,
    deletedFilesCount,
    totalFilesCount,
  };
}

/**
 * 5. Fetch a single deletion request.
 */
export async function getDeletionRequest(
  actor: AuthenticatedUser,
  requestId: string
): Promise<DeletionOperationResult> {
  if (!requestId) {
    return {
      success: false,
      error: "Request ID is required.",
      code: "INVALID_INPUT",
      statusCode: 400,
    };
  }

  const request = await prisma.candidateDeletionRequest.findUnique({
    where: { id: requestId },
    include: {
      requestedBy: { select: { id: true, name: true, email: true, role: true } },
      reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      approvedBy: { select: { id: true, name: true, email: true, role: true } },
      executedBy: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!request) {
    return {
      success: false,
      error: "Deletion request not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  const access = validateAgencyActor(actor, request.agencyId);
  if (!access.allowed) {
    return {
      success: false,
      error: access.error,
      code: access.code,
      statusCode: access.statusCode,
    };
  }

  return {
    success: true,
    request,
    statusCode: 200,
  };
}

/**
 * 6. List deletion requests for agency.
 */
export async function listDeletionRequests(
  actor: AuthenticatedUser,
  filters?: { status?: DeletionRequestStatus; candidateId?: string }
): Promise<DeletionOperationResult> {
  const access = validateAgencyActor(actor, actor.organizationId);
  if (!access.allowed) {
    return {
      success: false,
      error: access.error,
      code: access.code,
      statusCode: access.statusCode,
    };
  }

  const where: any = {
    agencyId: actor.organizationId,
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.candidateId) {
    where.candidateId = filters.candidateId;
  }

  const requests = await prisma.candidateDeletionRequest.findMany({
    where,
    include: {
      requestedBy: { select: { id: true, name: true, email: true, role: true } },
      reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      approvedBy: { select: { id: true, name: true, email: true, role: true } },
      executedBy: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    requests,
    statusCode: 200,
  };
}
