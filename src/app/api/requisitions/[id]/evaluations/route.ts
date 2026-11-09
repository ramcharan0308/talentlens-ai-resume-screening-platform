import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { UserRole, OrganizationType } from "@prisma/client";

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

    const { id: requisitionId } = await context.params;

    // Verify requisition belongs to user's agency
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

    const { searchParams } = new URL(request.url);
    const hasMustHaveWarningsParam = searchParams.get("hasMustHaveWarnings");
    const isReviewedParam = searchParams.get("isReviewed");
    const statusParam = searchParams.get("status");
    const sortBy = searchParams.get("sortBy") || "overallScore";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    const search = searchParams.get("search")?.trim();

    const whereClause: any = {
      requisitionId,
      agencyId: user.organizationId,
    };

    if (hasMustHaveWarningsParam !== null && hasMustHaveWarningsParam !== "") {
      whereClause.hasMustHaveWarnings = hasMustHaveWarningsParam === "true";
    }

    if (isReviewedParam !== null && isReviewedParam !== "") {
      whereClause.isReviewedByRecruiter = isReviewedParam === "true";
    }

    if (statusParam) {
      whereClause.status = statusParam;
    }

    if (search) {
      whereClause.candidate = {
        OR: [
          { candidateReference: { contains: search, mode: "insensitive" } },
          { fullName: { contains: search, mode: "insensitive" } },
          { currentRole: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    let orderByClause: any = { overallScore: sortOrder };
    if (sortBy === "createdAt") {
      orderByClause = { createdAt: sortOrder };
    } else if (sortBy === "coverage") {
      orderByClause = { evidenceCoverage: sortOrder };
    }

    // Run parallel queries: evaluations for display and total count
    const [evaluations, totalApplications, allRequisitionEvaluations] = await Promise.all([
      prisma.evaluation.findMany({
        where: whereClause,
        orderBy: orderByClause,
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
          reviewedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              criterionScores: true,
            },
          },
        },
      }),
      prisma.application.count({
        where: { requisitionId },
      }),
      // Fetch high-level summary across all evaluations for this requisition (independent of search filters)
      prisma.evaluation.findMany({
        where: {
          requisitionId,
          agencyId: user.organizationId,
        },
        select: {
          id: true,
          status: true,
          overallScore: true,
          hasMustHaveWarnings: true,
          isReviewedByRecruiter: true,
          updatedAt: true,
          reviewedBy: {
            select: { name: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    // Check which candidate CVs have already been inspected
    const docIds = evaluations
      .map((e) => e.documentId)
      .filter(Boolean) as string[];

    const viewedLogs =
      docIds.length > 0
        ? await prisma.auditLog.findMany({
            where: {
              entityType: "UploadedDocument",
              entityId: { in: docIds },
              action: "ORIGINAL_CV_VIEWED",
              organizationId: user.organizationId,
              actorId: user.id,
            },
            select: { entityId: true },
          })
        : [];

    const viewedDocIds = new Set(viewedLogs.map((l) => l.entityId));

    const enrichedEvaluations = evaluations.map((e) => ({
      ...e,
      hasCVBeenViewed: e.documentId ? viewedDocIds.has(e.documentId) : false,
    }));

    // Calculate summary statistics
    const totalEvaluated = allRequisitionEvaluations.length;
    const completedEvaluations = allRequisitionEvaluations.filter(
      (e) => e.status === "COMPLETED"
    );
    const completedCount = completedEvaluations.length;
    const pendingCount = allRequisitionEvaluations.filter(
      (e) => e.status === "PENDING"
    ).length;
    const failedCount = allRequisitionEvaluations.filter(
      (e) => e.status === "FAILED"
    ).length;
    const mustHaveWarningCount = allRequisitionEvaluations.filter(
      (e) => e.hasMustHaveWarnings
    ).length;
    const reviewedCount = allRequisitionEvaluations.filter(
      (e) => e.isReviewedByRecruiter
    ).length;
    const pendingReviewCount = totalEvaluated - reviewedCount;

    const avgScore =
      completedCount > 0
        ? Math.round(
            (completedEvaluations.reduce(
              (acc, curr) => acc + (curr.overallScore || 0),
              0
            ) /
              completedCount) *
              10
          ) / 10
        : null;

    const lastActivity =
      allRequisitionEvaluations.length > 0
        ? {
            updatedAt: allRequisitionEvaluations[0].updatedAt,
            reviewerName: allRequisitionEvaluations[0].reviewedBy?.name || null,
          }
        : null;

    return NextResponse.json({
      success: true,
      count: enrichedEvaluations.length,
      evaluations: enrichedEvaluations,
      summary: {
        totalApplications,
        totalEvaluated,
        completedCount,
        pendingCount,
        failedCount,
        mustHaveWarningCount,
        reviewedCount,
        pendingReviewCount,
        averageScore: avgScore,
        lastActivity,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error fetching evaluations." },
      { status: 500 }
    );
  }
}

