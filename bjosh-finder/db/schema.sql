-- BJosh Sermon Finder — search index schema (its own Supabase project)
-- Run once in the Supabase SQL editor (or psql) against a fresh project.

create extension if not exists vector;      -- pgvector
create extension if not exists pg_trgm;     -- trigram fuzzy keyword

-- One row per sermon (Drive transcript OR YouTube video).
create table if not exists sermons (
  id            bigint generated always as identity primary key,
  source        text not null check (source in ('drive', 'youtube')),
  external_id   text not null,              -- driveId or youtubeId
  title         text not null,
  topics        text[] default '{}',
  scriptures    text[] default '{}',
  key_scripture text default '',
  summary       text default '',
  audio_id      text default '',            -- Drive audio file id, when present
  channel       text default '',
  published     text default '',            -- ISO date string when known
  -- content_hash lets the indexer skip unchanged transcripts on re-runs
  content_hash  text not null,
  indexed_at    timestamptz not null default now(),
  unique (source, external_id)
);

-- Chunks are the unit of retrieval. ~250-token windows, altar-call tail dropped.
create table if not exists chunks (
  id         bigint generated always as identity primary key,
  sermon_id  bigint not null references sermons(id) on delete cascade,
  position   int not null,
  -- text is the embedded text: a one-line context header + the window.
  text       text not null,
  embedding  vector(1024),                  -- Voyage 3 (1024-dim, cosine)
  text_tsv   tsvector generated always as (to_tsvector('english', text)) stored
);

-- ANN index for vector search (cosine). lists/probes irrelevant for hnsw.
create index if not exists chunks_embedding_hnsw
  on chunks using hnsw (embedding vector_cosine_ops);

-- Keyword indexes for the BM25-style half of hybrid search.
create index if not exists chunks_text_tsv_gin on chunks using gin (text_tsv);
create index if not exists chunks_text_trgm on chunks using gin (text gin_trgm_ops);

create index if not exists chunks_sermon_id on chunks (sermon_id);
