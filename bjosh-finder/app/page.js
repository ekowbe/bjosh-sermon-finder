'use client';

import { useState, useRef, useEffect } from 'react';
import { SERMONS } from '@/lib/sermons';

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const recRef = useRef(null);

  useEffect(() => {
    setSpeechSupported('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }, []);

  async function doSearch(q) {
    const searchQ = (q || query).trim();
    if (!searchQ) return;
    setLoading(true);
    setResults(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQ }),
      });
      const data = await res.json();
      const enriched = (data.matches || [])
        .map(m => ({ ...m, sermon: SERMONS.find(s => s.id === m.id) }))
        .filter(m => m.sermon);
      setResults(enriched);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }

  function toggleListening() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = e => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(' ');
      setTranscript(t);
      if (e.results[e.results.length - 1].isFinal) {
        setQuery(t);
        setListening(false);
        doSearch(t);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
    setTranscript('');
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
          <p className="text-sm text-stone-500">Search by topic, scripture, or speak a phrase</p>
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
              <p className="text-sm text-stone-500 italic">
                {transcript ? `"${transcript}"` : 'Listening...'}
              </p>
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
                  <div key={r.id} className="bg-white rounded-xl border border-stone-200 p-4">
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-xs font-medium text-amber-700 shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap mb-1">
                          <span className="text-sm font-medium text-stone-900">{r.sermon.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${confidenceBadge(r.confidence)}`}>
                            {confidenceLabel(r.confidence)}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 leading-relaxed mb-2">{r.matchReason}</p>
                        {r.sermon.scriptures.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap mb-2">
                            {r.sermon.scriptures.map(s => (
                              <span key={s} className="text-xs px-2 py-0.5 rounded border border-stone-200 text-stone-500">{s}</span>
                            ))}
                          </div>
                        )}
                        <a
                          href={`https://drive.google.com/file/d/${r.sermon.driveId}/view`}
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
                  {s.scriptures.length > 0 && (
                    <span className="text-xs text-stone-400 shrink-0">{s.scriptures[0]}</span>
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
