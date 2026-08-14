-- AlterTable: Expo push token for device push notifications (nullable).
ALTER TABLE "User" ADD COLUMN "pushToken" TEXT;

-- AlterTable: settlement watermark — set only after the ledger write (and, in
-- live mode, the Stripe charge) succeed. A completed favor with settledAt=null is
-- the operator reconcile signal.
ALTER TABLE "Favor" ADD COLUMN "settledAt" DATETIME;
