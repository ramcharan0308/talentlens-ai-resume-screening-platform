import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { PrismaClient, OrganizationType, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import {
  LocalStorageProvider,
  R2StorageProvider,
  getStorageProvider,
  setStorageProvider,
  MAX_FILE_SIZE_BYTES,
  validateFileSignature,
} from "../src/lib/storage";
import { SESSION_COOKIE_NAME } from "../src/lib/auth";
import { POST as presignRoute } from "../src/app/api/resumes/presign/route";
import { PUT as localUploadRoute } from "../src/app/api/storage/local-upload/route";
import { POST as uploadIngestRoute } from "../src/app/api/resumes/upload/route";
import { GET as downloadRoute } from "../src/app/api/documents/[id]/download/route";
import { POST as screenRoute, MAX_SCREENING_CHUNK_SIZE } from "../src/app/api/requisitions/[id]/screen/route";
import { executeDeletionRequest, createDeletionRequest, approveDeletionRequest } from "../src/lib/deletion/deletion-service";

const prisma = new PrismaClient();

function createAuthRequest(
  url: string,
  sessionToken?: string,
  options: { method?: string; body?: any; headers?: Record<string, string>; rawBody?: any } = {}
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

  const reqInit: RequestInit = {
    method: options.method || "GET",
    headers,
  };

  if (options.rawBody) {
    reqInit.body = options.rawBody;
  } else if (options.body) {
    headers.set("content-type", "application/json");
    reqInit.body =
      typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), reqInit as any);
}

// Minimal valid PDF stream generator
function createValidPdfBuffer(name: string): Buffer {
  const text = `Candidate ${name} - Senior Full Stack Engineer. Experience with React, Node.js, PostgreSQL.`;
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length ${text.length + 40} >> stream
BT /F1 12 Tf 72 712 Td (${text}) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000210 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
350
%%EOF`;
  return Buffer.from(content, "utf-8");
}

test("R2 Storage: StorageProvider contract and S3 presigned URL generation", async () => {
  const r2 = new R2StorageProvider({
    accountId: "test-account-id-123",
    accessKeyId: "test-access-key-id",
    secretAccessKey: "test-secret-access-key",
    bucketName: "test-bucket",
    endpoint: "https://test-account-id-123.r2.cloudflarestorage.com",
    region: "auto",
  });

  // Verify presigned upload URL generation
  const uploadInfo = await r2.getPresignedUploadUrl("candidate-uuid-1.pdf", "application/pdf", 600);
  assert.equal(uploadInfo.storageKey, "candidate-uuid-1.pdf");
  assert.equal(uploadInfo.headers["Content-Type"], "application/pdf");
  assert.match(uploadInfo.uploadUrl, /^https:\/\/test-account-id-123\.r2\.cloudflarestorage\.com/);
  assert.match(uploadInfo.uploadUrl, /X-Amz-Signature=/);

  // Verify presigned download URL generation with Content-Disposition
  const downloadUrl = await r2.getPresignedDownloadUrl("candidate-uuid-1.pdf", 300, "John-Doe-Resume.pdf");
  assert.match(downloadUrl, /^https:\/\/test-account-id-123\.r2\.cloudflarestorage\.com/);
  assert.match(downloadUrl, /response-content-disposition=/);
  assert.match(downloadUrl, /X-Amz-Signature=/);
});

test("Direct Presigned Upload: POST /api/resumes/presign authorization, validation, and tenant isolation", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  // Create Agency A and Recruiter A
  const agencyA = await prisma.organization.create({
    data: { name: `Presign Agency A ${suffix}`, type: OrganizationType.AGENCY },
  });
  const recruiterA = await prisma.user.create({
    data: {
      email: `recruiter.a.${suffix}@example.com`,
      name: "Recruiter A",
      role: UserRole.RECRUITER,
      organizationId: agencyA.id,
      passwordHash: "hash",
    },
  });
  const sessionA = await prisma.session.create({
    data: {
      userId: recruiterA.id,
      sessionToken: `token-presign-a-${suffix}`,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  // Create Requisition for Agency A
  const reqA = await prisma.requisition.create({
    data: {
      title: "Senior Backend Developer",
      department: "Engineering",
      jobDescription: "Must have deep Node.js and TypeScript background.",
      organizationId: agencyA.id,
      createdById: recruiterA.id,
      status: "ACTIVE",
    },
  });

  // Create Agency B and Recruiter B (for cross-tenant checks)
  const agencyB = await prisma.organization.create({
    data: { name: `Presign Agency B ${suffix}`, type: OrganizationType.AGENCY },
  });
  const recruiterB = await prisma.user.create({
    data: {
      email: `recruiter.b.${suffix}@example.com`,
      name: "Recruiter B",
      role: UserRole.RECRUITER,
      organizationId: agencyB.id,
      passwordHash: "hash",
    },
  });
  const sessionB = await prisma.session.create({
    data: {
      userId: recruiterB.id,
      sessionToken: `token-presign-b-${suffix}`,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  // 1. Unauthenticated request -> HTTP 401
  const unauthReq = createAuthRequest("http://localhost:3000/api/resumes/presign", undefined, {
    method: "POST",
    body: { requisitionId: reqA.id, files: [{ fileName: "resume.pdf", fileSizeBytes: 1000 }] },
  });
  const unauthRes = await presignRoute(unauthReq);
  assert.equal(unauthRes.status, 401);

  // 2. Cross-tenant access: Recruiter B tries to generate presigned upload for Requisition A -> HTTP 404
  const crossTenantReq = createAuthRequest(
    "http://localhost:3000/api/resumes/presign",
    sessionB.sessionToken,
    {
      method: "POST",
      body: { requisitionId: reqA.id, files: [{ fileName: "resume.pdf", fileSizeBytes: 1000 }] },
    }
  );
  const crossTenantRes = await presignRoute(crossTenantReq);
  assert.equal(crossTenantRes.status, 404);

  // 3. File size exceeds 10 MB limit -> HTTP 400
  const oversizedReq = createAuthRequest(
    "http://localhost:3000/api/resumes/presign",
    sessionA.sessionToken,
    {
      method: "POST",
      body: {
        requisitionId: reqA.id,
        files: [{ fileName: "huge-resume.pdf", fileSizeBytes: 12 * 1024 * 1024 }],
      },
    }
  );
  const oversizedRes = await presignRoute(oversizedReq);
  assert.equal(oversizedRes.status, 400);
  const oversizedData = await oversizedRes.json();
  assert.match(oversizedData.error, /exceeds the maximum allowed size of 10 MB/);

  // 4. Unsupported file extension (.exe) -> HTTP 400
  const invalidExtReq = createAuthRequest(
    "http://localhost:3000/api/resumes/presign",
    sessionA.sessionToken,
    {
      method: "POST",
      body: {
        requisitionId: reqA.id,
        files: [{ fileName: "malicious.exe", fileSizeBytes: 5000 }],
      },
    }
  );
  const invalidExtRes = await presignRoute(invalidExtReq);
  assert.equal(invalidExtRes.status, 400);
  assert.match((await invalidExtRes.json()).error, /Only PDF and DOCX files are permitted/);

  // 5. Valid presigned upload request for PDF and DOCX -> HTTP 200 with presigned upload URLs
  const validReq = createAuthRequest(
    "http://localhost:3000/api/resumes/presign",
    sessionA.sessionToken,
    {
      method: "POST",
      body: {
        requisitionId: reqA.id,
        files: [
          { fileName: "john_doe.pdf", fileSizeBytes: 150000 },
          { fileName: "jane_smith.docx", fileSizeBytes: 250000 },
        ],
      },
    }
  );
  const validRes = await presignRoute(validReq);
  assert.equal(validRes.status, 200);
  const validData = await validRes.json();
  assert.equal(validData.success, true);
  assert.equal(validData.totalFiles, 2);
  assert.equal(validData.uploads.length, 2);
  assert.ok(validData.uploads[0].uploadUrl);
  assert.match(validData.uploads[0].storageKey, /\.pdf$/);
  assert.match(validData.uploads[1].storageKey, /\.docx$/);
  assert.ok(validData.uploads[0].storageKey.startsWith(`${agencyA.id}/`));
  assert.ok(validData.uploads[1].storageKey.startsWith(`${agencyA.id}/`));
});

test("Direct Upload & Confirmation: Direct upload endpoint and JSON batch ingestion confirmation", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  const agency = await prisma.organization.create({
    data: { name: `Direct Agency ${suffix}`, type: OrganizationType.AGENCY },
  });
  const recruiter = await prisma.user.create({
    data: {
      email: `recruiter.direct.${suffix}@example.com`,
      name: "Direct Recruiter",
      role: UserRole.RECRUITER,
      organizationId: agency.id,
      passwordHash: "hash",
    },
  });
  const session = await prisma.session.create({
    data: {
      userId: recruiter.id,
      sessionToken: `token-direct-${suffix}`,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const req = await prisma.requisition.create({
    data: {
      title: "Staff DevOps Engineer",
      department: "Cloud Infra",
      jobDescription: "Staff DevOps role responsible for Kubernetes and AWS infrastructure.",
      organizationId: agency.id,
      createdById: recruiter.id,
      status: "ACTIVE",
    },
  });

  const pdfBuffer = createValidPdfBuffer(`DirectCandidate-${suffix}`);
  const storageKey = `direct-test-${suffix}.pdf`;

  // 1. Direct upload via PUT /api/storage/local-upload
  const uploadReq = createAuthRequest(
    `http://localhost:3000/api/storage/local-upload?key=${storageKey}`,
    session.sessionToken,
    {
      method: "PUT",
      rawBody: pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength),
      headers: { "content-type": "application/pdf" },
    }
  );
  const uploadRes = await localUploadRoute(uploadReq);
  assert.equal(uploadRes.status, 200);
  const uploadData = await uploadRes.json();
  assert.equal(uploadData.success, true);
  assert.equal(uploadData.storageKey, storageKey);

  // 2. Confirm ingestion via POST /api/resumes/upload with JSON payload (zero multipart file body over Vercel)
  const confirmReq = createAuthRequest(
    "http://localhost:3000/api/resumes/upload",
    session.sessionToken,
    {
      method: "POST",
      body: {
        requisitionId: req.id,
        items: [
          {
            fileName: "DirectCandidate.pdf",
            storageKey: storageKey,
            fileSizeBytes: pdfBuffer.length,
          },
        ],
      },
    }
  );
  const confirmRes = await uploadIngestRoute(confirmReq);
  assert.equal(confirmRes.status, 200);
  const confirmData = await confirmRes.json();
  assert.equal(confirmData.success, true);
  assert.equal(confirmData.summary.total, 1);
  assert.equal(confirmData.summary.successful, 1);
  assert.equal(confirmData.summary.duplicates, 0);

  const createdDocId = confirmData.summary.results[0].documentId;
  assert.ok(createdDocId);

  // 3. Test private download authorization on created document
  const downloadReq = createAuthRequest(
    `http://localhost:3000/api/documents/${createdDocId}/download`,
    session.sessionToken
  );
  const downloadRes = await downloadRoute(downloadReq, {
    params: Promise.resolve({ id: createdDocId }),
  });
  assert.equal(downloadRes.status, 200);

  // 4. Test Storage Key Reuse Defense: Re-ingesting an already ingested key is rejected (HTTP 409)
  const reusedKeyReq = createAuthRequest(
    "http://localhost:3000/api/resumes/upload",
    session.sessionToken,
    {
      method: "POST",
      body: {
        requisitionId: req.id,
        items: [
          {
            fileName: "DirectCandidateReused.pdf",
            storageKey: storageKey,
            fileSizeBytes: pdfBuffer.length,
          },
        ],
      },
    }
  );
  const reusedKeyRes = await uploadIngestRoute(reusedKeyReq);
  assert.equal(reusedKeyRes.status, 409);
  assert.match((await reusedKeyRes.json()).error, /already been ingested/);

  // 5. Test Cross-Tenant Storage Key Defense: Providing another tenant's key prefix is rejected (HTTP 403)
  const foreignKeyReq = createAuthRequest(
    "http://localhost:3000/api/resumes/upload",
    session.sessionToken,
    {
      method: "POST",
      body: {
        requisitionId: req.id,
        items: [
          {
            fileName: "StolenDoc.pdf",
            storageKey: "foreign-agency-id-999/stolen.pdf",
            fileSizeBytes: 5000,
          },
        ],
      },
    }
  );
  const foreignKeyRes = await uploadIngestRoute(foreignKeyReq);
  assert.equal(foreignKeyRes.status, 403);
  assert.match((await foreignKeyRes.json()).error, /belongs to a different agency tenant/);
});

test("Chunked Screening Engine: Enforces chunk limits and protects against serverless timeouts", async () => {
  const suffix = crypto.randomBytes(4).toString("hex");

  const agency = await prisma.organization.create({
    data: { name: `Chunk Agency ${suffix}`, type: OrganizationType.AGENCY },
  });
  const recruiter = await prisma.user.create({
    data: {
      email: `recruiter.chunk.${suffix}@example.com`,
      name: "Chunk Recruiter",
      role: UserRole.RECRUITER,
      organizationId: agency.id,
      passwordHash: "hash",
    },
  });
  const session = await prisma.session.create({
    data: {
      userId: recruiter.id,
      sessionToken: `token-chunk-${suffix}`,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  const req = await prisma.requisition.create({
    data: {
      title: "Chunk Screening Requisition",
      department: "Data Science",
      jobDescription: "Requires 5+ years of Python and Machine Learning experience.",
      organizationId: agency.id,
      createdById: recruiter.id,
      status: "ACTIVE",
      scorecardCriteria: {
        create: [
          {
            name: "Python & Machine Learning",
            weight: 100,
          },
        ],
      },
    },
  });

  // 1. Attempting to screen more than MAX_SCREENING_CHUNK_SIZE (15) candidates in a single request is rejected with 400
  const candidateIds = Array.from({ length: 16 }, (_, i) => `mock-cand-${i}`);
  const oversizedScreenReq = createAuthRequest(
    `http://localhost:3000/api/requisitions/${req.id}/screen`,
    session.sessionToken,
    {
      method: "POST",
      body: { candidateIds },
    }
  );
  const oversizedScreenRes = await screenRoute(oversizedScreenReq, {
    params: Promise.resolve({ id: req.id }),
  });
  assert.equal(oversizedScreenRes.status, 400);
  const oversizedData = await oversizedScreenRes.json();
  assert.match(oversizedData.error, /exceeds maximum limit of 15 candidates per request/);
  assert.equal(oversizedData.maxChunkSize, 15);

  // 2. Safe chunk size (e.g. 5 candidates) is permitted
  // Test with candidate linked to requisition
  const candidate = await prisma.candidate.create({
    data: {
      agencyId: agency.id,
      candidateReference: `CND-CHUNK-${suffix}`,
      fullName: `Chunk Candidate ${suffix}`,
      uploadedDocuments: {
        create: {
          agencyId: agency.id,
          fileName: "cand.pdf",
          fileType: "application/pdf",
          fileSizeBytes: 1000,
          fileHash: `hash-cand-${suffix}`,
          storageKey: `key-cand-${suffix}.pdf`,
          extractedText: "Python ML Engineer with PyTorch, Scikit-learn, and 5 years experience.",
          processingStatus: "EXTRACTED",
        },
      },
      applications: {
        create: {
          requisitionId: req.id,
          status: "SOURCED",
        },
      },
    },
  });

  const validChunkReq = createAuthRequest(
    `http://localhost:3000/api/requisitions/${req.id}/screen`,
    session.sessionToken,
    {
      method: "POST",
      body: {
        candidateIds: [candidate.id],
        chunkIndex: 0,
        totalChunks: 1,
      },
    }
  );
  const validChunkRes = await screenRoute(validChunkReq, {
    params: Promise.resolve({ id: req.id }),
  });
  assert.equal(validChunkRes.status, 200);
  const validChunkData = await validChunkRes.json();
  assert.equal(validChunkData.success, true);
  assert.equal(validChunkData.chunkIndex, 0);
  assert.equal(validChunkData.totalChunks, 1);
  assert.equal(validChunkData.evaluatedCount, 1);

  // 3. Repeated Screening Request Idempotency: Retrying the request does not duplicate database evaluations
  const retryChunkRes = await screenRoute(validChunkReq, {
    params: Promise.resolve({ id: req.id }),
  });
  assert.equal(retryChunkRes.status, 200);
  const retryData = await retryChunkRes.json();
  assert.equal(retryData.success, true);
  assert.equal(retryData.evaluatedCount, 1);

  // Assert strictly one evaluation record exists in the database
  const totalEvals = await prisma.evaluation.count({
    where: {
      candidateId: candidate.id,
      requisitionId: req.id,
    },
  });
  assert.equal(totalEvals, 1);
});

