import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { executeBatchJob, IngestItemInput, MAX_BATCH_FILES } from "@/lib/ingest/processor";
import { UserRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req, [UserRole.RECRUITER]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        { success: false, error: "Unsupported Media Type: multipart/form-data required." },
        { status: 415 }
      );
    }

    const formData = await req.formData();
    const requisitionId = formData.get("requisitionId") as string;

    if (!requisitionId) {
      return NextResponse.json(
        { success: false, error: "requisitionId is required for batch resume ingestion." },
        { status: 400 }
      );
    }

    // Verify requisition exists and belongs to agency
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

    const ingestItems: IngestItemInput[] = [];

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
      summary,
    });
  } catch (error) {
    console.error("Resume upload failed:", error);
    const msg = error instanceof Error ? error.message : "Internal server error during resume upload.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
