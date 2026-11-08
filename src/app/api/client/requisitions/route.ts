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

    if (user.role !== UserRole.CLIENT_HIRING_MGR || user.organizationType !== OrganizationType.CLIENT) {
      return NextResponse.json(
        { success: false, error: "Access restricted to client hiring managers.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const clientOrgId = user.organizationId;

    // Fetch requisitions legitimately assigned to this client organization
    const requisitions = await prisma.requisition.findMany({
      where: {
        OR: [
          { clientOrganizationId: clientOrgId },
          {
            applications: {
              some: {
                clientOrganizationId: clientOrgId,
                status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
              },
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        applications: {
          where: {
            clientOrganizationId: clientOrgId,
            status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
          },
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    const data = requisitions.map((req) => {
      const apps = req.applications;
      const submittedCount = apps.length;
      const pendingCount = apps.filter((a) => a.status === ApplicationStatus.SUBMITTED_TO_CLIENT).length;
      const shortlistedCount = apps.filter((a) => a.status === ApplicationStatus.CLIENT_SHORTLISTED).length;
      const interviewCount = apps.filter((a) => a.status === ApplicationStatus.INTERVIEW_PROPOSED).length;
      const rejectedCount = apps.filter((a) => a.status === ApplicationStatus.CLIENT_REJECTED).length;

      return {
        id: req.id,
        title: req.title,
        department: req.department,
        location: req.location,
        status: req.status,
        minExperienceYears: req.minExperienceYears,
        maxExperienceYears: req.maxExperienceYears,
        maxNoticeDays: req.maxNoticeDays,
        targetSalaryRange: req.targetSalaryRange,
        coreSkills: req.coreSkills,
        createdAt: req.createdAt.toISOString(),
        metrics: {
          submittedCount,
          pendingCount,
          shortlistedCount,
          interviewCount,
          rejectedCount,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching client requisitions:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching client requisitions.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

