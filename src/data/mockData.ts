import {
  User,
  Favor,
  PaymentCard,
  Transaction,
  Review,
  Thread,
  Message,
  AppNotification,
} from '../types';

// Stable timestamps (Date.now is avoided so behavior is deterministic in dev).
const NOW = 1717000000000;
const DAY = 86400000;

export const currentUser: User = {
  id: 'u_me',
  firstName: 'Anton',
  lastName: 'Vanko',
  email: 'antonvanko@email.com',
  phone: '+1 305 000 0000',
  avatar: 'https://i.pravatar.cc/150?img=12',
  bio: 'Friendly neighbor, happy to help with errands and small tasks around town.',
  city: 'Miami',
  state: 'FL',
  zip: '33101',
  homeAddress: '2099 Woodvine Rd, Lorman, MS',
  role: 'member',
  status: 'offline',
  rating: 4.9,
  totalFavors: 129,
  yearsActive: 2.5,
  reliability: 92,
  positiveReviews: 100,
};

export const nearbyPals: User[] = [
  {
    id: 'u_fab', firstName: 'Fabrizio', lastName: 'L.', email: 'fab@email.com', phone: '+1 305 111 2222',
    avatar: 'https://i.pravatar.cc/150?img=33', bio: 'How can I help? Experienced with repairing doors, assembling furniture, and pickups.',
    role: 'pal', status: 'online', rating: 4.9, totalFavors: 210, yearsActive: 3, reliability: 92, positiveReviews: 100,
  },
  {
    id: 'u_john', firstName: 'John', lastName: 'D.', email: 'john@email.com', phone: '+1 305 222 3333',
    avatar: 'https://i.pravatar.cc/150?img=15', bio: 'Quick and reliable. Groceries, deliveries, dog walking.',
    role: 'pal', status: 'online', rating: 4.5, totalFavors: 88, yearsActive: 1.5, reliability: 88, positiveReviews: 96,
  },
  {
    id: 'u_may', firstName: 'May', lastName: 'S.', email: 'may@email.com', phone: '+1 305 333 4444',
    avatar: 'https://i.pravatar.cc/150?img=20', bio: 'Detail oriented, love helping out.',
    role: 'pal', status: 'online', rating: 4.7, totalFavors: 142, yearsActive: 2, reliability: 90, positiveReviews: 98,
  },
  {
    id: 'u_love', firstName: 'Love', lastName: 'E.', email: 'love@email.com', phone: '+1 305 444 5555',
    avatar: 'https://i.pravatar.cc/150?img=45', bio: 'Errands, pickups and more.',
    role: 'pal', status: 'online', rating: 4.3, totalFavors: 54, yearsActive: 1, reliability: 85, positiveReviews: 92,
  },
];

export const reviews: Review[] = [
  { id: 'r1', authorName: 'Karen U.', authorAvatar: 'https://i.pravatar.cc/150?img=5', rating: 5, comment: 'Super helpful and on time. Highly recommend!', date: NOW - 4 * DAY },
  { id: 'r2', authorName: 'Mike B.', authorAvatar: 'https://i.pravatar.cc/150?img=8', rating: 5, comment: 'Fixed my door in 20 minutes. Great work.', date: NOW - 10 * DAY },
  { id: 'r3', authorName: 'Maureen G.', authorAvatar: 'https://i.pravatar.cc/150?img=9', rating: 4, comment: 'Friendly and got the job done.', date: NOW - 21 * DAY },
];

export const favorsSeed: Favor[] = [
  {
    id: 'f_incoming', memberId: 'u_steph', palId: undefined, tier: 'tiny', price: 20,
    description: 'Pick up package from Amazon Hub Lockers and drop at my door.',
    images: [], location: { lat: 25.77, lng: -80.19, address: 'Amazon Hub Locker, 2nd St' },
    status: 'requested', createdAt: NOW - 3600000, scheduledFor: NOW + DAY,
    serviceFee: 0.58, transactionFee: 0.3, total: 20.88, etaWindow: '1:00PM',
  },
];

export const history: Favor[] = [
  {
    id: 'h1', memberId: 'u_me', palId: 'u_fab', tier: 'small', price: 50,
    description: 'Walk my dog around the block at 4pm.', images: [],
    location: { lat: 25.76, lng: -80.19, address: '120 Biscayne Blvd, Miami' },
    status: 'completed', createdAt: NOW - 30 * DAY, serviceFee: 1.45, transactionFee: 0.3, total: 51.75,
    rating: 5, feedback: 'Perfect, thank you!', tip: 4,
  },
  {
    id: 'h2', memberId: 'u_me', palId: 'u_may', tier: 'tiny', price: 20,
    description: 'Grab coffee and pastries from the corner cafe.', images: [],
    location: { lat: 25.75, lng: -80.2, address: '5th & Ocean, Miami' },
    status: 'cancelled', createdAt: NOW - 12 * DAY, serviceFee: 0.58, transactionFee: 0.3, total: 20.88,
  },
];

export const cards: PaymentCard[] = [
  { id: 'c1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 27, isDefault: true },
];

export const transactions: Transaction[] = [
  { id: 't1', favorId: 'h1', title: 'Dog walking', amount: 51.75, status: 'completed', date: NOW - 30 * DAY, kind: 'payment' },
  { id: 't2', favorId: 'h2', title: 'Coffee run', amount: 20.88, status: 'cancelled', date: NOW - 12 * DAY, kind: 'payment' },
];

export const earnings: Transaction[] = [
  { id: 'e1', favorId: 'h1', title: 'Dog walking', amount: 33.0, status: 'completed', date: NOW - 30 * DAY, kind: 'earning' },
  { id: 'e2', favorId: 'f_incoming', title: 'Package pickup', amount: 10.0, status: 'in_progress', date: NOW - 3600000, kind: 'earning' },
];

export const threads: Thread[] = [
  { id: 'th1', withUser: { id: 'u_fab', name: 'Fabrizio L.', avatar: 'https://i.pravatar.cc/150?img=33' }, lastMessage: "Hi! What's up?", unread: 2, updatedAt: NOW - 600000 },
  { id: 'th2', withUser: { id: 'u_john', name: 'John D.', avatar: 'https://i.pravatar.cc/150?img=15' }, lastMessage: 'On my way!', unread: 0, updatedAt: NOW - 3 * 3600000 },
  { id: 'th3', withUser: { id: 'u_may', name: 'Mary S.', avatar: 'https://i.pravatar.cc/150?img=20' }, lastMessage: 'Thank you!', unread: 0, updatedAt: NOW - DAY },
];

export const messages: Message[] = [
  { id: 'm1', threadId: 'th1', fromMe: false, text: 'Hi! What\'s up?', createdAt: NOW - 700000 },
  { id: 'm2', threadId: 'th1', fromMe: true, text: 'How are you doing?', createdAt: NOW - 650000 },
  { id: 'm3', threadId: 'th1', fromMe: false, text: 'Great, on my way to you now.', createdAt: NOW - 600000 },
];

export const notifications: AppNotification[] = [
  { id: 'n1', type: 'match', title: 'Favor matched!', body: 'Fabrizio L. accepted your favor.', date: NOW - 600000, read: false },
  { id: 'n2', type: 'arrived', title: 'Your Favor Pal arrived', body: 'Fabrizio is at your location.', date: NOW - 300000, read: false },
];
