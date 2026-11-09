import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, notFound, AppError } from '../lib/errors';
import { authenticate } from '../middleware/authenticate';
import { publicUser, publicPal } from '../lib/serialize';
import { PAL_RADIUS_MIN, PAL_RADIUS_MAX } from '../lib/geo';

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
    // Pal discovery preferences (Group 8). The home anchor drives distance
    // filtering of the new-favor fan-out and the /incoming feed; notifyFavors is
    // the master alerts switch. All own-profile; never exposed to other users.
    palRadiusMiles: z.number().int().min(PAL_RADIUS_MIN).max(PAL_RADIUS_MAX),
    // Nullable so a pal can CLEAR their home (back to see-everywhere); a
    // half-set home is still rejected by the refine below.
    palHomeLat: z.number().min(-90).max(90).nullable(),
    palHomeLng: z.number().min(-180).max(180).nullable(),
    palHomeAddress: z.string().max(300).nullable(),
    notifyFavors: z.boolean(),
  })
  .partial()
  .strict()
  // Lat/lng are one anchor — a half-set home would filter against a meaningless
  // point, so they must be set together or cleared together (both numbers, or
  // both null; absence on both = no change).
  .refine((d) => {
    const latSet = d.palHomeLat !== undefined;
    const lngSet = d.palHomeLng !== undefined;
    if (latSet !== lngSet) return false;
    if (latSet && lngSet) return (d.palHomeLat === null) === (d.palHomeLng === null);
    return true;
  }, {
    message: 'palHomeLat and palHomeLng must be set (or cleared) together',
    path: ['palHomeLat'],
  });
profileRouter.patch(
  '/me',
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof updateSchema>;
    const user = await prisma.user.update({ where: { id: req.user!.id }, data });
    res.json({ user: publicUser(user) });
  }),
);

// PATCH /api/profile/push-token — the app registers (or clears) the device's
// Expo push token so the server can deliver favor-lifecycle push notifications.
// Accepts a valid ExponentPushToken, or null to clear it (e.g. on logout /
// permission revocation). Never trusted for anything but delivery.
const pushTokenSchema = z.object({
  pushToken: z
    .string()
    .trim()
    .regex(/^Expo(nent)?PushToken\[.+\]$/, 'Invalid Expo push token')
    .max(256)
    .nullable(),
});
profileRouter.patch(
  '/push-token',
  validate({ body: pushTokenSchema }),
  asyncHandler(async (req, res) => {
    const { pushToken } = req.body as z.infer<typeof pushTokenSchema>;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { pushToken },
    });
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

// POST /api/profile/accept-pal-agreement — record the pal's acceptance of the
// independent-contractor Favor Pal Agreement (separate from the signup Terms).
// Required before verify-pal will approve a pal (see the gate there). The app
// ships the agreement copy locally and POSTs the version string it showed; the
// hosted /pal-agreement page carries the same terms for the stores/legal. We
// record whatever version the client accepted — the client owns the canonical
// copy, the server just stamps the consent.
profileRouter.post(
  '/accept-pal-agreement',
  validate({ body: z.object({ version: z.string().trim().min(1).max(40) }) }),
  asyncHandler(async (req, res) => {
    const { version } = req.body as { version: string };
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { palAgreementAt: new Date(), palAgreementVersion: version },
    });
    res.json({ user: publicUser(user) });
  }),
);

// POST /api/profile/verify-pal — submit the pal vetting application (legal name,
// DOB, driver-requirements consent). No SSN is collected — identity/background
// vendors are mocked in this build, so a complete, consented submission is
// auto-approved and sets palVerified. In production this endpoint would only
// RECORD the application and a real vendor callback / admin review would flip
// palVerified. (Old app builds may still send an `ssn` key; zod strips unknown
// keys, so they keep working.)
const vettingSchema = z.object({
  legalFirstName: z.string().trim().min(1).max(80),
  legalLastName: z.string().trim().min(1).max(80),
  dateOfBirth: z.string().trim().min(1).max(40),
  consent: z.literal(true, { errorMap: () => ({ message: 'Background-check consent is required' }) }),
});
profileRouter.post(
  '/verify-pal',
  validate({ body: vettingSchema }),
  asyncHandler(async (req, res) => {
    // Pal agreement gate: the independent-contractor Favor Pal Agreement must be
    // accepted (POST /accept-pal-agreement) BEFORE a pal can be vetted/approved,
    // so an unsigned pal is never auto-approved. The client presents + accepts
    // the agreement first; until palAgreementAt is set this is 409
    // pal_agreement_required and the client routes the user to the agreement.
    const me = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { palAgreementAt: true },
    });
    if (!me.palAgreementAt) {
      throw new AppError(409, 'pal_agreement_required', 'Accept the Favor Pal Agreement before pal verification.');
    }

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
      // Presence is honored: invisible/offline pals are hidden from the
      // directory (they can still browse and accept on their own initiative).
      where: {
        role: 'pal',
        verified: true,
        palVerified: true,
        status: { notIn: ['invisible', 'offline'] },
        id: { notIn: [...excluded] },
      },
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

// GET /api/profile/members/:id — a favor member as seen by pals deciding
// whether to take their favor. Counterpart of /pals/:id; conservative shape.
profileRouter.get(
  '/members/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const member = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!member) throw notFound('Member not found');
    const completedFavors = await prisma.favor.count({
      where: { memberId: member.id, status: 'completed' },
    });
    res.json({
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        avatar: member.avatar ?? undefined,
        bio: member.bio ?? undefined,
        city: member.city ?? undefined,
        state: member.state ?? undefined,
        memberRating: member.memberRating,
        completedFavors,
        memberSince: member.createdAt.getTime(),
      },
    });
  }),
);

// GET /api/profile/members/:id/reviews — reviews pals left for this member.
profileRouter.get(
  '/members/:id/reviews',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const rated = await prisma.favor.findMany({
      where: { memberId: req.params.id, palRating: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { pal: { select: { firstName: true, lastName: true } } },
    });
    const reviews = rated.map((f) => ({
      id: f.id,
      rating: f.palRating ?? 0,
      comment: f.palFeedback ?? '',
      authorName: `${f.pal?.firstName ?? 'A Favor Pal'} ${f.pal?.lastName ? f.pal.lastName[0] + '.' : ''}`.trim(),
      date: f.createdAt.getTime(),
    }));
    res.json({ reviews });
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
