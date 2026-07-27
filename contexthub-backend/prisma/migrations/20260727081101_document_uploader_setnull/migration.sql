-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_uploaderId_fkey";

-- DropIndex
DROP INDEX "Chunk_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "uploaderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
