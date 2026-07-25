-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE');

-- AlterTable: add nullable first so we can backfill existing rows.
ALTER TABLE "User" ADD COLUMN "authProvider" "AuthProvider";

-- Backfill: anyone with a linked OAuth account is a Google account, everyone else is email.
UPDATE "User"
SET "authProvider" = 'GOOGLE'
WHERE "id" IN (SELECT DISTINCT "userId" FROM "OAuthAccount");

UPDATE "User"
SET "authProvider" = 'EMAIL'
WHERE "authProvider" IS NULL;

-- Grandfather existing accounts: treat them as already verified so nobody is locked out.
UPDATE "User"
SET "emailVerified" = NOW()
WHERE "emailVerified" IS NULL;

-- Now lock the column down.
ALTER TABLE "User" ALTER COLUMN "authProvider" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "authProvider" SET DEFAULT 'EMAIL';
