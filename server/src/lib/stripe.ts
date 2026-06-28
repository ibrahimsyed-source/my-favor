import Stripe from 'stripe';
import { config } from '../config';
import { prisma } from '../db';
import { computePayout } from './money';

// Central Stripe client. Null when no key is configured — every caller checks
// `stripeEnabled()` and falls back to the mock ledger so the app runs without keys.
export const stripe = config.stripe.enabled ? new Stripe(config.stripe.secretKey) : null;
export const stripeEnabled = () => stripe !== null;

const cents = (dollars: number) => Math.round(dollars * 100);

// --- Customer (member, for charging saved cards) ---------------------------
export async function getOrCreateCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe!.customers.create({
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
    metadata: { userId },
  });
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

// --- Connect (pal, for receiving payouts) ----------------------------------
export async function getOrCreateConnectAccount(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeConnectId) return user.stripeConnectId;
  const account = await stripe!.accounts.create({
    type: 'express',
    email: user.email,
    business_type: 'individual',
    capabilities: { transfers: { requested: true } },
    metadata: { userId },
  });
  await prisma.user.update({ where: { id: userId }, data: { stripeConnectId: account.id } });
  return account.id;
}

// Hosted onboarding link the pal completes to enable payouts.
export async function createConnectOnboardingLink(userId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  const accountId = await getOrCreateConnectAccount(userId);
  const link = await stripe!.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return link.url;
}

export async function getConnectStatus(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.stripeConnectId) return { onboarded: false, payoutsEnabled: false, detailsSubmitted: false };
  const acct = await stripe!.accounts.retrieve(user.stripeConnectId);
  return {
    onboarded: !!acct.details_submitted,
    payoutsEnabled: !!acct.payouts_enabled,
    detailsSubmitted: !!acct.details_submitted,
  };
}

// --- Saving a card ---------------------------------------------------------
// Returns a SetupIntent client secret; the app's Stripe SDK collects the card
// and confirms it, attaching the resulting PaymentMethod to the customer.
export async function createSetupIntent(userId: string) {
  const customerId = await getOrCreateCustomer(userId);
  const si = await stripe!.setupIntents.create({ customer: customerId, usage: 'off_session' });
  return { clientSecret: si.client_secret, customerId };
}

// Hosted card-setup via Stripe Checkout (setup mode). The app opens the returned
// URL in a browser, the user enters their card on Stripe's PCI-compliant page,
// and the PaymentMethod is saved to the customer — no native Stripe SDK needed.
export async function createSetupCheckout(userId: string, successUrl: string, cancelUrl: string): Promise<string> {
  const customerId = await getOrCreateCustomer(userId);
  const session = await stripe!.checkout.sessions.create({
    mode: 'setup',
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return session.url ?? successUrl;
}

// Pull the customer's saved cards from Stripe into our table (called after the
// user returns from the hosted setup page).
export async function syncCustomerCards(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.stripeCustomerId) return;
  const pms = await stripe!.paymentMethods.list({ customer: user.stripeCustomerId, type: 'card' });
  for (const pm of pms.data) {
    if (!pm.card) continue;
    const existing = await prisma.paymentMethod.findFirst({ where: { userId, stripePmId: pm.id } });
    if (existing) continue;
    const count = await prisma.paymentMethod.count({ where: { userId } });
    await prisma.paymentMethod.create({
      data: {
        userId, stripePmId: pm.id, brand: pm.card.brand, last4: pm.card.last4 ?? '0000',
        expMonth: pm.card.exp_month ?? 1, expYear: pm.card.exp_year ?? 2030, isDefault: count === 0,
      },
    });
  }
}

// --- Charging a favor (destination charge) ---------------------------------
// Charges the member's saved card for the total and routes the pal's payout to
// their connected account, the platform keeping fees + commission as the
// application fee. Idempotent per favor. Throws on missing prerequisites.
export async function chargeFavor(args: {
  favorId: string;
  memberId: string;
  palConnectId: string;
  total: number;
  base: number;
  tip: number;
  paymentMethodId: string;
}): Promise<string> {
  const customerId = await getOrCreateCustomer(args.memberId);
  const { payout } = computePayout(args.base, args.tip);
  const applicationFee = Math.max(0, cents(args.total) - cents(payout));
  const pi = await stripe!.paymentIntents.create(
    {
      amount: cents(args.total),
      currency: 'usd',
      customer: customerId,
      payment_method: args.paymentMethodId,
      off_session: true,
      confirm: true,
      application_fee_amount: applicationFee,
      transfer_data: { destination: args.palConnectId },
      metadata: { favorId: args.favorId },
    },
    { idempotencyKey: `favor_charge_${args.favorId}` },
  );
  return pi.id;
}

// --- Cashing out (instant payout from the pal's connected account) ----------
export async function payoutToPal(connectId: string, amount: number, idempotencyKey: string): Promise<string> {
  const payout = await stripe!.payouts.create(
    { amount: cents(amount), currency: 'usd' },
    { stripeAccount: connectId, idempotencyKey },
  );
  return payout.id;
}
