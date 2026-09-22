-- CreateTable
CREATE TABLE "AvitoAd" (
    "account" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "rooms" INTEGER,
    "square" DOUBLE PRECISION,
    "livingSpace" DOUBLE PRECISION,
    "floor" INTEGER,
    "price" INTEGER,
    "inFeed" BOOLEAN NOT NULL DEFAULT true,
    "sectionSlug" TEXT,
    "sectionTitle" TEXT,
    "messages" JSONB,
    "avitoId" BIGINT,
    "avitoStatus" TEXT,
    "url" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvitoAd_pkey" PRIMARY KEY ("account","adId")
);

-- CreateTable
CREATE TABLE "AvitoItem" (
    "account" TEXT NOT NULL,
    "avitoId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "price" INTEGER,
    "status" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvitoItem_pkey" PRIMARY KEY ("account","avitoId")
);

-- CreateIndex
CREATE INDEX "AvitoAd_account_avitoId_idx" ON "AvitoAd"("account", "avitoId");
