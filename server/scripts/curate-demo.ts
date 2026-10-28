// One-off, CLEANUP ONLY: remove test-suite residue from the shared demo DB.
// Deletes ONLY users whose email matches the test-suite pattern
// (test_member_*/test_pal_*@example.com) — their favors, transactions, threads,
// messages, notifications and tokens cascade with them. Never touches the four
// real demo accounts (alex/jordan/sam/reviewer) or any non-app tables in the
// shared `public` schema. Additions live in curate-demo-add.ts.
// Run: npx tsx scripts/curate-demo.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const REAL = ['alex@example.com', 'jordan@example.com', 'sam@example.com', 'reviewer@myfavor.app'];

async function main() {
  const testUsers = await prisma.user.findMany({
    where: {
      AND: [
        { OR: [{ email: { startsWith: 'test_member_' } }, { email: { startsWith: 'test_pal_' } }] },
        { email: { endsWith: '@example.com' } },
        { email: { notIn: REAL } },
      ],
    },
    select: { id: true, email: true },
  });
  console.log(`Deleting ${testUsers.length} test users (cascade removes their favors/transactions/threads)…`);
  const del = await prisma.user.deleteMany({ where: { id: { in: testUsers.map((u) => u.id) } } });
  console.log(`  deleted ${del.count} users`);

  // Any leftover favors with unmistakable test-fixture descriptions.
  const junk = await prisma.favor.deleteMany({
    where: { description: { in: ['Abandon test', 'Secret errand', 'Water my plants'] } },
  });
  console.log(`  deleted ${junk.count} leftover fixture favors`);

  const [users, favors, txns] = await Promise.all([
    prisma.user.count(), prisma.favor.count(), prisma.transaction.count(),
  ]);
  console.log(`Final counts: users=${users} favors=${favors} transactions=${txns}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
