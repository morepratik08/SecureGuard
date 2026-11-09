import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDatabase() {
  try {
    await prisma.$connect();

    const result = await prisma.$queryRaw`SELECT 1 AS connected`;

    console.log('Database connected successfully!');
    console.log('Query result:', result);
  } catch (error) {
    console.error('Database connection failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();