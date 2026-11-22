import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, badRequest, notFound, forbidden, conflict, runClaimTx } from '../lib/errors';
import { authenticate } from '../middleware/authenticate';
import { publicFavor, publicFavorOpen, publicOffer } from '../lib/serialize';
import { computeFees, computePayout, computeCancellation, FAVOR_TIERS } from '../lib/money';
import { stripeEnabled, chargeFavor, chargeToPal, refundFavorCharge } from '../lib/stripe';
import { sendPushNotification } from '../lib/push';
import { haversineMiles } from '../lib/geo';

export const favorRouter = Router();
favorRouter.use(authenticate);

const ACTIVE_STATUSES = ['requested', 'matched', 'enroute', 'arrived', 'in_progress'];

// Stable signed-64-bit key for a per-member Postgres advisory lock (FNV-1a over
// the member id). Concurrent POST /favors for the SAME member serialize on this
// one lock so the one-active-request check and the insert are effectively atomic;
// different members hash to different keys and never contend.
function memberLockKey(id: string): bigint {
  let h = 1469598103934665603n; // FNV-1a 64-bit offset basis
  for (let i = 0; i < id.length; i++) {
    h ^= BigInt(id.charCodeAt(i));
    h = BigInt.asUintN(64, h * 1099511628211n);
  }
  return BigInt.asIntN(64, h); // fits Postgres bigint for pg_advisory_xact_lock(bigint)
}

// A pal's LIVE job window (assigned work still physically in flight). A favor
// parked in 'pending_release' — finished, waiting on the member to release the
// payment — is deliberately NOT here: it never blocks the pal from new work,
// and /active prefers a live job over it.
const PAL_LIVE_STATUSES = ['matched', 'enroute', 'arrived', 'in_progress'];

// Include the member's first name + phone, and the assigned pal's phone, on
// participant-facing favor responses so the two matched parties can reach each
// other (the open feed never uses this; the serializer only emits phones while
// the favor is in a matched/in-flight status).
const memberInclude = {
  member: { select: { firstName: true, phone: true } },
  pal: { select: { phone: true } },
} as const;

// Participant-facing reads also carry pending price offers (with the offering
// pal's public info) so the requester sees negotiation state via the normal
// active-favor poll. Matched/terminal favors have no pending offers (accepting
// declines the rest), so this stays empty outside the 'requested' window.
const participantInclude = {
  ...memberInclude,
  offers: { where: { status: 'pending' }, include: { pal: true }, orderBy: { updatedAt: 'desc' as const } },
} as const;

// Which pals should be alerted that `favor` just opened: verified, available
// (not suspended, not DND), not in a block relationship with the member, with
// new-favor alerts turned ON (notifyFavors), and — when the pal has set a
// palHome — within their palRadiusMiles of the favor. A pal with NO palHome set
// can't be distance-filtered, so they stay in (they opted into everything by not
// setting a home — we must not silently drop them). Exported so the fan-out AND
// the tests share one definition. O(verified pals) per call — Prisma can't
// haversine, so we fetch candidates and filter distance in JS; fine at current
// scale. The caller applies the fan-out cap AFTER this filter.
export async function selectBroadcastRecipients(favor: {
  memberId: string;
  locationLat: number;
  locationLng: number;
}): Promise<string[]> {
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: favor.memberId }, { blockedId: favor.memberId }] },
    select: { blockerId: true, blockedId: true },
  });
  const excluded = new Set<string>([favor.memberId]);
  for (const b of blocks) excluded.add(b.blockerId === favor.memberId ? b.blockedId : b.blockerId);
  const pals = await prisma.user.findMany({
    where: {
      palVerified: true,
      suspended: false,
      // Set Status is a real do-not-disturb: invisible/offline pals get no
      // notification row and no push (they can still browse on their own).
      status: { notIn: ['invisible', 'offline'] },
      // Favor-alerts toggle (feature 2): notifyFavors=false opts out entirely.
      notifyFavors: true,
      id: { notIn: [...excluded] },
    },
    select: { id: true, palHomeLat: true, palHomeLng: true, palRadiusMiles: true },
  });
  return pals
    .filter((p) =>
      p.palHomeLat == null || p.palHomeLng == null
        ? true
        : haversineMiles(p.palHomeLat, p.palHomeLng, favor.locationLat, favor.locationLng) <= p.palRadiusMiles,
    )
    .map((p) => p.id);
}

// Best-effort fan-out when a new favor is posted: every eligible pal (see
// selectBroadcastRecipients) gets a durable Notification row + a push, so a
// favor posted while the other tester's phone is in their pocket still reaches
// them. Capped and fire-and-forget — fan-out failures must never fail the
// create. Skipped under test so integration runs don't spray notifications at
// real accounts in the shared DB (the recipient selection itself is unit-tested
// directly against selectBroadcastRecipients).
async function broadcastNewFavor(favor: {
  id: string;
  memberId: string;
  tier: string;
  price: number;
  description: string;
  locationLat: number;
  locationLng: number;
}) {
  if (process.env.NODE_ENV === 'test') return;
  try {
    // Distance + notifyFavors filtering happens in selectBroadcastRecipients;
    // the 100 cap is applied AFTER it so an out-of-radius favor never wastes the
    // fan-out budget on pals who would be filtered out anyway.
    const palIds = (await selectBroadcastRecipients(favor)).slice(0, 100);
    if (palIds.length === 0) return;
    const title = 'New favor nearby';
    const body = `$${favor.price} — ${favor.description.slice(0, 80)}`;
    await prisma.notification.createMany({
      data: palIds.map((id) => ({ userId: id, type: 'general', title, body })),
    });
    for (const id of palIds) {
      void sendPushNotification(id, title, body, { type: 'new_favor', favorId: favor.id });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('broadcastNewFavor failed:', err);
  }
}

// Fetch a favor the caller is allowed to see (member or assigned pal).
async function getParticipantFavor(favorId: string, userId: string) {
  const favor = await prisma.favor.findUnique({ where: { id: favorId }, include: participantInclude });
  if (!favor) throw notFound('Favor not found');
  if (favor.memberId !== userId && favor.palId !== userId) {
    throw forbidden('You are not a participant in this favor');
  }
  return favor;
}

// Persist the durable in-app Notification row AND fire a best-effort device push
// (Expo). The DB row is the source of truth (polled by the app); the push is a
// courtesy ping and never blocks — a push failure can't break the favor flow.
async function notify(userId: string, type: string, title: string, body: string) {
  await prisma.notification.create({ data: { userId, type, title, body } });
  void sendPushNotification(userId, title, body, { type });
}

// Settle money for a favor: the member is debited and the pal credited together,
// so a cashable pal earning ONLY ever exists when the member's money was actually
// collected. Mock mode = instant ('completed'). Live mode charges the member's
// card and routes funds to the pal's connected account; rows are 'completed' on
// success, else 'incomplete' (not cashable). `charge` runs only in live mode and
// receives the resolved (palConnectId, paymentMethodId).
async function settle(opts: {
  favorId: string;
  memberId: string;
  palId?: string | null;
  memberTitle: string;
  memberAmount: number;
  palTitle?: string;
  palAmount?: number;
  charge: (palConnectId: string, paymentMethodId: string) => Promise<string>;
}): Promise<'completed' | 'incomplete'> {
  const writeRows = async (status: 'completed' | 'incomplete') => {
    // Commit the member debit and the pal credit atomically: a crash can never
    // leave a half-ledger (one side written without the other). Both rows share
    // one $transaction so the stated invariant — member debit and pal credit
    // happen together — holds even mid-write.
    //
    // Settlement watermark: when (and only when) the money is fully collected
    // (status 'completed'), we stamp favor.settledAt IN THE SAME $transaction as
    // the ledger rows. Stripe (live mode) runs BEFORE this, outside the tx, so by
    // the time we reach a 'completed' write both the DB write and the charge have
    // succeeded together. A completed favor left with settledAt=null is therefore
    // an unfinished settlement — the reconciliation job flags it (see reconcile.ts).
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.transaction.create({
        data: { userId: opts.memberId, favorId: opts.favorId, title: opts.memberTitle, amount: opts.memberAmount, status, kind: 'payment' },
      }),
    ];
    if (opts.palId && opts.palAmount != null) {
      writes.push(
        prisma.transaction.create({
          data: { userId: opts.palId, favorId: opts.favorId, title: opts.palTitle ?? opts.memberTitle, amount: opts.palAmount, status, kind: 'earning' },
        }),
      );
    }
    if (status === 'completed') {
      writes.push(
        prisma.favor.update({ where: { id: opts.favorId }, data: { settledAt: new Date() } }),
      );
    }
    await prisma.$transaction(writes);
  };

  if (!stripeEnabled()) {
    await writeRows('completed');
    return 'completed';
  }

  const [pal, card] = await Promise.all([
    opts.palId ? prisma.user.findUnique({ where: { id: opts.palId } }) : Promise.resolve(null),
    prisma.paymentMethod.findFirst({ where: { userId: opts.memberId }, orderBy: { isDefault: 'desc' } }),
  ]);
  if (pal?.stripeConnectId && card?.stripePmId) {
    try {
      const pi = await opts.charge(pal.stripeConnectId, card.stripePmId);
      await prisma.favor.update({ where: { id: opts.favorId }, data: { stripePaymentIntentId: pi } }).catch(() => undefined);
      await writeRows('completed');
      return 'completed';
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Stripe settle failed:', err);
      await writeRows('incomplete'); // not cashable until collected
      return 'incomplete';
    }
  }
  // Live but can't collect (member has no card, or pal hasn't onboarded payouts):
  // record uncollected so the pal earning is never cashable without real funds.
  await writeRows('incomplete');
  return 'incomplete';
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
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createSchema>;

    // A schedule must be a real near-term future moment: 2 minutes of grace for
    // client clock skew / submit latency, and a 90-day horizon so a fat-fingered
    // year can't park a favor into the far future.
    if (input.scheduledFor != null) {
      const now = Date.now();
      if (input.scheduledFor <= now - 2 * 60 * 1000) {
        throw badRequest('scheduledFor must be in the future');
      }
      if (input.scheduledFor > now + 90 * 24 * 60 * 60 * 1000) {
        throw badRequest('scheduledFor is too far out');
      }
    }

    // Server decides the base price: fixed tiers are authoritative; custom/
    // negotiate accept a client price but clamp it to a sane range. (Pure — no DB
    // — so it runs before the serialized active-request gate below.)
    let base: number;
    if (input.tier in FAVOR_TIERS) {
      base = FAVOR_TIERS[input.tier];
    } else {
      if (input.price == null) throw badRequest('price is required for custom/negotiate favors');
      base = Math.round(input.price * 100) / 100;
    }
    const { serviceFee, transactionFee, total } = computeFees(base);

    // One active request per member: the client UI has exactly one member-favor
    // slot, so a second concurrent request could never be tracked or cancelled.
    // (Also bounds the notification fan-out per member.) The count→create pair is
    // a TOCTOU: concurrent creates (double-tap, retry storm) each saw count 0 and
    // all inserted. Serialize per member with a Postgres advisory XACT lock so
    // the check and the insert are effectively atomic for a given member — the
    // lock is keyed on a stable bigint hash of the member id and auto-releases at
    // COMMIT/ROLLBACK. Different members take different keys, so this doesn't
    // serialize unrelated traffic.
    const favor = await prisma.$transaction(async (tx) => {
      // $executeRaw (not $queryRaw): pg_advisory_xact_lock returns void, which
      // $queryRaw can't deserialize. The lock releases at COMMIT/ROLLBACK.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${memberLockKey(req.user!.id)})`;
      const activeCount = await tx.favor.count({
        where: { memberId: req.user!.id, status: { in: ACTIVE_STATUSES } },
      });
      if (activeCount > 0) {
        throw conflict('Finish or cancel your current favor before requesting another.');
      }
      return tx.favor.create({
        data: {
          memberId: req.user!.id,
          tier: input.tier,
          price: base,
          // The listed price survives negotiation (which overwrites `price` at
          // match time) so abandon can restore what the member actually posted.
          listPrice: base,
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
    });
    // Tell the pals a favor just opened (durable row + push) — without this,
    // discovery is poll-only and an asynchronous tester never learns about it.
    void broadcastNewFavor(favor);
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
      // First name + member rating ride history rows so pal-side receipts can
      // name who the favor was for (no phone — that's for in-flight favors).
      include: { member: { select: { firstName: true, memberRating: true } } },
    });
    res.json({ favors: favors.map(publicFavor) });
  }),
);

// GET /api/favors/active — the caller's current in-flight favors, split by role.
// A user can simultaneously have an open request (as member) AND be fulfilling
// someone else's favor (as pal) — the two slots are independent. Each slot is
// LIVE-FIRST: a live job/request always outranks a stale pending_release favor
// (finished, waiting only on the member's release), regardless of createdAt —
// otherwise an unreleased favor could pin the slot and hide real work. `favor`
// is kept for older clients (≤ build 11) that expect a single favor; it prefers
// the pal-side favor (the physical job in flight).
favorRouter.get(
  '/active',
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const [liveMemberFavor, livePalFavor] = await Promise.all([
      prisma.favor.findFirst({
        where: { memberId: me, status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: 'desc' },
        include: participantInclude,
      }),
      prisma.favor.findFirst({
        where: { palId: me, status: { in: PAL_LIVE_STATUSES } },
        orderBy: { createdAt: 'desc' },
        include: participantInclude,
      }),
    ]);
    const [memberFavor, palFavor] = await Promise.all([
      liveMemberFavor ??
        prisma.favor.findFirst({
          where: { memberId: me, status: 'pending_release' },
          orderBy: { createdAt: 'desc' },
          include: participantInclude,
        }),
      livePalFavor ??
        prisma.favor.findFirst({
          where: { palId: me, status: 'pending_release' },
          orderBy: { createdAt: 'desc' },
          include: participantInclude,
        }),
    ]);
    const legacy = palFavor ?? memberFavor;
    res.json({
      favor: legacy ? publicFavor(legacy) : null,
      memberFavor: memberFavor ? publicFavor(memberFavor) : null,
      palFavor: palFavor ? publicFavor(palFavor) : null,
    });
  }),
);

// GET /api/favors/incoming — open favors a pal can accept (not their own, not
// from anyone they're blocked with).
favorRouter.get(
  '/incoming',
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const [meUser, blocks] = await Promise.all([
      prisma.user.findUnique({
        where: { id: me },
        select: { palHomeLat: true, palHomeLng: true, palRadiusMiles: true },
      }),
      prisma.block.findMany({
        where: { OR: [{ blockerId: me }, { blockedId: me }] },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const blockedMembers = new Set<string>();
    for (const b of blocks) {
      blockedMembers.add(b.blockerId === me ? b.blockedId : b.blockerId);
    }
    // A homed pal only sees favors within their radius; distance can't be done
    // in SQL (no haversine), so fetch a wider candidate set, filter in JS, then
    // cap. A home-less pal is unfiltered and sees everything (today's behavior),
    // so the candidate fetch is ordered newest-first and the cap keeps the same
    // 50 newest they saw before. Fine at current scale.
    const INCOMING_CAP = 50;
    const homed = meUser?.palHomeLat != null && meUser?.palHomeLng != null;
    const candidates = await prisma.favor.findMany({
      where: {
        status: 'requested',
        palId: null,
        memberId: { notIn: [me, ...blockedMembers] },
        // A favor this pal declined stays off their feed (but not others').
        declines: { none: { palId: me } },
      },
      orderBy: { createdAt: 'desc' },
      take: homed ? 200 : INCOMING_CAP,
      // First name + member rating ride the open feed so pals can judge the
      // requester (and tap through to their profile/reviews) before committing.
      include: { member: { select: { firstName: true, memberRating: true } } },
    });
    const visible = homed
      ? candidates.filter(
          (f) =>
            haversineMiles(meUser!.palHomeLat!, meUser!.palHomeLng!, f.locationLat, f.locationLng) <=
            meUser!.palRadiusMiles,
        )
      : candidates;
    // Coarse location only — exact address is revealed to the pal once matched.
    res.json({ favors: visible.slice(0, INCOMING_CAP).map(publicFavorOpen) });
  }),
);

const idParam = z.object({ id: z.string().uuid() });

// Write a pal's pending offer/request atomically. The naive read-check-then-
// upsert had a TOCTOU hole: the member's offer-accept transaction could commit
// between the route's status check and the upsert, whose unconditional update
// then flipped an already-accepted (or just-declined) row back to 'pending' on
// a matched favor. Here a CONDITIONAL touch of the favor row (still 'requested',
// no pal) shares one transaction with the upsert: the touch takes the row lock
// the accept transaction's favor claim must queue behind, so by commit time the
// favor was either still open (and a subsequent claim declines this pending row
// like any other) or the touch matched nothing and the whole write rolls back
// into a 409. A lock-order collision with a concurrent accept of THIS pal's own
// offer can deadlock in a ms window — Postgres aborts one side (P2034), mapped
// to the same 409 as losing the race outright.
async function upsertPendingOffer(favorId: string, palId: string, price: number) {
  try {
    return await prisma.$transaction(async (tx) => {
      const open = await tx.favor.updateMany({
        where: { id: favorId, status: 'requested', palId: null },
        data: { updatedAt: new Date() },
      });
      if (open.count === 0) throw conflict('This favor is no longer available');
      return tx.favorOffer.upsert({
        where: { favorId_palId: { favorId, palId } },
        create: { favorId, palId, price, lastBy: 'pal' },
        update: { price, lastBy: 'pal', status: 'pending' },
        include: { pal: true },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw conflict('This favor is no longer available');
    }
    throw err;
  }
}

// GET /api/favors/:id
favorRouter.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const favor = await getParticipantFavor(req.params.id, req.user!.id);
    res.json({ favor: publicFavor(favor) });
  }),
);

// POST /api/favors/:id/accept — a pal REQUESTS an open favor at its listed
// price. This no longer claims the favor: the member must approve the PERSON
// before any assignment, so the request lands as the pal's offer row at the
// current list price. The member reviews candidates (profile + reviews) on the
// Searching screen, and their ACCEPT — the atomic offer-accept below — is what
// actually matches the favor. Response carries the pending offer, not a favor.
favorRouter.post(
  '/:id/accept',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.memberId === me) throw forbidden('You cannot accept your own favor');
    if (favor.status !== 'requested' || favor.palId) throw conflict('This favor is no longer available');

    // Trust & safety gate: a pal must have passed identity/background vetting
    // before entering a member's home. Enforced server-side so a client can't
    // bypass it. (palVerified is set by POST /profile/verify-pal.)
    const meUser = await prisma.user.findUnique({ where: { id: me }, select: { palVerified: true, firstName: true } });
    if (!meUser?.palVerified) {
      throw forbidden('Complete pal verification (Driver Information) before accepting favors.');
    }
    // Blocked pairs can't match — the open feed filters them out, but a favor id
    // can arrive via a stale push/deep link, so the accept re-checks.
    const acceptBlocked = await prisma.block.findFirst({
      where: { OR: [{ blockerId: me, blockedId: favor.memberId }, { blockerId: favor.memberId, blockedId: me }] },
    });
    if (acceptBlocked) throw forbidden('This favor is not available to you');

    // One favor at a time: a pal already mid-favor can't request another (also
    // re-checked atomically inside the member's offer-accept).
    const activeAsPal = await prisma.favor.count({
      where: { palId: me, status: { in: ['matched', 'enroute', 'arrived', 'in_progress'] } },
    });
    if (activeAsPal > 0) throw conflict('Finish your active favor before accepting another');

    // A declined request doesn't silently reopen at the same number — but the
    // pal may still negotiate a different price via /offers.
    const existing = await prisma.favorOffer.findUnique({
      where: { favorId_palId: { favorId: favor.id, palId: me } },
    });
    if (existing?.status === 'declined' && existing.price === favor.price) {
      throw conflict('The member declined your request for this favor.');
    }
    const changed =
      !existing || existing.price !== favor.price || existing.status !== 'pending' || existing.lastBy !== 'pal';
    // List price is server-authoritative — the client can't pick the number.
    const offer = await upsertPendingOffer(favor.id, me, favor.price);
    if (changed) {
      await notify(
        favor.memberId,
        'offer',
        'A Favor Pal wants your favor',
        `${meUser.firstName ?? 'A Favor Pal'} wants to do your favor at the listed price. Review and approve them.`,
      );
    }
    res.json({ offer: publicOffer(offer), pending: true });
  }),
);

// ---------------------------------------------------------------------------
// Price negotiation. A verified pal puts a price on an open favor; the member
// accepts or counters; the pal accepts or counters back. Accepting the OTHER
// side's price matches the favor at that price (same race-safe claim gate as
// /accept). One offer row per (favor, pal) — counters update it in place.
// ---------------------------------------------------------------------------
const offerBody = z.object({ price: z.number().positive().max(100000) });
const offerParams = z.object({ id: z.string().uuid(), offerId: z.string().uuid() });

// POST /api/favors/:id/offers — a pal opens (or re-prices) their negotiation.
favorRouter.post(
  '/:id/offers',
  validate({ params: idParam, body: offerBody }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const price = Math.round((req.body as { price: number }).price * 100) / 100;
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.memberId === me) throw forbidden('You cannot make an offer on your own favor');
    if (favor.status !== 'requested' || favor.palId) throw conflict('This favor is no longer open');

    const meUser = await prisma.user.findUnique({ where: { id: me }, select: { palVerified: true, firstName: true } });
    if (!meUser?.palVerified) {
      throw forbidden('Complete pal verification (Driver Information) before making offers.');
    }
    // One favor at a time: a busy pal can't open new negotiations (mirrors
    // /accept; also re-checked atomically inside the member's offer-accept).
    const activeAsPal = await prisma.favor.count({
      where: { palId: me, status: { in: ['matched', 'enroute', 'arrived', 'in_progress'] } },
    });
    if (activeAsPal > 0) throw conflict('Finish your active favor before making another offer');
    const blocked = await prisma.block.findFirst({
      where: { OR: [{ blockerId: me, blockedId: favor.memberId }, { blockerId: favor.memberId, blockedId: me }] },
    });
    if (blocked) throw forbidden('Cannot make an offer on this favor');

    // A declined negotiation doesn't silently reopen at the same number — the
    // member said no to that price. A NEW price may reopen it (and notifies);
    // re-posting an unchanged pending offer is a no-op without a notification,
    // so hammering the endpoint can't spam the member.
    const existing = await prisma.favorOffer.findUnique({
      where: { favorId_palId: { favorId: favor.id, palId: me } },
    });
    if (existing?.status === 'declined' && existing.price === price) {
      throw conflict('This offer was declined — propose a different price.');
    }
    const changed = !existing || existing.price !== price || existing.status !== 'pending';

    const offer = await upsertPendingOffer(favor.id, me, price);
    if (changed) {
      await notify(
        favor.memberId,
        'offer',
        'New price offer',
        `${meUser.firstName ?? 'A Favor Pal'} offered $${price.toFixed(2)} for your favor.`,
      );
    }
    res.status(201).json({ offer: publicOffer(offer) });
  }),
);

// GET /api/favors/:id/offers — negotiation state. The member sees every pending
// offer; a pal sees only their own (any status, so they learn accept/decline).
favorRouter.get(
  '/:id/offers',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.memberId === me) {
      const offers = await prisma.favorOffer.findMany({
        where: { favorId: favor.id, status: 'pending' },
        include: { pal: true },
        orderBy: { updatedAt: 'desc' },
      });
      res.json({ offers: offers.map(publicOffer), favorStatus: favor.status });
      return;
    }
    const mine = await prisma.favorOffer.findFirst({ where: { favorId: favor.id, palId: me }, include: { pal: true } });
    if (!mine) throw notFound('No offer on this favor');
    // favorStatus lets the pal's poll learn the favor was taken by someone else.
    res.json({ offers: [publicOffer(mine)], favorStatus: favor.status });
  }),
);

// POST /api/favors/:id/offers/:offerId/counter — the other side names a new price.
favorRouter.post(
  '/:id/offers/:offerId/counter',
  validate({ params: offerParams, body: offerBody }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const price = Math.round((req.body as { price: number }).price * 100) / 100;
    const offer = await prisma.favorOffer.findUnique({ where: { id: req.params.offerId }, include: { favor: true } });
    if (!offer || offer.favorId !== req.params.id) throw notFound('Offer not found');
    const isMember = offer.favor.memberId === me;
    const isPal = offer.palId === me;
    if (!isMember && !isPal) throw forbidden('You are not part of this negotiation');
    if (offer.status !== 'pending') throw conflict('This offer is closed');
    if (offer.favor.status !== 'requested' || offer.favor.palId) throw conflict('This favor is no longer open');
    // A block created mid-negotiation kills it.
    const counterBlocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: offer.favor.memberId, blockedId: offer.palId },
          { blockerId: offer.palId, blockedId: offer.favor.memberId },
        ],
      },
    });
    if (counterBlocked) throw forbidden('This negotiation is no longer available');

    const updated = await prisma.favorOffer.update({
      where: { id: offer.id },
      data: { price, lastBy: isMember ? 'member' : 'pal' },
      include: { pal: true },
    });
    await notify(
      isMember ? offer.palId : offer.favor.memberId,
      'offer',
      'Price countered',
      `New counter offer on the favor: $${price.toFixed(2)}.`,
    );
    res.json({ offer: publicOffer(updated) });
  }),
);

// POST /api/favors/:id/offers/:offerId/accept — accept the OTHER side's price.
// The body echoes the price the client is agreeing to: the match is conditional
// on (status, lastBy, price) in ONE transaction with the favor claim, so a
// concurrent re-price/counter/withdraw can never book anyone at a number their
// screen didn't show, and a failed claim rolls the offer acceptance back.
favorRouter.post(
  '/:id/offers/:offerId/accept',
  validate({ params: offerParams, body: offerBody }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const agreedPrice = Math.round((req.body as { price: number }).price * 100) / 100;
    const offer = await prisma.favorOffer.findUnique({
      where: { id: req.params.offerId },
      include: { favor: true, pal: { select: { firstName: true, palVerified: true, suspended: true } } },
    });
    if (!offer || offer.favorId !== req.params.id) throw notFound('Offer not found');
    const isMember = offer.favor.memberId === me;
    const isPal = offer.palId === me;
    if (!isMember && !isPal) throw forbidden('You are not part of this negotiation');
    if (offer.status !== 'pending') throw conflict('This offer is closed');
    // You accept the number the OTHER side put on the table — never your own.
    const expectedLastBy = isMember ? 'pal' : 'member';
    if (offer.lastBy !== expectedLastBy) {
      throw conflict('Waiting on the other side — nothing to accept yet');
    }
    if (offer.price !== agreedPrice) {
      throw conflict('The price changed — review the latest offer');
    }
    if (!offer.pal?.palVerified || offer.pal.suspended) throw forbidden('This pal is not available');
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: offer.favor.memberId, blockedId: offer.palId },
          { blockerId: offer.palId, blockedId: offer.favor.memberId },
        ],
      },
    });
    if (blocked) throw forbidden('This negotiation is no longer available');

    // Match at the agreed price — fees are recomputed server-side so the invoice
    // and the pal payout always derive from the negotiated number. Everything
    // below is one transaction: the conditional offer acceptance IS the gate.
    const { serviceFee, transactionFee, total } = computeFees(agreedPrice);
    // This transaction locks the offer row AND (declining the losers) the other
    // offer rows on the same favor. Two concurrent accepts on ONE favor — a member
    // double-tapping two pal cards, or a pal and member accepting at the same
    // instant — grab those rows in opposite order and Postgres deadlocks one side
    // (40P01). runClaimTx turns that DB-level loss into the same 409 the loser
    // would get from the conditional gates, instead of a 500.
    await runClaimTx(() => prisma.$transaction(async (tx) => {
      const accepted = await tx.favorOffer.updateMany({
        where: { id: offer.id, status: 'pending', lastBy: expectedLastBy, price: agreedPrice },
        data: { status: 'accepted' },
      });
      if (accepted.count === 0) throw conflict('This offer changed — review the latest offer');

      // One favor at a time for the pal (mirrors /accept; checked inside the tx
      // to shrink the double-booking window).
      const activeAsPal = await tx.favor.count({
        where: { palId: offer.palId, status: { in: ['matched', 'enroute', 'arrived', 'in_progress'] } },
      });
      if (activeAsPal > 0) {
        throw conflict(isPal ? 'Finish your active favor before accepting another' : 'This pal just took another favor');
      }

      const claimed = await tx.favor.updateMany({
        where: { id: offer.favorId, status: 'requested', palId: null },
        data: { status: 'matched', palId: offer.palId, price: agreedPrice, serviceFee, transactionFee, total },
      });
      if (claimed.count === 0) throw conflict('This favor is no longer available');

      await tx.favorOffer.updateMany({
        where: { favorId: offer.favorId, status: 'pending', id: { not: offer.id } },
        data: { status: 'declined' },
      });
      await tx.favorEvent.create({ data: { favorId: offer.favorId, status: 'matched', actorId: me } });
    }), 'This favor is no longer available — review the latest offer');

    const agreed = `$${agreedPrice.toFixed(2)}`;
    if (isMember) {
      await notify(offer.palId, 'match', 'Offer accepted', `Your ${agreed} offer was accepted — you're booked!`);
    } else {
      await notify(
        offer.favor.memberId,
        'match',
        'Favor accepted',
        `${offer.pal?.firstName ?? 'Your Favor Pal'} accepted at ${agreed} and is on the way.`,
      );
    }
    const updated = await prisma.favor.findUniqueOrThrow({ where: { id: offer.favorId }, include: participantInclude });
    res.json({ favor: publicFavor(updated) });
  }),
);

// POST /api/favors/:id/offers/:offerId/decline — either side closes the negotiation.
favorRouter.post(
  '/:id/offers/:offerId/decline',
  validate({ params: offerParams }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const offer = await prisma.favorOffer.findUnique({ where: { id: req.params.offerId }, include: { favor: true } });
    if (!offer || offer.favorId !== req.params.id) throw notFound('Offer not found');
    const isMember = offer.favor.memberId === me;
    const isPal = offer.palId === me;
    if (!isMember && !isPal) throw forbidden('You are not part of this negotiation');
    if (offer.status === 'pending') {
      if (isPal && offer.lastBy === 'pal') {
        // The pal withdraws their own un-answered offer/request: delete the row
        // outright so a later re-request at the same (list) price isn't blocked
        // by the declined-at-this-price guard — that guard is for MEMBER "no"s.
        // A quiet withdrawal the member never acted on — no notification.
        await prisma.favorOffer.delete({ where: { id: offer.id } });
      } else {
        await prisma.favorOffer.update({ where: { id: offer.id }, data: { status: 'declined' } });
        await notify(
          isMember ? offer.palId : offer.favor.memberId,
          'offer',
          'Offer declined',
          'The price offer on the favor was declined.',
        );
      }
    }
    res.json({ ok: true });
  }),
);

// POST /api/favors/:id/decline — a pal dismisses an open favor from their feed.
// Persisted so the favor doesn't reappear on the next poll; idempotent.
favorRouter.post(
  '/:id/decline',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await prisma.favor.findUnique({
      where: { id: req.params.id },
      select: { id: true, memberId: true },
    });
    if (!favor) throw notFound('Favor not found');
    if (favor.memberId === me) throw forbidden('You cannot decline your own favor');
    await prisma.favorDecline.upsert({
      where: { favorId_palId: { favorId: favor.id, palId: me } },
      create: { favorId: favor.id, palId: me },
      update: {},
    });
    res.json({ ok: true });
  }),
);

// POST /api/favors/:id/abandon — the assigned pal steps back before completing.
// The favor returns to the open board (status 'requested', palId cleared) and the
// member is notified, so a pal cancelling never strands the member's request.
favorRouter.post(
  '/:id/abandon',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.palId !== me) throw forbidden('Only the assigned pal can release this favor');
    // Reopen at the LIST price (captured at create): a negotiated price was
    // agreed with THIS pal, so it must not follow the favor back onto the open
    // board — custom/negotiate favors also reopen at the member's listed price.
    const listFees = computeFees(favor.listPrice);
    const released = await prisma.favor.updateMany({
      where: { id: req.params.id, palId: me, status: { in: ['matched', 'enroute', 'arrived', 'in_progress'] } },
      data: {
        status: 'requested',
        palId: null,
        price: favor.listPrice,
        serviceFee: listFees.serviceFee,
        transactionFee: listFees.transactionFee,
        total: listFees.total,
        // The departing pal's last GPS fix must not ride the reopened favor onto
        // the open feed, nor masquerade as the next pal's live position.
        palLat: null,
        palLng: null,
        palLocationAt: null,
      },
    });
    // "released" now means the member releasing PAYMENT — this is about the pal
    // returning the JOB to the board, so the copy must not collide with that.
    if (released.count === 0) throw conflict('This favor can no longer be returned to the board');
    // Stale negotiations don't survive the reopen.
    await prisma.favorOffer.updateMany({
      where: { favorId: req.params.id, status: 'pending' },
      data: { status: 'declined' },
    });
    await prisma.favorEvent.create({ data: { favorId: req.params.id, status: 'requested', actorId: me } });
    await notify(favor.memberId, 'cancellation', 'Your Pal stepped back', 'Your Favor Pal had to release your favor — it is open again for another Pal.');
    res.json({ ok: true });
  }),
);

// POST /api/favors/:id/assign — a member books a specific pal.
favorRouter.post(
  '/:id/assign',
  validate({ params: idParam, body: z.object({ palId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { palId } = req.body as { palId: string };
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.memberId !== me) throw forbidden('Not your favor');
    if (favor.status !== 'requested' || favor.palId) throw conflict('Favor already matched');

    const pal = await prisma.user.findFirst({
      where: { id: palId, role: 'pal' },
      select: { palVerified: true, suspended: true },
    });
    if (!pal) throw badRequest('Invalid pal');
    // Same trust & availability gates as both accept paths: an unvetted or
    // suspended pal can't be booked, and a pal mid-favor can't be hijacked onto
    // a second job (which would strand one of the two in the client's one slot).
    if (!pal.palVerified || pal.suspended) throw forbidden('This pal is not available');
    const activeAsPal = await prisma.favor.count({
      where: { palId, status: { in: ['matched', 'enroute', 'arrived', 'in_progress'] } },
    });
    if (activeAsPal > 0) throw conflict('This pal is busy with another favor');
    const blocked = await prisma.block.findFirst({
      where: { OR: [{ blockerId: me, blockedId: palId }, { blockerId: palId, blockedId: me }] },
    });
    if (blocked) throw forbidden('Cannot book this pal');

    // Atomic claim — mirrors accept() so a concurrent accept/assign can't be
    // clobbered (the stale check above is only a fast-fail; this is the gate).
    // runClaimTx maps a DB deadlock against a concurrent accept to the same 409.
    const claimed = await runClaimTx(
      () => prisma.favor.updateMany({
        where: { id: req.params.id, memberId: me, status: 'requested', palId: null },
        data: { status: 'matched', palId },
      }),
      'Favor already matched',
    );
    if (claimed.count === 0) throw conflict('Favor already matched');

    await prisma.favorEvent.create({ data: { favorId: req.params.id, status: 'matched', actorId: me } });
    // Direct booking closes any open negotiations on this favor.
    await prisma.favorOffer.updateMany({
      where: { favorId: req.params.id, status: 'pending' },
      data: { status: 'declined' },
    });
    await notify(palId, 'match', 'You were booked', 'A member booked you for a favor.');
    // participantInclude so the matched favor lands with memberName/phones —
    // same shape every other match/advance response carries.
    const updated = await prisma.favor.findUniqueOrThrow({ where: { id: req.params.id }, include: participantInclude });
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

// POST /api/favors/:id/location — the assigned pal streams their live GPS so the
// member can watch them approach. Called frequently (every few seconds) while the
// favor is in flight, so it stays cheap: a single conditional update, no event row
// or notification. Only the assigned pal, and only before the favor is done.
const MOVING_STATUSES = ['matched', 'enroute', 'arrived', 'in_progress'];
favorRouter.post(
  '/:id/location',
  validate({
    params: idParam,
    body: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { lat, lng } = req.body as { lat: number; lng: number };
    // Conditional update gates on (assigned pal + still moving) in one write, so a
    // stale client can't post a location onto a completed/cancelled favor.
    const updated = await prisma.favor.updateMany({
      where: { id: req.params.id, palId: me, status: { in: MOVING_STATUSES } },
      data: { palLat: lat, palLng: lng, palLocationAt: new Date() },
    });
    if (updated.count === 0) {
      // Not the pal, or the favor is no longer live — tell the client to stop.
      throw conflict('Not sharing location for this favor');
    }
    res.json({ ok: true });
  }),
);

// POST /api/favors/:id/finish — the assigned pal marks the work DONE. The favor
// parks in 'pending_release': no money moves and the pal's favor count doesn't
// bump until the member explicitly releases the payment (POST /:id/release).
// Nothing happens automatically if they never do — support resolves that
// out-of-band, so there is deliberately no timer or auto-release here.
favorRouter.post(
  '/:id/finish',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await getParticipantFavor(req.params.id, me);
    if (favor.palId !== me) throw forbidden('Only the assigned pal can complete this favor');
    if (!['arrived', 'in_progress'].includes(favor.status)) {
      throw conflict('Favor is not in a completable state');
    }

    // Atomic state gate: only one concurrent /finish parks the favor.
    const updated = await runClaimTx(() => prisma.$transaction(async (tx) => {
      const done = await tx.favor.updateMany({
        where: { id: favor.id, palId: me, status: { in: ['arrived', 'in_progress'] } },
        // Clear the live GPS as the favor leaves the moving window — the member's
        // tracking is over at pending_release, so the pal's last fix shouldn't
        // linger on the row (the serializer already stops exposing it; this keeps
        // the data layer honest too).
        data: { status: 'pending_release', palLat: null, palLng: null, palLocationAt: null },
      });
      if (done.count === 0) throw conflict('Favor is not in a completable state');
      const f = await tx.favor.findUniqueOrThrow({ where: { id: favor.id }, include: memberInclude });
      await tx.favorEvent.create({ data: { favorId: favor.id, status: 'pending_release', actorId: me } });
      return f;
    }), 'Favor is not in a completable state');

    // Ask the member to release — this notification is the member's call to
    // action; the actual payout happens in /release.
    const meUser = await prisma.user.findUnique({ where: { id: me }, select: { firstName: true } });
    await notify(
      favor.memberId,
      'release_request',
      'Release the payment',
      `${meUser?.firstName ?? 'Your Favor Pal'} marked your favor as done. Review and release their payment.`,
    );
    res.json({ favor: publicFavor(updated), awaitingRelease: true });
  }),
);

// POST /api/favors/:id/release — the MEMBER releases the payment on a finished
// favor. This is the moment money moves: the member is charged the total and
// the pal credited their payout (settle), and only now does the pal's favor
// count bump. 403 for anyone but the member; 409 when the favor isn't awaiting
// release (including a double release — the atomic gate lets exactly one win).
favorRouter.post(
  '/:id/release',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await getParticipantFavor(req.params.id, me);
    if (favor.memberId !== me) throw forbidden('Only the member can release the payment');
    if (favor.status !== 'pending_release') throw conflict('This favor is not awaiting release');

    const { payout } = computePayout(favor.price);

    // Atomic state gate: only one concurrent /release completes the favor, so
    // the settle below can never double-charge or double-credit.
    const updated = await runClaimTx(() => prisma.$transaction(async (tx) => {
      const done = await tx.favor.updateMany({
        where: { id: favor.id, memberId: me, status: 'pending_release' },
        data: { status: 'completed' },
      });
      if (done.count === 0) throw conflict('This favor is not awaiting release');
      const f = await tx.favor.findUniqueOrThrow({ where: { id: favor.id }, include: memberInclude });
      await tx.favorEvent.create({ data: { favorId: favor.id, status: 'completed', actorId: me } });
      if (favor.palId) {
        await tx.user.update({ where: { id: favor.palId }, data: { totalFavors: { increment: 1 } } });
      }
      return f;
    }), 'This favor is not awaiting release');

    // Charge the member (total) and credit the pal (payout) — together, so the
    // pal's earning is only cashable when the member's money is collected. The
    // settle result rides the response so the client can be honest about whether
    // the earning is cashable yet ('completed') or still uncollected.
    const ledgerStatus = await settle({
      favorId: favor.id,
      memberId: me,
      palId: favor.palId,
      memberTitle: updated.description.slice(0, 80),
      memberAmount: updated.total,
      palAmount: payout,
      charge: (cid, pm) => chargeFavor({
        favorId: favor.id, memberId: me, palConnectId: cid,
        total: updated.total, base: updated.price, tip: 0, paymentMethodId: pm,
      }),
    });

    if (favor.palId) {
      await notify(
        favor.palId,
        'released',
        'Payment released',
        `${favor.member?.firstName ?? 'The member'} released your $${payout.toFixed(2)} payment.`,
      );
    }
    res.json({ favor: publicFavor(updated), payout, ledgerStatus });
  }),
);

// POST /api/favors/:id/rate-member — the pal rates the member after completion.
favorRouter.post(
  '/:id/rate-member',
  validate({ params: idParam, body: z.object({ rating: z.number().int().min(1).max(5), feedback: z.string().max(1000).default('') }) }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { rating, feedback } = req.body as { rating: number; feedback: string };
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.palId !== me) throw forbidden('Only the assigned pal can rate this favor');
    if (favor.status !== 'completed') throw conflict('Only completed favors can be rated');
    // Atomic single-rating gate (mirrors the member rate flow), then fold the
    // review into the member's aggregate so pals can see it before accepting.
    await prisma.$transaction(async (tx) => {
      const rated = await tx.favor.updateMany({
        where: { id: favor.id, palId: me, palRating: null },
        data: { palRating: rating, palFeedback: feedback },
      });
      if (rated.count === 0) throw conflict('Favor already rated');
      const agg = await tx.favor.aggregate({
        where: { memberId: favor.memberId, palRating: { not: null } },
        _avg: { palRating: true },
      });
      await tx.user.update({
        where: { id: favor.memberId },
        data: { memberRating: Math.round((agg._avg.palRating ?? rating) * 10) / 10 },
      });
    });
    res.json({ ok: true });
  }),
);

// POST /api/favors/:id/cancel — the member cancels; cancellation fee per policy.
favorRouter.post(
  '/:id/cancel',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const favor = await prisma.favor.findUnique({ where: { id: req.params.id } });
    if (!favor) throw notFound('Favor not found');
    if (favor.memberId !== me) throw forbidden('Not your favor');
    // A finished favor can't be cancelled out of paying — the work is done, so
    // the member's only move is to release (disputes go to support, off-app).
    if (favor.status === 'pending_release') {
      throw conflict('This favor is finished — release the payment, or contact support if something went wrong.');
    }
    if (!ACTIVE_STATUSES.includes(favor.status)) throw conflict('Favor cannot be cancelled');

    const cancellation = computeCancellation({ status: favor.status, price: favor.price, total: favor.total });

    // Atomic gate so a cancel can't race a finish (only one terminal write wins).
    const updated = await runClaimTx(() => prisma.$transaction(async (tx) => {
      const done = await tx.favor.updateMany({
        where: { id: favor.id, memberId: me, status: { in: ACTIVE_STATUSES } },
        // Clear any live GPS fix on the way to the terminal state (see finish).
        data: { status: 'cancelled', palLat: null, palLng: null, palLocationAt: null },
      });
      if (done.count === 0) {
        // The gate can lose a race to a concurrent /finish: re-read so a favor
        // that just became pending_release gets the specific guidance, not the
        // generic refusal.
        const now = await tx.favor.findUnique({ where: { id: favor.id }, select: { status: true } });
        if (now?.status === 'pending_release') {
          throw conflict('This favor is finished — release the payment, or contact support if something went wrong.');
        }
        throw conflict('Favor cannot be cancelled');
      }
      // participantInclude keeps this response the same shape as the other
      // lifecycle writes (phones stay omitted — 'cancelled' is non-contact).
      const f = await tx.favor.findUniqueOrThrow({ where: { id: favor.id }, include: participantInclude });
      await tx.favorEvent.create({ data: { favorId: favor.id, status: 'cancelled', actorId: me } });
      // A cancelled favor takes its open negotiations with it.
      await tx.favorOffer.updateMany({
        where: { favorId: favor.id, status: 'pending' },
        data: { status: 'declined' },
      });
      return f;
    }), 'Favor cannot be cancelled');

    // Charge the member the cancellation fee and compensate the committed pal —
    // together, so the pal's compensation is only cashable once actually collected.
    if (cancellation.fee > 0 && favor.palId) {
      await settle({
        favorId: favor.id,
        memberId: me,
        palId: favor.palId,
        memberTitle: `Cancellation fee: ${updated.description.slice(0, 60)}`,
        memberAmount: cancellation.fee,
        palTitle: `Cancellation compensation: ${updated.description.slice(0, 50)}`,
        palAmount: cancellation.fee,
        charge: (cid, pm) => chargeToPal({
          memberId: me, palConnectId: cid, amount: cancellation.fee, paymentMethodId: pm,
          idempotencyKey: `favor_cancel_${favor.id}`, metadata: { favorId: favor.id },
        }),
      });
    }

    // If this favor was already charged (pre-paid flow), refund the member their
    // total. Best-effort: a refund failure shouldn't block the cancellation — the
    // charge.refunded / dispute webhooks reconcile the ledger either way.
    if (stripeEnabled() && favor.stripePaymentIntentId) {
      await refundFavorCharge(favor.stripePaymentIntentId, { reason: 'requested_by_customer' }).catch((e) => {
        // eslint-disable-next-line no-console
        console.error('Refund on cancel failed for favor', favor.id, e);
      });
    }

    if (favor.palId) {
      await notify(favor.palId, 'cancellation', 'Favor cancelled', 'A favor you accepted was cancelled.');
    }
    res.json({ favor: publicFavor(updated), cancellation });
  }),
);

// POST /api/favors/:id/rate — the member rates a completed favor (+ optional tip).
favorRouter.post(
  '/:id/rate',
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
      }
      return f;
    });

    // Charge the member for the tip and credit the pal — together, so a tip is
    // never an unfunded cashable earning.
    if (tip && tip > 0 && favor.palId) {
      await settle({
        favorId: favor.id,
        memberId: me,
        palId: favor.palId,
        memberTitle: `Tip: ${updated.description.slice(0, 60)}`,
        memberAmount: tip,
        palAmount: tip,
        charge: (cid, pm) => chargeToPal({
          memberId: me, palConnectId: cid, amount: tip, paymentMethodId: pm,
          idempotencyKey: `favor_tip_${favor.id}`, metadata: { favorId: favor.id },
        }),
      });
    }
    res.json({ favor: publicFavor(updated) });
  }),
);
