import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { setCandidateRetentionExpiry } from "@/lib/retention/retention-service";

export async function POST(
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
    if (!body.expiresAt) {
      return NextResponse.json(
        { error: "expiresAt ISO date string is required.", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const result = await setCandidateRetentionExpiry(user, id, new Date(body.expiresAt));
    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

