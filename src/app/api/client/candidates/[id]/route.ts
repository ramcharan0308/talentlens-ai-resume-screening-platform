import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { OrganizationType, UserRole } from "@prisma/client";
import { CLIENT_VISIBLE_APPLICATION_STATUSES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;
    const { id: identifier } = await params;

    if (user.role !== UserRole.CLIENT_HIRING_MGR || user.organizationType !== OrganizationType.CLIENT) {
      return NextResponse.json(
        { success: false, error: "Access restricted to client hiring managers.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const clientOrgId = user.organizationId;

    // Look for matching application by applicationId OR candidateId
    const application = await prisma.application.findFirst({
      where: {
        OR: [{ id: identifier }, { candidateId: identifier }],
        clientOrganizationId: clientOrgId,
        status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
      },
      include: {
        candidate: {
          select: {
            id: true,
            candidateReference: true,
            currentRole: true,
            experienceYears: true,
            keySkills: true,
            noticeDays: true,
            createdAt: true,
          },
        },
        requisition: {
          select: {
            id: true,
            title: true,
            department: true,
            location: true,
            targetSalaryRange: true,
            jobDescription: true,
            coreSkills: true,
          },
        },
        evaluations: {
          where: { isReviewedByRecruiter: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            criterionScores: {
              select: {
                id: true,
                criterionName: true,
                weight: true,
                score: true,
                status: true,
                isMustHave: true,
                explanation: true,
                quotes: true,
                missingGaps: true,
              },
              orderBy: { weight: "desc" },
            },
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        {
          success: false,
          error: "Candidate dossier not found or not submitted to your organization.",
          code: "NOT_FOUND",
        },
        { status: 404 }
      );
    }

    const evaluation = application.evaluations[0] || null;

    return NextResponse.json({
      success: true,
      data: {
        applicationId: application.id,
        status: application.status,
        submittedAt: application.submittedAt?.toISOString() || application.createdAt.toISOString(),
        clientDecisionAt: application.clientDecisionAt?.toISOString() || null,
        clientRejectionReason: application.clientRejectionReason,
        proposedInterviewSlot: application.proposedInterviewSlot?.toISOString() || null,
        proposedInterviewNote: application.proposedInterviewNote,
        candidate: {
          id: application.candidate.id,
          candidateReference: application.candidate.candidateReference,
          currentRole: application.candidate.currentRole,
          experienceYears: application.candidate.experienceYears,
          keySkills: application.candidate.keySkills,
          noticeDays: application.candidate.noticeDays,
          createdAt: application.candidate.createdAt.toISOString(),
          // Personal contact details (name, email, phone) and raw CV access are strictly omitted
        },
        requisition: application.requisition,
        aiScreeningAssessment: evaluation
          ? {
              evaluationId: evaluation.id,
              overallScore: evaluation.overallScore,
              evidenceCoverage: evaluation.evidenceCoverage,
              hasMustHaveWarnings: evaluation.hasMustHaveWarnings,
              mustHaveWarnings: evaluation.mustHaveWarnings,
              criterionScores: evaluation.criterionScores,
              disclaimer:
                "AI screening scores and evidence quotations assist human review. Final hiring and interview decisions rest solely with you.",
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error fetching client candidate detail:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching candidate detail.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

