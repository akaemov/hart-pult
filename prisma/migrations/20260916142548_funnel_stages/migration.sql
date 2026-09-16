-- CreateTable
CREATE TABLE "Pipeline" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "isMain" BOOLEAN NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Status" (
    "id" INTEGER NOT NULL,
    "pipelineId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Status_pkey" PRIMARY KEY ("pipelineId","id")
);

-- CreateIndex
CREATE INDEX "Status_pipelineId_sort_idx" ON "Status"("pipelineId", "sort");

-- AddForeignKey
ALTER TABLE "Status" ADD CONSTRAINT "Status_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

