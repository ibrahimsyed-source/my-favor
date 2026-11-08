-- The member's listed price, captured at favor creation. Negotiation overwrites
-- Favor.price at match time, so abandon restores price/fees from listPrice when
-- the favor reopens (custom/negotiate favors included). Existing rows backfill
-- from their current price, then the column is locked down as NOT NULL.

-- AlterTable
ALTER TABLE "Favor" ADD COLUMN "listPrice" DOUBLE PRECISION;

-- Backfill: existing rows list at their current price.
UPDATE "Favor" SET "listPrice" = "price";

-- AlterTable
ALTER TABLE "Favor" ALTER COLUMN "listPrice" SET NOT NULL;
