-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "referrer" TEXT,
ADD COLUMN     "sourceLabel" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmSource" TEXT;

