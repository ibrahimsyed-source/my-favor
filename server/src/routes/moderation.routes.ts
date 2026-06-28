import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, badRequest, notFound } from '../lib/errors';
import { authenticate } from '../middleware/authenticate';

// Trust & safety endpoints (App Store guideline 1.2 for user-generated content).
export const moderationRouter = Router();
moderationRouter.use(authenticate);

// POST /api/moderation/report — file a report against another user.
moderationRouter.post(
  '/report',
  validate({ body: z.object({ userId: z.string().uuid(), reason: z.string().max(1000).optional(), favorId: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { userId, reason, favorId } = req.body as { userId: string; reason?: string; favorId?: string };
    if (userId === me) throw badRequest('You cannot report yourself');
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw notFound('User not found');

    const report = await prisma.report.create({
      data: { reporterId: me, reportedUserId: userId, reason: reason ?? null, favorId: favorId ?? null },
    });
    res.status(201).json({ ok: true, reportId: report.id });
  }),
);

// POST /api/moderation/block — block a user (idempotent).
moderationRouter.post(
  '/block',
  validate({ body: z.object({ userId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { userId } = req.body as { userId: string };
    if (userId === me) throw badRequest('You cannot block yourself');
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw notFound('User not found');

    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: me, blockedId: userId } },
      create: { blockerId: me, blockedId: userId },
      update: {},
    });
    res.json({ ok: true });
  }),
);

// DELETE /api/moderation/block/:userId — unblock.
moderationRouter.delete(
  '/block/:userId',
  validate({ params: z.object({ userId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await prisma.block.deleteMany({ where: { blockerId: req.user!.id, blockedId: req.params.userId } });
    res.json({ ok: true });
  }),
);

// GET /api/moderation/blocked — list ids the caller has blocked.
moderationRouter.get(
  '/blocked',
  asyncHandler(async (req, res) => {
    const blocks = await prisma.block.findMany({ where: { blockerId: req.user!.id }, select: { blockedId: true } });
    res.json({ blocked: blocks.map((b) => b.blockedId) });
  }),
);
