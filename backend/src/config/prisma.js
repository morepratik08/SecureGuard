import { PrismaClient } from '@prisma/client';

const prisma = globalThis.__secureGuardPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__secureGuardPrisma = prisma;
}

export default prisma;
