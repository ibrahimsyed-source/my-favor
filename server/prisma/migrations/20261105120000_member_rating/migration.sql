-- Aggregate of pal->member reviews (Favor.palRating): the member-side
-- counterpart of User.rating, shown to pals deciding whether to take a favor.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "memberRating" DOUBLE PRECISION NOT NULL DEFAULT 0;
