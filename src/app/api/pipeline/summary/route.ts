import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getAgencyPipelineSummary } from "@/lib/pipeline/transition-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const result = await getAgencyPipelineSummary(user);
    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: any) {
    console.error("Pipeline summary fetch error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error fetching pipeline summary." },
      { status: 500 }
    );
  }
}
