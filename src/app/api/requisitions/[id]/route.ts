import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateRequisitionInput } from "@/lib/validations/requisition";
import { RequisitionStatus } from "@prisma/client";

// GET /api/requisitions/[id] - Fetch single requisition details
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const requisition = await prisma.requisition.findUnique({
      where: { id },
      include: {
        scorecardCriteria: {
          orderBy: { orderIndex: "asc" },
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        organization: {
          select: { id: true, name: true, type: true },
        },
        _count: {
          select: {
            applications: true,
            batchJobs: true,
          },
        },
      },
    });

    if (!requisition) {
      return NextResponse.json(
        { success: false, error: "Requisition not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: requisition });
  } catch (error) {
    console.error("Failed to fetch requisition:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching requisition" },
      { status: 500 }
    );
  }
}

// PATCH /api/requisitions/[id] - Edit requisition details or update status
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await prisma.requisition.findUnique({
      where: { id },
      include: {
        scorecardCriteria: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Requisition not found" },
        { status: 404 }
      );
    }

    // 1. Validate partial fields
    const validation = validateRequisitionInput(body, false);
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 }
      );
    }

    // 2. Status Transition Check: activating requires criteria summing to 100%
    if (body.status === RequisitionStatus.ACTIVE && existing.status !== RequisitionStatus.ACTIVE) {
      const totalWeight = existing.scorecardCriteria.reduce((sum, c) => sum + c.weight, 0);
      if (existing.scorecardCriteria.length === 0 || totalWeight !== 100) {
        return NextResponse.json(
          {
            success: false,
            message: `Cannot activate requisition: scorecard criteria must sum to 100% (currently ${totalWeight}% across ${existing.scorecardCriteria.length} criteria).`,
          },
          { status: 400 }
        );
      }
    }

    // 3. Prepare update data
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.department !== undefined) updateData.department = body.department?.trim() || null;
    if (body.location !== undefined) updateData.location = body.location?.trim() || null;
    if (body.minExperienceYears !== undefined) {
      updateData.minExperienceYears =
        body.minExperienceYears !== "" && body.minExperienceYears !== null
          ? Number(body.minExperienceYears)
          : null;
    }
    if (body.maxExperienceYears !== undefined) {
      updateData.maxExperienceYears =
        body.maxExperienceYears !== "" && body.maxExperienceYears !== null
          ? Number(body.maxExperienceYears)
          : null;
    }
    if (body.maxNoticeDays !== undefined) {
      updateData.maxNoticeDays =
        body.maxNoticeDays !== "" && body.maxNoticeDays !== null
          ? Number(body.maxNoticeDays)
          : null;
    }
    if (body.targetSalaryRange !== undefined) {
      updateData.targetSalaryRange = body.targetSalaryRange?.trim() || null;
    }
    if (body.coreSkills !== undefined) {
      updateData.coreSkills = Array.isArray(body.coreSkills)
        ? body.coreSkills.map((s: string) => s.trim()).filter(Boolean)
        : [];
    }
    if (body.jobDescription !== undefined) updateData.jobDescription = body.jobDescription.trim();
    if (body.status !== undefined) updateData.status = body.status;

    // 4. Update in database with audit log
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.requisition.update({
        where: { id },
        data: updateData,
        include: {
          scorecardCriteria: {
            orderBy: { orderIndex: "asc" },
          },
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          _count: {
            select: {
              applications: true,
              batchJobs: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: existing.createdById,
          organizationId: existing.organizationId,
          action: body.status && body.status !== existing.status ? "REQUISITION_STATUS_CHANGED" : "REQUISITION_UPDATED",
          entityType: "Requisition",
          entityId: existing.id,
          metadata: {
            oldStatus: existing.status,
            newStatus: result.status,
            updatedFields: Object.keys(updateData),
          },
        },
      });

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Failed to update requisition:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error updating requisition" },
      { status: 500 }
    );
  }
}

// DELETE /api/requisitions/[id] - Archive or remove requisition
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const existing = await prisma.requisition.findUnique({
      where: { id },
      include: {
        _count: {
          select: { applications: true, batchJobs: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Requisition not found" },
        { status: 404 }
      );
    }

    // If applications or batch jobs exist, archive instead of hard delete
    if (existing._count.applications > 0 || existing._count.batchJobs > 0) {
      const archived = await prisma.requisition.update({
        where: { id },
        data: { status: RequisitionStatus.ARCHIVED },
      });
      return NextResponse.json({
        success: true,
        data: archived,
        message: "Requisition has associated applications; archived successfully.",
      });
    }

    await prisma.requisition.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Requisition deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete requisition:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error deleting requisition" },
      { status: 500 }
    );
  }
}
