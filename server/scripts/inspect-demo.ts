// One-off: inspect demo/prod data before curating it for store screenshots.
// Read-only. Run: npx tsx scripts/inspect-demo.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TEST_EMAIL = /^test_(member|pal)_[0-9a-f]+_[0-9a-f]+@example\.com$/;

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, firstName: true, lastName: true, role: true } });
  const testUsers = users.filter((u) => TEST_EMAIL.test(u.email));
  const realUsers = users.filter((u) => !TEST_EMAIL.test(u.email));
  const testIds = new Set(testUsers.map((u) => u.id));
  console.log(`USERS: ${users.length} total — ${realUsers.length} real, ${testUsers.length} test residue`);
  for (const u of realUsers) console.log(`  REAL: ${u.email} | ${u.firstName} ${u.lastName} | ${u.role} | ${u.id}`);

  const favors = await prisma.favor.findMany({
    select: { id: true, status: true, tier: true, price: true, description: true, createdAt: true, memberId: true, palId: true, member: { select: { email: true } }, pal: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const testFavors = favors.filter((f) => testIds.has(f.memberId) || (f.palId && testIds.has(f.palId)));
  const realFavors = favors.filter((f) => !testFavors.includes(f));
  console.log(`\nFAVORS: ${favors.length} total — ${realFavors.length} real, ${testFavors.length} test-owned`);
  for (const f of realFavors) console.log(`  ${f.status} | ${f.tier} $${f.price} | "${f.description.slice(0, 45)}" | member=${f.member?.email} pal=${f.pal?.email ?? '-'} | ${f.createdAt.toISOString().slice(0, 16)} | ${f.id}`);

  const txns = await prisma.transaction.findMany({ select: { id: true, kind: true, amount: true, status: true, title: true, userId: true, user: { select: { email: true } }, date: true }, orderBy: { date: 'desc' } });
  const testTxns = txns.filter((t) => testIds.has(t.userId));
  console.log(`\nTRANSACTIONS: ${txns.length} total — ${txns.length - testTxns.length} real, ${testTxns.length} test-owned`);
  for (const t of txns.filter((x) => !testIds.has(x.userId))) console.log(`  ${t.kind} | $${t.amount} ${t.status} | "${t.title.slice(0, 40)}" | ${t.user?.email} | ${t.date.toISOString().slice(0, 16)}`);

  for (const model of ['favorEvent', 'paymentMethod', 'thread', 'message', 'notification', 'report', 'block', 'refreshToken', 'otpCode'] as const) {
    // @ts-expect-error dynamic model access
    const n = await prisma[model].count();
    console.log(`${model}: ${n}`);
  }
}

main().finally(() => prisma.$disconnect());
