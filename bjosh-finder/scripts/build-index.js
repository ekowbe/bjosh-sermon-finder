// Offline indexer: transcript -> chunks -> Voyage embeddings -> Postgres.
// Incremental: skips any sermon whose transcript content_hash is unchanged.
//
//   node scripts/build-index.js [--source all|drive|youtube] [--limit N] [--force]
//
// Requires: SUPABASE_DB_URL, VOYAGE_API_KEY (always); GOOGLE_* for drive
// sources; yt-dlp on PATH for any YouTube transcript not already cached.

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
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;
const FORCE = flag('force', false);
const EMBED_BATCH = 64;

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

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

async function main() {
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
