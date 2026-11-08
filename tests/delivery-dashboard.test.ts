import test from "node:test";
import assert from "node:assert/strict";
import {
  UserRole,
  OrganizationType,
  RequisitionStatus,
  ApplicationStatus,
  EvaluationStatus,
} from "@prisma/client";
import { NextRequest } from "next/server";
import crypto from "crypto";

import { prisma } from "../src/lib/prisma";
import { createSession, SESSION_COOKIE_NAME, AuthenticatedUser } from "../src/lib/auth";
import { checkPageAuthorization } from "../src/lib/page-auth";
import { Permissions } from "../src/lib/permissions";
import { GET as getAnalyticsRoute } from "../src/app/api/delivery/analytics/route";
import { GET as getFiltersRoute } from "../src/app/api/delivery/filters/route";
import {
  getDeliveryDashboardAnalytics,
  getDeliveryDashboardFilters,
} from "../src/lib/delivery/analytics-service";

function createAuthRequest(
  url: string,
  sessionToken?: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): NextRequest {
  const headers = new Headers(options.headers || {});
  if (sessionToken) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${sessionToken}`);
  }
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
    reqInit.body =
      typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), reqInit as any);
}

test("Milestone 8: Delivery Head Dashboard, Operational Analytics & SLA Engine", async (t) => {
  const suffix = crypto.randomBytes(4).toString("hex");

  // -------------------------------------------------------------------------
  // Setup Organizations & Users
  // -------------------------------------------------------------------------
  // Agency Alpha (Target)
  const agencyAlpha = await prisma.organization.create({
    data: { name: `Agency Alpha ${suffix}`, type: OrganizationType.AGENCY },
  });
  // Agency Beta (Foreign Agency for multi-tenant isolation)
  const agencyBeta = await prisma.organization.create({
    data: { name: `Agency Beta ${suffix}`, type: OrganizationType.AGENCY },
  });
  // Empty Agency Gamma (For empty state tests)
  const agencyGamma = await prisma.organization.create({
    data: { name: `Agency Gamma ${suffix}`, type: OrganizationType.AGENCY },
  });

  // Client Orgs linked to Agency Alpha & Beta
  const clientAlpha = await prisma.organization.create({
    data: {
      name: `Client Alpha Corp ${suffix}`,
      type: OrganizationType.CLIENT,
      agencyId: agencyAlpha.id,
    },
  });
  const clientBeta = await prisma.organization.create({
    data: {
      name: `Client Beta Inc ${suffix}`,
      type: OrganizationType.CLIENT,
      agencyId: agencyBeta.id,
    },
  });

  // Users for Agency Alpha
  const deliveryHeadAlpha = await prisma.user.create({
    data: {
      name: `Delivery Head Alpha ${suffix}`,
      email: `dh.alpha.${suffix}@talentlens.test`,
      role: UserRole.DELIVERY_HEAD,
      organizationId: agencyAlpha.id,
      isActive: true,
    },
  });
  const recruiterAlpha1 = await prisma.user.create({
    data: {
      name: `Recruiter Alice ${suffix}`,
      email: `recruiter.alice.${suffix}@talentlens.test`,
      role: UserRole.RECRUITER,
      organizationId: agencyAlpha.id,
      isActive: true,
    },
  });
  const recruiterAlpha2 = await prisma.user.create({
    data: {
      name: `Recruiter Bob ${suffix}`,
      email: `recruiter.bob.${suffix}@talentlens.test`,
      role: UserRole.RECRUITER,
      organizationId: agencyAlpha.id,
      isActive: true,
    },
  });

  // Client Hiring Manager for Client Alpha
  const clientMgrAlpha = await prisma.user.create({
    data: {
      name: `Client Mgr Alpha ${suffix}`,
      email: `client.mgr.${suffix}@clientalpha.test`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientAlpha.id,
      isActive: true,
    },
  });

  // Foreign Agency Beta Users
  const deliveryHeadBeta = await prisma.user.create({
    data: {
      name: `Delivery Head Beta ${suffix}`,
      email: `dh.beta.${suffix}@talentlens.test`,
      role: UserRole.DELIVERY_HEAD,
      organizationId: agencyBeta.id,
      isActive: true,
    },
  });
  const recruiterBeta = await prisma.user.create({
    data: {
      name: `Recruiter Beta ${suffix}`,
      email: `recruiter.beta.${suffix}@talentlens.test`,
      role: UserRole.RECRUITER,
      organizationId: agencyBeta.id,
      isActive: true,
    },
  });

  // Empty Agency Gamma Delivery Head
  const deliveryHeadGamma = await prisma.user.create({
    data: {
      name: `Delivery Head Gamma ${suffix}`,
      email: `dh.gamma.${suffix}@talentlens.test`,
      role: UserRole.DELIVERY_HEAD,
      organizationId: agencyGamma.id,
      isActive: true,
    },
  });

  // Auth Sessions
  const sessionDHAlpha = await createSession(deliveryHeadAlpha.id);
  const sessionRecruiterAlice = await createSession(recruiterAlpha1.id);
  const sessionClientMgrAlpha = await createSession(clientMgrAlpha.id);
  const sessionDHBeta = await createSession(deliveryHeadBeta.id);
  const sessionDHGamma = await createSession(deliveryHeadGamma.id);

  // AuthenticatedUser structures
  const authDHAlpha: AuthenticatedUser = {
    id: deliveryHeadAlpha.id,
    name: deliveryHeadAlpha.name,
    email: deliveryHeadAlpha.email,
    role: deliveryHeadAlpha.role,
    isActive: true,
    organizationId: agencyAlpha.id,
    organizationName: agencyAlpha.name,
    organizationType: OrganizationType.AGENCY,
  };
  const authRecruiterAlice: AuthenticatedUser = {
    id: recruiterAlpha1.id,
    name: recruiterAlpha1.name,
    email: recruiterAlpha1.email,
    role: recruiterAlpha1.role,
    isActive: true,
    organizationId: agencyAlpha.id,
    organizationName: agencyAlpha.name,
    organizationType: OrganizationType.AGENCY,
  };
  const authClientMgrAlpha: AuthenticatedUser = {
    id: clientMgrAlpha.id,
    name: clientMgrAlpha.name,
    email: clientMgrAlpha.email,
    role: clientMgrAlpha.role,
    isActive: true,
    organizationId: clientAlpha.id,
    organizationName: clientAlpha.name,
    organizationType: OrganizationType.CLIENT,
  };
  const authDHGamma: AuthenticatedUser = {
    id: deliveryHeadGamma.id,
    name: deliveryHeadGamma.name,
    email: deliveryHeadGamma.email,
    role: deliveryHeadGamma.role,
    isActive: true,
    organizationId: agencyGamma.id,
    organizationName: agencyGamma.name,
    organizationType: OrganizationType.AGENCY,
  };

  // -------------------------------------------------------------------------
  // 1. Role-Based Access Control & Route Guarding
  // -------------------------------------------------------------------------
  await t.test("1.1 Security: Permissions.canViewDeliveryDashboard strictly checks AGENCY + DELIVERY_HEAD", () => {
    assert.equal(Permissions.canViewDeliveryDashboard(authDHAlpha), true);
    assert.equal(Permissions.canViewDeliveryDashboard(authRecruiterAlice), false);
    assert.equal(Permissions.canViewDeliveryDashboard(authClientMgrAlpha), false);
  });

  await t.test("1.2 Security: Page authorization for /delivery/dashboard blocks RECRUITER & CLIENT", () => {
    const dhCheck = checkPageAuthorization(authDHAlpha, {
      callbackUrl: "/delivery/dashboard",
      allowedRoles: [UserRole.DELIVERY_HEAD],
    });
    assert.equal(dhCheck.authorized, true);
    assert.equal(dhCheck.action, "ALLOW");

    const recruiterCheck = checkPageAuthorization(authRecruiterAlice, {
      callbackUrl: "/delivery/dashboard",
      allowedRoles: [UserRole.DELIVERY_HEAD],
    });
    assert.equal(recruiterCheck.authorized, false);
    assert.equal(recruiterCheck.action, "REDIRECT_FORBIDDEN");
    assert.equal(recruiterCheck.redirectUrl, "/forbidden");

    const clientCheck = checkPageAuthorization(authClientMgrAlpha, {
      callbackUrl: "/delivery/dashboard",
      allowedRoles: [UserRole.DELIVERY_HEAD],
    });
    assert.equal(clientCheck.authorized, false);
    assert.equal(clientCheck.action, "REDIRECT_FORBIDDEN");
    assert.equal(clientCheck.redirectUrl, "/forbidden");

    const anonCheck = checkPageAuthorization(null, {
      callbackUrl: "/delivery/dashboard",
      allowedRoles: [UserRole.DELIVERY_HEAD],
    });
    assert.equal(anonCheck.authorized, false);
    assert.equal(anonCheck.action, "REDIRECT_LOGIN");
  });

  await t.test("1.3 Security: GET /api/delivery/analytics enforces HTTP 401 & 403 guards", async () => {
    // Unauthenticated -> 401
    const unauthReq = createAuthRequest("http://localhost:3000/api/delivery/analytics");
    const resUnauth = await getAnalyticsRoute(unauthReq);
    assert.equal(resUnauth.status, 401);

    // Recruiter -> 403
    const recruiterReq = createAuthRequest(
      "http://localhost:3000/api/delivery/analytics",
      sessionRecruiterAlice.sessionToken
    );
    const resRecruiter = await getAnalyticsRoute(recruiterReq);
    assert.equal(resRecruiter.status, 403);
    const bodyRecruiter = await resRecruiter.json();
    assert.equal(bodyRecruiter.success, false);
    assert.equal(bodyRecruiter.code, "FORBIDDEN");

    // Client Hiring Manager -> 403
    const clientReq = createAuthRequest(
      "http://localhost:3000/api/delivery/analytics",
      sessionClientMgrAlpha.sessionToken
    );
    const resClient = await getAnalyticsRoute(clientReq);
    assert.equal(resClient.status, 403);
    const bodyClient = await resClient.json();
    assert.equal(bodyClient.success, false);
    assert.equal(bodyClient.code, "FORBIDDEN");

    // Delivery Head -> 200
    const dhReq = createAuthRequest(
      "http://localhost:3000/api/delivery/analytics",
      sessionDHAlpha.sessionToken
    );
    const resDH = await getAnalyticsRoute(dhReq);
    assert.equal(resDH.status, 200);
    const bodyDH = await resDH.json();
    assert.equal(bodyDH.success, true);
    assert.ok(bodyDH.data);
    assert.ok(bodyDH.data.kpiOverview);
  });

  await t.test("1.4 Security: GET /api/delivery/filters enforces HTTP 401 & 403 guards", async () => {
    // Unauthenticated -> 401
    const unauthReq = createAuthRequest("http://localhost:3000/api/delivery/filters");
    const resUnauth = await getFiltersRoute(unauthReq);
    assert.equal(resUnauth.status, 401);

    // Recruiter -> 403
    const recruiterReq = createAuthRequest(
      "http://localhost:3000/api/delivery/filters",
      sessionRecruiterAlice.sessionToken
    );
    const resRecruiter = await getFiltersRoute(recruiterReq);
    assert.equal(resRecruiter.status, 403);

    // Client -> 403
    const clientReq = createAuthRequest(
      "http://localhost:3000/api/delivery/filters",
      sessionClientMgrAlpha.sessionToken
    );
    const resClient = await getFiltersRoute(clientReq);
    assert.equal(resClient.status, 403);

    // Delivery Head -> 200
    const dhReq = createAuthRequest(
      "http://localhost:3000/api/delivery/filters",
      sessionDHAlpha.sessionToken
    );
    const resDH = await getFiltersRoute(dhReq);
    assert.equal(resDH.status, 200);
    const bodyDH = await resDH.json();
    assert.equal(bodyDH.success, true);
    assert.ok(Array.isArray(bodyDH.data.recruiters));
    assert.ok(Array.isArray(bodyDH.data.clientOrganizations));
    assert.ok(Array.isArray(bodyDH.data.requisitions));
  });

  // -------------------------------------------------------------------------
  // 2. Empty State / Zero-Division Resilience
  // -------------------------------------------------------------------------
  await t.test("2.1 Empty Agency: Analytics handles zero requisitions/applications gracefully", async () => {
    const analytics = await getDeliveryDashboardAnalytics(authDHGamma);
    assert.equal(analytics.success, true);
    assert.equal(analytics.statusCode, 200);
    assert.ok(analytics.data);

    const { kpiOverview, clientAcceptance, pipelineConversion, slaPerformance, screeningEfficiency } =
      analytics.data!;

    // KPIs are all 0
    assert.equal(kpiOverview.activeRequisitionsCount, 0);
    assert.equal(kpiOverview.candidatesSourcedInPeriod, 0);
    assert.equal(kpiOverview.candidatesSubmittedInPeriod, 0);
    assert.equal(kpiOverview.overdueSlaRequisitionsCount, 0);

    // Client acceptance
    assert.equal(clientAcceptance.candidatesSubmitted, 0);
    assert.equal(clientAcceptance.clientShortlists, 0);
    assert.equal(clientAcceptance.acceptanceRate, null);
    assert.equal(clientAcceptance.acceptanceRateDisplay, "N/A");
    assert.equal(clientAcceptance.periodOverPeriodChangePoints, null);

    // Pipeline funnel
    assert.equal(pipelineConversion.overallYield, 0);
    assert.equal(pipelineConversion.stages.length, 7);
    assert.equal(pipelineConversion.stages[0].count, 0);

    // SLA
    assert.equal(slaPerformance.evaluatedRequisitionsCount, 0);
    assert.equal(slaPerformance.metSlaCount, 0);
    assert.equal(slaPerformance.actualSlaPercentage, null);
    assert.equal(slaPerformance.overdueCount, 0);
    assert.deepEqual(slaPerformance.overdueRequisitions, []);

    // Screening efficiency
    assert.equal(screeningEfficiency.eligibleCandidatesCount, 0);
    assert.equal(screeningEfficiency.screenedCandidatesCount, 0);
    assert.equal(screeningEfficiency.screeningCompletionRate, 0);
    assert.equal(screeningEfficiency.averageOverallScore, null);
    assert.ok(screeningEfficiency.disclaimer.includes("advisory"));
  });

  // -------------------------------------------------------------------------
  // 3. Populate Controlled Test Data for Agency Alpha & Beta
  // -------------------------------------------------------------------------
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  // Requisitions for Agency Alpha:
  // Req 1: Created 50h ago, first submission at 2h ago (50 - 2 = 48.0h elapsed) -> EXACT SLA BOUNDARY MET!
  const req1MetSla = await prisma.requisition.create({
    data: {
      title: `Senior Backend Engineer ${suffix}`,
      jobDescription: "Senior backend developer with strong distributed systems experience.",
      createdById: deliveryHeadAlpha.id,
      organizationId: agencyAlpha.id,
      clientOrganizationId: clientAlpha.id,
      status: RequisitionStatus.ACTIVE,
      createdAt: hoursAgo(50),
      updatedAt: hoursAgo(2),
    },
  });

  // Req 2: Created 60h ago, first submission at 10h ago (60 - 10 = 50.0h elapsed) -> OVERDUE SLA (>48h)
  const req2OverdueSla = await prisma.requisition.create({
    data: {
      title: `Staff Frontend Lead ${suffix}`,
      jobDescription: "Staff frontend developer with React, TypeScript and modern web architectures.",
      createdById: recruiterAlpha1.id,
      organizationId: agencyAlpha.id,
      clientOrganizationId: clientAlpha.id,
      status: RequisitionStatus.ACTIVE,
      createdAt: hoursAgo(60),
      updatedAt: hoursAgo(10),
    },
  });

  // Req 3: Created 10 days ago, NO submissions, status ACTIVE -> OVERDUE SLA (>48h without submission)
  // Also created 10 days ago and inactive for 8 days -> INACTIVE (>=7d)
  const req3InactiveOverdue = await prisma.requisition.create({
    data: {
      title: `DevOps Architect ${suffix}`,
      jobDescription: "DevOps and cloud infrastructure lead with Kubernetes, Terraform, and AWS.",
      createdById: recruiterAlpha2.id,
      organizationId: agencyAlpha.id,
      clientOrganizationId: clientAlpha.id,
      status: RequisitionStatus.ACTIVE,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(8), // inactive > 7 days!
    },
  });

  // Req 4: Created 10h ago, NO submissions, ACTIVE -> NOT overdue yet (<48h)
  const req4RecentActive = await prisma.requisition.create({
    data: {
      title: `Mobile Flutter Specialist ${suffix}`,
      jobDescription: "Flutter mobile developer specializing in high performance consumer apps.",
      createdById: recruiterAlpha1.id,
      organizationId: agencyAlpha.id,
      clientOrganizationId: clientAlpha.id,
      status: RequisitionStatus.ACTIVE,
      createdAt: hoursAgo(10),
      updatedAt: hoursAgo(10),
    },
  });

  // Foreign Agency Beta Requisition (Must never leak to Alpha)
  const reqBeta = await prisma.requisition.create({
    data: {
      title: `Foreign Requisition Beta ${suffix}`,
      jobDescription: "Foreign requisition for Agency Beta.",
      createdById: recruiterBeta.id,
      organizationId: agencyBeta.id,
      clientOrganizationId: clientBeta.id,
      status: RequisitionStatus.ACTIVE,
      createdAt: hoursAgo(20),
    },
  });

  // Candidates for Agency Alpha
  const candA1 = await prisma.candidate.create({
    data: {
      candidateReference: `CND-A1-${suffix.toUpperCase()}`,
      fullName: `Alice Candidate ${suffix}`,
      agencyId: agencyAlpha.id,
      createdAt: hoursAgo(49),
    },
  });
  const candA2 = await prisma.candidate.create({
    data: {
      candidateReference: `CND-A2-${suffix.toUpperCase()}`,
      fullName: `Bob Candidate ${suffix}`,
      agencyId: agencyAlpha.id,
      createdAt: hoursAgo(48),
    },
  });
  const candA3 = await prisma.candidate.create({
    data: {
      candidateReference: `CND-A3-${suffix.toUpperCase()}`,
      fullName: `Charlie Candidate ${suffix}`,
      agencyId: agencyAlpha.id,
      createdAt: hoursAgo(40),
    },
  });
  const candA4 = await prisma.candidate.create({
    data: {
      candidateReference: `CND-A4-${suffix.toUpperCase()}`,
      fullName: `Diana Candidate ${suffix}`,
      agencyId: agencyAlpha.id,
      createdAt: hoursAgo(30),
    },
  });
  const candA5 = await prisma.candidate.create({
    data: {
      candidateReference: `CND-A5-${suffix.toUpperCase()}`,
      fullName: `Evan Candidate ${suffix}`,
      agencyId: agencyAlpha.id,
      createdAt: hoursAgo(25),
    },
  });

  // Candidate for Foreign Agency Beta
  const candBeta = await prisma.candidate.create({
    data: {
      candidateReference: `CND-B1-${suffix.toUpperCase()}`,
      fullName: `Foreign Beta Candidate ${suffix}`,
      agencyId: agencyBeta.id,
      createdAt: hoursAgo(15),
    },
  });

  // Evaluations for Agency Alpha (to test screening efficiency)
  await prisma.evaluation.create({
    data: {
      agencyId: agencyAlpha.id,
      requisitionId: req1MetSla.id,
      candidateId: candA1.id,
      status: EvaluationStatus.COMPLETED,
      provider: "mock",
      modelId: "mock-v1",
      promptVersion: "v1.0",
      overallScore: 85,
      evidenceCoverage: 90,
      hasMustHaveWarnings: false,
      isReviewedByRecruiter: true,
      reviewedById: recruiterAlpha1.id,
      reviewedAt: hoursAgo(45), // reviewed in 4 hours
      createdAt: hoursAgo(49),
    },
  });
  await prisma.evaluation.create({
    data: {
      agencyId: agencyAlpha.id,
      requisitionId: req1MetSla.id,
      candidateId: candA2.id,
      status: EvaluationStatus.COMPLETED,
      provider: "mock",
      modelId: "mock-v1",
      promptVersion: "v1.0",
      overallScore: 75,
      evidenceCoverage: 80,
      hasMustHaveWarnings: true, // warning flag
      isReviewedByRecruiter: true,
      reviewedById: recruiterAlpha1.id,
      reviewedAt: hoursAgo(42), // reviewed in 6 hours
      createdAt: hoursAgo(48),
    },
  });
  await prisma.evaluation.create({
    data: {
      agencyId: agencyAlpha.id,
      requisitionId: req2OverdueSla.id,
      candidateId: candA3.id,
      status: EvaluationStatus.COMPLETED,
      provider: "mock",
      modelId: "mock-v1",
      promptVersion: "v1.0",
      overallScore: 90,
      evidenceCoverage: 85,
      hasMustHaveWarnings: false,
      isReviewedByRecruiter: true,
      reviewedById: recruiterAlpha2.id,
      reviewedAt: hoursAgo(25), // reviewed in 15 hours
      createdAt: hoursAgo(40),
    },
  });

  // Applications on Req 1 (Submitted by Recruiter Alice):
  // App 1: Submitted at 2h ago (50h - 2h = 48.0h elapsed) -> Shortlisted by Client -> Joined!
  await prisma.application.create({
    data: {
      requisitionId: req1MetSla.id,
      candidateId: candA1.id,
      status: ApplicationStatus.JOINED,
      submittedById: recruiterAlpha1.id,
      submittedAt: hoursAgo(2),
      clientDecisionAt: hoursAgo(1.5),
      clientDecisionById: clientMgrAlpha.id,
      interviewScheduledSlot: hoursAgo(1.2),
      offeredAt: hoursAgo(0.8),
      joinedAt: hoursAgo(0.2),
      clientOrganizationId: clientAlpha.id,
      createdAt: hoursAgo(49),
      updatedAt: hoursAgo(0.2),
    },
  });

  // App 2: Submitted by Recruiter Alice at 1.8h ago -> Shortlisted by Client
  await prisma.application.create({
    data: {
      requisitionId: req1MetSla.id,
      candidateId: candA2.id,
      status: ApplicationStatus.CLIENT_SHORTLISTED,
      submittedById: recruiterAlpha1.id,
      submittedAt: hoursAgo(1.8),
      clientDecisionAt: hoursAgo(1.2),
      clientDecisionById: clientMgrAlpha.id,
      clientOrganizationId: clientAlpha.id,
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(1.2),
    },
  });

  // Applications on Req 2 (Submitted by Recruiter Bob):
  // App 3: Submitted by Recruiter Bob at 10h ago (60 - 10 = 50h elapsed) -> Client Rejected
  await prisma.application.create({
    data: {
      requisitionId: req2OverdueSla.id,
      candidateId: candA3.id,
      status: ApplicationStatus.CLIENT_REJECTED,
      submittedById: recruiterAlpha2.id,
      submittedAt: hoursAgo(10),
      clientDecisionAt: hoursAgo(8),
      clientDecisionById: clientMgrAlpha.id,
      clientOrganizationId: clientAlpha.id,
      createdAt: hoursAgo(40),
      updatedAt: hoursAgo(8),
    },
  });

  // App 4: Submitted by Recruiter Bob at 9h ago -> Interview Proposed (Distinct category!)
  await prisma.application.create({
    data: {
      requisitionId: req2OverdueSla.id,
      candidateId: candA4.id,
      status: ApplicationStatus.INTERVIEW_PROPOSED,
      submittedById: recruiterAlpha2.id,
      submittedAt: hoursAgo(9),
      proposedInterviewSlot: hoursAgo(7),
      clientOrganizationId: clientAlpha.id,
      createdAt: hoursAgo(30),
      updatedAt: hoursAgo(7),
    },
  });

  // App 5 on Req 1: Sourced only, never screened or submitted
  await prisma.application.create({
    data: {
      requisitionId: req1MetSla.id,
      candidateId: candA5.id,
      status: ApplicationStatus.SOURCED,
      createdAt: hoursAgo(25),
      updatedAt: hoursAgo(25),
    },
  });

  // Foreign App on Foreign Req Beta
  await prisma.application.create({
    data: {
      requisitionId: reqBeta.id,
      candidateId: candBeta.id,
      status: ApplicationStatus.JOINED,
      submittedById: recruiterBeta.id,
      submittedAt: hoursAgo(5),
      clientDecisionAt: hoursAgo(4),
      clientOrganizationId: clientBeta.id,
      createdAt: hoursAgo(15),
      updatedAt: hoursAgo(2),
    },
  });

  // -------------------------------------------------------------------------
  // 4. Multi-Tenant Cross-Agency Isolation & Filter Spoofing
  // -------------------------------------------------------------------------
  await t.test("4.1 Multi-Tenant: Delivery Head Alpha cannot see Beta data; Beta cannot see Alpha", async () => {
    const resAlpha = await getDeliveryDashboardAnalytics(authDHAlpha);
    assert.equal(resAlpha.success, true);
    assert.ok(resAlpha.data);

    // Alpha should see its 4 requisitions, never the Beta requisition
    const reqIdsAlpha = resAlpha.data!.requisitionTurnaround.map((r) => r.requisitionId);
    assert.ok(reqIdsAlpha.includes(req1MetSla.id));
    assert.ok(reqIdsAlpha.includes(req2OverdueSla.id));
    assert.ok(reqIdsAlpha.includes(req3InactiveOverdue.id));
    assert.ok(reqIdsAlpha.includes(req4RecentActive.id));
    assert.equal(reqIdsAlpha.includes(reqBeta.id), false, "Beta requisition must NOT appear in Alpha");

    // Recruiter list in Alpha should not include Recruiter Beta
    const recruiterIdsAlpha = resAlpha.data!.recruiterProductivity.map((r) => r.recruiterId);
    assert.ok(recruiterIdsAlpha.includes(recruiterAlpha1.id));
    assert.ok(recruiterIdsAlpha.includes(recruiterAlpha2.id));
    assert.equal(recruiterIdsAlpha.includes(recruiterBeta.id), false, "Recruiter Beta must NOT appear in Alpha");

    // Beta Delivery Head should only see Beta
    const resBeta = await getDeliveryDashboardAnalytics({
      id: deliveryHeadBeta.id,
      name: deliveryHeadBeta.name,
      email: deliveryHeadBeta.email,
      role: deliveryHeadBeta.role,
      isActive: true,
      organizationId: agencyBeta.id,
      organizationName: agencyBeta.name,
      organizationType: OrganizationType.AGENCY,
    });
    assert.equal(resBeta.success, true);
    const reqIdsBeta = resBeta.data!.requisitionTurnaround.map((r) => r.requisitionId);
    assert.equal(reqIdsBeta.length, 1);
    assert.equal(reqIdsBeta[0], reqBeta.id);
  });

  await t.test("4.2 Multi-Tenant Filter Spoofing: Spoofed foreign recruiterId / reqId / clientOrgId is rejected with 400", async () => {
    // Delivery Head Alpha attempts to filter by Agency Beta's recruiterId
    const resSpoofedRecruiter = await getDeliveryDashboardAnalytics(authDHAlpha, {
      recruiterId: recruiterBeta.id,
    });
    assert.equal(resSpoofedRecruiter.success, false);
    assert.equal(resSpoofedRecruiter.statusCode, 400);
    assert.equal(resSpoofedRecruiter.code, "INVALID_FILTER");

    // Delivery Head Alpha attempts to filter by Agency Beta's requisitionId
    const resSpoofedReq = await getDeliveryDashboardAnalytics(authDHAlpha, {
      requisitionId: reqBeta.id,
    });
    assert.equal(resSpoofedReq.success, false);
    assert.equal(resSpoofedReq.statusCode, 400);
    assert.equal(resSpoofedReq.code, "INVALID_FILTER");

    // Delivery Head Alpha attempts to filter by Agency Beta's clientOrgId
    const resSpoofedClient = await getDeliveryDashboardAnalytics(authDHAlpha, {
      clientOrganizationId: clientBeta.id,
    });
    assert.equal(resSpoofedClient.success, false);
    assert.equal(resSpoofedClient.statusCode, 400);
    assert.equal(resSpoofedClient.code, "INVALID_FILTER");
  });

  await t.test("4.3 Filter Metadata: /api/delivery/filters returns only Alpha recruiters, clients, requisitions", async () => {
    const filtersResult = await getDeliveryDashboardFilters(authDHAlpha);
    assert.equal(filtersResult.success, true);
    const data = filtersResult.data!;

    const recruiterIds = data.recruiters.map((r) => r.id);
    assert.ok(recruiterIds.includes(recruiterAlpha1.id));
    assert.ok(recruiterIds.includes(recruiterAlpha2.id));
    assert.equal(recruiterIds.includes(recruiterBeta.id), false);

    const clientIds = data.clientOrganizations.map((c) => c.id);
    assert.ok(clientIds.includes(clientAlpha.id));
    assert.equal(clientIds.includes(clientBeta.id), false);

    const reqIds = data.requisitions.map((r) => r.id);
    assert.ok(reqIds.includes(req1MetSla.id));
    assert.equal(reqIds.includes(reqBeta.id), false);
  });

  // -------------------------------------------------------------------------
  // 5. SLA Tracking & Exact Boundary Condition Calculations
  // -------------------------------------------------------------------------
  await t.test("5.1 SLA Engine: Exact 48.0h is MET, 50.0h is OVERDUE, unsubmitted >48h is OVERDUE", async () => {
    const analytics = await getDeliveryDashboardAnalytics(authDHAlpha);
    assert.equal(analytics.success, true);
    const sla = analytics.data!.slaPerformance;
    const reqMetrics = analytics.data!.requisitionTurnaround;

    // Inspect Req 1 (Created 50h ago, submitted 2h ago -> exactly 48.0h elapsed)
    const m1 = reqMetrics.find((r) => r.requisitionId === req1MetSla.id);
    assert.ok(m1);
    assert.ok(m1.timeToFirstSubmissionHours !== null);
    assert.ok(
      Math.abs(m1.timeToFirstSubmissionHours - 48.0) < 0.2,
      `Req 1 first submission time should be approx 48.0h, got ${m1.timeToFirstSubmissionHours}`
    );
    assert.equal(m1.isOverdueSla, false, "Req 1 (<= 48h) must be marked as MET SLA");

    // Inspect Req 2 (Created 60h ago, submitted 10h ago -> 50.0h elapsed)
    const m2 = reqMetrics.find((r) => r.requisitionId === req2OverdueSla.id);
    assert.ok(m2);
    assert.ok(m2.timeToFirstSubmissionHours !== null);
    assert.ok(
      m2.timeToFirstSubmissionHours > 48.0,
      `Req 2 first submission time must be > 48.0h, got ${m2.timeToFirstSubmissionHours}`
    );
    assert.equal(m2.isOverdueSla, true, "Req 2 (> 48h) must be marked as OVERDUE SLA");

    // Inspect Req 3 (Created 10 days ago, 0 submissions, ACTIVE)
    const m3 = reqMetrics.find((r) => r.requisitionId === req3InactiveOverdue.id);
    assert.ok(m3);
    assert.equal(m3.totalSubmissions, 0);
    assert.equal(m3.timeToFirstSubmissionHours, null);
    assert.equal(m3.isOverdueSla, true, "Req 3 (>48h without submission) must be OVERDUE SLA");
    assert.equal(m3.isInactive, true, "Req 3 (no update for >=7d) must be flagged as INACTIVE");

    // Inspect Req 4 (Created 10h ago, 0 submissions, ACTIVE)
    const m4 = reqMetrics.find((r) => r.requisitionId === req4RecentActive.id);
    assert.ok(m4);
    assert.equal(m4.totalSubmissions, 0);
    assert.equal(m4.isOverdueSla, false, "Req 4 (<48h) must NOT be overdue");

    // SLA Summary Aggregates
    // Evaluated: req1, req2, req3 (req4 is <48h and unsubmitted, so pending/not evaluated)
    assert.equal(sla.targetHours, 48);
    assert.equal(sla.targetPercentage, 80);
    assert.equal(sla.evaluatedRequisitionsCount, 3);
    assert.equal(sla.metSlaCount, 1); // Only req1 met SLA
    assert.equal(sla.overdueCount, 2); // req2 and req3
    // actualSlaPercentage = (1 / 3) * 100 = 33.3%
    assert.ok(sla.actualSlaPercentage !== null);
    assert.ok(
      Math.abs(sla.actualSlaPercentage - 33.3) < 0.2,
      `Actual SLA should be ~33.3%, got ${sla.actualSlaPercentage}`
    );

    // Overdue requisitions list contains Req 2 and Req 3 with overdue hours
    const overdueIds = sla.overdueRequisitions.map((o) => o.requisitionId);
    assert.ok(overdueIds.includes(req2OverdueSla.id));
    assert.ok(overdueIds.includes(req3InactiveOverdue.id));
    const o2 = sla.overdueRequisitions.find((o) => o.requisitionId === req2OverdueSla.id);
    assert.ok(o2 && o2.overdueHours > 0);
  });

  // -------------------------------------------------------------------------
  // 6. Client Acceptance & Interview Proposals Reporting
  // -------------------------------------------------------------------------
  await t.test("6.1 Client Acceptance: Acceptance rate = shortlists / submitted, interview proposals distinct", async () => {
    const analytics = await getDeliveryDashboardAnalytics(authDHAlpha);
    assert.equal(analytics.success, true);
    const ca = analytics.data!.clientAcceptance;

    // Submissions in period for Agency Alpha:
    // App 1 (shortlisted -> joined)
    // App 2 (shortlisted)
    // App 3 (rejected)
    // App 4 (interview proposed)
    // Total submissions = 4
    assert.equal(ca.candidatesSubmitted, 4);

    // Shortlists = 2 (App 1 and App 2)
    assert.equal(ca.clientShortlists, 2);

    // Rejections = 1 (App 3)
    assert.equal(ca.clientRejections, 1);

    // Interview proposals = 1 (App 4)
    assert.equal(ca.interviewProposals, 1, "Interview proposals must be reported separately from acceptances");

    // Acceptance rate = (2 / 4) * 100 = 50.0%
    assert.equal(ca.acceptanceRate, 50.0);
    assert.equal(ca.acceptanceRateDisplay, "2 / 4 (50.0%)");
  });

  // -------------------------------------------------------------------------
  // 7. Recruiter Operational Productivity & Non-Vanity Metrics
  // -------------------------------------------------------------------------
  await t.test("7.1 Recruiter Productivity: Denominators present, review turnaround & conversion rates calculated", async () => {
    const analytics = await getDeliveryDashboardAnalytics(authDHAlpha);
    assert.equal(analytics.success, true);
    const recruiters = analytics.data!.recruiterProductivity;

    // Recruiter Alice (Alpha 1)
    const alice = recruiters.find((r) => r.recruiterId === recruiterAlpha1.id);
    assert.ok(alice);
    assert.equal(alice.evaluationsReviewed, 2); // eval1, eval2
    assert.equal(alice.candidatesSubmitted, 2); // app1, app2
    assert.equal(alice.clientShortlistsReceived, 2); // app1, app2
    assert.equal(alice.submissionToShortlistRate, 100.0); // 2/2 = 100%
    assert.equal(alice.joinsAttributable, 1); // app1 joined
    assert.ok(alice.avgReviewTurnaroundHours !== null);
    // eval1 took 4h, eval2 took 6h -> avg = 5h
    assert.ok(
      Math.abs(alice.avgReviewTurnaroundHours - 5.0) < 0.2,
      `Alice review turnaround should be ~5.0h, got ${alice.avgReviewTurnaroundHours}`
    );

    // Recruiter Bob (Alpha 2)
    const bob = recruiters.find((r) => r.recruiterId === recruiterAlpha2.id);
    assert.ok(bob);
    assert.equal(bob.evaluationsReviewed, 1); // eval3
    assert.equal(bob.candidatesSubmitted, 2); // app3, app4
    assert.equal(bob.clientShortlistsReceived, 0); // 1 rejected, 1 proposed
    assert.equal(bob.submissionToShortlistRate, 0.0); // 0/2 = 0%
    assert.equal(bob.joinsAttributable, 0);
  });

  // -------------------------------------------------------------------------
  // 8. Requisition Turnaround Timelines & Milestone Elapsed Times
  // -------------------------------------------------------------------------
  await t.test("8.1 Requisition Turnaround: Milestone elapsed hours computed accurately", async () => {
    const analytics = await getDeliveryDashboardAnalytics(authDHAlpha);
    assert.equal(analytics.success, true);
    const reqs = analytics.data!.requisitionTurnaround;

    const r1 = reqs.find((r) => r.requisitionId === req1MetSla.id);
    assert.ok(r1);
    assert.equal(r1.totalApplications, 3); // app1, app2, app5
    assert.equal(r1.totalSubmissions, 2); // app1, app2
    assert.equal(r1.totalShortlists, 2); // app1, app2
    assert.ok(r1.timeToFirstSubmissionHours !== null);
    assert.ok(r1.timeToFirstShortlistHours !== null);
    assert.ok(r1.timeToFirstInterviewHours !== null);
    assert.ok(r1.timeToOfferHours !== null);
    assert.ok(r1.timeToJoinHours !== null);
    // Milestone sequencing: submission <= shortlist <= interview <= offer <= join
    assert.ok(r1.timeToFirstSubmissionHours <= r1.timeToFirstShortlistHours);
    assert.ok(r1.timeToFirstShortlistHours <= r1.timeToFirstInterviewHours);
    assert.ok(r1.timeToFirstInterviewHours <= r1.timeToOfferHours);
    assert.ok(r1.timeToOfferHours <= r1.timeToJoinHours);
    assert.equal(r1.isInactive, false);
  });

  // -------------------------------------------------------------------------
  // 9. Pipeline Conversion Funnel
  // -------------------------------------------------------------------------
  await t.test("9.1 Pipeline Funnel: 7 stages, step-by-step conversion, and overall yield", async () => {
    const analytics = await getDeliveryDashboardAnalytics(authDHAlpha);
    assert.equal(analytics.success, true);
    const funnel = analytics.data!.pipelineConversion;

    assert.equal(funnel.stages.length, 7);
    const [sourced, screened, submitted, shortlisted, interview, offered, joined] = funnel.stages;

    assert.equal(sourced.stage, "SOURCED");
    assert.equal(screened.stage, "SCREENED");
    assert.equal(submitted.stage, "SUBMITTED");
    assert.equal(shortlisted.stage, "SHORTLISTED");
    assert.equal(interview.stage, "INTERVIEW");
    assert.equal(offered.stage, "OFFERED");
    assert.equal(joined.stage, "JOINED");

    // Total applications in Alpha: 5 (app1, app2, app3, app4, app5)
    assert.equal(sourced.count, 5);
    // Screened (apps with evaluation): app1 (eval1), app2 (eval2), app3 (eval3) = 3
    assert.equal(screened.count, 3);
    // Submitted: app1, app2, app3, app4 = 4
    assert.equal(submitted.count, 4);
    // Shortlisted: app1, app2 = 2
    assert.equal(shortlisted.count, 2);
    // Interview (interview proposed/scheduled/completed/offered/joined): app1 (joined), app4 (proposed) = 2
    assert.equal(interview.count, 2);
    // Offered: app1 = 1
    assert.equal(offered.count, 1);
    // Joined: app1 = 1
    assert.equal(joined.count, 1);

    // Yield = joined / sourced = (1 / 5) * 100 = 20.0%
    assert.equal(funnel.overallYield, 20.0);
    assert.equal(joined.overallYield, 20.0);
  });

  // -------------------------------------------------------------------------
  // 10. Filter Isolation (Recruiter, Client Org, Requisition)
  // -------------------------------------------------------------------------
  await t.test("10.1 Filter Isolation: Filtering by Recruiter Alice isolates her submissions", async () => {
    const analytics = await getDeliveryDashboardAnalytics(authDHAlpha, {
      recruiterId: recruiterAlpha1.id,
    });
    assert.equal(analytics.success, true);
    assert.equal(analytics.data!.filtersApplied.recruiterId, recruiterAlpha1.id);
    assert.equal(analytics.data!.filtersApplied.isFiltered, true);

    // Only Alice's submissions (2) should be counted
    assert.equal(analytics.data!.clientAcceptance.candidatesSubmitted, 2);
    assert.equal(analytics.data!.clientAcceptance.clientShortlists, 2);
    assert.equal(analytics.data!.clientAcceptance.acceptanceRate, 100.0);
  });

  await t.test("10.2 Filter Isolation: Filtering by Requisition isolates that requisition", async () => {
    const analytics = await getDeliveryDashboardAnalytics(authDHAlpha, {
      requisitionId: req2OverdueSla.id,
    });
    assert.equal(analytics.success, true);
    assert.equal(analytics.data!.filtersApplied.requisitionId, req2OverdueSla.id);
    assert.equal(analytics.data!.requisitionTurnaround.length, 1);
    assert.equal(analytics.data!.requisitionTurnaround[0].requisitionId, req2OverdueSla.id);

    // Req 2 has 2 submissions (app3 rejected, app4 interview proposed)
    assert.equal(analytics.data!.clientAcceptance.candidatesSubmitted, 2);
    assert.equal(analytics.data!.clientAcceptance.clientShortlists, 0);
    assert.equal(analytics.data!.clientAcceptance.acceptanceRate, 0.0);
  });

  // -------------------------------------------------------------------------
  // Cleanup test data to maintain database cleanliness
  // -------------------------------------------------------------------------
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: [agencyAlpha.id, agencyBeta.id, agencyGamma.id] } },
  });
  await prisma.application.deleteMany({
    where: { requisitionId: { in: [req1MetSla.id, req2OverdueSla.id, req3InactiveOverdue.id, req4RecentActive.id, reqBeta.id] } },
  });
  await prisma.evaluation.deleteMany({
    where: { requisitionId: { in: [req1MetSla.id, req2OverdueSla.id, req3InactiveOverdue.id, req4RecentActive.id, reqBeta.id] } },
  });
  await prisma.candidate.deleteMany({
    where: { agencyId: { in: [agencyAlpha.id, agencyBeta.id, agencyGamma.id] } },
  });
  await prisma.requisition.deleteMany({
    where: { organizationId: { in: [agencyAlpha.id, agencyBeta.id, agencyGamma.id] } },
  });
  await prisma.session.deleteMany({
    where: {
      userId: {
        in: [
          deliveryHeadAlpha.id,
          recruiterAlpha1.id,
          recruiterAlpha2.id,
          clientMgrAlpha.id,
          deliveryHeadBeta.id,
          recruiterBeta.id,
          deliveryHeadGamma.id,
        ],
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          deliveryHeadAlpha.id,
          recruiterAlpha1.id,
          recruiterAlpha2.id,
          clientMgrAlpha.id,
          deliveryHeadBeta.id,
          recruiterBeta.id,
          deliveryHeadGamma.id,
        ],
      },
    },
  });
  await prisma.organization.deleteMany({
    where: {
      id: {
        in: [agencyAlpha.id, agencyBeta.id, agencyGamma.id, clientAlpha.id, clientBeta.id],
      },
    },
  });
});
