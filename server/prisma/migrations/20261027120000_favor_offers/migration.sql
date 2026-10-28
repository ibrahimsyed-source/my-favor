-- Price negotiation on open favors: one offer row per (favor, pal); counters
-- update the row in place, `lastBy` records whose price is on the table.

-- CreateTable
CREATE TABLE "FavorOffer" (
    "id" TEXT NOT NULL,
    "favorId" TEXT NOT NULL,
    "palId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "lastBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FavorOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavorOffer_favorId_idx" ON "FavorOffer"("favorId");

-- CreateIndex
CREATE INDEX "FavorOffer_palId_idx" ON "FavorOffer"("palId");

-- CreateIndex
CREATE UNIQUE INDEX "FavorOffer_favorId_palId_key" ON "FavorOffer"("favorId", "palId");

-- AddForeignKey
ALTER TABLE "FavorOffer" ADD CONSTRAINT "FavorOffer_favorId_fkey" FOREIGN KEY ("favorId") REFERENCES "Favor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavorOffer" ADD CONSTRAINT "FavorOffer_palId_fkey" FOREIGN KEY ("palId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
