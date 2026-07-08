// Runs around every e2e test (wired via test/jest-e2e.json -> setupFilesAfterEach).
// Truncates every app table between tests so each test starts on a clean DB.
// We deliberately skip `_prisma_migrations` so we don't have to re-run migrations.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Mirror src/prisma/prisma.service.ts — Prisma 7 needs the driver adapter.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Re-enable before automating / CI — tests are NOT isolated while this is off.
afterEach(async () => {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;

  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
