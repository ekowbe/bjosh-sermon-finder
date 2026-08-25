# BJosh Sermon Finder — Handoff

Sermon search/discovery app for Bishop Joshua Heward-Mills sermons. Next.js 15 (App Router) + Vercel.
Read this first each session. Durable detail: `bjosh-finder/DESIGN.md` (theme), `bjosh-finder/db/README.md` (search backend).

## Locations
- GitHub: https://github.com/ekowbe/bjosh-sermon-finder · Live: https://bjosh-sermon-finder.vercel.app
- Local: `~/Projects/bjosh-sermon-finder` (app in `bjosh-finder/`). Dev: `npm run dev` in that subdir.

## Current state
- **Corpus (UNIFIED):** search now reads the **shared theology-kb corpus**, not a private index. BJosh = Joshua Heward-Mills = theology-kb's **JHM**. **607 JHM sources** carry `bjosh` metadata (378 Drive full transcripts + 229 YouTube), **16,576 chunks**, all embedded with **voyage-3-large**. `lib/sermons.js` / `lib/playlists.js` still drive the catalog/category browse UI; search is corpus-backed.
- **UI redesign — PR #2 (`redesign-sanctuary-theme`), MERGED into the stack.** Custom "Sanctuary" theme (warm parchment/gold, Fraunces+Inter, lucide), design tokens, componentized `app/page.js`, `useVoice` hook, logic in `lib/format.js`.
- **Search backend — PR #3 (`feat/search-backend`), MERGED into the stack.** Pre-indexed hybrid retrieval (pgvector + tsvector RRF) + Sonnet 4.6 rerank (forced tool use → guaranteed JSON; falls back to retrieval order, never blanks).
- **Unification — DONE & LIVE (2026-07-03, PR #4 merged, `main` = `fec0ebb`).** Repointed search off the private `bjosh` schema onto theology-kb's `public.sources`/`public.chunks`. `db.js hybridSearch()` filters `author='jhm'` + `metadata->'bjosh' is not null` and maps the finder's field shape (`source/external_id/audio_id/key_scripture/summary/is_reconstructed`) out of `sources.metadata->'bjosh'`. `voyage.js` → `voyage-3-large` (matches the shared vector space).
  - **DEPLOY STATUS: ✅ shipped.** PR #4 (the whole stack: redesign + backend + backlog + unification) merged to main; Vercel prod deploy Ready. Verified on **bjosh-sermon-finder.vercel.app/api/search**: unified Drive + YouTube JHM results, reranked/graded, correct links. All 3 env vars present in Vercel Production.
  - **Old `bjosh` schema: ✅ DROPPED** (`drop schema bjosh cascade`, was 607 sermons / 28,517 chunks — a redundant private copy). Unified `public` corpus intact (607 sources). Prod search re-verified working *after* the drop.
- **Transcripts (from JHMVault, owned by theology-kb):** now theology-kb's responsibility — it owns the canonical JHM corpus and (re)embedding. The finder no longer indexes; its `scripts/index-*` + `db.js` writer fns (`upsertSermon`/`replaceChunks`/`isUpToDate`) are now **dead code** (they targeted the dropped `bjosh` schema) — safe to delete in a cleanup pass. `db.js sql()` still sets `search_path='bjosh,public,extensions'`; harmless (missing schemas are ignored) since all read queries are `public.`-qualified.

## How search works now (unified)
`app/api/search/route.js` → `lib/search/retrieve.js`: embed query (Voyage **voyage-3-large**) → hybrid RRF over **`public.chunks`** joined to `public.sources` (JHM + bjosh metadata) → Sonnet 4.6 rerank (forced tool use) → same `{matches:[…]}` shape (incl. `isReconstructed`). Needs `.env.local` (gitignored): `SUPABASE_DB_URL` (points at the theology-kb project), `VOYAGE_API_KEY`, `ANTHROPIC_API_KEY`. Verify: `node --env-file=bjosh-finder/.env.local bjosh-finder/test_unified.mjs "<query>"`.

## Next steps (priority)
1. **Cleanup pass (optional):** delete now-dead indexer code — `scripts/index-*`, the `upsertSermon`/`replaceChunks`/`isUpToDate` writers + `search_path` in `db.js`, `db/` runbook, `route.legacy.js` — all targeted the dropped `bjosh` schema.
2. New JHM sermons now flow through **theology-kb's** ingest (weekly YouTube), not the finder's own indexer — theology-kb must keep the `bjosh` metadata stamped on new JHM `public.sources` so they stay searchable here.
3. Category `videoIds` are hardcoded — new YT sermons won't auto-appear in browse categories (search is unaffected, it's corpus-backed).
4. The 34 captionless YouTube back-catalog videos still need a later Whisper pass (theology-kb's call now).

## Gotchas
- `yt-dlp` lives at `~/Library/Python/3.14/bin/yt-dlp` (not on PATH).
- Long sermons (1–2.5 hr) → large transcripts; chunker drops the altar-call tail + cleans `[music]`/entities.
- If a long overnight job needs `sudo pmset -a disablesleep 1`, remind to run `disablesleep 0` on completion.
