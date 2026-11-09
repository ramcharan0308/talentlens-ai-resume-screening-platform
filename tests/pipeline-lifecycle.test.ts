import test from "node:test";
import assert from "node:assert/strict";
import {
  UserRole,
  OrganizationType,
  RequisitionStatus,
  ApplicationStatus,
  DocumentProcessingStatus,
} from "@prisma/client";
import { NextRequest } from "next/server";
import crypto from "crypto";

import { prisma } from "../src/lib/prisma";
import { createSession, SESSION_COOKIE_NAME } from "../src/lib/auth";
import { getStorageProvider } from "../src/lib/storage";

import { GET as getPipelineRoute } from "../src/app/api/requisitions/[id]/pipeline/route";
import { GET as getHistoryRoute } from "../src/app/api/applications/[id]/history/route";
import { POST as transitionRoute } from "../src/app/api/applications/[id]/transition/route";
import { GET as getSummaryRoute } from "../src/app/api/pipeline/summary/route";
import { POST as clientDecisionRoute } from "../src/app/api/client/applications/[id]/decision/route";
import { POST as submitCandidateRoute } from "../src/app/api/requisitions/[id]/candidates/[candidateId]/submit/route";
import { GET as getNestedHistoryRoute } from "../src/app/api/requisitions/[id]/applications/[applicationId]/history/route";
import { POST as nestedTransitionRoute } from "../src/app/api/requisitions/[id]/applications/[applicationId]/transition/route";
import { GET as getScorecardRoute } from "../src/app/api/requisitions/[id]/scorecard/route";

function createAuthRequest(
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
    reqInit.body =
      typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), reqInit as any);
}

test("Milestone 6: Candidate Pipeline Lifecycle & Stage Transition Invariants", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  // 1. Setup Organizations: Agency Alpha, Agency Beta, Client Alpha (linked to Alpha)
  const agencyA = await prisma.organization.create({
    data: { name: `Agency Alpha ${suffix}`, type: OrganizationType.AGENCY },
  });
  const agencyB = await prisma.organization.create({
    data: { name: `Agency Beta ${suffix}`, type: OrganizationType.AGENCY },
  });
  const clientA = await prisma.organization.create({
    data: { name: `Client Alpha ${suffix}`, type: OrganizationType.CLIENT, agencyId: agencyA.id },
  });

  // 2. Setup Users
  const recruiterA = await prisma.user.create({
    data: {
      name: `Recruiter Alpha ${suffix}`,
      email: `recruiter.a.${suffix}@agencya.com`,
      role: UserRole.RECRUITER,
      organizationId: agencyA.id,
      isActive: true,
    },
  });
  const deliveryHeadA = await prisma.user.create({
    data: {
      name: `Delivery Head ${suffix}`,
      email: `head.a.${suffix}@agencya.com`,
      role: UserRole.DELIVERY_HEAD,
      organizationId: agencyA.id,
      isActive: true,
    },
  });
  const clientMgrA = await prisma.user.create({
    data: {
      name: `Client Mgr ${suffix}`,
      email: `mgr.a.${suffix}@clienta.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientA.id,
      isActive: true,
    },
  });
  const recruiterB = await prisma.user.create({
    data: {
      name: `Recruiter Beta ${suffix}`,
      email: `recruiter.b.${suffix}@agencyb.com`,
      role: UserRole.RECRUITER,
      organizationId: agencyB.id,
      isActive: true,
    },
  });

  const recruiterASession = await createSession(recruiterA.id);
  const deliveryHeadSession = await createSession(deliveryHeadA.id);
  const clientASession = await createSession(clientMgrA.id);
  const recruiterBSession = await createSession(recruiterB.id);

  // 3. Setup Requisitions
  const req1 = await prisma.requisition.create({
    data: {
      title: `Senior Distributed Systems Engineer ${suffix}`,
      jobDescription: "Go, Kubernetes, Kafka, PostgreSQL.",
      organizationId: agencyA.id,
      clientOrganizationId: clientA.id,
      createdById: recruiterA.id,
      status: RequisitionStatus.ACTIVE,
    },
  });

  const req2 = await prisma.requisition.create({
    data: {
      title: `Staff Backend Architect ${suffix}`,
      jobDescription: "High-scale microservices architecture in Go.",
      organizationId: agencyA.id,
      clientOrganizationId: clientA.id,
      createdById: recruiterA.id,
      status: RequisitionStatus.ACTIVE,
    },
  });

  const reqForeign = await prisma.requisition.create({
    data: {
      title: `Foreign Role ${suffix}`,
      jobDescription: "Role belonging to Agency Beta.",
      organizationId: agencyB.id,
      createdById: recruiterB.id,
      status: RequisitionStatus.ACTIVE,
    },
  });

  // 4. Setup Candidate 1 and CV Document
  const candidate1 = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-PPL-${suffix.toUpperCase()}-01`,
      fullName: `Alice Walker ${suffix}`,
      currentRole: "Lead Systems Engineer",
      experienceYears: 7,
      keySkills: ["Go", "Kubernetes", "PostgreSQL"],
      agencyId: agencyA.id,
    },
  });

  const doc1Key = `${suffix}-alice-cv.pdf`;
  const storage = getStorageProvider();
  await storage.put(doc1Key, Buffer.from("%PDF-1.4 Mock CV Alice Walker"));

  const doc1 = await prisma.uploadedDocument.create({
    data: {
      agencyId: agencyA.id,
      candidateId: candidate1.id,
      fileName: "Alice_Walker_CV.pdf",
      fileType: "application/pdf",
      storageKey: doc1Key,
      fileHash: crypto.randomBytes(32).toString("hex"),
      fileSizeBytes: 4096,
      processingStatus: DocumentProcessingStatus.EXTRACTED,
      extractedText: "Alice Walker - 7 years Go, Kubernetes, PostgreSQL.",
    },
  });

  // Recruiter A views Alice's CV
  await prisma.auditLog.create({
    data: {
      action: "ORIGINAL_CV_VIEWED",
      actorId: recruiterA.id,
      organizationId: agencyA.id,
      entityType: "UploadedDocument",
      entityId: doc1.id,
    },
  });

  // ------------------------------------------------------------------------------------------------
  // TEST 1: Full Positive Lifecycle (SOURCED -> SCREENED -> SUBMITTED -> SHORTLISTED -> INTERVIEW_SCHEDULED -> INTERVIEW_COMPLETED -> OFFERED -> JOINED)
  // ------------------------------------------------------------------------------------------------
  // Create application in SOURCED
  const app1 = await prisma.application.create({
    data: {
      candidateId: candidate1.id,
      requisitionId: req1.id,
      status: ApplicationStatus.SOURCED,
    },
  });

  // Check 1.1: Invalid skip straight to OFFERED -> 422
  {
    const req = createAuthRequest(`/api/applications/${app1.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.OFFERED },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app1.id }) });
    const json = await res.json();
    assert.equal(res.status, 422, "Skipping stages from SOURCED to OFFERED must return 422");
    assert.equal(json.code, "INVALID_STATE_TRANSITION");
  }

  // Check 1.2: Transition to SCREENED without completed evaluation & recruiter review -> 422
  {
    const req = createAuthRequest(`/api/applications/${app1.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.SCREENED },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app1.id }) });
    assert.equal(res.status, 422, "Transitioning to SCREENED without evaluation must fail with 422");
  }

  // Complete evaluation and recruiter review
  const eval1 = await prisma.evaluation.create({
    data: {
      agencyId: agencyA.id,
      requisitionId: req1.id,
      candidateId: candidate1.id,
      applicationId: app1.id,
      documentId: doc1.id,
      status: "COMPLETED",
      overallScore: 94,
      evidenceCoverage: 100,
      isReviewedByRecruiter: true,
      reviewedById: recruiterA.id,
      reviewedAt: new Date(),
      provider: "mock",
      modelId: "mock-v1",
      promptVersion: "v1.0",
    },
  });

  // Check 1.3: Valid transition to SCREENED -> 200
  {
    const req = createAuthRequest(`/api/applications/${app1.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.SCREENED },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app1.id }) });
    const json = await res.json();
    assert.equal(res.status, 200, "Transitioning to SCREENED with review must succeed");
    assert.equal(json.newStatus, ApplicationStatus.SCREENED);

    const checkApp = await prisma.application.findUnique({ where: { id: app1.id } });
    assert.equal(checkApp?.status, ApplicationStatus.SCREENED);
  }

  // Check 1.4: Valid transition to SUBMITTED_TO_CLIENT -> 200
  {
    const req = createAuthRequest(`/api/applications/${app1.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.SUBMITTED_TO_CLIENT },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app1.id }) });
    const json = await res.json();
    assert.equal(res.status, 200, "Transitioning to SUBMITTED_TO_CLIENT must succeed");
    assert.equal(json.newStatus, ApplicationStatus.SUBMITTED_TO_CLIENT);

    const checkApp = await prisma.application.findUnique({ where: { id: app1.id } });
    assert.equal(checkApp?.status, ApplicationStatus.SUBMITTED_TO_CLIENT);
    assert.equal(checkApp?.clientOrganizationId, clientA.id);
  }

  // Check 1.5: Client Hiring Manager shortlists candidate -> 200
  {
    const req = createAuthRequest(`/api/client/applications/${app1.id}/decision`, clientASession.sessionToken, {
      method: "POST",
      body: { decision: "SHORTLIST" },
    });
    const res = await clientDecisionRoute(req, { params: Promise.resolve({ id: app1.id }) });
    assert.equal(res.status, 200, "Client shortlist must succeed");

    const checkApp = await prisma.application.findUnique({ where: { id: app1.id } });
    assert.equal(checkApp?.status, ApplicationStatus.CLIENT_SHORTLISTED);
  }

  // Check 1.6: Recruiter schedules interview with valid slot -> 200
  const futureInterviewDate = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  {
    const req = createAuthRequest(`/api/applications/${app1.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: {
        targetStatus: ApplicationStatus.INTERVIEW_SCHEDULED,
        scheduledSlot: futureInterviewDate,
        scheduledNote: "Round 1 Technical Architecture Screen (60 mins)",
      },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app1.id }) });
    const json = await res.json();
    assert.equal(res.status, 200, "Scheduling interview with valid slot must succeed");
    assert.equal(json.newStatus, ApplicationStatus.INTERVIEW_SCHEDULED);

    const checkApp = await prisma.application.findUnique({ where: { id: app1.id } });
    assert.equal(checkApp?.status, ApplicationStatus.INTERVIEW_SCHEDULED);
    assert.ok(checkApp?.interviewScheduledSlot);
    assert.equal(checkApp?.interviewScheduledNote, "Round 1 Technical Architecture Screen (60 mins)");
  }

  // Check 1.7: Mark Interview Completed -> 200
  {
    const req = createAuthRequest(`/api/applications/${app1.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: {
        targetStatus: ApplicationStatus.INTERVIEW_COMPLETED,
        note: "Candidate scored top marks in distributed systems panel.",
      },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app1.id }) });
    assert.equal(res.status, 200, "Marking interview completed must succeed");

    const checkApp = await prisma.application.findUnique({ where: { id: app1.id } });
    assert.equal(checkApp?.status, ApplicationStatus.INTERVIEW_COMPLETED);
  }

  // Check 1.8: Extend Offer -> 200
  {
    const req = createAuthRequest(`/api/applications/${app1.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: {
        targetStatus: ApplicationStatus.OFFERED,
        note: "Offer extended at $195k base + equity.",
      },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app1.id }) });
    assert.equal(res.status, 200, "Extending offer must succeed");

    const checkApp = await prisma.application.findUnique({ where: { id: app1.id } });
    assert.equal(checkApp?.status, ApplicationStatus.OFFERED);
    assert.ok(checkApp?.offeredAt);
  }

  // Check 1.9: Candidate Joined -> 200
  {
    const req = createAuthRequest(`/api/applications/${app1.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: {
        targetStatus: ApplicationStatus.JOINED,
        note: "Onboarding completed; joined platform engineering team.",
      },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app1.id }) });
    assert.equal(res.status, 200, "Marking candidate joined must succeed");

    const checkApp = await prisma.application.findUnique({ where: { id: app1.id } });
    assert.equal(checkApp?.status, ApplicationStatus.JOINED);
    assert.ok(checkApp?.joinedAt);
  }

  // Check 1.10: Joined is terminal positive state -> cannot transition further -> 422
  {
    const req = createAuthRequest(`/api/applications/${app1.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.SOURCED },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app1.id }) });
    assert.equal(res.status, 422, "Candidate who has joined cannot transition back to SOURCED");
  }

  // Check 1.11: Chronological Timeline History Endpoint returns ordered audit records
  {
    const req = createAuthRequest(`/api/applications/${app1.id}/history`, recruiterASession.sessionToken);
    const res = await getHistoryRoute(req, { params: Promise.resolve({ id: app1.id }) });
    const json = await res.json();
    assert.equal(res.status, 200, "Fetching application history must return 200");
    assert.ok(json.timeline && json.timeline.length >= 6, "Timeline must contain full sequence of transitions");

    // Events must be ordered chronologically
    for (let i = 1; i < json.timeline.length; i++) {
      const tPrev = new Date(json.timeline[i - 1].timestamp).getTime();
      const tCurr = new Date(json.timeline[i].timestamp).getTime();
      assert.ok(tCurr >= tPrev, "Timeline items must be in strict non-decreasing chronological order");
    }
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 2: Role Permissions & Invariants
  // ------------------------------------------------------------------------------------------------
  // Candidate 2
  const candidate2 = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-PPL-${suffix.toUpperCase()}-02`,
      fullName: `Bob Developer ${suffix}`,
      currentRole: "Cloud Engineer",
      experienceYears: 4,
      keySkills: ["AWS", "Docker"],
      agencyId: agencyA.id,
    },
  });

  const app2 = await prisma.application.create({
    data: {
      candidateId: candidate2.id,
      requisitionId: req1.id,
      status: ApplicationStatus.SUBMITTED_TO_CLIENT,
      submittedAt: new Date(),
      submittedById: recruiterA.id,
      clientOrganizationId: clientA.id,
    },
  });

  // Check 2.1: Client Hiring Manager cannot mark a candidate as OFFERED directly -> 403 Forbidden
  {
    const req = createAuthRequest(`/api/applications/${app2.id}/transition`, clientASession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.OFFERED },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app2.id }) });
    assert.equal(res.status, 403, "Client hiring manager must be forbidden from directly marking candidate as OFFERED (403)");
  }

  // Check 2.2: Client Hiring Manager cannot mark a candidate as JOINED directly -> 403 Forbidden
  {
    const req = createAuthRequest(`/api/applications/${app2.id}/transition`, clientASession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.JOINED },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app2.id }) });
    assert.equal(res.status, 403, "Client hiring manager must be forbidden from directly marking candidate as JOINED (403)");
  }

  // Check 2.3: Cross-Agency isolation: Recruiter from Agency B cannot transition Agency A's application -> 403 Forbidden
  {
    const req = createAuthRequest(`/api/applications/${app2.id}/transition`, recruiterBSession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.REJECTED, reason: "Cross agency tamper" },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app2.id }) });
    assert.equal(res.status, 403, "Foreign agency recruiter cannot transition application (403)");
  }

  // Check 2.4: Delivery Head can perform authorized transitions for their agency -> 200 OK
  {
    const futureSlot = new Date(Date.now() + 96 * 3600 * 1000).toISOString();
    const req = createAuthRequest(`/api/applications/${app2.id}/transition`, deliveryHeadSession.sessionToken, {
      method: "POST",
      body: {
        targetStatus: ApplicationStatus.INTERVIEW_SCHEDULED,
        scheduledSlot: futureSlot,
        scheduledNote: "Scheduled by Delivery Head",
      },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app2.id }) });
    assert.equal(res.status, 200, "Delivery Head of owning agency must be able to perform transition");

    const checkApp = await prisma.application.findUnique({ where: { id: app2.id } });
    assert.equal(checkApp?.status, ApplicationStatus.INTERVIEW_SCHEDULED);
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 3: Terminal Rejections (Recruiter and Client)
  // ------------------------------------------------------------------------------------------------
  // Check 3.1: Rejection requires mandatory reason (>= 3 chars) -> 400 Bad Request
  {
    const req = createAuthRequest(`/api/applications/${app2.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.REJECTED, reason: "  " },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app2.id }) });
    assert.equal(res.status, 400, "Rejection without reason must return 400");
  }

  // Check 3.2: Valid agency rejection with reason -> 200 OK
  {
    const req = createAuthRequest(`/api/applications/${app2.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: {
        targetStatus: ApplicationStatus.REJECTED,
        reason: "Candidate failed technical live coding component.",
      },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app2.id }) });
    assert.equal(res.status, 200, "Valid rejection must succeed");

    const checkApp = await prisma.application.findUnique({ where: { id: app2.id } });
    assert.equal(checkApp?.status, ApplicationStatus.REJECTED);
    assert.equal(checkApp?.rejectionReason, "Candidate failed technical live coding component.");
  }

  // Check 3.3: Terminal invariant: Cannot transition an already rejected candidate -> 422
  {
    const req = createAuthRequest(`/api/applications/${app2.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.OFFERED },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: app2.id }) });
    const json = await res.json();
    assert.equal(res.status, 422, "Transitioning a rejected candidate must return 422");
    assert.equal(json.code, "INVALID_STATE_TRANSITION");
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 4: Same Candidate Associated with Multiple Requisitions (Independent Lifecycles)
  // ------------------------------------------------------------------------------------------------
  // Candidate 1 is also submitted to Requisition 2
  const appReq2 = await prisma.application.create({
    data: {
      candidateId: candidate1.id,
      requisitionId: req2.id,
      status: ApplicationStatus.SOURCED,
    },
  });

  // Candidate 1 in Requisition 1 is JOINED; in Requisition 2 Candidate 1 is SOURCED
  assert.equal(app1.status, ApplicationStatus.SOURCED); // original object was SOURCED
  const finalApp1 = await prisma.application.findUnique({ where: { id: app1.id } });
  const finalApp2Req = await prisma.application.findUnique({ where: { id: appReq2.id } });

  assert.equal(finalApp1?.status, ApplicationStatus.JOINED);
  assert.equal(finalApp2Req?.status, ApplicationStatus.SOURCED);

  // Transition candidate in Requisition 2 to REJECTED with independent reason
  {
    const req = createAuthRequest(`/api/applications/${appReq2.id}/transition`, recruiterASession.sessionToken, {
      method: "POST",
      body: {
        targetStatus: ApplicationStatus.REJECTED,
        reason: "Role closed before screening began.",
      },
    });
    const res = await transitionRoute(req, { params: Promise.resolve({ id: appReq2.id }) });
    assert.equal(res.status, 200, "Rejecting candidate on Req 2 must succeed");

    const checkApp2 = await prisma.application.findUnique({ where: { id: appReq2.id } });
    assert.equal(checkApp2?.status, ApplicationStatus.REJECTED);
    assert.equal(checkApp2?.rejectionReason, "Role closed before screening began.");

    // Verify Requisition 1 status was NOT mutated
    const checkApp1Again = await prisma.application.findUnique({ where: { id: app1.id } });
    assert.equal(checkApp1Again?.status, ApplicationStatus.JOINED);
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 5: Concurrency Control on Competing Transitions
  // ------------------------------------------------------------------------------------------------
  // Create Candidate 3 for Requisition 1, currently in INTERVIEW_COMPLETED
  const candidate3 = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-PPL-${suffix.toUpperCase()}-03`,
      fullName: `Charlie Concurrent ${suffix}`,
      currentRole: "DevOps Engineer",
      experienceYears: 6,
      keySkills: ["Terraform", "AWS"],
      agencyId: agencyA.id,
    },
  });

  const app3 = await prisma.application.create({
    data: {
      candidateId: candidate3.id,
      requisitionId: req1.id,
      status: ApplicationStatus.INTERVIEW_COMPLETED,
    },
  });

  const initialApp3AuditCount = await prisma.auditLog.count({ where: { entityId: app3.id } });

  // Fire competing OFFERED and REJECTED transitions concurrently
  const offerReq = createAuthRequest(`/api/applications/${app3.id}/transition`, recruiterASession.sessionToken, {
    method: "POST",
    body: { targetStatus: ApplicationStatus.OFFERED, note: "Top choice offer" },
  });
  const rejectCompetingReq = createAuthRequest(`/api/applications/${app3.id}/transition`, recruiterASession.sessionToken, {
    method: "POST",
    body: { targetStatus: ApplicationStatus.REJECTED, reason: "Reference check discovered discrepancy" },
  });

  const [compResA, compResB] = await Promise.all([
    transitionRoute(offerReq, { params: Promise.resolve({ id: app3.id }) }),
    transitionRoute(rejectCompetingReq, { params: Promise.resolve({ id: app3.id }) }),
  ]);

  const compStatuses = [compResA.status, compResB.status];
  assert.ok(compStatuses.includes(200), "At least one concurrent transition must succeed");

  // In all interleavings:
  // If REJECT serialized first -> REJECT is 200, OFFERED fails with 422. Final state is REJECTED.
  // If OFFERED serialized first -> OFFERED is 200, REJECT follows and sets REJECTED (200). Final state is REJECTED.
  const checkApp3 = await prisma.application.findUnique({ where: { id: app3.id } });
  assert.equal(checkApp3?.status, ApplicationStatus.REJECTED, "Final state must be REJECTED; rejection is unbreakable");

  // Audit log count must exactly equal initial + successful transitions (no rogue audit logs for 422s)
  const finalApp3AuditCount = await prisma.auditLog.count({ where: { entityId: app3.id } });
  const compSuccessCount = compStatuses.filter((s) => s === 200).length;
  assert.equal(
    finalApp3AuditCount,
    initialApp3AuditCount + compSuccessCount,
    "Audit log entries must accurately match the number of successful transitions"
  );

  // ------------------------------------------------------------------------------------------------
  // TEST 6: Pipeline Summary & Stage Counts Respecting Tenant Boundaries
  // ------------------------------------------------------------------------------------------------
  // Check 6.1: Pipeline data for Requisition 1
  {
    const req = createAuthRequest(`/api/requisitions/${req1.id}/pipeline`, recruiterASession.sessionToken);
    const res = await getPipelineRoute(req, { params: Promise.resolve({ id: req1.id }) });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(json.stageCounts);
    assert.equal(json.stageCounts.JOINED, 1, "Must have exactly 1 JOINED candidate");
    assert.equal(json.stageCounts.REJECTED, 2, "Must have exactly 2 REJECTED candidates (app2 + app3)");
  }

  // Check 6.2: Client Hiring Manager sees masked contact info & only submitted candidates
  {
    const req = createAuthRequest(`/api/requisitions/${req1.id}/pipeline`, clientASession.sessionToken);
    const res = await getPipelineRoute(req, { params: Promise.resolve({ id: req1.id }) });
    const json = await res.json();
    assert.equal(res.status, 200);
    for (const appItem of json.applications) {
      assert.equal(appItem.fullName, undefined, "Client hiring manager must NOT see candidate full name");
      assert.equal(appItem.email, undefined, "Client hiring manager must NOT see candidate email");
      assert.equal(appItem.phone, undefined, "Client hiring manager must NOT see candidate phone");
      assert.ok(appItem.candidateReference, "Pseudonymous reference must be provided");
    }
  }

  // Check 6.3: Foreign agency recruiter cannot view Requisition 1's pipeline -> 403 Forbidden
  {
    const req = createAuthRequest(`/api/requisitions/${req1.id}/pipeline`, recruiterBSession.sessionToken);
    const res = await getPipelineRoute(req, { params: Promise.resolve({ id: req1.id }) });
    assert.equal(res.status, 403, "Foreign agency recruiter cannot view pipeline (403)");
  }

  // Check 6.4: Agency pipeline aggregate summary
  {
    const req = createAuthRequest("/api/pipeline/summary", recruiterASession.sessionToken);
    const res = await getSummaryRoute(req);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(json.summaryCounts);
    assert.ok(json.summaryCounts.TOTAL >= 3);
  }

  // Check 6.5: Client hiring manager cannot access agency pipeline summary -> 403 Forbidden
  {
    const req = createAuthRequest("/api/pipeline/summary", clientASession.sessionToken);
    const res = await getSummaryRoute(req);
    assert.equal(res.status, 403, "Client hiring manager must be forbidden from agency pipeline summary");
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 7: AI Score does NOT auto-advance or auto-reject
  // ------------------------------------------------------------------------------------------------
  const candidate4 = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-PPL-${suffix.toUpperCase()}-04`,
      fullName: `Diana Junior ${suffix}`,
      currentRole: "Junior Developer",
      experienceYears: 1,
      keySkills: ["HTML"],
      agencyId: agencyA.id,
    },
  });

  const app4 = await prisma.application.create({
    data: {
      candidateId: candidate4.id,
      requisitionId: req1.id,
      status: ApplicationStatus.SOURCED,
    },
  });

  // AI produces a failing evaluation with must-have warnings
  await prisma.evaluation.create({
    data: {
      agencyId: agencyA.id,
      requisitionId: req1.id,
      candidateId: candidate4.id,
      applicationId: app4.id,
      status: "COMPLETED",
      overallScore: 18, // Very low score
      evidenceCoverage: 20,
      hasMustHaveWarnings: true,
      mustHaveWarnings: ["Missing 5+ years Go experience", "Missing Kubernetes experience"],
      isReviewedByRecruiter: false,
      provider: "mock",
      modelId: "mock-v1",
      promptVersion: "v1.0",
    },
  });

  // Verify application status is STILL SOURCED - AI evaluation did NOT auto-reject!
  const checkApp4 = await prisma.application.findUnique({ where: { id: app4.id } });
  assert.equal(
    checkApp4?.status,
    ApplicationStatus.SOURCED,
    "AI evaluation must NEVER auto-reject or auto-advance an application; human recruiter control is mandatory"
  );
});

test("Milestone 6.1: Pipeline Security and Lifecycle Acceptance Audit", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  // 1. Setup Organizations: Agency Alpha, Client 1, Client 2
  const agencyA = await prisma.organization.create({
    data: { name: `Agency Alpha M61 ${suffix}`, type: OrganizationType.AGENCY },
  });
  const client1 = await prisma.organization.create({
    data: { name: `Client One M61 ${suffix}`, type: OrganizationType.CLIENT, agencyId: agencyA.id },
  });
  const client2 = await prisma.organization.create({
    data: { name: `Client Two M61 ${suffix}`, type: OrganizationType.CLIENT, agencyId: agencyA.id },
  });

  // 2. Setup Users
  const recruiterA = await prisma.user.create({
    data: {
      name: `Recruiter Alpha ${suffix}`,
      email: `recruiter.a.${suffix}@agency-m61.com`,
      role: UserRole.RECRUITER,
      organizationId: agencyA.id,
      isActive: true,
    },
  });
  const clientMgr1 = await prisma.user.create({
    data: {
      name: `Client Mgr 1 ${suffix}`,
      email: `mgr.1.${suffix}@client1-m61.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: client1.id,
      isActive: true,
    },
  });
  const clientMgr2 = await prisma.user.create({
    data: {
      name: `Client Mgr 2 ${suffix}`,
      email: `mgr.2.${suffix}@client2-m61.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: client2.id,
      isActive: true,
    },
  });

  const recruiterSession = await createSession(recruiterA.id);
  const client1Session = await createSession(clientMgr1.id);
  const client2Session = await createSession(clientMgr2.id);

  // 3. Setup Requisitions
  // Req 1 assigned to Client 1
  const req1 = await prisma.requisition.create({
    data: {
      title: `Senior Platform Engineer ${suffix}`,
      jobDescription: "Requires extensive platform engineering experience in Kubernetes and Go.",
      organizationId: agencyA.id,
      clientOrganizationId: client1.id,
      createdById: recruiterA.id,
      status: RequisitionStatus.ACTIVE,
      scorecardCriteria: {
        create: [
          { name: "Kubernetes", weight: 60, isMustHave: true },
          { name: "Go", weight: 40, isMustHave: false },
        ],
      },
    },
  });

  // Req 2 assigned to Client 2
  const req2 = await prisma.requisition.create({
    data: {
      title: `Lead Security Architect ${suffix}`,
      jobDescription: "Requires extensive enterprise security architecture and compliance experience.",
      organizationId: agencyA.id,
      clientOrganizationId: client2.id,
      createdById: recruiterA.id,
      status: RequisitionStatus.ACTIVE,
      scorecardCriteria: {
        create: [
          { name: "Security Architecture", weight: 100, isMustHave: true },
        ],
      },
    },
  });

  // 4. Setup Candidates
  const candA = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-M61-${suffix.toUpperCase()}-01`,
      fullName: `Alice Sub ${suffix}`,
      currentRole: "Platform Eng",
      experienceYears: 6,
      keySkills: ["Kubernetes", "Go"],
      agencyId: agencyA.id,
    },
  });

  const candB = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-M61-${suffix.toUpperCase()}-02`,
      fullName: `Bob Unsourced ${suffix}`,
      currentRole: "Backend Eng",
      experienceYears: 4,
      keySkills: ["Python"],
      agencyId: agencyA.id,
    },
  });

  const candC = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-M61-${suffix.toUpperCase()}-03`,
      fullName: `Charlie ClientTwo ${suffix}`,
      currentRole: "SecOps",
      experienceYears: 8,
      keySkills: ["Security"],
      agencyId: agencyA.id,
    },
  });

  // Candidate A: submitted to Client 1 on Req 1
  const appA = await prisma.application.create({
    data: {
      candidateId: candA.id,
      requisitionId: req1.id,
      clientOrganizationId: client1.id,
      status: ApplicationStatus.SUBMITTED_TO_CLIENT,
      submittedAt: new Date(),
      submittedById: recruiterA.id,
    },
  });

  // Candidate B: on Req 1, but only SOURCED (not submitted)
  const appB = await prisma.application.create({
    data: {
      candidateId: candB.id,
      requisitionId: req1.id,
      clientOrganizationId: null,
      status: ApplicationStatus.SOURCED,
    },
  });

  // Candidate C: on Req 2, submitted to Client 2, advanced to OFFERED
  const appC = await prisma.application.create({
    data: {
      candidateId: candC.id,
      requisitionId: req2.id,
      clientOrganizationId: client2.id,
      status: ApplicationStatus.OFFERED,
      submittedAt: new Date(),
      submittedById: recruiterA.id,
      offeredAt: new Date(),
    },
  });

  // ------------------------------------------------------------------------------------------------
  // AUDIT 1: Client Visibility & Extended Status Scoping
  // ------------------------------------------------------------------------------------------------
  // 1.1 Client 1 can only see Candidate A in Req 1 pipeline (Candidate B is shielded)
  {
    const req = createAuthRequest(`/api/requisitions/${req1.id}/pipeline`, client1Session.sessionToken);
    const res = await getPipelineRoute(req, { params: Promise.resolve({ id: req1.id }) });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.applications.length, 1);
    assert.equal(data.applications[0].id, appA.id);
    assert.equal(data.applications[0].fullName, undefined, "PII must be masked for client");
    assert.equal(data.stageCounts.SOURCED, 0, "Unsubmitted SOURCED stage count must be shielded from client");
    assert.equal(data.stageCounts.SUBMITTED_TO_CLIENT, 1);
  }

  // 1.2 Client 1 cannot access Req 2's pipeline (assigned to Client 2) -> 404
  {
    const req = createAuthRequest(`/api/requisitions/${req2.id}/pipeline`, client1Session.sessionToken);
    const res = await getPipelineRoute(req, { params: Promise.resolve({ id: req2.id }) });
    assert.equal(res.status, 404, "Client 1 cannot access Client 2's pipeline");
  }

  // 1.3 Client 1 cannot access Req 2's scorecard (assigned to Client 2, despite OFFERED candidate) -> 404
  {
    const req = createAuthRequest(`/api/requisitions/${req2.id}/scorecard`, client1Session.sessionToken);
    const res = await getScorecardRoute(req, { params: Promise.resolve({ id: req2.id }) });
    assert.equal(res.status, 404, "Client 1 cannot access Client 2's requisition scorecard");
  }

  // 1.4 Client 1 cannot view timeline history for Candidate C (submitted to Client 2) -> 404
  {
    const req = createAuthRequest(`/api/applications/${appC.id}/history`, client1Session.sessionToken);
    const res = await getHistoryRoute(req, { params: Promise.resolve({ id: appC.id }) });
    assert.equal(res.status, 404, "Client 1 cannot access history of Candidate C submitted to Client 2");
  }

  // 1.5 Client 1 cannot view timeline history for Candidate B (unsubmitted SOURCED) -> 404
  {
    const req = createAuthRequest(`/api/applications/${appB.id}/history`, client1Session.sessionToken);
    const res = await getHistoryRoute(req, { params: Promise.resolve({ id: appB.id }) });
    assert.equal(res.status, 404, "Client 1 cannot access history of unsubmitted Candidate B");
  }

  // ------------------------------------------------------------------------------------------------
  // AUDIT 2: Information Masking in Pipeline & Timeline Queries
  // ------------------------------------------------------------------------------------------------
  // Recruiter advances Candidate A: SUBMITTED_TO_CLIENT -> CLIENT_SHORTLISTED -> INTERVIEW_SCHEDULED
  // First, simulate Client 1 shortlisting Candidate A
  await prisma.application.update({
    where: { id: appA.id },
    data: { status: ApplicationStatus.CLIENT_SHORTLISTED },
  });

  // Next, Recruiter schedules interview with internal notes
  const scheduledSlotTime = new Date(Date.now() + 86400000).toISOString();
  const scheduleRes = await transitionRoute(
    createAuthRequest(`/api/applications/${appA.id}/transition`, recruiterSession.sessionToken, {
      method: "POST",
      body: {
        targetStatus: ApplicationStatus.INTERVIEW_SCHEDULED,
        scheduledSlot: scheduledSlotTime,
        scheduledNote: "INTERNAL_PREP_INTERVIEW_NOTE",
        note: "CONFIDENTIAL_RECRUITER_OBSERVATION",
      },
    }),
    { params: Promise.resolve({ id: appA.id }) }
  );
  assert.equal(scheduleRes.status, 200);

  // Add an internal ORIGINAL_CV_VIEWED audit log for Candidate A
  await prisma.auditLog.create({
    data: {
      action: "ORIGINAL_CV_VIEWED",
      actorId: recruiterA.id,
      organizationId: agencyA.id,
      entityType: "Application",
      entityId: appA.id,
      metadata: { reason: "Internal review" },
    },
  });

  // 2.1 Client 1 inspects timeline history: internal recruiter notes and CV viewed events MUST be omitted
  {
    const req = createAuthRequest(`/api/applications/${appA.id}/history`, client1Session.sessionToken);
    const res = await getHistoryRoute(req, { params: Promise.resolve({ id: appA.id }) });
    assert.equal(res.status, 200);
    const data = await res.json();

    // Verify application-level note masking
    assert.equal(data.application.interviewScheduledNote, null, "Internal interviewScheduledNote must be null for clients");
    assert.ok(data.application.interviewScheduledSlot, "Public interviewScheduledSlot must be visible");

    // Verify timeline event sanitization
    const cvViewedEvents = data.timeline.filter((e: any) => e.event === "ORIGINAL_CV_VIEWED");
    assert.equal(cvViewedEvents.length, 0, "ORIGINAL_CV_VIEWED must be strictly omitted from client timeline");

    const appCreatedEvents = data.timeline.filter((e: any) => e.event === "APPLICATION_CREATED");
    assert.equal(appCreatedEvents.length, 0, "APPLICATION_CREATED must be omitted from client timeline");

    // Verify confidential recruiter notes are not in details of any timeline item
    for (const item of data.timeline) {
      const detailsStr = JSON.stringify(item.details || {});
      assert.ok(
        !detailsStr.includes("CONFIDENTIAL_RECRUITER_OBSERVATION"),
        "Recruiter internal notes must never leak to client timeline"
      );
    }
  }

  // 2.2 Internal agency rejection reason must NOT leak to client
  // Recruiter rejects Candidate A: INTERVIEW_SCHEDULED -> REJECTED with internal reason
  const rejectRes = await transitionRoute(
    createAuthRequest(`/api/applications/${appA.id}/transition`, recruiterSession.sessionToken, {
      method: "POST",
      body: {
        targetStatus: ApplicationStatus.REJECTED,
        reason: "INTERNAL_DISQUALIFIED_BY_HEAD_OF_DELIVERY",
        note: "Internal delivery head disqualification note",
      },
    }),
    { params: Promise.resolve({ id: appA.id }) }
  );
  assert.equal(rejectRes.status, 200);

  // Client 1 inspects history of agency-rejected Candidate A:
  // Must return 404 (REJECTED is an agency-internal status shielded from clients)
  {
    const req = createAuthRequest(`/api/applications/${appA.id}/history`, client1Session.sessionToken);
    const res = await getHistoryRoute(req, { params: Promise.resolve({ id: appA.id }) });
    assert.equal(res.status, 404, "Agency-rejected candidate is shielded from client portal (404)");
  }

  // Recruiter inspects history: returns 200 with full agency rejection reason
  {
    const req = createAuthRequest(`/api/applications/${appA.id}/history`, recruiterSession.sessionToken);
    const res = await getHistoryRoute(req, { params: Promise.resolve({ id: appA.id }) });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.application.rejectionReason, "INTERNAL_DISQUALIFIED_BY_HEAD_OF_DELIVERY");
  }

  // 2.3 Client decision rejection: CLIENT_REJECTED is client-visible, but agency notes are masked
  const candD = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-M61-${suffix.toUpperCase()}-04`,
      fullName: `David ClientRej ${suffix}`,
      agencyId: agencyA.id,
    },
  });
  const appD = await prisma.application.create({
    data: {
      candidateId: candD.id,
      requisitionId: req1.id,
      clientOrganizationId: client1.id,
      status: ApplicationStatus.SUBMITTED_TO_CLIENT,
      submittedAt: new Date(),
      submittedById: recruiterA.id,
    },
  });

  const clientRejRes = await clientDecisionRoute(
    createAuthRequest(`/api/client/applications/${appD.id}/decision`, client1Session.sessionToken, {
      method: "POST",
      body: { decision: "REJECT", rejectionReason: "Candidate does not have sufficient domain experience." },
    }),
    { params: Promise.resolve({ id: appD.id }) }
  );
  assert.equal(clientRejRes.status, 200);

  // Client 1 inspects history of CLIENT_REJECTED appD
  {
    const req = createAuthRequest(`/api/applications/${appD.id}/history`, client1Session.sessionToken);
    const res = await getHistoryRoute(req, { params: Promise.resolve({ id: appD.id }) });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.application.clientRejectionReason, "Candidate does not have sufficient domain experience.");
    assert.equal(data.application.rejectionReason, null, "Agency internal rejectionReason must be null");
  }

  // ------------------------------------------------------------------------------------------------
  // AUDIT 3: Direct & Nested API Authorization & State Transition Barriers
  // ------------------------------------------------------------------------------------------------
  // Create an active, client-visible application (appE) submitted to Client 1
  const candE = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-M61-${suffix.toUpperCase()}-05`,
      fullName: `Emma Visible ${suffix}`,
      agencyId: agencyA.id,
    },
  });
  const appE = await prisma.application.create({
    data: {
      candidateId: candE.id,
      requisitionId: req1.id,
      clientOrganizationId: client1.id,
      status: ApplicationStatus.SUBMITTED_TO_CLIENT,
      submittedAt: new Date(),
      submittedById: recruiterA.id,
    },
  });

  // 3.1 Client Hiring Manager cannot invoke recruiter transitions directly -> 403 Forbidden
  // Test direct non-nested route on client-visible appE:
  for (const forbiddenStatus of [
    ApplicationStatus.OFFERED,
    ApplicationStatus.INTERVIEW_SCHEDULED,
    ApplicationStatus.JOINED,
    ApplicationStatus.SCREENED,
    ApplicationStatus.REJECTED,
  ]) {
    const res = await transitionRoute(
      createAuthRequest(`/api/applications/${appE.id}/transition`, client1Session.sessionToken, {
        method: "POST",
        body: { targetStatus: forbiddenStatus, reason: "Unauthorized attempt" },
      }),
      { params: Promise.resolve({ id: appE.id }) }
    );
    assert.equal(
      res.status,
      403,
      `Client hiring manager must receive 403 when attempting direct transition to ${forbiddenStatus}`
    );
  }

  // 3.2 Test nested route: Client cannot invoke recruiter transitions via nested route -> 403
  {
    const res = await nestedTransitionRoute(
      createAuthRequest(
        `/api/requisitions/${req1.id}/applications/${appE.id}/transition`,
        client1Session.sessionToken,
        {
          method: "POST",
          body: { targetStatus: ApplicationStatus.OFFERED },
        }
      ),
      { params: Promise.resolve({ id: req1.id, applicationId: appE.id }) }
    );
    assert.equal(res.status, 403, "Client hiring manager must receive 403 on nested transition to OFFERED");
  }

  // 3.3 Nested routes verify requisition ID matches application.requisitionId -> 404 on mismatch
  {
    // Calling nested transition for appE (which belongs to req1) under req2's URL path:
    const res = await nestedTransitionRoute(
      createAuthRequest(
        `/api/requisitions/${req2.id}/applications/${appE.id}/transition`,
        recruiterSession.sessionToken,
        {
          method: "POST",
          body: { targetStatus: ApplicationStatus.SCREENED },
        }
      ),
      { params: Promise.resolve({ id: req2.id, applicationId: appE.id }) }
    );
    assert.equal(res.status, 404, "Nested transition with mismatched requisition ID must return 404");
  }

  {
    // Calling nested history for appE under req2's URL path:
    const res = await getNestedHistoryRoute(
      createAuthRequest(
        `/api/requisitions/${req2.id}/applications/${appE.id}/history`,
        recruiterSession.sessionToken
      ),
      { params: Promise.resolve({ id: req2.id, applicationId: appE.id }) }
    );
    assert.equal(res.status, 404, "Nested history with mismatched requisition ID must return 404");
  }

  // ------------------------------------------------------------------------------------------------
  // AUDIT 4: Terminal State Immutability
  // ------------------------------------------------------------------------------------------------
  // Candidate A is now in REJECTED status (terminal). Verify no transitions can modify it:
  {
    const res = await transitionRoute(
      createAuthRequest(`/api/applications/${appA.id}/transition`, recruiterSession.sessionToken, {
        method: "POST",
        body: { targetStatus: ApplicationStatus.OFFERED },
      }),
      { params: Promise.resolve({ id: appA.id }) }
    );
    assert.equal(res.status, 422, "Terminal REJECTED state cannot transition to OFFERED (422)");
  }

  // Agency-rejected appA is completely shielded from client decisions (404)
  {
    const res = await clientDecisionRoute(
      createAuthRequest(`/api/client/applications/${appA.id}/decision`, client1Session.sessionToken, {
        method: "POST",
        body: { decision: "SHORTLIST" },
      }),
      { params: Promise.resolve({ id: appA.id }) }
    );
    assert.equal(res.status, 404, "Agency REJECTED state is shielded from client portal decisions (404)");
  }

  // Client-rejected appD cannot be shortlisted or transitioned out of rejection (422)
  {
    const res = await clientDecisionRoute(
      createAuthRequest(`/api/client/applications/${appD.id}/decision`, client1Session.sessionToken, {
        method: "POST",
        body: { decision: "SHORTLIST" },
      }),
      { params: Promise.resolve({ id: appD.id }) }
    );
    assert.equal(res.status, 422, "Terminal CLIENT_REJECTED state cannot be shortlisted by client (422)");
  }

  // Verify Candidate C in OFFERED -> transition to JOINED
  const joinRes = await transitionRoute(
    createAuthRequest(`/api/applications/${appC.id}/transition`, recruiterSession.sessionToken, {
      method: "POST",
      body: { targetStatus: ApplicationStatus.JOINED },
    }),
    { params: Promise.resolve({ id: appC.id }) }
  );
  assert.equal(joinRes.status, 200);

  // Now Candidate C is JOINED (terminal). Verify it cannot transition to REJECTED or OFFERED:
  {
    const res = await transitionRoute(
      createAuthRequest(`/api/applications/${appC.id}/transition`, recruiterSession.sessionToken, {
        method: "POST",
        body: { targetStatus: ApplicationStatus.REJECTED, reason: "Disqualified after join" },
      }),
      { params: Promise.resolve({ id: appC.id }) }
    );
    assert.equal(res.status, 422, "Terminal JOINED state cannot transition to REJECTED (422)");
  }

  // ------------------------------------------------------------------------------------------------
  // AUDIT 5: Multi-Requisition Candidate Independence
  // ------------------------------------------------------------------------------------------------
  // Attach Candidate A to Requisition 2 (separate application)
  const appA2 = await prisma.application.create({
    data: {
      candidateId: candA.id,
      requisitionId: req2.id,
      clientOrganizationId: client2.id,
      status: ApplicationStatus.SUBMITTED_TO_CLIENT,
      submittedAt: new Date(),
      submittedById: recruiterA.id,
    },
  });

  // Verify Candidate A is REJECTED on Req 1, but SUBMITTED_TO_CLIENT on Req 2:
  const checkAppA1 = await prisma.application.findUnique({ where: { id: appA.id } });
  const checkAppA2 = await prisma.application.findUnique({ where: { id: appA2.id } });
  assert.equal(checkAppA1?.status, ApplicationStatus.REJECTED);
  assert.equal(checkAppA2?.status, ApplicationStatus.SUBMITTED_TO_CLIENT);

  // Advance appA2 to INTERVIEW_SCHEDULED
  const a2Slot = new Date(Date.now() + 172800000).toISOString();
  const advanceRes = await transitionRoute(
    createAuthRequest(`/api/applications/${appA2.id}/transition`, recruiterSession.sessionToken, {
      method: "POST",
      body: {
        targetStatus: ApplicationStatus.INTERVIEW_SCHEDULED,
        scheduledSlot: a2Slot,
      },
    }),
    { params: Promise.resolve({ id: appA2.id }) }
  );
  assert.equal(advanceRes.status, 200);

  const checkAppA1After = await prisma.application.findUnique({ where: { id: appA.id } });
  const checkAppA2After = await prisma.application.findUnique({ where: { id: appA2.id } });
  assert.equal(checkAppA1After?.status, ApplicationStatus.REJECTED, "Req 1 status must remain unaffected");
  assert.equal(checkAppA2After?.status, ApplicationStatus.INTERVIEW_SCHEDULED, "Req 2 status independently progressed");
});

