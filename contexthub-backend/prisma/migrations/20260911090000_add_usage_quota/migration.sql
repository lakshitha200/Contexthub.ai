-- Per-account AI usage, bucketed by UTC day.
--
-- One row per user per day. The allowance resets simply by the day rolling
-- over, so there is no scheduled reset job to own, and the table doubles as a
-- usage history when someone asks why they hit the limit.

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "day"       DATE NOT NULL,
    "tokens"    INTEGER NOT NULL DEFAULT 0,
    "calls"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: the upsert path looks a row up by exactly this pair.
CREATE UNIQUE INDEX "UsageCounter_userId_day_key" ON "UsageCounter"("userId", "day");

-- CreateIndex: for pruning old buckets and for day-wide reporting.
CREATE INDEX "UsageCounter_day_idx" ON "UsageCounter"("day");

-- AddForeignKey
ALTER TABLE "UsageCounter"
  ADD CONSTRAINT "UsageCounter_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
