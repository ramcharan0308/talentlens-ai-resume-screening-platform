import { NextResponse } from "next/server";
import { prisma, withDatabaseRetry } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const start = Date.now();

  try {
    const orgCount = await withDatabaseRetry(() => prisma.organization.count(), 2, 1000);
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: {
        status: "connected",
        latencyMs,
        organizationsActive: orgCount,
      },
    });
  } catch (error: any) {
    console.error("Health check database failure:", error);
    const latencyMs = Date.now() - start;

    return NextResponse.json(
      {
        status: "degraded",
        timestamp: new Date().toISOString(),
        database: {
          status: "disconnected",
          latencyMs,
          error: error?.code || error?.name || "DATABASE_UNAVAILABLE",
        },
      },
      { status: 503 }
    );
  }
}

