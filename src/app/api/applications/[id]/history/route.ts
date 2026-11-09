import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getApplicationTimelineHistory } from "@/lib/pipeline/transition-service";

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
    const result = await getApplicationTimelineHistory(user, id);
    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: any) {
    console.error("Application history fetch error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error fetching application history." },
      { status: 500 }
    );
  }
}
