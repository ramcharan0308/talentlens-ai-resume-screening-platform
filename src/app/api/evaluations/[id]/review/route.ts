import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { UserRole, OrganizationType } from "@prisma/client";

export async function POST(
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
        { success: false, error: "Only agency personnel can record recruiter reviews." },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    // Multi-tenant isolation check: Evaluation must belong to the user's agency
    const evaluation = await prisma.evaluation.findFirst({
      where: {
        id,
        agencyId: user.organizationId,
      },
    });

    if (!evaluation) {
      return NextResponse.json(
        { success: false, error: "Evaluation not found or access denied." },
        { status: 404 }
      );
    }

    // Strict compliance safeguard: Recruiter must inspect the candidate's original CV before completing review
    // Evaluation must have an associated document
    if (!evaluation.documentId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CV_REVIEW_REQUIRED: No original CV document is linked to this evaluation. Cannot complete review.",
          code: "CV_NOT_VIEWED",
        },
        { status: 428 }
      );
    }

    const reviewRequestTime = new Date();

    // The server must verify that:
    // 1. The original CV was accessed by the SAME authenticated user (actorId: user.id).
    // 2. The audit event refers to the EXACT document associated with this evaluation (entityId: evaluation.documentId).
    // 3. The audit event belongs to the SAME agency (organizationId: user.organizationId).
    // 4. The access event occurred BEFORE the review request (createdAt <= reviewRequestTime).
    // An audit event created by another recruiter must NOT satisfy this prerequisite.
    const viewedLog = await prisma.auditLog.findFirst({
      where: {
        entityType: "UploadedDocument",
        entityId: evaluation.documentId,
        action: "ORIGINAL_CV_VIEWED",
        organizationId: user.organizationId,
        actorId: user.id, // SAME authenticated recruiter required!
        createdAt: {
          lte: reviewRequestTime,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!viewedLog) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CV_REVIEW_REQUIRED: Recruiter must inspect the candidate's original CV before completing human review.",
          code: "CV_NOT_VIEWED",
        },
        { status: 428 }
      );
    }

    let notes: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.notes === "string" && body.notes.trim()) {
        notes = body.notes.trim();
      }
    } catch {
      // Optional body
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.evaluation.update({
        where: { id },
        data: {
          isReviewedByRecruiter: true,
          reviewedAt: new Date(),
          reviewedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: "RECRUITER_EVALUATION_REVIEWED",
          entityType: "Evaluation",
          entityId: id,
          metadata: {
            candidateId: evaluation.candidateId,
            requisitionId: evaluation.requisitionId,
            reviewerId: user.id,
            ...(notes ? { notes } : {}),
          },
        },
      });

      return result;
    });

    return NextResponse.json({
      success: true,
      message: "Evaluation successfully marked as reviewed by recruiter.",
      evaluation: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error marking evaluation as reviewed." },
      { status: 500 }
    );
  }
}

