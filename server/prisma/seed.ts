import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Seed a few verified accounts so the app has something to show and so there's a
// known demo login (also handy for the App Store reviewer demo account).
const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123';

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const member = await prisma.user.upsert({
    where: { email: 'alex@example.com' },
    update: {},
    create: {
      firstName: 'Alex', lastName: 'Member', email: 'alex@example.com', phone: '+15550000001',
      passwordHash, role: 'member', verified: true, city: 'Austin', state: 'TX',
    },
  });

  const pal1 = await prisma.user.upsert({
    where: { email: 'jordan@example.com' },
    // Backfill vetting on existing demo rows so seeded pals stay matchable/able
    // to accept after the palVerified gate was added.
    update: { palVerified: true, palVerifiedAt: new Date(), palVetStatus: 'approved' },
    create: {
      firstName: 'Jordan', lastName: 'Pal', email: 'jordan@example.com', phone: '+15550000002',
      passwordHash, role: 'pal', verified: true, palVerified: true, palVerifiedAt: new Date(), palVetStatus: 'approved',
      city: 'Austin', state: 'TX',
      bio: 'Reliable and fast. Happy to help with errands.',
      rating: 4.8, totalFavors: 132, yearsActive: 3, reliability: 98, positiveReviews: 96,
    },
  });

  const pal2 = await prisma.user.upsert({
    where: { email: 'sam@example.com' },
    update: { palVerified: true, palVerifiedAt: new Date(), palVetStatus: 'approved' },
    create: {
      firstName: 'Sam', lastName: 'Helper', email: 'sam@example.com', phone: '+15550000003',
      passwordHash, role: 'pal', verified: true, palVerified: true, palVerifiedAt: new Date(), palVetStatus: 'approved',
      city: 'Austin', state: 'TX',
      bio: 'Your friendly neighborhood Favor Pal.',
      rating: 4.6, totalFavors: 64, yearsActive: 2, reliability: 94, positiveReviews: 92,
    },
  });

  // A completed favor with both ledger entries, so history/earnings aren't empty.
  const existing = await prisma.favor.findFirst({ where: { memberId: member.id } });
  if (!existing) {
    const base = 50;
    const favor = await prisma.favor.create({
      data: {
        memberId: member.id, palId: pal1.id, tier: 'small', price: base,
        description: 'Pick up groceries from the store', images: '[]',
        locationLat: 30.2672, locationLng: -97.7431, locationAddress: '500 Congress Ave, Austin, TX',
        status: 'completed', serviceFee: 1.45, transactionFee: 0.3, total: 51.75, rating: 5, feedback: 'Great job!',
        events: { create: [{ status: 'requested' }, { status: 'matched' }, { status: 'completed' }] },
      },
    });
    await prisma.transaction.create({
      data: { userId: member.id, favorId: favor.id, title: favor.description, amount: 51.75, status: 'completed', kind: 'payment' },
    });
    await prisma.transaction.create({
      data: { userId: pal1.id, favorId: favor.id, title: favor.description, amount: 40, status: 'completed', kind: 'earning' },
    });
  }

  // OPEN (unassigned) requests so the "Browse Favors" board has content for
  // everyone. Since any account can browse and fulfill favors (but never their
  // own), we post from MULTIPLE accounts — alex sees jordan's & sam's, and they
  // see alex's. Idempotent by description, so re-running adds any new ones.
  const fees = (base: number) => ({
    serviceFee: Math.round(base * 0.029 * 100) / 100,
    transactionFee: 0.3,
    total: Math.round((base + base * 0.029 + 0.3) * 100) / 100,
  });
  const open = [
    { by: pal1.id, tier: 'tiny', price: 25, description: 'Walk my dog around the block before noon', address: '600 Congress Ave, Austin, TX', lat: 30.270, lng: -97.742 },
    { by: pal2.id, tier: 'small', price: 45, description: 'Pick up a prescription from the pharmacy', address: '1500 S Congress Ave, Austin, TX', lat: 30.249, lng: -97.751 },
    { by: pal1.id, tier: 'big', price: 90, description: 'Assemble a bookshelf — tools provided', address: '900 E 5th St, Austin, TX', lat: 30.262, lng: -97.730 },
    { by: member.id, tier: 'tiny', price: 20, description: 'Drop off a package at the UPS store', address: '200 E 6th St, Austin, TX', lat: 30.267, lng: -97.741 },
    { by: member.id, tier: 'small', price: 50, description: 'Pick up my dry cleaning before 5pm', address: '1100 S Lamar Blvd, Austin, TX', lat: 30.255, lng: -97.763 },
    { by: member.id, tier: 'big', price: 100, description: 'Help me move a couch to my new apartment downstairs', address: '500 W 2nd St, Austin, TX', lat: 30.265, lng: -97.749 },
  ];
  for (const o of open) {
    const exists = await prisma.favor.findFirst({ where: { description: o.description, status: 'requested' } });
    if (exists) continue;
    const f = fees(o.price);
    await prisma.favor.create({
      data: {
        memberId: o.by, tier: o.tier, price: o.price, description: o.description, images: '[]',
        locationLat: o.lat, locationLng: o.lng, locationAddress: o.address, status: 'requested',
        serviceFee: f.serviceFee, transactionFee: f.transactionFee, total: f.total,
        events: { create: { status: 'requested' } },
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seeded:', { member: member.email, pals: [pal1.email, pal2.email], demoPassword: DEMO_PASSWORD });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
