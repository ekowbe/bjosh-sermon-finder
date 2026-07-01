// Offline indexer: transcript -> chunks -> Voyage embeddings -> Postgres.
// Incremental: skips any sermon whose transcript content_hash is unchanged.
//
//   node scripts/build-index.js --cleaned <dir> [--limit N] [--force]   (preferred)
//   node scripts/build-index.js [--source all|drive|youtube] [--limit N] [--force]
//
// --cleaned indexes the AI-cleaned corpus via its manifest (status-gated,
// provenance-carrying). The bare form fetches raw transcripts live from
// Drive/YouTube. Requires: SUPABASE_DB_URL, VOYAGE_API_KEY (always); GOOGLE_*
// for live drive sources; yt-dlp for live YouTube transcripts.

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

import { SERMONS } from '../lib/sermons.js';
import { chunkTranscript, contextHeader } from '../lib/search/chunk.js';
import { embedDocuments } from '../lib/search/voyage.js';
import { upsertSermon, replaceChunks, isUpToDate } from '../lib/search/db.js';
import { getAccessToken, readTranscript } from '../lib/search/drive.js';
import { fetchCaptions } from '../lib/search/captions.js';
import { buildIndexRecords } from '../lib/search/cleaned-source.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTS = (() => {
  const p = join(__dirname, '../lib/youtube-transcripts.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
})();

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : (args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1]);
};
const SOURCE = flag('source', 'all');
const CLEANED = flag('cleaned', false);
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;
const FORCE = flag('force', false);
const EMBED_BATCH = 64;

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// Chunk + embed + upsert one prepared record. Returns chunk count, or -1 if
// its content is already indexed (incremental skip).
async function indexRecord(r) {
  const hash = sha(r.text);
  if (!FORCE && (await isUpToDate(r.source, r.externalId, hash))) return -1;

  const header = contextHeader({ title: r.title, topics: r.topics });
  const chunks = chunkTranscript(r.text).map((c) => ({ ...c, text: `${header}\n${c.text}` }));
  if (!chunks.length) return 0;

  const embeddings = await embedAll(chunks.map((c) => c.text));
  const { id } = await upsertSermon({
    source: r.source, external_id: r.externalId, title: r.title, topics: r.topics,
    scriptures: r.scriptures, key_scripture: r.keyScripture, summary: r.summary,
    audio_id: r.audioId, channel: r.channel || '', published: r.published || '',
    is_reconstructed: r.isReconstructed, status: r.status, content_hash: hash,
  });
  await replaceChunks(id, chunks, embeddings);
  return chunks.length;
}

async function getTranscript(s, token) {
  if (s.youtubeId) {
    return TRANSCRIPTS[s.youtubeId] || fetchCaptions(s.youtubeId);
  }
  if (s.driveId) {
    return readTranscript(s.driveId, token);
  }
  return null;
}

async function embedAll(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    out.push(...(await embedDocuments(texts.slice(i, i + EMBED_BATCH))));
  }
  return out;
}

async function runCleaned(dir) {
  const { records, skipped, orphans } = buildIndexRecords(dir);
  const targets = records.slice(0, LIMIT);
  console.log(`Cleaned corpus: ${records.length} indexable · ${skipped.length} unrecoverable · ${orphans.length} orphans (excluded)`);
  console.log(`Indexing ${targets.length}${LIMIT < records.length ? ` (--limit ${LIMIT})` : ''}…\n`);

  let indexed = 0, upToDate = 0, empty = 0, totalChunks = 0;
  for (const r of targets) {
    let n;
    try { n = await indexRecord(r); }
    catch (e) { console.log(`  ! ${r.title}: ${e.message}`); continue; }
    if (n === -1) { upToDate++; continue; }
    if (n === 0) { empty++; continue; }
    indexed++; totalChunks += n;
    console.log(`  ✓ ${r.title} — ${n} chunks${r.status !== 'ok' ? ` [${r.status}]` : ''}`);
  }
  console.log(`\nDone. ${indexed} indexed (${totalChunks} chunks) · ${upToDate} up-to-date · ${empty} empty`);
  process.exit(0);
}

async function main() {
  if (CLEANED) return runCleaned(CLEANED);

  const wantDrive = SOURCE === 'all' || SOURCE === 'drive';
  const wantYt = SOURCE === 'all' || SOURCE === 'youtube';
  const targets = SERMONS.filter((s) => (s.driveId && wantDrive) || (s.youtubeId && wantYt)).slice(0, LIMIT);

  const token = targets.some((s) => s.driveId) ? await getAccessToken() : null;
  let indexed = 0, skipped = 0, noText = 0, totalChunks = 0;

  for (const s of targets) {
    const source = s.youtubeId ? 'youtube' : 'drive';
    const externalId = s.youtubeId || s.driveId;
    let transcript;
    try {
      transcript = await getTranscript(s, token);
    } catch (e) {
      console.log(`  ! ${s.title}: ${e.message}`);
      continue;
    }
    if (!transcript || transcript.trim().length < 200) { noText++; continue; }

    const hash = sha(transcript);
    if (!FORCE && (await isUpToDate(source, externalId, hash))) { skipped++; continue; }

    const header = contextHeader({ title: s.title, topics: s.topics });
    const chunks = chunkTranscript(transcript).map((c) => ({ ...c, text: `${header}\n${c.text}` }));
    if (!chunks.length) { noText++; continue; }

    const embeddings = await embedAll(chunks.map((c) => c.text));
    const { id } = await upsertSermon({
      source, external_id: externalId, title: s.title, topics: s.topics, scriptures: s.scriptures,
      key_scripture: s.keyScripture, summary: s.summary, audio_id: s.audioId, channel: s.channel,
      published: s.published, content_hash: hash,
    });
    await replaceChunks(id, chunks, embeddings);

    indexed++; totalChunks += chunks.length;
    console.log(`  ✓ [${source}] ${s.title} — ${chunks.length} chunks`);
  }

  console.log(`\nDone. ${indexed} indexed (${totalChunks} chunks) · ${skipped} up-to-date · ${noText} no transcript`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
