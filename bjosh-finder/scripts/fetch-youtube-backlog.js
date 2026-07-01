// Bulk-fetch English captions for the YouTube back-catalog referenced in
// lib/playlists.js but not yet searchable. Resumable + throttled. Writes
// cleaned transcripts to a STAGING cache (not the curated file) — the
// BJosh-filter + dedup-vs-Drive + metadata step happens later (needs a key).
//
//   node scripts/fetch-youtube-backlog.js [--limit N] [--delay 3000]
//
// yt-dlp must be reachable (PATH, or ~/Library/Python/3.14/bin). No API key.

import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir, homedir } from 'os';
import { execFileSync } from 'child_process';

import { PLAYLISTS } from '../lib/playlists.js';
import { SERMONS } from '../lib/sermons.js';
import { cleanTranscript } from '../lib/search/chunk.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, '../lib/youtube-backlog-transcripts.json');
const PROGRESS = join(__dirname, 'backlog-progress.json');
const CURATED = join(__dirname, '../lib/youtube-transcripts.json');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const LIMIT = opt('limit') ? Number(opt('limit')) : Infinity;
const DELAY = Number(opt('delay', 3000));

const YT_DLP = (() => {
  const userBin = join(homedir(), 'Library/Python/3.14/bin/yt-dlp');
  return existsSync(userBin) ? userBin : 'yt-dlp';
})();

const load = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
const save = (p, o) => writeFileSync(p, JSON.stringify(o, null, p === CACHE ? 0 : 2));
const vttToText = (vtt) => {
  const seen = new Set(), out = [];
  for (const raw of vtt.split('\n')) {
    const line = raw.trim();
    if (!line || line.includes('-->') || line.startsWith('WEBVTT') || line.startsWith('Kind:') || line.startsWith('Language:')) continue;
    const c = line.replace(/<[^>]+>/g, '');
    if (c && !seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out.join(' ');
};

// Prefer human-uploaded subs, fall back to auto-captions. Returns {text, kind}|null.
function fetchCaptions(videoId) {
  for (const [flag, kind] of [['--write-sub', 'manual'], ['--write-auto-sub', 'auto']]) {
    const dir = mkdtempSync(join(tmpdir(), 'yt-cap-'));
    try {
      execFileSync(YT_DLP, [
        '--skip-download', flag, '--sub-lang', 'en.*', '--sub-format', 'vtt',
        '-o', '%(id)s.%(ext)s', `https://www.youtube.com/watch?v=${videoId}`,
      ], { cwd: dir, stdio: 'pipe' });
      const hit = ['en', 'en-US', 'en-GB', 'en-orig'].map((l) => join(dir, `${videoId}.${l}.vtt`)).find(existsSync);
      if (hit) { const text = cleanTranscript(vttToText(readFileSync(hit, 'utf8'))); if (text.length > 200) return { text, kind }; }
    } catch { /* try next */ } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cached = new Set(Object.keys(load(CURATED)));            // already curated
  const sermonYt = new Set(SERMONS.filter((s) => s.youtubeId).map((s) => s.youtubeId));
  const cache = load(CACHE);
  const progress = load(PROGRESS);

  const todo = [];
  for (const p of PLAYLISTS) for (const v of p.videoIds) {
    if (cached.has(v) || sermonYt.has(v) || cache[v] || progress[v]) continue;
    if (!todo.includes(v)) todo.push(v);
  }
  const batch = todo.slice(0, LIMIT);
  console.log(`Back-catalog to fetch: ${todo.length} (this run: ${batch.length}) · yt-dlp: ${YT_DLP}`);

  let manual = 0, auto = 0, none = 0, fail = 0;
  for (const [i, vid] of batch.entries()) {
    try {
      const res = fetchCaptions(vid);
      if (res) {
        cache[vid] = res.text; save(CACHE, cache);
        progress[vid] = res.kind; if (res.kind === 'manual') manual++; else auto++;
        console.log(`  [${i + 1}/${batch.length}] ${vid}: ${res.kind} (${res.text.length} chars)`);
      } else {
        progress[vid] = 'none'; none++;
        console.log(`  [${i + 1}/${batch.length}] ${vid}: no captions`);
      }
    } catch (e) {
      progress[vid] = 'fail'; fail++;
      console.log(`  [${i + 1}/${batch.length}] ${vid}: FAIL ${e.message.split('\n')[0]}`);
    }
    save(PROGRESS, progress);
    if (i < batch.length - 1) await sleep(DELAY + Math.floor(DELAY * 0.5 * Math.random())); // jittered throttle
  }
  console.log(`\nDone this run. manual=${manual} auto=${auto} none=${none} fail=${fail}. Cache: ${CACHE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
