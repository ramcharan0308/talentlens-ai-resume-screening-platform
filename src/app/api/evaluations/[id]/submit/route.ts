import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { submitCandidateToClient } from "@/lib/client-portal/submission";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;
    const { id: evaluationId } = await params;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is acceptable if clientOrganizationId is already bound to requisition
    }

    const result = await submitCandidateToClient(user, {
      evaluationId,
      clientOrganizationId: body.clientOrganizationId,
      expectedRequisitionId: body.requisitionId,
      expectedCandidateId: body.candidateId,
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
    console.error("Error submitting candidate to client:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error submitting candidate to client.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}

