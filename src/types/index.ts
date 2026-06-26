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
  | 'deleted';

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

// Fee helpers (kept here so member + pal sides agree on the math).
export const SERVICE_FEE_RATE = 0.029;
export const TRANSACTION_FEE = 0.3;

export function computeFees(base: number) {
  const serviceFee = Math.round(base * SERVICE_FEE_RATE * 100) / 100;
  const transactionFee = TRANSACTION_FEE;
  const total = Math.round((base + serviceFee + transactionFee) * 100) / 100;
  return { serviceFee, transactionFee, total };
}
