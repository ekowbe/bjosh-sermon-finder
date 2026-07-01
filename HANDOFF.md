# BJosh Sermon Finder — Handoff

Sermon search/discovery app for Bishop Joshua Heward-Mills sermons. Next.js 15 (App Router) + Vercel.
Read this first each session. Durable detail: `bjosh-finder/DESIGN.md` (theme), `bjosh-finder/db/README.md` (search backend).

## Locations
- GitHub: https://github.com/ekowbe/bjosh-sermon-finder · Live: https://bjosh-sermon-finder.vercel.app
- Local: `~/Projects/bjosh-sermon-finder` (app in `bjosh-finder/`). Dev: `npm run dev` in that subdir.

## Current state
- **Corpus:** 389 Drive sermons (full transcripts) + 9 YouTube = 398 searchable. `lib/sermons.js` (auto-generated, don't hand-edit), `lib/playlists.js` (6 categories + 1 hidden; references 271 unique YouTube videoIds, ~262 not yet searchable).
- **UI redesign — PR #2 (`redesign-sanctuary-theme`), open.** Custom "Sanctuary" theme (warm parchment/gold, Fraunces+Inter, lucide), design tokens, componentized `app/page.js`, `useVoice` hook, logic in `lib/format.js`. Replaced the Apple-Music clone.
- **Search backend — PR #3 (`feat/search-backend`, stacked on #2), open, DORMANT.** Pre-indexed hybrid retrieval (pgvector + tsvector RRF) + Sonnet 4.6 rerank, Voyage 3 embeddings. Lives in a dedicated **`bjosh` schema co-tenanted inside the theology-kb Supabase project** (free tier caps 2 projects); isolated + reversible via `drop schema bjosh cascade`. Replaces slow query-time Drive/YouTube scan. Live route untouched until cutover (rename `route.v2.js`→`route.js`).
- **Transcripts (from JHMVault, owned by theology-kb):** **`~/Desktop/jhm_transcripts_cleaned/`** = index/search source. `manifest.json` (405 entries) is the authority: per-file `driveId`, `contentHash`, `isReconstructed`, and **`status`** (390 `ok` / 4 `partial-recovery` / 11 `unrecoverable-source`). The 11 unrecoverable `.txt` are quarantined in `_unrecoverable/`; folder root = 394 real transcripts. Raw originals (`~/Downloads/BJosh Sermons/transcripts/`) = verbatim/citation source. **Loader `lib/search/cleaned-source.js`** joins manifest→`sermons.js` by driveId and gates on `status ∈ {ok, partial-recovery}` → **378 indexable** catalogued sermons (~17.7k chunks); 21 orphans (worship clips/alt cuts) + 6 catalogued-unrecoverable excluded. Carries `is_reconstructed`/`status`/`contentHash` per record for UI provenance. theology-kb: "clear to embed."

## How search works TODAY (until #3 cutover)
`app/api/search/route.js`: Drive `fullText contains` (keyword only) + scan 9 cached YT transcripts → `claude-sonnet-4-5` ranks → `{matches:[{title,driveId|youtubeId,confidence,keyScripture,summary}]}`. Slow + keyword-only = the problem #3 fixes.

## Next steps (priority)
1. **Merge #2, then #3** (base auto-retargets to main).
2. **Stand up the search index** — `npm run db:init` (applies schema to `bjosh` schema), set keys, index, cutover. Full runbook: `db/README.md`. Index from `transcripts_cleaned/` once its path is confirmed on disk.
3. **YouTube back-catalog** — bulk fetch has RUN: `scripts/fetch-youtube-backlog.js` staged **232** transcripts in `lib/youtube-backlog-transcripts.json` (266 attempted, 34 captionless, 0 manual subs). Still TODO: BJosh-filter + metadata + dedup-vs-Drive pass (needs `ANTHROPIC_API_KEY`) to promote staged → curated `lib/sermons.js`, then index. The 34 captionless need a later Whisper pass.
4. Upgrade indexer model `claude-sonnet-4-5` → `4-6` (`scripts/index-youtube.js`).
5. Category `videoIds` are hardcoded — new YT sermons won't auto-appear in categories.

## Gotchas
- `yt-dlp` lives at `~/Library/Python/3.14/bin/yt-dlp` (not on PATH).
- Long sermons (1–2.5 hr) → large transcripts; chunker drops the altar-call tail + cleans `[music]`/entities.
- If a long overnight job needs `sudo pmset -a disablesleep 1`, remind to run `disablesleep 0` on completion.
