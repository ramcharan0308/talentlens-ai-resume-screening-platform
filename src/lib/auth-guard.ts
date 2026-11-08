import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSessionUser, AuthenticatedUser, validateCsrf } from "@/lib/auth";

export interface RequestSecurityContext {
  agencyId: string;
  actorId: string;
  role: UserRole;
  isAuthorized: boolean;
  user?: AuthenticatedUser;
  errorResponse?: { error: string; status: number };
}

/**
 * Standardized 401 Unauthorized JSON response.
 */
export function unauthorizedResponse(
  message = "Unauthorized: Active authenticated session required."
): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

/**
 * Standardized 403 Forbidden JSON response.
 */
export function forbiddenResponse(
  message = "Forbidden: Insufficient permissions to perform this operation."
): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

/**
 * Enforces real server-side authentication, CSRF validation, and role-based authorization.
 */
export async function requireAuth(
  req: NextRequest,
  allowedRoles?: UserRole[]
): Promise<{ user: AuthenticatedUser } | NextResponse> {
  // 1. CSRF validation for state-changing requests (POST, PATCH, PUT, DELETE)
  const csrf = validateCsrf(req);
  if (!csrf.isValid) {
    return csrf.errorResponse!;
  }

  // 2. Session validation
  const user = await getSessionUser(req);
  if (!user) {
    return unauthorizedResponse();
  }

  // 3. User active check
  if (!user.isActive) {
    return unauthorizedResponse("Unauthorized: User account has been deactivated.");
  }

  // 4. Role validation
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return forbiddenResponse(`Forbidden: Role ${user.role} is not permitted to perform this operation.`);
  }

  return { user };
}

/**
 * Returns the verified request security context from the active session.
 */
export async function getRequestSecurityContext(
  req: NextRequest
): Promise<RequestSecurityContext> {
  const user = await getSessionUser(req);

  if (!user || !user.isActive) {
    return {
      agencyId: "",
      actorId: "",
      role: UserRole.RECRUITER,
      isAuthorized: false,
      errorResponse: {
        error: "Unauthorized: Active authenticated session required.",
        status: 401,
      },
    };
  }

  return {
    agencyId: user.organizationId,
    actorId: user.id,
    role: user.role,
    isAuthorized: true,
    user,
  };
}
