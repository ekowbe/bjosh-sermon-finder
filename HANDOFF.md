# BJosh Sermon Finder — Handoff

Sermon search/discovery app for Bishop Joshua Heward-Mills sermons. Next.js 15 (App Router) + Vercel.
Read this first each session. Durable detail: `bjosh-finder/DESIGN.md` (theme), `bjosh-finder/db/README.md` (search backend).

## Locations
- GitHub: https://github.com/ekowbe/bjosh-sermon-finder · Live: https://bjosh-sermon-finder.vercel.app
- Local: `~/Projects/bjosh-sermon-finder` (app in `bjosh-finder/`). Dev: `npm run dev` in that subdir.

## Current state
- **Corpus:** 389 Drive sermons (full transcripts) + 9 YouTube = 398 searchable. `lib/sermons.js` (auto-generated, don't hand-edit), `lib/playlists.js` (6 categories + 1 hidden; references 271 unique YouTube videoIds, ~262 not yet searchable).
- **UI redesign — PR #2 (`redesign-sanctuary-theme`), open.** Custom "Sanctuary" theme (warm parchment/gold, Fraunces+Inter, lucide), design tokens, componentized `app/page.js`, `useVoice` hook, logic in `lib/format.js`. Replaced the Apple-Music clone.
- **Search backend — PR #3 (`feat/search-backend`, stacked on #2), open, DORMANT.** Pre-indexed hybrid retrieval (pgvector + tsvector RRF) + Sonnet 4.6 rerank, Voyage 3 embeddings, own Supabase project. Replaces slow query-time Drive/YouTube scan. Live route untouched until cutover (rename `route.v2.js`→`route.js`).

## How search works TODAY (until #3 cutover)
`app/api/search/route.js`: Drive `fullText contains` (keyword only) + scan 9 cached YT transcripts → `claude-sonnet-4-5` ranks → `{matches:[{title,driveId|youtubeId,confidence,keyScripture,summary}]}`. Slow + keyword-only = the problem #3 fixes.

## Next steps (priority)
1. **Merge #2, then #3** (base auto-retargets to main).
2. **Stand up the search index** — provision Supabase, set keys, `npm run index:build`, cutover. Full runbook: `db/README.md`.
3. **YouTube back-catalog** — ~262 playlist videos aren't searchable. Probe (15 sampled): ~87% have EN auto-captions, ~13% none, 0 manual. Plan: `scripts/fetch-youtube-backlog.js` bulk-fetches captions (resumable, throttled) → then metadata+dedup-vs-Drive (needs `ANTHROPIC_API_KEY`) → index. The ~13% captionless need a later Whisper pass.
4. Upgrade indexer model `claude-sonnet-4-5` → `4-6` (`scripts/index-youtube.js`).
5. Category `videoIds` are hardcoded — new YT sermons won't auto-appear in categories.

## Gotchas
- `yt-dlp` lives at `~/Library/Python/3.14/bin/yt-dlp` (not on PATH).
- Long sermons (1–2.5 hr) → large transcripts; chunker drops the altar-call tail + cleans `[music]`/entities.
- If a long overnight job needs `sudo pmset -a disablesleep 1`, remind to run `disablesleep 0` on completion.
