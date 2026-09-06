-- CreateEnum
CREATE TYPE "ChunkKind" AS ENUM ('TEXT', 'TABLE', 'IMAGE', 'OCR');

-- AlterTable
ALTER TABLE "Chunk" ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "kind" "ChunkKind" NOT NULL DEFAULT 'TEXT';
