-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "currentRole" TEXT,
ADD COLUMN     "experienceYears" DOUBLE PRECISION,
ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "isFixture" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keySkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "noticeDays" INTEGER;

-- AlterTable
ALTER TABLE "UploadedDocument" ADD COLUMN     "fileSizeBytes" INTEGER;

-- CreateIndex
CREATE INDEX "Candidate_agencyId_isFixture_idx" ON "Candidate"("agencyId", "isFixture");
