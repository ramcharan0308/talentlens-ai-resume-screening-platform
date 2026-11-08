import { NextRequest, NextResponse } from "next/server";
import { invalidateSession, clearSessionCookie, SESSION_COOKIE_NAME, validateCsrf } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    // 1. Validate CSRF Origin
    const csrf = validateCsrf(req);
    if (!csrf.isValid) {
      return csrf.errorResponse!;
    }

    let token: string | null = null;

    // Check cookie
    const cookieHeader = req.headers.get("cookie") || "";
    const matches = cookieHeader.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    if (matches && matches[1]) {
      token = decodeURIComponent(matches[1]);
    }

    if (token) {
      await invalidateSession(token);
    }

    const response = NextResponse.json({
      success: true,
      message: "Session terminated successfully.",
    });

    return clearSessionCookie(response);
  } catch (error) {
    console.error("Logout route error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred during logout." },
      { status: 500 }
    );
  }
}
