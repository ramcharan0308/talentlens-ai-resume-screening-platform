import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  UserRole,
  OrganizationType,
  RequisitionStatus,
  ApplicationStatus,
  ConsentStatus,
  ConsentEvidenceType,
  DeletionRequestStatus,
  CandidatePurgeStatus,
} from "@prisma/client";
import { NextRequest } from "next/server";

import { prisma } from "../src/lib/prisma";
import { createSession, SESSION_COOKIE_NAME, AuthenticatedUser } from "../src/lib/auth";
import { getStorageProvider, generateStorageKey, StorageProvider } from "../src/lib/storage";
import {
  recordConsent,
  withdrawConsent,
  getConsentHistory,
  checkCandidateConsent,
  CONSENT_PURPOSES,
  CONSENT_SOURCES,
} from "../src/lib/consent/consent-service";
import {
  createDeletionRequest,
  reviewDeletionRequest,
  approveDeletionRequest,
  executeDeletionRequest,
  getDeletionRequest,
  listDeletionRequests,
} from "../src/lib/deletion/deletion-service";
import {
  createRetentionPolicy,
  getRetentionPolicies,
  getRetentionReviewCandidates,
  setCandidateRetentionExpiry,
} from "../src/lib/retention/retention-service";
import { screenCandidate } from "../src/lib/screening/engine";
import { submitCandidateToClient } from "../src/lib/client-portal/submission";
import { transitionApplicationStage } from "../src/lib/pipeline/transition-service";
import { POST as consentRoute, GET as getConsentRoute } from "../src/app/api/candidates/[id]/consent/route";
import { POST as withdrawConsentRoute } from "../src/app/api/candidates/[id]/consent/withdraw/route";
import { POST as createDeletionRoute, GET as getDeletionRoute } from "../src/app/api/candidates/[id]/deletion-requests/route";
import { GET as listDeletionsRoute } from "../src/app/api/deletion-requests/route";
import { PATCH as reviewDeletionRoute, GET as getSingleDeletionRoute } from "../src/app/api/deletion-requests/[id]/route";
import { POST as executeDeletionRoute } from "../src/app/api/deletion-requests/[id]/execute/route";
import { GET as getRetentionReviewRoute } from "../src/app/api/retention/review/route";

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
    reqInit.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), reqInit as any);
}

test("Milestone 7: Candidate Consent, Withdrawal, Retention and Deletion", async (t) => {
  const suffix = crypto.randomBytes(4).toString("hex");

  // 1. Setup Test Tenants and Users
  // Agency Alpha
  const agencyAlpha = await prisma.organization.create({
    data: {
      name: `Agency Alpha M7 ${suffix}`,
      type: OrganizationType.AGENCY,
    },
  });

  // Agency Beta (for cross-tenant security testing)
  const agencyBeta = await prisma.organization.create({
    data: {
      name: `Agency Beta M7 ${suffix}`,
      type: OrganizationType.AGENCY,
    },
  });

  // Client Alpha (managed by Agency Alpha)
  const clientAlpha = await prisma.organization.create({
    data: {
      name: `Client Alpha M7 ${suffix}`,
      type: OrganizationType.CLIENT,
      agencyId: agencyAlpha.id,
    },
  });

  // Recruiter Alpha
  const recruiterAlpha = await prisma.user.create({
    data: {
      email: `recruiter.alpha.${suffix}@test.internal`,
      name: `Recruiter Alpha ${suffix}`,
      role: UserRole.RECRUITER,
      organizationId: agencyAlpha.id,
      isActive: true,
    },
  });

  // Delivery Head Alpha
  const deliveryHeadAlpha = await prisma.user.create({
    data: {
      email: `delivery.alpha.${suffix}@test.internal`,
      name: `Delivery Head Alpha ${suffix}`,
      role: UserRole.DELIVERY_HEAD,
      organizationId: agencyAlpha.id,
      isActive: true,
    },
  });

  // Client Hiring Manager Alpha
  const clientMgrAlpha = await prisma.user.create({
    data: {
      email: `client.alpha.${suffix}@fintech.test`,
      name: `Client Manager ${suffix}`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientAlpha.id,
      isActive: true,
    },
  });

  // Recruiter Beta (Agency Beta)
  const recruiterBeta = await prisma.user.create({
    data: {
      email: `recruiter.beta.${suffix}@test.internal`,
      name: `Recruiter Beta ${suffix}`,
      role: UserRole.RECRUITER,
      organizationId: agencyBeta.id,
      isActive: true,
    },
  });

  // Sessions
  const sessionRecruiterAlpha = await createSession(recruiterAlpha.id);
  const sessionDeliveryAlpha = await createSession(deliveryHeadAlpha.id);
  const sessionClientAlpha = await createSession(clientMgrAlpha.id);
  const sessionRecruiterBeta = await createSession(recruiterBeta.id);

  const authRecruiterAlpha: AuthenticatedUser = {
    id: recruiterAlpha.id,
    email: recruiterAlpha.email,
    name: recruiterAlpha.name,
    role: recruiterAlpha.role,
    organizationId: agencyAlpha.id,
    organizationName: agencyAlpha.name,
    organizationType: agencyAlpha.type,
    isActive: true,
  };

  const authDeliveryAlpha: AuthenticatedUser = {
    id: deliveryHeadAlpha.id,
    email: deliveryHeadAlpha.email,
    name: deliveryHeadAlpha.name,
    role: deliveryHeadAlpha.role,
    organizationId: agencyAlpha.id,
    organizationName: agencyAlpha.name,
    organizationType: agencyAlpha.type,
    isActive: true,
  };

  const authClientAlpha: AuthenticatedUser = {
    id: clientMgrAlpha.id,
    email: clientMgrAlpha.email,
    name: clientMgrAlpha.name,
    role: clientMgrAlpha.role,
    organizationId: clientAlpha.id,
    organizationName: clientAlpha.name,
    organizationType: clientAlpha.type,
    isActive: true,
  };

  const authRecruiterBeta: AuthenticatedUser = {
    id: recruiterBeta.id,
    email: recruiterBeta.email,
    name: recruiterBeta.name,
    role: recruiterBeta.role,
    organizationId: agencyBeta.id,
    organizationName: agencyBeta.name,
    organizationType: agencyBeta.type,
    isActive: true,
  };

  // Requisition under Agency Alpha
  const reqAlpha = await prisma.requisition.create({
    data: {
      title: `Senior Backend Engineer M7 ${suffix}`,
      department: "Engineering",
      location: "Noida",
      jobDescription: "Senior Node.js and TypeScript backend engineer with AWS and PostgreSQL experience.",
      status: RequisitionStatus.ACTIVE,
      organizationId: agencyAlpha.id,
      clientOrganizationId: clientAlpha.id,
      createdById: recruiterAlpha.id,
      scorecardCriteria: {
        create: [
          {
            name: "TypeScript & Node.js",
            weight: 50,
            isMustHave: true,
            guidelines: "Demonstrated experience in TypeScript and enterprise Node.js microservices.",
          },
          {
            name: "Cloud & Databases",
            weight: 50,
            isMustHave: false,
            guidelines: "Experience with PostgreSQL and cloud deployments.",
          },
        ],
      },
    },
  });

  const storage = getStorageProvider();

  // Helper to create test candidate with CV document and storage file
  async function createTestCandidate(name: string, refPrefix: string) {
    const candidateRef = `CND-M7-${refPrefix}-${suffix}`;
    const storageKey = generateStorageKey("pdf");
    const resumeText = `${name} is an experienced TypeScript and Node.js backend developer. PostgreSQL, AWS, microservices.`;
    const dummyPdfBuffer = Buffer.from(`%PDF-1.4\n1 0 obj\n<<\n>>\nstream\n${resumeText}\nendstream\nendobj\ntrailer\n<<\n>>\n%%EOF`);

    await storage.put(storageKey, dummyPdfBuffer);

    const candidate = await prisma.candidate.create({
      data: {
        candidateReference: candidateRef,
        agencyId: agencyAlpha.id,
        fullName: name,
        currentRole: "Backend Developer",
        experienceYears: 5.5,
        keySkills: ["TypeScript", "Node.js", "PostgreSQL"],
        purgeStatus: CandidatePurgeStatus.ACTIVE,
      },
    });

    const doc = await prisma.uploadedDocument.create({
      data: {
        agencyId: agencyAlpha.id,
        candidateId: candidate.id,
        fileName: `${name.replace(/\s+/g, "_")}_CV.pdf`,
        fileType: "application/pdf",
        storageKey,
        fileSizeBytes: dummyPdfBuffer.length,
        fileHash: crypto.createHash("sha256").update(dummyPdfBuffer).digest("hex"),
        processingStatus: "EXTRACTED",
        extractedText: resumeText,
      },
    });

    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        requisitionId: reqAlpha.id,
        status: ApplicationStatus.SOURCED,
      },
    });

    return { candidate, doc, application, storageKey };
  }

  // =========================================================================
  // Test 1: Persistent Consent Recording, Versioning, and Purpose Distinction
  // =========================================================================
  await t.test("1. Persistent Consent Recording with Versioning, Purpose, and History", async () => {
    const { candidate } = await createTestCandidate("Aarav Mehta", "C1");

    // Recruiter records consent for recruitment processing
    const recordResult = await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
      noticeVersion: "v1.2",
      source: CONSENT_SOURCES.DIRECT_APPLICATION,
      legalBasis: "CONSENT",
      evidenceType: ConsentEvidenceType.PORTAL_AUTH_SESSION,
      evidenceReference: "portal-session-auth-12345",
      notes: "Consent provided via candidate registration portal.",
    });

    assert.equal(recordResult.success, true);
    assert.equal(recordResult.statusCode, 200);
    assert.ok(recordResult.consentRecord);
    assert.equal(recordResult.consentRecord.status, ConsentStatus.ACTIVE);
    assert.equal(recordResult.consentRecord.purpose, CONSENT_PURPOSES.RECRUITMENT_PROCESSING);
    assert.equal(recordResult.consentRecord.noticeVersion, "v1.2");
    assert.equal(recordResult.consentRecord.source, CONSENT_SOURCES.DIRECT_APPLICATION);
    assert.equal(recordResult.consentRecord.recordedById, recruiterAlpha.id);

    // Record separate purpose (distinguished from recruitment CV processing)
    const futureRoleConsent = await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.TALENT_POOL_FUTURE_ROLES,
      noticeVersion: "v1.2",
      source: CONSENT_SOURCES.EMAIL_COMMUNICATION,
    });
    assert.equal(futureRoleConsent.success, true);
    assert.equal(futureRoleConsent.consentRecord.purpose, CONSENT_PURPOSES.TALENT_POOL_FUTURE_ROLES);

    // Verify complete consent records and versioned history
    const historyResult = await getConsentHistory(authRecruiterAlpha, candidate.id);
    assert.equal(historyResult.success, true);
    assert.equal(historyResult.records?.length, 2);

    const recruitmentRecord = historyResult.records?.find((r) => r.purpose === CONSENT_PURPOSES.RECRUITMENT_PROCESSING);
    assert.ok(recruitmentRecord);
    assert.equal(recruitmentRecord.history.length, 1);
    assert.equal(recruitmentRecord.history[0].action, "GRANTED");
    assert.equal(recruitmentRecord.history[0].noticeVersion, "v1.2");
    assert.equal(recruitmentRecord.history[0].actorId, recruiterAlpha.id);

    // Verify AuditLog was created without PII
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "CONSENT_RECORDED",
        entityId: candidate.candidateReference,
        organizationId: agencyAlpha.id,
      },
    });
    assert.ok(audit);
    assert.equal(audit.metadata ? (audit.metadata as any).noticeVersion : null, "v1.2");
    // Ensure no personal name or CV text leaked in metadata
    assert.equal((audit.metadata as any).fullName, undefined);
    assert.equal((audit.metadata as any).extractedText, undefined);
  });

  // =========================================================================
  // Test 2: Authorized Consent Withdrawal and History Preservation
  // =========================================================================
  await t.test("2. Authorized Consent Withdrawal Records Timestamp and Preserves History", async () => {
    const { candidate } = await createTestCandidate("Neha Verma", "C2");

    // First record consent
    await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
      noticeVersion: "v1.0",
      source: CONSENT_SOURCES.DIRECT_APPLICATION,
    });

    // Recruiter withdraws consent with mandatory reason
    const withdrawResult = await withdrawConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
      reason: "Candidate sent email requesting processing stop due to alternate offer.",
      notes: "Reference email ticket #94821",
    });

    assert.equal(withdrawResult.success, true);
    assert.equal(withdrawResult.statusCode, 200);
    assert.ok(withdrawResult.consentRecord);
    assert.equal(withdrawResult.consentRecord.status, ConsentStatus.WITHDRAWN);
    assert.ok(withdrawResult.consentRecord.withdrawnAt);
    assert.equal(withdrawResult.consentRecord.withdrawnById, recruiterAlpha.id);
    assert.equal(withdrawResult.consentRecord.withdrawalReason, "Candidate sent email requesting processing stop due to alternate offer.");

    // Check helper
    const consentCheck = await checkCandidateConsent(candidate.id, agencyAlpha.id);
    assert.equal(consentCheck.hasConsent, false);
    assert.equal(consentCheck.isWithdrawn, true);
    assert.equal(consentCheck.status, ConsentStatus.WITHDRAWN);

    // Verify ConsentHistory contains both GRANTED and WITHDRAWN
    const history = await getConsentHistory(authRecruiterAlpha, candidate.id);
    const rec = history.records?.find((r) => r.purpose === CONSENT_PURPOSES.RECRUITMENT_PROCESSING);
    assert.ok(rec);
    assert.equal(rec.history.length, 2);
    assert.equal(rec.history[0].action, "WITHDRAWN");
    assert.equal(rec.history[1].action, "GRANTED");

    // Withdrawal requires mandatory reason
    const failWithdraw = await withdrawConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "   ",
    });
    assert.equal(failWithdraw.success, false);
    assert.equal(failWithdraw.statusCode, 400);
  });

  // =========================================================================
  // Test 3: Consent Withdrawal Strictly Blocks AI Screening
  // =========================================================================
  await t.test("3. Consent Withdrawal Blocks AI Screening Engine", async () => {
    const { candidate } = await createTestCandidate("Rohan Gupta", "C3");

    // Withdraw consent
    await withdrawConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
      reason: "Candidate withdrew consent via communication.",
    });

    // Attempting to run screening engine must be rejected
    await assert.rejects(
      async () => {
        await screenCandidate({
          agencyId: agencyAlpha.id,
          requisitionId: reqAlpha.id,
          candidateId: candidate.id,
          provider: "mock",
        });
      },
      (err: any) => {
        assert.ok(err.message.includes("CONSENT_WITHDRAWN"));
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });

  // =========================================================================
  // Test 4: Consent Withdrawal Strictly Blocks New Client Submissions
  // =========================================================================
  await t.test("4. Consent Withdrawal Blocks New Client Submissions", async () => {
    const { candidate, doc } = await createTestCandidate("Ishaan Sen", "C4");

    // Grant consent initially to complete screening & review
    await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
    });

    // Run screening
    const evalResult = await screenCandidate({
      agencyId: agencyAlpha.id,
      requisitionId: reqAlpha.id,
      candidateId: candidate.id,
      provider: "mock",
    });
    assert.ok(evalResult.evaluationId);

    // Recruiter reviews evaluation
    await prisma.evaluation.update({
      where: { id: evalResult.evaluationId },
      data: {
        isReviewedByRecruiter: true,
        reviewedAt: new Date(),
        reviewedById: recruiterAlpha.id,
      },
    });

    // Record CV viewed prerequisite audit log
    await prisma.auditLog.create({
      data: {
        actorId: recruiterAlpha.id,
        organizationId: agencyAlpha.id,
        action: "ORIGINAL_CV_VIEWED",
        entityType: "UploadedDocument",
        entityId: doc.id,
      },
    });

    // Now Candidate withdraws consent
    await withdrawConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
      reason: "Right to withdraw consent exercised.",
    });

    // Recruiter attempts client submission
    const submitResult = await submitCandidateToClient(authRecruiterAlpha, {
      evaluationId: evalResult.evaluationId,
      expectedRequisitionId: reqAlpha.id,
      expectedCandidateId: candidate.id,
    });

    assert.equal(submitResult.success, false);
    assert.equal(submitResult.statusCode, 403);
    assert.equal(submitResult.code, "CONSENT_WITHDRAWN");
  });

  // =========================================================================
  // Test 5: Role and Multi-Tenant RBAC Security Denial
  // =========================================================================
  await t.test("5. Multi-Tenant and RBAC Access Denial (Client Role & Cross-Agency Denied)", async () => {
    const { candidate } = await createTestCandidate("Aditi Rao", "C5");

    // 1. Client Hiring Manager is strictly forbidden from recording consent
    const clientConsentAttempt = await recordConsent(authClientAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
    });
    assert.equal(clientConsentAttempt.success, false);
    assert.equal(clientConsentAttempt.statusCode, 403);

    // 2. Client Hiring Manager is strictly forbidden from withdrawing consent
    const clientWithdrawAttempt = await withdrawConsent(authClientAlpha, {
      candidateId: candidate.id,
      reason: "Unauthorized client withdrawal",
    });
    assert.equal(clientWithdrawAttempt.success, false);
    assert.equal(clientWithdrawAttempt.statusCode, 403);

    // 3. Client Hiring Manager is strictly forbidden from creating deletion requests
    const clientDelAttempt = await createDeletionRequest(authClientAlpha, {
      candidateId: candidate.id,
      reason: "Unauthorized client deletion",
    });
    assert.equal(clientDelAttempt.success, false);
    assert.equal(clientDelAttempt.statusCode, 403);

    // 4. Client Hiring Manager cannot access retention review
    const clientRetentionAttempt = await getRetentionReviewCandidates(authClientAlpha);
    assert.equal(clientRetentionAttempt.success, false);
    assert.equal(clientRetentionAttempt.statusCode, 403);

    // 5. Cross-Agency: Agency Beta Recruiter cannot record consent for Agency Alpha Candidate
    const betaConsentAttempt = await recordConsent(authRecruiterBeta, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
    });
    assert.equal(betaConsentAttempt.success, false);
    assert.equal(betaConsentAttempt.statusCode, 403);
    assert.equal(betaConsentAttempt.code, "CROSS_AGENCY_FORBIDDEN");

    // 6. Cross-Agency: Agency Beta Recruiter cannot create deletion request for Agency Alpha Candidate
    const betaDelAttempt = await createDeletionRequest(authRecruiterBeta, {
      candidateId: candidate.id,
      reason: "Cross agency intrusion",
    });
    assert.equal(betaDelAttempt.success, false);
    assert.equal(betaDelAttempt.statusCode, 403);
    assert.equal(betaDelAttempt.code, "CROSS_AGENCY_FORBIDDEN");
  });

  // =========================================================================
  // Test 6: Deletion Request Lifecycle (REQUESTED → UNDER_REVIEW → APPROVED)
  // =========================================================================
  await t.test("6. Deletion Request Lifecycle and Role Authorization Gates", async () => {
    const { candidate } = await createTestCandidate("Vikram Singhania", "C6");

    // 1. Recruiter creates Deletion Request (Status: REQUESTED)
    const reqResult = await createDeletionRequest(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Candidate requested erasure under statutory privacy rights.",
    });

    assert.equal(reqResult.success, true);
    assert.equal(reqResult.statusCode, 201);
    assert.ok(reqResult.request);
    assert.equal(reqResult.request.status, DeletionRequestStatus.REQUESTED);
    assert.equal(reqResult.request.candidateReference, candidate.candidateReference);
    assert.equal(reqResult.request.requestedById, recruiterAlpha.id);

    const requestId = reqResult.request.id;

    // Verify candidate purgeStatus transitioned to PURGE_REQUESTED
    const candidateAfter = await prisma.candidate.findUnique({
      where: { id: candidate.id },
    });
    assert.equal(candidateAfter?.purgeStatus, CandidatePurgeStatus.PURGE_REQUESTED);

    // Recruiter cannot approve or execute deletion (Requires DELIVERY_HEAD)
    const recruiterApproveAttempt = await approveDeletionRequest(authRecruiterAlpha, { requestId });
    assert.equal(recruiterApproveAttempt.success, false);
    assert.equal(recruiterApproveAttempt.statusCode, 403);
    assert.equal(recruiterApproveAttempt.code, "INSUFFICIENT_PERMISSIONS");

    const recruiterExecAttempt = await executeDeletionRequest(authRecruiterAlpha, { requestId });
    assert.equal(recruiterExecAttempt.success, false);
    assert.equal(recruiterExecAttempt.statusCode, 403);

    // 2. Delivery Head starts review (REQUESTED → UNDER_REVIEW)
    const reviewResult = await reviewDeletionRequest(authDeliveryAlpha, {
      requestId,
      action: "START_REVIEW",
    });
    assert.equal(reviewResult.success, true);
    assert.equal(reviewResult.request.status, DeletionRequestStatus.UNDER_REVIEW);
    assert.equal(reviewResult.request.reviewedById, deliveryHeadAlpha.id);

    // Cannot execute while in UNDER_REVIEW
    const prematureExec = await executeDeletionRequest(authDeliveryAlpha, { requestId });
    assert.equal(prematureExec.success, false);
    assert.equal(prematureExec.statusCode, 422);

    // 3. Delivery Head approves request (UNDER_REVIEW → APPROVED)
    const approveResult = await approveDeletionRequest(authDeliveryAlpha, { requestId });
    assert.equal(approveResult.success, true);
    assert.equal(approveResult.request.status, DeletionRequestStatus.APPROVED);
    assert.equal(approveResult.request.approvedById, deliveryHeadAlpha.id);
  });

  // =========================================================================
  // Test 7: Deletion Request Rejection with Mandatory Reason
  // =========================================================================
  await t.test("7. Deletion Request Rejection Requires Reason and Restores Active Status", async () => {
    const { candidate } = await createTestCandidate("Tanvi Deshmukh", "C7");

    const reqResult = await createDeletionRequest(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Candidate erasure request",
    });
    const requestId = reqResult.request.id;

    // Rejection without reason fails
    const failReject = await reviewDeletionRequest(authDeliveryAlpha, {
      requestId,
      action: "REJECT",
      rejectionReason: "   ",
    });
    assert.equal(failReject.success, false);
    assert.equal(failReject.statusCode, 400);

    // Rejection with reason succeeds
    const rejectResult = await reviewDeletionRequest(authDeliveryAlpha, {
      requestId,
      action: "REJECT",
      rejectionReason: "Active legal hold: candidate is named in pending commercial contract dispute.",
    });
    assert.equal(rejectResult.success, true);
    assert.equal(rejectResult.request.status, DeletionRequestStatus.REJECTED);
    assert.equal(rejectResult.request.rejectionReason, "Active legal hold: candidate is named in pending commercial contract dispute.");

    // Candidate purgeStatus restored to ACTIVE
    const cand = await prisma.candidate.findUnique({ where: { id: candidate.id } });
    assert.equal(cand?.purgeStatus, CandidatePurgeStatus.ACTIVE);
  });

  // =========================================================================
  // Test 8: Pending-Deletion Processing Prevention
  // =========================================================================
  await t.test("8. Candidate with Pending Deletion Cannot Be Screened or Submitted", async () => {
    const { candidate, doc } = await createTestCandidate("Kunal Kapoor", "C8");

    // Register active consent
    await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
    });

    // Create deletion request (leaves candidate in PURGE_REQUESTED)
    await createDeletionRequest(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Erasure requested",
    });

    // 1. Screening is blocked
    await assert.rejects(
      async () => {
        await screenCandidate({
          agencyId: agencyAlpha.id,
          requisitionId: reqAlpha.id,
          candidateId: candidate.id,
          provider: "mock",
        });
      },
      (err: any) => {
        // Candidate not found/purged or CANDIDATE_DELETION_PENDING
        assert.ok(err.statusCode === 404 || err.statusCode === 403);
        return true;
      }
    );

    // 2. Submission to client is blocked
    // Create dummy evaluation
    const evalRecord = await prisma.evaluation.create({
      data: {
        agencyId: agencyAlpha.id,
        requisitionId: reqAlpha.id,
        candidateId: candidate.id,
        documentId: doc.id,
        status: "COMPLETED",
        overallScore: 85,
        isReviewedByRecruiter: true,
        reviewedById: recruiterAlpha.id,
        provider: "mock",
        modelId: "mock",
        promptVersion: "v1.0",
      },
    });

    const subResult = await submitCandidateToClient(authRecruiterAlpha, {
      evaluationId: evalRecord.id,
      expectedRequisitionId: reqAlpha.id,
      expectedCandidateId: candidate.id,
    });

    assert.equal(subResult.success, false);
    assert.equal(subResult.statusCode, 403);
    assert.equal(subResult.code, "CANDIDATE_DELETION_PENDING");
  });

  // =========================================================================
  // Test 9: Complete Personal Data Removal (Files, DB, Evidence, Evaluations)
  // =========================================================================
  await t.test("9. Complete Personal Data Erasure (Storage Unlink, DB Scrubbing, Minimal Tombstone)", async () => {
    const { candidate, doc, application, storageKey } = await createTestCandidate("Maya Kulkarni", "C9");

    // Ensure physical file exists in storage
    const initialFileExists = await storage.exists(storageKey);
    assert.equal(initialFileExists, true);

    // Record consent and screening evaluation with criterion evidence quotes
    await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
    });

    const evalRecord = await prisma.evaluation.create({
      data: {
        agencyId: agencyAlpha.id,
        requisitionId: reqAlpha.id,
        candidateId: candidate.id,
        applicationId: application.id,
        documentId: doc.id,
        status: "COMPLETED",
        overallScore: 92,
        redactedContent: "Maya Kulkarni confidential CV text",
        provider: "mock",
        modelId: "mock",
        promptVersion: "v1.0",
        criterionScores: {
          create: [
            {
              criterionName: "TypeScript & Node.js",
              weight: 50,
              score: 9,
              status: "SUPPORTED",
              explanation: "Candidate demonstrated deep TypeScript proficiency.",
              quotes: [{ quote: "experienced TypeScript and Node.js backend developer", startOffset: 25, endOffset: 75, verified: true }],
            },
          ],
        },
      },
    });

    // Create deletion request and approve it
    const reqResult = await createDeletionRequest(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Right to erasure / candidate deletion.",
    });
    const requestId = reqResult.request.id;

    await approveDeletionRequest(authDeliveryAlpha, { requestId });

    // Execute deletion
    const execResult = await executeDeletionRequest(authDeliveryAlpha, { requestId });
    assert.equal(execResult.success, true);
    assert.equal(execResult.statusCode, 200);
    assert.equal(execResult.request.status, DeletionRequestStatus.COMPLETED);
    assert.equal(execResult.request.storageCleanupStatus, "COMPLETED");
    assert.equal(execResult.request.candidateName, null); // Scrubbed PII
    assert.equal(execResult.deletedFilesCount, 1);

    // 1. Verify physical file was deleted from storage
    const postFileExists = await storage.exists(storageKey);
    assert.equal(postFileExists, false, "Physical file must be unlinked from storage.");

    // 2. Verify Database records are completely removed
    const dbCandidate = await prisma.candidate.findUnique({ where: { id: candidate.id } });
    assert.equal(dbCandidate, null, "Candidate record must be completely deleted from DB.");

    const dbDoc = await prisma.uploadedDocument.findUnique({ where: { id: doc.id } });
    assert.equal(dbDoc, null, "UploadedDocument record must be deleted.");

    const dbApp = await prisma.application.findUnique({ where: { id: application.id } });
    assert.equal(dbApp, null, "Application record must be deleted.");

    const dbEval = await prisma.evaluation.findUnique({ where: { id: evalRecord.id } });
    assert.equal(dbEval, null, "Evaluation record must be deleted.");

    const dbScores = await prisma.evaluationCriterionScore.findMany({ where: { evaluationId: evalRecord.id } });
    assert.equal(dbScores.length, 0, "EvaluationCriterionScores must be deleted.");

    const dbConsents = await prisma.consentRecord.findMany({ where: { candidateId: candidate.id } });
    assert.equal(dbConsents.length, 0, "Consent records must be scrubbed.");

    // 3. Verify Minimal Justified Audit Tombstone (Zero PII)
    const auditTombstone = await prisma.auditLog.findFirst({
      where: {
        action: "CANDIDATE_DATA_DELETED",
        entityId: candidate.candidateReference,
        organizationId: agencyAlpha.id,
      },
    });
    assert.ok(auditTombstone, "Audit tombstone must be preserved.");
    assert.equal(auditTombstone.actorId, deliveryHeadAlpha.id);
    const meta = auditTombstone.metadata as any;
    assert.equal(meta.outcome, "SUCCESS");
    assert.equal(meta.candidateReference, candidate.candidateReference);
    // Strict PII check: No names, emails, phones, CV text, or evidence quotes
    assert.equal(meta.fullName, undefined);
    assert.equal(meta.extractedText, undefined);
    assert.equal(meta.quotes, undefined);
    assert.equal(meta.email, undefined);
  });

  // =========================================================================
  // Test 10: Storage Failure Resilience and Safe Retry Workflow
  // =========================================================================
  await t.test("10. Storage Failure Resilience: Never Reports Partial Deletion as Complete and Retries Safely", async () => {
    const { candidate, doc, storageKey } = await createTestCandidate("Siddharth Patel", "C10");

    const reqResult = await createDeletionRequest(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "GDPR/Erasure test for storage failure recovery",
    });
    const requestId = reqResult.request.id;
    await approveDeletionRequest(authDeliveryAlpha, { requestId });

    // Mock failing storage provider that simulates a cloud network timeout / permission error
    const failingStorage: StorageProvider = {
      async put() { return { storageKey, sizeBytes: 0 }; },
      async get() { return null; },
      async exists() { return true; },
      async delete() {
        throw new Error("S3/GCS ObjectStorageNetworkTimeout: Failed to reach remote storage bucket.");
      },
    };

    // First attempt with failing storage
    const failedExec = await executeDeletionRequest(authDeliveryAlpha, {
      requestId,
      customStorageProvider: failingStorage,
    });

    assert.equal(failedExec.success, false);
    assert.equal(failedExec.statusCode, 500);
    assert.equal(failedExec.code, "STORAGE_DELETION_FAILED");

    // Request status must NOT be COMPLETED
    const requestAfterFailure = await prisma.candidateDeletionRequest.findUnique({
      where: { id: requestId },
    });
    assert.notEqual(requestAfterFailure?.status, DeletionRequestStatus.COMPLETED);
    assert.equal(requestAfterFailure?.storageCleanupStatus, "FAILED");
    assert.ok(requestAfterFailure?.failureReason?.includes("S3/GCS ObjectStorageNetworkTimeout"));

    // Critical Invariant: Database records must NOT be deleted yet!
    const candStillExists = await prisma.candidate.findUnique({ where: { id: candidate.id } });
    assert.ok(candStillExists, "Candidate must NOT be deleted if physical file deletion fails.");

    const docStillExists = await prisma.uploadedDocument.findUnique({ where: { id: doc.id } });
    assert.ok(docStillExists, "Document must NOT be deleted if physical file deletion fails.");

    // Now Retry execution with working real storage provider
    const retryExec = await executeDeletionRequest(authDeliveryAlpha, {
      requestId,
      customStorageProvider: storage, // working storage
    });

    assert.equal(retryExec.success, true);
    assert.equal(retryExec.statusCode, 200);
    assert.equal(retryExec.request.status, DeletionRequestStatus.COMPLETED);
    assert.equal(retryExec.request.storageCleanupStatus, "COMPLETED");

    // Physical file and DB records are now deleted cleanly
    const fileExistsNow = await storage.exists(storageKey);
    assert.equal(fileExistsNow, false);

    const candDeleted = await prisma.candidate.findUnique({ where: { id: candidate.id } });
    assert.equal(candDeleted, null);
  });

  // =========================================================================
  // Test 11: Idempotency of Completed Deletion Requests
  // =========================================================================
  await t.test("11. Idempotency: Repeated Execution of Completed Deletion Request Returns Safely", async () => {
    const { candidate, storageKey } = await createTestCandidate("Pooja Nair", "C11");

    const reqResult = await createDeletionRequest(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Idempotency verification",
    });
    const requestId = reqResult.request.id;
    await approveDeletionRequest(authDeliveryAlpha, { requestId });
    await executeDeletionRequest(authDeliveryAlpha, { requestId });

    // Repeated call to executeDeletionRequest must succeed idempotently without error
    const repeatResult = await executeDeletionRequest(authDeliveryAlpha, { requestId });
    assert.equal(repeatResult.success, true);
    assert.equal(repeatResult.statusCode, 200);
    assert.equal(repeatResult.request.status, DeletionRequestStatus.COMPLETED);
  });

  // =========================================================================
  // Test 12: Configurable Retention Policy and Safe Review Foundations
  // =========================================================================
  await t.test("12. Configurable Retention Policy & Safe Review (No Silent Auto-Deletion)", async () => {
    // 1. Delivery Head configures agency retention policy
    const policyResult = await createRetentionPolicy(authDeliveryAlpha, {
      name: `Standard Inactive Candidate Policy ${suffix}`,
      description: "Candidates inactive for 365 days are reviewed for retention action.",
      retentionDays: 365,
      purpose: "RECRUITMENT_PROCESSING",
    });

    assert.equal(policyResult.success, true);
    assert.equal(policyResult.statusCode, 201);
    assert.ok(policyResult.policy);
    assert.equal(policyResult.policy.retentionDays, 365);
    assert.equal(policyResult.policy.createdById, deliveryHeadAlpha.id);

    // Recruiter cannot create policy (requires DELIVERY_HEAD)
    const recruiterPolicyAttempt = await createRetentionPolicy(authRecruiterAlpha, {
      name: "Recruiter Policy",
      retentionDays: 180,
    });
    assert.equal(recruiterPolicyAttempt.success, false);
    assert.equal(recruiterPolicyAttempt.statusCode, 403);

    // 2. Fetch Policies
    const policiesList = await getRetentionPolicies(authDeliveryAlpha);
    assert.equal(policiesList.success, true);
    assert.ok(policiesList.policies && policiesList.policies.length >= 1);

    // 3. Set explicit retention expiry in the past for candidate A, and future for candidate B
    const { candidate: expiredCandidate } = await createTestCandidate("Deepak Chopra", "C12A");
    const { candidate: activeCandidate } = await createTestCandidate("Kavita Rao", "C12B");

    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const futureDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 180 days in future

    await setCandidateRetentionExpiry(authDeliveryAlpha, expiredCandidate.id, pastDate);
    await setCandidateRetentionExpiry(authDeliveryAlpha, activeCandidate.id, futureDate);

    // 4. Safe Review Query
    const reviewResult = await getRetentionReviewCandidates(authDeliveryAlpha);
    assert.equal(reviewResult.success, true);
    assert.ok(reviewResult.candidates);

    // Expired candidate must be flagged in review
    const foundExpired = reviewResult.candidates.find((c) => c.id === expiredCandidate.id);
    assert.ok(foundExpired, "Expired candidate must be flagged in retention review.");

    // Active candidate must NOT be flagged
    const foundActive = reviewResult.candidates.find((c) => c.id === activeCandidate.id);
    assert.equal(foundActive, undefined, "Active candidate within retention window must not be flagged.");

    // Crucial Safety Invariant: Expired candidate was NOT automatically deleted!
    const candidateRecord = await prisma.candidate.findUnique({
      where: { id: expiredCandidate.id },
    });
    assert.ok(candidateRecord, "Candidate must remain in DB; no silent automatic deletion without human approval.");
    assert.equal(candidateRecord.purgeStatus, CandidatePurgeStatus.ACTIVE);
  });

  // =========================================================================
  // Test 13: Protected API Endpoints (NextRequest Integration Tests)
  // =========================================================================
  await t.test("13. Protected API Routes for Consent, Deletion Lifecycle, and Retention", async () => {
    const { candidate } = await createTestCandidate("Tarun Bakshi", "C13");

    // 1. POST /api/candidates/[id]/consent
    const postConsentReq = createAuthRequest(
      `http://localhost:3000/api/candidates/${candidate.id}/consent`,
      sessionRecruiterAlpha.sessionToken,
      {
        method: "POST",
        body: {
          purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
          noticeVersion: "v2.0",
          source: CONSENT_SOURCES.DIRECT_APPLICATION,
        },
      }
    );
    const postConsentRes = await consentRoute(postConsentReq, {
      params: Promise.resolve({ id: candidate.id }),
    });
    assert.equal(postConsentRes.status, 200);
    const postConsentJson = await postConsentRes.json();
    assert.equal(postConsentJson.success, true);
    assert.equal(postConsentJson.consentRecord.noticeVersion, "v2.0");

    // 2. GET /api/candidates/[id]/consent
    const getConsentReq = createAuthRequest(
      `http://localhost:3000/api/candidates/${candidate.id}/consent`,
      sessionRecruiterAlpha.sessionToken
    );
    const getConsentRes = await getConsentRoute(getConsentReq, {
      params: Promise.resolve({ id: candidate.id }),
    });
    assert.equal(getConsentRes.status, 200);
    const getConsentJson = await getConsentRes.json();
    assert.equal(getConsentJson.records.length, 1);

    // 3. POST /api/candidates/[id]/consent/withdraw
    const withdrawReq = createAuthRequest(
      `http://localhost:3000/api/candidates/${candidate.id}/consent/withdraw`,
      sessionRecruiterAlpha.sessionToken,
      {
        method: "POST",
        body: { reason: "Candidate requested withdrawal via API." },
      }
    );
    const withdrawRes = await withdrawConsentRoute(withdrawReq, {
      params: Promise.resolve({ id: candidate.id }),
    });
    assert.equal(withdrawRes.status, 200);

    // 4. POST /api/candidates/[id]/deletion-requests
    const createDelReq = createAuthRequest(
      `http://localhost:3000/api/candidates/${candidate.id}/deletion-requests`,
      sessionRecruiterAlpha.sessionToken,
      {
        method: "POST",
        body: { reason: "Right to erasure requested via API." },
      }
    );
    const createDelRes = await createDeletionRoute(createDelReq, {
      params: Promise.resolve({ id: candidate.id }),
    });
    assert.equal(createDelRes.status, 201);
    const createDelJson = await createDelRes.json();
    const apiRequestId = createDelJson.request.id;

    // 5. GET /api/deletion-requests
    const listDelReq = createAuthRequest(
      "http://localhost:3000/api/deletion-requests",
      sessionDeliveryAlpha.sessionToken
    );
    const listDelRes = await listDeletionsRoute(listDelReq);
    assert.equal(listDelRes.status, 200);
    const listDelJson = await listDelRes.json();
    assert.ok(listDelJson.requests.length >= 1);

    // 6. PATCH /api/deletion-requests/[id] (Approve by Delivery Head)
    const approveReq = createAuthRequest(
      `http://localhost:3000/api/deletion-requests/${apiRequestId}`,
      sessionDeliveryAlpha.sessionToken,
      {
        method: "PATCH",
        body: { status: "APPROVED" },
      }
    );
    const approveRes = await reviewDeletionRoute(approveReq, {
      params: Promise.resolve({ id: apiRequestId }),
    });
    assert.equal(approveRes.status, 200);

    // 7. POST /api/deletion-requests/[id]/execute (Execute by Delivery Head)
    const executeReq = createAuthRequest(
      `http://localhost:3000/api/deletion-requests/${apiRequestId}/execute`,
      sessionDeliveryAlpha.sessionToken,
      { method: "POST" }
    );
    const executeRes = await executeDeletionRoute(executeReq, {
      params: Promise.resolve({ id: apiRequestId }),
    });
    assert.equal(executeRes.status, 200);
    const executeJson = await executeRes.json();
    assert.equal(executeJson.request.status, DeletionRequestStatus.COMPLETED);

    // 8. GET /api/retention/review
    const retentionReviewReq = createAuthRequest(
      "http://localhost:3000/api/retention/review",
      sessionDeliveryAlpha.sessionToken
    );
    const retentionReviewRes = await getRetentionReviewRoute(retentionReviewReq);
    assert.equal(retentionReviewRes.status, 200);
  });

  // =========================================================================
  // Test 14: Milestone 7.1 Audit — Independent Third-Party Sharing Consent
  // =========================================================================
  await t.test("14. Independent Third-Party Sharing Consent vs Recruitment Processing Consent", async () => {
    const { candidate, doc } = await createTestCandidate("Divya Sharma", "C14");

    // Record valid recruitment processing consent
    await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
      evidenceType: ConsentEvidenceType.PORTAL_AUTH_SESSION,
      evidenceReference: "divya-recruitment-consent",
    });

    // Withdraw third party sharing consent explicitly
    await withdrawConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Candidate does not want profile submitted to third-party clients yet",
      purpose: CONSENT_PURPOSES.THIRD_PARTY_SHARING,
    });

    // Verify recruitment processing is ACTIVE and third-party sharing is WITHDRAWN
    const checkRecruit = await checkCandidateConsent(candidate.id, agencyAlpha.id, CONSENT_PURPOSES.RECRUITMENT_PROCESSING);
    assert.equal(checkRecruit.hasConsent, true);
    assert.equal(checkRecruit.isWithdrawn, false);

    const checkSharing = await checkCandidateConsent(candidate.id, agencyAlpha.id, CONSENT_PURPOSES.THIRD_PARTY_SHARING);
    assert.equal(checkSharing.hasConsent, false);
    assert.equal(checkSharing.isWithdrawn, true);

    // AI screening succeeds because recruitment processing is active
    const evalRes = await screenCandidate({
      agencyId: agencyAlpha.id,
      requisitionId: reqAlpha.id,
      candidateId: candidate.id,
      actorId: recruiterAlpha.id,
    });
    assert.ok(evalRes.evaluationId);

    // Recruiter reviews evaluation and views original CV
    await prisma.evaluation.update({
      where: { id: evalRes.evaluationId },
      data: {
        isReviewedByRecruiter: true,
        reviewedById: recruiterAlpha.id,
        reviewedAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "ORIGINAL_CV_VIEWED",
        actorId: recruiterAlpha.id,
        organizationId: agencyAlpha.id,
        entityType: "UploadedDocument",
        entityId: doc.id,
      },
    });

    // Client submission MUST fail with THIRD_PARTY_CONSENT_WITHDRAWN
    const submitBlocked = await submitCandidateToClient(authRecruiterAlpha, {
      evaluationId: evalRes.evaluationId,
      clientOrganizationId: clientAlpha.id,
    });
    assert.equal(submitBlocked.success, false);
    assert.equal(submitBlocked.statusCode, 403);
    assert.equal(submitBlocked.code, "THIRD_PARTY_CONSENT_WITHDRAWN");

    // Now re-grant third-party sharing consent
    await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.THIRD_PARTY_SHARING,
      evidenceType: ConsentEvidenceType.EMAIL_CONFIRMATION,
      evidenceReference: "divya-third-party-regrant",
    });

    const checkSharingRegrant = await checkCandidateConsent(candidate.id, agencyAlpha.id, CONSENT_PURPOSES.THIRD_PARTY_SHARING);
    assert.equal(checkSharingRegrant.hasConsent, true);
    assert.equal(checkSharingRegrant.isWithdrawn, false);

    // Client submission now succeeds
    const submitSuccess = await submitCandidateToClient(authRecruiterAlpha, {
      evaluationId: evalRes.evaluationId,
      clientOrganizationId: clientAlpha.id,
    });
    assert.equal(submitSuccess.success, true);
    assert.equal(submitSuccess.statusCode, 200);
  });

  // =========================================================================
  // Test 15: Milestone 7.1 Audit — Pipeline Stage Transition Consent & Deletion Guard
  // =========================================================================
  await t.test("15. Pipeline Stage Transition Bypasses Prevented for Withdrawn Consent and Pending Deletion", async () => {
    const { candidate, doc, application } = await createTestCandidate("Rohan Verma", "C15");

    // Complete evaluation & CV view
    const evalRes = await screenCandidate({
      agencyId: agencyAlpha.id,
      requisitionId: reqAlpha.id,
      candidateId: candidate.id,
      actorId: recruiterAlpha.id,
    });
    await prisma.evaluation.update({
      where: { id: evalRes.evaluationId },
      data: {
        isReviewedByRecruiter: true,
        reviewedById: recruiterAlpha.id,
        reviewedAt: new Date(),
        applicationId: application.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "ORIGINAL_CV_VIEWED",
        actorId: recruiterAlpha.id,
        organizationId: agencyAlpha.id,
        entityType: "UploadedDocument",
        entityId: doc.id,
      },
    });

    // Mark as SCREENED
    await prisma.application.update({
      where: { id: application.id },
      data: { status: ApplicationStatus.SCREENED },
    });

    // Withdraw recruitment consent
    await withdrawConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Candidate withdrew recruitment consent",
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
    });

    // Direct transition to SUBMITTED_TO_CLIENT via pipeline transition service must be BLOCKED
    const blockRecruit = await transitionApplicationStage(authRecruiterAlpha, {
      applicationId: application.id,
      targetStatus: ApplicationStatus.SUBMITTED_TO_CLIENT,
    });
    assert.equal(blockRecruit.success, false);
    assert.equal(blockRecruit.statusCode, 403);
    assert.equal(blockRecruit.code, "CONSENT_WITHDRAWN");

    // Re-grant recruitment, but withdraw third-party sharing
    await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
    });
    await withdrawConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Candidate withdrew third party sharing",
      purpose: CONSENT_PURPOSES.THIRD_PARTY_SHARING,
    });

    const blockSharing = await transitionApplicationStage(authRecruiterAlpha, {
      applicationId: application.id,
      targetStatus: ApplicationStatus.SUBMITTED_TO_CLIENT,
    });
    assert.equal(blockSharing.success, false);
    assert.equal(blockSharing.statusCode, 403);
    assert.equal(blockSharing.code, "THIRD_PARTY_CONSENT_WITHDRAWN");

    // Re-grant third party sharing
    await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.THIRD_PARTY_SHARING,
    });

    // Request deletion
    await createDeletionRequest(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Candidate right to erasure request",
    });

    // Direct transition to SUBMITTED_TO_CLIENT must be BLOCKED by pending deletion
    const blockDeletion = await transitionApplicationStage(authRecruiterAlpha, {
      applicationId: application.id,
      targetStatus: ApplicationStatus.SUBMITTED_TO_CLIENT,
    });
    assert.equal(blockDeletion.success, false);
    assert.equal(blockDeletion.statusCode, 403);
    assert.equal(blockDeletion.code, "CANDIDATE_DELETION_PENDING");
  });

  // =========================================================================
  // Test 16: Milestone 7.1 Audit — Multi-Document Storage Failure Recovery & Residual Scrubbing
  // =========================================================================
  await t.test("16. Multi-Document Storage Failure Recovery with Individual Key Tracking and BatchFileItem Scrubbing", async () => {
    const { candidate, doc: doc1, storageKey: key1 } = await createTestCandidate("Kavita Reddy", "C16");

    // Add a second document to simulate multiple documents
    const key2 = generateStorageKey("pdf");
    const doc2Buffer = Buffer.from("%PDF-1.4 second document for Kavita");
    await storage.put(key2, doc2Buffer);

    const doc2 = await prisma.uploadedDocument.create({
      data: {
        agencyId: agencyAlpha.id,
        candidateId: candidate.id,
        fileName: "Kavita_Portfolio.pdf",
        fileType: "application/pdf",
        storageKey: key2,
        fileSizeBytes: doc2Buffer.length,
        fileHash: crypto.createHash("sha256").update(doc2Buffer).digest("hex"),
        processingStatus: "EXTRACTED",
        extractedText: "Kavita Portfolio Work and references.",
      },
    });

    // Create a batch job and BatchFileItem with personal filename
    const batchJob = await prisma.batchUploadJob.create({
      data: {
        agencyId: agencyAlpha.id,
        requisitionId: reqAlpha.id,
        status: "COMPLETED",
        totalFiles: 1,
        processedFiles: 1,
        successfulFiles: 1,
      },
    });

    const batchItem = await prisma.batchFileItem.create({
      data: {
        batchJobId: batchJob.id,
        idempotencyKey: `batch-item-kavita-${suffix}`,
        originalFileName: "Kavita_Reddy_Resume_Confidential.pdf",
        fileSizeBytes: 1024,
        documentId: doc1.id,
        status: "COMPLETED",
        errorMessage: "Old error mentioning Kavita",
      },
    });

    // Request and approve deletion
    const delReq = await createDeletionRequest(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Full privacy erasure test",
    });
    const requestId = delReq.request.id;
    await approveDeletionRequest(authDeliveryAlpha, { requestId });

    // Mock storage that succeeds on key1 but fails on key2
    const deletedInMock: string[] = [];
    const partiallyFailingStorage: StorageProvider = {
      async put() { return { storageKey: "", sizeBytes: 0 }; },
      async get() { return null; },
      async exists() { return true; },
      async delete(key: string) {
        if (key === key2) {
          throw new Error("GCS Network Timeout on key2");
        }
        deletedInMock.push(key);
      },
    };

    // Attempt 1: Fails on key2
    const attempt1 = await executeDeletionRequest(authDeliveryAlpha, {
      requestId,
      customStorageProvider: partiallyFailingStorage,
    });
    assert.equal(attempt1.success, false);
    assert.equal(attempt1.statusCode, 500);
    assert.equal(attempt1.code, "STORAGE_DELETION_FAILED");
    assert.equal(attempt1.deletedFilesCount, 1);
    assert.equal(attempt1.totalFilesCount, 2);

    // Verify key1 was tracked in metadata
    const reqAfterAttempt1 = await prisma.candidateDeletionRequest.findUnique({
      where: { id: requestId },
    });
    assert.equal(reqAfterAttempt1?.storageCleanupStatus, "FAILED");
    const meta1 = reqAfterAttempt1?.metadata as Record<string, any>;
    assert.ok(meta1.deletedStorageKeys.includes(key1));
    assert.ok(!meta1.deletedStorageKeys.includes(key2));

    // Verify database records are still 100% INTACT
    const candidateStillExists = await prisma.candidate.findUnique({ where: { id: candidate.id } });
    assert.ok(candidateStillExists, "Candidate must remain intact in DB after partial storage failure.");
    const doc1Exists = await prisma.uploadedDocument.findUnique({ where: { id: doc1.id } });
    assert.ok(doc1Exists);

    // Attempt 2: Retry with working storage (which also tracks calls to ensure key1 is skipped)
    const callsInRetry: string[] = [];
    const retryStorage: StorageProvider = {
      async put() { return { storageKey: "", sizeBytes: 0 }; },
      async get() { return null; },
      async exists() { return false; },
      async delete(key: string) {
        callsInRetry.push(key);
      },
    };

    const attempt2 = await executeDeletionRequest(authDeliveryAlpha, {
      requestId,
      customStorageProvider: retryStorage,
    });
    assert.equal(attempt2.success, true);
    assert.equal(attempt2.statusCode, 200);
    assert.equal(attempt2.request.status, DeletionRequestStatus.COMPLETED);
    assert.equal(attempt2.request.storageCleanupStatus, "COMPLETED");

    // Key1 should NOT have been called again (skipped due to deletedStorageKeys)
    assert.ok(!callsInRetry.includes(key1), "Already-deleted key1 must be skipped on retry.");
    assert.ok(callsInRetry.includes(key2), "Key2 must be deleted on retry.");

    // Database records are now completely scrubbed
    const candScrubbed = await prisma.candidate.findUnique({ where: { id: candidate.id } });
    assert.equal(candScrubbed, null);

    const doc1Scrubbed = await prisma.uploadedDocument.findUnique({ where: { id: doc1.id } });
    assert.equal(doc1Scrubbed, null);

    // BatchFileItem residual identifiers are scrubbed
    const batchItemScrubbed = await prisma.batchFileItem.findUnique({ where: { id: batchItem.id } });
    assert.equal(batchItemScrubbed?.documentId, null);
    assert.equal(batchItemScrubbed?.originalFileName, "[REDACTED_DELETED_FILE]");
    assert.equal(batchItemScrubbed?.errorMessage, null);
  });

  // =========================================================================
  // Test 17: Milestone 7.1 Audit — Concurrency Guard on Deletion Execution
  // =========================================================================
  await t.test("17. Atomic Concurrency Lock Guard on Deletion Execution", async () => {
    const { candidate } = await createTestCandidate("Arjun Rao", "C17");
    const delReq = await createDeletionRequest(authRecruiterAlpha, {
      candidateId: candidate.id,
      reason: "Concurrency test",
    });
    const requestId = delReq.request.id;
    await approveDeletionRequest(authDeliveryAlpha, { requestId });

    // Simulate concurrent execution: one thread acquires lock
    await prisma.candidateDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: DeletionRequestStatus.PROCESSING,
        storageCleanupStatus: "IN_PROGRESS",
      },
    });

    // Concurrent call must be rejected with 409 CONCURRENT_EXECUTION_BLOCKED
    const concurrentAttempt = await executeDeletionRequest(authDeliveryAlpha, { requestId });
    assert.equal(concurrentAttempt.success, false);
    assert.equal(concurrentAttempt.statusCode, 409);
    assert.equal(concurrentAttempt.code, "CONCURRENT_EXECUTION_BLOCKED");

    // Reset status back to FAILED to verify retry is unblocked
    await prisma.candidateDeletionRequest.update({
      where: { id: requestId },
      data: { storageCleanupStatus: "FAILED" },
    });

    const retryAllowed = await executeDeletionRequest(authDeliveryAlpha, { requestId });
    assert.equal(retryAllowed.success, true);
    assert.equal(retryAllowed.statusCode, 200);
  });

  // =========================================================================
  // Test 18: Milestone 7.1 Audit — Auditable Retention Expiry Updates
  // =========================================================================
  await t.test("18. Auditable Retention Expiry Date Updates", async () => {
    const { candidate } = await createTestCandidate("Meera Nair", "C18");
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const updateRes = await setCandidateRetentionExpiry(authDeliveryAlpha, candidate.id, futureDate);
    assert.equal(updateRes.success, true);
    assert.equal(updateRes.statusCode, 200);

    // Verify audit log entry was created
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "CANDIDATE_RETENTION_EXPIRY_UPDATED",
        entityType: "Candidate",
        entityId: candidate.candidateReference,
      },
    });
    assert.ok(audit, "AuditLog entry must be created when retention expiry is updated.");
    assert.equal(audit?.actorId, authDeliveryAlpha.id);
  });

  // =========================================================================
  // Test 19: Milestone 7.1 Audit — Explicit Consent Screening Gate
  // =========================================================================
  await t.test("19. Explicit Consent Screening Gate Enforced When Configured", async () => {
    const { candidate } = await createTestCandidate("Vikram Singh", "C19");

    // Screening without explicit consent when requireExplicitConsent: true throws 403
    await assert.rejects(
      async () => {
        await screenCandidate({
          agencyId: agencyAlpha.id,
          requisitionId: reqAlpha.id,
          candidateId: candidate.id,
          requireExplicitConsent: true,
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 403);
        assert.ok(err.message.includes("CONSENT_REQUIRED"));
        return true;
      }
    );

    // Now record valid consent
    await recordConsent(authRecruiterAlpha, {
      candidateId: candidate.id,
      purpose: CONSENT_PURPOSES.RECRUITMENT_PROCESSING,
    });

    // Screening with requireExplicitConsent: true now succeeds
    const evalRes = await screenCandidate({
      agencyId: agencyAlpha.id,
      requisitionId: reqAlpha.id,
      candidateId: candidate.id,
      requireExplicitConsent: true,
      actorId: recruiterAlpha.id,
    });
    assert.ok(evalRes.evaluationId);
  });
});

