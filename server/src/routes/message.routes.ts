import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, badRequest, forbidden, notFound } from '../lib/errors';
import { authenticate } from '../middleware/authenticate';
import { publicThread, publicMessage } from '../lib/serialize';

export const messageRouter = Router();
messageRouter.use(authenticate);

// Threads store participants as (userAId, userBId) with a stable ordering so a
// pair always maps to one row. Helper canonicalizes the pair.
function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function loadThreadForViewer(threadId: string, viewerId: string) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: { userA: true, userB: true },
  });
  if (!thread) throw notFound('Thread not found');
  if (thread.userAId !== viewerId && thread.userBId !== viewerId) {
    throw forbidden('You are not a participant in this conversation');
  }
  return thread;
}

// GET /api/messages/threads — the caller's conversations.
messageRouter.get(
  '/threads',
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const threads = await prisma.thread.findMany({
      where: { OR: [{ userAId: me }, { userBId: me }] },
      include: { userA: true, userB: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    res.json({ threads: threads.map((t) => publicThread(t, me)) });
  }),
);

// POST /api/messages/threads — get or create a thread with another user.
messageRouter.post(
  '/threads',
  validate({ body: z.object({ withUserId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { withUserId } = req.body as { withUserId: string };
    if (withUserId === me) throw badRequest('Cannot message yourself');

    const other = await prisma.user.findUnique({ where: { id: withUserId }, select: { id: true } });
    if (!other) throw notFound('User not found');

    // Refuse to open a thread across a block relationship.
    const blocked = await prisma.block.findFirst({
      where: { OR: [{ blockerId: me, blockedId: withUserId }, { blockerId: withUserId, blockedId: me }] },
    });
    if (blocked) throw forbidden('Cannot message this user');

    const [userAId, userBId] = orderPair(me, withUserId);
    const thread = await prisma.thread.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      create: { userAId, userBId },
      update: {},
      include: { userA: true, userB: true },
    });
    res.json({ thread: publicThread(thread, me) });
  }),
);

// GET /api/messages/threads/:id/messages — participants only. Reading marks the
// caller's side as read.
messageRouter.get(
  '/threads/:id/messages',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const thread = await loadThreadForViewer(req.params.id, me);
    const messages = await prisma.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    // Clear unread for the viewer's side.
    await prisma.thread.update({
      where: { id: thread.id },
      data: thread.userAId === me ? { unreadForA: 0 } : { unreadForB: 0 },
    });
    res.json({ messages: messages.map((m) => publicMessage(m, me)) });
  }),
);

// POST /api/messages/threads/:id/messages — send a message (participants only).
messageRouter.post(
  '/threads/:id/messages',
  validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ text: z.string().trim().min(1).max(2000) }) }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { text } = req.body as { text: string };
    const thread = await loadThreadForViewer(req.params.id, me);

    const message = await prisma.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { threadId: thread.id, senderId: me, text } });
      // Bump the recipient's unread + denormalized last message.
      await tx.thread.update({
        where: { id: thread.id },
        data: {
          lastMessage: text.slice(0, 140),
          ...(thread.userAId === me ? { unreadForB: { increment: 1 } } : { unreadForA: { increment: 1 } }),
        },
      });
      return m;
    });
    res.status(201).json({ message: publicMessage(message, me) });
  }),
);
