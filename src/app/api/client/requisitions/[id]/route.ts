import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { OrganizationType, UserRole } from "@prisma/client";
import { CLIENT_VISIBLE_APPLICATION_STATUSES } from "@/lib/permissions";

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
    const { id: requisitionId } = await params;

    if (user.role !== UserRole.CLIENT_HIRING_MGR || user.organizationType !== OrganizationType.CLIENT) {
      return NextResponse.json(
        { success: false, error: "Access restricted to client hiring managers.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const clientOrgId = user.organizationId;

    // Fetch requisition with client scoping
    const requisition = await prisma.requisition.findUnique({
      where: { id: requisitionId },
      include: {
        scorecardCriteria: {
          select: {
            id: true,
            name: true,
            description: true,
            weight: true,
            isMustHave: true,
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!requisition) {
      return NextResponse.json(
        { success: false, error: "Requisition not found.", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Verify requisition is legitimately assigned to caller's client organization
    const hasAssignedOrg = requisition.clientOrganizationId === clientOrgId;

    // Fetch submitted applications for this client
    const applications = await prisma.application.findMany({
      where: {
        requisitionId,
        clientOrganizationId: clientOrgId,
        status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
      },
      orderBy: { submittedAt: "desc" },
      include: {
        candidate: {
          select: {
            id: true,
            candidateReference: true,
            currentRole: true,
            experienceYears: true,
            keySkills: true,
            noticeDays: true,
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
            },
          },
        },
      },
    });

    // If neither directly assigned nor having applications submitted to this client, return 404
    if (!hasAssignedOrg && applications.length === 0) {
      return NextResponse.json(
        { success: false, error: "Requisition not found.", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const formattedApplications = applications.map((app) => {
      const evaluation = app.evaluations[0] || null;
      return {
        id: app.id,
        status: app.status,
        submittedAt: app.submittedAt?.toISOString() || app.createdAt.toISOString(),
        clientDecisionAt: app.clientDecisionAt?.toISOString() || null,
        clientRejectionReason: app.clientRejectionReason,
        proposedInterviewSlot: app.proposedInterviewSlot?.toISOString() || null,
        proposedInterviewNote: app.proposedInterviewNote,
        candidate: {
          id: app.candidate.id,
          candidateReference: app.candidate.candidateReference,
          currentRole: app.candidate.currentRole,
          experienceYears: app.candidate.experienceYears,
          keySkills: app.candidate.keySkills,
          noticeDays: app.candidate.noticeDays,
        },
        evaluation: evaluation
          ? {
              id: evaluation.id,
              overallScore: evaluation.overallScore,
              evidenceCoverage: evaluation.evidenceCoverage,
              hasMustHaveWarnings: evaluation.hasMustHaveWarnings,
              mustHaveWarnings: evaluation.mustHaveWarnings,
              criterionScores: evaluation.criterionScores,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        requisition: {
          id: requisition.id,
          title: requisition.title,
          department: requisition.department,
          location: requisition.location,
          status: requisition.status,
          jobDescription: requisition.jobDescription,
          minExperienceYears: requisition.minExperienceYears,
          maxExperienceYears: requisition.maxExperienceYears,
          maxNoticeDays: requisition.maxNoticeDays,
          targetSalaryRange: requisition.targetSalaryRange,
          coreSkills: requisition.coreSkills,
          scorecardCriteria: requisition.scorecardCriteria,
          createdAt: requisition.createdAt.toISOString(),
        },
        applications: formattedApplications,
      },
    });
  } catch (error) {
    console.error("Error fetching client requisition detail:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching requisition.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

