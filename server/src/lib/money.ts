// Money model — the SERVER is the source of truth. The app has the same logic
// in src/types, but fees/payouts are always recomputed here from the base price
// so a tampered client request can never change what is charged or paid out.

export const SERVICE_FEE_RATE = 0.029;
export const TRANSACTION_FEE = 0.3;
export const PLATFORM_COMMISSION_RATE = 0.2;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeFees(base: number) {
  const serviceFee = round2(base * SERVICE_FEE_RATE);
  const transactionFee = TRANSACTION_FEE;
  const total = round2(base + serviceFee + transactionFee);
  return { serviceFee, transactionFee, total };
}

export function computePayout(base: number, tip = 0) {
  const commission = round2(base * PLATFORM_COMMISSION_RATE);
  const payout = round2(base - commission + tip);
  return { payout, commission, tip, base };
}

export function computeCancellation(favor: { status: string; price: number; total: number }) {
  const committed = ['matched', 'enroute', 'arrived', 'in_progress'].includes(favor.status);
  const inProgress = ['arrived', 'in_progress'].includes(favor.status);
  let fee = 0;
  if (inProgress) fee = round2(favor.price * 0.5);
  else if (committed) fee = Math.min(5, round2(favor.price * 0.2));
  const refund = round2(Math.max(0, favor.total - fee));
  return { fee, refund, committed };
}

// Canonical favor tiers + their base prices (server-authoritative).
export const FAVOR_TIERS: Record<string, number> = {
  tiny: 20,
  small: 50,
  big: 100,
  huge: 150,
};
