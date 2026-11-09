import test from "node:test";
import assert from "node:assert/strict";
import { OrganizationType, UserRole, RequisitionStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import {
  verifyCredentials,
  createSession,
  validateSession,
  invalidateSession,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { middleware } from "../src/middleware";
import { POST as loginRoute } from "../src/app/api/auth/login/route";
import { POST as logoutRoute } from "../src/app/api/auth/logout/route";
import { GET as meRoute } from "../src/app/api/auth/me/route";
import { GET as listRequisitionsRoute, POST as createRequisitionRoute } from "../src/app/api/requisitions/route";
import { GET as getRequisitionRoute, PATCH as patchRequisitionRoute, DELETE as deleteRequisitionRoute } from "../src/app/api/requisitions/[id]/route";
import { PUT as updateScorecardRoute } from "../src/app/api/requisitions/[id]/scorecard/route";
import { GET as listCandidatesRoute } from "../src/app/api/candidates/route";
import { GET as getCandidateRoute } from "../src/app/api/candidates/[id]/route";
import { GET as downloadDocumentRoute } from "../src/app/api/documents/[id]/download/route";
import { GET as getBatchJobRoute } from "../src/app/api/batch-jobs/[id]/route";
import { POST as uploadResumesRoute } from "../src/app/api/resumes/upload/route";


// Helper to create authenticated NextRequest with session cookie and same-origin headers
function createAuthenticatedRequest(
  url: string,
  sessionToken: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): NextRequest {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", `${SESSION_COOKIE_NAME}=${sessionToken}`);
  if (!headers.has("origin")) {
    headers.set("origin", "http://localhost:3000");
  }
  if (!headers.has("host")) {
    headers.set("host", "localhost:3000");
  }
  if (options.body && typeof options.body === "object") {
    headers.set("content-type", "application/json");
  }

  const reqInit: RequestInit = {
    method: options.method || "GET",
    headers,
  };

  if (options.body) {
    reqInit.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), reqInit as any);
}

// ---------------------------------------------------------------------------
// 1. Authentication Engine Tests
// ---------------------------------------------------------------------------
test("Auth: Password verification rejects invalid password and non-existent email", async () => {
  const badPasswordUser = await verifyCredentials(
    "priya.sharma@companya-noida.internal",
    "WrongPassword123!"
  );
  assert.equal(badPasswordUser, null, "Invalid password must return null");

  const nonExistentUser = await verifyCredentials(
    "ghost.user@doesnotexist.internal",
    "AnyPassword123!"
  );
  assert.equal(nonExistentUser, null, "Non-existent user must return null");
});

test("Auth: Password verification succeeds for valid credentials and never returns passwordHash", async () => {
  // Support either rotated production password or initial seed password
  let validUser = await verifyCredentials(
    "priya.sharma@companya-noida.internal",
    "TL-hoJnupFKWoC03VEu!2026"
  );
  if (!validUser) {
    validUser = await verifyCredentials(
      "priya.sharma@companya-noida.internal",
      "TalentLens2026!Demo"
    );
  }
  assert.ok(validUser, "Valid credentials must return authenticated user");
  assert.equal(validUser.email, "priya.sharma@companya-noida.internal");
  assert.equal(validUser.role, UserRole.RECRUITER);
  assert.equal((validUser as any).passwordHash, undefined, "passwordHash must NEVER be exposed");
});

test("Auth: Session lifecycle — creation, DB validation, expiry, and revocation", async () => {
  const recruiter = await prisma.user.findFirst({
    where: { email: "priya.sharma@companya-noida.internal" },
  });
  assert.ok(recruiter);

  // 1. Create session
  const { sessionToken, expiresAt } = await createSession(recruiter.id);
  assert.ok(sessionToken && sessionToken.length >= 32);
  assert.ok(expiresAt > new Date());

  // 2. Validate session
  const validated = await validateSession(sessionToken);
  assert.ok(validated);
  assert.equal(validated.id, recruiter.id);
  assert.equal(validated.role, UserRole.RECRUITER);

  // 3. Test explicit revocation (logout)
  await invalidateSession(sessionToken);
  const afterRevoke = await validateSession(sessionToken);
  assert.equal(afterRevoke, null, "Revoked session must return null");

  // 4. Test expired session
  const expiredSession = await prisma.session.create({
    data: {
      userId: recruiter.id,
      sessionToken: "test-expired-token-" + Date.now(),
      expiresAt: new Date(Date.now() - 1000), // In the past
    },
  });
  const afterExpired = await validateSession(expiredSession.sessionToken);
  assert.equal(afterExpired, null, "Expired session must return null");
});

test("Auth API: POST /api/auth/login, /me, and /logout flow", async () => {
  // 1. Invalid login
  const badLoginReq = new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "http://localhost:3000",
      "host": "localhost:3000",
    },
    body: JSON.stringify({
      email: "priya.sharma@companya-noida.internal",
      password: "WrongPassword!",
    }),
  });
  const badLoginRes = await loginRoute(badLoginReq);
  assert.equal(badLoginRes.status, 401);
  const badLoginJson = await badLoginRes.json();
  assert.equal(badLoginJson.success, false);
  assert.equal(badLoginJson.error, "Invalid email or password.");

  // 2. Valid login establishes session and sets HttpOnly cookie
  const activePassword = (await verifyCredentials("priya.sharma@companya-noida.internal", "TL-hoJnupFKWoC03VEu!2026"))
    ? "TL-hoJnupFKWoC03VEu!2026"
    : "TalentLens2026!Demo";

  const goodLoginReq = new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "http://localhost:3000",
      "host": "localhost:3000",
    },
    body: JSON.stringify({
      email: "priya.sharma@companya-noida.internal",
      password: activePassword,
    }),
  });
  const goodLoginRes = await loginRoute(goodLoginReq);
  assert.equal(goodLoginRes.status, 200);
  const goodLoginJson = await goodLoginRes.json();
  assert.equal(goodLoginJson.success, true);
  assert.equal(goodLoginJson.data.role, UserRole.RECRUITER);
  assert.equal(goodLoginJson.data.passwordHash, undefined);

  const cookieHeader = goodLoginRes.headers.get("set-cookie");
  assert.ok(cookieHeader && cookieHeader.includes(SESSION_COOKIE_NAME));
  assert.ok(cookieHeader.includes("HttpOnly"));
  assert.ok(/samesite=lax/i.test(cookieHeader), "Cookie must have SameSite=lax attribute");

  // Extract session token
  const tokenMatch = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  assert.ok(tokenMatch && tokenMatch[1]);
  const sessionToken = tokenMatch[1];

  // 3. GET /api/auth/me with valid session
  const meReq = createAuthenticatedRequest("http://localhost:3000/api/auth/me", sessionToken);
  const meRes = await meRoute(meReq);
  assert.equal(meRes.status, 200);
  const meJson = await meRes.json();
  assert.equal(meJson.data.email, "priya.sharma@companya-noida.internal");

  // 4. GET /api/auth/me without session returns 401
  const unauthMeReq = new NextRequest("http://localhost:3000/api/auth/me");
  const unauthMeRes = await meRoute(unauthMeReq);
  assert.equal(unauthMeRes.status, 401);

  // 5. POST /api/auth/logout invalidates session
  const logoutReq = createAuthenticatedRequest("http://localhost:3000/api/auth/logout", sessionToken, {
    method: "POST",
  });
  const logoutRes = await logoutRoute(logoutReq);
  assert.equal(logoutRes.status, 200);

  // 6. Validating session after logout fails
  const afterLogout = await validateSession(sessionToken);
  assert.equal(afterLogout, null);
});

test("Auth API: Demo quick-fill succeeds in test/dev and is blocked in production mode", async () => {
  // 1. In test environment, demo quick-fill establishes session without exposing passwords
  const devDemoReq = new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "http://localhost:3000",
      "host": "localhost:3000",
    },
    body: JSON.stringify({
      email: "priya.sharma@companya-noida.internal",
      isDemoQuickFill: true,
    }),
  });
  const devDemoRes = await loginRoute(devDemoReq);
  assert.equal(devDemoRes.status, 200, "Demo quick-fill must succeed in test/dev environment");
  const devDemoJson = await devDemoRes.json();
  assert.equal(devDemoJson.success, true);
  assert.equal(devDemoJson.data.role, UserRole.RECRUITER);

  // 2. In simulated production mode, demo quick-fill is strictly restricted to approved personas
  const prevEnv = process.env.NODE_ENV;
  try {
    (process.env as any).NODE_ENV = "production";

    // Non-approved account must return 403 Forbidden
    const unapprovedDemoReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://localhost:3000",
        "host": "localhost:3000",
      },
      body: JSON.stringify({
        email: "unauthorized.user@companya-noida.internal",
        isDemoQuickFill: true,
      }),
    });
    const unapprovedDemoRes = await loginRoute(unapprovedDemoReq);
    assert.equal(unapprovedDemoRes.status, 403, "Unapproved persona quick-fill must return 403 Forbidden");

    // Approved evaluation persona succeeds with dedicated role and redirect
    const prodDemoReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://localhost:3000",
        "host": "localhost:3000",
      },
      body: JSON.stringify({
        email: "priya.sharma@companya-noida.internal",
        isDemoQuickFill: true,
      }),
    });
    const prodDemoRes = await loginRoute(prodDemoReq);
    assert.equal(prodDemoRes.status, 200, "Approved evaluation persona must succeed in production");
    const prodDemoJson = await prodDemoRes.json();
    assert.equal(prodDemoJson.success, true);
    assert.equal(prodDemoJson.data.role, UserRole.RECRUITER);
    assert.equal(prodDemoJson.data.defaultRedirect, "/requisitions");

    // 3. In production mode, verifyCredentials strictly rejects default seeded demo credentials
    const prodCredentialCheck = await verifyCredentials(
      "priya.sharma@companya-noida.internal",
      "TalentLens2026!Demo"
    );
    assert.equal(
      prodCredentialCheck,
      null,
      "Seeded demo credentials must NEVER authenticate in production"
    );
  } finally {
    (process.env as any).NODE_ENV = prevEnv;
  }
});

// ---------------------------------------------------------------------------
// 2. Role-Based Access Control (RBAC) Tests
// ---------------------------------------------------------------------------
test("RBAC: Client Hiring Manager is forbidden from recruiter operations", async () => {
  const clientUser = await prisma.user.findFirst({
    where: { email: "rajesh.kumar@fintechglobal.com" },
  });
  assert.ok(clientUser);

  const { sessionToken } = await createSession(clientUser.id);

  try {
    // 1. Client hiring manager cannot create requisition -> 403 Forbidden
    const createReq = createAuthenticatedRequest(
      "http://localhost:3000/api/requisitions",
      sessionToken,
      {
        method: "POST",
        body: {
          title: "Malicious Requisition by Client Mgr",
          jobDescription: "This should fail because client managers cannot create agency requisitions.",
        },
      }
    );
    const createRes = await createRequisitionRoute(createReq);
    assert.equal(createRes.status, 403, "Client manager cannot create requisitions");

    // 2. Client hiring manager cannot alter scorecard criteria -> 403 Forbidden
    const benchmarkReq = await prisma.requisition.findFirst({
      where: { title: "Senior Java Developer" },
    });
    assert.ok(benchmarkReq);

    const scorecardReq = createAuthenticatedRequest(
      `http://localhost:3000/api/requisitions/${benchmarkReq.id}/scorecard`,
      sessionToken,
      {
        method: "PUT",
        body: {
          criteria: [{ name: "Hacked Criterion", weight: 100 }],
        },
      }
    );
    const scorecardRes = await updateScorecardRoute(scorecardReq, {
      params: Promise.resolve({ id: benchmarkReq.id }),
    });
    assert.equal(scorecardRes.status, 403, "Client manager cannot update scorecard");

    // 3. Client hiring manager cannot upload resumes -> 403 Forbidden
    const uploadReq = createAuthenticatedRequest(
      "http://localhost:3000/api/resumes/upload",
      sessionToken,
      {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=---test" },
      }
    );
    const uploadRes = await uploadResumesRoute(uploadReq);
    assert.equal(uploadRes.status, 403, "Client manager cannot upload resumes");
  } finally {
    await invalidateSession(sessionToken);
  }
});

test("RBAC: Delivery Head has administrative view but cannot upload resumes", async () => {
  const deliveryHead = await prisma.user.findFirst({
    where: { email: "ananya.roy@companya-noida.internal" },
  });
  assert.ok(deliveryHead);

  const { sessionToken } = await createSession(deliveryHead.id);

  try {
    // Delivery Head cannot upload resumes -> 403 Forbidden
    const uploadReq = createAuthenticatedRequest(
      "http://localhost:3000/api/resumes/upload",
      sessionToken,
      {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=---test" },
      }
    );
    const uploadRes = await uploadResumesRoute(uploadReq);
    assert.equal(uploadRes.status, 403, "Delivery head cannot upload resumes");

    // Delivery Head CAN view agency requisitions -> 200 OK
    const listReq = createAuthenticatedRequest(
      "http://localhost:3000/api/requisitions",
      sessionToken
    );
    const listRes = await listRequisitionsRoute(listReq);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.success, true);
  } finally {
    await invalidateSession(sessionToken);
  }
});

// ---------------------------------------------------------------------------
// 3. Multi-Tenant Isolation Tests
// ---------------------------------------------------------------------------
test("Tenant Isolation: Cross-agency reading, downloading, and tampering is strictly prevented", async () => {
  // Create an isolated secondary Agency B and its Recruiter
  const agencyB = await prisma.organization.create({
    data: {
      name: "Agency B Tech Recruiters (Bengaluru)",
      type: OrganizationType.AGENCY,
    },
  });

  const recruiterB = await prisma.user.create({
    data: {
      name: "Vikram Sen",
      email: `vikram.sen.${Date.now()}@agencyb-bengaluru.internal`,
      role: UserRole.RECRUITER,
      organizationId: agencyB.id,
      passwordHash: await bcrypt.hash("DemoPassword123!", 10),
    },
  });

  // Create isolated Requisition for Agency B
  const reqB = await prisma.requisition.create({
    data: {
      title: "Agency B Secret Python Lead",
      jobDescription: "Confidential Python Architect requisition for Bengaluru client.",
      organizationId: agencyB.id,
      createdById: recruiterB.id,
      status: RequisitionStatus.ACTIVE,
    },
  });

  // Create isolated Candidate & Document for Agency B
  const candidateB = await prisma.candidate.create({
    data: {
      candidateReference: `CND-TST-${Date.now().toString().slice(-5)}`,
      agencyId: agencyB.id,
      fullName: "Deepak Sharma (Agency B Candidate)",
      currentRole: "Python Architect",
    },
  });

  const docB = await prisma.uploadedDocument.create({
    data: {
      agencyId: agencyB.id,
      candidateId: candidateB.id,
      fileName: "deepak-cv.pdf",
      fileType: "application/pdf",
      storageKey: "test-storage-key-b",
      fileHash: "sha256-dummy-hash-agency-b-" + Date.now(),
    },
  });

  // Create isolated Batch Job for Agency B
  const batchB = await prisma.batchUploadJob.create({
    data: {
      agencyId: agencyB.id,
      requisitionId: reqB.id,
      totalFiles: 1,
    },
  });

  // Log in as Agency A Recruiter (Priya Sharma)
  const recruiterA = await prisma.user.findFirst({
    where: { email: "priya.sharma@companya-noida.internal" },
  });
  assert.ok(recruiterA);

  const { sessionToken: tokenA } = await createSession(recruiterA.id);

  try {
    // Test 1: Agency A listing requisitions does NOT include Agency B requisition
    const listReqsReq = createAuthenticatedRequest(
      "http://localhost:3000/api/requisitions",
      tokenA
    );
    const listReqsRes = await listRequisitionsRoute(listReqsReq);
    assert.equal(listReqsRes.status, 200);
    const listReqsJson = await listReqsRes.json();
    const foundBInList = listReqsJson.data.some((r: any) => r.id === reqB.id);
    assert.equal(foundBInList, false, "Agency A must NOT see Agency B requisition in list");

    // Test 2: IDOR attack — Agency A directly fetching Agency B requisition by ID returns 404
    const getReqBReq = createAuthenticatedRequest(
      `http://localhost:3000/api/requisitions/${reqB.id}`,
      tokenA
    );
    const getReqBRes = await getRequisitionRoute(getReqBReq, {
      params: Promise.resolve({ id: reqB.id }),
    });
    assert.equal(getReqBRes.status, 404, "Agency A direct fetch of Agency B requisition must return 404");

    // Test 3: IDOR attack — Agency A modifying Agency B requisition returns 404
    const patchReqBReq = createAuthenticatedRequest(
      `http://localhost:3000/api/requisitions/${reqB.id}`,
      tokenA,
      {
        method: "PATCH",
        body: { title: "Hijacked by Agency A" },
      }
    );
    const patchReqBRes = await patchRequisitionRoute(patchReqBReq, {
      params: Promise.resolve({ id: reqB.id }),
    });
    assert.equal(patchReqBRes.status, 404, "Agency A cannot modify Agency B requisition");

    // Test 4: Agency A listing candidates does NOT include Agency B candidate
    const listCandsReq = createAuthenticatedRequest(
      "http://localhost:3000/api/candidates",
      tokenA
    );
    const listCandsRes = await listCandidatesRoute(listCandsReq);
    assert.equal(listCandsRes.status, 200);
    const listCandsJson = await listCandsRes.json();
    const foundCandidateB = listCandsJson.data.some((c: any) => c.id === candidateB.id);
    assert.equal(foundCandidateB, false, "Agency A must NOT see Agency B candidate");

    // Test 5: IDOR attack — Agency A fetching Agency B candidate dossier returns 404
    const getCandBReq = createAuthenticatedRequest(
      `http://localhost:3000/api/candidates/${candidateB.id}`,
      tokenA
    );
    const getCandBRes = await getCandidateRoute(getCandBReq, {
      params: Promise.resolve({ id: candidateB.id }),
    });
    assert.equal(getCandBRes.status, 404, "Agency A direct fetch of Agency B candidate must return 404");

    // Test 6: IDOR attack — Agency A downloading Agency B document returns 404
    const getDocBReq = createAuthenticatedRequest(
      `http://localhost:3000/api/documents/${docB.id}/download`,
      tokenA
    );
    const getDocBRes = await downloadDocumentRoute(getDocBReq, {
      params: Promise.resolve({ id: docB.id }),
    });
    assert.equal(getDocBRes.status, 404, "Agency A cannot download Agency B document");

    // Test 7: IDOR attack — Agency A inspecting Agency B batch job returns 404
    const getBatchBReq = createAuthenticatedRequest(
      `http://localhost:3000/api/batch-jobs/${batchB.id}`,
      tokenA
    );
    const getBatchBRes = await getBatchJobRoute(getBatchBReq, {
      params: Promise.resolve({ id: batchB.id }),
    });
    assert.equal(getBatchBRes.status, 404, "Agency A cannot inspect Agency B batch job");

    // Test 8: Tampering test — Sending spoofed organizationId in body does NOT hijack tenancy
    const spoofReq = createAuthenticatedRequest(
      "http://localhost:3000/api/requisitions",
      tokenA,
      {
        method: "POST",
        body: {
          title: "Spoofed Requisition Attempt",
          jobDescription: "Attempting to assign requisition to Agency B via payload property.",
          organizationId: agencyB.id, // Attacker tries to inject Agency B ID
        },
      }
    );
    const spoofRes = await createRequisitionRoute(spoofReq);
    assert.equal(spoofRes.status, 201);
    const spoofJson = await spoofRes.json();
    // Server must strictly assign caller's authenticated organization, ignoring body
    assert.equal(
      spoofJson.data.organizationId,
      recruiterA.organizationId,
      "Server MUST ignore spoofed organizationId in request body"
    );

    // Clean up created spoof requisition
    await prisma.requisition.delete({ where: { id: spoofJson.data.id } });
  } finally {
    await invalidateSession(tokenA);

    // Clean up temporary Agency B fixtures
    await prisma.batchUploadJob.deleteMany({ where: { agencyId: agencyB.id } });
    await prisma.uploadedDocument.deleteMany({ where: { agencyId: agencyB.id } });
    await prisma.candidate.deleteMany({ where: { agencyId: agencyB.id } });
    await prisma.requisition.deleteMany({ where: { organizationId: agencyB.id } });
    await prisma.user.deleteMany({ where: { organizationId: agencyB.id } });
    await prisma.organization.delete({ where: { id: agencyB.id } });
  }
});

test("Tenant Isolation: Client cannot access unsubmitted candidates and contact info is masked", async () => {
  const clientUser = await prisma.user.findFirst({
    where: { email: "rajesh.kumar@fintechglobal.com" },
  });
  assert.ok(clientUser);

  const { sessionToken } = await createSession(clientUser.id);

  try {
    // SOURCED candidate Arjun Rawat (CND-91047) is unsubmitted to client
    const arjun = await prisma.candidate.findUnique({
      where: { candidateReference: "CND-91047" },
    });
    assert.ok(arjun);

    // Client queries candidates: unsubmitted candidate must NOT appear in results
    const clientListReq = createAuthenticatedRequest(
      "http://localhost:3000/api/candidates",
      sessionToken
    );
    const clientListRes = await listCandidatesRoute(clientListReq);
    assert.equal(clientListRes.status, 200);
    const clientListJson = await clientListRes.json();
    const foundUnsubmitted = clientListJson.data.some(
      (c: any) => c.candidateReference === "CND-91047"
    );
    assert.equal(foundUnsubmitted, false, "Client manager must NOT see unsubmitted candidates");

    // Client directly requesting unsubmitted candidate dossier by ID returns 404
    const getDirectReq = createAuthenticatedRequest(
      `http://localhost:3000/api/candidates/${arjun.id}`,
      sessionToken
    );
    const getDirectRes = await getCandidateRoute(getDirectReq, {
      params: Promise.resolve({ id: arjun.id }),
    });
    assert.equal(getDirectRes.status, 404, "Client direct lookup of unsubmitted candidate must return 404");
  } finally {
    await invalidateSession(sessionToken);
  }
});

// ---------------------------------------------------------------------------
// 4. CSRF Protection Tests (Milestone 2.1)
// ---------------------------------------------------------------------------
test("CSRF Protection: Rejects cross-origin state-changing requests", async () => {
  const recruiter = await prisma.user.findFirst({
    where: { email: "priya.sharma@companya-noida.internal" },
  });
  assert.ok(recruiter);

  const { sessionToken } = await createSession(recruiter.id);

  try {
    // 1. POST /api/requisitions with untrusted cross-origin
    const csrfPostReq = createAuthenticatedRequest(
      "http://localhost:3000/api/requisitions",
      sessionToken,
      {
        method: "POST",
        headers: {
          origin: "https://malicious-attacker.com",
          host: "localhost:3000",
        },
        body: {
          title: "CSRF Forged Requisition",
          jobDescription: "Should be blocked by CSRF origin verification.",
        },
      }
    );
    const csrfPostRes = await createRequisitionRoute(csrfPostReq);
    assert.equal(csrfPostRes.status, 403, "Cross-origin POST must be rejected with 403 Forbidden");

    // 2. PATCH /api/requisitions/[id] with untrusted cross-origin
    const existingReq = await prisma.requisition.findFirst({
      where: { organizationId: recruiter.organizationId },
    });
    assert.ok(existingReq);

    const csrfPatchReq = createAuthenticatedRequest(
      `http://localhost:3000/api/requisitions/${existingReq.id}`,
      sessionToken,
      {
        method: "PATCH",
        headers: {
          origin: "https://evil-site.org",
          host: "localhost:3000",
        },
        body: { title: "Hacked Title" },
      }
    );
    const csrfPatchRes = await patchRequisitionRoute(csrfPatchReq, {
      params: Promise.resolve({ id: existingReq.id }),
    });
    assert.equal(csrfPatchRes.status, 403, "Cross-origin PATCH must be rejected with 403 Forbidden");

    // 3. DELETE /api/requisitions/[id] with untrusted cross-origin
    const csrfDeleteReq = createAuthenticatedRequest(
      `http://localhost:3000/api/requisitions/${existingReq.id}`,
      sessionToken,
      {
        method: "DELETE",
        headers: {
          origin: "https://malicious-hacker.io",
          host: "localhost:3000",
        },
      }
    );
    const csrfDeleteRes = await deleteRequisitionRoute(csrfDeleteReq, {
      params: Promise.resolve({ id: existingReq.id }),
    });
    assert.equal(csrfDeleteRes.status, 403, "Cross-origin DELETE must be rejected with 403 Forbidden");
  } finally {
    await invalidateSession(sessionToken);
  }
});

// ---------------------------------------------------------------------------
// 5. Deactivated User Tests (Milestone 2.1)
// ---------------------------------------------------------------------------
test("Deactivated Users: Inactive accounts cannot authenticate or continue existing sessions", async () => {
  const agency = await prisma.organization.findFirst({ where: { type: OrganizationType.AGENCY } });
  assert.ok(agency);

  // Create temporary user that is deactivated (isActive: false)
  const inactiveUser = await prisma.user.create({
    data: {
      name: "Deactivated Recruiter",
      email: `inactive.recruiter.${Date.now()}@companya-noida.internal`,
      role: UserRole.RECRUITER,
      organizationId: agency.id,
      isActive: false,
      passwordHash: await bcrypt.hash("DemoPassword123!", 10),
    },
  });

  try {
    // 1. Password verification for deactivated user must return null
    const loginAttempt = await verifyCredentials(inactiveUser.email, "DemoPassword123!");
    assert.equal(loginAttempt, null, "Deactivated user must NOT be verified by verifyCredentials");

    // 2. Active session for deactivated user must immediately be rejected by validateSession
    const { sessionToken } = await createSession(inactiveUser.id);
    const validated = await validateSession(sessionToken);
    assert.equal(validated, null, "validateSession must return null for inactive user");

    // 3. API request using session of deactivated user must return 401
    const meReq = createAuthenticatedRequest("http://localhost:3000/api/auth/me", sessionToken);
    const meRes = await meRoute(meReq);
    assert.equal(meRes.status, 401, "API request for deactivated user session must return 401");

    await invalidateSession(sessionToken);
  } finally {
    await prisma.session.deleteMany({ where: { userId: inactiveUser.id } });
    await prisma.user.delete({ where: { id: inactiveUser.id } });
  }
});

// ---------------------------------------------------------------------------
// 6. Login Abuse Protection / Rate Limiting Tests (Milestone 2.1)
// ---------------------------------------------------------------------------
test("Login Abuse Protection: Enforces rate limit after repeated failures", async () => {
  const targetEmail = `brute.target.${Date.now()}@companya-noida.internal`;
  const ip = "192.168.1.100";

  try {
    // Execute 5 consecutive failed login attempts
    for (let i = 0; i < 5; i++) {
      const failedReq = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": "http://localhost:3000",
          "host": "localhost:3000",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({
          email: targetEmail,
          password: `BadPassword${i}`,
        }),
      });
      const res = await loginRoute(failedReq);
      assert.equal(res.status, 401, `Attempt ${i + 1} should return 401`);
    }

    // 6th attempt must be blocked by rate limiter with 429 Too Many Requests
    const blockedReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://localhost:3000",
        "host": "localhost:3000",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        email: targetEmail,
        password: "BadPassword6",
      }),
    });
    const blockedRes = await loginRoute(blockedReq);
    assert.equal(blockedRes.status, 429, "6th failed attempt must be rate-limited with 429");
    const blockedJson = await blockedRes.json();
    assert.equal(blockedJson.error, "Too many failed login attempts. Please try again later.");
  } finally {
    await prisma.loginAttempt.deleteMany({ where: { email: targetEmail } });
    await prisma.loginAttempt.deleteMany({ where: { ip } });
  }
});

// ---------------------------------------------------------------------------
// 7. Page & Direct URL Middleware Protection Tests (Milestone 2.1)
// ---------------------------------------------------------------------------
test("Page Protection: Middleware redirects unauthenticated requests to login", async () => {
  const protectedPaths = ["/requisitions", "/candidates", "/resumes/upload", "/requisitions/new"];

  for (const path of protectedPaths) {
    const unauthReq = new NextRequest(`http://localhost:3000${path}`);
    const res = middleware(unauthReq);
    assert.equal(res.status, 307, `Unauthenticated access to ${path} must redirect`);
    const location = res.headers.get("location");
    assert.ok(location && location.includes("/login"), `Redirect location must point to /login for ${path}`);
    assert.ok(location.includes(`callbackUrl=${encodeURIComponent(path)}`));
  }

  // Request with valid session cookie passes through
  const authReq = new NextRequest("http://localhost:3000/requisitions", {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=valid-dummy-token-sample-string-123`,
    },
  });
  const authRes = middleware(authReq);
  assert.equal(authRes.status, 200, "Authenticated request must be passed through by middleware");
});

// ---------------------------------------------------------------------------
// 8. Exact Candidate Fixture Attributes Verification (Milestone 2.1)
// ---------------------------------------------------------------------------
test("Candidate Fixtures: Validates exact required skills without invented additions", async () => {
  let fixtures: any[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fixtures = await prisma.candidate.findMany({
        where: { isFixture: true },
        select: {
          candidateReference: true,
          fullName: true,
          currentRole: true,
          experienceYears: true,
          noticeDays: true,
          keySkills: true,
        },
      });
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  assert.equal(fixtures.length, 3, "Exactly 3 fixtures must exist");

  // 1. Ritika Bansal (CND-91022)
  const ritika = fixtures.find((f: any) => f.candidateReference === "CND-91022");
  assert.ok(ritika);
  assert.equal(ritika.fullName, "Ritika Bansal");
  assert.equal(ritika.currentRole, "Senior Java Developer");
  assert.equal(ritika.experienceYears, 6.5);
  assert.equal(ritika.noticeDays, 60);
  assert.deepEqual(ritika.keySkills, ["Java", "Spring Boot", "microservices"]);
  assert.ok(!ritika.keySkills.includes("Kafka"));
  assert.ok(!ritika.keySkills.includes("AWS"));
  assert.ok(!ritika.keySkills.includes("PostgreSQL"));

  // 2. Arjun Rawat (CND-91047)
  const arjun = fixtures.find((f: any) => f.candidateReference === "CND-91047");
  assert.ok(arjun);
  assert.equal(arjun.fullName, "Arjun Rawat");
  assert.equal(arjun.currentRole, "KYC Analyst");
  assert.equal(arjun.experienceYears, 3.0);
  assert.equal(arjun.noticeDays, 30);
  assert.deepEqual(arjun.keySkills, ["KYC", "AML checks", "Excel"]);
  assert.ok(!arjun.keySkills.includes("Due Diligence"));

  // 3. Pooja Nair (CND-91088)
  const pooja = fixtures.find((f: any) => f.candidateReference === "CND-91088");
  assert.ok(pooja);
  assert.equal(pooja.fullName, "Pooja Nair");
  assert.equal(pooja.currentRole, "Java Developer");
  assert.equal(pooja.experienceYears, 4.0);
  assert.equal(pooja.noticeDays, 90);
  assert.deepEqual(pooja.keySkills, ["Java", "Hibernate", "REST APIs"]);
  assert.ok(!pooja.keySkills.includes("Spring Boot"));
  assert.ok(!pooja.keySkills.includes("PostgreSQL"));
});

test.after(async () => {
  await prisma.$disconnect();
});

