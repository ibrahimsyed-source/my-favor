-- AlterTable
ALTER TABLE "Favor" ADD COLUMN "stripePaymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "stripeConnectId" TEXT;
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;
