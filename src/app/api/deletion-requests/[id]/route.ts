import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import {
  getDeletionRequest,
  reviewDeletionRequest,
  approveDeletionRequest,
} from "@/lib/deletion/deletion-service";

export const dynamic = "force-dynamic";

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

    const result = await getDeletionRequest(user, id);
    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function PATCH(
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

    const body = await req.json();

    if (body.status === "APPROVED" || body.action === "APPROVE") {
      const result = await approveDeletionRequest(user, { requestId: id });
      return NextResponse.json(result, { status: result.statusCode });
    }

    if (body.action === "START_REVIEW" || body.action === "REJECT") {
      const result = await reviewDeletionRequest(user, {
        requestId: id,
        action: body.action,
        rejectionReason: body.rejectionReason,
      });
      return NextResponse.json(result, { status: result.statusCode });
    }

    return NextResponse.json(
      { error: "Invalid review action. Supported: START_REVIEW, REJECT, or APPROVE", code: "INVALID_ACTION" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

