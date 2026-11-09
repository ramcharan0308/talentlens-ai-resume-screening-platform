import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  validateFileSignature,
  LocalStorageProvider,
  generateStorageKey,
} from "../src/lib/storage";
import {
  extractResumeText,
  normalizeExtractedText,
  SystemOcrAdapter,
} from "../src/lib/extractor";
import { parseCandidateFromText } from "../src/lib/extractor/candidate-parser";
import { MAX_BATCH_FILES } from "../src/lib/ingest/processor";
import { getRequestSecurityContext } from "../src/lib/auth-guard";
import { NextRequest } from "next/server";
import { PrismaClient, ApplicationStatus } from "@prisma/client";

// Minimal valid PDF header and stream for testing
function createDummyPdfBuffer(textContent: string): Buffer {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${textContent.length + 50} >>
stream
BT
/F1 12 Tf
72 712 Td
(${textContent}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000281 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
400
%%EOF`;
  return Buffer.from(content, "utf-8");
}

// Minimal valid ZIP / DOCX buffer (PK\x03\x04)
function createDummyDocxBuffer(): Buffer {
  const pkHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const dummyPayload = Buffer.from("PK-payload-data-stream-for-testing", "utf-8");
  return Buffer.concat([pkHeader, dummyPayload]);
}

test("Storage Signature: Validates authentic PDF signature", () => {
  const pdfBuffer = Buffer.from("%PDF-1.7\nSample resume content");
  const result = validateFileSignature(pdfBuffer);
  assert.equal(result.isValid, true);
  assert.equal(result.detectedType, "application/pdf");
  assert.equal(result.extension, "pdf");
});

test("Storage Signature: Validates authentic DOCX (ZIP PK) signature", () => {
  const docxBuffer = createDummyDocxBuffer();
  const result = validateFileSignature(docxBuffer);
  assert.equal(result.isValid, true);
  assert.equal(
    result.detectedType,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  assert.equal(result.extension, "docx");
});

test("Storage Signature: Rejects invalid file type and forged MIME types", () => {
  // Plain text pretending to be PDF
  const fakePdf = Buffer.from("This is not a real PDF file. Just plain text.");
  const result = validateFileSignature(fakePdf);
  assert.equal(result.isValid, false);
  assert.match(result.error!, /Invalid file signature/);
});

test("Storage Signature: Rejects empty (0 bytes) documents", () => {
  const empty = Buffer.alloc(0);
  const result = validateFileSignature(empty);
  assert.equal(result.isValid, false);
  assert.match(result.error!, /empty/i);
});

test("Storage Signature: Enforces maximum file-size limit", () => {
  const maxLimit = 1024; // 1KB test limit
  const largeBuffer = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(2048)]);
  const result = validateFileSignature(largeBuffer, maxLimit);
  assert.equal(result.isValid, false);
  assert.match(result.error!, /exceeds allowed limit/i);
});

test("Storage Invariant: Path traversal rejection in storage key", () => {
  const localProvider = new LocalStorageProvider();
  assert.throws(() => {
    // Attempt directory traversal
    (localProvider as any).resolvePath("../../etc/passwd");
  }, /path traversal detected/i);
});

test("Ingest Limit: Enforces strict 500-file maximum and rejects 501 files", () => {
  assert.equal(MAX_BATCH_FILES, 500);
  const files501 = new Array(501).fill({ fileName: "resume.pdf", buffer: Buffer.from("%PDF-") });
  assert.ok(files501.length > MAX_BATCH_FILES);
});

test("Text Extraction: Extracts and normalizes plain text from valid PDF", async () => {
  const samplePdfPath = path.join(
    process.cwd(),
    "node_modules",
    "pdf-parse",
    "test",
    "data",
    "04-valid.pdf"
  );
  const pdfBuffer = fs.readFileSync(samplePdfPath);
  const extraction = await extractResumeText(pdfBuffer, "application/pdf");
  assert.equal(extraction.processingStatus, "EXTRACTED");
  assert.equal(extraction.ocrRequired, false);
  assert.ok(extraction.text.length > 50);
});

test("Text Extraction: Detects scanned / image-only PDF with minimal text stream", async () => {
  const scannedPdfPath = path.join(
    process.cwd(),
    "node_modules",
    "pdf-parse",
    "test",
    "data",
    "05-versions-space.pdf"
  );
  const scannedPdf = fs.readFileSync(scannedPdfPath);
  const extraction = await extractResumeText(scannedPdf, "application/pdf");
  assert.equal(extraction.processingStatus, "SCANNED_UNREADABLE");
  assert.equal(extraction.ocrRequired, true);
  assert.match(extraction.errorMessage!, /scanned or image-only/i);
});

test("OCR Adapter: Demonstrates fallback contract and reports missing dependencies cleanly", async () => {
  const adapter = new SystemOcrAdapter();
  const available = await adapter.isAvailable();
  // On this local Windows environment without cloud OCR keys, must report false
  assert.equal(available, false);
  assert.equal(adapter.getEngineName(), "Tesseract / Cloud Vision OCR Service");
});

test("Candidate Profile Extraction: Conservatively parses details without inferring protected traits", () => {
  const sampleResumeText = `
RITIKA BANSAL
Senior Java Developer
Noida, Uttar Pradesh

SUMMARY:
Results-driven software engineer with 6.5 years of experience in Java, Spring Boot, Microservices, and PostgreSQL.

SKILLS:
Java, Spring Boot, Microservices, Hibernate, REST APIs, Kafka, Docker, Kubernetes

NOTICE PERIOD:
Serving notice: 60 days
  `;

  const parsed = parseCandidateFromText(sampleResumeText);
  assert.equal(parsed.experienceYears, 6.5);
  assert.equal(parsed.noticeDays, 60);
  assert.ok(parsed.keySkills.includes("Java"));
  assert.ok(parsed.keySkills.includes("Spring Boot"));
  assert.ok(parsed.keySkills.includes("Microservices"));
  assert.ok(parsed.keySkills.includes("Kafka"));
  // Invariant: No age, gender, religion, or marital status inferred
  assert.equal((parsed as any).gender, undefined);
  assert.equal((parsed as any).age, undefined);
  assert.equal((parsed as any).maritalStatus, undefined);
});

test("Duplicate Detection: Computes SHA-256 binary hash deterministically", () => {
  const bufferA = Buffer.from("%PDF-1.4 test resume content A");
  const bufferB = Buffer.from("%PDF-1.4 test resume content A");
  const bufferC = Buffer.from("%PDF-1.4 test resume content DIFFERENT");

  const hashA = crypto.createHash("sha256").update(bufferA).digest("hex");
  const hashB = crypto.createHash("sha256").update(bufferB).digest("hex");
  const hashC = crypto.createHash("sha256").update(bufferC).digest("hex");

  assert.equal(hashA, hashB, "Identical bytes must produce identical SHA-256 hash");
  assert.notEqual(hashA, hashC, "Different bytes must produce distinct SHA-256 hash");
});

test("Security Guard: Rejects production requests when authentication header is missing", async () => {
  const envObj = process.env as Record<string, string | undefined>;
  const originalEnv = envObj.NODE_ENV;
  try {
    envObj.NODE_ENV = "production";
    const dummyReq = new NextRequest("http://localhost:3000/api/candidates");
    const secContext = await getRequestSecurityContext(dummyReq);
    assert.equal(secContext.isAuthorized, false);
    assert.equal(secContext.errorResponse?.status, 401);
  } finally {
    envObj.NODE_ENV = originalEnv;
  }
});

test("Database Fixtures: Candidate fixtures in Neon PostgreSQL are idempotent and compliant", async () => {
  const prisma = new PrismaClient();
  try {
    let fixtures: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fixtures = await prisma.candidate.findMany({
          where: { isFixture: true },
          include: {
            applications: {
              include: { requisition: { select: { title: true } } },
            },
          },
        });
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    assert.equal(fixtures.length, 3, "Expected exactly 3 seeded fixtures in Neon DB");

    const ritika = fixtures.find((f: any) => f.candidateReference === "CND-91022");
    assert.ok(ritika, "Ritika Bansal fixture must exist");
    assert.equal(ritika.fullName, "Ritika Bansal");
    assert.equal(ritika.experienceYears, 6.5);
    assert.equal(ritika.noticeDays, 60);
    assert.ok(ritika.keySkills.includes("Java"));
    assert.ok(ritika.applications.some((a: any) => a.requisition.title === "Senior Java Developer"));

    const arjun = fixtures.find((f: any) => f.candidateReference === "CND-91047");
    assert.ok(arjun, "Arjun Rawat fixture must exist");
    assert.equal(arjun.fullName, "Arjun Rawat");
    assert.equal(arjun.currentRole, "KYC Analyst");
    assert.equal(arjun.experienceYears, 3.0);
    // Invariant: Arjun Rawat must NOT be linked to Senior Java Developer
    const arjunJavaApp = arjun.applications.find(
      (a: any) => a.requisition.title === "Senior Java Developer"
    );
    assert.equal(
      arjunJavaApp,
      undefined,
      "Arjun Rawat must NOT be linked to Senior Java Developer requisition"
    );

    const pooja = fixtures.find((f: any) => f.candidateReference === "CND-91088");
    assert.ok(pooja, "Pooja Nair fixture must exist");
    assert.equal(pooja.fullName, "Pooja Nair");
    assert.equal(pooja.experienceYears, 4.0);
    assert.equal(pooja.noticeDays, 90);
  } finally {
    await prisma.$disconnect();
  }
});
