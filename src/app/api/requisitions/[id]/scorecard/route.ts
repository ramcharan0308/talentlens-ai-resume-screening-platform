import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { CLIENT_VISIBLE_APPLICATION_STATUSES } from "@/lib/permissions";
import { validateScorecardCriteria } from "@/lib/validations/requisition";
import { ScorecardCriterionInput } from "@/types";
import { RequisitionStatus, UserRole, OrganizationType } from "@prisma/client";

// GET /api/requisitions/[id]/scorecard - Fetch scorecard criteria for a requisition
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const { id } = await context.params;

    // Tenant-isolated lookup
    let requisition;
    if (user.organizationType === OrganizationType.AGENCY) {
      requisition = await prisma.requisition.findFirst({
        where: { id, organizationId: user.organizationId },
        select: { id: true, title: true, status: true },
      });
    } else if (user.role === UserRole.CLIENT_HIRING_MGR) {
      requisition = await prisma.requisition.findFirst({
        where: {
          id,
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
        },
        select: { id: true, title: true, status: true },
      });
    }

    if (!requisition) {
      return NextResponse.json(
        { success: false, error: "Requisition not found or access denied." },
        { status: 404 }
      );
    }

    const criteria = await prisma.scorecardCriterion.findMany({
      where: { requisitionId: id },
      orderBy: { orderIndex: "asc" },
    });

    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
    const mustHaveCount = criteria.filter((c) => c.isMustHave).length;

    return NextResponse.json({
      success: true,
      data: {
        requisition,
        criteria,
        totalWeight,
        mustHaveCount,
        isComplete: totalWeight === 100 && criteria.length > 0,
      },
    });
  } catch (error) {
    console.error("Failed to fetch scorecard criteria:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching scorecard criteria" },
      { status: 500 }
    );
  }
}

// PUT /api/requisitions/[id]/scorecard - Replace criteria and enforce 100% weight validation
export async function PUT(
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

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Unsupported Media Type: application/json required." },
        { status: 415 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();

    // Verify agency ownership
    const requisition = await prisma.requisition.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
      },
    });

    if (!requisition) {
      return NextResponse.json(
        { success: false, error: "Requisition not found or access denied." },
        { status: 404 }
      );
    }

    const criteria: ScorecardCriterionInput[] = Array.isArray(body.criteria)
      ? body.criteria
      : [];

    // If requisition is ACTIVE, we strictly enforce 100% weight
    const isEnforced = requisition.status === RequisitionStatus.ACTIVE || body.enforceHundredPercent === true;
    const validation = validateScorecardCriteria(criteria, isEnforced);

    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          errors: validation.errors,
          message: isEnforced
            ? "Criteria must sum to exactly 100% for active requisitions."
            : "Criteria validation failed.",
        },
        { status: 400 }
      );
    }

    // Transactionally update criteria with authenticated actor in AuditLog
    const updatedCriteria = await prisma.$transaction(async (tx) => {
      // Remove old criteria
      await tx.scorecardCriterion.deleteMany({
        where: { requisitionId: id },
      });

      // Insert new criteria with sanitized orderIndex
      if (criteria.length > 0) {
        await tx.scorecardCriterion.createMany({
          data: criteria.map((c, index) => ({
            requisitionId: id,
            name: c.name.trim(),
            description: c.description?.trim() || null,
            weight: Number(c.weight),
            isMustHave: Boolean(c.isMustHave),
            minScore: c.minScore ?? 1,
            maxScore: c.maxScore ?? 10,
            guidelines: c.guidelines?.trim() || null,
            orderIndex: c.orderIndex ?? index,
          })),
        });
      }

      // Record audit log with authenticated user and tenant
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: "SCORECARD_UPDATED",
          entityType: "Scorecard",
          entityId: id,
          metadata: {
            criteriaCount: criteria.length,
            totalWeight: criteria.reduce((sum, c) => sum + Number(c.weight), 0),
          },
        },
      });

      return tx.scorecardCriterion.findMany({
        where: { requisitionId: id },
        orderBy: { orderIndex: "asc" },
      });
    });

    const totalWeight = updatedCriteria.reduce((sum, c) => sum + c.weight, 0);

    return NextResponse.json({
      success: true,
      data: updatedCriteria,
      totalWeight,
      isComplete: totalWeight === 100 && updatedCriteria.length > 0,
      message: "Scorecard criteria successfully saved.",
    });
  } catch (error) {
    console.error("Failed to update scorecard criteria:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error updating scorecard criteria" },
      { status: 500 }
    );
  }
}
