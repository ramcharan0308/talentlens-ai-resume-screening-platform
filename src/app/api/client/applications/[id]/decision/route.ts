import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { processClientDecision, ClientDecisionType } from "@/lib/client-portal/decision";

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
    const { id: applicationId } = await params;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request body.", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    const { decision, rejectionReason, proposedSlot, proposedNote, note } = body;

    const result = await processClientDecision(user, {
      applicationId,
      decision: decision as ClientDecisionType,
      rejectionReason,
      proposedSlot,
      proposedNote: proposedNote || note,
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
    console.error("Error processing client decision:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error processing decision.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

