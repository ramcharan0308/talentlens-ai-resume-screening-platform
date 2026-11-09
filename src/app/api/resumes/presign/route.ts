import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import {
  getStorageProvider,
  generateStorageKey,
  MAX_FILE_SIZE_BYTES,
  SupportedMimeType,
} from "@/lib/storage";
import { MAX_BATCH_FILES } from "@/lib/ingest/processor";
import { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

interface PresignFileInput {
  fileName: string;
  fileSizeBytes: number;
  mimeType?: string;
}

/**
 * Generates direct-to-storage presigned upload URLs (Supabase Storage)
 * or local direct-upload URLs. Allows resumes up to 10 MB to be uploaded
 * directly by the browser without passing through Vercel's 4.5 MB function limit.
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req, [UserRole.RECRUITER]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const { requisitionId, files } = body;

    if (!requisitionId || typeof requisitionId !== "string") {
      return NextResponse.json(
        { success: false, error: "requisitionId is required." },
        { status: 400 }
      );
    }

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "files array must contain at least one file specification." },
        { status: 400 }
      );
    }

    if (files.length > MAX_BATCH_FILES) {
      return NextResponse.json(
        {
          success: false,
          error: `Batch file count (${files.length}) exceeds maximum allowed limit of ${MAX_BATCH_FILES} files.`,
        },
        { status: 400 }
      );
    }

    // Tenant Isolation Invariant: Requisition must belong to the authenticated recruiter's agency
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

    const storage = getStorageProvider();
    const uploads = [];

    for (let i = 0; i < files.length; i++) {
      const file: PresignFileInput = files[i];
      const rawName = file.fileName || `resume-${i + 1}.pdf`;
      const sizeBytes = Number(file.fileSizeBytes) || 0;

      if (sizeBytes <= 0) {
        return NextResponse.json(
          { success: false, error: `File '${rawName}' has invalid size (0 bytes).` },
          { status: 400 }
        );
      }

      if (sizeBytes > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `File '${rawName}' exceeds the maximum allowed size of 10 MB (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB).`,
          },
          { status: 400 }
        );
      }

      const ext = rawName.split(".").pop()?.toLowerCase();
      if (ext !== "pdf" && ext !== "docx") {
        return NextResponse.json(
          {
            success: false,
            error: `File '${rawName}' has unsupported format. Only PDF and DOCX files are permitted.`,
          },
          { status: 400 }
        );
      }

      const mimeType: SupportedMimeType =
        ext === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      const storageKey = generateStorageKey(ext as "pdf" | "docx", user.organizationId);

      // Generate presigned upload URL (valid for 15 minutes)
      let presignedInfo;
      if (typeof storage.getPresignedUploadUrl === "function") {
        presignedInfo = await storage.getPresignedUploadUrl(storageKey, mimeType, 900);
      } else {
        // Fallback for custom or legacy storage providers
        presignedInfo = {
          uploadUrl: `/api/storage/local-upload?key=${encodeURIComponent(storageKey)}`,
          storageKey,
          headers: { "Content-Type": mimeType },
        };
      }

      uploads.push({
        fileName: rawName,
        storageKey: presignedInfo.storageKey,
        uploadUrl: presignedInfo.uploadUrl,
        headers: presignedInfo.headers,
        fileSizeBytes: sizeBytes,
      });
    }

    return NextResponse.json({
      success: true,
      requisitionId,
      totalFiles: uploads.length,
      uploads,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error generating presigned URLs." },
      { status: 500 }
    );
  }
}

