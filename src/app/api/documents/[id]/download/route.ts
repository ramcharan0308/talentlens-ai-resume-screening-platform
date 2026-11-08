import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { Permissions } from "@/lib/permissions";
import { getStorageProvider } from "@/lib/storage";
import { UserRole, OrganizationType } from "@prisma/client";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const { id } = await context.params;

    // Role-based authorization check: Client hiring managers are forbidden from raw resume downloads
    if (user.role === UserRole.CLIENT_HIRING_MGR || user.organizationType !== OrganizationType.AGENCY) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Client hiring managers are not permitted to download raw candidate resumes.",
        },
        { status: 403 }
      );
    }

    // Tenant and RBAC authorization check
    const doc = await prisma.uploadedDocument.findFirst({
      where: {
        id,
        agencyId: user.organizationId,
      },
      include: {
        candidate: {
          select: {
            candidateReference: true,
          },
        },
      },
    });

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Document not found or access denied." },
        { status: 404 }
      );
    }

    const storage = getStorageProvider();
    const fileBuffer = await storage.get(doc.storageKey);

    if (!fileBuffer) {
      return NextResponse.json(
        { success: false, error: "Document payload not found in secure storage." },
        { status: 404 }
      );
    }

    const mimeType =
      doc.fileType === "application/pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const isInline = req.nextUrl.searchParams.get("view") === "inline";

    // Compliance Audit: Log that original candidate CV was inspected/downloaded by the recruiter
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        organizationId: user.organizationId,
        action: "ORIGINAL_CV_VIEWED",
        entityType: "UploadedDocument",
        entityId: doc.id,
        metadata: {
          documentId: doc.id,
          candidateId: doc.candidateId,
          fileName: doc.fileName,
          candidateReference: doc.candidate?.candidateReference,
          viewMode: isInline ? "inline" : "attachment",
        },
      },
    });

    const candidateRef = doc.candidate?.candidateReference || "unlinked";
    const downloadFileName = `${candidateRef}-${doc.fileName}`;

    return new Response(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename="${downloadFileName}"`,
        "Content-Length": fileBuffer.length.toString(),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Document download failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error downloading document." },
      { status: 500 }
    );
  }
}
