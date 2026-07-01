# Search backend — setup & cutover

Pre-indexed hybrid search (vector + keyword) with an optional Claude rerank.
Replaces the slow query-time Drive/YouTube scan. UI is unaffected — the new
route returns the same `{ matches: [...] }` shape.

## One-time setup

1. **Create a dedicated Supabase project** for BJosh (free tier is plenty for
   ~400 sermons / a few thousand chunks). Keep it separate from theology-kb.
2. **Apply the schema**: paste `db/schema.sql` into the Supabase SQL editor and
   run it (enables `vector` + `pg_trgm`, creates `sermons` + `chunks`, indexes).
3. **Add keys to `.env.local`** (never commit — already gitignored):
   ```
   SUPABASE_DB_URL=postgresql://...    # session pooler, port 5432
   VOYAGE_API_KEY=...
   ANTHROPIC_API_KEY=...               # used by rerank + indexer metadata
   GOOGLE_CLIENT_EMAIL=...             # only needed to index Drive transcripts
   GOOGLE_PRIVATE_KEY=...
   ```
4. **Install `yt-dlp`** (only needed to fetch YouTube transcripts not already
   cached in `lib/youtube-transcripts.json`): `brew install yt-dlp`.

## Build the index

```bash
npm run index:build -- --source youtube --limit 5   # smoke test on 5
npm run index:build                                  # full corpus
```
Incremental: a sermon whose transcript `content_hash` is unchanged is skipped.
Re-run weekly (wire into the existing GitHub Action after `index:youtube`).

> Coverage note: today only ~9 YouTube transcripts are cached, because
> `index-youtube.js` reads each channel's RSS feed (recent uploads only). The
> ~400-video back-catalog in `lib/playlists.js` has never been transcribed.
> `build-index.js` will fetch missing captions via yt-dlp on first full run.

## Cutover (after the index is populated)

```bash
mv app/api/search/route.js     app/api/search/route.legacy.js
mv app/api/search/route.v2.js  app/api/search/route.js
```
Verify search in the UI, then delete `route.legacy.js`.

## Files
- `db/schema.sql` — Postgres schema + indexes
- `lib/search/chunk.js` — pure chunker (window + tail-drop + caption cleaning)
- `lib/search/voyage.js` — Voyage 3 embeddings (REST)
- `lib/search/db.js` — Postgres client + hybrid RRF query
- `lib/search/retrieve.js` — query → embed → hybrid → Claude rerank
- `lib/search/{captions,drive}.js` — transcript fetching
- `scripts/build-index.js` — offline indexer (incremental)
- `app/api/search/route.v2.js` — new route (dormant until cutover)
