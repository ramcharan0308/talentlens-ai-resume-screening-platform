import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultAgencyAndRecruiter } from "@/lib/agency-context";
import {
  validateRequisitionInput,
  validateScorecardCriteria,
} from "@/lib/validations/requisition";
import { ScorecardCriterionInput } from "@/types";
import { RequisitionStatus, Prisma } from "@prisma/client";

// GET /api/requisitions - List requisitions with filters and counts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as RequisitionStatus | null;
    const search = searchParams.get("search")?.trim();
    const department = searchParams.get("department")?.trim();

    const where: Prisma.RequisitionWhereInput = {};

    if (status && Object.values(RequisitionStatus).includes(status)) {
      where.status = status;
    }

    if (department) {
      where.department = { contains: department, mode: "insensitive" };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { department: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
        { coreSkills: { has: search } },
      ];
    }

    const requisitions = await prisma.requisition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            scorecardCriteria: true,
            applications: true,
          },
        },
      },
    });

    // Compute status counts for dashboard filters
    const counts = await prisma.requisition.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const statusCounts: Record<string, number> = {
      ALL: requisitions.length,
      DRAFT: 0,
      ACTIVE: 0,
      FILLED: 0,
      ARCHIVED: 0,
    };

    let total = 0;
    counts.forEach((c) => {
      statusCounts[c.status] = c._count.id;
      total += c._count.id;
    });
    statusCounts.ALL = total;

    return NextResponse.json({
      success: true,
      data: requisitions,
      counts: statusCounts,
    });
  } catch (error) {
    console.error("Failed to fetch requisitions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch requisitions" },
      { status: 500 }
    );
  }
}

// POST /api/requisitions - Create a new requisition with optional scorecard criteria
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agency, recruiter } = await getDefaultAgencyAndRecruiter();

    // 1. Validate Requisition Input
    const reqValidation = validateRequisitionInput(body, true);
    if (!reqValidation.isValid) {
      return NextResponse.json(
        { success: false, errors: reqValidation.errors },
        { status: 400 }
      );
    }

    const targetStatus = (body.status as RequisitionStatus) || RequisitionStatus.DRAFT;
    const scorecardCriteria: ScorecardCriterionInput[] = Array.isArray(body.scorecardCriteria)
      ? body.scorecardCriteria
      : [];

    // 2. If status is ACTIVE, criteria must exist and sum to 100%
    if (targetStatus === RequisitionStatus.ACTIVE) {
      const critValidation = validateScorecardCriteria(scorecardCriteria, true);
      if (!critValidation.isValid) {
        return NextResponse.json(
          {
            success: false,
            errors: critValidation.errors,
            message: "Cannot activate requisition without complete scorecard totaling 100%.",
          },
          { status: 400 }
        );
      }
    } else if (scorecardCriteria.length > 0) {
      // For draft, criteria names and individual bounds must still be valid
      const critValidation = validateScorecardCriteria(scorecardCriteria, false);
      if (!critValidation.isValid) {
        return NextResponse.json(
          { success: false, errors: critValidation.errors },
          { status: 400 }
        );
      }
    }

    // 3. Transactionally create Requisition and ScorecardCriteria
    const newRequisition = await prisma.$transaction(async (tx) => {
      const created = await tx.requisition.create({
        data: {
          title: body.title.trim(),
          department: body.department?.trim() || null,
          location: body.location?.trim() || null,
          minExperienceYears:
            body.minExperienceYears !== undefined && body.minExperienceYears !== ""
              ? Number(body.minExperienceYears)
              : null,
          maxExperienceYears:
            body.maxExperienceYears !== undefined && body.maxExperienceYears !== ""
              ? Number(body.maxExperienceYears)
              : null,
          maxNoticeDays:
            body.maxNoticeDays !== undefined && body.maxNoticeDays !== ""
              ? Number(body.maxNoticeDays)
              : null,
          targetSalaryRange: body.targetSalaryRange?.trim() || null,
          coreSkills: Array.isArray(body.coreSkills)
            ? body.coreSkills.map((s: string) => s.trim()).filter(Boolean)
            : [],
          jobDescription: body.jobDescription.trim(),
          status: targetStatus,
          organizationId: agency.id,
          createdById: recruiter.id,
          scorecardCriteria: {
            create: scorecardCriteria.map((c, idx) => ({
              name: c.name.trim(),
              description: c.description?.trim() || null,
              weight: Number(c.weight),
              isMustHave: Boolean(c.isMustHave),
              minScore: c.minScore ?? 1,
              maxScore: c.maxScore ?? 10,
              guidelines: c.guidelines?.trim() || null,
              orderIndex: c.orderIndex ?? idx,
            })),
          },
        },
        include: {
          scorecardCriteria: {
            orderBy: { orderIndex: "asc" },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Audit Log for DPDP and compliance
      await tx.auditLog.create({
        data: {
          actorId: recruiter.id,
          organizationId: agency.id,
          action: "REQUISITION_CREATED",
          entityType: "Requisition",
          entityId: created.id,
          metadata: {
            title: created.title,
            status: created.status,
            criteriaCount: scorecardCriteria.length,
          },
        },
      });

      return created;
    });

    return NextResponse.json(
      { success: true, data: newRequisition },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create requisition:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error creating requisition" },
      { status: 500 }
    );
  }
}
