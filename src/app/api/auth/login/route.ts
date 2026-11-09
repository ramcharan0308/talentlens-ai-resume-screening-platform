import { NextRequest, NextResponse } from "next/server";
import { prisma, withDatabaseRetry } from "@/lib/prisma";
import {
  verifyCredentials,
  createSession,
  attachSessionCookie,
  validateCsrf,
  getClientIp,
  checkLoginRateLimit,
  recordFailedLogin,
  resetFailedLogins,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Dedicated, authorized company evaluation demo personas with role-specific workspace targets
const APPROVED_DEMO_PERSONAS: Record<string, { role: string; redirect: string }> = {
  "priya.sharma@companya-noida.internal": {
    role: "RECRUITER",
    redirect: "/requisitions",
  },
  "ananya.roy@companya-noida.internal": {
    role: "DELIVERY_HEAD",
    redirect: "/delivery/dashboard",
  },
  "rajesh.kumar@fintechglobal.com": {
    role: "CLIENT_HIRING_MGR",
    redirect: "/client",
  },
};

export async function POST(req: NextRequest) {
  try {
    // 1. Validate CSRF Origin
    const csrf = validateCsrf(req);
    if (!csrf.isValid) {
      return csrf.errorResponse!;
    }

    // 2. Validate Content-Type
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Unsupported Media Type: application/json required." },
        { status: 415 }
      );
    }

    const body = await req.json();
    const { email, password, isDemoQuickFill } = body;

    // Handle dedicated demo persona quick-fill without exposing credentials client-side
    if (isDemoQuickFill) {
      const normalizedEmail = (email || "").trim().toLowerCase();
      const personaConfig = APPROVED_DEMO_PERSONAS[normalizedEmail];

      // SAFETY INVARIANT: Strictly reject arbitrary or unauthorized accounts from passwordless login
      if (!personaConfig) {
        return NextResponse.json(
          { success: false, error: "Unauthorized demo persona." },
          { status: 403 }
        );
      }

      const ip = getClientIp(req);
      const rateLimit = await checkLoginRateLimit(ip, normalizedEmail);
      if (rateLimit.isBlocked) {
        return NextResponse.json(
          {
            success: false,
            error: "Too many login attempts. Please try again later.",
          },
          { status: 429 }
        );
      }

      const demoUser = await withDatabaseRetry(() =>
        prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { organization: true },
        })
      );

      if (!demoUser || !demoUser.isActive) {
        return NextResponse.json(
          { success: false, error: "Demo user account not found or inactive." },
          { status: 404 }
        );
      }

      const { sessionToken, expiresAt } = await createSession(demoUser.id);
      const response = NextResponse.json({
        success: true,
        data: {
          id: demoUser.id,
          name: demoUser.name,
          email: demoUser.email,
          role: demoUser.role,
          isActive: demoUser.isActive,
          organizationId: demoUser.organization.id,
          organizationName: demoUser.organization.name,
          organizationType: demoUser.organization.type,
          defaultRedirect: personaConfig.redirect,
        },
        message: "Demo authentication successful.",
      });

      return attachSessionCookie(response, sessionToken, expiresAt);
    }

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 400 }
      );
    }

    const ip = getClientIp(req);

    // 3. Login Abuse Protection: Check Rate Limit (5 per email, 10 per IP in 15 mins)
    const rateLimit = await checkLoginRateLimit(ip, email);
    if (rateLimit.isBlocked) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many failed login attempts. Please try again later.",
        },
        { status: 429 }
      );
    }

    // 4. Authenticate credentials (timing-safe)
    const user = await verifyCredentials(email, password);

    if (!user) {
      // Record failed attempt
      await recordFailedLogin(ip, email);

      // Generic error preventing email enumeration
      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    // 5. Reset failed attempts for this email on success
    await resetFailedLogins(email);

    // 6. Establish server session
    const { sessionToken, expiresAt } = await createSession(user.id);

    const defaultRedirect =
      user.role === "DELIVERY_HEAD"
        ? "/delivery/dashboard"
        : user.role === "CLIENT_HIRING_MGR"
        ? "/client"
        : "/requisitions";

    const response = NextResponse.json({
      success: true,
      data: {
        ...user,
        defaultRedirect,
      },
      message: "Authentication successful.",
    });

    return attachSessionCookie(response, sessionToken, expiresAt);
  } catch (error: any) {
    console.error("Login route error:", error);

    if (
      error?.code === "P1001" ||
      error?.code === "P1002" ||
      error?.code === "P1008" ||
      error?.code === "P1017" ||
      error?.name === "PrismaClientInitializationError"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Database compute is currently resuming from sleep. Please retry in a few moments.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: "An unexpected error occurred during authentication." },
      { status: 500 }
    );
  }
}
