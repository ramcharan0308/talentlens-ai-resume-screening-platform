-- AlterTable
ALTER TABLE "Requisition" ADD COLUMN     "coreSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "department" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "maxExperienceYears" DOUBLE PRECISION,
ADD COLUMN     "maxNoticeDays" INTEGER,
ADD COLUMN     "minExperienceYears" DOUBLE PRECISION,
ADD COLUMN     "targetSalaryRange" TEXT;

-- CreateTable
CREATE TABLE "ScorecardCriterion" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL,
    "isMustHave" BOOLEAN NOT NULL DEFAULT false,
    "minScore" INTEGER NOT NULL DEFAULT 1,
    "maxScore" INTEGER NOT NULL DEFAULT 10,
    "guidelines" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScorecardCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScorecardCriterion_requisitionId_idx" ON "ScorecardCriterion"("requisitionId");

-- CreateIndex
CREATE INDEX "ScorecardCriterion_requisitionId_orderIndex_idx" ON "ScorecardCriterion"("requisitionId", "orderIndex");

-- AddForeignKey
ALTER TABLE "ScorecardCriterion" ADD CONSTRAINT "ScorecardCriterion_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
