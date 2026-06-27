import { SERMONS } from '@/lib/sermons';
import { PLAYLISTS } from '@/lib/playlists';

// --- Match tuning (voice search) ---
export const MATCH = {
  WINDOW_WORDS: 12,
  MIN_WORDS: 5,
  DEBOUNCE_MS: 1800,
  MIN_INTERVAL_MS: 6000,
};

// --- Date parsing from messy sermon titles ---
export function parseDate(title) {
  if (!title) return '';
  let m = title.match(/\b(20\d{2})[.\-/](\d{2})[.\-/](\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = title.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+(\d{1,2})[\s,]+(\d{4})\b/i);
  if (m) {
    const mo = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    return `${m[3]}-${mo[m[1].toLowerCase().slice(0, 3)]}-${m[2].padStart(2, '0')}`;
  }
  m = title.match(/\b(20\d{2})\b/);
  return m ? `${m[1]}-00-00` : '';
}

export function fmtDate(d) {
  if (!d) return '';
  if (d.endsWith('-00-00')) return d.slice(0, 4);
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

// Strip leading date/prefix codes from a title for display + series grouping
export function cleanTitle(t) {
  t = t.replace(/^\d{4}[.\-/]\d{2}[.\-/]\d{2}[_\s]*[A-Za-z]*[_\s]*/i, '').trim();
  return t.replace(/^[A-Z]{2,8}[_\s]+/, '').trim();
}

function seriesKey(title) {
  let t = cleanTitle(title);
  t = t.replace(/^\d+\s+/, '');
  return t.replace(/[\s,|]+[Pp]art\s*\d+\s*$/, '').trim().toLowerCase();
}

// --- Playlist match by keyword overlap ---
export function playlistFor(s) {
  if (!s.topics?.length) return null;
  const t = s.topics.join(' ').toLowerCase();
  let best = null, top = 0;
  for (const pl of PLAYLISTS) {
    if (!pl.kw?.length || pl.hidden) continue;
    const n = pl.kw.reduce((a, k) => a + (t.includes(k) ? 1 : 0), 0);
    if (n > top) { top = n; best = pl.id; }
  }
  return best;
}

// --- Derived, memoized-at-module-load data ---
export const SS = [...SERMONS]
  .map((s) => ({ ...s, _d: s.published?.slice(0, 10) || parseDate(s.title) }))
  .sort((a, b) => (!a._d && !b._d ? 0 : !a._d ? 1 : !b._d ? -1 : b._d.localeCompare(a._d)));

function buildSeries() {
  const g = {};
  for (const s of SERMONS) {
    if (!s.driveId) continue;
    const raw = cleanTitle(s.title), key = seriesKey(s.title);
    if (key !== raw.toLowerCase() || /^\d+\s/.test(raw)) {
      if (!g[key]) {
        const title = cleanTitle(s.title).replace(/^\d+\s+/, '').replace(/[\s,|]+[Pp]art\s*\d+\s*$/, '').trim();
        g[key] = { key, title, ids: [] };
      }
      g[key].ids.push(s.id);
    }
  }
  return Object.values(g).filter((x) => x.ids.length >= 2);
}

export const SERIES = buildSeries();

// --- Warm gold-leaning artwork palette (replaces rainbow) ---
const PAL = [
  ['#E5A53B', '#B26B12'], ['#D98B4A', '#9C4F1E'], ['#C9852E', '#7A4A12'], ['#B8623A', '#6E2A23'],
  ['#9A7B3A', '#5E4718'], ['#CE9248', '#8A5A1A'], ['#A86B45', '#5C3017'], ['#C27A2E', '#74400F'],
];

export function palette(k) {
  let h = 0;
  const s = String(k);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PAL[h % PAL.length];
}

export function confColors(c) {
  if (c === 'high') return { text: '#1E6F47', bg: '#E7F2EB', label: 'High' };
  if (c === 'medium') return { text: '#9A6212', bg: '#FBF0DC', label: 'Medium' };
  return { text: '#6B6157', bg: '#F3EDE1', label: 'Low' };
}
