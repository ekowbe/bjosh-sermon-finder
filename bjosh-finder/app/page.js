'use client';

import { useState, useRef, useEffect } from 'react';
import { SERMONS } from '@/lib/sermons';

const MATCH_WINDOW_WORDS = 12;
const MATCH_MIN_WORDS = 5;
const MATCH_DEBOUNCE_MS = 1800;
const MATCH_MIN_INTERVAL_MS = 6000;

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
    if (c === 'high') return 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30';
    if (c === 'medium') return 'bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30';
    return 'bg-white/10 text-white/60 ring-1 ring-white/15';
  };

  const confidenceLabel = (c) => {
    if (c === 'high') return 'High match';
    if (c === 'medium') return 'Medium match';
    return 'Possible match';
  };

  const showHero = results === null && !loading;

  return (
    <main className="app-bg min-h-dvh flex flex-col items-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-xl flex flex-col items-center">

        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF9F27" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          <h1 className="text-sm font-medium tracking-wide text-white/70 uppercase">BJosh Sermon Finder</h1>
        </div>

        {/* Hero / mic */}
        {showHero && (
          <div className="flex flex-col items-center gap-5 pt-6 pb-10">
            <p className="text-white/50 text-sm text-center max-w-xs">
              {listening
                ? 'Listening...'
                : 'Tap to identify a sermon playing nearby, or search below'}
            </p>

            {speechSupported ? (
              <button
                onClick={toggleListening}
                aria-label={listening ? 'Stop listening' : 'Start listening'}
                className={`relative flex items-center justify-center w-40 h-40 sm:w-48 sm:h-48 rounded-full text-white transition-transform duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${!listening ? 'animate-glow-pulse' : ''}`}
                style={{
                  background: listening
                    ? 'radial-gradient(circle at 35% 30%, #ffb24d, #BA7517 70%)'
                    : 'radial-gradient(circle at 35% 30%, #5fa8ff, #1d5fd6 70%)',
                }}
              >
                {listening && (
                  <>
                    <span className="absolute inset-0 rounded-full animate-ping-slow" style={{ background: '#EF9F27', opacity: 0.35 }} />
                    <span className="absolute inset-0 rounded-full animate-ping-slower" style={{ background: '#EF9F27', opacity: 0.2 }} />
                  </>
                )}
                <svg className="relative z-10" width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
            ) : (
              <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full flex items-center justify-center bg-white/5 ring-1 ring-white/10 text-white/30 text-xs text-center px-6">
                Voice search isn't supported in this browser
              </div>
            )}

            {listening ? (
              <div className="flex flex-col items-center gap-2 max-w-sm">
                <p className="text-sm text-white/80 italic text-center min-h-[1.5em]">
                  {transcript ? `"${transcript}"` : ' '}
                </p>
                <button
                  onClick={stopListening}
                  className="text-xs text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  Stop listening
                </button>
              </div>
            ) : (
              <p className="text-xs text-white/30">{SERMONS.length} sermons indexed</p>
            )}
          </div>
        )}

        {/* Text search */}
        <div className="w-full flex gap-2 mb-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="e.g. John 3:16 · suffering · why preach Christ..."
            className="flex-1 h-11 px-4 rounded-full bg-white/8 backdrop-blur ring-1 ring-white/15 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-blue-400/60"
          />
          <button
            onClick={() => doSearch()}
            className="px-5 h-11 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-white text-sm font-medium transition-all"
          >
            Search
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="w-full flex flex-col items-center gap-3 py-12">
            <div className="w-10 h-10 rounded-full border-2 border-white/15 border-t-blue-400 animate-spin" />
            <p className="text-sm text-white/50">Searching sermons...</p>
          </div>
        )}

        {/* Results */}
        {results !== null && !loading && (
          <div className="w-full mt-4 animate-rise-in">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-white/50">
                {results.length === 0 ? 'No sermons found' : `${results.length} sermon${results.length !== 1 ? 's' : ''} found`}
              </p>
              <button
                onClick={() => { setResults(null); setQuery(''); }}
                className="text-xs text-amber-300 hover:text-amber-200"
              >
                ← All sermons
              </button>
            </div>
            {results.length === 0 ? (
              <p className="text-center text-sm text-white/35 py-6">Try different keywords or a scripture reference.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {results.map((r, i) => (
                  <div key={r.driveId} className="bg-white/6 backdrop-blur rounded-2xl ring-1 ring-white/10 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 ring-1 ring-blue-400/30 flex items-center justify-center text-xs font-medium text-blue-300 shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap mb-1">
                          <span className="text-sm font-medium text-white">{r.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${confidenceBadge(r.confidence)}`}>
                            {confidenceLabel(r.confidence)}
                          </span>
                        </div>
                        {r.keyScripture && (
                          <p className="text-xs text-amber-300 font-medium mb-1">{r.keyScripture}</p>
                        )}
                        {r.summary && (
                          <p className="text-xs text-white/50 leading-relaxed mb-2">{r.summary}</p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                          <a
                            href={`https://drive.google.com/file/d/${r.driveId}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-300 hover:text-blue-200"
                          >
                            Open transcript →
                          </a>
                          {r.audioId && (
                            <a
                              href={`https://drive.google.com/file/d/${r.audioId}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-amber-300 hover:text-amber-200"
                            >
                              Listen to audio →
                            </a>
                          )}
                        </div>
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
          <div className="w-full mt-2">
            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">
              Library · {SERMONS.length} sermons indexed
            </p>
            <div className="flex flex-col gap-1.5">
              {SERMONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setQuery(s.title); doSearch(s.title); }}
                  className="flex items-center gap-3 px-3 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl ring-1 ring-white/10 hover:ring-blue-400/30 transition-colors text-left"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span className="flex-1 text-sm text-white/80">{s.title}</span>
                  {s.keyScripture && (
                    <span className="text-xs text-white/30 shrink-0">{s.keyScripture}</span>
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
