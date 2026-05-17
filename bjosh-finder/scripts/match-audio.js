import { GoogleAuth } from 'google-auth-library';
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const YEARS_FOLDER_ID = '1pgvPJ75PTbuBZ25gC3Emnf0ArAyj2uIa';
const SERMONS_FILE = join(dirname(fileURLToPath(import.meta.url)), '../lib/sermons.js');

async function getAccessToken() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function getFiles(folderId, token) {
  let files = [], pageToken = null;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents`,
      fields: 'nextPageToken,files(id,name,mimeType)',
      pageSize: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return files;
}

const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/flac', 'audio/ogg', 'video/mp4']);

async function crawl(folderId, token, audioMap) {
  const files = await getFiles(folderId, token);
  for (const f of files) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      await crawl(f.id, token, audioMap);
    } else if (AUDIO_TYPES.has(f.mimeType) || f.name.match(/\.(mp3|m4a|wav|flac|ogg|mp4)$/i)) {
      const baseName = f.name.replace(/\.(mp3|m4a|wav|flac|ogg|mp4)$/i, '');
      audioMap.set(baseName.toLowerCase().trim(), { id: f.id, name: f.name });
    }
  }
}

function normalize(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[_\-]+/g, ' ')           // underscores and dashes to spaces
    .replace(/\s+/g, ' ')              // collapse whitespace
    .replace(/['']/g, "'")             // normalize quotes
    .replace(/[^a-z0-9 ']/g, '')      // remove special chars
    .trim();
}

function fuzzyMatch(transcriptTitle, audioMap) {
  const tNorm = normalize(transcriptTitle);

  // 1. Exact match
  if (audioMap.has(tNorm)) return audioMap.get(tNorm);

  // 2. Audio title contains transcript title (handles truncated transcript names)
  for (const [audioKey, audioVal] of audioMap) {
    if (audioKey.includes(tNorm) || tNorm.includes(audioKey)) {
      return audioVal;
    }
  }

  // 3. Significant word overlap (>70% of transcript words appear in audio title)
  const tWords = tNorm.split(' ').filter(w => w.length > 3);
  if (tWords.length === 0) return null;

  let bestMatch = null, bestScore = 0;
  for (const [audioKey, audioVal] of audioMap) {
    const aWords = new Set(audioKey.split(' '));
    const overlap = tWords.filter(w => aWords.has(w)).length;
    const score = overlap / tWords.length;
    if (score > 0.7 && score > bestScore) {
      bestScore = score;
      bestMatch = audioVal;
    }
  }
  return bestMatch;
}

async function main() {
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.error('Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY');
    process.exit(1);
  }

  console.log('Authenticating...');
  const token = await getAccessToken();

  console.log('Crawling Years folder for audio files...');
  const audioMap = new Map();
  await crawl(YEARS_FOLDER_ID, token, audioMap);
  console.log(`Found ${audioMap.size} audio files\n`);

  const sermonsRaw = readFileSync(SERMONS_FILE, 'utf8');
  const sermons = JSON.parse(sermonsRaw.replace('export const SERMONS = ', '').replace(/;\s*$/, ''));

  let matched = 0, unmatched = 0;

  const updated = sermons.map(s => {
    const audio = fuzzyMatch(s.title, audioMap);
    if (audio) {
      matched++;
      return { ...s, audioId: audio.id };
    } else {
      unmatched++;
      return s;
    }
  });

  const js = 'export const SERMONS = ' + JSON.stringify(updated, null, 2) + ';\n';
  writeFileSync(SERMONS_FILE, js);

  console.log(`Matched: ${matched} · Unmatched: ${unmatched}`);
  console.log('Written to lib/sermons.js');

  if (unmatched > 0) {
    console.log('\nUnmatched sermons (audio not found):');
    updated.filter(s => !s.audioId).forEach(s => console.log(' -', s.title));
  }
}

main().catch(console.error);