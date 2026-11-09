-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DeletionRequestStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable Candidate
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "retentionExpiresAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Candidate_agencyId_retentionExpiresAt_idx" ON "Candidate"("agencyId", "retentionExpiresAt");

-- AlterTable ConsentRecord
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "candidateReference" TEXT;
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "noticeVersion" TEXT NOT NULL DEFAULT 'v1.0';
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'DIRECT_APPLICATION';
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "legalBasis" TEXT DEFAULT 'CONSENT';
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "recordedById" TEXT;
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "withdrawalReason" TEXT;
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "withdrawnById" TEXT;
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ConsentRecord_candidateReference_idx" ON "ConsentRecord"("candidateReference");
CREATE INDEX IF NOT EXISTS "ConsentRecord_recordedById_idx" ON "ConsentRecord"("recordedById");
CREATE INDEX IF NOT EXISTS "ConsentRecord_withdrawnById_idx" ON "ConsentRecord"("withdrawnById");

DO $$ BEGIN
    ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable ConsentHistory
CREATE TABLE IF NOT EXISTS "ConsentHistory" (
    "id" TEXT NOT NULL,
    "consentRecordId" TEXT NOT NULL,
    "candidateId" TEXT,
    "candidateReference" TEXT,
    "agencyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "purpose" TEXT NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "legalBasis" TEXT,
    "actorId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConsentHistory_consentRecordId_idx" ON "ConsentHistory"("consentRecordId");
CREATE INDEX IF NOT EXISTS "ConsentHistory_candidateId_idx" ON "ConsentHistory"("candidateId");
CREATE INDEX IF NOT EXISTS "ConsentHistory_agencyId_idx" ON "ConsentHistory"("agencyId");
CREATE INDEX IF NOT EXISTS "ConsentHistory_candidateReference_idx" ON "ConsentHistory"("candidateReference");

DO $$ BEGIN
    ALTER TABLE "ConsentHistory" ADD CONSTRAINT "ConsentHistory_consentRecordId_fkey" FOREIGN KEY ("consentRecordId") REFERENCES "ConsentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ConsentHistory" ADD CONSTRAINT "ConsentHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ConsentHistory" ADD CONSTRAINT "ConsentHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable CandidateDeletionRequest
CREATE TABLE IF NOT EXISTS "CandidateDeletionRequest" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "candidateId" TEXT,
    "candidateReference" TEXT NOT NULL,
    "candidateName" TEXT,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "rejectionReason" TEXT,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedById" TEXT,
    "executedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "storageCleanupStatus" TEXT,
    "failureReason" TEXT,
    "deletedFilesCount" INTEGER NOT NULL DEFAULT 0,
    "totalFilesCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CandidateDeletionRequest_agencyId_status_idx" ON "CandidateDeletionRequest"("agencyId", "status");
CREATE INDEX IF NOT EXISTS "CandidateDeletionRequest_candidateId_idx" ON "CandidateDeletionRequest"("candidateId");
CREATE INDEX IF NOT EXISTS "CandidateDeletionRequest_candidateReference_idx" ON "CandidateDeletionRequest"("candidateReference");

DO $$ BEGIN
    ALTER TABLE "CandidateDeletionRequest" ADD CONSTRAINT "CandidateDeletionRequest_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CandidateDeletionRequest" ADD CONSTRAINT "CandidateDeletionRequest_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CandidateDeletionRequest" ADD CONSTRAINT "CandidateDeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CandidateDeletionRequest" ADD CONSTRAINT "CandidateDeletionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CandidateDeletionRequest" ADD CONSTRAINT "CandidateDeletionRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CandidateDeletionRequest" ADD CONSTRAINT "CandidateDeletionRequest_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable RetentionPolicy
CREATE TABLE IF NOT EXISTS "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "retentionDays" INTEGER NOT NULL DEFAULT 365,
    "purpose" TEXT NOT NULL DEFAULT 'RECRUITMENT_PROCESSING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RetentionPolicy_agencyId_isActive_idx" ON "RetentionPolicy"("agencyId", "isActive");

DO $$ BEGIN
    ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

