-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "clientDecisionAt" TIMESTAMP(3),
ADD COLUMN     "clientDecisionById" TEXT,
ADD COLUMN     "clientOrganizationId" TEXT,
ADD COLUMN     "clientRejectionReason" TEXT,
ADD COLUMN     "proposedInterviewNote" TEXT,
ADD COLUMN     "proposedInterviewSlot" TIMESTAMP(3),
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "Requisition" ADD COLUMN     "clientOrganizationId" TEXT;

-- CreateIndex
CREATE INDEX "Application_clientOrganizationId_status_idx" ON "Application"("clientOrganizationId", "status");

-- CreateIndex
CREATE INDEX "Requisition_clientOrganizationId_idx" ON "Requisition"("clientOrganizationId");

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_clientDecisionById_fkey" FOREIGN KEY ("clientDecisionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
