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

  const instruction = `You rank sermons by Bishop Joshua Heward-Mills ("BJosh") for a search app. For each candidate you get its title and the single most relevant transcript excerpt. Rank by how central the user's topic is to the sermon's MAIN teaching. Exclude candidates where the topic only appears in an altar call, closing prayer, passing mention, or opening worship. Return ONLY a JSON array, ordered best-first, using the exact 0-based indices given: [{"index": 0, "confidence": "high"|"medium"|"low"}]. Omit candidates that should be excluded.`;

  const candidates = rows
    .map((r, i) => `[${i}] "${r.title}"\nExcerpt: ${r.best_chunk}`)
    .join('\n---\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: RERANK_MODEL,
      max_tokens: 1000,
      system: [{ type: 'text', text: instruction, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Query: "${query}"\n\nCandidates:\n${candidates}` }],
    }),
  });
  if (!res.ok) return rows.map((r) => toMatch(r, 'medium'));

  const data = await res.json();
  const text = data.content?.find((b) => b.type === 'text')?.text || '[]';
  const m = text.replace(/```json|```/g, '').match(/\[[\s\S]*\]/);
  const ranked = m ? JSON.parse(m[0]) : [];
  return ranked.map((r) => (rows[r.index] ? toMatch(rows[r.index], r.confidence || 'medium') : null)).filter(Boolean);
}

export async function search(query, { rerank = true, k = 15 } = {}) {
  const q = query?.trim();
  if (!q) return [];
  const qvec = await embedQuery(q);
  const rows = await hybridSearch(qvec, q, { k });
  if (!rows.length) return [];
  return rerank ? claudeRerank(q, rows) : rows.map((r) => toMatch(r, 'medium'));
}
