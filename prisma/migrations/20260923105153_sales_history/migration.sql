-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "price" INTEGER;

-- CreateTable
CREATE TABLE "StockChange" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "object" TEXT NOT NULL,
    "houseName" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "rooms" INTEGER,
    "areaTotal" DOUBLE PRECISION,
    "price" INTEGER,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDaily" (
    "day" TIMESTAMP(3) NOT NULL,
    "object" TEXT NOT NULL,
    "available" INTEGER NOT NULL,
    "booked" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL,
    "unavailable" INTEGER NOT NULL,
    "availableArea" DOUBLE PRECISION NOT NULL,
    "availableValue" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockDaily_pkey" PRIMARY KEY ("day","object")
);

-- CreateIndex
CREATE INDEX "StockChange_object_changedAt_idx" ON "StockChange"("object", "changedAt");

-- CreateIndex
CREATE INDEX "StockChange_toStatus_changedAt_idx" ON "StockChange"("toStatus", "changedAt");

-- CreateIndex
CREATE INDEX "StockDaily_object_day_idx" ON "StockDaily"("object", "day");

-- CreateIndex
CREATE INDEX "Lead_closedAt_idx" ON "Lead"("closedAt");
