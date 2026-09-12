-- Deep search (agentic retrieval) is rationed by run rather than by tokens: one
-- run fans out into several model calls, so what needs limiting is how often it
-- may be started. Counted in the same daily bucket so it resets with everything
-- else when the UTC day rolls over.

-- AlterTable
ALTER TABLE "UsageCounter"
  ADD COLUMN "agentRuns" INTEGER NOT NULL DEFAULT 0;
