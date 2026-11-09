import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { UserRole, OrganizationType, DocumentProcessingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request, [
      UserRole.RECRUITER,
      UserRole.DELIVERY_HEAD,
    ]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    if (user.organizationType !== OrganizationType.AGENCY) {
      return NextResponse.json(
        { success: false, error: "Only agency personnel can access candidate screening lists." },
        { status: 403 }
      );
    }

    const { id: requisitionId } = await context.params;

    // Verify Requisition belongs to the recruiter's agency
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

    // Fetch active candidates in this agency
    const candidates = await prisma.candidate.findMany({
      where: {
        agencyId: user.organizationId,
        purgeStatus: "ACTIVE",
      },
      orderBy: [{ isFixture: "asc" }, { createdAt: "desc" }],
      include: {
        uploadedDocuments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            fileName: true,
            fileType: true,
            fileSizeBytes: true,
            processingStatus: true,
            extractedText: true,
            createdAt: true,
          },
        },
        applications: {
          where: { requisitionId },
          select: { id: true, status: true },
        },
        evaluations: {
          where: { requisitionId },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            overallScore: true,
            hasMustHaveWarnings: true,
            isReviewedByRecruiter: true,
            createdAt: true,
          },
        },
      },
    });

    const enrichedCandidates = candidates.map((c) => {
      const latestDoc = c.uploadedDocuments[0];
      let readiness:
        | "READY"
        | "OCR_REQUIRED"
        | "EXTRACTION_FAILED"
        | "PARSING_IN_PROGRESS"
        | "INSUFFICIENT_TEXT"
        | "NO_DOCUMENT" = "NO_DOCUMENT";
      let readinessMessage = "No resume document uploaded";

      if (latestDoc) {
        if (latestDoc.processingStatus === DocumentProcessingStatus.SCANNED_UNREADABLE) {
          readiness = "OCR_REQUIRED";
          readinessMessage = "Scanned document: OCR required before screening";
        } else if (latestDoc.processingStatus === DocumentProcessingStatus.FAILED) {
          readiness = "EXTRACTION_FAILED";
          readinessMessage = "Document text extraction failed";
        } else if (
          latestDoc.processingStatus === DocumentProcessingStatus.PENDING ||
          latestDoc.processingStatus === DocumentProcessingStatus.PARSING
        ) {
          if (!latestDoc.extractedText || latestDoc.extractedText.trim().length === 0) {
            readiness = "PARSING_IN_PROGRESS";
            readinessMessage = "Text extraction in progress";
          } else {
            readiness = "READY";
            readinessMessage = "Resume text ready for AI screening";
          }
        } else if (!latestDoc.extractedText || latestDoc.extractedText.trim().length < 50) {
          readiness = "INSUFFICIENT_TEXT";
          readinessMessage = "Extracted text is too short or empty (<50 chars)";
        } else {
          readiness = "READY";
          readinessMessage = "Resume text ready for AI screening";
        }
      }

      return {
        id: c.id,
        candidateReference: c.candidateReference,
        fullName: c.fullName,
        currentRole: c.currentRole,
        experienceYears: c.experienceYears,
        keySkills: c.keySkills,
        noticeDays: c.noticeDays,
        isFixture: c.isFixture,
        hasApplication: c.applications.length > 0,
        applicationStatus: c.applications[0]?.status || null,
        readiness,
        readinessMessage,
        document: latestDoc
          ? {
              id: latestDoc.id,
              fileName: latestDoc.fileName,
              fileType: latestDoc.fileType,
              fileSizeBytes: latestDoc.fileSizeBytes,
              processingStatus: latestDoc.processingStatus,
              createdAt: latestDoc.createdAt,
            }
          : null,
        latestEvaluation: c.evaluations[0] || null,
      };
    });

    return NextResponse.json({
      success: true,
      count: enrichedCandidates.length,
      candidates: enrichedCandidates,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error fetching candidates." },
      { status: 500 }
    );
  }
}

