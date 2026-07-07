import { Router, raw } from 'express';
import type Stripe from 'stripe';
import { config } from '../config';
import { stripe } from '../lib/stripe';
import { prisma } from '../db';

// Stripe webhook. Mounted with a RAW body parser (not JSON) because signature
// verification must run against the exact bytes Stripe sent. Without a webhook
// secret configured we run in mock mode and accept nothing destructive.
export const stripeRouter = Router();

// Stripe delivers events at-least-once and can re-deliver/reorder them, so we
// must no-op on duplicates to avoid re-running side effects (e.g. downgrading an
// already-collected earning). Dedupe is PERSISTED in the ProcessedWebhookEvent
// table (unique on the Stripe event id) so it survives restarts and is shared
// across instances — unlike the old per-process in-memory Set.
async function alreadyProcessed(eventId: string): Promise<boolean> {
  return (await prisma.processedWebhookEvent.findUnique({ where: { id: eventId } })) !== null;
}
async function markEventProcessed(eventId: string, type: string) {
  // A concurrent delivery may have inserted first; treat a unique-collision as
  // "already recorded" rather than an error.
  await prisma.processedWebhookEvent.create({ data: { id: eventId, type } }).catch(() => undefined);
}

// Resolve the favor tied to a charge/dispute/refund event via the PaymentIntent.
async function favorIdForPaymentIntent(pi: string | null | undefined): Promise<string | null> {
  if (!pi) return null;
  const favor = await prisma.favor.findFirst({ where: { stripePaymentIntentId: pi }, select: { id: true, memberId: true } });
  return favor?.id ?? null;
}

stripeRouter.post('/webhook', raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !config.stripe.webhookSecret) {
    // Mock mode: acknowledge but do nothing. Real keys enable verification below.
    return res.json({ received: true, mock: true });
  }

  const signature = req.header('stripe-signature');
  if (!signature) return res.status(400).json({ error: { code: 'bad_request', message: 'Missing signature' } });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, config.stripe.webhookSecret);
  } catch {
    // Signature failed — reject. Never trust an unverified webhook body.
    return res.status(400).json({ error: { code: 'invalid_signature', message: 'Signature verification failed' } });
  }

  // Idempotency guard: if we've already fully processed this event id, ack without
  // re-running any side effects. (Persisted — see alreadyProcessed above.)
  if (await alreadyProcessed(event.id)) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        // Charge confirmed — promote the favor's (member payment + pal earning)
        // rows to cashable if they were left pending after a synchronous hiccup.
        const pi = event.data.object as Stripe.PaymentIntent;
        const favorId = pi.metadata?.favorId;
        if (favorId) {
          await prisma.transaction.updateMany({
            where: { favorId, status: 'incomplete' },
            data: { status: 'completed' },
          });
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        // Charge failed — mark the favor's still-pending ledger rows uncollected so the
        // pal earning is not cashable without real funds. Only touch rows that are still
        // 'completed' (available): never 'processing'/'paid_out' rows, which belong to an
        // in-flight or settled cashout and must not be silently un-collected.
        const pi = event.data.object as Stripe.PaymentIntent;
        const favorId = pi.metadata?.favorId;
        if (favorId) {
          // Reconcile against the PaymentIntent's live status: Stripe can re-deliver or
          // reorder events, so a stale 'payment_failed' may arrive after a later success.
          // Re-fetch and only downgrade if the charge is genuinely not succeeded.
          const current = await stripe.paymentIntents.retrieve(pi.id);
          if (current.status !== 'succeeded') {
            await prisma.transaction.updateMany({
              where: { favorId, status: 'completed' },
              data: { status: 'incomplete' },
            });
          }
        }
        break;
      }
      case 'payout.failed': {
        // A cash-out payout failed asynchronously — return the batch's earnings to
        // 'available' so the pal can cash out again. (Sync failures already revert.)
        const payout = event.data.object as Stripe.Payout;
        const batch = payout.metadata?.batch;
        if (batch) {
          await prisma.transaction.updateMany({
            where: { payoutBatch: batch },
            data: { status: 'completed', payoutBatch: null },
          });
        }
        break;
      }
      case 'charge.refunded': {
        // The member's charge was refunded (via a cancellation refund or a manual
        // refund). Mark their payment cancelled and reverse the pal's earning if it
        // hasn't already been cashed out (never touch processing/paid_out rows).
        const charge = event.data.object as Stripe.Charge;
        const favorId = await favorIdForPaymentIntent(
          typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id,
        );
        if (favorId) {
          await prisma.transaction.updateMany({ where: { favorId, kind: 'payment' }, data: { status: 'cancelled' } });
          await prisma.transaction.updateMany({ where: { favorId, kind: 'earning', status: 'completed' }, data: { status: 'cancelled' } });
        }
        break;
      }
      case 'charge.dispute.created': {
        // The member opened a chargeback. Flag the favor's ledger rows and notify
        // the pal; funds are held by Stripe pending resolution.
        const dispute = event.data.object as Stripe.Dispute;
        const favor = await prisma.favor.findFirst({
          where: { stripePaymentIntentId: typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id },
          select: { id: true, palId: true },
        });
        if (favor) {
          await prisma.transaction.updateMany({ where: { favorId: favor.id, status: 'completed' }, data: { status: 'incomplete' } });
          if (favor.palId) {
            await prisma.notification.create({
              data: { userId: favor.palId, type: 'general', title: 'Payment disputed', body: 'A member disputed a favor payment. Earnings are on hold pending review.' },
            });
          }
        }
        break;
      }
      case 'payout.paid':
      case 'account.updated':
        // Confirmation / onboarding progress — reflected by live status reads.
        break;
      default:
        break;
    }
    // Only record the event as processed AFTER its side effects succeeded, so a thrown
    // handler (below) leaves it un-recorded and Stripe's retry can re-process it safely.
    await markEventProcessed(event.id, event.type);
  } catch (err) {
    // A handler threw (e.g. a transient DB outage while promoting rows). Respond 500 so
    // Stripe retries with its own backoff instead of treating the event as acknowledged
    // and dropping it forever. The idempotency guard + post-success recording above make
    // those retries safe (a genuinely-processed event is never re-run).
    // eslint-disable-next-line no-console
    console.error('Stripe webhook handler error:', err);
    return res.status(500).json({ error: { code: 'handler_error', message: 'Webhook processing failed; will retry' } });
  }

  return res.json({ received: true });
});
