-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "propertyId" INTEGER;

-- CreateIndex
CREATE INDEX "Lead_propertyId_idx" ON "Lead"("propertyId");
