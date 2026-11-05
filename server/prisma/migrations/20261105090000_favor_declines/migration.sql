-- A pal declined (dismissed) an open favor: it stays off THEIR feed permanently
-- but remains visible to every other pal. One row per (favor, pal); rows die
-- with the favor (Cascade).

-- CreateTable
CREATE TABLE "FavorDecline" (
    "id" TEXT NOT NULL,
    "favorId" TEXT NOT NULL,
    "palId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavorDecline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavorDecline_palId_idx" ON "FavorDecline"("palId");

-- CreateIndex
CREATE UNIQUE INDEX "FavorDecline_favorId_palId_key" ON "FavorDecline"("favorId", "palId");

-- AddForeignKey
ALTER TABLE "FavorDecline" ADD CONSTRAINT "FavorDecline_favorId_fkey" FOREIGN KEY ("favorId") REFERENCES "Favor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavorDecline" ADD CONSTRAINT "FavorDecline_palId_fkey" FOREIGN KEY ("palId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
