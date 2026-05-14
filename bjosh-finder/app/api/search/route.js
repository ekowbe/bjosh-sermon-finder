import { NextResponse } from 'next/server';
import { SERMONS } from '@/lib/sermons';

export async function POST(request) {
  const { query } = await request.json();

  if (!query?.trim()) {
    return NextResponse.json({ error: 'No query provided' }, { status: 400 });
  }

  const prompt = `You help find BJosh (Bishop Joshua Heward-Mills) sermons from First Love Church. User searched: "${query}"

Library:
${SERMONS.map(s => `[${s.id}] "${s.title}" | Topics: ${s.topics.join(', ')} | Scriptures: ${s.scriptures.join(', ') || 'none'}`).join('\n')}

Return only a JSON array of matches ordered by relevance. Each item: {"id":number,"matchReason":"1-2 sentences","confidence":"high"|"medium"|"low"}. Only include genuine matches. Return ONLY valid JSON, nothing else.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '[]';
    const matches = JSON.parse(text.replace(/```json|```/g, '').trim());
    return NextResponse.json({ matches });
  } catch (e) {
    return NextResponse.json({ matches: [] });
  }
}
