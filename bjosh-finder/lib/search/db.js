// Postgres (Supabase) data layer for the search index. Uses postgres-js with
// prepare:false (required for the Supabase transaction/session pooler).
// Reads SUPABASE_DB_URL at call time; importing this module needs no secrets.

import postgres from 'postgres';

let _sql = null;
export function sql() {
  if (_sql) return _sql;
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL is not set');
  // search_path points at the dedicated bjosh schema (tables) while keeping
  // public/extensions reachable for the `vector` type + extension functions.
  _sql = postgres(url, {
    prepare: false, max: 4, idle_timeout: 20,
    connection: { search_path: 'bjosh, public, extensions' },
  });
  return _sql;
}

const toVector = (arr) => `[${arr.join(',')}]`;

// Upsert a sermon row; returns its id. Skips re-index when content_hash matches.
export async function upsertSermon(s) {
  const db = sql();
  const rows = await db`
    insert into sermons
      (source, external_id, title, topics, scriptures, key_scripture, summary, audio_id, channel, published,
       is_reconstructed, status, content_hash)
    values
      (${s.source}, ${s.external_id}, ${s.title}, ${db.array(s.topics || [])}, ${db.array(s.scriptures || [])},
       ${s.key_scripture || ''}, ${s.summary || ''}, ${s.audio_id || ''}, ${s.channel || ''}, ${s.published || ''},
       ${s.is_reconstructed ?? false}, ${s.status || 'ok'}, ${s.content_hash})
    on conflict (source, external_id) do update set
      title = excluded.title, topics = excluded.topics, scriptures = excluded.scriptures,
      key_scripture = excluded.key_scripture, summary = excluded.summary, audio_id = excluded.audio_id,
      channel = excluded.channel, published = excluded.published,
      is_reconstructed = excluded.is_reconstructed, status = excluded.status, content_hash = excluded.content_hash,
      indexed_at = now()
    returning id, (xmax = 0) as inserted
  `;
  return rows[0];
}

// Has this exact content already been indexed? (incremental skip)
export async function isUpToDate(source, externalId, contentHash) {
  const db = sql();
  const rows = await db`
    select 1 from sermons
    where source = ${source} and external_id = ${externalId} and content_hash = ${contentHash}
    limit 1`;
  return rows.length > 0;
}

export async function replaceChunks(sermonId, chunks, embeddings) {
  const db = sql();
  await db`delete from chunks where sermon_id = ${sermonId}`;
  if (!chunks.length) return;
  const values = chunks.map((c, i) => ({
    sermon_id: sermonId, position: c.position, text: c.text, embedding: toVector(embeddings[i]),
  }));
  await db`insert into chunks ${db(values, 'sermon_id', 'position', 'text', 'embedding')}`;
}

// Hybrid retrieval: vector cosine + keyword (ts_rank), fused with Reciprocal
// Rank Fusion, collapsed to one row per sermon (best chunk wins).
export async function hybridSearch(queryEmbedding, queryText, { k = 15, pool = 60 } = {}) {
  const db = sql();
  const vec = toVector(queryEmbedding);
  return db`
    with vector_hits as (
      select c.id, c.sermon_id, c.text,
             row_number() over (order by c.embedding <=> ${vec}::vector) as rank
      from chunks c
      order by c.embedding <=> ${vec}::vector
      limit ${pool}
    ),
    keyword_hits as (
      select c.id, c.sermon_id, c.text,
             row_number() over (order by ts_rank(c.text_tsv, plainto_tsquery('english', ${queryText})) desc) as rank
      from chunks c
      where c.text_tsv @@ plainto_tsquery('english', ${queryText})
      limit ${pool}
    ),
    fused as (
      select coalesce(v.id, k.id) as id,
             coalesce(v.sermon_id, k.sermon_id) as sermon_id,
             coalesce(v.text, k.text) as text,
             coalesce(1.0 / (60 + v.rank), 0) + coalesce(1.0 / (60 + k.rank), 0) as score
      from vector_hits v
      full outer join keyword_hits k on v.id = k.id
    ),
    best_per_sermon as (
      select distinct on (sermon_id) sermon_id, id as chunk_id, text, score
      from fused
      order by sermon_id, score desc
    )
    select s.id as sermon_id, s.source, s.external_id, s.title, s.key_scripture, s.summary,
           s.audio_id, s.is_reconstructed, s.status, b.text as best_chunk, b.score
    from best_per_sermon b
    join sermons s on s.id = b.sermon_id
    order by b.score desc
    limit ${k}
  `;
}
