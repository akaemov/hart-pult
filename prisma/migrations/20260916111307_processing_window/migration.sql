-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "AmoUser" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmoUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "statusId" INTEGER NOT NULL,
    "pipelineId" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL,
    "hasSource" BOOLEAN NOT NULL,
    "firstOutgoingCallAt" TIMESTAMP(3),
    "responsibleUserId" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadContact" (
    "leadId" INTEGER NOT NULL,
    "contactId" INTEGER NOT NULL,

    CONSTRAINT "LeadContact_pkey" PRIMARY KEY ("leadId","contactId")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" INTEGER NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER,
    "provider" TEXT NOT NULL,
    "leadId" INTEGER,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_responsibleUserId_idx" ON "Lead"("responsibleUserId");

-- CreateIndex
CREATE INDEX "LeadContact_contactId_idx" ON "LeadContact"("contactId");

-- CreateIndex
CREATE INDEX "Call_leadId_createdAt_idx" ON "Call"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Call_createdAt_idx" ON "Call"("createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "AmoUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadContact" ADD CONSTRAINT "LeadContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

