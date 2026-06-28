import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, badRequest, notFound, forbidden, conflict } from '../lib/errors';
import { authenticate, requireRole } from '../middleware/authenticate';
import { publicFavor, publicFavorOpen } from '../lib/serialize';
import { computeFees, computePayout, computeCancellation, FAVOR_TIERS } from '../lib/money';

export const favorRouter = Router();
favorRouter.use(authenticate);

const ACTIVE_STATUSES = ['requested', 'matched', 'enroute', 'arrived', 'in_progress'];

// Include the member's first name on participant-facing favor responses so the
// assigned pal sees who they're helping (the open feed never uses this).
const memberInclude = { member: { select: { firstName: true } } } as const;

// Fetch a favor the caller is allowed to see (member or assigned pal).
async function getParticipantFavor(favorId: string, userId: string) {
  const favor = await prisma.favor.findUnique({ where: { id: favorId }, include: memberInclude });
  if (!favor) throw notFound('Favor not found');
  if (favor.memberId !== userId && favor.palId !== userId) {
    throw forbidden('You are not a participant in this favor');
  }
  return favor;
}

async function notify(userId: string, type: string, title: string, body: string) {
  await prisma.notification.create({ data: { userId, type, title, body } });
}

// POST /api/favors — member creates a favor. Price + fees are server-computed.
const createSchema = z.object({
  tier: z.enum(['tiny', 'small', 'big', 'huge', 'custom', 'negotiate']),
  price: z.number().positive().max(100000).optional(),
  description: z.string().trim().min(1).max(2000),
  images: z.array(z.string().url().max(2000)).max(10).default([]),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().trim().min(1).max(300),
  }),
  scheduledFor: z.number().int().positive().optional(),
  hours: z.number().int().positive().max(24).optional(),
});
favorRouter.post(
  '/',
  requireRole('member'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createSchema>;

    // Server decides the base price: fixed tiers are authoritative; custom/
    // negotiate accept a client price but clamp it to a sane range.
    let base: number;
    if (input.tier in FAVOR_TIERS) {
      base = FAVOR_TIERS[input.tier];
    } else {
      if (input.price == null) throw badRequest('price is required for custom/negotiate favors');
      base = Math.round(input.price * 100) / 100;
    }
    const { serviceFee, transactionFee, total } = computeFees(base);

    const favor = await prisma.favor.create({
      data: {
        memberId: req.user!.id,
        tier: input.tier,
        price: base,
        description: input.description,
        images: JSON.stringify(input.images),
        locationLat: input.location.lat,
        locationLng: input.location.lng,
        locationAddress: input.location.address,
        status: 'requested',
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        hours: input.hours ?? null,
        serviceFee,
        transactionFee,
        total,
        events: { create: { status: 'requested', actorId: req.user!.id } },
      },
    });
    res.status(201).json({ favor: publicFavor(favor) });
  }),
);

// GET /api/favors — history for the caller (as member or pal).
favorRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favors = await prisma.favor.findMany({
      where: { OR: [{ memberId: me }, { palId: me }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ favors: favors.map(publicFavor) });
  }),
);

// GET /api/favors/active — the caller's current in-flight favor, if any.
favorRouter.get(
  '/active',
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await prisma.favor.findFirst({
      where: { OR: [{ memberId: me }, { palId: me }], status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
      include: memberInclude,
    });
    res.json({ favor: favor ? publicFavor(favor) : null });
  }),
);

// GET /api/favors/incoming — open favors a pal can accept (not their own, not
// from anyone they're blocked with).
favorRouter.get(
  '/incoming',
  requireRole('pal'),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const blocks = await prisma.block.findMany({
      where: { OR: [{ blockerId: me }, { blockedId: me }] },
      select: { blockerId: true, blockedId: true },
    });
    const blockedMembers = new Set<string>();
    for (const b of blocks) {
      blockedMembers.add(b.blockerId === me ? b.blockedId : b.blockerId);
    }
    const favors = await prisma.favor.findMany({
      where: { status: 'requested', palId: null, memberId: { notIn: [me, ...blockedMembers] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    // Coarse location only — exact address is revealed to the pal once matched.
    res.json({ favors: favors.map(publicFavorOpen) });
  }),
);

const idParam = z.object({ id: z.string().uuid() });

// GET /api/favors/:id
favorRouter.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const favor = await getParticipantFavor(req.params.id, req.user!.id);
    res.json({ favor: publicFavor(favor) });
  }),
);

// POST /api/favors/:id/accept — a pal claims an open favor. Atomic so two pals
// can't both win the same favor (race-safe via a conditional updateMany).
favorRouter.post(
  '/:id/accept',
  requireRole('pal'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.memberId === me) throw forbidden('You cannot accept your own favor');

    const claimed = await prisma.favor.updateMany({
      where: { id: req.params.id, status: 'requested', palId: null },
      data: { status: 'matched', palId: me },
    });
    if (claimed.count === 0) throw conflict('This favor is no longer available');

    await prisma.favorEvent.create({ data: { favorId: req.params.id, status: 'matched', actorId: me } });
    await notify(favor.memberId, 'match', 'Favor accepted', 'A Favor Pal accepted your request.');

    const updated = await prisma.favor.findUniqueOrThrow({ where: { id: req.params.id }, include: memberInclude });
    res.json({ favor: publicFavor(updated) });
  }),
);

// POST /api/favors/:id/decline — a pal skips a favor (informational only).
favorRouter.post(
  '/:id/decline',
  requireRole('pal'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json({ ok: true });
  }),
);

// POST /api/favors/:id/assign — a member books a specific pal.
favorRouter.post(
  '/:id/assign',
  requireRole('member'),
  validate({ params: idParam, body: z.object({ palId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { palId } = req.body as { palId: string };
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.memberId !== me) throw forbidden('Not your favor');
    if (favor.status !== 'requested' || favor.palId) throw conflict('Favor already matched');

    const pal = await prisma.user.findFirst({ where: { id: palId, role: 'pal' } });
    if (!pal) throw badRequest('Invalid pal');
    const blocked = await prisma.block.findFirst({
      where: { OR: [{ blockerId: me, blockedId: palId }, { blockerId: palId, blockedId: me }] },
    });
    if (blocked) throw forbidden('Cannot book this pal');

    // Atomic claim — mirrors accept() so a concurrent accept/assign can't be
    // clobbered (the stale check above is only a fast-fail; this is the gate).
    const claimed = await prisma.favor.updateMany({
      where: { id: req.params.id, memberId: me, status: 'requested', palId: null },
      data: { status: 'matched', palId },
    });
    if (claimed.count === 0) throw conflict('Favor already matched');

    await prisma.favorEvent.create({ data: { favorId: req.params.id, status: 'matched', actorId: me } });
    await notify(palId, 'match', 'You were booked', 'A member booked you for a favor.');
    const updated = await prisma.favor.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json({ favor: publicFavor(updated) });
  }),
);

// POST /api/favors/:id/advance — the assigned pal moves the favor forward.
// Transitions must move FORWARD along this order, but may skip steps (the app's
// pal flow goes matched -> arrived directly, without an explicit "en route").
const STATUS_ORDER = ['matched', 'enroute', 'arrived', 'in_progress'];
favorRouter.post(
  '/:id/advance',
  validate({ params: idParam, body: z.object({ status: z.enum(['enroute', 'arrived', 'in_progress']) }) }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { status } = req.body as { status: string };
    const favor = await getParticipantFavor(req.params.id, me);
    if (favor.palId !== me) throw forbidden('Only the assigned pal can advance this favor');
    const from = STATUS_ORDER.indexOf(favor.status);
    const to = STATUS_ORDER.indexOf(status);
    if (from < 0 || to <= from) {
      throw conflict(`Cannot move from ${favor.status} to ${status}`);
    }
    // Atomic transition guarded on the exact current status, so concurrent
    // advances (or an advance racing a cancel) can't double-apply.
    const moved = await prisma.favor.updateMany({
      where: { id: favor.id, palId: me, status: favor.status },
      data: { status },
    });
    if (moved.count === 0) throw conflict('Favor status changed — please retry');
    await prisma.favorEvent.create({ data: { favorId: favor.id, status, actorId: me } });
    if (status === 'arrived') {
      await notify(favor.memberId, 'arrived', 'Your Pal has arrived', 'Your Favor Pal is at the location.');
    }
    const updated = await prisma.favor.findUniqueOrThrow({ where: { id: favor.id }, include: memberInclude });
    res.json({ favor: publicFavor(updated) });
  }),
);

// POST /api/favors/:id/finish — the assigned pal completes the favor. Computes
// the payout and writes both ledgers (member payment + pal earning).
favorRouter.post(
  '/:id/finish',
  requireRole('pal'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await getParticipantFavor(req.params.id, me);
    if (favor.palId !== me) throw forbidden('Only the assigned pal can complete this favor');
    if (!['arrived', 'in_progress'].includes(favor.status)) {
      throw conflict('Favor is not in a completable state');
    }

    const { payout } = computePayout(favor.price, favor.tip ?? 0);

    const updated = await prisma.$transaction(async (tx) => {
      // Atomic state gate INSIDE the transaction: only one concurrent /finish
      // can flip arrived/in_progress -> completed; the rest get count===0 and
      // abort, so the payout + member charge are written exactly once.
      const done = await tx.favor.updateMany({
        where: { id: favor.id, palId: me, status: { in: ['arrived', 'in_progress'] } },
        data: { status: 'completed' },
      });
      if (done.count === 0) throw conflict('Favor is not in a completable state');

      const f = await tx.favor.findUniqueOrThrow({ where: { id: favor.id }, include: memberInclude });
      await tx.favorEvent.create({ data: { favorId: favor.id, status: 'completed', actorId: me } });
      await tx.transaction.create({
        data: { userId: favor.memberId, favorId: favor.id, title: f.description.slice(0, 80), amount: f.total, status: 'completed', kind: 'payment' },
      });
      await tx.transaction.create({
        data: { userId: me, favorId: favor.id, title: f.description.slice(0, 80), amount: payout, status: 'completed', kind: 'earning' },
      });
      await tx.user.update({ where: { id: me }, data: { totalFavors: { increment: 1 } } });
      return f;
    });

    await notify(favor.memberId, 'general', 'Favor completed', 'Your favor was completed. Please leave a rating.');
    res.json({ favor: publicFavor(updated), payout });
  }),
);

// POST /api/favors/:id/rate-member — the pal rates the member after completion.
favorRouter.post(
  '/:id/rate-member',
  requireRole('pal'),
  validate({ params: idParam, body: z.object({ rating: z.number().int().min(1).max(5), feedback: z.string().max(1000).default('') }) }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { rating, feedback } = req.body as { rating: number; feedback: string };
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.palId !== me) throw forbidden('Only the assigned pal can rate this favor');
    if (favor.status !== 'completed') throw conflict('Only completed favors can be rated');
    // Atomic single-rating gate (mirrors the member rate flow).
    const rated = await prisma.favor.updateMany({
      where: { id: favor.id, palId: me, palRating: null },
      data: { palRating: rating, palFeedback: feedback },
    });
    if (rated.count === 0) throw conflict('Favor already rated');
    res.json({ ok: true });
  }),
);

// POST /api/favors/:id/cancel — the member cancels; cancellation fee per policy.
favorRouter.post(
  '/:id/cancel',
  requireRole('member'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.memberId !== me) throw forbidden('Not your favor');
    if (!ACTIVE_STATUSES.includes(favor.status)) throw conflict('Favor cannot be cancelled');

    const cancellation = computeCancellation({ status: favor.status, price: favor.price, total: favor.total });

    const updated = await prisma.$transaction(async (tx) => {
      // Atomic gate so a cancel can't race a finish (only one terminal write wins).
      const done = await tx.favor.updateMany({
        where: { id: favor.id, memberId: me, status: { in: ACTIVE_STATUSES } },
        data: { status: 'cancelled' },
      });
      if (done.count === 0) throw conflict('Favor cannot be cancelled');
      const f = await tx.favor.findUniqueOrThrow({ where: { id: favor.id } });
      await tx.favorEvent.create({ data: { favorId: favor.id, status: 'cancelled', actorId: me } });

      // Persist the policy: charge the member the cancellation fee and, when a
      // pal was already committed, credit that fee to them as compensation.
      if (cancellation.fee > 0) {
        await tx.transaction.create({
          data: { userId: me, favorId: favor.id, title: `Cancellation fee: ${f.description.slice(0, 60)}`, amount: cancellation.fee, status: 'cancelled', kind: 'payment' },
        });
        if (favor.palId) {
          // 'completed' so it counts toward the pal's available balance and can
          // actually be cashed out (the cash-out path only pays 'completed').
          await tx.transaction.create({
            data: { userId: favor.palId, favorId: favor.id, title: `Cancellation compensation: ${f.description.slice(0, 50)}`, amount: cancellation.fee, status: 'completed', kind: 'earning' },
          });
        }
      }
      return f;
    });

    if (favor.palId) {
      await notify(favor.palId, 'cancellation', 'Favor cancelled', 'A favor you accepted was cancelled.');
    }
    res.json({ favor: publicFavor(updated), cancellation });
  }),
);

// POST /api/favors/:id/rate — the member rates a completed favor (+ optional tip).
favorRouter.post(
  '/:id/rate',
  requireRole('member'),
  validate({
    params: idParam,
    body: z.object({ rating: z.number().int().min(1).max(5), feedback: z.string().max(1000).default(''), tip: z.number().min(0).max(1000).optional() }),
  }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { rating, feedback, tip } = req.body as { rating: number; feedback: string; tip?: number };
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.memberId !== me) throw forbidden('Not your favor');
    if (favor.status !== 'completed') throw conflict('Only completed favors can be rated');
    if (favor.rating != null) throw conflict('Favor already rated');

    const updated = await prisma.$transaction(async (tx) => {
      // Atomic single-rating gate: only the first concurrent /rate wins, so the
      // tip can't be credited more than once.
      const rated = await tx.favor.updateMany({
        where: { id: favor.id, rating: null },
        data: { rating, feedback, tip: tip ?? null },
      });
      if (rated.count === 0) throw conflict('Favor already rated');
      const f = await tx.favor.findUniqueOrThrow({ where: { id: favor.id } });
      if (favor.palId) {
        // Recompute the pal's average rating from all their rated favors.
        const agg = await tx.favor.aggregate({
          where: { palId: favor.palId, rating: { not: null } },
          _avg: { rating: true },
        });
        await tx.user.update({
          where: { id: favor.palId },
          data: { rating: Math.round((agg._avg.rating ?? rating) * 10) / 10 },
        });
        if (tip && tip > 0) {
          await tx.transaction.create({
            data: { userId: favor.palId, favorId: favor.id, title: `Tip: ${f.description.slice(0, 60)}`, amount: tip, status: 'completed', kind: 'earning' },
          });
        }
      }
      return f;
    });
    res.json({ favor: publicFavor(updated) });
  }),
);
