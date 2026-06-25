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
    if (c === 'high') return 'bg-green-100 text-green-800';
    if (c === 'medium') return 'bg-amber-100 text-amber-800';
    return 'bg-stone-100 text-stone-600';
  };

  const confidenceLabel = (c) => {
    if (c === 'high') return 'High match';
    if (c === 'medium') return 'Medium match';
    return 'Possible match';
  };

  return (
    <main className="min-h-dvh flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF9F27" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <h1 className="text-xl font-medium text-stone-900">BJosh Sermon Finder</h1>
          </div>
          <p className="text-sm text-stone-500">Search by topic, scripture, speak a phrase, or hold the mic up to a playing sermon</p>
        </div>

        {/* Mic button */}
        {speechSupported && (
          <div className="flex flex-col items-center gap-3 mb-6">
            <button
              onClick={toggleListening}
              aria-label={listening ? 'Stop listening' : 'Start listening'}
              className="relative flex items-center justify-center w-20 h-20 rounded-full text-white transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              style={{ background: listening ? '#BA7517' : '#EF9F27' }}
            >
              {listening && (
                <>
                  <span className="absolute inset-0 rounded-full animate-ping-slow" style={{ background: '#EF9F27', opacity: 0.4 }} />
                  <span className="absolute inset-0 rounded-full animate-ping-slower" style={{ background: '#EF9F27', opacity: 0.2 }} />
                </>
              )}
              <svg className="relative z-10" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            {listening && (
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-stone-500 italic text-center max-w-sm">
                  {transcript ? `"${transcript}"` : 'Listening for a question or a sermon playing nearby...'}
                </p>
                <button
                  onClick={stopListening}
                  className="text-xs text-amber-600 hover:text-amber-700 underline"
                >
                  Stop listening
                </button>
              </div>
            )}
          </div>
        )}

        {/* Text search */}
        <div className="flex gap-2 mb-8">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="e.g. John 3:16 · suffering · why preach Christ..."
            className="flex-1 h-10 px-3 rounded-lg border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
          <button
            onClick={() => doSearch()}
            className="px-4 h-10 rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-sm font-medium transition-all"
          >
            Search
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <p className="text-center text-sm text-stone-500 py-8">Searching sermons...</p>
        )}

        {/* Results */}
        {results !== null && !loading && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-stone-500">
                {results.length === 0 ? 'No sermons found' : `${results.length} sermon${results.length !== 1 ? 's' : ''} found`}
              </p>
              <button
                onClick={() => { setResults(null); setQuery(''); }}
                className="text-xs text-amber-600 hover:text-amber-700"
              >
                ← All sermons
              </button>
            </div>
            {results.length === 0 ? (
              <p className="text-center text-sm text-stone-400 py-6">Try different keywords or a scripture reference.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {results.map((r, i) => (
                  <div key={r.driveId} className="bg-white rounded-xl border border-stone-200 p-4">
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-xs font-medium text-amber-700 shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap mb-1">
                          <span className="text-sm font-medium text-stone-900">{r.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${confidenceBadge(r.confidence)}`}>
                            {confidenceLabel(r.confidence)}
                          </span>
                        </div>
                        {r.keyScripture && (
                          <p className="text-xs text-amber-700 font-medium mb-1">{r.keyScripture}</p>
                        )}
                        {r.summary && (
                          <p className="text-xs text-stone-500 leading-relaxed mb-2">{r.summary}</p>
                        )}
                        <a
                          href={`https://drive.google.com/file/d/${r.driveId}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-amber-600 hover:text-amber-700"
                        >
                          Open transcript →
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Library */}
        {results === null && !loading && (
          <div>
            <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">
              Library · {SERMONS.length} sermons indexed
            </p>
            <div className="flex flex-col gap-1.5">
              {SERMONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setQuery(s.title); doSearch(s.title); }}
                  className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border border-stone-200 hover:border-amber-300 hover:bg-amber-50 transition-colors text-left"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span className="flex-1 text-sm text-stone-800">{s.title}</span>
                  {s.keyScripture && (
                    <span className="text-xs text-stone-400 shrink-0">{s.keyScripture}</span>
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
