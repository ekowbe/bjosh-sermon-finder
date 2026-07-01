// Pure transcript chunker — no I/O, no secrets. Unit-testable.
//
// Strategy (from the research): ~250-token windows on sentence boundaries
// with small overlap, and DROP the final tail of every transcript. BJosh
// sermons almost always close with a salvation altar call regardless of
// topic, so tail chunks are noise for topical retrieval. This applies the
// route's old query-time "last 20%" heuristic at index time instead.

const DEFAULTS = {
  targetWords: 180,      // ~240 tokens
  overlapWords: 30,      // continuity across window edges
  dropTailFraction: 0.2, // drop the closing altar-call portion
  minChunkWords: 25,     // discard slivers
};

// Strip non-speech caption noise that pollutes embeddings: bracketed cues
// like [music]/[singing]/[applause], stray HTML entities, and ">>" speaker
// markers left over from auto-captions.
export function cleanTranscript(text) {
  return text
    .replace(/\[[^\]]*\]/g, ' ')          // [music], [singing], [applause]…
    .replace(/&gt;|&lt;|&amp;|&quot;|&#39;/g, ' ')
    .replace(/>>+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split into sentences; caption text with no punctuation falls back to one
// long "sentence" that the windower below will slice by word count.
function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function words(s) {
  return s.split(/\s+/).filter(Boolean);
}

export function chunkTranscript(fullText, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!fullText || !fullText.trim()) return [];

  const clean = cleanTranscript(fullText);
  // Drop the closing tail by character length.
  const body = clean.slice(0, Math.floor(clean.length * (1 - o.dropTailFraction)));

  // Flatten to a word stream, but remember sentence ends so we can prefer
  // breaking on them when a window is "full enough".
  const sentences = splitSentences(body);
  const stream = [];
  for (const s of sentences) {
    const ws = words(s);
    for (let i = 0; i < ws.length; i++) {
      stream.push({ w: ws[i], sentenceEnd: i === ws.length - 1 });
    }
  }
  if (!stream.length) return [];

  const chunks = [];
  let pos = 0, start = 0;
  while (start < stream.length) {
    let end = Math.min(start + o.targetWords, stream.length);
    // Extend slightly to the next sentence boundary so we don't cut mid-thought.
    while (end < stream.length && end - start < o.targetWords + 40 && !stream[end - 1].sentenceEnd) end++;

    const text = stream.slice(start, end).map((t) => t.w).join(' ');
    if (words(text).length >= o.minChunkWords) {
      chunks.push({ position: pos++, text });
    }
    if (end >= stream.length) break;
    start = Math.max(end - o.overlapWords, start + 1);
  }
  return chunks;
}

// One-line context header prepended to each chunk before embedding
// (Anthropic "contextual retrieval"): grounds the chunk in its sermon.
export function contextHeader({ title, topics = [] }) {
  const topicStr = topics.slice(0, 6).join(', ');
  return topicStr ? `Sermon: ${title}. Topics: ${topicStr}.` : `Sermon: ${title}.`;
}
