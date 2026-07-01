import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate, validatedQuery } from '../lib/validate';
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
// caller's side as read. Returns the NEWEST page (oldest->newest for display);
// pass `?before=<messageId>` to page further back through history.
messageRouter.get(
  '/threads/:id/messages',
  validate({
    params: z.object({ id: z.string().uuid() }),
    // Optional message-id cursor for scrolling back through older history.
    query: z.object({ before: z.string().uuid().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { before } = validatedQuery<{ before?: string }>(req);
    const thread = await loadThreadForViewer(req.params.id, me);

    // Load the NEWEST slice, not the oldest: `asc + take` returns ancient
    // history and would never surface new messages once a thread grows past the
    // limit (the chat appears frozen). Fetch desc + take, then reverse to
    // oldest->newest for the client. A `before` cursor pages further back.
    const PAGE_SIZE = 50;
    const page = await prisma.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });
    const messages = page.reverse();

    // Clear unread for the viewer's side. Use a raw UPDATE so this read-side
    // write does NOT bump @updatedAt — the thread list is ordered by updatedAt,
    // and only a NEW message should reorder a conversation, never merely opening
    // one. Skip the write entirely when there is nothing to clear. Column names
    // are fixed literals (no interpolation) so this stays injection-safe.
    const unread = thread.userAId === me ? thread.unreadForA : thread.unreadForB;
    if (unread > 0) {
      if (thread.userAId === me) {
        await prisma.$executeRaw`UPDATE "Thread" SET "unreadForA" = 0 WHERE "id" = ${thread.id}`;
      } else {
        await prisma.$executeRaw`UPDATE "Thread" SET "unreadForB" = 0 WHERE "id" = ${thread.id}`;
      }
    }

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
