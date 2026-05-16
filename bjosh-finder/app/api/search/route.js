import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

const FOLDER_ID = '1TvUjIL9px2q29TJcu3-QW_BAqkmWLg_S';

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

async function readSnippet(fileId, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return text.slice(0, 3000);
}

export async function POST(request) {
  const { query } = await request.json();
  if (!query?.trim()) return NextResponse.json({ matches: [] });

  try {
    const token = await getAccessToken();

    // Search Drive full-text
    const files = await searchDrive(query, token);

    if (!files.length) return NextResponse.json({ matches: [] });

    // Read snippets from top results
    const snippets = await Promise.all(
      files.slice(0, 8).map(async (f) => {
        const text = await readSnippet(f.id, token);
        return { id: f.id, title: f.name.replace('.txt', ''), snippet: text };
      })
    );

    // Ask Claude to rank and explain
    const prompt = `You help find BJosh (Bishop Joshua Heward-Mills) sermons. User searched: "${query}"

Here are the matching sermons with transcript excerpts:

${snippets.map((s, i) => `[${i + 1}] "${s.title}"
Excerpt: ${s.snippet.slice(0, 800)}
---`).join('\n')}

Rank these by relevance to the search query. Return a JSON array:
[{"index": 1, "confidence": "high"|"medium"|"low", "keyScripture": "main scripture if found or empty string", "summary": "one crisp sentence on what this sermon is about"}]
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
    const ranked = JSON.parse(text.replace(/```json|```/g, '').trim());

    const matches = ranked.map(r => ({
      driveId: snippets[r.index - 1]?.id,
      title: snippets[r.index - 1]?.title,
      confidence: r.confidence,
      keyScripture: r.keyScripture,
      summary: r.summary,
    })).filter(m => m.driveId);

    return NextResponse.json({ matches });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ matches: [] });
  }
}
