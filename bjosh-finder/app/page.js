'use client';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Mic, Search as SearchIcon, Library as LibraryIcon, ChevronRight, ArrowLeft,
  X, FileText, Volume2, SquarePlay, Loader2, BookOpen, Sparkles,
} from 'lucide-react';
import { SERMONS } from '@/lib/sermons';
import { PLAYLISTS } from '@/lib/playlists';
import {
  MATCH, parseDate, fmtDate, cleanTitle, playlistFor, palette, confColors, SS,
} from '@/lib/format';

const withDate = (r) => ({ ...r, _d: r.published?.slice(0, 10) || parseDate(r.title) });

/* ------------------------------------------------------------------ */
/* Voice search hook — encapsulates Web Speech API + debounced query  */
/* ------------------------------------------------------------------ */
function useVoice(onQuery) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [supported, setSupported] = useState(false);
  const rec = useRef(null), buf = useRef(''), stop = useRef(false), tmr = useRef(null), last = useRef(0);

  useEffect(() => {
    setSupported('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
    return () => clearTimeout(tmr.current);
  }, []);

  const schedule = useCallback(() => {
    const words = buf.current.trim().split(/\s+/).filter(Boolean);
    if (words.length < MATCH.MIN_WORDS) return;
    clearTimeout(tmr.current);
    const elapsed = Date.now() - last.current;
    const fire = () => { last.current = Date.now(); onQuery(buf.current.trim()); };
    if (elapsed >= MATCH.MIN_INTERVAL_MS) fire();
    else tmr.current = setTimeout(fire, MATCH.DEBOUNCE_MS);
  }, [onQuery]);

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    stop.current = false; buf.current = ''; last.current = 0;
    setTranscript('');
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = 'en-US';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const words = (buf.current + ' ' + res[0].transcript).trim().split(/\s+/);
          buf.current = words.slice(-MATCH.WINDOW_WORDS).join(' ');
          schedule();
        } else interim += res[0].transcript;
      }
      setTranscript((buf.current + ' ' + interim).trim());
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stop.current = true; setListening(false); }
    };
    r.onend = () => {
      if (stop.current) { setListening(false); return; }
      try { r.start(); } catch { setListening(false); }
    };
    rec.current = r; r.start(); setListening(true);
  }, [schedule]);

  const end = useCallback(() => {
    stop.current = true; clearTimeout(tmr.current); rec.current?.stop(); setListening(false);
  }, []);

  return { listening, transcript, supported, start, end };
}

async function runSearch(query, guard, setLoad, setRes) {
  if (!query || guard.current) return;
  guard.current = true; setLoad(true);
  try {
    const r = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const d = await r.json();
    setRes(d.matches || []);
  } catch { setRes([]); }
  setLoad(false); guard.current = false;
}

/* ------------------------------------------------------------------ */
/* Artwork — warm gradient panel with a serif monogram                */
/* ------------------------------------------------------------------ */
function Artwork({ seed, title, size = 52, radius = 12, kind = 'sermon' }) {
  const [c1, c2] = palette((kind === 'playlist' ? 'pl-' : '') + seed);
  const letter = (cleanTitle(title || '') || title || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden shrink-0"
      style={{
        width: size, height: size, minWidth: size, borderRadius: radius,
        background: `linear-gradient(150deg, ${c1}, ${c2})`,
        boxShadow: '0 4px 14px rgba(33,28,23,0.18)',
      }}
    >
      <span
        className="font-serif select-none"
        style={{
          fontSize: size * 0.52, fontWeight: 700, lineHeight: 1,
          color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em',
        }}
      >
        {letter}
      </span>
      <div
        aria-hidden
        className="absolute"
        style={{
          right: -size * 0.18, top: -size * 0.18, width: size * 0.7, height: size * 0.7,
          borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
        }}
      />
    </div>
  );
}

function ConfBadge({ confidence }) {
  const c = confColors(confidence);
  return (
    <span
      className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ color: c.text, background: c.bg }}
    >
      {c.label}
    </span>
  );
}

function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-8 text-sm text-muted">
      <Loader2 size={18} className="animate-spin" style={{ color: 'var(--gold)' }} />
      {label}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* List row                                                           */
/* ------------------------------------------------------------------ */
function SermonRow({ s, first, onClick }) {
  const meta = [s.keyScripture, fmtDate(s._d)].filter(Boolean).join('  ·  ');
  return (
    <button
      onClick={() => onClick(s)}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2/60"
      style={{ borderTop: first ? 'none' : '1px solid var(--line)' }}
    >
      <Artwork seed={s.driveId || s.youtubeId || s.id} title={s.title} size={46} radius={10} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[15px] font-semibold leading-tight text-ink">{s.title}</p>
        {meta && <p className="mt-0.5 truncate text-xs text-muted">{meta}</p>}
      </div>
      <ChevronRight size={16} className="shrink-0 text-faint" />
    </button>
  );
}

/* Rich result card (search + voice results) */
function ResultCard({ r, first, onClick }) {
  const s = withDate(r);
  return (
    <button
      onClick={() => onClick(s)}
      className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60"
      style={{ borderTop: first ? 'none' : '1px solid var(--line)' }}
    >
      <Artwork seed={r.driveId || r.youtubeId} title={r.title} size={52} radius={11} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-1.5">
          <span className="font-serif text-[15px] font-semibold leading-tight text-ink">{r.title}</span>
          {r.confidence && <ConfBadge confidence={r.confidence} />}
        </div>
        {r.keyScripture && (
          <p className="mt-1 text-[13px] font-semibold" style={{ color: 'var(--gold)' }}>{r.keyScripture}</p>
        )}
        {r.summary && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{r.summary}</p>
        )}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Detail sheet                                                       */
/* ------------------------------------------------------------------ */
function ActionLink({ href, icon: Icon, children, tone }) {
  const styles = tone === 'gold'
    ? { background: 'linear-gradient(135deg, var(--gold-bright), var(--gold))', color: '#fff' }
    : tone === 'youtube'
    ? { background: '#E0322B', color: '#fff' }
    : { background: 'var(--surface-2)', color: 'var(--ink)' };
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold transition-transform active:scale-[0.98]"
      style={styles}
    >
      <Icon size={17} />{children}
    </a>
  );
}

function SermonSheet({ s, onClose }) {
  const ds = fmtDate(s._d);
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(33,28,23,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up max-h-[86vh] w-full overflow-y-auto rounded-t-3xl bg-surface pb-10"
      >
        <div className="mx-auto mt-3 mb-4 h-1 w-9 rounded-full" style={{ background: 'var(--line)' }} />
        <div className="px-5">
          <div className="mb-5 flex items-start gap-4">
            <Artwork seed={s.driveId || s.youtubeId || s.id} title={s.title} size={80} radius={16} />
            <div className="min-w-0 flex-1 pt-1">
              <p className="font-serif text-[20px] font-bold leading-snug text-ink">{s.title}</p>
              {s.keyScripture && (
                <p className="mt-1.5 text-sm font-semibold" style={{ color: 'var(--gold)' }}>{s.keyScripture}</p>
              )}
              {ds && <p className="mt-0.5 text-[13px] text-muted">{ds}</p>}
            </div>
          </div>

          {s.summary && (
            <div className="mb-4 rounded-2xl p-4" style={{ background: 'var(--surface-2)' }}>
              <p className="text-sm leading-relaxed text-ink/80">{s.summary}</p>
            </div>
          )}

          {s.topics?.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-1.5">
              {s.topics.map((t) => (
                <span key={t} className="rounded-full px-2.5 py-1 text-xs font-medium text-muted" style={{ background: 'var(--surface-2)' }}>
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {s.driveId && <ActionLink href={`https://drive.google.com/file/d/${s.driveId}/view`} icon={FileText}>Read transcript</ActionLink>}
            {s.audioId && <ActionLink href={`https://drive.google.com/file/d/${s.audioId}/view`} icon={Volume2} tone="gold">Listen to audio</ActionLink>}
            {s.youtubeId && <ActionLink href={`https://www.youtube.com/watch?v=${s.youtubeId}`} icon={SquarePlay} tone="youtube">Watch on YouTube</ActionLink>}
          </div>

          {s.isReconstructed && (
            <p className="mt-4 flex items-start gap-1.5 text-[12px] leading-snug text-faint">
              <Sparkles size={13} className="mt-0.5 shrink-0" />
              Search uses an AI-cleaned transcript. For exact wording, check the audio.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero + mic                                                         */
/* ------------------------------------------------------------------ */
function Hero({ eyebrow, title }) {
  return (
    <div
      className="relative overflow-hidden px-5 pb-7 pt-14"
      style={{ background: 'linear-gradient(160deg, var(--espresso) 0%, var(--clay) 100%)' }}
    >
      <div
        aria-hidden className="pointer-events-none absolute"
        style={{ right: -60, top: -80, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(229,165,59,0.4), transparent 70%)' }}
      />
      <p className="relative mb-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'rgba(229,165,59,0.85)' }}>
        {eyebrow}
      </p>
      <h1 className="relative font-serif text-[34px] font-bold leading-none text-white" style={{ letterSpacing: '-0.01em' }}>
        {title}
      </h1>
    </div>
  );
}

function MicPanel({ listening, transcript, supported, onToggle }) {
  if (!supported) return null;
  return (
    <div className="flex flex-col items-center gap-3 border-b bg-surface px-5 py-6" style={{ borderColor: 'var(--line)' }}>
      <div className="relative flex h-20 w-20 items-center justify-center">
        {listening && (
          <>
            <span className="absolute inset-0 rounded-full animate-ping-slow" style={{ background: 'rgba(178,107,18,0.18)' }} />
            <span className="absolute inset-0 rounded-full animate-ping-slower" style={{ background: 'rgba(178,107,18,0.1)' }} />
          </>
        )}
        <button
          onClick={onToggle}
          aria-label={listening ? 'Stop listening' : 'Identify a sermon'}
          className="relative z-10 flex h-[72px] w-[72px] items-center justify-center rounded-full transition-transform active:scale-95"
          style={{
            background: 'linear-gradient(135deg, var(--gold-bright), var(--gold))',
            boxShadow: '0 10px 30px rgba(178,107,18,0.4)',
          }}
        >
          <Mic size={28} color="#fff" />
        </button>
      </div>
      <p className="text-center text-[13px] text-muted">
        {listening
          ? (transcript ? `“${transcript}”` : 'Listening for a sermon…')
          : 'Tap to identify a sermon playing nearby'}
      </p>
    </div>
  );
}

/* Horizontal shelf of artwork cards */
function Shelf({ title, action, children }) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-baseline justify-between px-5">
        <h2 className="font-serif text-[22px] font-bold text-ink">{title}</h2>
        {action}
      </div>
      <div className="no-scrollbar flex gap-3.5 overflow-x-auto px-5 pb-2">{children}</div>
    </section>
  );
}

function ResultsBlock({ res, onClear, onSel, emptyHint }) {
  return (
    <div className="px-4 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          {res.length === 0 ? 'No results' : `${res.length} result${res.length !== 1 ? 's' : ''}`}
        </p>
        <button onClick={onClear} className="text-sm font-semibold" style={{ color: 'var(--gold)' }}>Clear</button>
      </div>
      {res.length === 0 ? (
        <p className="py-6 text-sm text-muted">{emptyHint}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-surface shadow-soft">
          {res.map((r, i) => <ResultCard key={r.driveId || r.youtubeId || i} r={r} first={i === 0} onClick={onSel} />)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Search tab                                                         */
/* ------------------------------------------------------------------ */
function SearchTab({ onSel, onCat }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [load, setLoad] = useState(false);
  const [lim, setLim] = useState(40);
  const typeGuard = useRef(false), voiceGuard = useRef(false), inp = useRef(null);

  const voice = useVoice(useCallback((query) => {
    runSearch(query, voiceGuard, setLoad, setRes);
  }, []));

  const submit = () => runSearch(q.trim(), typeGuard, setLoad, setRes);
  const onMic = () => {
    if (voice.listening) voice.end();
    else { setRes(null); setQ(''); voice.start(); }
  };

  const browsing = !q && !res && !voice.listening;

  return (
    <div className="min-h-[100dvh] bg-bg pb-28">
      <Hero eyebrow="BJosh Sermons" title={voice.listening ? 'Listening…' : 'Find a sermon'} />
      <MicPanel listening={voice.listening} transcript={voice.transcript} supported={voice.supported} onToggle={onMic} />

      {/* search field */}
      <div className="px-4 pt-4">
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            ref={inp} value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Search by topic, scripture, or phrase…"
            className="h-11 w-full rounded-xl border-none bg-surface-2 pl-9 pr-9 text-[15px] text-ink outline-none placeholder:text-faint"
          />
          {q && (
            <button
              onClick={() => { setQ(''); setRes(null); inp.current?.focus(); }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full"
              style={{ background: 'var(--faint)' }}
            >
              <X size={11} color="#fff" />
            </button>
          )}
        </div>
        {q && (
          <button
            onClick={submit}
            className="mt-2 w-full rounded-xl py-2.5 text-[15px] font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, var(--gold-bright), var(--gold))' }}
          >
            Search
          </button>
        )}
      </div>

      {load && <Spinner label={voice.listening ? 'Identifying…' : 'Searching…'} />}
      {res !== null && !load && (
        <ResultsBlock res={res} onClear={() => setRes(null)} onSel={onSel} emptyHint="Try different keywords or a scripture reference." />
      )}

      {browsing && (
        <>
          <Shelf title="Featured series">
            {PLAYLISTS.filter((p) => !p.hidden).slice(0, 12).map((pl) => (
              <button key={pl.id} onClick={() => onCat(pl.id)} className="w-[136px] shrink-0 text-left">
                <Artwork seed={pl.id} title={pl.title} size={136} radius={14} kind="playlist" />
                <p className="mt-2 line-clamp-2 font-serif text-[14px] font-semibold leading-tight text-ink">{pl.title}</p>
                <p className="text-[11px] text-faint">{pl.videoIds.length} videos</p>
              </button>
            ))}
          </Shelf>

          <Shelf title="Recently added">
            {SS.slice(0, 18).map((s) => (
              <button key={s.id} onClick={() => onSel(s)} className="w-[126px] shrink-0 text-left">
                <Artwork seed={s.driveId || s.youtubeId || s.id} title={s.title} size={126} radius={14} />
                <p className="mt-2 line-clamp-2 font-serif text-[13px] font-semibold leading-tight text-ink">{s.title}</p>
                {s._d && <p className="text-[11px] text-faint">{fmtDate(s._d)}</p>}
              </button>
            ))}
          </Shelf>

          <section className="px-4 pt-7">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">All sermons</p>
            <div className="overflow-hidden rounded-2xl bg-surface shadow-soft">
              {SS.slice(0, lim).map((s, i) => <SermonRow key={s.id} s={s} first={i === 0} onClick={onSel} />)}
              {lim < SS.length && (
                <button
                  onClick={() => setLim((l) => l + 40)}
                  className="w-full py-3.5 text-sm font-semibold"
                  style={{ borderTop: '1px solid var(--line)', color: 'var(--gold)' }}
                >
                  Show more ({SS.length - lim} remaining)
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drill-down list                                                    */
/* ------------------------------------------------------------------ */
function DrillView({ title, subtitle, sermons, onBack, onSel }) {
  const [q, setQ] = useState('');
  const list = q
    ? sermons.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()) || s.keyScripture?.toLowerCase().includes(q.toLowerCase()))
    : sermons;
  return (
    <div className="min-h-[100dvh] bg-bg">
      <div className="sticky top-0 z-10 border-b bg-surface px-4 pb-3 pt-3" style={{ borderColor: 'var(--line)' }}>
        <button onClick={onBack} className="mb-2 flex items-center gap-1 text-[15px] font-medium" style={{ color: 'var(--gold)' }}>
          <ArrowLeft size={17} />Back
        </button>
        <h2 className="font-serif text-[24px] font-bold text-ink">{title}</h2>
        <p className="mb-3 mt-0.5 text-[13px] text-muted">{subtitle || `${sermons.length} sermons`}</p>
        <div className="relative">
          <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter"
            className="h-9 w-full rounded-lg border-none bg-surface-2 pl-8 pr-3 text-sm text-ink outline-none placeholder:text-faint"
          />
        </div>
      </div>
      <div className="mx-4 mb-28 mt-3 overflow-hidden rounded-2xl bg-surface shadow-soft">
        {list.map((s, i) => <SermonRow key={s.id} s={s} first={i === 0} onClick={onSel} />)}
        {!list.length && <p className="px-4 py-8 text-center text-sm text-muted">No sermons match.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Library tab                                                        */
/* ------------------------------------------------------------------ */
function LibraryTab({ onSel }) {
  const [tab, setTab] = useState('categories');
  const [drill, setDrill] = useState(null);

  const ytMap = useMemo(() => {
    const m = new Map();
    for (const s of SS) if (s.youtubeId) m.set(s.youtubeId, s);
    return m;
  }, []);

  const byPlaylist = useMemo(() => PLAYLISTS.map((pl) => {
    const ytMatches = pl.videoIds.map((id) => ytMap.get(id)).filter(Boolean);
    const driveMatches = SS.filter((s) => s.driveId && playlistFor(s) === pl.id);
    return { ...pl, sermons: [...ytMatches, ...driveMatches] };
  }).filter((pl) => pl.sermons.length > 0), [ytMap]);

  const byYear = useMemo(() => {
    const g = {};
    for (const s of SS) { const y = s._d?.slice(0, 4) || 'Undated'; (g[y] ||= []).push(s); }
    return Object.entries(g).sort(([a], [b]) => (a === 'Undated' ? 1 : b === 'Undated' ? -1 : b.localeCompare(a)));
  }, []);

  if (drill) return <DrillView title={drill.title} subtitle={drill.sub} sermons={drill.list} onBack={() => setDrill(null)} onSel={onSel} />;

  return (
    <div className="min-h-[100dvh] bg-bg pb-28">
      <div className="px-4 pb-3 pt-14">
        <h1 className="mb-4 font-serif text-[32px] font-bold text-ink">Library</h1>
        <div className="flex rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
          {[['categories', 'Categories'], ['date', 'By date']].map(([id, lbl]) => (
            <button
              key={id} onClick={() => setTab(id)}
              className="flex-1 rounded-lg py-1.5 text-[13px] font-semibold transition-all"
              style={tab === id
                ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 4px rgba(33,28,23,0.1)' }
                : { background: 'transparent', color: 'var(--muted)' }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {tab === 'categories' && (
        <div className="px-4">
          <div className="mb-2.5 overflow-hidden rounded-2xl bg-surface shadow-soft">
            {byPlaylist.map((pl, i) => (
              <button
                key={pl.id}
                onClick={() => setDrill({ title: pl.title, sub: `${pl.sermons.length} sermons`, list: pl.sermons })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
              >
                <Artwork seed={pl.id} title={pl.title} size={52} radius={11} kind="playlist" />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[15px] font-semibold text-ink">{pl.title}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{pl.sermons.length} sermons</p>
                </div>
                <ChevronRight size={16} className="text-faint" />
              </button>
            ))}
          </div>
          <button
            onClick={() => setDrill({ title: 'All sermons', sub: `${SS.length} sermons`, list: SS })}
            className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left shadow-soft"
          >
            <div className="flex h-[52px] w-[52px] min-w-[52px] items-center justify-center rounded-xl" style={{ background: 'linear-gradient(150deg, #4A403A, #2A211A)' }}>
              <BookOpen size={22} color="#fff" />
            </div>
            <div className="flex-1">
              <p className="font-serif text-[15px] font-semibold text-ink">All sermons</p>
              <p className="mt-0.5 text-[13px] text-muted">{SS.length} sermons</p>
            </div>
            <ChevronRight size={16} className="text-faint" />
          </button>
        </div>
      )}

      {tab === 'date' && (
        <div className="px-4">
          {byYear.map(([year, list]) => (
            <button
              key={year}
              onClick={() => setDrill({ title: year === 'Undated' ? 'Undated sermons' : year, sub: `${list.length} sermons`, list })}
              className="mb-2.5 flex w-full items-center justify-between rounded-2xl bg-surface px-4 py-3.5 text-left shadow-soft"
            >
              <div>
                <p className="font-serif text-[20px] font-bold text-ink">{year}</p>
                <p className="mt-0.5 text-[13px] text-muted">{list.length} sermons</p>
              </div>
              <ChevronRight size={16} className="text-faint" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom nav + shell                                                 */
/* ------------------------------------------------------------------ */
function NavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className="flex min-w-[64px] flex-col items-center gap-1 py-1" aria-label={label}>
      <Icon size={22} style={{ color: active ? 'var(--gold)' : 'var(--faint)' }} strokeWidth={active ? 2.4 : 1.9} />
      <span className="text-[10px] font-semibold" style={{ color: active ? 'var(--gold)' : 'var(--faint)' }}>{label}</span>
    </button>
  );
}

export default function App() {
  const [view, setView] = useState('search');
  const [sel, setSel] = useState(null);

  return (
    <>
      <div className="min-h-[100dvh] bg-bg">
        {view === 'search' && <SearchTab onSel={setSel} onCat={() => setView('library')} />}
        {view === 'library' && <LibraryTab onSel={setSel} />}
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center gap-12 pt-2"
        style={{
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          background: 'rgba(250,246,239,0.9)',
          backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
          borderTop: '1px solid var(--line)',
        }}
      >
        <NavButton icon={SearchIcon} label="Search" active={view === 'search'} onClick={() => setView('search')} />
        <NavButton icon={LibraryIcon} label="Library" active={view === 'library'} onClick={() => setView('library')} />
      </nav>

      {sel && <SermonSheet s={sel} onClose={() => setSel(null)} />}
    </>
  );
}
