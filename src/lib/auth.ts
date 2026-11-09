import { prisma, withDatabaseRetry } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { UserRole, OrganizationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "talentlens_session";
export const SESSION_DURATION_DAYS = 7;
export const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

// Rate limiting configuration
export const LOGIN_RATE_LIMIT_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILED_ATTEMPTS_PER_EMAIL = 5;
export const LOGIN_MAX_FAILED_ATTEMPTS_PER_IP = 10;

// Constant dummy bcrypt hash for timing-attack-resistant constant-time credential checks
const DUMMY_HASH = "$2a$12$e8kPj.tS140iJz4u0oU3..p8UvVpX8h8mN9kYlZq2Uu9r/1h1sN7S";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  organizationId: string;
  organizationName: string;
  organizationType: OrganizationType;
}

/**
 * Validates credentials server-side without leaking email existence.
 * Employs constant-time dummy bcrypt comparison if user does not exist or is inactive.
 * Never returns passwordHash or plaintext credentials.
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<AuthenticatedUser | null> {
  const normalizedEmail = email.trim().toLowerCase();

  // SAFETY INVARIANT: Prevent authentication with default seeded demo credentials in production
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEMO_AUTH_IN_PRODUCTION !== "true" &&
    password === "TalentLens2026!Demo"
  ) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  let user = null;
  try {
    user = await withDatabaseRetry(() =>
      prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { organization: true },
      })
    );
  } catch (err: any) {
    throw err;
  }

  if (!user || !user.passwordHash || !user.isActive) {
    // Run dummy comparison to equalize execution time and prevent enumeration
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    organizationId: user.organization.id,
    organizationName: user.organization.name,
    organizationType: user.organization.type,
  };
}

/**
 * Creates a server-side database session.
 * Protects against session fixation by generating a cryptographically secure token.
 */
export async function createSession(userId: string): Promise<{ sessionToken: string; expiresAt: Date }> {
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await withDatabaseRetry(() =>
    prisma.session.create({
      data: {
        sessionToken,
        userId,
        expiresAt,
      },
    })
  );

  return { sessionToken, expiresAt };
}

/**
 * Server-validates session against PostgreSQL database.
 * Enforces session expiration and immediate revocation if user is inactive, deleted, or session purged.
 */
export async function validateSession(sessionToken: string): Promise<AuthenticatedUser | null> {
  if (!sessionToken || typeof sessionToken !== "string" || sessionToken.length < 16) {
    return null;
  }

  const session = await withDatabaseRetry(() =>
    prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          include: { organization: true },
        },
      },
    })
  );

  if (!session) {
    return null;
  }

  // Deactivated user check: immediately reject access
  if (!session.user || !session.user.isActive) {
    return null;
  }

  if (session.expiresAt < new Date()) {
    // Delete expired session asynchronously
    prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    organizationId: user.organization.id,
    organizationName: user.organization.name,
    organizationType: user.organization.type,
  };
}

/**
 * Invalidates (deletes) a session server-side on logout.
 */
export async function invalidateSession(sessionToken: string): Promise<void> {
  if (!sessionToken) return;
  await withDatabaseRetry(() =>
    prisma.session.deleteMany({
      where: { sessionToken },
    })
  ).catch((e) => console.warn("Failed to invalidate session:", e));
}

/**
 * Invalidates all active sessions for a specific user (e.g. password reset / privilege revocation).
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  if (!userId) return;
  await withDatabaseRetry(() =>
    prisma.session.deleteMany({
      where: { userId },
    })
  ).catch((e) => console.warn("Failed to invalidate user sessions:", e));
}

/**
 * Resolves the authenticated user strictly from the secure HttpOnly cookie.
 * No bearer tokens or browser-supplied overrides are accepted.
 */
export async function getSessionUser(
  req?: NextRequest | Request
): Promise<AuthenticatedUser | null> {
  let token: string | null = null;

  if (req) {
    const cookieHeader = req.headers.get("cookie") || "";
    const matches = cookieHeader.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    if (matches && matches[1]) {
      token = decodeURIComponent(matches[1]);
    }
  }

  // Fallback to Next.js cookies() in Server Component context
  if (!token) {
    try {
      const cookieStore = await cookies();
      const cookieVal = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      if (cookieVal) {
        token = cookieVal;
      }
    } catch {
      // Outside of App Router server request context
    }
  }

  if (!token) {
    return null;
  }

  return validateSession(token);
}

/**
 * Cookie options conforming strictly to security standards:
 * HttpOnly, SameSite=Lax, Secure in production, 7-day expiration.
 */
export function getSessionCookieOptions(expiresAt: Date) {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    expires: expiresAt,
  };
}

/**
 * Attaches the authenticated session cookie to a NextResponse.
 */
export function attachSessionCookie(
  response: NextResponse,
  sessionToken: string,
  expiresAt: Date
): NextResponse {
  response.cookies.set({
    ...getSessionCookieOptions(expiresAt),
    value: sessionToken,
  });
  return response;
}

/**
 * Clears the session cookie from a NextResponse.
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}

/**
 * Validates that state-changing requests originate from the same application origin.
 * Rejects unexpected cross-origin requests with 403 Forbidden.
 */
export function validateCsrf(req: NextRequest): { isValid: boolean; errorResponse?: NextResponse } {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { isValid: true };
  }

  const origin = req.headers.get("origin");
  const host = req.headers.get("host") || req.headers.get("x-forwarded-host");

  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host.toLowerCase() !== host.toLowerCase()) {
        return {
          isValid: false,
          errorResponse: NextResponse.json(
            { success: false, error: "Forbidden: Cross-origin state-changing request rejected." },
            { status: 403 }
          ),
        };
      }
    } catch {
      return {
        isValid: false,
        errorResponse: NextResponse.json(
          { success: false, error: "Forbidden: Malformed origin header." },
          { status: 403 }
        ),
      };
    }
  }

  return { isValid: true };
}

/**
 * Resolves client IP address safely from request headers.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

/**
 * Checks login rate limit using persistent PostgreSQL LoginAttempt records.
 * 15-minute sliding window: max 5 failed attempts per email, 10 per IP.
 */
export async function checkLoginRateLimit(
  ip: string,
  email: string
): Promise<{ isBlocked: boolean; retryAfterSeconds?: number }> {
  try {
    const windowStart = new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
    const normalizedEmail = email.trim().toLowerCase();

    // Prune stale records (> 1 hour) asynchronously
    prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }
    }).catch(() => {});

    const [emailAttempts, ipAttempts] = await Promise.all([
      prisma.loginAttempt.count({
        where: {
          email: normalizedEmail,
          createdAt: { gt: windowStart },
        },
      }),
      prisma.loginAttempt.count({
        where: {
          ip,
          createdAt: { gt: windowStart },
        },
      }),
    ]);

    if (emailAttempts >= LOGIN_MAX_FAILED_ATTEMPTS_PER_EMAIL || ipAttempts >= LOGIN_MAX_FAILED_ATTEMPTS_PER_IP) {
      return { isBlocked: true, retryAfterSeconds: LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 };
    }

    return { isBlocked: false };
  } catch (err) {
    console.warn("Rate limit check failed gracefully due to transient database connectivity:", err);
    return { isBlocked: false };
  }
}

/**
 * Records a failed login attempt in PostgreSQL.
 */
export async function recordFailedLogin(ip: string, email: string): Promise<void> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    await prisma.loginAttempt.create({
      data: {
        ip,
        email: normalizedEmail,
      },
    });
  } catch (err) {
    console.warn("Failed to record failed login attempt:", err);
  }
}

/**
 * Clears failed login attempts upon successful authentication.
 */
export async function resetFailedLogins(email: string): Promise<void> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    await prisma.loginAttempt.deleteMany({
      where: { email: normalizedEmail },
    });
  } catch (err) {
    console.warn("Failed to reset login attempts:", err);
  }
}
