// YouTube caption fetching via yt-dlp (same approach as scripts/index-youtube.js).
// Returns deduped plain text, or null when no English captions exist.
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

export function vttToPlainText(vtt) {
  const seen = new Set();
  const out = [];
  for (const raw of vtt.split('\n')) {
    const line = raw.trim();
    if (!line || line.includes('-->') || line.startsWith('WEBVTT') || line.startsWith('Kind:') || line.startsWith('Language:')) continue;
    const cleaned = line.replace(/<[^>]+>/g, '');
    if (cleaned && !seen.has(cleaned)) { seen.add(cleaned); out.push(cleaned); }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export function fetchCaptions(videoId) {
  const dir = mkdtempSync(join(tmpdir(), 'yt-cap-'));
  try {
    execFileSync('yt-dlp', [
      '--skip-download', '--write-auto-sub', '--sub-lang', 'en', '--sub-format', 'vtt',
      '-o', '%(id)s.%(ext)s', `https://www.youtube.com/watch?v=${videoId}`,
    ], { cwd: dir, stdio: 'pipe' });
    const vttPath = join(dir, `${videoId}.en.vtt`);
    return existsSync(vttPath) ? vttToPlainText(readFileSync(vttPath, 'utf8')) : null;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
