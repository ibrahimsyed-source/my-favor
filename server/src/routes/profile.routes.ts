import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, notFound } from '../lib/errors';
import { authenticate } from '../middleware/authenticate';
import { publicUser, publicPal } from '../lib/serialize';

export const profileRouter = Router();
profileRouter.use(authenticate); // every profile route requires auth

// Whole years between a birth date and now (for the 18+ vetting check).
function yearsSince(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

// GET /api/profile/me
profileRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json({ user: publicUser(user) });
  }),
);

// PATCH /api/profile/me — update editable profile fields only. Identity-bearing
// and stat fields (email, phone, role, rating, verified, passwordHash) are NOT
// updatable here, so a client can't escalate or impersonate.
const updateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    avatar: z.string().url().max(2000),
    bio: z.string().max(500),
    city: z.string().max(120),
    state: z.string().max(120),
    zip: z.string().max(20),
    homeAddress: z.string().max(300),
  })
  .partial()
  .strict();
profileRouter.patch(
  '/me',
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof updateSchema>;
    const user = await prisma.user.update({ where: { id: req.user!.id }, data });
    res.json({ user: publicUser(user) });
  }),
);

// POST /api/profile/role — switch active role (member <-> pal).
profileRouter.post(
  '/role',
  validate({ body: z.object({ role: z.enum(['member', 'pal']) }) }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { role: (req.body as { role: 'member' | 'pal' }).role },
    });
    res.json({ user: publicUser(user) });
  }),
);

// POST /api/profile/verify-pal — submit the pal vetting application (legal name,
// SSN, DOB, driver-requirements consent). In this build the identity/background
// vendors are mocked, so a complete, consented submission is auto-approved and
// sets palVerified. In production this endpoint would only RECORD the application
// and a real vendor callback / admin review would flip palVerified.
const vettingSchema = z.object({
  legalFirstName: z.string().trim().min(1).max(80),
  legalLastName: z.string().trim().min(1).max(80),
  ssn: z.string().trim().regex(/^\d{9}$/, 'SSN must be 9 digits'),
  dateOfBirth: z.string().trim().min(1).max(40),
  consent: z.literal(true, { errorMap: () => ({ message: 'Background-check consent is required' }) }),
});
profileRouter.post(
  '/verify-pal',
  validate({ body: vettingSchema }),
  asyncHandler(async (req, res) => {
    const { dateOfBirth } = req.body as z.infer<typeof vettingSchema>;
    const dob = new Date(dateOfBirth);
    // Mock background check: applicants who are under 18 (or whose DOB doesn't
    // parse) are REJECTED; everyone else is auto-approved. This makes the
    // rejected outcome genuinely reachable (a real vendor would drive it).
    const ageOk = !isNaN(dob.getTime()) && yearsSince(dob) >= 18;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: ageOk
        ? { palVerified: true, palVerifiedAt: new Date(), palVetStatus: 'approved', dateOfBirth: dob }
        : { palVerified: false, palVetStatus: 'rejected', ...(isNaN(dob.getTime()) ? {} : { dateOfBirth: dob }) },
    });
    res.json({ user: publicUser(user) });
  }),
);

// POST /api/profile/status — presence.
profileRouter.post(
  '/status',
  validate({ body: z.object({ status: z.enum(['online', 'invisible', 'offline']) }) }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { status: (req.body as { status: string }).status },
    });
    res.json({ user: publicUser(user) });
  }),
);

// GET /api/profile/pals — available pals for matching, excluding self and anyone
// in a block relationship with the requester.
profileRouter.get(
  '/pals',
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const blocks = await prisma.block.findMany({
      where: { OR: [{ blockerId: me }, { blockedId: me }] },
      select: { blockerId: true, blockedId: true },
    });
    const excluded = new Set<string>([me]);
    for (const b of blocks) {
      excluded.add(b.blockerId);
      excluded.add(b.blockedId);
    }
    const pals = await prisma.user.findMany({
      // Only verified, vetted pals are matchable — palVerified gates the
      // background check the same way `verified` gates email confirmation.
      where: { role: 'pal', verified: true, palVerified: true, id: { notIn: [...excluded] } },
      orderBy: { rating: 'desc' },
      take: 50,
    });
    res.json({ pals: pals.map(publicPal) });
  }),
);

// GET /api/profile/pals/:id
profileRouter.get(
  '/pals/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const pal = await prisma.user.findFirst({ where: { id: req.params.id, role: 'pal' } });
    if (!pal) throw notFound('Pal not found');
    res.json({ pal: publicPal(pal) });
  }),
);

// GET /api/profile/pals/:id/reviews — reviews members left for this pal.
profileRouter.get(
  '/pals/:id/reviews',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const rated = await prisma.favor.findMany({
      where: { palId: req.params.id, rating: { not: null } },
      // Order/date by createdAt (stable) — updatedAt is bumped by the pal's later
      // rate-member write, which would spuriously reorder reviews.
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { member: { select: { firstName: true, lastName: true } } },
    });
    const reviews = rated.map((f) => ({
      id: f.id,
      rating: f.rating ?? 0,
      comment: f.feedback ?? '',
      // First name + last initial — reviews are public but we don't expose full names.
      authorName: `${f.member.firstName} ${f.member.lastName ? f.member.lastName[0] + '.' : ''}`.trim(),
      date: f.createdAt.getTime(),
    }));
    res.json({ reviews });
  }),
);
