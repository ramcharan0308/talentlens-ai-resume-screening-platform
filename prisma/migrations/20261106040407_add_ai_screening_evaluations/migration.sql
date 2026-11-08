-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('SUPPORTED', 'PARTIAL', 'INSUFFICIENT');

-- CreateTable
CREATE TABLE "ScorecardSnapshot" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScorecardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "applicationId" TEXT,
    "documentId" TEXT,
    "scorecardSnapshotId" TEXT,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "overallScore" DOUBLE PRECISION,
    "evidenceCoverage" DOUBLE PRECISION,
    "supportedCount" INTEGER NOT NULL DEFAULT 0,
    "partialCount" INTEGER NOT NULL DEFAULT 0,
    "insufficientCount" INTEGER NOT NULL DEFAULT 0,
    "hasMustHaveWarnings" BOOLEAN NOT NULL DEFAULT false,
    "mustHaveWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "redactedContent" TEXT,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "errorMessage" TEXT,
    "isReviewedByRecruiter" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCriterionScore" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "criterionId" TEXT,
    "criterionName" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "isMustHave" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'INSUFFICIENT',
    "explanation" TEXT NOT NULL,
    "quotes" JSONB NOT NULL,
    "missingGaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationCriterionScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScorecardSnapshot_requisitionId_idx" ON "ScorecardSnapshot"("requisitionId");

-- CreateIndex
CREATE INDEX "Evaluation_agencyId_idx" ON "Evaluation"("agencyId");

-- CreateIndex
CREATE INDEX "Evaluation_requisitionId_idx" ON "Evaluation"("requisitionId");

-- CreateIndex
CREATE INDEX "Evaluation_candidateId_idx" ON "Evaluation"("candidateId");

-- CreateIndex
CREATE INDEX "Evaluation_requisitionId_overallScore_idx" ON "Evaluation"("requisitionId", "overallScore");

-- CreateIndex
CREATE INDEX "Evaluation_requisitionId_status_idx" ON "Evaluation"("requisitionId", "status");

-- CreateIndex
CREATE INDEX "Evaluation_isReviewedByRecruiter_idx" ON "Evaluation"("isReviewedByRecruiter");

-- CreateIndex
CREATE INDEX "EvaluationCriterionScore_evaluationId_idx" ON "EvaluationCriterionScore"("evaluationId");

-- CreateIndex
CREATE INDEX "EvaluationCriterionScore_criterionName_idx" ON "EvaluationCriterionScore"("criterionName");

-- AddForeignKey
ALTER TABLE "ScorecardSnapshot" ADD CONSTRAINT "ScorecardSnapshot_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_scorecardSnapshotId_fkey" FOREIGN KEY ("scorecardSnapshotId") REFERENCES "ScorecardSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriterionScore" ADD CONSTRAINT "EvaluationCriterionScore_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
