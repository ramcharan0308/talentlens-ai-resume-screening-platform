import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import {
  getDeliveryDashboardAnalytics,
  DeliveryDashboardFilters,
} from "@/lib/delivery/analytics-service";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    const url = new URL(req.url);
    const filters: DeliveryDashboardFilters = {
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
      recruiterId: url.searchParams.get("recruiterId") || undefined,
      clientOrganizationId: url.searchParams.get("clientOrganizationId") || undefined,
      requisitionId: url.searchParams.get("requisitionId") || undefined,
    };

    const result = await getDeliveryDashboardAnalytics(user, filters);
    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message, code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

