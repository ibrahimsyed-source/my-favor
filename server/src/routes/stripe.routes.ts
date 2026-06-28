import { Router, raw } from 'express';
import type Stripe from 'stripe';
import { config } from '../config';
import { stripe } from '../lib/stripe';
import { prisma } from '../db';

// Stripe webhook. Mounted with a RAW body parser (not JSON) because signature
// verification must run against the exact bytes Stripe sent. Without a webhook
// secret configured we run in mock mode and accept nothing destructive.
export const stripeRouter = Router();

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

  try {
    switch (event.type) {
      case 'payment_intent.payment_failed': {
        // A favor charge failed (e.g. card declined). Flag it for follow-up.
        const pi = event.data.object as Stripe.PaymentIntent;
        const favorId = pi.metadata?.favorId;
        if (favorId) {
          await prisma.transaction.updateMany({
            where: { favorId, kind: 'payment' },
            data: { status: 'incomplete' },
          });
        }
        break;
      }
      case 'account.updated': {
        // Connect onboarding progressed; payouts_enabled is now reflected by the
        // live GET /connect/status, so nothing to persist — left as a hook.
        break;
      }
      case 'payment_intent.succeeded':
      default:
        break;
    }
  } catch (err) {
    // Don't 500 to Stripe on a handler hiccup; log and ack so it isn't retried forever.
    // eslint-disable-next-line no-console
    console.error('Stripe webhook handler error:', err);
  }

  return res.json({ received: true });
});
