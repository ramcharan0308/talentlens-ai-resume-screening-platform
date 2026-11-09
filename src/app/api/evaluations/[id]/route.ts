import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { UserRole } from "@prisma/client";

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

    const { id } = await context.params;

    const evaluation = await prisma.evaluation.findFirst({
      where: {
        id,
        agencyId: user.organizationId,
      },
      include: {
        candidate: {
          select: {
            id: true,
            candidateReference: true,
            fullName: true,
            currentRole: true,
            experienceYears: true,
            keySkills: true,
            noticeDays: true,
            purgeStatus: true,
          },
        },
        requisition: {
          select: {
            id: true,
            title: true,
            department: true,
            status: true,
          },
        },
        document: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            fileSizeBytes: true,
          },
        },
        scorecardSnapshot: true,
        criterionScores: {
          orderBy: { createdAt: "asc" },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!evaluation) {
      return NextResponse.json(
        { success: false, error: "Evaluation not found or access denied." },
        { status: 404 }
      );
    }

    // Check whether the original CV has been viewed by the current authenticated recruiter
    let hasCVBeenViewed = false;
    if (evaluation.documentId) {
      const viewedLog = await prisma.auditLog.findFirst({
        where: {
          entityType: "UploadedDocument",
          entityId: evaluation.documentId,
          action: "ORIGINAL_CV_VIEWED",
          organizationId: user.organizationId,
          actorId: user.id,
        },
      });
      hasCVBeenViewed = !!viewedLog;
    }

    return NextResponse.json({
      success: true,
      evaluation: {
        ...evaluation,
        hasCVBeenViewed,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error fetching evaluation." },
      { status: 500 }
    );
  }
}

