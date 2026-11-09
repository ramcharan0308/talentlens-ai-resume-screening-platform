-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "agencyId" TEXT;

-- CreateIndex
CREATE INDEX "Organization_agencyId_idx" ON "Organization"("agencyId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
