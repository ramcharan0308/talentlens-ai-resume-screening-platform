import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { UserRole } from "@prisma/client";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(req, [
      UserRole.RECRUITER,
      UserRole.DELIVERY_HEAD,
    ]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const { id } = await context.params;

    const job = await prisma.batchUploadJob.findFirst({
      where: {
        id,
        agencyId: user.organizationId,
      },
      include: {
        requisition: {
          select: { id: true, title: true, status: true },
        },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            idempotencyKey: true,
            originalFileName: true,
            fileSizeBytes: true,
            status: true,
            documentId: true,
            errorMessage: true,
            createdAt: true,
            document: {
              select: {
                id: true,
                processingStatus: true,
                candidate: {
                  select: {
                    id: true,
                    candidateReference: true,
                    fullName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Batch job not found or access denied." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: job });
  } catch (error) {
    console.error("Fetch batch job error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching batch job." },
      { status: 500 }
    );
  }
}
