import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { submitCandidateToClient } from "@/lib/client-portal/submission";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;
    const { id: requisitionId, candidateId } = await params;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body
    }

    let evaluationId = body.evaluationId;

    if (!evaluationId) {
      // Find latest completed evaluation for this candidate and requisition
      const latestEval = await prisma.evaluation.findFirst({
        where: {
          requisitionId,
          candidateId,
          agencyId: user.organizationId,
          isReviewedByRecruiter: true,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!latestEval) {
        return NextResponse.json(
          {
            success: false,
            error: "No reviewed evaluation found for this candidate on this requisition.",
            code: "NO_REVIEWED_EVALUATION",
          },
          { status: 428 }
        );
      }
      evaluationId = latestEval.id;
    }

    const result = await submitCandidateToClient(user, {
      evaluationId,
      clientOrganizationId: body.clientOrganizationId,
      expectedRequisitionId: requisitionId,
      expectedCandidateId: candidateId,
    });

    return NextResponse.json(
      {
        success: result.success,
        data: result.success ? result : undefined,
        error: result.error,
        code: result.code,
      },
      { status: result.statusCode }
    );
  } catch (error) {
    console.error("Error submitting candidate via requisition:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error submitting candidate.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}

