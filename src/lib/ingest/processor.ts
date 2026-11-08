import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  getStorageProvider,
  validateFileSignature,
  generateStorageKey,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/storage";
import { extractResumeText } from "@/lib/extractor";
import { parseCandidateFromText } from "@/lib/extractor/candidate-parser";
import { generateUniqueCandidateReference } from "@/lib/candidate-reference";
import {
  BatchItemStatus,
  BatchJobStatus,
  ApplicationStatus,
} from "@prisma/client";

export const MAX_BATCH_FILES = 500;
const CONCURRENCY_LIMIT = 5;

export interface IngestItemInput {
  fileName: string;
  buffer: Buffer;
  idempotencyKey?: string;
}

export interface IngestItemResult {
  fileName: string;
  idempotencyKey: string;
  status: BatchItemStatus;
  documentId?: string;
  candidateId?: string;
  candidateReference?: string;
  errorMessage?: string;
}

export async function processSingleFile(params: {
  buffer: Buffer;
  originalFileName: string;
  agencyId: string;
  actorId?: string;
  requisitionId: string;
  batchJobId: string;
  idempotencyKey: string;
}): Promise<IngestItemResult> {
  const {
    buffer,
    originalFileName,
    agencyId,
    actorId,
    requisitionId,
    batchJobId,
    idempotencyKey,
  } = params;

  // 1. Calculate SHA-256 fingerprint from raw file bytes
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const payloadHash = crypto
    .createHash("sha256")
    .update(`${idempotencyKey}:${buffer.length}:${fileHash}`)
    .digest("hex");

  // 2. Register or fetch existing batch file item (Network retry idempotency)
  let batchItem = await prisma.batchFileItem.findUnique({
    where: {
      batchJobId_idempotencyKey: {
        batchJobId,
        idempotencyKey,
      },
    },
  });

  if (batchItem) {
    // If completed or duplicate previously, return idempotent response
    if (
      batchItem.status === BatchItemStatus.COMPLETED ||
      batchItem.status === BatchItemStatus.DUPLICATE_SKIPPED
    ) {
      return {
        fileName: originalFileName,
        idempotencyKey,
        status: batchItem.status,
        documentId: batchItem.documentId || undefined,
      };
    }
  } else {
    batchItem = await prisma.batchFileItem.create({
      data: {
        batchJobId,
        idempotencyKey,
        originalFileName,
        fileSizeBytes: buffer.length,
        payloadHash,
        fileHash,
        status: BatchItemStatus.PROCESSING,
      },
    });
  }

  // 3. Magic Bytes & File Signature Validation
  const validation = validateFileSignature(buffer, MAX_FILE_SIZE_BYTES);
  if (!validation.isValid || !validation.detectedType || !validation.extension) {
    const errorMsg = validation.error || "File signature validation failed.";
    await prisma.batchFileItem.update({
      where: { id: batchItem.id },
      data: {
        status: BatchItemStatus.FAILED,
        errorMessage: errorMsg,
      },
    });

    return {
      fileName: originalFileName,
      idempotencyKey,
      status: BatchItemStatus.FAILED,
      errorMessage: errorMsg,
    };
  }

  // 4. Duplicate Detection (Tenant-scoped deduplication invariant)
  const existingDoc = await prisma.uploadedDocument.findUnique({
    where: {
      agencyId_fileHash: {
        agencyId,
        fileHash,
      },
    },
    include: {
      candidate: true,
    },
  });

  if (existingDoc) {
    // Document already exists in agency pool.
    // If linking to a requisition and candidate exists, ensure Application record exists
    if (existingDoc.candidateId && requisitionId) {
      await prisma.application.upsert({
        where: {
          candidateId_requisitionId: {
            candidateId: existingDoc.candidateId,
            requisitionId,
          },
        },
        update: {},
        create: {
          candidateId: existingDoc.candidateId,
          requisitionId,
          status: ApplicationStatus.SOURCED,
        },
      });
    }

    await prisma.batchFileItem.update({
      where: { id: batchItem.id },
      data: {
        status: BatchItemStatus.DUPLICATE_SKIPPED,
        documentId: existingDoc.id,
        fileHash,
      },
    });

    return {
      fileName: originalFileName,
      idempotencyKey,
      status: BatchItemStatus.DUPLICATE_SKIPPED,
      documentId: existingDoc.id,
      candidateId: existingDoc.candidateId || undefined,
      candidateReference: existingDoc.candidate?.candidateReference,
    };
  }

  // 5. Secure File Storage: Write to isolated storage outside public web root
  const storageKey = generateStorageKey(validation.extension);
  const storage = getStorageProvider();

  try {
    await storage.put(storageKey, buffer);
  } catch (storageErr) {
    const errorMsg =
      storageErr instanceof Error ? storageErr.message : "Failed to persist file to storage.";
    await prisma.batchFileItem.update({
      where: { id: batchItem.id },
      data: {
        status: BatchItemStatus.FAILED,
        errorMessage: errorMsg,
      },
    });

    return {
      fileName: originalFileName,
      idempotencyKey,
      status: BatchItemStatus.FAILED,
      errorMessage: errorMsg,
    };
  }

  // 6. Text Extraction (PDF / DOCX)
  const extraction = await extractResumeText(buffer, validation.detectedType);

  // 7. Conservative Candidate Profile Parsing
  const parsedProfile = parseCandidateFromText(extraction.text);
  const candidateReference = await generateUniqueCandidateReference();

  // 8. Transactionally create Document, Candidate and Application
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Create Candidate profile
      const candidate = await tx.candidate.create({
        data: {
          candidateReference,
          agencyId,
          fullName: parsedProfile.fullName,
          currentRole: parsedProfile.currentRole,
          experienceYears: parsedProfile.experienceYears,
          keySkills: parsedProfile.keySkills,
          noticeDays: parsedProfile.noticeDays,
          isFixture: false,
        },
      });

      // Create UploadedDocument
      const doc = await tx.uploadedDocument.create({
        data: {
          agencyId,
          candidateId: candidate.id,
          fileName: originalFileName,
          fileType: validation.detectedType!,
          fileSizeBytes: buffer.length,
          storageKey,
          fileHash,
          processingStatus: extraction.processingStatus,
          extractedText: extraction.text || null,
        },
      });

      // Link Application to requisition
      if (requisitionId) {
        await tx.application.create({
          data: {
            candidateId: candidate.id,
            requisitionId,
            status: ApplicationStatus.SOURCED,
          },
        });
      }

      // Update BatchFileItem
      await tx.batchFileItem.update({
        where: { id: batchItem.id },
        data: {
          status: BatchItemStatus.COMPLETED,
          documentId: doc.id,
          fileHash,
          errorMessage: extraction.errorMessage || null,
        },
      });

      // Audit Log entry
      await tx.auditLog.create({
        data: {
          actorId: actorId || null,
          organizationId: agencyId,
          action: "DOCUMENT_INGESTED",
          entityType: "UploadedDocument",
          entityId: doc.id,
          metadata: {
            fileName: originalFileName,
            fileSize: buffer.length,
            processingStatus: extraction.processingStatus,
            candidateReference: candidate.candidateReference,
          },
        },
      });

      return { doc, candidate };
    });

    return {
      fileName: originalFileName,
      idempotencyKey,
      status: BatchItemStatus.COMPLETED,
      documentId: result.doc.id,
      candidateId: result.candidate.id,
      candidateReference: result.candidate.candidateReference,
      errorMessage: extraction.errorMessage,
    };
  } catch (txErr) {
    // If database transaction failed, clean up stored file
    await storage.delete(storageKey).catch(() => {});

    const errorMsg = txErr instanceof Error ? txErr.message : "Database transaction failed.";
    await prisma.batchFileItem.update({
      where: { id: batchItem.id },
      data: {
        status: BatchItemStatus.FAILED,
        errorMessage: errorMsg,
      },
    });

    return {
      fileName: originalFileName,
      idempotencyKey,
      status: BatchItemStatus.FAILED,
      errorMessage: errorMsg,
    };
  }
}

/**
 * Processes a batch of files with bounded concurrency (chunking) to prevent memory exhaustion.
 */
export async function executeBatchJob(params: {
  batchJobId: string;
  files: IngestItemInput[];
  agencyId: string;
  actorId?: string;
  requisitionId: string;
}): Promise<{
  jobId: string;
  total: number;
  successful: number;
  failed: number;
  duplicates: number;
  results: IngestItemResult[];
}> {
  const { batchJobId, files, agencyId, actorId, requisitionId } = params;

  if (files.length > MAX_BATCH_FILES) {
    throw new Error(`Batch upload exceeds maximum permitted limit of ${MAX_BATCH_FILES} files.`);
  }

  // Set job status to PROCESSING
  await prisma.batchUploadJob.update({
    where: { id: batchJobId },
    data: {
      status: BatchJobStatus.PROCESSING,
      totalFiles: files.length,
    },
  });

  const results: IngestItemResult[] = [];
  let successful = 0;
  let failed = 0;
  let duplicates = 0;

  // Process files in bounded concurrent chunks
  for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
    const chunk = files.slice(i, i + CONCURRENCY_LIMIT);

    const chunkResults = await Promise.all(
      chunk.map((item, idx) => {
        const itemKey =
          item.idempotencyKey ||
          `item-${i + idx}-${crypto.createHash("md5").update(item.fileName).digest("hex")}`;

        return processSingleFile({
          buffer: item.buffer,
          originalFileName: item.fileName,
          agencyId,
          actorId,
          requisitionId,
          batchJobId,
          idempotencyKey: itemKey,
        });
      })
    );

    for (const res of chunkResults) {
      results.push(res);
      if (res.status === BatchItemStatus.COMPLETED) successful++;
      else if (res.status === BatchItemStatus.DUPLICATE_SKIPPED) duplicates++;
      else if (res.status === BatchItemStatus.FAILED) failed++;
    }

    // Update ongoing progress counter on job record
    await prisma.batchUploadJob.update({
      where: { id: batchJobId },
      data: {
        processedFiles: results.length,
        successfulFiles: successful,
        duplicateFiles: duplicates,
        failedFiles: failed,
      },
    });
  }

  // Finalize batch job status
  const finalStatus =
    failed === files.length && files.length > 0
      ? BatchJobStatus.FAILED
      : BatchJobStatus.COMPLETED;

  await prisma.batchUploadJob.update({
    where: { id: batchJobId },
    data: {
      status: finalStatus,
      processedFiles: results.length,
      successfulFiles: successful,
      duplicateFiles: duplicates,
      failedFiles: failed,
    },
  });

  return {
    jobId: batchJobId,
    total: files.length,
    successful,
    failed,
    duplicates,
    results,
  };
}

