// Promote staged YouTube back-catalog transcripts to searchable sermons.
// For each staged transcript: fetch its title, run a Claude filter+metadata
// pass (keep only Joshua Heward-Mills sermons), dedup against the already-
// indexed Drive corpus by normalized title, and record the survivors.
//
//   node --env-file=.env.local scripts/promote-backlog.js [--limit N]
//
// Writes scripts/promote-results.json (review before indexing). Does NOT touch
// sermons.js or the DB — indexing is a separate, reviewed step. Resumable.
//
// Requires: ANTHROPIC_API_KEY; yt-dlp for titles.

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

import { SERMONS } from '../lib/sermons.js';
import { cleanTranscript } from '../lib/search/chunk.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STAGED = join(__dirname, '../lib/youtube-backlog-transcripts.json');
const OUT = join(__dirname, 'promote-results.json');

const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf('--limit'); return i === -1 ? Infinity : Number(args[i + 1]); })();

const YT_DLP = (() => {
  const userBin = join(homedir(), 'Library/Python/3.14/bin/yt-dlp');
  return existsSync(userBin) ? userBin : 'yt-dlp';
})();

// Dedup key: normalized title (mirror of the analysis matcher).
const norm = (s) => s.toLowerCase()
  .replace(/^#/, '').replace(/^\d{4}[.\-/]\d{2}[.\-/]\d{2}[_\s]*[a-z]*[_\s]*/i, '')
  .replace(/^\d{1,2}[.\-]\d{2}\s*-\s*/, '').replace(/\b(pt|part)\s*\.?\s*\d+\b/ig, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const driveKeys = new Set(SERMONS.filter((s) => s.driveId).map((s) => norm(s.title)));

function fetchTitle(videoId) {
  try {
    return execFileSync(YT_DLP, ['--skip-download', '--print', '%(title)s', `https://www.youtube.com/watch?v=${videoId}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}

async function classify(anthropic, title, transcript) {
  const prompt = `You are cataloguing a sermon transcript for a search engine that ONLY indexes sermons by Bishop Joshua Heward-Mills ("BJosh"). This YouTube channel also posts his father Bishop Dag Heward-Mills and other preachers — those must be excluded. Auto-captions: little punctuation, scripture spoken aloud.

Video title: "${title || '(unknown)'}"

Transcript:
${transcript.slice(0, 40000)}

1. Identify who is preaching. If not confidently Joshua Heward-Mills, set isJoshuaHewardMills=false.
2. If (and only if) it is Joshua Heward-Mills, extract 8-12 specific topic keywords, all Bible scripture references (standard format e.g. John 3:16), the single most central scripture, and a 3-sentence summary.
3. If not him, OR it is only worship/singing/announcements, return empty arrays/strings.

Return ONLY this JSON:
{"isJoshuaHewardMills": true|false, "preacherNote": "...", "topics": [...], "scriptures": [...], "keyScripture": "...", "summary": "..."}`;
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5', max_tokens: 1200, messages: [{ role: 'user', content: prompt }],
  });
  const raw = res.content[0].text.replace(/```json|```/g, '').trim();
  const m = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : raw);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const staged = JSON.parse(readFileSync(STAGED, 'utf8'));
  const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

  const ids = Object.keys(staged).filter((id) => !results[id]).slice(0, LIMIT);
  let kept = 0, notJosh = 0, dupe = 0;

  for (const id of ids) {
    const transcript = cleanTranscript(staged[id]);
    if (transcript.length < 1500) { results[id] = { status: 'too-thin' }; continue; }
    const title = fetchTitle(id);
    if (title && /\bdag\s+heward-?mills\b/i.test(title)) { results[id] = { status: 'excluded-dag', title }; notJosh++; continue; }

    let meta;
    try { meta = await classify(anthropic, title, transcript); }
    catch (e) { results[id] = { status: 'error', title, error: e.message.slice(0, 120) }; continue; }

    if (!meta.isJoshuaHewardMills) { results[id] = { status: 'not-joshua', title, note: meta.preacherNote }; notJosh++; }
    else if (title && driveKeys.has(norm(title))) { results[id] = { status: 'dupe-of-drive', title, ...meta }; dupe++; }
    else {
      results[id] = { status: 'keep', youtubeId: id, title: title || `Sermon ${id}`, ...meta };
      kept++;
    }
    writeFileSync(OUT, JSON.stringify(results, null, 2));
    console.log(`  [${results[id].status}] ${title || id}`);
    await new Promise((r) => setTimeout(r, 800));
  }

  const all = Object.values(results);
  console.log(`\nThis run: ${kept} keep · ${dupe} dupe-of-drive · ${notJosh} not-BJosh`);
  console.log(`Totals so far: keep=${all.filter((r) => r.status === 'keep').length} dupe=${all.filter((r) => r.status === 'dupe-of-drive').length} not-BJosh=${all.filter((r) => ['not-joshua', 'excluded-dag'].includes(r.status)).length} of ${Object.keys(staged).length}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
