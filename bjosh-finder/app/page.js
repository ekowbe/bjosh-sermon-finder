'use client';

import { useState, useRef, useEffect } from 'react';
import { SERMONS } from '@/lib/sermons';

const MATCH_WINDOW_WORDS = 12;
const MATCH_MIN_WORDS = 5;
const MATCH_DEBOUNCE_MS = 1800;
const MATCH_MIN_INTERVAL_MS = 6000;

const PALETTES = [
  ['#fa6f6f', '#fa2d6f'],
  ['#ff9f5a', '#fa2d6f'],
  ['#7f6fff', '#fa2d6f'],
  ['#5ad1ff', '#7f6fff'],
  ['#ffd15a', '#fa6f2d'],
  ['#5affc0', '#2dd4fa'],
];

function paletteFor(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function Artwork({ id, size = 'w-12 h-12', rounded = 'rounded-lg' }) {
  const [c1, c2] = paletteFor(String(id));
  return (
    <div
      className={`${size} ${rounded} shrink-0 flex items-center justify-center`}
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
    >
      <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const recRef = useRef(null);
  const bufferRef = useRef('');
  const stopRequestedRef = useRef(false);
  const searchTimerRef = useRef(null);
  const searchInFlightRef = useRef(false);
  const lastSearchAtRef = useRef(0);

  useEffect(() => {
    setSpeechSupported('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
    return () => clearTimeout(searchTimerRef.current);
  }, []);

  async function doSearch(q) {
    const searchQ = (q ?? query).trim();
    if (!searchQ) return;
    if (searchInFlightRef.current) return;
    searchInFlightRef.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQ }),
      });
      const data = await res.json();
      setResults(data.matches || []);
    } catch {
      setResults([]);
    }
    setLoading(false);
    searchInFlightRef.current = false;
  }

  function scheduleMatchSearch() {
    const words = bufferRef.current.trim().split(/\s+/).filter(Boolean);
    if (words.length < MATCH_MIN_WORDS) return;
    clearTimeout(searchTimerRef.current);
    const elapsed = Date.now() - lastSearchAtRef.current;
    if (elapsed >= MATCH_MIN_INTERVAL_MS) {
      lastSearchAtRef.current = Date.now();
      doSearch(bufferRef.current.trim());
    } else {
      // speech is still flowing in faster than our min interval — wait for a
      // pause (debounce) so we search once on the freshest window of words
      searchTimerRef.current = setTimeout(() => {
        lastSearchAtRef.current = Date.now();
        doSearch(bufferRef.current.trim());
      }, MATCH_DEBOUNCE_MS);
    }
  }

  // Listens continuously, sliding a window over the last ~30 spoken words and
  // re-searching whenever a final chunk comes in — lets you hold the mic up to
  // a sermon playing aloud and have it identify itself, not just one-shot queries.
  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    stopRequestedRef.current = false;
    bufferRef.current = '';
    lastSearchAtRef.current = 0;
    setQuery('');
    setResults(null);
    setTranscript('');

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const words = (bufferRef.current + ' ' + r[0].transcript).trim().split(/\s+/);
          bufferRef.current = words.slice(-MATCH_WINDOW_WORDS).join(' ');
          scheduleMatchSearch();
        } else {
          interim += r[0].transcript;
        }
      }
      setTranscript((bufferRef.current + ' ' + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopRequestedRef.current = true;
        setListening(false);
      }
      // other errors (no-speech, aborted, network blips) are recovered via onend restart
    };
    rec.onend = () => {
      if (stopRequestedRef.current) {
        setListening(false);
        return;
      }
      try {
        rec.start();
      } catch {
        setListening(false);
      }
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stopListening() {
    stopRequestedRef.current = true;
    clearTimeout(searchTimerRef.current);
    recRef.current?.stop();
    setListening(false);
  }

  function toggleListening() {
    if (listening) stopListening();
    else startListening();
  }

  const confidenceBadge = (c) => {
    if (c === 'high') return 'bg-rose-50 text-rose-600';
    if (c === 'medium') return 'bg-orange-50 text-orange-600';
    return 'bg-stone-100 text-stone-500';
  };

  const confidenceLabel = (c) => {
    if (c === 'high') return 'High match';
    if (c === 'medium') return 'Medium match';
    return 'Possible match';
  };

  const showHero = results === null && !loading;

  return (
    <main className="app-bg min-h-dvh flex flex-col items-center px-5 py-8 sm:py-10">
      <div className="w-full max-w-xl flex flex-col items-center">

        {/* Header */}
        <div className="w-full flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Search</h1>
          <div className="flex items-center gap-1.5 text-xs font-medium text-stone-400">
            <span>{SERMONS.length} sermons</span>
          </div>
        </div>

        {/* Text search */}
        <div className="w-full relative mb-7">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Sermons, scriptures, topics"
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-stone-100 text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none focus:bg-stone-200/70 transition-colors"
          />
        </div>

        {/* Hero / mic */}
        {showHero && (
          <div className="w-full flex flex-col items-center gap-3 pb-8">
            {speechSupported ? (
              <button
                onClick={toggleListening}
                aria-label={listening ? 'Stop listening' : 'Start listening'}
                className="relative flex items-center justify-center w-16 h-16 rounded-full transition-transform duration-150 active:scale-95 focus:outline-none"
                style={{
                  background: listening
                    ? 'linear-gradient(135deg, #ff9f5a, #fa2d6f)'
                    : 'linear-gradient(135deg, #fa6f6f, #fa2d6f)',
                  boxShadow: '0 8px 20px -6px rgba(250, 45, 111, 0.45)',
                }}
              >
                {listening && (
                  <>
                    <span className="absolute inset-0 rounded-full animate-ping-slow bg-rose-400/50" />
                    <span className="absolute inset-0 rounded-full animate-ping-slower bg-rose-400/30" />
                  </>
                )}
                <svg className="relative z-10" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
            ) : null}

            {listening ? (
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-stone-500 text-center max-w-sm min-h-[1.3em]">
                  {transcript ? `"${transcript}"` : 'Listening...'}
                </p>
                <button
                  onClick={stopListening}
                  className="text-xs font-medium text-rose-500 hover:text-rose-600"
                >
                  Stop
                </button>
              </div>
            ) : (
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">
                {speechSupported ? 'Tap to identify a sermon playing nearby' : ''}
              </p>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="w-full flex flex-col items-center gap-3 py-12">
            <div className="w-7 h-7 rounded-full border-[2.5px] border-stone-200 border-t-rose-500 animate-spin" />
            <p className="text-sm text-stone-400">Searching...</p>
          </div>
        )}

        {/* Results */}
        {results !== null && !loading && (
          <div className="w-full animate-rise-in">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">
                {results.length === 0 ? 'No results' : `${results.length} result${results.length !== 1 ? 's' : ''}`}
              </p>
              <button
                onClick={() => { setResults(null); setQuery(''); }}
                className="text-xs font-semibold text-rose-500 hover:text-rose-600"
              >
                Clear
              </button>
            </div>
            {results.length === 0 ? (
              <p className="text-center text-sm text-stone-400 py-10">Try different keywords or a scripture reference.</p>
            ) : (
              <div className="flex flex-col">
                {results.map((r, i) => (
                  <div key={r.driveId || r.youtubeId} className={`flex gap-3 py-3 ${i !== 0 ? 'border-t border-stone-100' : ''}`}>
                    <Artwork id={r.driveId || r.youtubeId} />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[15px] font-semibold text-stone-900 leading-snug">{r.title}</span>
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${confidenceBadge(r.confidence)} shrink-0 mt-0.5`}>
                          {confidenceLabel(r.confidence)}
                        </span>
                      </div>
                      {r.keyScripture && (
                        <p className="text-[13px] text-rose-500 font-medium mt-0.5">{r.keyScripture}</p>
                      )}
                      {r.summary && (
                        <p className="text-[13px] text-stone-500 leading-snug mt-0.5 line-clamp-2">{r.summary}</p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap mt-1.5">
                        {r.driveId && (
                          <a href={`https://drive.google.com/file/d/${r.driveId}/view`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-stone-900 hover:text-rose-500">
                            Transcript
                          </a>
                        )}
                        {r.audioId && (
                          <a href={`https://drive.google.com/file/d/${r.audioId}/view`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-stone-900 hover:text-rose-500">
                            Audio
                          </a>
                        )}
                        {r.youtubeId && (
                          <a href={`https://www.youtube.com/watch?v=${r.youtubeId}`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-stone-900 hover:text-rose-500">
                            YouTube
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Library */}
        {showHero && (
          <div className="w-full">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1 px-1">
              Library
            </p>
            <div className="flex flex-col">
              {SERMONS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => { setQuery(s.title); doSearch(s.title); }}
                  className={`flex items-center gap-3 py-2.5 hover:bg-stone-50 -mx-2 px-2 rounded-lg transition-colors text-left ${i !== 0 ? 'border-t border-stone-100' : ''}`}
                >
                  <Artwork id={s.driveId || s.youtubeId || s.id} size="w-10 h-10" rounded="rounded-md" />
                  <span className="flex-1 text-[14px] font-medium text-stone-800 truncate">{s.title}</span>
                  {s.keyScripture && (
                    <span className="text-[12px] text-stone-400 shrink-0">{s.keyScripture}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
