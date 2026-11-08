// One-off, ADDITIVE ONLY: enrich the shared demo DB with realistic content for
// the store screenshots (and App Review). Creates rows and fills missing
// settlement watermarks; deletes nothing. Companion cleanup (test-residue
// removal) lives in curate-demo.ts and is run separately with user approval.
// Run: npx tsx scripts/curate-demo-add.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const round2 = (n: number) => Math.round(n * 100) / 100;
const fees = (base: number) => ({
  serviceFee: round2(base * 0.029),
  transactionFee: 0.3,
  total: round2(base + base * 0.029 + 0.3),
});
const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86400_000 - h * 3600_000);
const minAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function main() {
  // 1. Settle completed favors missing a settlement watermark (stops the
  //    boot-time RECONCILE_NEEDED warning for the seeded demo favor).
  const unsettled = await prisma.favor.updateMany({
    where: { status: 'completed', settledAt: null },
    data: { settledAt: daysAgo(30) },
  });
  console.log(`Settled ${unsettled.count} completed favor(s) missing a settlement watermark`);

  const [alex, jordan] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'alex@example.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'jordan@example.com' } }),
  ]);

  // 2. Two more completed favors alexâ†’jordan so History + Earning History have texture.
  const completed = [
    {
      tier: 'big', price: 90, tip: 10, rating: 5, feedback: 'Jordan was fantastic â€” fast, careful, and friendly!',
      description: 'Assemble a dresser and nightstand â€” tools provided',
      address: '1200 Barton Springs Rd, Austin, TX', lat: 30.2622, lng: -97.7561, when: 5,
    },
    {
      tier: 'tiny', price: 20, tip: 5, rating: 5, feedback: 'Right on time, coffee still hot. Thank you!',
      description: 'Grab coffee and bagels for the office by 9am',
      address: '98 San Jacinto Blvd, Austin, TX', lat: 30.2635, lng: -97.7420, when: 2,
    },
  ];
  for (const c of completed) {
    const exists = await prisma.favor.findFirst({ where: { description: c.description } });
    if (exists) { console.log(`  skip (exists): ${c.description}`); continue; }
    const f = fees(c.price);
    const created = daysAgo(c.when, 3);
    const favor = await prisma.favor.create({
      data: {
        memberId: alex.id, palId: jordan.id, tier: c.tier, price: c.price, listPrice: c.price, description: c.description, images: '[]',
        locationLat: c.lat, locationLng: c.lng, locationAddress: c.address,
        status: 'completed', serviceFee: f.serviceFee, transactionFee: f.transactionFee, total: f.total,
        tip: c.tip, rating: c.rating, feedback: c.feedback, settledAt: daysAgo(c.when, 1),
        createdAt: created,
        events: {
          create: [
            { status: 'requested', at: created },
            { status: 'matched', at: daysAgo(c.when, 2.8), actorId: jordan.id },
            { status: 'enroute', at: daysAgo(c.when, 2.5), actorId: jordan.id },
            { status: 'arrived', at: daysAgo(c.when, 2.2), actorId: jordan.id },
            { status: 'in_progress', at: daysAgo(c.when, 2.0), actorId: jordan.id },
            { status: 'completed', at: daysAgo(c.when, 1.2), actorId: jordan.id },
          ],
        },
      },
    });
    await prisma.transaction.create({
      data: { userId: alex.id, favorId: favor.id, title: c.description, amount: round2(f.total + c.tip), status: 'completed', kind: 'payment', date: daysAgo(c.when, 1.2) },
    });
    await prisma.transaction.create({
      data: { userId: jordan.id, favorId: favor.id, title: c.description, amount: round2(c.price * 0.8 + c.tip), status: 'completed', kind: 'earning', date: daysAgo(c.when, 1.2) },
    });
    console.log(`  added completed favor: ${c.description}`);
  }

  // 3. A LIVE en-route favor for alex (pal jordan, live GPS fix set) so the
  //    member live-tracking screen can be captured. Distinctive description â€”
  //    remove after the shoot with scripts/curate-demo-remove-staged.ts.
  const STAGED = 'Pick up groceries from Trader Joes â€” buzz 4B';
  if (!(await prisma.favor.findFirst({ where: { description: STAGED } }))) {
    const f = fees(35);
    await prisma.favor.create({
      data: {
        memberId: alex.id, palId: jordan.id, tier: 'small', price: 35, listPrice: 35, description: STAGED, images: '[]',
        locationLat: 30.2672, locationLng: -97.7431, locationAddress: '500 Congress Ave, Austin, TX',
        palLat: 30.2495, palLng: -97.7495, palLocationAt: minAgo(0.2),
        status: 'enroute', serviceFee: f.serviceFee, transactionFee: f.transactionFee, total: f.total,
        etaWindow: '4:35 - 4:50PM', createdAt: minAgo(24),
        events: {
          create: [
            { status: 'requested', at: minAgo(24) },
            { status: 'matched', at: minAgo(18), actorId: jordan.id },
            { status: 'enroute', at: minAgo(9), actorId: jordan.id },
          ],
        },
      },
    });
    console.log('  staged live en-route favor for the tracking screenshot');
  } else {
    console.log('  staged en-route favor already exists â€” skipped');
  }

  // 4. A message thread alex â†” jordan so the Messages screens aren't empty.
  const existingThread = await prisma.thread.findFirst({
    where: { OR: [{ userAId: alex.id, userBId: jordan.id }, { userAId: jordan.id, userBId: alex.id }] },
  });
  if (!existingThread) {
    const texts: Array<[string, string, number]> = [
      [jordan.id, 'Hey Alex! I accepted your favor â€” heading to the store now.', 95],
      [alex.id, 'Awesome, thank you! Could you grab the 2% milk instead of whole?', 92],
      [jordan.id, "Of course, 2% it is. Anything else while I'm here?", 88],
      [alex.id, "That's everything. Buzz apartment 4B when you arrive.", 85],
      [jordan.id, 'Just checked out â€” be there in about 10 minutes!', 40],
      [alex.id, 'Perfect, see you soon!', 38],
    ];
    const thread = await prisma.thread.create({
      data: {
        userAId: alex.id, userBId: jordan.id,
        lastMessage: texts[texts.length - 1][1], unreadForA: 0, unreadForB: 0,
        createdAt: minAgo(100),
      },
    });
    for (const [senderId, text, m] of texts) {
      await prisma.message.create({
        data: { threadId: thread.id, senderId, text, read: true, createdAt: minAgo(m) },
      });
    }
    console.log(`  added thread alexâ†”jordan with ${texts.length} messages`);
  } else {
    console.log('  thread alexâ†”jordan already exists â€” skipped');
  }

  const [users, favors, txns, threads] = await Promise.all([
    prisma.user.count(), prisma.favor.count(), prisma.transaction.count(), prisma.thread.count(),
  ]);
  console.log(`\nFinal counts: users=${users} favors=${favors} transactions=${txns} threads=${threads}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
