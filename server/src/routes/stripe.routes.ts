import { Router, raw } from 'express';
import Stripe from 'stripe';
import { config } from '../config';

// Stripe webhook. Mounted with a RAW body parser (not JSON) because signature
// verification must run against the exact bytes Stripe sent. Without a webhook
// secret configured we run in mock mode and accept nothing destructive.
export const stripeRouter = Router();

const stripe = config.stripe.enabled ? new Stripe(config.stripe.secretKey) : null;

stripeRouter.post('/webhook', raw({ type: 'application/json' }), (req, res) => {
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

  // Handle the events you care about (payment success/failure, payouts, etc.).
  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
    case 'account.updated':
      // TODO: reconcile transactions / Connect onboarding status here.
      break;
    default:
      break;
  }
  return res.json({ received: true });
});
