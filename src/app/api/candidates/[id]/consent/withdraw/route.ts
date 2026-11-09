import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { withdrawConsent } from "@/lib/consent/consent-service";

export const dynamic = "force-dynamic";

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
    const result = await withdrawConsent(user, {
      candidateId: id,
      purpose: body.purpose,
      reason: body.reason,
      notes: body.notes,
    });

    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

