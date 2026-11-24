-- Notification deep-link columns + the "almost here" one-shot watermark.
-- All additive and nullable — existing rows stay null (no backfill): a
-- notification with no favorId/threadId simply has nothing to deep-link to, and
-- a favor with a null nearNotifiedAt has not yet fired the proximity push.

-- AlterTable
ALTER TABLE "Favor" ADD COLUMN     "nearNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "favorId" TEXT,
ADD COLUMN     "threadId" TEXT;
