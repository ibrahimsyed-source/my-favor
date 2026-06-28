import type { User, Favor, Transaction, Notification, Thread, Message, PaymentMethod } from '@prisma/client';

// Presenters map DB rows to API responses. They are the single place that
// decides what leaves the server — most importantly they DROP passwordHash and
// other internal fields so secrets can never be serialized to a client by
// accident.

export function publicUser(u: User) {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    avatar: u.avatar ?? undefined,
    bio: u.bio ?? undefined,
    city: u.city ?? undefined,
    state: u.state ?? undefined,
    zip: u.zip ?? undefined,
    homeAddress: u.homeAddress ?? undefined,
    role: u.role,
    status: u.status,
    rating: u.rating,
    totalFavors: u.totalFavors,
    yearsActive: u.yearsActive,
    reliability: u.reliability,
    positiveReviews: u.positiveReviews,
  };
}

// A pal viewed by a member — same as publicUser but without contact details
// the member shouldn't see until matched. Kept conservative.
export function publicPal(u: User) {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    avatar: u.avatar ?? undefined,
    bio: u.bio ?? undefined,
    city: u.city ?? undefined,
    state: u.state ?? undefined,
    role: u.role,
    status: u.status,
    rating: u.rating,
    totalFavors: u.totalFavors,
    yearsActive: u.yearsActive,
    reliability: u.reliability,
    positiveReviews: u.positiveReviews,
  };
}

function parseImages(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Accepts an optionally-included `member` relation; when present (participant-
// facing queries) the assigned pal sees the member's first name. The open feed
// (publicFavorOpen) never includes the relation, so it stays anonymous.
export function publicFavor(f: Favor & { member?: { firstName: string } | null }) {
  return {
    id: f.id,
    memberId: f.memberId,
    memberName: f.member?.firstName ?? undefined,
    palId: f.palId ?? undefined,
    tier: f.tier,
    price: f.price,
    description: f.description,
    images: parseImages(f.images),
    location: { lat: f.locationLat, lng: f.locationLng, address: f.locationAddress },
    status: f.status,
    createdAt: f.createdAt.getTime(),
    scheduledFor: f.scheduledFor ? f.scheduledFor.getTime() : undefined,
    hours: f.hours ?? undefined,
    serviceFee: f.serviceFee,
    transactionFee: f.transactionFee,
    total: f.total,
    tip: f.tip ?? undefined,
    rating: f.rating ?? undefined,
    feedback: f.feedback ?? undefined,
    etaWindow: f.etaWindow ?? undefined,
  };
}

// A favor as shown in the OPEN feed to not-yet-matched pals. Location is
// deliberately coarsened (rounded coordinates + area only, no street line) so
// browsing the feed can't harvest members' exact home addresses / GPS. The
// assigned pal gets full precision via GET /favors/:id after matching.
export function publicFavorOpen(f: Favor) {
  const full = publicFavor(f);
  const parts = f.locationAddress.split(',').map((s) => s.trim()).filter(Boolean);
  const area = parts.length > 1 ? parts.slice(1).join(', ') : 'Approximate area';
  return {
    ...full,
    location: {
      // ~2 decimal places ≈ 1.1km of fuzzing — enough to gauge distance, not to locate a home.
      lat: Math.round(f.locationLat * 100) / 100,
      lng: Math.round(f.locationLng * 100) / 100,
      address: area,
    },
  };
}

export function publicTransaction(t: Transaction) {
  return {
    id: t.id,
    favorId: t.favorId,
    title: t.title,
    amount: t.amount,
    status: t.status,
    date: t.date.getTime(),
    kind: t.kind,
  };
}

export function publicNotification(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    date: n.createdAt.getTime(),
    read: n.read,
  };
}

export function publicCard(c: PaymentMethod) {
  return {
    id: c.id,
    brand: c.brand,
    last4: c.last4,
    expMonth: c.expMonth,
    expYear: c.expYear,
    isDefault: c.isDefault,
  };
}

// A thread presented from the perspective of `viewerId`: shows the *other*
// participant and that viewer's unread count.
export function publicThread(
  t: Thread & { userA: User; userB: User },
  viewerId: string,
) {
  const other = t.userAId === viewerId ? t.userB : t.userA;
  const unread = t.userAId === viewerId ? t.unreadForA : t.unreadForB;
  return {
    id: t.id,
    withUser: { id: other.id, name: `${other.firstName} ${other.lastName}`.trim(), avatar: other.avatar ?? undefined },
    lastMessage: t.lastMessage,
    unread,
    updatedAt: t.updatedAt.getTime(),
  };
}

export function publicMessage(m: Message, viewerId: string) {
  return {
    id: m.id,
    threadId: m.threadId,
    fromMe: m.senderId === viewerId,
    text: m.text,
    createdAt: m.createdAt.getTime(),
  };
}
