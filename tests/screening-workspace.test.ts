import test from "node:test";
import assert from "node:assert/strict";
import {
  PrismaClient,
  UserRole,
  OrganizationType,
  DocumentProcessingStatus,
} from "@prisma/client";
import { NextRequest } from "next/server";
import crypto from "crypto";

import { createSession, SESSION_COOKIE_NAME } from "../src/lib/auth";
import { getStorageProvider } from "../src/lib/storage";
import { GET as downloadDocumentRoute } from "../src/app/api/documents/[id]/download/route";
import { POST as reviewEvaluationRoute } from "../src/app/api/evaluations/[id]/review/route";
import { GET as getEvaluationDetailRoute } from "../src/app/api/evaluations/[id]/route";
import { GET as getRequisitionEvaluationsRoute } from "../src/app/api/requisitions/[id]/evaluations/route";
import { GET as getRequisitionCandidatesRoute } from "../src/app/api/requisitions/[id]/candidates/route";
import { POST as screenRoute } from "../src/app/api/requisitions/[id]/screen/route";
import { getScreeningProvider } from "../src/lib/screening/provider";

const prisma = new PrismaClient();

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

test("Milestone 4: Original CV Download & Inspection Audit Logging", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  const agency = await prisma.organization.create({
    data: { name: `Agency WS ${suffix}`, type: OrganizationType.AGENCY },
  });

  const recruiter = await prisma.user.create({
    data: {
      name: `Recruiter WS ${suffix}`,
      email: `recruiter.ws.${suffix}@test.com`,
      role: UserRole.RECRUITER,
      organizationId: agency.id,
    },
  });
  const recruiterSession = await createSession(recruiter.id);

  const clientOrg = await prisma.organization.create({
    data: { name: `Client WS ${suffix}`, type: OrganizationType.CLIENT },
  });

  const clientUser = await prisma.user.create({
    data: {
      name: `Hiring Mgr WS ${suffix}`,
      email: `client.ws.${suffix}@test.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientOrg.id,
    },
  });
  const clientSession = await createSession(clientUser.id);

  // Store a sample PDF file in storage
  const storage = getStorageProvider();
  const testStorageKey = `ws_test_doc_${suffix}.pdf`;
  const pdfBytes = Buffer.from("%PDF-1.4 sample content for recruiter preview");
  await storage.put(testStorageKey, pdfBytes);

  const candidate = await prisma.candidate.create({
    data: {
      candidateReference: `CND-WS-${suffix}`,
      agencyId: agency.id,
      fullName: `Test Candidate ${suffix}`,
      uploadedDocuments: {
        create: {
          agencyId: agency.id,
          fileName: "resume.pdf",
          fileType: "application/pdf",
          fileSizeBytes: pdfBytes.length,
          storageKey: testStorageKey,
          fileHash: crypto.randomBytes(16).toString("hex"),
          processingStatus: DocumentProcessingStatus.EXTRACTED,
          extractedText: "Experienced Cloud Engineer with Kubernetes, AWS, and TypeScript expertise.",
        },
      },
    },
    include: {
      uploadedDocuments: true,
    },
  });

  const docId = candidate.uploadedDocuments[0].id;

  // 1. Client Hiring Manager tries to download -> 403 Forbidden
  const clientReq = createAuthRequest(
    `http://localhost:3000/api/documents/${docId}/download`,
    clientSession.sessionToken
  );
  const clientRes = await downloadDocumentRoute(clientReq, {
    params: Promise.resolve({ id: docId }),
  });
  assert.equal(clientRes.status, 403);

  // 2. Recruiter downloads with ?view=inline -> 200 OK and inline Content-Disposition
  const inlineReq = createAuthRequest(
    `http://localhost:3000/api/documents/${docId}/download?view=inline`,
    recruiterSession.sessionToken
  );
  const inlineRes = await downloadDocumentRoute(inlineReq, {
    params: Promise.resolve({ id: docId }),
  });
  assert.equal(inlineRes.status, 200);
  const inlineDisp = inlineRes.headers.get("Content-Disposition");
  assert.ok(inlineDisp?.includes("inline;"));

  // Verify AuditLog entry for ORIGINAL_CV_VIEWED
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entityType: "UploadedDocument",
      entityId: docId,
      action: "ORIGINAL_CV_VIEWED",
    },
  });
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].actorId, recruiter.id);
  assert.equal((auditLogs[0].metadata as any)?.viewMode, "inline");

  // 3. Recruiter downloads with attachment default
  const attachReq = createAuthRequest(
    `http://localhost:3000/api/documents/${docId}/download`,
    recruiterSession.sessionToken
  );
  const attachRes = await downloadDocumentRoute(attachReq, {
    params: Promise.resolve({ id: docId }),
  });
  assert.equal(attachRes.status, 200);
  const attachDisp = attachRes.headers.get("Content-Disposition");
  assert.ok(attachDisp?.includes("attachment;"));
});

test("Milestone 4: Recruiter Review Prerequisite & Notes Invariant", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  const agency = await prisma.organization.create({
    data: { name: `Agency Rev ${suffix}`, type: OrganizationType.AGENCY },
  });

  const recruiter = await prisma.user.create({
    data: {
      name: `Reviewer ${suffix}`,
      email: `reviewer.${suffix}@test.com`,
      role: UserRole.RECRUITER,
      organizationId: agency.id,
    },
  });
  const session = await createSession(recruiter.id);

  const storage = getStorageProvider();
  const testStorageKey = `rev_doc_${suffix}.pdf`;
  const pdfBytes = Buffer.from("%PDF-1.4 sample CV text for screening verification");
  await storage.put(testStorageKey, pdfBytes);

  const req = await prisma.requisition.create({
    data: {
      title: `Full Stack Lead ${suffix}`,
      jobDescription: "Requires expertise in full-stack Node.js and React architecture.",
      organizationId: agency.id,
      createdById: recruiter.id,
      scorecardCriteria: {
        create: [
          { name: "Node.js", weight: 50, isMustHave: true },
          { name: "React", weight: 50, isMustHave: false },
        ],
      },
    },
  });

  const cand = await prisma.candidate.create({
    data: {
      candidateReference: `CND-REV-${suffix}`,
      agencyId: agency.id,
      fullName: `Candidate Rev ${suffix}`,
      uploadedDocuments: {
        create: {
          agencyId: agency.id,
          fileName: "cv.pdf",
          fileType: "application/pdf",
          storageKey: testStorageKey,
          fileHash: crypto.randomBytes(16).toString("hex"),
          processingStatus: DocumentProcessingStatus.EXTRACTED,
          extractedText: "7 years of Node.js backend development and React modern frontend architectures.",
        },
      },
    },
    include: { uploadedDocuments: true },
  });

  const docId = cand.uploadedDocuments[0].id;

  // Screen the candidate to create an evaluation
  const screenReq = createAuthRequest(
    `http://localhost:3000/api/requisitions/${req.id}/screen`,
    session.sessionToken,
    { method: "POST", body: { candidateId: cand.id } }
  );
  const screenRes = await screenRoute(screenReq, {
    params: Promise.resolve({ id: req.id }),
  });
  assert.equal(screenRes.status, 200);
  const screenData = await screenRes.json();
  const evaluationId = screenData.evaluations[0].evaluationId;

  // Step 1: Query evaluation detail -> hasCVBeenViewed should be false
  const detailReq1 = createAuthRequest(
    `http://localhost:3000/api/evaluations/${evaluationId}`,
    session.sessionToken
  );
  const detailRes1 = await getEvaluationDetailRoute(detailReq1, {
    params: Promise.resolve({ id: evaluationId }),
  });
  assert.equal(detailRes1.status, 200);
  const detailData1 = await detailRes1.json();
  assert.equal(detailData1.evaluation.hasCVBeenViewed, false);
  assert.equal(detailData1.evaluation.isReviewedByRecruiter, false);

  // Step 2: Attempt review without inspecting CV -> 428 Precondition Required
  const reviewReqFail = createAuthRequest(
    `http://localhost:3000/api/evaluations/${evaluationId}/review`,
    session.sessionToken,
    { method: "POST", body: { notes: "Premature review" } }
  );
  const reviewResFail = await reviewEvaluationRoute(reviewReqFail, {
    params: Promise.resolve({ id: evaluationId }),
  });
  assert.equal(reviewResFail.status, 428);
  const failData = await reviewResFail.json();
  assert.equal(failData.code, "CV_NOT_VIEWED");

  // Step 3: Recruiter inspects the CV via download route
  const cvDownloadReq = createAuthRequest(
    `http://localhost:3000/api/documents/${docId}/download?view=inline`,
    session.sessionToken
  );
  const cvDownloadRes = await downloadDocumentRoute(cvDownloadReq, {
    params: Promise.resolve({ id: docId }),
  });
  assert.equal(cvDownloadRes.status, 200);

  // Step 4: Query evaluation detail again -> hasCVBeenViewed should now be true
  const detailReq2 = createAuthRequest(
    `http://localhost:3000/api/evaluations/${evaluationId}`,
    session.sessionToken
  );
  const detailRes2 = await getEvaluationDetailRoute(detailReq2, {
    params: Promise.resolve({ id: evaluationId }),
  });
  assert.equal(detailRes2.status, 200);
  const detailData2 = await detailRes2.json();
  assert.equal(detailData2.evaluation.hasCVBeenViewed, true);

  // Step 5: Recruiter marks evaluation as reviewed with notes -> 200 OK
  const reviewReqSuccess = createAuthRequest(
    `http://localhost:3000/api/evaluations/${evaluationId}/review`,
    session.sessionToken,
    { method: "POST", body: { notes: "Verified GitHub portfolio and validated Node.js depth." } }
  );
  const reviewResSuccess = await reviewEvaluationRoute(reviewReqSuccess, {
    params: Promise.resolve({ id: evaluationId }),
  });
  assert.equal(reviewResSuccess.status, 200);
  const successData = await reviewResSuccess.json();
  assert.equal(successData.success, true);
  assert.equal(successData.evaluation.isReviewedByRecruiter, true);
  assert.equal(successData.evaluation.reviewedById, recruiter.id);
  assert.ok(successData.evaluation.reviewedAt);

  // Step 6: Verify AuditLog contains RECRUITER_EVALUATION_REVIEWED with notes
  const reviewAuditLog = await prisma.auditLog.findFirst({
    where: {
      entityType: "Evaluation",
      entityId: evaluationId,
      action: "RECRUITER_EVALUATION_REVIEWED",
    },
  });
  assert.ok(reviewAuditLog);
  assert.equal((reviewAuditLog.metadata as any)?.notes, "Verified GitHub portfolio and validated Node.js depth.");
});

test("Milestone 4: Requisition Evaluations Overview & Candidate Pool APIs", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  const agency = await prisma.organization.create({
    data: { name: `Agency API ${suffix}`, type: OrganizationType.AGENCY },
  });

  const recruiter = await prisma.user.create({
    data: {
      name: `Recruiter API ${suffix}`,
      email: `recruiter.api.${suffix}@test.com`,
      role: UserRole.RECRUITER,
      organizationId: agency.id,
    },
  });
  const session = await createSession(recruiter.id);

  const req = await prisma.requisition.create({
    data: {
      title: `Principal Engineer ${suffix}`,
      jobDescription: "Requires expertise in distributed system design and technical mentorship.",
      organizationId: agency.id,
      createdById: recruiter.id,
      scorecardCriteria: {
        create: [
          { name: "System Design", weight: 60, isMustHave: true },
          { name: "Mentorship", weight: 40, isMustHave: false },
        ],
      },
    },
  });

  // Candidate 1: Ready
  const candReady = await prisma.candidate.create({
    data: {
      candidateReference: `CND-READY-${suffix}`,
      agencyId: agency.id,
      fullName: `Alice Ready ${suffix}`,
      currentRole: "Staff Engineer",
      experienceYears: 10,
      uploadedDocuments: {
        create: {
          agencyId: agency.id,
          fileName: "alice_cv.pdf",
          fileType: "application/pdf",
          storageKey: `alice_${suffix}.pdf`,
          fileHash: crypto.randomBytes(16).toString("hex"),
          processingStatus: DocumentProcessingStatus.EXTRACTED,
          extractedText: "10 years designing high-throughput distributed architectures and mentoring 12 senior engineers.",
        },
      },
    },
  });

  // Candidate 2: Scanned OCR Required
  const candScanned = await prisma.candidate.create({
    data: {
      candidateReference: `CND-SCAN-${suffix}`,
      agencyId: agency.id,
      fullName: `Bob Scanned ${suffix}`,
      uploadedDocuments: {
        create: {
          agencyId: agency.id,
          fileName: "bob_scan.pdf",
          fileType: "application/pdf",
          storageKey: `bob_${suffix}.pdf`,
          fileHash: crypto.randomBytes(16).toString("hex"),
          processingStatus: DocumentProcessingStatus.SCANNED_UNREADABLE,
          extractedText: "",
        },
      },
    },
  });

  // Candidate 3: Extraction Failed
  const candFailed = await prisma.candidate.create({
    data: {
      candidateReference: `CND-FAIL-${suffix}`,
      agencyId: agency.id,
      fullName: `Charlie Fail ${suffix}`,
      uploadedDocuments: {
        create: {
          agencyId: agency.id,
          fileName: "charlie_cv.docx",
          fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          storageKey: `charlie_${suffix}.docx`,
          fileHash: crypto.randomBytes(16).toString("hex"),
          processingStatus: DocumentProcessingStatus.FAILED,
          extractedText: "",
        },
      },
    },
  });

  // Candidate Pool API Test: GET /api/requisitions/[id]/candidates
  const candPoolReq = createAuthRequest(
    `http://localhost:3000/api/requisitions/${req.id}/candidates`,
    session.sessionToken
  );
  const candPoolRes = await getRequisitionCandidatesRoute(candPoolReq, {
    params: Promise.resolve({ id: req.id }),
  });
  assert.equal(candPoolRes.status, 200);
  const poolData = await candPoolRes.json();
  assert.equal(poolData.success, true);

  const aliceInPool = poolData.candidates.find((c: any) => c.id === candReady.id);
  assert.equal(aliceInPool?.readiness, "READY");

  const bobInPool = poolData.candidates.find((c: any) => c.id === candScanned.id);
  assert.equal(bobInPool?.readiness, "OCR_REQUIRED");

  const charlieInPool = poolData.candidates.find((c: any) => c.id === candFailed.id);
  assert.equal(charlieInPool?.readiness, "EXTRACTION_FAILED");

  // Screen Alice
  const screenReq = createAuthRequest(
    `http://localhost:3000/api/requisitions/${req.id}/screen`,
    session.sessionToken,
    { method: "POST", body: { candidateId: candReady.id } }
  );
  const screenRes = await screenRoute(screenReq, {
    params: Promise.resolve({ id: req.id }),
  });
  assert.equal(screenRes.status, 200);

  // Overview / Evaluations API Test: GET /api/requisitions/[id]/evaluations
  const evalsReq = createAuthRequest(
    `http://localhost:3000/api/requisitions/${req.id}/evaluations`,
    session.sessionToken
  );
  const evalsRes = await getRequisitionEvaluationsRoute(evalsReq, {
    params: Promise.resolve({ id: req.id }),
  });
  assert.equal(evalsRes.status, 200);
  const evalsData = await evalsRes.json();
  assert.equal(evalsData.success, true);
  assert.ok(evalsData.summary);
  assert.equal(evalsData.summary.completedCount, 1);
  assert.ok(evalsData.summary.averageScore !== null);
  assert.equal(evalsData.evaluations.length, 1);
  assert.equal(evalsData.evaluations[0].candidate.id, candReady.id);
  assert.equal(evalsData.evaluations[0].hasCVBeenViewed, false);

  // Search filter test: search by candidate name "Alice"
  const searchReq = createAuthRequest(
    `http://localhost:3000/api/requisitions/${req.id}/evaluations?search=Alice`,
    session.sessionToken
  );
  const searchRes = await getRequisitionEvaluationsRoute(searchReq, {
    params: Promise.resolve({ id: req.id }),
  });
  assert.equal(searchRes.status, 200);
  const searchData = await searchRes.json();
  assert.equal(searchData.evaluations.length, 1);

  // Search filter test: search for non-matching name
  const searchNoneReq = createAuthRequest(
    `http://localhost:3000/api/requisitions/${req.id}/evaluations?search=NonExistentPerson`,
    session.sessionToken
  );
  const searchNoneRes = await getRequisitionEvaluationsRoute(searchNoneReq, {
    params: Promise.resolve({ id: req.id }),
  });
  assert.equal(searchNoneRes.status, 200);
  const searchNoneData = await searchNoneRes.json();
  assert.equal(searchNoneData.evaluations.length, 0);
});

test("Milestone 4 Hardening: Review Prerequisite Requires SAME Authenticated Recruiter", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  const agency = await prisma.organization.create({
    data: { name: `Agency MultiRec ${suffix}`, type: OrganizationType.AGENCY },
  });

  const recruiter1 = await prisma.user.create({
    data: {
      name: `Recruiter One ${suffix}`,
      email: `recruiter1.${suffix}@test.com`,
      role: UserRole.RECRUITER,
      organizationId: agency.id,
    },
  });
  const session1 = await createSession(recruiter1.id);

  const recruiter2 = await prisma.user.create({
    data: {
      name: `Recruiter Two ${suffix}`,
      email: `recruiter2.${suffix}@test.com`,
      role: UserRole.RECRUITER,
      organizationId: agency.id,
    },
  });
  const session2 = await createSession(recruiter2.id);

  const storage = getStorageProvider();
  const testStorageKey = `rec_diff_${suffix}.pdf`;
  const pdfBytes = Buffer.from("%PDF-1.4 test document for recruiter review isolation");
  await storage.put(testStorageKey, pdfBytes);

  const req = await prisma.requisition.create({
    data: {
      title: `Lead Systems Architect ${suffix}`,
      jobDescription: "Requires expertise in distributed microservices and infrastructure scalability.",
      organizationId: agency.id,
      createdById: recruiter1.id,
      scorecardCriteria: {
        create: [
          { name: "Distributed Systems", weight: 60, isMustHave: true },
          { name: "Cloud Architecture", weight: 40, isMustHave: false },
        ],
      },
    },
  });

  const candidate = await prisma.candidate.create({
    data: {
      candidateReference: `CND-DIFF-${suffix}`,
      agencyId: agency.id,
      fullName: `Diana System ${suffix}`,
      uploadedDocuments: {
        create: {
          agencyId: agency.id,
          fileName: "diana_cv.pdf",
          fileType: "application/pdf",
          fileSizeBytes: pdfBytes.length,
          storageKey: testStorageKey,
          fileHash: crypto.randomBytes(16).toString("hex"),
          processingStatus: DocumentProcessingStatus.EXTRACTED,
          extractedText: "10+ years architecting distributed systems and cloud platforms in AWS and Kubernetes.",
        },
      },
    },
    include: { uploadedDocuments: true },
  });

  const docId = candidate.uploadedDocuments[0].id;

  // Screen candidate
  const screenReq = createAuthRequest(
    `http://localhost:3000/api/requisitions/${req.id}/screen`,
    session1.sessionToken,
    { method: "POST", body: { candidateId: candidate.id } }
  );
  const screenRes = await screenRoute(screenReq, {
    params: Promise.resolve({ id: req.id }),
  });
  assert.equal(screenRes.status, 200);
  const screenData = await screenRes.json();
  const evaluationId = screenData.evaluations[0].evaluationId;

  // 1. Recruiter 1 views the CV document
  const viewReq1 = createAuthRequest(
    `http://localhost:3000/api/documents/${docId}/download?view=inline`,
    session1.sessionToken
  );
  const viewRes1 = await downloadDocumentRoute(viewReq1, {
    params: Promise.resolve({ id: docId }),
  });
  assert.equal(viewRes1.status, 200);

  // 2. Recruiter 2 attempts review of evaluation -> MUST BE REJECTED with 428 CV_NOT_VIEWED
  // (An audit event created by another recruiter must NOT satisfy this prerequisite)
  const reviewReq2 = createAuthRequest(
    `http://localhost:3000/api/evaluations/${evaluationId}/review`,
    session2.sessionToken,
    { method: "POST", body: { notes: "Review attempt by recruiter 2 without viewing CV" } }
  );
  const reviewRes2 = await reviewEvaluationRoute(reviewReq2, {
    params: Promise.resolve({ id: evaluationId }),
  });
  assert.equal(reviewRes2.status, 428);
  const data2 = await reviewRes2.json();
  assert.equal(data2.code, "CV_NOT_VIEWED");

  // 3. Recruiter 1 attempts review of evaluation -> SUCCEEDS (200 OK)
  const reviewReq1 = createAuthRequest(
    `http://localhost:3000/api/evaluations/${evaluationId}/review`,
    session1.sessionToken,
    { method: "POST", body: { notes: "Personally inspected candidate CV and verified architecture experience." } }
  );
  const reviewRes1 = await reviewEvaluationRoute(reviewReq1, {
    params: Promise.resolve({ id: evaluationId }),
  });
  assert.equal(reviewRes1.status, 200);
  const data1 = await reviewRes1.json();
  assert.equal(data1.success, true);
  assert.equal(data1.evaluation.isReviewedByRecruiter, true);
  assert.equal(data1.evaluation.reviewedById, recruiter1.id);
});

test("Milestone 4 Hardening: Cross-Agency Audit Event, Unrelated Document, and Client Role Rejection", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  // Agency A and Recruiter A
  const agencyA = await prisma.organization.create({
    data: { name: `Agency A Hardening ${suffix}`, type: OrganizationType.AGENCY },
  });
  const recruiterA = await prisma.user.create({
    data: {
      name: `Recruiter A ${suffix}`,
      email: `recruiterA.${suffix}@test.com`,
      role: UserRole.RECRUITER,
      organizationId: agencyA.id,
    },
  });
  const sessionA = await createSession(recruiterA.id);

  // Agency B and Recruiter B
  const agencyB = await prisma.organization.create({
    data: { name: `Agency B Hardening ${suffix}`, type: OrganizationType.AGENCY },
  });
  const recruiterB = await prisma.user.create({
    data: {
      name: `Recruiter B ${suffix}`,
      email: `recruiterB.${suffix}@test.com`,
      role: UserRole.RECRUITER,
      organizationId: agencyB.id,
    },
  });
  const sessionB = await createSession(recruiterB.id);

  // Client Organization and Client Hiring Manager
  const clientOrg = await prisma.organization.create({
    data: { name: `Client Org ${suffix}`, type: OrganizationType.CLIENT },
  });
  const clientUser = await prisma.user.create({
    data: {
      name: `Client User ${suffix}`,
      email: `client.${suffix}@test.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientOrg.id,
    },
  });
  const clientSession = await createSession(clientUser.id);

  const storage = getStorageProvider();

  // Document A for Agency A
  const keyA = `doc_a_${suffix}.pdf`;
  await storage.put(keyA, Buffer.from("%PDF-1.4 Agency A Doc"));

  const reqA = await prisma.requisition.create({
    data: {
      title: `Frontend Lead ${suffix}`,
      jobDescription: "Requires expertise in Next.js and React architecture.",
      organizationId: agencyA.id,
      createdById: recruiterA.id,
      scorecardCriteria: {
        create: [{ name: "Next.js", weight: 100, isMustHave: true }],
      },
    },
  });

  const candA = await prisma.candidate.create({
    data: {
      candidateReference: `CND-A-${suffix}`,
      agencyId: agencyA.id,
      fullName: `Candidate A ${suffix}`,
      uploadedDocuments: {
        create: {
          agencyId: agencyA.id,
          fileName: "candA_cv.pdf",
          fileType: "application/pdf",
          storageKey: keyA,
          fileHash: crypto.randomBytes(16).toString("hex"),
          processingStatus: DocumentProcessingStatus.EXTRACTED,
          extractedText: "7 years of modern Next.js frontend development and React architecture.",
        },
      },
    },
    include: { uploadedDocuments: true },
  });

  const docIdA = candA.uploadedDocuments[0].id;

  // Unrelated Document X in Agency A (not candA's CV)
  const keyX = `doc_x_${suffix}.pdf`;
  await storage.put(keyX, Buffer.from("%PDF-1.4 Unrelated Doc"));
  const unrelatedDoc = await prisma.uploadedDocument.create({
    data: {
      agencyId: agencyA.id,
      fileName: "unrelated.pdf",
      fileType: "application/pdf",
      storageKey: keyX,
      fileHash: crypto.randomBytes(16).toString("hex"),
      processingStatus: DocumentProcessingStatus.EXTRACTED,
      extractedText: "Unrelated document content.",
    },
  });

  // Screen candidate A in Agency A
  const screenReqA = createAuthRequest(
    `http://localhost:3000/api/requisitions/${reqA.id}/screen`,
    sessionA.sessionToken,
    { method: "POST", body: { candidateId: candA.id } }
  );
  const screenResA = await screenRoute(screenReqA, {
    params: Promise.resolve({ id: reqA.id }),
  });
  assert.equal(screenResA.status, 200);
  const screenDataA = await screenResA.json();
  const evalIdA = screenDataA.evaluations[0].evaluationId;

  // Scenario 1: Recruiter B in Agency B accesses an audit event in Agency B
  await prisma.auditLog.create({
    data: {
      actorId: recruiterB.id,
      organizationId: agencyB.id,
      action: "ORIGINAL_CV_VIEWED",
      entityType: "UploadedDocument",
      entityId: docIdA, // Pointing to docIdA but in Agency B by Recruiter B
    },
  });

  // Recruiter A attempts review of Evaluation A -> MUST FAIL with 428 CV_NOT_VIEWED
  // (Another agency's CV access event cannot satisfy the prerequisite)
  const reviewReqA1 = createAuthRequest(
    `http://localhost:3000/api/evaluations/${evalIdA}/review`,
    sessionA.sessionToken,
    { method: "POST" }
  );
  const reviewResA1 = await reviewEvaluationRoute(reviewReqA1, {
    params: Promise.resolve({ id: evalIdA }),
  });
  assert.equal(reviewResA1.status, 428);
  const dataA1 = await reviewResA1.json();
  assert.equal(dataA1.code, "CV_NOT_VIEWED");

  // Scenario 2: Recruiter A accesses UNRELATED Document X in Agency A
  const viewReqX = createAuthRequest(
    `http://localhost:3000/api/documents/${unrelatedDoc.id}/download?view=inline`,
    sessionA.sessionToken
  );
  const viewResX = await downloadDocumentRoute(viewReqX, {
    params: Promise.resolve({ id: unrelatedDoc.id }),
  });
  assert.equal(viewResX.status, 200);

  // Recruiter A attempts review of Evaluation A -> MUST FAIL with 428 CV_NOT_VIEWED
  // (An unrelated document access event cannot satisfy it)
  const reviewReqA2 = createAuthRequest(
    `http://localhost:3000/api/evaluations/${evalIdA}/review`,
    sessionA.sessionToken,
    { method: "POST" }
  );
  const reviewResA2 = await reviewEvaluationRoute(reviewReqA2, {
    params: Promise.resolve({ id: evalIdA }),
  });
  assert.equal(reviewResA2.status, 428);
  const dataA2 = await reviewResA2.json();
  assert.equal(dataA2.code, "CV_NOT_VIEWED");

  // Scenario 3: Client hiring managers CANNOT record recruiter reviews
  const reviewReqClient = createAuthRequest(
    `http://localhost:3000/api/evaluations/${evalIdA}/review`,
    clientSession.sessionToken,
    { method: "POST" }
  );
  const reviewResClient = await reviewEvaluationRoute(reviewReqClient, {
    params: Promise.resolve({ id: evalIdA }),
  });
  assert.equal(reviewResClient.status, 403);
});

test("Milestone 4 Hardening: Production Mock Provider Safety — ALLOW_MOCK_IN_PRODUCTION is strictly banned", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalProvider = process.env.SCREENING_PROVIDER;
  const originalAllowMock = (process.env as any).ALLOW_MOCK_IN_PRODUCTION;
  const originalGroqKey = process.env.GROQ_API_KEY;

  try {
    (process.env as any).NODE_ENV = "production";
    (process.env as any).ALLOW_MOCK_IN_PRODUCTION = "true";
    process.env.SCREENING_PROVIDER = "mock";
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;

    // Must throw even if ALLOW_MOCK_IN_PRODUCTION="true"
    assert.throws(
      () => getScreeningProvider(),
      (err: any) =>
        err.message.includes("AI_PROVIDER_NOT_CONFIGURED") &&
        err.message.includes("Mock provider is strictly prohibited in production environments.")
    );

    assert.throws(
      () => getScreeningProvider("mock"),
      (err: any) =>
        err.message.includes("AI_PROVIDER_NOT_CONFIGURED") &&
        err.message.includes("Mock provider is strictly prohibited in production environments.")
    );
  } finally {
    (process.env as any).NODE_ENV = originalEnv;
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    if (originalGroqKey) process.env.GROQ_API_KEY = originalGroqKey;
    if (originalProvider) process.env.SCREENING_PROVIDER = originalProvider;
    if (originalAllowMock) {
      (process.env as any).ALLOW_MOCK_IN_PRODUCTION = originalAllowMock;
    } else {
      delete (process.env as any).ALLOW_MOCK_IN_PRODUCTION;
    }
  }
});

test("Milestone 4 Hardening: Audit Log Integrity — Document Access Logged Only After Authorization and Storage Success", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  const agency = await prisma.organization.create({
    data: { name: `Agency Audit Integrity ${suffix}`, type: OrganizationType.AGENCY },
  });

  const recruiter = await prisma.user.create({
    data: {
      name: `Recruiter Integrity ${suffix}`,
      email: `recruiter.integrity.${suffix}@test.com`,
      role: UserRole.RECRUITER,
      organizationId: agency.id,
    },
  });
  const session = await createSession(recruiter.id);

  const storage = getStorageProvider();
  const testStorageKey = `integrity_doc_${suffix}.pdf`;
  const pdfBytes = Buffer.from("%PDF-1.4 confidential candidate CV contents for integrity check");
  await storage.put(testStorageKey, pdfBytes);

  const candidate = await prisma.candidate.create({
    data: {
      candidateReference: `CND-INT-${suffix}`,
      agencyId: agency.id,
      fullName: `Candidate Confidential ${suffix}`,
      uploadedDocuments: {
        create: {
          agencyId: agency.id,
          fileName: "confidential_cv.pdf",
          fileType: "application/pdf",
          fileSizeBytes: pdfBytes.length,
          storageKey: testStorageKey,
          fileHash: crypto.randomBytes(16).toString("hex"),
          processingStatus: DocumentProcessingStatus.EXTRACTED,
          extractedText: "Confidential resume text with sensitive personal info.",
        },
      },
    },
    include: { uploadedDocuments: true },
  });

  const docId = candidate.uploadedDocuments[0].id;

  // 1. Attempt access of non-existent document ID -> 404 and NO audit log created
  const badReq = createAuthRequest(
    `http://localhost:3000/api/documents/non-existent-id/download`,
    session.sessionToken
  );
  const badRes = await downloadDocumentRoute(badReq, {
    params: Promise.resolve({ id: "non-existent-id" }),
  });
  assert.equal(badRes.status, 404);

  const badLogs = await prisma.auditLog.findMany({
    where: { entityId: "non-existent-id" },
  });
  assert.equal(badLogs.length, 0);

  // 2. Successful download by authorized recruiter
  const goodReq = createAuthRequest(
    `http://localhost:3000/api/documents/${docId}/download?view=inline`,
    session.sessionToken
  );
  const goodRes = await downloadDocumentRoute(goodReq, {
    params: Promise.resolve({ id: docId }),
  });
  assert.equal(goodRes.status, 200);

  // 3. Inspect the audit log entry
  const logs = await prisma.auditLog.findMany({
    where: { entityId: docId, action: "ORIGINAL_CV_VIEWED" },
  });
  assert.equal(logs.length, 1);
  const log = logs[0];

  assert.equal(log.actorId, recruiter.id);
  assert.equal(log.organizationId, agency.id);
  assert.equal(log.entityType, "UploadedDocument");

  // Verify log metadata contains ONLY pseudonymous references and NO CV contents or PII
  const meta = log.metadata as any;
  assert.ok(meta);
  assert.equal(meta.documentId, docId);
  assert.equal(meta.candidateReference, `CND-INT-${suffix}`);
  assert.equal(meta.fileName, "confidential_cv.pdf");
  assert.equal(meta.viewMode, "inline");

  // Strict negative assertions: NO CV text, NO PII in metadata
  assert.equal(meta.extractedText, undefined);
  assert.equal(meta.content, undefined);
  assert.equal(meta.email, undefined);
  assert.equal(meta.phone, undefined);
  assert.equal(meta.candidateName, undefined);
});

