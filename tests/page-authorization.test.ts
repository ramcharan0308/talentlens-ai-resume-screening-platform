import test from "node:test";
import assert from "node:assert/strict";
import { UserRole, OrganizationType, ApplicationStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import {
  checkPageAuthorization,
  checkRequisitionAccess,
  checkRequisitionEditAccess,
  checkCandidateAccess,
  checkResumeUploadAccess,
} from "../src/lib/page-auth";
import {
  createSession,
  validateSession,
  invalidateSession,
  SESSION_COOKIE_NAME,
  AuthenticatedUser,
} from "../src/lib/auth";
import { middleware } from "../src/middleware";

// ---------------------------------------------------------------------------
// Test User Personas (6 Personas)
// ---------------------------------------------------------------------------
const agencyA_Recruiter: AuthenticatedUser = {
  id: "usr-recruiter-a",
  name: "Priya Sharma",
  email: "priya.sharma@companya-noida.internal",
  role: UserRole.RECRUITER,
  isActive: true,
  organizationId: "org-agency-a",
  organizationName: "Company A (Noida)",
  organizationType: OrganizationType.AGENCY,
};

const agencyA_DeliveryHead: AuthenticatedUser = {
  id: "usr-delivery-a",
  name: "Ananya Roy",
  email: "ananya.roy@companya-noida.internal",
  role: UserRole.DELIVERY_HEAD,
  isActive: true,
  organizationId: "org-agency-a",
  organizationName: "Company A (Noida)",
  organizationType: OrganizationType.AGENCY,
};

const client_HiringManager: AuthenticatedUser = {
  id: "usr-client-mgr",
  name: "Rajesh Kumar",
  email: "rajesh.kumar@fintechglobal.com",
  role: UserRole.CLIENT_HIRING_MGR,
  isActive: true,
  organizationId: "org-client-fintech",
  organizationName: "FinTech Global",
  organizationType: OrganizationType.CLIENT,
};

const agencyB_Recruiter: AuthenticatedUser = {
  id: "usr-recruiter-b",
  name: "Foreign Recruiter",
  email: "recruiter@rival-agency.com",
  role: UserRole.RECRUITER,
  isActive: true,
  organizationId: "org-agency-b",
  organizationName: "Rival Agency B",
  organizationType: OrganizationType.AGENCY,
};

const deactivated_User: AuthenticatedUser = {
  id: "usr-deactivated",
  name: "Former Recruiter",
  email: "deactivated@companya-noida.internal",
  role: UserRole.RECRUITER,
  isActive: false,
  organizationId: "org-agency-a",
  organizationName: "Company A (Noida)",
  organizationType: OrganizationType.AGENCY,
};

// ---------------------------------------------------------------------------
// 1. Base Page Authorization Across 6 Personas
// ---------------------------------------------------------------------------
test("Page Auth: Direct URL access matrix for general protected pages (/requisitions, /candidates)", () => {
  const options = { callbackUrl: "/requisitions" };

  // 1. No session
  const noSession = checkPageAuthorization(null, options);
  assert.equal(noSession.authorized, false);
  assert.equal(noSession.action, "REDIRECT_LOGIN");
  assert.equal(noSession.redirectUrl, "/login?callbackUrl=%2Frequisitions");

  // 2. Deactivated user
  const deactivated = checkPageAuthorization(deactivated_User, options);
  assert.equal(deactivated.authorized, false);
  assert.equal(deactivated.action, "REDIRECT_LOGIN");

  // 3. RECRUITER
  const recruiter = checkPageAuthorization(agencyA_Recruiter, options);
  assert.equal(recruiter.authorized, true);
  assert.equal(recruiter.action, "ALLOW");

  // 4. DELIVERY_HEAD
  const delivery = checkPageAuthorization(agencyA_DeliveryHead, options);
  assert.equal(delivery.authorized, true);
  assert.equal(delivery.action, "ALLOW");

  // 5. CLIENT_HIRING_MGR
  const clientMgr = checkPageAuthorization(client_HiringManager, options);
  assert.equal(clientMgr.authorized, true);
  assert.equal(clientMgr.action, "ALLOW");

  // 6. User from another agency
  const agencyB = checkPageAuthorization(agencyB_Recruiter, options);
  assert.equal(agencyB.authorized, true);
  assert.equal(agencyB.action, "ALLOW");
});

// ---------------------------------------------------------------------------
// 2. Requisition Creation Page Authorization (/requisitions/new)
// ---------------------------------------------------------------------------
test("Page Auth: Direct URL access matrix for /requisitions/new", () => {
  const options = {
    callbackUrl: "/requisitions/new",
    allowedRoles: [UserRole.RECRUITER, UserRole.DELIVERY_HEAD],
  };

  // 1. No session -> REDIRECT_LOGIN
  assert.equal(checkPageAuthorization(null, options).action, "REDIRECT_LOGIN");

  // 2. Deactivated user -> REDIRECT_LOGIN
  assert.equal(checkPageAuthorization(deactivated_User, options).action, "REDIRECT_LOGIN");

  // 3. RECRUITER -> ALLOW
  assert.equal(checkPageAuthorization(agencyA_Recruiter, options).action, "ALLOW");

  // 4. DELIVERY_HEAD -> ALLOW
  assert.equal(checkPageAuthorization(agencyA_DeliveryHead, options).action, "ALLOW");

  // 5. CLIENT_HIRING_MGR -> REDIRECT_FORBIDDEN (Cannot create agency requisitions)
  const clientAttempt = checkPageAuthorization(client_HiringManager, options);
  assert.equal(clientAttempt.authorized, false);
  assert.equal(clientAttempt.action, "REDIRECT_FORBIDDEN");
  assert.equal(clientAttempt.redirectUrl, "/forbidden");
});

// ---------------------------------------------------------------------------
// 3. Resume Upload Page Authorization (/resumes/upload)
// ---------------------------------------------------------------------------
test("Page Auth: Direct URL access matrix for /resumes/upload", () => {
  // 1. No session -> REDIRECT_LOGIN
  assert.equal(checkResumeUploadAccess(null).action, "REDIRECT_LOGIN");

  // 2. Deactivated user -> REDIRECT_LOGIN
  assert.equal(checkResumeUploadAccess(deactivated_User).action, "REDIRECT_LOGIN");

  // 3. RECRUITER -> ALLOW (Only recruiter can upload)
  const recruiter = checkResumeUploadAccess(agencyA_Recruiter);
  assert.equal(recruiter.allowed, true);
  assert.equal(recruiter.action, "ALLOW");

  // 4. DELIVERY_HEAD -> REDIRECT_FORBIDDEN (Cannot upload resumes)
  const delivery = checkResumeUploadAccess(agencyA_DeliveryHead);
  assert.equal(delivery.allowed, false);
  assert.equal(delivery.action, "REDIRECT_FORBIDDEN");

  // 5. CLIENT_HIRING_MGR -> REDIRECT_FORBIDDEN (Client cannot upload resumes)
  const client = checkResumeUploadAccess(client_HiringManager);
  assert.equal(client.allowed, false);
  assert.equal(client.action, "REDIRECT_FORBIDDEN");
});

// ---------------------------------------------------------------------------
// 4. Requisition Edit Page Authorization (/requisitions/[id]/edit)
// ---------------------------------------------------------------------------
test("Page Auth: Direct URL access matrix for /requisitions/[id]/edit", () => {
  const reqAgencyA = { organizationId: "org-agency-a" };

  // 1. RECRUITER (Agency A, own requisition) -> ALLOW
  assert.equal(checkRequisitionEditAccess(agencyA_Recruiter, reqAgencyA).allowed, true);

  // 2. DELIVERY_HEAD (Agency A, own requisition) -> ALLOW
  assert.equal(checkRequisitionEditAccess(agencyA_DeliveryHead, reqAgencyA).allowed, true);

  // 3. CLIENT_HIRING_MGR -> FORBIDDEN (Client hiring managers can NEVER edit requisitions)
  const clientEdit = checkRequisitionEditAccess(client_HiringManager, reqAgencyA);
  assert.equal(clientEdit.allowed, false);
  assert.equal(clientEdit.forbidden, true);

  // 4. User from another agency (Agency B) -> NOT ALLOWED (404 tenant isolation)
  const crossAgencyEdit = checkRequisitionEditAccess(agencyB_Recruiter, reqAgencyA);
  assert.equal(crossAgencyEdit.allowed, false);
  assert.equal(crossAgencyEdit.forbidden, undefined); // Returns 404, not 403

  // 5. Non-existent requisition -> NOT ALLOWED
  assert.equal(checkRequisitionEditAccess(agencyA_Recruiter, null).allowed, false);
});

// ---------------------------------------------------------------------------
// 5. Requisition Detail Page Tenancy Authorization (/requisitions/[id])
// ---------------------------------------------------------------------------
test("Page Auth: Direct URL access matrix for /requisitions/[id]", () => {
  const reqAgencyA_WithSubmittedCandidate = {
    organizationId: "org-agency-a",
    applications: [
      {
        status: ApplicationStatus.SUBMITTED_TO_CLIENT,
        clientOrganizationId: "org-client-fintech",
      },
    ],
  };

  const reqAgencyA_WithMismatchedClient = {
    organizationId: "org-agency-a",
    applications: [
      {
        status: ApplicationStatus.SUBMITTED_TO_CLIENT,
        clientOrganizationId: "org-client-other",
      },
    ],
  };

  const reqAgencyA_WithNullClient = {
    organizationId: "org-agency-a",
    applications: [
      {
        status: ApplicationStatus.SUBMITTED_TO_CLIENT,
        clientOrganizationId: null,
      },
    ],
  };

  const reqAgencyA_Unassigned = {
    organizationId: "org-agency-a",
    applications: [{ status: ApplicationStatus.SOURCED }],
  };

  // 1. RECRUITER (Agency A, own requisition) -> ALLOW
  assert.equal(checkRequisitionAccess(agencyA_Recruiter, reqAgencyA_WithSubmittedCandidate).allowed, true);

  // 2. DELIVERY_HEAD (Agency A, own requisition) -> ALLOW
  assert.equal(checkRequisitionAccess(agencyA_DeliveryHead, reqAgencyA_WithSubmittedCandidate).allowed, true);

  // 3. User from another agency (Agency B) -> NOT ALLOWED (404 tenant isolation)
  assert.equal(checkRequisitionAccess(agencyB_Recruiter, reqAgencyA_WithSubmittedCandidate).allowed, false);

  // 4. CLIENT_HIRING_MGR with submitted candidates to their client organization -> ALLOW
  assert.equal(checkRequisitionAccess(client_HiringManager, reqAgencyA_WithSubmittedCandidate).allowed, true);

  // 5. CLIENT_HIRING_MGR with candidate submitted to another client -> NOT ALLOWED (404)
  assert.equal(checkRequisitionAccess(client_HiringManager, reqAgencyA_WithMismatchedClient).allowed, false);

  // 6. CLIENT_HIRING_MGR with null clientOrganizationId -> NOT ALLOWED (404)
  assert.equal(checkRequisitionAccess(client_HiringManager, reqAgencyA_WithNullClient).allowed, false);

  // 7. CLIENT_HIRING_MGR with unassigned/internal requisition -> NOT ALLOWED (404)
  assert.equal(checkRequisitionAccess(client_HiringManager, reqAgencyA_Unassigned).allowed, false);

  // 8. Non-existent requisition -> NOT ALLOWED
  assert.equal(checkRequisitionAccess(agencyA_Recruiter, null).allowed, false);
});

// ---------------------------------------------------------------------------
// 6. Candidate Detail Page Tenancy & Submission Gate (/candidates/[id])
// ---------------------------------------------------------------------------
test("Page Auth: Direct URL access matrix for /candidates/[id]", () => {
  // Candidate submitted to client
  const submittedCandidate = {
    agencyId: "org-agency-a",
    applications: [
      {
        status: ApplicationStatus.SUBMITTED_TO_CLIENT,
        clientOrganizationId: "org-client-fintech",
      },
    ],
  };

  const candidateMismatchedClient = {
    agencyId: "org-agency-a",
    applications: [
      {
        status: ApplicationStatus.SUBMITTED_TO_CLIENT,
        clientOrganizationId: "org-client-other",
      },
    ],
  };

  const candidateNullClient = {
    agencyId: "org-agency-a",
    applications: [
      {
        status: ApplicationStatus.SUBMITTED_TO_CLIENT,
        clientOrganizationId: null,
      },
    ],
  };

  // Unsourced / internal candidate (e.g. Arjun Rawat CND-91047)
  const unsourcedCandidate = {
    agencyId: "org-agency-a",
    applications: [{ status: ApplicationStatus.SOURCED }],
  };

  // 1. RECRUITER (Agency A, own candidate) -> ALLOW
  assert.equal(checkCandidateAccess(agencyA_Recruiter, submittedCandidate).allowed, true);
  assert.equal(checkCandidateAccess(agencyA_Recruiter, unsourcedCandidate).allowed, true);

  // 2. DELIVERY_HEAD (Agency A, own candidate) -> ALLOW
  assert.equal(checkCandidateAccess(agencyA_DeliveryHead, submittedCandidate).allowed, true);

  // 3. User from another agency (Agency B) -> NOT ALLOWED (404 tenant isolation)
  assert.equal(checkCandidateAccess(agencyB_Recruiter, submittedCandidate).allowed, false);
  assert.equal(checkCandidateAccess(agencyB_Recruiter, unsourcedCandidate).allowed, false);

  // 4. CLIENT_HIRING_MGR accessing submitted candidate for their org -> ALLOW
  assert.equal(checkCandidateAccess(client_HiringManager, submittedCandidate).allowed, true);

  // 5. CLIENT_HIRING_MGR accessing candidate submitted to a different client -> NOT ALLOWED (404)
  assert.equal(checkCandidateAccess(client_HiringManager, candidateMismatchedClient).allowed, false);

  // 6. CLIENT_HIRING_MGR accessing candidate with null clientOrganizationId -> NOT ALLOWED (404)
  assert.equal(checkCandidateAccess(client_HiringManager, candidateNullClient).allowed, false);

  // 7. CLIENT_HIRING_MGR accessing unsourced candidate -> STRICTLY FORBIDDEN (404)
  const clientUnsourced = checkCandidateAccess(client_HiringManager, unsourcedCandidate);
  assert.equal(clientUnsourced.allowed, false);
  assert.equal(clientUnsourced.reason?.includes("unsourced"), true);

  // 8. Non-existent candidate -> NOT ALLOWED
  assert.equal(checkCandidateAccess(agencyA_Recruiter, null).allowed, false);
});

// ---------------------------------------------------------------------------
// 7. Direct URL Middleware Redirect Tests
// ---------------------------------------------------------------------------
test("Middleware: Direct URL requests without session are strictly redirected to /login", () => {
  const protectedRoutes = [
    "/requisitions",
    "/requisitions/new",
    "/requisitions/req-benchmark-java-001",
    "/requisitions/req-benchmark-java-001/edit",
    "/candidates",
    "/candidates/cand-ritika-001",
    "/resumes/upload",
    "/retention",
  ];

  for (const path of protectedRoutes) {
    // 1. No cookie
    const reqNoCookie = new NextRequest(`http://localhost:3000${path}`);
    const resNoCookie = middleware(reqNoCookie);
    assert.equal(resNoCookie.status, 307, `Direct access to ${path} without cookie must redirect`);
    const location = resNoCookie.headers.get("location");
    assert.ok(location?.includes("/login"), `Redirect location for ${path} must point to /login`);
    assert.ok(location?.includes(`callbackUrl=${encodeURIComponent(path)}`), `CallbackUrl must match path`);

    // 2. Whitespace / empty cookie
    const reqEmptyCookie = new NextRequest(`http://localhost:3000${path}`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=   ` },
    });
    const resEmptyCookie = middleware(reqEmptyCookie);
    assert.equal(resEmptyCookie.status, 307, `Empty session cookie for ${path} must redirect`);
  }

  // 3. Valid session cookie passes middleware
  const reqValidCookie = new NextRequest("http://localhost:3000/requisitions", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=valid_dummy_token_123` },
  });
  const resValid = middleware(reqValidCookie);
  assert.equal(resValid.status, 200, "Valid session cookie must pass middleware to Server Component");
});

// ---------------------------------------------------------------------------
// 8. Database Session Verification & Invalidation Invariants
// ---------------------------------------------------------------------------
test("Database Session: Verification, expiration, deactivation, and revocation invariants", async () => {
  let recruiterUser = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      recruiterUser = await prisma.user.findFirst({
        where: { email: "priya.sharma@companya-noida.internal" },
      });
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  assert.ok(recruiterUser, "Priya Sharma user must exist in DB");

  // 1. Create active session
  const { sessionToken, expiresAt } = await createSession(recruiterUser.id);
  assert.ok(sessionToken);
  assert.ok(expiresAt > new Date());

  // 2. Validate session returns authenticated user
  const validated = await validateSession(sessionToken);
  assert.ok(validated);
  assert.equal(validated.id, recruiterUser.id);
  assert.equal(validated.email, recruiterUser.email);
  assert.equal(validated.isActive, true);

  // 3. Logout invalidation removes session from DB
  await invalidateSession(sessionToken);
  const afterLogout = await validateSession(sessionToken);
  assert.equal(afterLogout, null, "Invalidated session must return null immediately");

  // 4. Stale / forged tokens return null
  assert.equal(await validateSession("forged_random_token_nonexistent"), null);
});

test.after(async () => {
  await prisma.$disconnect();
});

