import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { CLIENT_VISIBLE_APPLICATION_STATUSES, Permissions } from "@/lib/permissions";
import { UserRole, OrganizationType } from "@prisma/client";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const { id } = await context.params;

    const isClient = Permissions.shouldMaskCandidateDetails(user);

    let candidate;

    if (user.organizationType === OrganizationType.AGENCY) {
      // Scoped strictly to agency tenancy
      candidate = await prisma.candidate.findFirst({
        where: {
          id,
          agencyId: user.organizationId,
        },
        include: {
          applications: {
            include: {
              requisition: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  department: true,
                  location: true,
                },
              },
            },
          },
          uploadedDocuments: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
              fileSizeBytes: true,
              fileHash: true,
              processingStatus: true,
              createdAt: true,
            },
          },
        },
      });
    } else if (user.role === UserRole.CLIENT_HIRING_MGR) {
      // Client hiring manager can ONLY access if an application is submitted to their client organization
      candidate = await prisma.candidate.findFirst({
        where: {
          id,
          applications: {
            some: {
              clientOrganizationId: user.organizationId,
              status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
            },
          },
        },
        include: {
          applications: {
            where: {
              clientOrganizationId: user.organizationId,
              status: { in: CLIENT_VISIBLE_APPLICATION_STATUSES },
            },
            include: {
              requisition: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  department: true,
                  location: true,
                },
              },
            },
          },
        },
      });
    }

    if (!candidate) {
      return NextResponse.json(
        { success: false, error: "Candidate not found or access denied." },
        { status: 404 }
      );
    }

    // Mask privacy details for client users
    const sanitizedCandidate = {
      ...candidate,
      fullName: isClient ? `Candidate ${candidate.candidateReference}` : candidate.fullName,
      uploadedDocuments: isClient ? [] : (candidate as any).uploadedDocuments || [],
    };

    return NextResponse.json({ success: true, data: sanitizedCandidate });
  } catch (error) {
    console.error("Fetch candidate error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching candidate." },
      { status: 500 }
    );
  }
}
