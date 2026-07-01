// NEW search route — pre-indexed hybrid retrieval + optional Claude rerank.
// DORMANT until cutover: Next.js App Router only serves a file named route.js,
// so this `.v2.js` sits inert next to the current route. To go live once the
// Supabase index is populated:
//
//     mv app/api/search/route.js     app/api/search/route.legacy.js
//     mv app/api/search/route.v2.js  app/api/search/route.js
//
// Returns the identical { matches: [...] } shape, so the UI needs no changes.

import { NextResponse } from 'next/server';
import { search } from '@/lib/search/retrieve';

export async function POST(request) {
  const { query } = await request.json();
  if (!query?.trim()) return NextResponse.json({ matches: [] });
  try {
    const matches = await search(query, { rerank: true });
    return NextResponse.json({ matches });
  } catch (e) {
    console.error('search v2:', e);
    return NextResponse.json({ matches: [] });
  }
}
