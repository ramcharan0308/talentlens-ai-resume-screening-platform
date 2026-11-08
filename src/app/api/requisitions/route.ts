import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { CLIENT_VISIBLE_APPLICATION_STATUSES } from "@/lib/permissions";
import {
  validateRequisitionInput,
  validateScorecardCriteria,
} from "@/lib/validations/requisition";
import { ScorecardCriterionInput } from "@/types";
import { RequisitionStatus, Prisma, UserRole, OrganizationType } from "@prisma/client";

// GET /api/requisitions - List requisitions with tenant isolation, filters and counts
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as RequisitionStatus | null;
    const search = searchParams.get("search")?.trim();
    const department = searchParams.get("department")?.trim();

    const where: Prisma.RequisitionWhereInput = {};

    // Multi-tenant scoping: Agency users see their agency's requisitions
    // Client hiring managers see only requisitions assigned or submitted to their client org
    if (user.organizationType === OrganizationType.AGENCY) {
      where.organizationId = user.organizationId;
    } else if (user.role === UserRole.CLIENT_HIRING_MGR) {
      where.OR = [
        { clientOrganizationId: user.organizationId },
        {
          applications: {
            some: {
              clientOrganizationId: user.organizationId,
              status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
            },
          },
        },
      ];
    } else {
      where.organizationId = user.organizationId;
    }

    if (status && Object.values(RequisitionStatus).includes(status)) {
      where.status = status;
    }

    if (department) {
      where.department = { contains: department, mode: "insensitive" };
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { department: { contains: search, mode: "insensitive" } },
            { location: { contains: search, mode: "insensitive" } },
            { coreSkills: { has: search } },
          ],
        },
      ];
    }

    const requisitions = await prisma.requisition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: { id: true, name: true, role: true },
        },
        clientOrganization: {
          select: { id: true, name: true, type: true },
        },
        _count: {
          select: {
            scorecardCriteria: true,
            applications: true,
          },
        },
      },
    });

    // Compute status counts scoped strictly to current tenant
    const countScope: Prisma.RequisitionWhereInput =
      user.organizationType === OrganizationType.AGENCY
        ? { organizationId: user.organizationId }
        : {
            OR: [
              { clientOrganizationId: user.organizationId },
              {
                applications: {
                  some: {
                    clientOrganizationId: user.organizationId,
                    status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
                  },
                },
              },
            ],
          };

    const counts = await prisma.requisition.groupBy({
      by: ["status"],
      where: countScope,
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

// POST /api/requisitions - Create a new requisition (RECRUITER / DELIVERY_HEAD of owning agency)
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request, [
      UserRole.RECRUITER,
      UserRole.DELIVERY_HEAD,
    ]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Unsupported Media Type: application/json required." },
        { status: 415 }
      );
    }

    if (user.organizationType !== OrganizationType.AGENCY) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Only staffing agency accounts can create requisitions." },
        { status: 403 }
      );
    }

    const body = await request.json();

    // 1. Validate Requisition Input
    const reqValidation = validateRequisitionInput(body, true);
    if (!reqValidation.isValid) {
      return NextResponse.json(
        { success: false, errors: reqValidation.errors },
        { status: 400 }
      );
    }

    // 2. Validate client organization assignment if provided
    let validatedClientOrgId: string | null = null;
    if (body.clientOrganizationId !== undefined && body.clientOrganizationId !== null && body.clientOrganizationId !== "") {
      const clientOrg = await prisma.organization.findFirst({
        where: {
          id: body.clientOrganizationId,
          type: OrganizationType.CLIENT,
        },
      });

      if (!clientOrg) {
        return NextResponse.json(
          { success: false, error: "Target organization is invalid or not a client organization." },
          { status: 400 }
        );
      }

      if (clientOrg.agencyId && clientOrg.agencyId !== user.organizationId) {
        return NextResponse.json(
          { success: false, error: "Client organization belongs to another agency. Cross-agency assignment is forbidden." },
          { status: 403 }
        );
      }

      validatedClientOrgId = clientOrg.id;
    }

    const targetStatus = (body.status as RequisitionStatus) || RequisitionStatus.DRAFT;
    const scorecardCriteria: ScorecardCriterionInput[] = Array.isArray(body.scorecardCriteria)
      ? body.scorecardCriteria
      : [];

    // 3. If status is ACTIVE, criteria must exist and sum to 100%
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

    // 4. Transactionally create Requisition and ScorecardCriteria with authenticated tenant identity
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
          // Explicitly derive tenant boundaries from authenticated session
          organizationId: user.organizationId,
          clientOrganizationId: validatedClientOrgId,
          createdById: user.id,
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
            select: { id: true, name: true, email: true, role: true },
          },
          clientOrganization: {
            select: { id: true, name: true, type: true },
          },
        },
      });

      // Audit Log for DPDP and compliance
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: "REQUISITION_CREATED",
          entityType: "Requisition",
          entityId: created.id,
          metadata: {
            title: created.title,
            status: created.status,
            clientOrganizationId: validatedClientOrgId,
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
