import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, notFound } from '../lib/errors';
import { authenticate } from '../middleware/authenticate';
import { publicNotification } from '../lib/serialize';

export const notificationRouter = Router();
notificationRouter.use(authenticate);

// GET /api/notifications
notificationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ notifications: items.map(publicNotification) });
  }),
);

// POST /api/notifications/:id/read
notificationRouter.post(
  '/:id/read',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { read: true },
    });
    if (result.count === 0) throw notFound('Notification not found');
    res.json({ ok: true });
  }),
);

// POST /api/notifications/read-all
notificationRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true } });
    res.json({ ok: true });
  }),
);
