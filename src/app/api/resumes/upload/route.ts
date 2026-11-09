import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { executeBatchJob, IngestItemInput, MAX_BATCH_FILES } from "@/lib/ingest/processor";
import { UserRole } from "@prisma/client";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req, [UserRole.RECRUITER]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const contentType = req.headers.get("content-type") || "";
    const isJson = contentType.toLowerCase().includes("application/json");
    const isMultipart = contentType.toLowerCase().includes("multipart/form-data");

    if (!isJson && !isMultipart) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported Media Type: application/json or multipart/form-data required.",
        },
        { status: 415 }
      );
    }

    let requisitionId = "";
    const ingestItems: IngestItemInput[] = [];

    if (isJson) {
      // 1. Direct-to-storage presigned upload confirmation (R2 / S3 bypasses Vercel 4.5 MB limit)
      let body: any;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON payload." },
          { status: 400 }
        );
      }

      requisitionId = body.requisitionId;
      const items = body.items;

      if (!requisitionId || typeof requisitionId !== "string") {
        return NextResponse.json(
          { success: false, error: "requisitionId is required." },
          { status: 400 }
        );
      }

      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json(
          { success: false, error: "items array must contain at least one stored file reference." },
          { status: 400 }
        );
      }

      if (items.length > MAX_BATCH_FILES) {
        return NextResponse.json(
          {
            success: false,
            error: `Batch file count (${items.length}) exceeds maximum limit of ${MAX_BATCH_FILES} files.`,
          },
          { status: 400 }
        );
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || !item.storageKey || !item.fileName) {
          return NextResponse.json(
            { success: false, error: `Item at index ${i} is missing required 'storageKey' or 'fileName'.` },
            { status: 400 }
          );
        }

        // Multi-tenant path traversal and cross-tenant storage isolation defense
        const normalizedKey = item.storageKey.replace(/\\/g, "/");
        if (
          normalizedKey.includes("..") ||
          normalizedKey.startsWith("/") ||
          path.isAbsolute(item.storageKey)
        ) {
          return NextResponse.json(
            { success: false, error: `Invalid storage key at index ${i}: path traversal detected.` },
            { status: 400 }
          );
        }

        const segments = normalizedKey.split("/");
        if (segments.length > 2) {
          return NextResponse.json(
            { success: false, error: `Invalid storage key format at index ${i}.` },
            { status: 400 }
          );
        }

        // If storage key has a tenant prefix, verify it strictly matches the authenticated user's organization
        if (segments.length === 2 && segments[0] !== user.organizationId) {
          return NextResponse.json(
            { success: false, error: `Forbidden: Storage key at index ${i} belongs to a different agency tenant.` },
            { status: 403 }
          );
        }

        // Storage Key Reuse Defense: Ensure the storage key has not already been ingested
        const keyAlreadyClaimed = await prisma.uploadedDocument.findFirst({
          where: { storageKey: item.storageKey },
          select: { id: true, agencyId: true },
        });
        if (keyAlreadyClaimed) {
          return NextResponse.json(
            { success: false, error: `Invalid storage key at index ${i}: storage key has already been ingested.` },
            { status: 409 }
          );
        }

        ingestItems.push({
          fileName: item.fileName,
          existingStorageKey: item.storageKey,
          fileSizeBytes: item.fileSizeBytes,
          idempotencyKey: item.idempotencyKey || `direct-${i}-${item.storageKey}`,
        });
      }
    } else {
      // 2. Legacy multipart/form-data fallback
      const formData = await req.formData();
      requisitionId = formData.get("requisitionId") as string;

      if (!requisitionId) {
        return NextResponse.json(
          { success: false, error: "requisitionId is required for batch resume ingestion." },
          { status: 400 }
        );
      }

      const fileEntries = formData.getAll("files");
      if (!fileEntries || fileEntries.length === 0) {
        return NextResponse.json(
          { success: false, error: "No files provided in upload payload." },
          { status: 400 }
        );
      }

      if (fileEntries.length > MAX_BATCH_FILES) {
        return NextResponse.json(
          {
            success: false,
            error: `Batch file count (${fileEntries.length}) exceeds maximum limit of ${MAX_BATCH_FILES} files.`,
          },
          { status: 400 }
        );
      }

      for (let i = 0; i < fileEntries.length; i++) {
        const entry = fileEntries[i];
        if (typeof entry === "object" && "arrayBuffer" in entry) {
          const file = entry as File;
          const arrayBuffer = await file.arrayBuffer();
          ingestItems.push({
            fileName: file.name || `resume-${i + 1}.pdf`,
            buffer: Buffer.from(arrayBuffer),
            idempotencyKey: `client-${i}-${file.size}-${file.name}`,
          });
        }
      }
    }

    // Verify requisition exists and belongs to the authenticated recruiter's agency
    const requisition = await prisma.requisition.findFirst({
      where: {
        id: requisitionId,
        organizationId: user.organizationId,
      },
    });

    if (!requisition) {
      return NextResponse.json(
        { success: false, error: "Requisition not found or access denied." },
        { status: 404 }
      );
    }

    if (ingestItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid files found for ingestion." },
        { status: 400 }
      );
    }

    // 1. Create BatchUploadJob in database scoped to user's agency
    const batchJob = await prisma.batchUploadJob.create({
      data: {
        agencyId: user.organizationId,
        requisitionId,
        totalFiles: ingestItems.length,
      },
    });

    // 2. Execute batch processing with verified actor identity
    const summary = await executeBatchJob({
      batchJobId: batchJob.id,
      files: ingestItems,
      agencyId: user.organizationId,
      actorId: user.id,
      requisitionId,
    });

    return NextResponse.json({
      success: true,
      batchJobId: batchJob.id,
      summary: {
        total: summary.total,
        successful: summary.successful,
        duplicates: summary.duplicates,
        failed: summary.failed,
        results: summary.results,
      },
    });
  } catch (err: any) {
    console.error("Resume ingestion error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to process batch resume upload." },
      { status: 500 }
    );
  }
}
