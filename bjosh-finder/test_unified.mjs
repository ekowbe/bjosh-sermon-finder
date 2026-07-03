// Verify the finder now searches the unified theology-kb corpus (JHM). Run:
//   node --env-file=/Users/ekowbentsi-enchill/Projects/r20-sermon-prep/.env.local test_unified.mjs
import { search } from "./lib/search/retrieve.js";

const q = process.argv[2] ?? "the anointing of the holy spirit";
const res = await search(q, { rerank: false, k: 8 });
console.log(`query: "${q}" → ${res.length} results`);
for (const r of res) {
  const link = r.youtubeId ? `yt:${r.youtubeId}` : r.driveId ? `drive:${r.driveId}` : "(no link)";
  console.log(`  [${r.confidence}] ${r.title}  — ${link}${r.isReconstructed ? " ·recon" : ""}`);
}
process.exit(0);
