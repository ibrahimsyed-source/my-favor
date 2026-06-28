import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, notFound, badRequest } from '../lib/errors';
import { authenticate, requireRole } from '../middleware/authenticate';
import { publicCard, publicTransaction } from '../lib/serialize';
import { stripeEnabled, createSetupIntent, createSetupCheckout, syncCustomerCards, createConnectOnboardingLink, getConnectStatus, payoutToPal } from '../lib/stripe';

export const paymentRouter = Router();
paymentRouter.use(authenticate);

// GET /api/payments/cards
paymentRouter.get(
  '/cards',
  asyncHandler(async (req, res) => {
    const cards = await prisma.paymentMethod.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ cards: cards.map(publicCard) });
  }),
);

// POST /api/payments/cards — store a card reference. NOTE: we only ever accept
// the brand + last4 + expiry, never a full card number (PAN). With real Stripe
// wired, the app collects the card via Stripe's SDK and sends us the resulting
// PaymentMethod id; raw card data never touches this server (PCI scope).
const cardSchema = z.object({
  brand: z.string().trim().min(1).max(40),
  last4: z.string().regex(/^\d{4}$/),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2024).max(2100),
  stripePmId: z.string().max(255).optional(),
});
paymentRouter.post(
  '/cards',
  validate({ body: cardSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof cardSchema>;
    const count = await prisma.paymentMethod.count({ where: { userId: req.user!.id } });
    const card = await prisma.paymentMethod.create({
      data: { ...input, userId: req.user!.id, isDefault: count === 0 },
    });
    res.status(201).json({ card: publicCard(card) });
  }),
);

// DELETE /api/payments/cards/:id — owner only.
paymentRouter.delete(
  '/cards/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const result = await prisma.paymentMethod.deleteMany({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (result.count === 0) throw notFound('Card not found');
    res.json({ ok: true });
  }),
);

// GET /api/payments/transactions — the member-side ledger.
paymentRouter.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const txns = await prisma.transaction.findMany({
      where: { userId: req.user!.id, kind: 'payment' },
      orderBy: { date: 'desc' },
      take: 100,
    });
    res.json({ transactions: txns.map(publicTransaction) });
  }),
);

// GET /api/payments/earnings — the pal-side ledger.
paymentRouter.get(
  '/earnings',
  asyncHandler(async (req, res) => {
    const txns = await prisma.transaction.findMany({
      where: { userId: req.user!.id, kind: 'earning' },
      orderBy: { date: 'desc' },
      take: 100,
    });
    res.json({ earnings: txns.map(publicTransaction) });
  }),
);

// GET /api/payments/config — tells the app whether real payments are live, so it
// uses the hosted Stripe flow vs. the (dev) manual card form.
paymentRouter.get(
  '/config',
  asyncHandler(async (req, res) => {
    res.json({ stripeEnabled: stripeEnabled() });
  }),
);

// POST /api/payments/setup-intent — (member) SetupIntent client secret (for a
// native Stripe SDK flow, if you later add one). The app uses hosted checkout below.
paymentRouter.post(
  '/setup-intent',
  asyncHandler(async (req, res) => {
    if (!stripeEnabled()) throw badRequest('Payments are not enabled');
    const data = await createSetupIntent(req.user!.id);
    res.json(data);
  }),
);

// POST /api/payments/checkout/setup — (member) hosted card-setup URL. The app
// opens it; on return it calls /cards/sync to pull the saved card in.
const checkoutSchema = z.object({
  successUrl: z.string().url().max(500).default('myfavor://payment'),
  cancelUrl: z.string().url().max(500).default('myfavor://payment'),
});
paymentRouter.post(
  '/checkout/setup',
  validate({ body: checkoutSchema }),
  asyncHandler(async (req, res) => {
    if (!stripeEnabled()) throw badRequest('Payments are not enabled');
    const { successUrl, cancelUrl } = req.body as z.infer<typeof checkoutSchema>;
    const url = await createSetupCheckout(req.user!.id, successUrl, cancelUrl);
    res.json({ url });
  }),
);

// POST /api/payments/cards/sync — import the customer's Stripe cards into our table.
paymentRouter.post(
  '/cards/sync',
  asyncHandler(async (req, res) => {
    if (stripeEnabled()) await syncCustomerCards(req.user!.id);
    const cards = await prisma.paymentMethod.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ cards: cards.map(publicCard) });
  }),
);

// POST /api/payments/connect/onboard — (pal) get a Stripe Connect onboarding URL.
const onboardSchema = z.object({
  returnUrl: z.string().url().max(500).default('myfavor://payouts'),
  refreshUrl: z.string().url().max(500).default('myfavor://payouts'),
});
paymentRouter.post(
  '/connect/onboard',
  requireRole('pal'),
  validate({ body: onboardSchema }),
  asyncHandler(async (req, res) => {
    if (!stripeEnabled()) throw badRequest('Payouts are not enabled');
    const { returnUrl, refreshUrl } = req.body as z.infer<typeof onboardSchema>;
    const url = await createConnectOnboardingLink(req.user!.id, returnUrl, refreshUrl);
    res.json({ url });
  }),
);

// GET /api/payments/connect/status — (pal) is payout onboarding complete?
paymentRouter.get(
  '/connect/status',
  requireRole('pal'),
  asyncHandler(async (req, res) => {
    if (!stripeEnabled()) return res.json({ onboarded: false, payoutsEnabled: false, detailsSubmitted: false, enabled: false });
    const status = await getConnectStatus(req.user!.id);
    return res.json({ ...status, enabled: true });
  }),
);

// POST /api/payments/cashout — pay out the available earnings balance.
// Claims rows into a batch as 'processing' (so concurrent submits and the amount
// are computed from exactly the claimed rows), then attempts the payout. Rows
// become 'paid_out' ONLY after the payout succeeds; on any failure they revert to
// 'completed' so the balance is never stranded.
paymentRouter.post(
  '/cashout',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const batch = crypto.randomUUID();

    const claim = await prisma.$transaction(async (tx) => {
      const claimed = await tx.transaction.updateMany({
        where: { userId, kind: 'earning', status: 'completed' },
        data: { status: 'processing', payoutBatch: batch },
      });
      if (claimed.count === 0) return { amount: 0, count: 0 };
      const rows = await tx.transaction.findMany({ where: { payoutBatch: batch }, select: { amount: true } });
      const amount = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
      return { amount, count: claimed.count };
    });
    if (claim.amount <= 0) throw badRequest('No funds available to cash out');

    const finalize = (status: 'paid_out' | 'completed') =>
      prisma.transaction.updateMany({
        where: { payoutBatch: batch },
        data: status === 'completed' ? { status: 'completed', payoutBatch: null } : { status: 'paid_out' },
      });

    // Mock mode: no real payout, settle instantly.
    if (!stripeEnabled()) {
      await finalize('paid_out');
      return res.json({ ok: true, amount: claim.amount, count: claim.count });
    }

    // Live mode: require a Connect account; never consume the balance otherwise.
    const pal = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!pal.stripeConnectId) {
      await finalize('completed');
      throw badRequest('Set up payouts before cashing out');
    }
    try {
      await payoutToPal(pal.stripeConnectId, claim.amount, `cashout_${batch}`, { batch });
      await finalize('paid_out');
      return res.json({ ok: true, amount: claim.amount, count: claim.count });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Stripe payout failed — reverting earnings to available:', err);
      await finalize('completed');
      throw badRequest('Payout could not be completed — your balance is unchanged. Please try again.');
    }
  }),
);
