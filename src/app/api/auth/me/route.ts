import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required." },
        { status: 401 }
      );
    }

    // Never return passwordHash or internal security artifacts
    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Auth me route error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error retrieving session." },
      { status: 500 }
    );
  }
}

