import { Router, raw } from 'express';
import type Stripe from 'stripe';
import { config } from '../config';
import { stripe } from '../lib/stripe';
import { prisma } from '../db';

// Stripe webhook. Mounted with a RAW body parser (not JSON) because signature
// verification must run against the exact bytes Stripe sent. Without a webhook
// secret configured we run in mock mode and accept nothing destructive.
export const stripeRouter = Router();

// In-memory log of Stripe event IDs we've already fully processed. Stripe delivers
// events at-least-once and can re-deliver/reorder them, so we must no-op on duplicates
// to avoid re-running side effects (e.g. downgrading an already-collected earning).
// NOTE: this Set is per-process — it is lost on restart and not shared across instances.
// The production-grade version persists processed event IDs in a ProcessedWebhookEvent
// table (unique on eventId), written in the same DB transaction as the handler's rows;
// that needs a new table + migration, which is out of scope here.
const processedEventIds = new Set<string>();
const MAX_PROCESSED_EVENTS = 5000;
function markEventProcessed(eventId: string) {
  processedEventIds.add(eventId);
  // Bound memory: Stripe stops retrying after ~3 days, so a recent window is enough.
  if (processedEventIds.size > MAX_PROCESSED_EVENTS) {
    const oldest = processedEventIds.values().next().value; // Set preserves insertion order
    if (oldest !== undefined) processedEventIds.delete(oldest);
  }
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
  // re-running any side effects. (See processedEventIds above.)
  if (processedEventIds.has(event.id)) {
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
      case 'payout.paid':
      case 'account.updated':
        // Confirmation / onboarding progress — reflected by live status reads.
        break;
      default:
        break;
    }
    // Only record the event as processed AFTER its side effects succeeded, so a thrown
    // handler (below) leaves it un-recorded and Stripe's retry can re-process it safely.
    markEventProcessed(event.id);
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
