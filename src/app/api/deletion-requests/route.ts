import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { listDeletionRequests } from "@/lib/deletion/deletion-service";
import { DeletionRequestStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") as DeletionRequestStatus | null;
    const candidateId = url.searchParams.get("candidateId") || undefined;

    const result = await listDeletionRequests(user, {
      status: statusParam || undefined,
      candidateId,
    });

    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

