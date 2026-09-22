-- CreateTable
CREATE TABLE "Property" (
    "id" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "projectName" TEXT NOT NULL,
    "houseId" INTEGER,
    "houseName" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "floor" INTEGER,
    "rooms" INTEGER,
    "areaTotal" DOUBLE PRECISION,
    "areaLiving" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "price" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Property_projectName_houseName_number_idx" ON "Property"("projectName", "houseName", "number");

-- CreateIndex
CREATE INDEX "Property_status_idx" ON "Property"("status");
