import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, notFound } from '../lib/errors';
import { authenticate } from '../middleware/authenticate';
import { publicUser, publicPal } from '../lib/serialize';

export const profileRouter = Router();
profileRouter.use(authenticate); // every profile route requires auth

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
      where: { role: 'pal', verified: true, id: { notIn: [...excluded] } },
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
