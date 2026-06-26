# BJosh Sermon Finder — Handoff

## Repo
- GitHub: https://github.com/ekowbe/bjosh-sermon-finder
- Vercel: https://bjosh-sermon-finder.vercel.app
- Local: `/tmp/bjosh-sermon-finder/` (clone; may not persist across reboots)

## Project Structure
```
bjosh-sermon-finder/
  bjosh-finder/           ← Next.js 15 app (App Router)
    app/
      page.js             ← ALL UI in one file ('use client')
      globals.css         ← animations: spin, ping-slow, ping-slower, rise-in
      api/search/route.js ← semantic search via Drive fullText + Anthropic
    lib/
      sermons.js          ← SERMONS array (Drive + YouTube, auto-generated)
      playlists.js        ← PLAYLISTS array (6 categories + 1 hidden)
      youtube-transcripts.json ← cached YouTube captions
    scripts/
      index-youtube.js    ← weekly GitHub Action indexer
      index-progress.json ← Drive sermon index progress
      youtube-progress.json ← YouTube index progress
  .github/workflows/
    youtube-index.yml     ← cron: every Monday 06:00 UTC
```

## App Architecture

### Single-file UI (`app/page.js`)
All components in one minified-style file:
- `Art` — sermon artwork (YouTube thumbnail or Drive color block)
- `Row` — single sermon list row
- `Sheet` — bottom sheet player (audio for Drive sermons, YouTube embed)
- `Lib` — Library tab: Browse by category grid → category drill-down → sermon list
- `Srch` — Search tab (DEFAULT VIEW): big mic hero + text search bar
- `NavBtn` — bottom nav button
- `App` — root; 2-tab nav: **Search** (default) + Library

### Key constants (top of page.js)
```js
const MATCH_MIN_WORDS = 4
const MATCH_MIN_INTERVAL_MS = 4000
const MATCH_DEBOUNCE_MS = 1500
const MATCH_WINDOW_WORDS = 40
```

### Speech Recognition (in Srch)
- Web Speech API, continuous mode, sliding window of last 40 words
- Debounced: fires search after 4s or 1.5s debounce
- `go()` / `end()` start/stop; `sched()` → `srchMic()` triggers API call
- Transcript displayed live below mic button

### Search API (`app/api/search/route.js`)
1. Drive `fullText` search (pre-filters candidates)
2. YouTube transcript in-memory search
3. Clips snippet to **first 80% of transcript** (altar call boilerplate lives in last 20%)
4. Sends snippets to `claude-sonnet-4-5` for ranking + confidence scoring
5. Returns `{matches: [{title, driveId|youtubeId, confidence, keyScripture, summary}]}`

## Categories (`lib/playlists.js`)
6 broad categories (replacing original 14 specific ones):

| id | title | ~sermons |
|----|-------|---------|
| `holy-spirit` | The Holy Spirit | 96 |
| `prayer-and-devotion` | Prayer & Devotion | 60 |
| `salvation-and-evangelism` | Salvation & Evangelism | 82 |
| `discipleship` | Discipleship | 75 |
| `church-and-ministry` | Church & Ministry | 50 |
| `spiritual-warfare` | Spiritual Warfare | 25 |
| `tuesday-meeting-god` | (hidden) | — |

Categorization uses `plFor(s)` — keyword scoring against `topics` array per sermon.
Unmatched: 1 (empty-topic sermon titled '11.'). Low-confidence: ~38.

## Design System
- Primary red: `#FC3C44`
- Dark text: `#1C1C1E`
- Secondary text: `#8E8E93`
- Background: `#F2F2F7`
- Cards: `#fff`
- Apple Music–inspired UI

### Search screen layout
- Red gradient header ("Find a Sermon" / "Listening…")
- 72px circular mic button with pulsing rings (ping-slow/ping-slower animations)
- Live transcript caption below mic
- Text search bar below the mic section
- Results or "All Sermons" list below

## Recent Changes (this session)
1. **Consolidated 14 → 6 categories** in `lib/playlists.js`
2. **Removed Home tab** — 2-tab nav: Search (default) + Library
3. **Big mic hero on Search screen** — restored Apple Music–style red gradient header + large centered mic
4. **Search snippet trimmed to 80%** — fixes "born again" returning altar-call matches
5. **Tighter search prompt** — AI instructed to exclude altar call / closing prayer excerpts

## Known Issues / TODO
- Category keyword matching is weak for some sermons (~38 low-confidence)
- `playlists.js` `videoIds` arrays are hardcoded; new YouTube sermons indexed via GitHub Action won't auto-appear in categories
- `sermons.js` model still references `claude-sonnet-4-5` (indexer); consider upgrading to `claude-sonnet-4-6`

## Key Files to Know
- All UI: `bjosh-finder/app/page.js`
- Categories + keywords: `bjosh-finder/lib/playlists.js`
- Search logic: `bjosh-finder/app/api/search/route.js`
- Sermon data: `bjosh-finder/lib/sermons.js` (auto-generated, don't hand-edit)
