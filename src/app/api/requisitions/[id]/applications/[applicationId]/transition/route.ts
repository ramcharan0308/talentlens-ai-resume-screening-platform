import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { transitionApplicationStage } from "@/lib/pipeline/transition-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; applicationId: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const { id, applicationId } = await context.params;

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const { targetStatus, reason, scheduledSlot, scheduledNote, note } = body;

    const result = await transitionApplicationStage(user, {
      applicationId,
      expectedRequisitionId: id,
      targetStatus,
      reason,
      scheduledSlot,
      scheduledNote,
      note,
    });

    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: any) {
    console.error("Requisition application transition error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error performing application transition." },
      { status: 500 }
    );
  }
}
