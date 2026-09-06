-- Document intelligence: a summary, a closed-set type and topic keywords,
-- generated at ingest time. The summary is also prepended to each chunk before
-- embedding, so an isolated passage still carries its document's context.

-- AlterEnum: analysis runs between CHUNKING and EMBEDDING.
ALTER TYPE "DocStatus" ADD VALUE 'ANALYZING' BEFORE 'EMBEDDING';

-- CreateEnum
CREATE TYPE "DocType" AS ENUM (
  'REPORT',
  'CONTRACT',
  'PROPOSAL',
  'PLAN',
  'POLICY',
  'MEETING_NOTES',
  'SPECIFICATION',
  'MANUAL',
  'PRESENTATION',
  'INVOICE',
  'RESEARCH',
  'CORRESPONDENCE',
  'OTHER'
);

-- AlterTable
ALTER TABLE "Document"
  ADD COLUMN "summary"    TEXT,
  ADD COLUMN "docType"    "DocType",
  ADD COLUMN "topics"     TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "analyzedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Document_workspaceId_docType_idx" ON "Document"("workspaceId", "docType");
