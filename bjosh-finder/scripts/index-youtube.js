import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERMONS_FILE = join(__dirname, '../lib/sermons.js');
const TRANSCRIPTS_FILE = join(__dirname, '../lib/youtube-transcripts.json');
const PROGRESS_FILE = join(__dirname, 'youtube-progress.json');

const CHANNELS = [
  { id: 'UC-Q62CxirbzkZi8u2U561lQ', name: 'Meeting God' },
  { id: 'UCEBUZZ9Gyaek_l92J728Yuw', name: 'First Love Center' },
];

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'));
  return {};
}

function saveProgress(p) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

async function fetchFeed(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const text = await res.text();
  const entries = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
  return entries.map(e => {
    const videoId = e.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    const title = e.match(/<title>(.*?)<\/title>/)?.[1];
    const link = e.match(/<link rel="alternate" href="(.*?)"/)?.[1] || '';
    const published = e.match(/<published>(.*?)<\/published>/)?.[1];
    return { videoId, title, link, published, isShort: link.includes('/shorts/') };
  }).filter(v => v.videoId && v.title);
}

function vttToPlainText(vtt) {
  const lines = vtt.split('\n');
  const seen = new Set();
  const out = [];
  for (let raw of lines) {
    const line = raw.trim();
    if (!line || line.includes('-->') || line.startsWith('WEBVTT') || line.startsWith('Kind:') || line.startsWith('Language:')) continue;
    const cleaned = line.replace(/<[^>]+>/g, '');
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

function fetchCaptions(videoId) {
  const dir = mkdtempSync(join(tmpdir(), 'yt-cap-'));
  try {
    execFileSync('yt-dlp', [
      '--skip-download', '--write-auto-sub', '--sub-lang', 'en', '--sub-format', 'vtt',
      '-o', '%(id)s.%(ext)s', `https://www.youtube.com/watch?v=${videoId}`,
    ], { cwd: dir, stdio: 'pipe' });
    const vttPath = join(dir, `${videoId}.en.vtt`);
    if (!existsSync(vttPath)) return null;
    return vttToPlainText(readFileSync(vttPath, 'utf8'));
  } catch (e) {
    console.log(`  → caption fetch failed: ${e.message.split('\n')[0]}`);
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function extractMetadata(title, text, anthropic) {
  const prompt = `You are indexing a BJosh (Bishop Joshua Heward-Mills) sermon transcript for a search engine. This transcript comes from YouTube auto-captions, so it has little punctuation and scripture references are spoken aloud (e.g. "john chapter three verse sixteen") rather than written.

Sermon title: "${title}"

Transcript:
${text.slice(0, 40000)}

Your job:
1. Find ALL Bible scripture references — listen for spoken patterns like "john three sixteen", "romans eight twenty eight", etc. Convert to standard format: "John 3:16", "Romans 8:28".
2. Extract specific topic keywords central to the teaching.
3. Identify the single most central scripture.
4. Write a 3-sentence summary of what BJosh specifically teaches.
5. If this transcript is only worship/singing/announcements with no actual teaching content, return empty arrays for topics and scriptures and say so in the summary.

Return ONLY this JSON, nothing else:
{
  "topics": ["8-12 specific topic keywords — not generic words like God or church"],
  "scriptures": ["all Bible references found, in standard format e.g. John 3:16"],
  "keyScripture": "the single most central scripture or empty string if truly none",
  "summary": "exactly 3 sentences on what BJosh specifically teaches — be concrete"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].text.replace(/```json|```/g, '').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : raw);
}

function regenerateOutputs(progress) {
  const driveRaw = readFileSync(join(__dirname, 'index-progress.json'), 'utf8');
  const driveProgress = JSON.parse(driveRaw);

  const driveSermons = Object.values(driveProgress)
    .filter(s => (s.scriptures && s.scriptures.length) || (s.topics && s.topics.length));

  const youtubeSermons = Object.values(progress)
    .filter(s => (s.scriptures && s.scriptures.length) || (s.topics && s.topics.length));

  const transcripts = {};
  for (const s of youtubeSermons) {
    if (s.transcript) transcripts[s.youtubeId] = s.transcript;
  }
  writeFileSync(TRANSCRIPTS_FILE, JSON.stringify(transcripts));

  const merged = [
    ...driveSermons.map(({ driveId, title, topics, scriptures, keyScripture, summary, audioId }) =>
      ({ driveId, title, topics, scriptures, keyScripture, summary, ...(audioId ? { audioId } : {}) })),
    ...youtubeSermons.map(({ youtubeId, title, topics, scriptures, keyScripture, summary, channel }) =>
      ({ youtubeId, title, topics, scriptures, keyScripture, summary, channel })),
  ].map((s, i) => ({ id: i + 1, ...s }));

  writeFileSync(SERMONS_FILE, 'export const SERMONS = ' + JSON.stringify(merged, null, 2) + ';\n');
  return { driveCount: driveSermons.length, youtubeCount: youtubeSermons.length };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const progress = loadProgress();
  let newCount = 0;

  for (const channel of CHANNELS) {
    console.log(`\nChecking ${channel.name}...`);
    const entries = await fetchFeed(channel.id);
    const fullSermons = entries.filter(e => !e.isShort);
    console.log(`  ${entries.length} recent uploads, ${fullSermons.length} non-Shorts`);

    for (const entry of fullSermons) {
      if (progress[entry.videoId]) continue;

      console.log(`  Indexing: ${entry.title}`);
      const transcript = fetchCaptions(entry.videoId);
      if (!transcript) {
        console.log('    → no captions available, skipping');
        continue;
      }

      try {
        const meta = await extractMetadata(entry.title, transcript, anthropic);
        progress[entry.videoId] = {
          youtubeId: entry.videoId,
          title: entry.title,
          channel: channel.name,
          published: entry.published,
          transcript: transcript.slice(0, 12000),
          ...meta,
        };
        newCount++;
        saveProgress(progress);
        console.log(`    → ${meta.scriptures.length} scriptures · ${meta.topics.length} topics`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.log(`    → error: ${e.message}`);
      }
    }
  }

  const { driveCount, youtubeCount } = regenerateOutputs(progress);
  console.log(`\nDone. ${newCount} new this run · ${driveCount} Drive sermons · ${youtubeCount} YouTube sermons indexed total`);
}

main().catch(console.error);
