/* eslint-disable no-console */
// Purge the seeded demo content from the database so real users never see it:
//   - demo accounts alex@example.com, jordan@example.com, sam@example.com
//     (their favors, transactions, threads, offers, notifications cascade away;
//     favors they were PAL on survive with palId nulled — none should exist)
//   - any leftover open favors those accounts posted (covered by the cascade)
// KEEPS reviewer@myfavor.app — App Store review may still need a demo login.
//
// DESTRUCTIVE AND IRREVERSIBLE. Run it deliberately:
//   Render Shell (or locally with prod DATABASE_URL):
//     PURGE_CONFIRM=yes npx tsx scripts/purge-demo.ts
import { prisma } from '../src/db';

// Everything seeded or test-created lives under @example.com (seed.ts demo
// accounts + the integration suite's test_* users). Real users sign up with
// real addresses; reviewer@myfavor.app is explicitly kept.
const DEMO_EMAIL_SUFFIX = '@example.com';

async function main() {
  if (process.env.PURGE_CONFIRM !== 'yes') {
    console.error('Refusing to run: set PURGE_CONFIRM=yes to delete the demo data.');
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    where: { email: { endsWith: DEMO_EMAIL_SUFFIX } },
    select: { id: true, email: true, firstName: true },
  });
  if (users.length === 0) {
    console.log('No demo accounts found — nothing to purge.');
    return;
  }
  const ids = users.map((u) => u.id);

  const [favorsAsMember, favorsAsPal, threads] = await Promise.all([
    prisma.favor.count({ where: { memberId: { in: ids } } }),
    prisma.favor.count({ where: { palId: { in: ids } } }),
    prisma.thread.count({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } }),
  ]);
  console.log(`Deleting ${users.length} demo users:`, users.map((u) => u.email).join(', '));
  console.log(`  cascades: ${favorsAsMember} favors (as member), ${threads} threads; ${favorsAsPal} favors as pal get palId nulled`);

  // Deleting the users cascades their favors/threads/transactions/offers away.
  // A REAL member's favor that had a demo pal assigned survives with palId
  // nulled (SetNull) but keeps its matched/in-flight STATUS — flip those back to
  // 'requested' so they reopen on the board instead of sticking as pal-less
  // "matched" zombies.
  const deleted = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${deleted.count} users (and their cascaded rows).`);
  const reopened = await prisma.favor.updateMany({
    where: { palId: null, status: { in: ['matched', 'enroute', 'arrived', 'in_progress'] } },
    data: { status: 'requested' },
  });
  if (reopened.count > 0) console.log(`Reopened ${reopened.count} favors stranded by deleted pals.`);

  const remainingOpen = await prisma.favor.count({ where: { status: 'requested' } });
  console.log(`Open favors remaining on the board: ${remainingOpen}`);
  console.log('Done. reviewer@myfavor.app was kept for App Store review.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
