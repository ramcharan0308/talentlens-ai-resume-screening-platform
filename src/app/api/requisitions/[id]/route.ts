import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { CLIENT_VISIBLE_APPLICATION_STATUSES } from "@/lib/permissions";
import { validateRequisitionInput } from "@/lib/validations/requisition";
import { RequisitionStatus, UserRole, OrganizationType } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/requisitions/[id] - Fetch single requisition details with tenant isolation
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
        where: {
          id,
          organizationId: user.organizationId,
        },
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
          clientOrganization: {
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
        include: {
          scorecardCriteria: {
            orderBy: { orderIndex: "asc" },
          },
          createdBy: {
            select: { id: true, name: true, role: true },
          },
          organization: {
            select: { id: true, name: true, type: true },
          },
          clientOrganization: {
            select: { id: true, name: true, type: true },
          },
          _count: {
            select: {
              applications: true,
            },
          },
        },
      });
    }

    if (!requisition) {
      return NextResponse.json(
        { success: false, error: "Requisition not found or access denied." },
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

    // Verify ownership strictly within user's agency
    const existing = await prisma.requisition.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
      },
      include: {
        scorecardCriteria: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Requisition not found or access denied." },
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

    // 2. Validate client organization assignment if provided
    const updateData: Record<string, unknown> = {};
    let isClientOrgUpdated = false;
    let newClientOrgName: string | null = null;
    if (body.clientOrganizationId !== undefined) {
      if (body.clientOrganizationId === null || body.clientOrganizationId === "") {
        updateData.clientOrganizationId = null;
        if (existing.clientOrganizationId !== null) {
          isClientOrgUpdated = true;
        }
      } else {
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

        updateData.clientOrganizationId = clientOrg.id;
        newClientOrgName = clientOrg.name;
        if (existing.clientOrganizationId !== clientOrg.id) {
          isClientOrgUpdated = true;
        }
      }
    }

    // 3. Status Transition Check: activating requires criteria summing to 100%
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

    // 4. Prepare update data
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
    if (body.jobDescription !== undefined) {
      updateData.jobDescription = body.jobDescription.trim();
    }
    if (body.status !== undefined && Object.values(RequisitionStatus).includes(body.status)) {
      updateData.status = body.status;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.requisition.update({
        where: { id },
        data: updateData,
        include: {
          scorecardCriteria: {
            orderBy: { orderIndex: "asc" },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          clientOrganization: {
            select: { id: true, name: true, type: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
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

      if (isClientOrgUpdated) {
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            organizationId: user.organizationId,
            action: "REQUISITION_CLIENT_ASSIGNED",
            entityType: "Requisition",
            entityId: existing.id,
            metadata: {
              previousClientOrganizationId: existing.clientOrganizationId,
              newClientOrganizationId: updateData.clientOrganizationId ?? null,
              clientOrganizationName: newClientOrgName,
            },
          },
        });
      }

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
    const authResult = await requireAuth(request, [
      UserRole.RECRUITER,
      UserRole.DELIVERY_HEAD,
    ]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const { id } = await context.params;

    const existing = await prisma.requisition.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
      },
      include: {
        _count: {
          select: { applications: true, batchJobs: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Requisition not found or access denied." },
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
