import { PrismaClient } from '@prisma/client';
import { config } from './config';

// Single shared Prisma client. Prisma uses parameterized queries for all
// model operations, which is our primary defense against SQL injection.
export const prisma = new PrismaClient({
  log: config.isProd ? ['warn', 'error'] : ['warn', 'error'],
});

export async function disconnect() {
  await prisma.$disconnect();
}
