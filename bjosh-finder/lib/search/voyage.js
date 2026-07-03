// Voyage embeddings via REST (1024-dim, cosine). Uses voyage-3-large to match the
// unified theology-kb corpus (the finder now reads JHM from theology-kb's public
// schema, not the old bjosh schema). Reads VOYAGE_API_KEY at call time.

const MODEL = 'voyage-3-large';
const DIM = 1024;
const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';

async function embed(texts, inputType) {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error('VOYAGE_API_KEY is not set');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: texts, input_type: inputType, output_dimension: DIM }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// Documents at index time.
export function embedDocuments(texts) {
  return embed(texts, 'document');
}

// Query at search time — Voyage uses an asymmetric query/document encoding.
export async function embedQuery(text) {
  const [v] = await embed([text], 'query');
  return v;
}

export const EMBED_DIM = DIM;
