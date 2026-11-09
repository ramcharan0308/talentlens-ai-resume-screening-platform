import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { OrganizationType, UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/clients - List client organizations belonging to authenticated agency
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req, [
      UserRole.RECRUITER,
      UserRole.DELIVERY_HEAD,
    ]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    if (user.organizationType !== OrganizationType.AGENCY) {
      return NextResponse.json(
        { success: false, error: "Only agency personnel can access client organization management." },
        { status: 403 }
      );
    }

    const clients = await prisma.organization.findMany({
      where: {
        type: OrganizationType.CLIENT,
        agencyId: user.organizationId,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            clientRequisitions: true,
            clientApplications: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: clients });
  } catch (error) {
    console.error("Error fetching client organizations:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching client organizations." },
      { status: 500 }
    );
  }
}

// POST /api/clients - Create a new client organization for the authenticated agency
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req, [
      UserRole.RECRUITER,
      UserRole.DELIVERY_HEAD,
    ]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    if (user.organizationType !== OrganizationType.AGENCY) {
      return NextResponse.json(
        { success: false, error: "Only agency personnel can create client organizations." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name || name.length < 2) {
      return NextResponse.json(
        { success: false, error: "Client organization name must be at least 2 characters long." },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { success: false, error: "Client organization name must not exceed 100 characters." },
        { status: 400 }
      );
    }

    const newClient = await prisma.$transaction(async (tx) => {
      const client = await tx.organization.create({
        data: {
          name,
          type: OrganizationType.CLIENT,
          agencyId: user.organizationId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: "CLIENT_ORGANIZATION_CREATED",
          entityType: "Organization",
          entityId: client.id,
          metadata: {
            clientName: client.name,
            agencyId: user.organizationId,
          },
        },
      });

      return client;
    });

    return NextResponse.json({ success: true, data: newClient }, { status: 201 });
  } catch (error) {
    console.error("Error creating client organization:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error creating client organization." },
      { status: 500 }
    );
  }
}

