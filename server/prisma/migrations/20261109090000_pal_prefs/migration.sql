-- Pal discovery preferences + pal-agreement (independent-contractor) acceptance.
-- All additive: existing rows backfill from the NOT NULL defaults (palRadiusMiles
-- 25, notifyFavors true). The nullable home anchor (palHomeLat/Lng/Address) stays
-- null until a pal sets a home — a home-less pal is unfiltered and sees/alerts on
-- everything. The nullable agreement columns stay null until a pal signs the
-- Favor Pal Agreement (verify-pal is gated on palAgreementAt being set).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "palRadiusMiles" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "palHomeLat" DOUBLE PRECISION,
ADD COLUMN     "palHomeLng" DOUBLE PRECISION,
ADD COLUMN     "palHomeAddress" TEXT,
ADD COLUMN     "notifyFavors" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "palAgreementAt" TIMESTAMP(3),
ADD COLUMN     "palAgreementVersion" TEXT;
