// Domain model for My Favor. Shared by every feature module and the mock store.

export type Role = 'member' | 'pal';

export type UserStatus = 'online' | 'invisible' | 'offline';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatar?: string;
  bio?: string;
  city?: string;
  state?: string;
  zip?: string;
  homeAddress?: string;
  role: Role; // currently active role
  status: UserStatus;
  // Pal stats
  rating: number; // 0-5
  totalFavors: number;
  yearsActive: number;
  reliability: number; // 0-100
  positiveReviews: number; // 0-100
}

// Favor sizing tiers from the design.
export type FavorTier = 'tiny' | 'small' | 'big' | 'huge' | 'custom' | 'negotiate';

export const FAVOR_TIERS: Record<
  Exclude<FavorTier, 'custom' | 'negotiate'>,
  { label: string; price: number }
> = {
  tiny: { label: 'Tiny Favor', price: 20 },
  small: { label: 'Small Favor', price: 50 },
  big: { label: 'Big Favor', price: 100 },
  huge: { label: 'Huge Favor', price: 150 },
};

export type FavorStatus =
  | 'draft'
  | 'requested' // posted, searching for a pal
  | 'matched' // a pal accepted
  | 'enroute' // pal traveling
  | 'arrived' // pal at location
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_pal';

export interface GeoPoint {
  lat: number;
  lng: number;
  address: string;
}

export interface Favor {
  id: string;
  memberId: string;
  palId?: string;
  tier: FavorTier;
  price: number; // base price
  description: string;
  images: string[];
  location: GeoPoint;
  status: FavorStatus;
  createdAt: number;
  scheduledFor?: number; // ms epoch; undefined = NOW
  // negotiate
  hours?: number;
  // money
  serviceFee: number; // 2.9%
  transactionFee: number; // flat 0.30
  total: number;
  tip?: number;
  // review
  rating?: number;
  feedback?: string;
  // arrival window (display strings)
  etaWindow?: string;
}

export interface PaymentCard {
  id: string;
  brand: string; // visa / mastercard
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export type TransactionStatus =
  | 'completed'
  | 'in_progress'
  | 'cancelled'
  | 'declined'
  | 'incomplete'
  | 'deleted'
  | 'paid_out';

export interface Transaction {
  id: string;
  favorId: string;
  title: string;
  amount: number;
  status: TransactionStatus;
  date: number;
  kind: 'payment' | 'earning';
}

export interface Review {
  id: string;
  authorName: string;
  authorAvatar?: string;
  rating: number;
  comment: string;
  date: number;
}

export interface Message {
  id: string;
  threadId: string;
  fromMe: boolean;
  text: string;
  createdAt: number;
}

export interface Thread {
  id: string;
  withUser: { id: string; name: string; avatar?: string };
  lastMessage: string;
  unread: number;
  updatedAt: number;
}

export interface AppNotification {
  id: string;
  type: 'match' | 'cancellation' | 'no_pal' | 'arrived' | 'general';
  title: string;
  body: string;
  date: number;
  read: boolean;
}

// ---------------------------------------------------------------------------
// Money model — ONE source of truth so the member invoice, the pal payout and
// the earnings/transaction ledgers can never disagree.
//
//   Member pays:   base + serviceFee(2.9%) + transactionFee($0.30)   [computeFees]
//   Pal receives:  base - platform commission                         [computePayout]
//   Platform keeps: serviceFee + transactionFee + (base * commission)
// ---------------------------------------------------------------------------
export const SERVICE_FEE_RATE = 0.029;
export const TRANSACTION_FEE = 0.3;
// Take rate the pal pays on the base. Kept near category norms (15-25%) rather
// than the old implicit ~50% so pals aren't pushed into a decline/churn spiral.
export const PLATFORM_COMMISSION_RATE = 0.2;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeFees(base: number) {
  const serviceFee = round2(base * SERVICE_FEE_RATE);
  const transactionFee = TRANSACTION_FEE;
  const total = round2(base + serviceFee + transactionFee);
  return { serviceFee, transactionFee, total };
}

// What the pal actually earns from a favor (and what the platform keeps on it).
export function computePayout(base: number, tip = 0) {
  const commission = round2(base * PLATFORM_COMMISSION_RATE);
  const payout = round2(base - commission + tip);
  return { payout, commission, tip, base };
}

// Cancellation outcome, keyed off how far the favor has progressed. Before a pal
// is matched it's a full refund; once a pal is committed a fee protects them.
export function computeCancellation(favor: Pick<Favor, 'status' | 'price' | 'total'>) {
  const committed = (['matched', 'enroute', 'arrived', 'in_progress'] as FavorStatus[]).includes(favor.status);
  const inProgress = (['arrived', 'in_progress'] as FavorStatus[]).includes(favor.status);
  let fee = 0;
  if (inProgress) fee = round2(favor.price * 0.5);
  else if (committed) fee = Math.min(5, round2(favor.price * 0.2));
  const refund = round2(Math.max(0, favor.total - fee));
  return { fee, refund, committed };
}

// Member-facing progress timeline for an active favor.
export const MEMBER_STATUS_STEPS: { status: FavorStatus; label: string }[] = [
  { status: 'matched', label: 'Pal accepted' },
  { status: 'enroute', label: 'On the way' },
  { status: 'arrived', label: 'Arrived' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'completed', label: 'Completed' },
];

// Single source for the role-switch toggle copy (describes what tapping DOES),
// so Home and Profile can never drift to contradictory labels.
export function roleSwitchLabel(role: Role) {
  return role === 'pal' ? 'Switch to request a favor' : 'Switch to be a Favor Pal';
}
