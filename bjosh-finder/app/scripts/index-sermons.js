import { GoogleAuth } from 'google-auth-library';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const FOLDER_ID = '1TvUjIL9px2q29TJcu3-QW_BAqkmWLg_S';
const OUT_FILE = join(dirname(fileURLToPath(import.meta.url)), '../lib/sermons.js');
const PROGRESS_FILE = join(dirname(fileURLToPath(import.meta.url)), '../scripts/index-progress.json');

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'));
  return {};
}

function saveProgress(p) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

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

async function getAllFiles(token) {
  let files = [], pageToken = null;
  do {
    const params = new URLSearchParams({
      q: `'${FOLDER_ID}' in parents and mimeType = 'text/plain'`,
      fields: 'nextPageToken,files(id,name)',
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

async function readFile(fileId, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.text();
}

async function extractMetadata(title, text, anthropic) {
  const prompt = `You are indexing a BJosh (Bishop Joshua Heward-Mills) sermon for a search engine.

Sermon title: "${title}"

Transcript:
${text.slice(0, 12000)}

Return JSON only:
{
  "topics": ["8-12 specific topic keywords central to the teaching — not generic words like God or church"],
  "scriptures": ["all Bible references explicitly cited e.g. John 3:16"],
  "keyScripture": "the single most central scripture or empty string",
  "summary": "exactly 3 sentences on what BJosh specifically teaches — be concrete not vague"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

async function main() {
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.ANTHROPIC_API_KEY) {
    console.error('Set GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const progress = loadProgress();

  console.log('Authenticating with Google...');
  const token = await getAccessToken();

  console.log('Fetching sermon list...');
  const files = await getAllFiles(token);
  console.log(`Found ${files.length} transcripts\n`);

  const results = { ...progress };
  let newCount = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const title = f.name.replace('.txt', '');

    if (results[f.id]) {
      console.log(`[${i+1}/${files.length}] Cached: ${title}`);
      continue;
    }

    console.log(`[${i+1}/${files.length}] Indexing: ${title}`);

    try {
      const text = await readFile(f.id, token);
      const meta = await extractMetadata(title, text, anthropic);
      results[f.id] = { driveId: f.id, title, ...meta };
      newCount++;
      saveProgress(results);
      console.log(`  → ${meta.scriptures.length} scriptures · ${meta.topics.length} topics`);
      await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      console.log(`  → Error: ${e.message}`);
    }
  }

  const sermons = Object.values(results).map((s, i) => ({ id: i + 1, ...s }));
  const js = 'export const SERMONS = ' + JSON.stringify(sermons, null, 2) + ';\n';
  writeFileSync(OUT_FILE, js);

  console.log(`\nDone. ${newCount} new · ${sermons.length} total · written to lib/sermons.js`);
}

main().catch(console.error);
