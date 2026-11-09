import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getRequisitionPipelineData } from "@/lib/pipeline/transition-service";
import { ApplicationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

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
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const stageParam = searchParams.get("stage") || undefined;

    let stageFilter: ApplicationStatus | undefined;
    if (stageParam && Object.values(ApplicationStatus).includes(stageParam as ApplicationStatus)) {
      stageFilter = stageParam as ApplicationStatus;
    }

    const result = await getRequisitionPipelineData(user, id, search, stageFilter);
    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: any) {
    console.error("Pipeline fetch error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error fetching pipeline." },
      { status: 500 }
    );
  }
}
