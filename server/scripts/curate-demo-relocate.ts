// One-off, UPDATE ONLY: move the open demo favors to Miami (the pal-side
// distance origin the app uses before a real GPS fix) and freshen their
// timestamps, so the browse board shows "0.8 mi · 25m ago" instead of
// "1113 mi · 33d ago". Also relocates the staged en-route favor + its pal fix.
// Run: npx tsx scripts/curate-demo-relocate.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const minAgo = (m: number) => new Date(Date.now() - m * 60_000);

// App's PAL_ORIGIN_FALLBACK is 25.7617, -80.1918 (downtown Miami).
const MOVES: Array<{ desc: string; address: string; lat: number; lng: number; ageMin: number }> = [
  { desc: 'Walk my dog around the block before noon', address: '1000 Brickell Ave, Miami, FL', lat: 25.764, lng: -80.191, ageMin: 8 },
  { desc: 'Pick up a prescription from the pharmacy', address: '200 SW 8th St, Miami, FL', lat: 25.7659, lng: -80.1993, ageMin: 25 },
  { desc: 'Assemble a bookshelf — tools provided', address: '350 NE 2nd Ave, Miami, FL', lat: 25.7785, lng: -80.1889, ageMin: 65 },
  { desc: 'Drop off a package at the UPS store', address: '901 S Miami Ave, Miami, FL', lat: 25.7658, lng: -80.1937, ageMin: 110 },
  { desc: 'Pick up my dry cleaning before 5pm', address: '1601 Collins Ave, Miami Beach, FL', lat: 25.7907, lng: -80.13, ageMin: 170 },
  { desc: 'Help me move a couch to my new apartment downstairs', address: '31 SE 5th St, Miami, FL', lat: 25.7683, lng: -80.1897, ageMin: 240 },
];

async function main() {
  for (const m of MOVES) {
    const r = await prisma.favor.updateMany({
      where: { description: m.desc, status: 'requested' },
      data: { locationAddress: m.address, locationLat: m.lat, locationLng: m.lng, createdAt: minAgo(m.ageMin) },
    });
    console.log(`  ${r.count ? 'moved' : 'NOT FOUND'}: ${m.desc}`);
  }

  // Staged en-route favor: favor at Bayfront Park, pal ~1.4 mi north, fresh fix.
  const staged = await prisma.favor.updateMany({
    where: { description: 'Pick up groceries from Trader Joes — buzz 4B', status: 'enroute' },
    data: {
      locationAddress: '301 Biscayne Blvd, Miami, FL', locationLat: 25.7752,
      locationLng: -80.1866, palLat: 25.7899, palLng: -80.1898, palLocationAt: new Date(),
      createdAt: minAgo(26),
    },
  });
  console.log(`  ${staged.count ? 'moved' : 'NOT FOUND'}: staged en-route favor`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
