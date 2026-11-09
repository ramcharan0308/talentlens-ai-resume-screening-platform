import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { CLIENT_VISIBLE_APPLICATION_STATUSES, Permissions } from "@/lib/permissions";
import { Prisma, UserRole, OrganizationType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim();
    const isFixtureParam = searchParams.get("isFixture");
    const requisitionId = searchParams.get("requisitionId")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const where: Prisma.CandidateWhereInput = {
      purgeStatus: "ACTIVE", // Filter out purged profiles
    };

    // Multi-tenant isolation:
    // Agency users only see candidates belonging to their agency
    // Client hiring managers only see candidates explicitly submitted to their client organization
    if (user.organizationType === OrganizationType.AGENCY) {
      where.agencyId = user.organizationId;
    } else if (user.role === UserRole.CLIENT_HIRING_MGR) {
      where.applications = {
        some: {
          clientOrganizationId: user.organizationId,
          status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
        },
      };
    } else {
      where.agencyId = user.organizationId;
    }

    if (isFixtureParam === "true") {
      where.isFixture = true;
    } else if (isFixtureParam === "false") {
      where.isFixture = false;
    }

    if (requisitionId) {
      where.applications = {
        some: {
          requisitionId,
          ...(user.role === UserRole.CLIENT_HIRING_MGR
            ? {
                clientOrganizationId: user.organizationId,
                status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
              }
            : {}),
        },
      };
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { candidateReference: { contains: search, mode: "insensitive" } },
            ...(user.role !== UserRole.CLIENT_HIRING_MGR
              ? [{ fullName: { contains: search, mode: "insensitive" as Prisma.QueryMode } }]
              : []),
            { currentRole: { contains: search, mode: "insensitive" } },
            { keySkills: { has: search } },
          ],
        },
      ];
    }

    const isClient = Permissions.shouldMaskCandidateDetails(user);

    const [total, rawCandidates, fixtureCount, ingestedCount] = await Promise.all([
      prisma.candidate.count({ where }),
      prisma.candidate.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isFixture: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          candidateReference: true,
          fullName: !isClient, // Masked for client users
          currentRole: true,
          experienceYears: true,
          keySkills: true,
          noticeDays: true,
          isFixture: true,
          createdAt: true,
          applications: {
            where: isClient
              ? {
                  clientOrganizationId: user.organizationId,
                  status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
                }
              : undefined,
            select: {
              id: true,
              status: true,
              requisition: {
                select: { id: true, title: true, status: true },
              },
            },
          },
          uploadedDocuments: isClient
            ? false
            : {
                select: {
                  id: true,
                  fileName: true,
                  fileType: true,
                  fileSizeBytes: true,
                  processingStatus: true,
                  createdAt: true,
                },
              },
        },
      }),
      prisma.candidate.count({
        where: { ...where, isFixture: true },
      }),
      prisma.candidate.count({
        where: { ...where, isFixture: false },
      }),
    ]);

    // Format output with privacy masking for client users
    const candidates = rawCandidates.map((c) => ({
      ...c,
      fullName: isClient ? `Candidate ${c.candidateReference}` : c.fullName,
      uploadedDocuments: isClient ? [] : (c as any).uploadedDocuments || [],
    }));

    return NextResponse.json({
      success: true,
      data: candidates,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      counts: {
        total: fixtureCount + ingestedCount,
        fixtures: fixtureCount,
        ingested: ingestedCount,
      },
    });
  } catch (error) {
    console.error("List candidates error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching candidates." },
      { status: 500 }
    );
  }
}
