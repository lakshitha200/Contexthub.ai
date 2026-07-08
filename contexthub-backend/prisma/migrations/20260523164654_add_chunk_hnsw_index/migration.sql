-- makes similarity search fast. It's a special index for the <=> "find similar" operator.
CREATE INDEX IF NOT EXISTS "Chunk_embedding_hnsw_idx"
ON "Chunk" USING hnsw (embedding vector_cosine_ops);