-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('RECRUITER', 'CLIENT_HIRING_MGR', 'DELIVERY_HEAD');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('AGENCY', 'CLIENT');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'FILLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CandidatePurgeStatus" AS ENUM ('ACTIVE', 'PURGE_REQUESTED', 'PURGED');

-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('PENDING', 'PARSING', 'EXTRACTED', 'SCANNED_UNREADABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchItemStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'DUPLICATE_SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SOURCED', 'SCREENED', 'SUBMITTED_TO_CLIENT', 'CLIENT_SHORTLISTED', 'CLIENT_REJECTED', 'INTERVIEW_PROPOSED', 'JOINED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ConsentEvidenceType" AS ENUM ('PORTAL_AUTH_SESSION', 'SIGNED_DOCUMENT', 'EMAIL_CONFIRMATION');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requisition" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jobDescription" TEXT NOT NULL,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "candidateReference" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "purgeStatus" "CandidatePurgeStatus" NOT NULL DEFAULT 'ACTIVE',
    "purgeRequestedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedDocument" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "candidateId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "processingStatus" "DocumentProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "parsingWorkerId" TEXT,
    "parsingLeaseToken" TEXT,
    "parsingLockedAt" TIMESTAMP(3),
    "parsingRetryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchUploadJob" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "status" "BatchJobStatus" NOT NULL DEFAULT 'QUEUED',
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "processedFiles" INTEGER NOT NULL DEFAULT 0,
    "successfulFiles" INTEGER NOT NULL DEFAULT 0,
    "failedFiles" INTEGER NOT NULL DEFAULT 0,
    "duplicateFiles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchUploadJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchFileItem" (
    "id" TEXT NOT NULL,
    "batchJobId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "payloadHash" TEXT,
    "fileHash" TEXT,
    "status" "BatchItemStatus" NOT NULL DEFAULT 'QUEUED',
    "documentId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchFileItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SOURCED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "evidenceType" "ConsentEvidenceType" NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "organizationId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_type_idx" ON "Organization"("type");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Requisition_organizationId_status_idx" ON "Requisition"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Requisition_createdById_idx" ON "Requisition"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_candidateReference_key" ON "Candidate"("candidateReference");

-- CreateIndex
CREATE INDEX "Candidate_agencyId_idx" ON "Candidate"("agencyId");

-- CreateIndex
CREATE INDEX "Candidate_candidateReference_idx" ON "Candidate"("candidateReference");

-- CreateIndex
CREATE INDEX "Candidate_purgeStatus_idx" ON "Candidate"("purgeStatus");

-- CreateIndex
CREATE INDEX "UploadedDocument_agencyId_idx" ON "UploadedDocument"("agencyId");

-- CreateIndex
CREATE INDEX "UploadedDocument_candidateId_idx" ON "UploadedDocument"("candidateId");

-- CreateIndex
CREATE INDEX "UploadedDocument_fileHash_idx" ON "UploadedDocument"("fileHash");

-- CreateIndex
CREATE INDEX "UploadedDocument_processingStatus_idx" ON "UploadedDocument"("processingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedDocument_agencyId_fileHash_key" ON "UploadedDocument"("agencyId", "fileHash");

-- CreateIndex
CREATE INDEX "BatchUploadJob_agencyId_idx" ON "BatchUploadJob"("agencyId");

-- CreateIndex
CREATE INDEX "BatchUploadJob_requisitionId_idx" ON "BatchUploadJob"("requisitionId");

-- CreateIndex
CREATE INDEX "BatchUploadJob_status_idx" ON "BatchUploadJob"("status");

-- CreateIndex
CREATE INDEX "BatchFileItem_batchJobId_status_idx" ON "BatchFileItem"("batchJobId", "status");

-- CreateIndex
CREATE INDEX "BatchFileItem_batchJobId_fileHash_idx" ON "BatchFileItem"("batchJobId", "fileHash");

-- CreateIndex
CREATE INDEX "BatchFileItem_documentId_idx" ON "BatchFileItem"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchFileItem_batchJobId_idempotencyKey_key" ON "BatchFileItem"("batchJobId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Application_requisitionId_status_idx" ON "Application"("requisitionId", "status");

-- CreateIndex
CREATE INDEX "Application_candidateId_idx" ON "Application"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_candidateId_requisitionId_key" ON "Application"("candidateId", "requisitionId");

-- CreateIndex
CREATE INDEX "ConsentRecord_candidateId_agencyId_status_idx" ON "ConsentRecord"("candidateId", "agencyId", "status");

-- CreateIndex
CREATE INDEX "ConsentRecord_verifiedById_idx" ON "ConsentRecord"("verifiedById");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchUploadJob" ADD CONSTRAINT "BatchUploadJob_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchUploadJob" ADD CONSTRAINT "BatchUploadJob_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchFileItem" ADD CONSTRAINT "BatchFileItem_batchJobId_fkey" FOREIGN KEY ("batchJobId") REFERENCES "BatchUploadJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchFileItem" ADD CONSTRAINT "BatchFileItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
