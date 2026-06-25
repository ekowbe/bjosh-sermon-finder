import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SERMONS } from '@/lib/sermons';

const TRANSCRIPTS_PATH = join(process.cwd(), 'lib', 'youtube-transcripts.json');
const YOUTUBE_TRANSCRIPTS = existsSync(TRANSCRIPTS_PATH)
  ? JSON.parse(readFileSync(TRANSCRIPTS_PATH, 'utf8'))
  : {};

const FOLDER_ID = '1TvUjIL9px2q29TJcu3-QW_BAqkmWLg_S';
const audioByDriveId = new Map(SERMONS.filter(s => s.audioId).map(s => [s.driveId, s.audioId]));
const youtubeMetaById = new Map(SERMONS.filter(s => s.youtubeId).map(s => [s.youtubeId, s]));

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

async function searchDrive(query, token) {
  const q = `fullText contains '${query.replace(/'/g, "\\'")}' and '${FOLDER_ID}' in parents and mimeType = 'text/plain'`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=12`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.files || [];
}

async function readFullText(fileId, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.text();
}

// Drive's fullText search scans the whole document, but the opening of a
// transcript is usually just prayer/worship — so locate where the query
// phrase actually occurs and center the excerpt there instead of always
// sending the start of the file.
function extractRelevantSnippet(fullText, query) {
  const lowerFull = fullText.toLowerCase();
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  for (let len = words.length; len >= Math.min(4, words.length); len--) {
    for (let start = 0; start + len <= words.length; start++) {
      const idx = lowerFull.indexOf(words.slice(start, start + len).join(' '));
      if (idx !== -1) {
        const from = Math.max(0, idx - 800);
        return { snippet: fullText.slice(from, from + 2500), matched: true };
      }
    }
  }
  return { snippet: fullText.slice(0, 3000), matched: false };
}

// Drive's fullText search pre-filters candidates for us; YouTube sermons have
// no such index, so only include one as a candidate if the query phrase
// actually occurs somewhere in its caption transcript.
function searchYoutubeTranscripts(query) {
  const candidates = [];
  for (const [youtubeId, transcript] of Object.entries(YOUTUBE_TRANSCRIPTS)) {
    const { snippet, matched } = extractRelevantSnippet(transcript, query);
    if (matched) {
      const meta = youtubeMetaById.get(youtubeId);
      candidates.push({ youtubeId, title: meta?.title || youtubeId, snippet });
    }
  }
  return candidates;
}

export async function POST(request) {
  const { query } = await request.json();
  if (!query?.trim()) return NextResponse.json({ matches: [] });

  try {
    const token = await getAccessToken();
    const files = await searchDrive(query, token);

    const driveSnippets = await Promise.all(
      files.slice(0, 8).map(async (f) => {
        const fullText = await readFullText(f.id, token);
        return { driveId: f.id, title: f.name.replace('.txt', ''), snippet: extractRelevantSnippet(fullText, query).snippet };
      })
    );
    const youtubeSnippets = searchYoutubeTranscripts(query).slice(0, 4);
    const snippets = [...driveSnippets, ...youtubeSnippets];

    if (!snippets.length) return NextResponse.json({ matches: [] });

    const prompt = `You help find BJosh (Bishop Joshua Heward-Mills) sermons. User searched: "${query}"

Here are matching sermons with transcript excerpts (numbered 0 to ${snippets.length - 1}):

${snippets.map((s, i) => `[${i}] "${s.title}"
Excerpt: ${s.snippet}
---`).join('\n')}

Rank these by relevance. Exclude any sermon where the topic only appears in an opening prayer, worship section, or passing mention — only include sermons where it is a central teaching point. Return a JSON array using the exact 0-based index shown above:
[{"index": 0, "confidence": "high"|"medium"|"low", "keyScripture": "main scripture or empty string", "summary": "one crisp sentence on what this sermon is about"}]
Return ONLY valid JSON, nothing else.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '[]';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/) || cleaned.match(/^\[\s*\]/);
    const ranked = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    const matches = ranked
      .map(r => {
        const s = snippets[r.index];
        if (!s) return null;
        const base = {
          title: s.title,
          confidence: r.confidence,
          keyScripture: r.keyScripture || '',
          summary: r.summary || '',
        };
        if (s.driveId) {
          return { ...base, driveId: s.driveId, audioId: audioByDriveId.get(s.driveId) || '' };
        }
        return { ...base, youtubeId: s.youtubeId };
      })
      .filter(Boolean);

    return NextResponse.json({ matches });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ matches: [] });
  }
}
