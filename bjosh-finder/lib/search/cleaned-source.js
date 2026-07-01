// Manifest-driven loader for the AI-cleaned transcript corpus.
// Joins each cleaned file (keyed by filename) to its canonical sermon identity
// via the manifest's driveId, and to app metadata via lib/sermons.js. Pure +
// no DB — the indexer consumes this; unit-testable on its own.
//
// Manifest entry shape (per cleaned filename):
//   { driveId, youtubeId, rawPath, contentHash, cleanerVersion, isReconstructed,
//     sermonTitle, viewUrl, status, movedTo? }
//
// `status` (authoritative, set by theology-kb which owns the cleaned set):
//   'ok'                  — clean, full recovery
//   'partial-recovery'    — usable, meta-preamble stripped
//   'unrecoverable-source'— corrupt/foreign-garbled/worship-only audio; the .txt
//                           is quarantined to `_unrecoverable/` (see `movedTo`).
// We index only ok + partial-recovery, and only sermons present in sermons.js.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SERMONS } from '../sermons.js';

export const INDEXABLE_STATUSES = new Set(['ok', 'partial-recovery']);

const wordCount = (t) => (t.toLowerCase().match(/[a-z']+/g) || []).length;

export function loadManifest(dir) {
  const p = join(dir, 'manifest.json');
  if (!existsSync(p)) throw new Error(`manifest.json not found in ${dir}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

// Returns { records, skipped, orphans }:
//   records  — indexable: CATALOGUED sermons with status ok|partial-recovery.
//              { source, externalId, title, topics, scriptures, keyScripture,
//                summary, audioId, text, words, isReconstructed, contentHash,
//                cleanerVersion, status }
//   skipped  — catalogued but status unrecoverable-source (or file missing):
//              { filename, status, reason }
//   orphans  — manifest entries with no lib/sermons.js record. NOT indexed: per
//              theology-kb these are worship clips / alternate cuts of a
//              catalogued sermon, not standalone sermons. Reported for provenance.
export function buildIndexRecords(dir) {
  const manifest = loadManifest(dir);
  const byDrive = new Map(SERMONS.filter((s) => s.driveId).map((s) => [s.driveId, s]));

  const records = [], skipped = [], orphans = [];
  for (const [filename, m] of Object.entries(manifest)) {
    const id = m.driveId || m.youtubeId;
    if (!id) continue;
    const sermon = m.driveId ? byDrive.get(m.driveId) : null;
    if (!sermon) { orphans.push({ filename, driveId: m.driveId, title: m.sermonTitle, status: m.status }); continue; }

    // Authoritative recoverability gate (replaces the old word-count heuristic).
    const status = m.status || 'ok';
    if (!INDEXABLE_STATUSES.has(status)) { skipped.push({ filename, status, reason: 'unrecoverable-source' }); continue; }

    // Quarantined files live under _unrecoverable/ (movedTo); resolve the path.
    const path = join(dir, m.movedTo || filename);
    if (!existsSync(path)) { skipped.push({ filename, status, reason: 'missing-file' }); continue; }
    const text = readFileSync(path, 'utf8');

    records.push({
      source: m.youtubeId ? 'youtube' : 'drive',
      externalId: id,
      title: sermon.title || m.sermonTitle || filename.replace(/\.txt$/i, ''),
      topics: sermon.topics || [],
      scriptures: sermon.scriptures || [],
      keyScripture: sermon.keyScripture || '',
      summary: sermon.summary || '',
      audioId: sermon.audioId || '',
      text,
      words: wordCount(text),
      isReconstructed: m.isReconstructed !== false,
      contentHash: m.contentHash || '',
      cleanerVersion: m.cleanerVersion || '',
      status,
    });
  }
  return { records, skipped, orphans };
}
