// One-off: remove the staged en-route favor created by curate-demo-add.ts
// after the screenshot shoot is done (its events cascade with it).
// Run: npx tsx scripts/curate-demo-remove-staged.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const STAGED = 'Pick up groceries from Trader Joes — buzz 4B';

async function main() {
  const del = await prisma.favor.deleteMany({ where: { description: STAGED, status: 'enroute' } });
  console.log(`Removed ${del.count} staged en-route favor(s)`);

  // Also drop the hand-seeded alex↔jordan thread that duplicated the one the
  // app created itself (the server orders userA/userB differently, so the app
  // couldn't find the seeded row and made its own — which now holds the demo
  // conversation). Messages cascade with the thread.
  const dup = await prisma.thread.deleteMany({ where: { id: '95642b25-18f5-4e87-b59e-afe43e9e35cc' } });
  console.log(`Removed ${dup.count} duplicate seeded thread(s)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
