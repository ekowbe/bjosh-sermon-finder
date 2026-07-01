// Query-time retrieval. Fast path is pure hybrid search; an optional Claude
// rerank refines the shortlist and assigns confidence. Returns the exact
// { matches: [...] } shape the existing UI consumes, so no client changes.

import { embedQuery } from './voyage.js';
import { hybridSearch } from './db.js';

const RERANK_MODEL = 'claude-sonnet-4-6';

function toMatch(row, confidence) {
  const base = {
    title: row.title,
    confidence,
    keyScripture: row.key_scripture || '',
    summary: row.summary || '',
    isReconstructed: row.is_reconstructed === true,
  };
  return row.source === 'drive'
    ? { ...base, driveId: row.external_id, audioId: row.audio_id || '' }
    : { ...base, youtubeId: row.external_id };
}

// Claude rerank: reuses the old route's "central teaching, not altar call"
// judgment, but over a small pre-retrieved shortlist instead of full scans.
// The static instruction block is marked cacheable (cache reads bill at 0.1x).
async function claudeRerank(query, rows) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return rows.map((r) => toMatch(r, 'medium')); // graceful: skip rerank

  // Fallback = retrieval order, unranked. A reranker hiccup must never blank
  // the results (retrieval already found relevant sermons).
  const fallback = () => rows.map((r) => toMatch(r, 'medium'));

  const instruction = `You rank sermons by Bishop Joshua Heward-Mills ("BJosh") for a search app. For each candidate you get its title and the single most relevant transcript excerpt. Rank by how central the user's topic is to the sermon's MAIN teaching. Exclude candidates where the topic only appears in an altar call, closing prayer, passing mention, or opening worship. Call submit_ranking with the results ordered best-first, using the exact 0-based indices given, omitting any candidate that should be excluded.`;

  const candidates = rows
    .map((r, i) => `[${i}] "${r.title}"\nExcerpt: ${r.best_chunk}`)
    .join('\n---\n');

  // Forced tool use guarantees structured JSON (Sonnet 4.6 rejects prefill and
  // will otherwise sometimes emit prose). tool_choice forces the call.
  const tool = {
    name: 'submit_ranking',
    description: 'Return the ranked, filtered candidate list.',
    input_schema: {
      type: 'object',
      properties: {
        ranking: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['index', 'confidence'],
          },
        },
      },
      required: ['ranking'],
    },
  };

  let ranking;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: RERANK_MODEL,
        max_tokens: 1000,
        system: [{ type: 'text', text: instruction, cache_control: { type: 'ephemeral' } }],
        tools: [tool],
        tool_choice: { type: 'tool', name: 'submit_ranking' },
        messages: [{ role: 'user', content: `Query: "${query}"\n\nCandidates:\n${candidates}` }],
      }),
    });
    if (!res.ok) return fallback();
    const data = await res.json();
    ranking = data.content?.find((b) => b.type === 'tool_use')?.input?.ranking;
  } catch {
    return fallback();
  }
  if (!Array.isArray(ranking)) return fallback();

  const mapped = ranking
    .map((r) => (rows[r.index] ? toMatch(rows[r.index], r.confidence || 'medium') : null))
    .filter(Boolean);
  // If the rerank legitimately excluded everything, still show retrieval rather
  // than an empty page — the excerpts matched, so there IS relevant content.
  return mapped.length ? mapped : fallback();
}

export async function search(query, { rerank = true, k = 15 } = {}) {
  const q = query?.trim();
  if (!q) return [];
  const qvec = await embedQuery(q);
  const rows = await hybridSearch(qvec, q, { k });
  if (!rows.length) return [];
  return rerank ? claudeRerank(q, rows) : rows.map((r) => toMatch(r, 'medium'));
}
