import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, notFound, badRequest } from '../lib/errors';
import { authenticate } from '../middleware/authenticate';
import { publicCard, publicTransaction } from '../lib/serialize';

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

// POST /api/payments/cashout — pay out the available (completed, not-yet-paid)
// earnings balance. STUB: with real Stripe wired this triggers a Connect payout;
// here we just mark the earnings paid out and report the amount. Done atomically.
paymentRouter.post(
  '/cashout',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const result = await prisma.$transaction(async (tx) => {
      const available = await tx.transaction.findMany({
        where: { userId, kind: 'earning', status: 'completed' },
        select: { id: true, amount: true },
      });
      const amount = Math.round(available.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;
      if (amount <= 0) return { amount: 0, count: 0 };
      await tx.transaction.updateMany({
        where: { id: { in: available.map((t) => t.id) } },
        data: { status: 'paid_out' },
      });
      return { amount, count: available.length };
    });
    if (result.amount <= 0) throw badRequest('No funds available to cash out');
    res.json({ ok: true, ...result });
  }),
);
