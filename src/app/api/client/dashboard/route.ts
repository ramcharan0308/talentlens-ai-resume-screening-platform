import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { ApplicationStatus, OrganizationType, UserRole } from "@prisma/client";
import { CLIENT_VISIBLE_APPLICATION_STATUSES } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    // Strict Role & Org Enforcement
    if (user.role !== UserRole.CLIENT_HIRING_MGR || user.organizationType !== OrganizationType.CLIENT) {
      return NextResponse.json(
        {
          success: false,
          error: "Client dashboard is restricted to client hiring managers.",
          code: "FORBIDDEN",
        },
        { status: 403 }
      );
    }

    const clientOrgId = user.organizationId;

    // 1. Client Organization Info
    const clientOrg = await prisma.organization.findUnique({
      where: { id: clientOrgId },
      select: { id: true, name: true, type: true },
    });

    if (!clientOrg) {
      return NextResponse.json(
        { success: false, error: "Client organization not found.", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // 2. Compute Requisition Counts
    const activeRequisitionsCount = await prisma.requisition.count({
      where: {
        clientOrganizationId: clientOrgId,
        status: "ACTIVE",
      },
    });

    // 3. Compute Application Metrics
    const baseAppWhere = {
      clientOrganizationId: clientOrgId,
      status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
    };

    const [
      totalSubmitted,
      pendingReviewCount,
      shortlistedCount,
      interviewProposedCount,
      rejectedCount,
    ] = await Promise.all([
      prisma.application.count({ where: baseAppWhere }),
      prisma.application.count({
        where: {
          clientOrganizationId: clientOrgId,
          status: ApplicationStatus.SUBMITTED_TO_CLIENT,
        },
      }),
      prisma.application.count({
        where: {
          clientOrganizationId: clientOrgId,
          status: ApplicationStatus.CLIENT_SHORTLISTED,
        },
      }),
      prisma.application.count({
        where: {
          clientOrganizationId: clientOrgId,
          status: ApplicationStatus.INTERVIEW_PROPOSED,
        },
      }),
      prisma.application.count({
        where: {
          clientOrganizationId: clientOrgId,
          status: ApplicationStatus.CLIENT_REJECTED,
        },
      }),
    ]);

    // 4. Fetch Recent Candidate Submissions (Masked PII)
    const recentApplications = await prisma.application.findMany({
      where: baseAppWhere,
      take: 10,
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
        requisition: {
          select: {
            id: true,
            title: true,
            department: true,
            location: true,
          },
        },
        evaluations: {
          where: { isReviewedByRecruiter: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            overallScore: true,
            evidenceCoverage: true,
            hasMustHaveWarnings: true,
            mustHaveWarnings: true,
          },
        },
      },
    });

    const recentSubmissions = recentApplications.map((app) => {
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
        requisition: app.requisition,
        screeningSummary: evaluation
          ? {
              evaluationId: evaluation.id,
              overallScore: evaluation.overallScore,
              evidenceCoverage: evaluation.evidenceCoverage,
              hasMustHaveWarnings: evaluation.hasMustHaveWarnings,
              mustHaveWarnings: evaluation.mustHaveWarnings,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        organization: clientOrg,
        metrics: {
          activeRequisitionsCount,
          totalSubmittedCandidates: totalSubmitted,
          pendingReviewCount,
          shortlistedCount,
          interviewProposedCount,
          rejectedCount,
        },
        recentSubmissions,
      },
    });
  } catch (error) {
    console.error("Error fetching client dashboard:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching client dashboard.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

