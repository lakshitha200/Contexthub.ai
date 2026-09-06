-- Recreate the pgvector HNSW index on Chunk.embedding.
--
-- It was created by 20260523164654_add_chunk_hnsw_index and silently dropped by
-- 20260727081101_document_uploader_setnull — a generated migration for an
-- unrelated Document change. Prisma cannot see an index on an
-- Unsupported("vector(1536)") column, so its schema diff read the index as
-- drift and removed it.
--
-- Without it, every chat question is a sequential scan over every chunk in the
-- workspace, because RetrievalService orders by `embedding <=> $query`.
--
-- WARNING: a future `prisma migrate dev` can drop it again the same way. If a
-- generated migration contains `DROP INDEX "Chunk_embedding_hnsw_idx"`, delete
-- that line before applying it.
--
-- vector_cosine_ops matches the `<=>` operator RetrievalService uses.
CREATE INDEX IF NOT EXISTS "Chunk_embedding_hnsw_idx"
ON "Chunk" USING hnsw (embedding vector_cosine_ops);
