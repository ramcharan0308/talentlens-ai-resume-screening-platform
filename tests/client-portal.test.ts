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
import { POST as submitEvaluationRoute } from "../src/app/api/evaluations/[id]/submit/route";
import { POST as createRequisitionRoute } from "../src/app/api/requisitions/route";
import { PATCH as updateRequisitionRoute } from "../src/app/api/requisitions/[id]/route";
import { POST as submitCandidateRequisitionRoute } from "../src/app/api/requisitions/[id]/candidates/[candidateId]/submit/route";
import { GET as getClientsRoute, POST as createClientRoute } from "../src/app/api/clients/route";
import { GET as clientDashboardRoute } from "../src/app/api/client/dashboard/route";
import { GET as clientRequisitionsRoute } from "../src/app/api/client/requisitions/route";
import { GET as clientRequisitionDetailRoute } from "../src/app/api/client/requisitions/[id]/route";
import { GET as clientCandidateDetailRoute } from "../src/app/api/client/candidates/[id]/route";
import { POST as clientDecisionRoute } from "../src/app/api/client/applications/[id]/decision/route";
import { GET as downloadDocumentRoute } from "../src/app/api/documents/[id]/download/route";
import { GET as getRequisitionEvaluationsRoute } from "../src/app/api/requisitions/[id]/evaluations/route";


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

test("Milestone 5: Recruiter Candidate Submission Security & Invariants", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  // 1. Create Agency, Client A, Client B
  const agencyA = await prisma.organization.create({
    data: { name: `Agency A ${suffix}`, type: OrganizationType.AGENCY },
  });
  const agencyB = await prisma.organization.create({
    data: { name: `Agency B ${suffix}`, type: OrganizationType.AGENCY },
  });
  const clientA = await prisma.organization.create({
    data: { name: `Client Alpha ${suffix}`, type: OrganizationType.CLIENT, agencyId: agencyA.id },
  });
  const clientB = await prisma.organization.create({
    data: { name: `Client Beta ${suffix}`, type: OrganizationType.CLIENT, agencyId: agencyB.id },
  });

  // Users
  const recruiterA = await prisma.user.create({
    data: {
      name: `Recruiter A ${suffix}`,
      email: `recruiter.a.${suffix}@agencya.com`,
      role: UserRole.RECRUITER,
      organizationId: agencyA.id,
      isActive: true,
    },
  });
  const recruiterB = await prisma.user.create({
    data: {
      name: `Recruiter B ${suffix}`,
      email: `recruiter.b.${suffix}@agencyb.com`,
      role: UserRole.RECRUITER,
      organizationId: agencyB.id,
      isActive: true,
    },
  });
  const clientHiringMgrA = await prisma.user.create({
    data: {
      name: `Client Mgr A ${suffix}`,
      email: `mgr.a.${suffix}@clienta.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientA.id,
      isActive: true,
    },
  });

  const recruiterASession = await createSession(recruiterA.id);
  const recruiterBSession = await createSession(recruiterB.id);
  const clientASession = await createSession(clientHiringMgrA.id);

  // Requisition associated with Client A
  const requisitionA = await prisma.requisition.create({
    data: {
      title: `Senior Backend Engineer ${suffix}`,
      jobDescription: "Microservices architecture in Java, Spring Boot, and Kafka.",
      organizationId: agencyA.id,
      clientOrganizationId: clientA.id,
      createdById: recruiterA.id,
      status: RequisitionStatus.ACTIVE,
    },
  });

  // Candidate and CV document
  const candidateA = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-${suffix.toUpperCase()}-01`,
      fullName: `Jane Doe ${suffix}`,
      currentRole: "Java Specialist",
      experienceYears: 6.5,
      keySkills: ["Java", "Spring Boot", "Kafka"],
      agencyId: agencyA.id,
    },
  });

  const docKey = `${suffix}-resume.pdf`;
  const storage = getStorageProvider();
  await storage.put(docKey, Buffer.from("%PDF-1.4 Mock Candidate Resume"));

  const documentA = await prisma.uploadedDocument.create({
    data: {
      agencyId: agencyA.id,
      candidateId: candidateA.id,
      fileName: "Jane_Resume.pdf",
      fileType: "application/pdf",
      storageKey: docKey,
      fileHash: crypto.randomBytes(32).toString("hex"),
      fileSizeBytes: 1024,
      processingStatus: DocumentProcessingStatus.EXTRACTED,
      extractedText: "Jane Doe - 6.5 years Java, Spring Boot, Kafka architecture.",
    },
  });

  // Evaluation (initially unreviewed)
  const evaluationA = await prisma.evaluation.create({
    data: {
      agencyId: agencyA.id,
      requisitionId: requisitionA.id,
      candidateId: candidateA.id,
      documentId: documentA.id,
      status: "COMPLETED",
      overallScore: 88,
      evidenceCoverage: 100,
      isReviewedByRecruiter: false,
      provider: "mock",
      modelId: "mock-v1",
      promptVersion: "v1.0",
    },
  });

  // Check 1: Client Hiring Manager cannot call recruiter submission endpoint -> 403
  {
    const req = createAuthRequest(
      `/api/evaluations/${evaluationA.id}/submit`,
      clientASession.sessionToken,
      { method: "POST", body: { clientOrganizationId: clientA.id } }
    );
    const res = await submitEvaluationRoute(req, { params: Promise.resolve({ id: evaluationA.id }) });
    assert.equal(res.status, 403, "Client hiring manager must receive 403 on submission API");
  }

  // Check 2: Recruiter cannot submit without reviewing evaluation -> 428 Precondition Required
  {
    const req = createAuthRequest(
      `/api/evaluations/${evaluationA.id}/submit`,
      recruiterASession.sessionToken,
      { method: "POST", body: { clientOrganizationId: clientA.id } }
    );
    const res = await submitEvaluationRoute(req, { params: Promise.resolve({ id: evaluationA.id }) });
    const json = await res.json();
    assert.equal(res.status, 428, "Unreviewed evaluation submission must return 428");
    assert.equal(json.code, "EVALUATION_NOT_REVIEWED");
  }

  // Mark evaluation as reviewed, but WITHOUT inspecting CV
  await prisma.evaluation.update({
    where: { id: evaluationA.id },
    data: {
      isReviewedByRecruiter: true,
      reviewedAt: new Date(),
      reviewedById: recruiterA.id,
    },
  });

  // Check 3: Recruiter cannot submit without personally inspecting CV -> 428 CV_NOT_VIEWED
  {
    const req = createAuthRequest(
      `/api/evaluations/${evaluationA.id}/submit`,
      recruiterASession.sessionToken,
      { method: "POST", body: { clientOrganizationId: clientA.id } }
    );
    const res = await submitEvaluationRoute(req, { params: Promise.resolve({ id: evaluationA.id }) });
    const json = await res.json();
    assert.equal(res.status, 428, "Missing CV inspection audit event must return 428");
    assert.equal(json.code, "CV_NOT_VIEWED");
  }

  // Record CV inspection audit event by Recruiter A
  await prisma.auditLog.create({
    data: {
      action: "ORIGINAL_CV_VIEWED",
      actorId: recruiterA.id,
      organizationId: agencyA.id,
      entityType: "UploadedDocument",
      entityId: documentA.id,
      metadata: { candidateReference: candidateA.candidateReference, documentId: documentA.id },
    },
  });

  // Check 4: Recruiter from Agency B cannot submit Agency A's candidate -> 403
  {
    const req = createAuthRequest(
      `/api/evaluations/${evaluationA.id}/submit`,
      recruiterBSession.sessionToken,
      { method: "POST", body: { clientOrganizationId: clientA.id } }
    );
    const res = await submitEvaluationRoute(req, { params: Promise.resolve({ id: evaluationA.id }) });
    assert.equal(res.status, 403, "Cross-agency submission attempt must return 403");
  }

  // Check 5: Recruiter cannot submit to an invalid or agency organization -> 400
  {
    const req = createAuthRequest(
      `/api/evaluations/${evaluationA.id}/submit`,
      recruiterASession.sessionToken,
      { method: "POST", body: { clientOrganizationId: agencyB.id } }
    );
    const res = await submitEvaluationRoute(req, { params: Promise.resolve({ id: evaluationA.id }) });
    assert.equal(res.status, 400, "Submitting to non-client organization must return 400");
  }

  // Check 6: Valid Recruiter Submission succeeds -> 200 OK
  {
    const req = createAuthRequest(
      `/api/evaluations/${evaluationA.id}/submit`,
      recruiterASession.sessionToken,
      { method: "POST", body: { clientOrganizationId: clientA.id } }
    );
    const res = await submitEvaluationRoute(req, { params: Promise.resolve({ id: evaluationA.id }) });
    const json = await res.json();
    assert.equal(res.status, 200, "Valid submission must return 200 OK");
    assert.equal(json.success, true);
    assert.equal(json.data.status, ApplicationStatus.SUBMITTED_TO_CLIENT);
    assert.equal(json.data.isAlreadySubmitted, false);

    // Verify DB Application Record
    const app = await prisma.application.findUnique({
      where: { id: json.data.applicationId },
    });
    assert.ok(app, "Application record must exist in DB");
    assert.equal(app.status, ApplicationStatus.SUBMITTED_TO_CLIENT);
    assert.equal(app.submittedById, recruiterA.id);
    assert.equal(app.clientOrganizationId, clientA.id);
    assert.ok(app.submittedAt, "submittedAt must be populated");

    // Verify AuditLog record
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "CANDIDATE_SUBMITTED_TO_CLIENT",
        entityId: app.id,
      },
    });
    assert.ok(audit, "AuditLog CANDIDATE_SUBMITTED_TO_CLIENT must be recorded");
    assert.equal(audit.actorId, recruiterA.id);
    assert.equal(audit.organizationId, agencyA.id);
  }

  // Check 7: Submission is Idempotent -> 200 OK with isAlreadySubmitted: true
  {
    const req = createAuthRequest(
      `/api/evaluations/${evaluationA.id}/submit`,
      recruiterASession.sessionToken,
      { method: "POST", body: { clientOrganizationId: clientA.id } }
    );
    const res = await submitEvaluationRoute(req, { params: Promise.resolve({ id: evaluationA.id }) });
    const json = await res.json();
    assert.equal(res.status, 200, "Repeated submission must be idempotent (200 OK)");
    assert.equal(json.success, true);
    assert.equal(json.data.isAlreadySubmitted, true);
  }
});

test("Milestone 5: Client Portal Multi-Tenant Isolation & Unsubmitted Shielding", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  const agency = await prisma.organization.create({
    data: { name: `Agency Iso ${suffix}`, type: OrganizationType.AGENCY },
  });
  const clientA = await prisma.organization.create({
    data: { name: `Client A ${suffix}`, type: OrganizationType.CLIENT, agencyId: agency.id },
  });
  const clientB = await prisma.organization.create({
    data: { name: `Client B ${suffix}`, type: OrganizationType.CLIENT, agencyId: agency.id },
  });

  const recruiter = await prisma.user.create({
    data: {
      name: `Recruiter ${suffix}`,
      email: `recruiter.${suffix}@agency.com`,
      role: UserRole.RECRUITER,
      organizationId: agency.id,
      isActive: true,
    },
  });
  const clientMgrA = await prisma.user.create({
    data: {
      name: `Client Mgr A ${suffix}`,
      email: `mgr.a.${suffix}@clienta.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientA.id,
      isActive: true,
    },
  });
  const clientMgrB = await prisma.user.create({
    data: {
      name: `Client Mgr B ${suffix}`,
      email: `mgr.b.${suffix}@clientb.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientB.id,
      isActive: true,
    },
  });

  const clientASession = await createSession(clientMgrA.id);
  const clientBSession = await createSession(clientMgrB.id);

  // Requisition for Client A
  const reqA = await prisma.requisition.create({
    data: {
      title: `Client A Requisition ${suffix}`,
      jobDescription: "Frontend specialist position in React and TypeScript.",
      organizationId: agency.id,
      clientOrganizationId: clientA.id,
      createdById: recruiter.id,
      status: RequisitionStatus.ACTIVE,
    },
  });

  // Requisition for Client B
  const reqB = await prisma.requisition.create({
    data: {
      title: `Client B Requisition ${suffix}`,
      jobDescription: "Data engineer position in Python and Spark.",
      organizationId: agency.id,
      clientOrganizationId: clientB.id,
      createdById: recruiter.id,
      status: RequisitionStatus.ACTIVE,
    },
  });

  // Candidate 1 (Submitted to Client A)
  const candidateA = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-A-${suffix.toUpperCase()}`,
      fullName: `Alice Sub ${suffix}`,
      currentRole: "Frontend Lead",
      experienceYears: 7,
      keySkills: ["React", "TypeScript", "Next.js"],
      agencyId: agency.id,
    },
  });

  const appA = await prisma.application.create({
    data: {
      candidateId: candidateA.id,
      requisitionId: reqA.id,
      status: ApplicationStatus.SUBMITTED_TO_CLIENT,
      submittedAt: new Date(),
      submittedById: recruiter.id,
      clientOrganizationId: clientA.id,
    },
  });

  await prisma.evaluation.create({
    data: {
      agencyId: agency.id,
      requisitionId: reqA.id,
      candidateId: candidateA.id,
      applicationId: appA.id,
      status: "COMPLETED",
      overallScore: 92,
      evidenceCoverage: 100,
      isReviewedByRecruiter: true,
      provider: "mock",
      modelId: "mock-v1",
      promptVersion: "v1.0",
    },
  });

  // Candidate 2 (Unsubmitted Dossier in Screening)
  const candidateUnsubmitted = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-UNSUB-${suffix.toUpperCase()}`,
      fullName: `Bob Unsub ${suffix}`,
      currentRole: "Java Developer",
      experienceYears: 4,
      keySkills: ["Java", "Spring Boot"],
      agencyId: agency.id,
    },
  });

  const appUnsubmitted = await prisma.application.create({
    data: {
      candidateId: candidateUnsubmitted.id,
      requisitionId: reqA.id,
      status: ApplicationStatus.SCREENED, // NOT submitted
    },
  });

  // Candidate 3 (Submitted to Client B)
  const candidateB = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-B-${suffix.toUpperCase()}`,
      fullName: `Charlie ClientB ${suffix}`,
      currentRole: "Data Engineer",
      experienceYears: 5,
      keySkills: ["Python", "Spark"],
      agencyId: agency.id,
    },
  });

  const appB = await prisma.application.create({
    data: {
      candidateId: candidateB.id,
      requisitionId: reqB.id,
      status: ApplicationStatus.SUBMITTED_TO_CLIENT,
      submittedAt: new Date(),
      submittedById: recruiter.id,
      clientOrganizationId: clientB.id,
    },
  });

  // Check 1: Client A cannot see Client B's requisitions in requisitions list
  {
    const req = createAuthRequest("/api/client/requisitions", clientASession.sessionToken);
    const res = await clientRequisitionsRoute(req);
    const json = await res.json();
    assert.equal(res.status, 200);
    const reqIds = json.data.map((r: any) => r.id);
    assert.ok(reqIds.includes(reqA.id), "Client A must see Requisition A");
    assert.ok(!reqIds.includes(reqB.id), "Client A must NOT see Client B's requisition");
  }

  // Check 2: Client A cannot access Client B's requisition by direct ID -> 404
  {
    const req = createAuthRequest(`/api/client/requisitions/${reqB.id}`, clientASession.sessionToken);
    const res = await clientRequisitionDetailRoute(req, { params: Promise.resolve({ id: reqB.id }) });
    assert.equal(res.status, 404, "Accessing another client's requisition must return 404");
  }

  // Check 3: Client A cannot retrieve Client B's candidate by direct API ID -> 404
  {
    const req = createAuthRequest(`/api/client/candidates/${candidateB.id}`, clientASession.sessionToken);
    const res = await clientCandidateDetailRoute(req, { params: Promise.resolve({ id: candidateB.id }) });
    assert.equal(res.status, 404, "Accessing another client's candidate must return 404");
  }

  // Check 4: Client A cannot see an unsubmitted candidate -> 404
  {
    const req = createAuthRequest(`/api/client/candidates/${candidateUnsubmitted.id}`, clientASession.sessionToken);
    const res = await clientCandidateDetailRoute(req, { params: Promise.resolve({ id: candidateUnsubmitted.id }) });
    assert.equal(res.status, 404, "Unsubmitted candidate must return 404 for client");
  }

  // Check 5: Client A successfully views Candidate A with MASKED PII
  {
    const req = createAuthRequest(`/api/client/candidates/${candidateA.id}`, clientASession.sessionToken);
    const res = await clientCandidateDetailRoute(req, { params: Promise.resolve({ id: candidateA.id }) });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data.candidate.candidateReference, candidateA.candidateReference);
    assert.equal(json.data.candidate.fullName, undefined, "Candidate full name must NOT be exposed");
    assert.equal(json.data.candidate.email, undefined, "Candidate email must NOT be exposed");
    assert.equal(json.data.candidate.phone, undefined, "Candidate phone must NOT be exposed");
    assert.ok(json.data.aiScreeningAssessment, "AI screening assessment must be present");
    assert.ok(json.data.aiScreeningAssessment.disclaimer, "AI assistance disclaimer must be present");
  }

  // Check 6: Client cannot view or download original CV -> 403 Forbidden
  {
    const dummyDoc = await prisma.uploadedDocument.create({
      data: {
        agencyId: agency.id,
        candidateId: candidateA.id,
        fileName: "cv.pdf",
        fileType: "application/pdf",
        storageKey: `${suffix}-dummy.pdf`,
        fileHash: crypto.randomBytes(32).toString("hex"),
        processingStatus: DocumentProcessingStatus.EXTRACTED,
      },
    });

    const req = createAuthRequest(`/api/documents/${dummyDoc.id}/download`, clientASession.sessionToken);
    const res = await downloadDocumentRoute(req, { params: Promise.resolve({ id: dummyDoc.id }) });
    assert.equal(res.status, 403, "Client hiring manager must be forbidden from downloading CVs (403)");
  }

  // Check 7: Client cannot access agency evaluations endpoint -> 403 Forbidden
  {
    const req = createAuthRequest(`/api/requisitions/${reqA.id}/evaluations`, clientASession.sessionToken);
    const res = await getRequisitionEvaluationsRoute(req, { params: Promise.resolve({ id: reqA.id }) });
    assert.equal(res.status, 403, "Client hiring manager must be forbidden from recruiter workspace evaluations API (403)");
  }
});

test("Milestone 5: Client Decision Workflows & State Machine Transition Invariants", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  const agency = await prisma.organization.create({
    data: { name: `Agency Dec ${suffix}`, type: OrganizationType.AGENCY },
  });
  const clientA = await prisma.organization.create({
    data: { name: `Client Alpha ${suffix}`, type: OrganizationType.CLIENT, agencyId: agency.id },
  });
  const clientB = await prisma.organization.create({
    data: { name: `Client Beta ${suffix}`, type: OrganizationType.CLIENT, agencyId: agency.id },
  });

  const recruiter = await prisma.user.create({
    data: {
      name: `Recruiter ${suffix}`,
      email: `recruiter.${suffix}@agencydec.com`,
      role: UserRole.RECRUITER,
      organizationId: agency.id,
      isActive: true,
    },
  });
  const clientMgrA = await prisma.user.create({
    data: {
      name: `Client Mgr A ${suffix}`,
      email: `mgr.a.${suffix}@clientadec.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientA.id,
      isActive: true,
    },
  });
  const clientMgrB = await prisma.user.create({
    data: {
      name: `Client Mgr B ${suffix}`,
      email: `mgr.b.${suffix}@clientbdec.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientB.id,
      isActive: true,
    },
  });

  const clientASession = await createSession(clientMgrA.id);
  const clientBSession = await createSession(clientMgrB.id);

  const requisition = await prisma.requisition.create({
    data: {
      title: `Fullstack Engineer ${suffix}`,
      jobDescription: "React and Node.js microservices.",
      organizationId: agency.id,
      clientOrganizationId: clientA.id,
      createdById: recruiter.id,
      status: RequisitionStatus.ACTIVE,
    },
  });

  const candidate = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-DEC-${suffix.toUpperCase()}`,
      fullName: `Decision Candidate ${suffix}`,
      currentRole: "Fullstack Dev",
      experienceYears: 5,
      keySkills: ["React", "Node.js"],
      agencyId: agency.id,
    },
  });

  // Candidate submitted to Client A
  const application = await prisma.application.create({
    data: {
      candidateId: candidate.id,
      requisitionId: requisition.id,
      status: ApplicationStatus.SUBMITTED_TO_CLIENT,
      submittedAt: new Date(),
      submittedById: recruiter.id,
      clientOrganizationId: clientA.id,
    },
  });

  // Check 1: Cross-client decision attempt -> Client B attempting to act on Client A's application -> 404
  {
    const req = createAuthRequest(
      `/api/client/applications/${application.id}/decision`,
      clientBSession.sessionToken,
      { method: "POST", body: { decision: "SHORTLIST" } }
    );
    const res = await clientDecisionRoute(req, { params: Promise.resolve({ id: application.id }) });
    assert.equal(res.status, 404, "Cross-client decision must return 404 Not Found");
  }

  // Check 2: Rejection requires mandatory reason -> 400 Bad Request
  {
    const req = createAuthRequest(
      `/api/client/applications/${application.id}/decision`,
      clientASession.sessionToken,
      { method: "POST", body: { decision: "REJECT", rejectionReason: "   " } }
    );
    const res = await clientDecisionRoute(req, { params: Promise.resolve({ id: application.id }) });
    const json = await res.json();
    assert.equal(res.status, 400, "Rejection without reason must return 400");
    assert.equal(json.code, "REJECTION_REASON_REQUIRED");
  }

  // Check 3: Interview proposal rejects invalid or past date/time values -> 400 Bad Request
  {
    // A. Invalid date string
    const reqInvalid = createAuthRequest(
      `/api/client/applications/${application.id}/decision`,
      clientASession.sessionToken,
      { method: "POST", body: { decision: "PROPOSE_INTERVIEW", proposedSlot: "not-a-date" } }
    );
    const resInvalid = await clientDecisionRoute(reqInvalid, { params: Promise.resolve({ id: application.id }) });
    assert.equal(resInvalid.status, 400, "Invalid date format must return 400");

    // B. Past date/time
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const reqPast = createAuthRequest(
      `/api/client/applications/${application.id}/decision`,
      clientASession.sessionToken,
      { method: "POST", body: { decision: "PROPOSE_INTERVIEW", proposedSlot: yesterday } }
    );
    const resPast = await clientDecisionRoute(reqPast, { params: Promise.resolve({ id: application.id }) });
    const jsonPast = await resPast.json();
    assert.equal(resPast.status, 400, "Past date must return 400");
    assert.equal(jsonPast.code, "PAST_DATE_PROHIBITED");
  }

  // Check 4: Valid Shortlist Action -> 200 OK & Audited
  {
    const req = createAuthRequest(
      `/api/client/applications/${application.id}/decision`,
      clientASession.sessionToken,
      { method: "POST", body: { decision: "SHORTLIST" } }
    );
    const res = await clientDecisionRoute(req, { params: Promise.resolve({ id: application.id }) });
    const json = await res.json();
    assert.equal(res.status, 200, "Valid shortlist must return 200");
    assert.equal(json.data.newStatus, ApplicationStatus.CLIENT_SHORTLISTED);

    const updatedApp = await prisma.application.findUnique({ where: { id: application.id } });
    assert.equal(updatedApp?.status, ApplicationStatus.CLIENT_SHORTLISTED);
    assert.equal(updatedApp?.clientDecisionById, clientMgrA.id);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "CLIENT_CANDIDATE_SHORTLISTED", entityId: application.id },
    });
    assert.ok(audit, "CLIENT_CANDIDATE_SHORTLISTED audit event must exist");
    assert.equal(audit.actorId, clientMgrA.id);
    assert.equal(audit.organizationId, clientA.id);
  }

  // Check 5: Propose Interview Slot from Shortlisted State -> 200 OK & Audited
  {
    const futureSlot = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const req = createAuthRequest(
      `/api/client/applications/${application.id}/decision`,
      clientASession.sessionToken,
      {
        method: "POST",
        body: {
          decision: "PROPOSE_INTERVIEW",
          proposedSlot: futureSlot,
          note: "Please schedule 45m technical screen.",
        },
      }
    );
    const res = await clientDecisionRoute(req, { params: Promise.resolve({ id: application.id }) });
    const json = await res.json();
    assert.equal(res.status, 200, "Valid interview proposal must return 200");
    assert.equal(json.data.newStatus, ApplicationStatus.INTERVIEW_PROPOSED);

    const updatedApp = await prisma.application.findUnique({ where: { id: application.id } });
    assert.equal(updatedApp?.status, ApplicationStatus.INTERVIEW_PROPOSED);
    assert.ok(updatedApp?.proposedInterviewSlot);
    assert.equal(updatedApp?.proposedInterviewNote, "Please schedule 45m technical screen.");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "CLIENT_INTERVIEW_PROPOSED", entityId: application.id },
    });
    assert.ok(audit, "CLIENT_INTERVIEW_PROPOSED audit event must exist");
  }

  // Check 6: Reject Candidate with Reason -> 200 OK & Audited
  {
    const req = createAuthRequest(
      `/api/client/applications/${application.id}/decision`,
      clientASession.sessionToken,
      {
        method: "POST",
        body: {
          decision: "REJECT",
          rejectionReason: "Candidate lacks required high-throughput distributed messaging depth.",
        },
      }
    );
    const res = await clientDecisionRoute(req, { params: Promise.resolve({ id: application.id }) });
    const json = await res.json();
    assert.equal(res.status, 200, "Valid rejection must return 200");
    assert.equal(json.data.newStatus, ApplicationStatus.CLIENT_REJECTED);

    const updatedApp = await prisma.application.findUnique({ where: { id: application.id } });
    assert.equal(updatedApp?.status, ApplicationStatus.CLIENT_REJECTED);
    assert.equal(
      updatedApp?.clientRejectionReason,
      "Candidate lacks required high-throughput distributed messaging depth."
    );

    const audit = await prisma.auditLog.findFirst({
      where: { action: "CLIENT_CANDIDATE_REJECTED", entityId: application.id },
    });
    assert.ok(audit, "CLIENT_CANDIDATE_REJECTED audit event must exist");
  }

  // Check 7: State Transition Invariant: Cannot Shortlist an already rejected candidate -> 422
  {
    const req = createAuthRequest(
      `/api/client/applications/${application.id}/decision`,
      clientASession.sessionToken,
      { method: "POST", body: { decision: "SHORTLIST" } }
    );
    const res = await clientDecisionRoute(req, { params: Promise.resolve({ id: application.id }) });
    const json = await res.json();
    assert.equal(res.status, 422, "Shortlisting a rejected candidate must return 422");
    assert.equal(json.code, "INVALID_STATE_TRANSITION");
  }

  // Check 8: State Transition Invariant: Cannot Propose Interview on an already rejected candidate -> 422
  {
    const futureSlot = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const req = createAuthRequest(
      `/api/client/applications/${application.id}/decision`,
      clientASession.sessionToken,
      { method: "POST", body: { decision: "PROPOSE_INTERVIEW", proposedSlot: futureSlot } }
    );
    const res = await clientDecisionRoute(req, { params: Promise.resolve({ id: application.id }) });
    const json = await res.json();
    assert.equal(res.status, 422, "Proposing interview on a rejected candidate must return 422");
    assert.equal(json.code, "INVALID_STATE_TRANSITION");
  }
});

test("Milestone 5.1: Client Assignment, Submission Matching, Concurrency & Decision History Audit", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  // 1. Setup Agencies
  const agencyA = await prisma.organization.create({
    data: { name: `Agency Audit A ${suffix}`, type: OrganizationType.AGENCY },
  });
  const agencyB = await prisma.organization.create({
    data: { name: `Agency Audit B ${suffix}`, type: OrganizationType.AGENCY },
  });

  // Recruiter 1 and Recruiter 2 in Agency A
  const recruiter1 = await prisma.user.create({
    data: {
      name: `Recruiter One ${suffix}`,
      email: `recruiter.one.${suffix}@agencya.com`,
      role: UserRole.RECRUITER,
      organizationId: agencyA.id,
      isActive: true,
    },
  });
  const recruiter2 = await prisma.user.create({
    data: {
      name: `Recruiter Two ${suffix}`,
      email: `recruiter.two.${suffix}@agencya.com`,
      role: UserRole.RECRUITER,
      organizationId: agencyA.id,
      isActive: true,
    },
  });

  const recruiter1Session = await createSession(recruiter1.id);
  const recruiter2Session = await createSession(recruiter2.id);

  // 1. Client Organization Creation & Listing via API
  let clientAlphaId: string;
  {
    const req = createAuthRequest("/api/clients", recruiter1Session.sessionToken, {
      method: "POST",
      body: { name: `Client Alpha ${suffix}` },
    });
    const res = await createClientRoute(req);
    const json = await res.json();
    assert.equal(res.status, 201, "Agency recruiter must be able to create client organization");
    assert.equal(json.data.name, `Client Alpha ${suffix}`);
    assert.equal(json.data.agencyId, agencyA.id);
    clientAlphaId = json.data.id;

    // Verify AuditLog
    const audit = await prisma.auditLog.findFirst({
      where: { action: "CLIENT_ORGANIZATION_CREATED", entityId: clientAlphaId },
    });
    assert.ok(audit, "CLIENT_ORGANIZATION_CREATED audit log must exist");
  }

  // Create Client Beta for Agency A, and Client Gamma for Agency B
  const clientBeta = await prisma.organization.create({
    data: { name: `Client Beta ${suffix}`, type: OrganizationType.CLIENT, agencyId: agencyA.id },
  });
  const clientGammaForeign = await prisma.organization.create({
    data: { name: `Client Gamma ${suffix}`, type: OrganizationType.CLIENT, agencyId: agencyB.id },
  });

  // Client user for Client Alpha
  const clientAlphaUser = await prisma.user.create({
    data: {
      name: `Client Alpha Mgr ${suffix}`,
      email: `mgr.alpha.${suffix}@clientalpha.com`,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientAlphaId,
      isActive: true,
    },
  });
  const clientAlphaSession = await createSession(clientAlphaUser.id);

  // Client cannot create client organizations -> 403
  {
    const req = createAuthRequest("/api/clients", clientAlphaSession.sessionToken, {
      method: "POST",
      body: { name: `Illegal Client ${suffix}` },
    });
    const res = await createClientRoute(req);
    assert.equal(res.status, 403, "Client hiring manager must be forbidden from creating client organizations");
  }

  // 2. Assigning a client to a requisition within the same agency (Creation)
  let req1Id: string;
  {
    const req = createAuthRequest("/api/requisitions", recruiter1Session.sessionToken, {
      method: "POST",
      body: {
        title: `Backend Architect 1 ${suffix}`,
        jobDescription: "Senior distributed systems design in Go and PostgreSQL.",
        clientOrganizationId: clientAlphaId,
      },
    });
    const res = await createRequisitionRoute(req);
    const json = await res.json();
    assert.equal(res.status, 201, "Requisition creation with same-agency client must succeed");
    assert.equal(json.data.clientOrganizationId, clientAlphaId);
    assert.equal(json.data.clientOrganization.name, `Client Alpha ${suffix}`);
    req1Id = json.data.id;
  }

  // 3. Rejecting assignment to a client belonging to another agency
  {
    // At creation
    const req = createAuthRequest("/api/requisitions", recruiter1Session.sessionToken, {
      method: "POST",
      body: {
        title: `Frontend Lead ${suffix}`,
        jobDescription: "React, TypeScript and GraphQL platform architecture.",
        clientOrganizationId: clientGammaForeign.id,
      },
    });
    const res = await createRequisitionRoute(req);
    assert.equal(res.status, 403, "Assigning foreign agency client at creation must return 403");

    // At PATCH update
    const patchReq = createAuthRequest(`/api/requisitions/${req1Id}`, recruiter1Session.sessionToken, {
      method: "PATCH",
      body: { clientOrganizationId: clientGammaForeign.id },
    });
    const patchRes = await updateRequisitionRoute(patchReq, { params: Promise.resolve({ id: req1Id }) });
    assert.equal(patchRes.status, 403, "Updating to foreign agency client must return 403");
  }

  // 4. Client assignment changes being audited
  {
    const req = createAuthRequest(`/api/requisitions/${req1Id}`, recruiter1Session.sessionToken, {
      method: "PATCH",
      body: { clientOrganizationId: clientBeta.id },
    });
    const res = await updateRequisitionRoute(req, { params: Promise.resolve({ id: req1Id }) });
    const json = await res.json();
    assert.equal(res.status, 200, "Updating client assignment within same agency must succeed");
    assert.equal(json.data.clientOrganizationId, clientBeta.id);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "REQUISITION_CLIENT_ASSIGNED",
        entityId: req1Id,
      },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit, "REQUISITION_CLIENT_ASSIGNED audit event must be logged");
    assert.equal((audit.metadata as any).previousClientOrganizationId, clientAlphaId);
    assert.equal((audit.metadata as any).newClientOrganizationId, clientBeta.id);

    // Switch back to clientAlphaId for subsequent submission testing
    await prisma.requisition.update({
      where: { id: req1Id },
      data: { clientOrganizationId: clientAlphaId },
    });
  }

  // 5. Clients cannot change their own assignments -> 403
  {
    const req = createAuthRequest(`/api/requisitions/${req1Id}`, clientAlphaSession.sessionToken, {
      method: "PATCH",
      body: { clientOrganizationId: clientBeta.id },
    });
    const res = await updateRequisitionRoute(req, { params: Promise.resolve({ id: req1Id }) });
    assert.equal(res.status, 403, "Client hiring manager must be forbidden from updating requisition client assignment");
  }

  // Create Requisition 2 for Client Alpha
  const req2 = await prisma.requisition.create({
    data: {
      title: `Platform Staff Engineer ${suffix}`,
      jobDescription: "Kubernetes, Istio and Cloud infrastructure.",
      organizationId: agencyA.id,
      clientOrganizationId: clientAlphaId,
      createdById: recruiter1.id,
      status: RequisitionStatus.ACTIVE,
    },
  });

  // Candidate 1 and CV Document
  const candidate1 = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-ISO-${suffix.toUpperCase()}-01`,
      fullName: `Alice Developer ${suffix}`,
      currentRole: "Lead Systems Engineer",
      experienceYears: 8,
      keySkills: ["Go", "PostgreSQL", "Kubernetes"],
      agencyId: agencyA.id,
    },
  });

  const doc1Key = `${suffix}-doc1.pdf`;
  const storage = getStorageProvider();
  await storage.put(doc1Key, Buffer.from("%PDF-1.4 Mock CV Alice"));

  const doc1 = await prisma.uploadedDocument.create({
    data: {
      agencyId: agencyA.id,
      candidateId: candidate1.id,
      fileName: "Alice_CV.pdf",
      fileType: "application/pdf",
      storageKey: doc1Key,
      fileHash: crypto.randomBytes(32).toString("hex"),
      fileSizeBytes: 2048,
      processingStatus: DocumentProcessingStatus.EXTRACTED,
      extractedText: "Alice Developer - 8 years Go, PostgreSQL, Kubernetes.",
    },
  });

  // Recruiter 1 views Candidate 1's CV
  await prisma.auditLog.create({
    data: {
      action: "ORIGINAL_CV_VIEWED",
      actorId: recruiter1.id,
      organizationId: agencyA.id,
      entityType: "UploadedDocument",
      entityId: doc1.id,
    },
  });

  // Evaluation for Requisition 1
  const evalReq1 = await prisma.evaluation.create({
    data: {
      agencyId: agencyA.id,
      requisitionId: req1Id,
      candidateId: candidate1.id,
      documentId: doc1.id,
      status: "COMPLETED",
      overallScore: 92,
      evidenceCoverage: 100,
      isReviewedByRecruiter: true,
      reviewedById: recruiter1.id,
      provider: "mock",
      modelId: "mock-v1",
      promptVersion: "v1.0",
    },
  });

  // Evaluation for Requisition 2
  const evalReq2 = await prisma.evaluation.create({
    data: {
      agencyId: agencyA.id,
      requisitionId: req2.id,
      candidateId: candidate1.id,
      documentId: doc1.id,
      status: "COMPLETED",
      overallScore: 89,
      evidenceCoverage: 95,
      isReviewedByRecruiter: true,
      reviewedById: recruiter1.id,
      provider: "mock",
      modelId: "mock-v1",
      promptVersion: "v1.0",
    },
  });

  // 6. Same candidate submitted to two requisitions for one client
  let app1Id: string;
  let app2Id: string;
  {
    // Submit to Requisition 1
    const sub1Req = createAuthRequest(
      `/api/requisitions/${req1Id}/candidates/${candidate1.id}/submit`,
      recruiter1Session.sessionToken,
      { method: "POST", body: { evaluationId: evalReq1.id } }
    );
    const sub1Res = await submitCandidateRequisitionRoute(sub1Req, {
      params: Promise.resolve({ id: req1Id, candidateId: candidate1.id }),
    });
    const sub1Json = await sub1Res.json();
    assert.equal(sub1Res.status, 200, "Submission to Req 1 must succeed");
    assert.equal(sub1Json.data.isAlreadySubmitted, false);
    app1Id = sub1Json.data.applicationId;

    // Submit to Requisition 2
    const sub2Req = createAuthRequest(
      `/api/requisitions/${req2.id}/candidates/${candidate1.id}/submit`,
      recruiter1Session.sessionToken,
      { method: "POST", body: { evaluationId: evalReq2.id } }
    );
    const sub2Res = await submitCandidateRequisitionRoute(sub2Req, {
      params: Promise.resolve({ id: req2.id, candidateId: candidate1.id }),
    });
    const sub2Json = await sub2Res.json();
    assert.equal(sub2Res.status, 200, "Submission to Req 2 must succeed");
    assert.equal(sub2Json.data.isAlreadySubmitted, false);
    app2Id = sub2Json.data.applicationId;

    assert.notEqual(app1Id, app2Id, "Applications for two distinct requisitions must be separate records");
  }

  // 7. Duplicate submission to the same requisition being idempotent
  {
    const req = createAuthRequest(
      `/api/requisitions/${req1Id}/candidates/${candidate1.id}/submit`,
      recruiter1Session.sessionToken,
      { method: "POST", body: { evaluationId: evalReq1.id } }
    );
    const res = await submitCandidateRequisitionRoute(req, {
      params: Promise.resolve({ id: req1Id, candidateId: candidate1.id }),
    });
    const json = await res.json();
    assert.equal(res.status, 200, "Duplicate submission to same requisition must return 200");
    assert.equal(json.data.isAlreadySubmitted, true);
    assert.equal(json.data.applicationId, app1Id);
  }

  // 8. Evaluation for another requisition being rejected -> 400
  {
    // Calling submit on req1 with evaluation for req2
    const req = createAuthRequest(
      `/api/requisitions/${req1Id}/candidates/${candidate1.id}/submit`,
      recruiter1Session.sessionToken,
      { method: "POST", body: { evaluationId: evalReq2.id } }
    );
    const res = await submitCandidateRequisitionRoute(req, {
      params: Promise.resolve({ id: req1Id, candidateId: candidate1.id }),
    });
    const json = await res.json();
    assert.equal(res.status, 400, "Evaluation belonging to another requisition must be rejected with 400");
    assert.equal(json.code, "EVALUATION_REQUISITION_MISMATCH");
  }

  // 9. Evaluation for another candidate being rejected -> 400
  const candidate2 = await prisma.candidate.create({
    data: {
      candidateReference: `CAN-ISO-${suffix.toUpperCase()}-02`,
      fullName: `Bob Engineer ${suffix}`,
      currentRole: "Cloud Engineer",
      experienceYears: 4,
      keySkills: ["AWS", "Terraform"],
      agencyId: agencyA.id,
    },
  });

  {
    // Calling submit for candidate2 with evaluation for candidate1
    const req = createAuthRequest(
      `/api/requisitions/${req1Id}/candidates/${candidate2.id}/submit`,
      recruiter1Session.sessionToken,
      { method: "POST", body: { evaluationId: evalReq1.id } }
    );
    const res = await submitCandidateRequisitionRoute(req, {
      params: Promise.resolve({ id: req1Id, candidateId: candidate2.id }),
    });
    const json = await res.json();
    assert.equal(res.status, 400, "Evaluation belonging to another candidate must be rejected with 400");
    assert.equal(json.code, "EVALUATION_CANDIDATE_MISMATCH");
  }

  // 10. CV view by another recruiter does NOT satisfy submitter's inspection prerequisite -> 428
  const doc2Key = `${suffix}-doc2.pdf`;
  await storage.put(doc2Key, Buffer.from("%PDF-1.4 Mock CV Bob"));
  const doc2 = await prisma.uploadedDocument.create({
    data: {
      agencyId: agencyA.id,
      candidateId: candidate2.id,
      fileName: "Bob_CV.pdf",
      fileType: "application/pdf",
      storageKey: doc2Key,
      fileHash: crypto.randomBytes(32).toString("hex"),
      fileSizeBytes: 2048,
      processingStatus: DocumentProcessingStatus.EXTRACTED,
      extractedText: "Bob Engineer - 4 years AWS, Terraform.",
    },
  });

  // Recruiter 1 views Bob's CV, but Recruiter 2 did NOT view it
  await prisma.auditLog.create({
    data: {
      action: "ORIGINAL_CV_VIEWED",
      actorId: recruiter1.id,
      organizationId: agencyA.id,
      entityType: "UploadedDocument",
      entityId: doc2.id,
    },
  });

  const evalBob = await prisma.evaluation.create({
    data: {
      agencyId: agencyA.id,
      requisitionId: req1Id,
      candidateId: candidate2.id,
      documentId: doc2.id,
      status: "COMPLETED",
      overallScore: 80,
      evidenceCoverage: 90,
      isReviewedByRecruiter: true,
      reviewedById: recruiter2.id,
      provider: "mock",
      modelId: "mock-v1",
      promptVersion: "v1.0",
    },
  });

  {
    // Recruiter 2 attempts to submit Bob, but Recruiter 2 never viewed Bob's CV!
    const req = createAuthRequest(
      `/api/requisitions/${req1Id}/candidates/${candidate2.id}/submit`,
      recruiter2Session.sessionToken,
      { method: "POST", body: { evaluationId: evalBob.id } }
    );
    const res = await submitCandidateRequisitionRoute(req, {
      params: Promise.resolve({ id: req1Id, candidateId: candidate2.id }),
    });
    const json = await res.json();
    assert.equal(res.status, 428, "Submitter who has not viewed CV must receive 428 CV_NOT_VIEWED");
    assert.equal(json.code, "CV_NOT_VIEWED");
  }

  // 11. Prior client decision history remaining intact
  {
    const futureSlot = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    // Step A: Client proposes interview
    const proposeReq = createAuthRequest(
      `/api/client/applications/${app1Id}/decision`,
      clientAlphaSession.sessionToken,
      {
        method: "POST",
        body: {
          decision: "PROPOSE_INTERVIEW",
          proposedSlot: futureSlot,
          note: "Technical Systems Deep-Dive Round",
        },
      }
    );
    const proposeRes = await clientDecisionRoute(proposeReq, { params: Promise.resolve({ id: app1Id }) });
    assert.equal(proposeRes.status, 200, "Interview proposal must succeed");

    // Step B: Client later shortlists candidate
    const shortlistReq = createAuthRequest(
      `/api/client/applications/${app1Id}/decision`,
      clientAlphaSession.sessionToken,
      { method: "POST", body: { decision: "SHORTLIST" } }
    );
    const shortlistRes = await clientDecisionRoute(shortlistReq, { params: Promise.resolve({ id: app1Id }) });
    assert.equal(shortlistRes.status, 200, "Shortlist after proposal must succeed");

    // Verify DB: prior proposedInterviewSlot and proposedInterviewNote remain intact
    const appRecord = await prisma.application.findUnique({ where: { id: app1Id } });
    assert.equal(appRecord?.status, ApplicationStatus.CLIENT_SHORTLISTED);
    assert.ok(appRecord?.proposedInterviewSlot, "proposedInterviewSlot must remain intact");
    assert.equal(appRecord?.proposedInterviewNote, "Technical Systems Deep-Dive Round");

    // Verify audit logs exist for both
    const proposeAudit = await prisma.auditLog.findFirst({
      where: { action: "CLIENT_INTERVIEW_PROPOSED", entityId: app1Id },
    });
    const shortlistAudit = await prisma.auditLog.findFirst({
      where: { action: "CLIENT_CANDIDATE_SHORTLISTED", entityId: app1Id },
    });
    assert.ok(proposeAudit, "CLIENT_INTERVIEW_PROPOSED audit log must exist");
    assert.ok(shortlistAudit, "CLIENT_CANDIDATE_SHORTLISTED audit log must exist");
  }

  // 12. Concurrent decision requests preserving valid state & audit log fidelity
  {
    // Application 2 is currently SUBMITTED_TO_CLIENT
    const priorAuditCount = await prisma.auditLog.count({ where: { entityId: app2Id } });

    const rejectReq = createAuthRequest(
      `/api/client/applications/${app2Id}/decision`,
      clientAlphaSession.sessionToken,
      {
        method: "POST",
        body: {
          decision: "REJECT",
          rejectionReason: "Position scope changed; not filling at this time.",
        },
      }
    );
    const shortlistReq = createAuthRequest(
      `/api/client/applications/${app2Id}/decision`,
      clientAlphaSession.sessionToken,
      { method: "POST", body: { decision: "SHORTLIST" } }
    );

    // Fire competing requests concurrently
    const [resA, resB] = await Promise.all([
      clientDecisionRoute(rejectReq, { params: Promise.resolve({ id: app2Id }) }),
      clientDecisionRoute(shortlistReq, { params: Promise.resolve({ id: app2Id }) }),
    ]);

    // Check statuses
    const statuses = [resA.status, resB.status];
    assert.ok(statuses.includes(200), "At least one concurrent request must succeed");

    // Terminal rejection invariant: Final status MUST be CLIENT_REJECTED.
    // If REJECT serialized first -> REJECT is 200, SHORTLIST fails with 422.
    // If SHORTLIST serialized first -> SHORTLIST is 200, REJECT follows and sets 200 CLIENT_REJECTED.
    // In both interleavings, final status is CLIENT_REJECTED and shortlist cannot overwrite rejection.
    const app2Record = await prisma.application.findUnique({ where: { id: app2Id } });
    assert.equal(
      app2Record?.status,
      ApplicationStatus.CLIENT_REJECTED,
      "Final state must be CLIENT_REJECTED; shortlist cannot overwrite terminal rejection"
    );
    assert.equal(
      app2Record?.clientRejectionReason,
      "Position scope changed; not filling at this time."
    );

    // Verify audit log fidelity: exactly matches the number of successful transitions
    const auditLogsAfterRace = await prisma.auditLog.findMany({
      where: { entityId: app2Id },
      orderBy: { createdAt: "asc" },
    });
    const successfulCount = statuses.filter((s) => s === 200).length;
    assert.equal(
      auditLogsAfterRace.length,
      priorAuditCount + successfulCount,
      "Audit log entries must accurately represent only successful state transitions"
    );

    // Verify specifically client decision audit events
    const clientDecisionAudits = auditLogsAfterRace.filter((a) =>
      ["CLIENT_CANDIDATE_SHORTLISTED", "CLIENT_CANDIDATE_REJECTED", "CLIENT_INTERVIEW_PROPOSED"].includes(a.action)
    );
    assert.equal(
      clientDecisionAudits.length,
      successfulCount,
      "Client decision audit logs count must strictly equal successful decision requests"
    );

    // Competing decisions on an already-rejected candidate
    // Fire simultaneous SHORTLIST, PROPOSE_INTERVIEW, and duplicate REJECT requests
    const futureSlot = new Date(Date.now() + 96 * 3600 * 1000).toISOString();
    const [compShortlist, compPropose, compReject] = await Promise.all([
      clientDecisionRoute(
        createAuthRequest(`/api/client/applications/${app2Id}/decision`, clientAlphaSession.sessionToken, {
          method: "POST",
          body: { decision: "SHORTLIST" },
        }),
        { params: Promise.resolve({ id: app2Id }) }
      ),
      clientDecisionRoute(
        createAuthRequest(`/api/client/applications/${app2Id}/decision`, clientAlphaSession.sessionToken, {
          method: "POST",
          body: { decision: "PROPOSE_INTERVIEW", proposedSlot: futureSlot },
        }),
        { params: Promise.resolve({ id: app2Id }) }
      ),
      clientDecisionRoute(
        createAuthRequest(`/api/client/applications/${app2Id}/decision`, clientAlphaSession.sessionToken, {
          method: "POST",
          body: { decision: "REJECT", rejectionReason: "Duplicate reject attempt" },
        }),
        { params: Promise.resolve({ id: app2Id }) }
      ),
    ]);

    // All competing post-rejection operations must be rejected with 422 INVALID_STATE_TRANSITION
    assert.equal(compShortlist.status, 422, "Shortlist on rejected candidate must return 422");
    assert.equal(compPropose.status, 422, "Interview proposal on rejected candidate must return 422");
    assert.equal(compReject.status, 422, "Repeat rejection on rejected candidate must return 422");

    // Final verification of DB state and audit logs
    const finalApp2 = await prisma.application.findUnique({ where: { id: app2Id } });
    assert.equal(finalApp2?.status, ApplicationStatus.CLIENT_REJECTED);
    assert.equal(finalApp2?.clientRejectionReason, "Position scope changed; not filling at this time.");

    const finalAuditLogs = await prisma.auditLog.findMany({ where: { entityId: app2Id } });
    assert.equal(
      finalAuditLogs.length,
      priorAuditCount + successfulCount,
      "No audit logs should be created for rejected transitions on already-rejected candidates"
    );
  }
});
