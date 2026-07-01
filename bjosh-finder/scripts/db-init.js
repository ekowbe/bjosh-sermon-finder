// Apply db/schema.sql to the search database (the bjosh schema inside the
// shared Supabase project). Idempotent. Run: npm run db:init
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error('SUPABASE_DB_URL is not set'); process.exit(1); }

const schema = readFileSync(join(__dirname, '../db/schema.sql'), 'utf8');
const sql = postgres(url, { prepare: false, max: 1 });

try {
  await sql.unsafe(schema);
  const [{ count: sermons }] = await sql`select count(*)::int from bjosh.sermons`;
  const [{ count: chunks }] = await sql`select count(*)::int from bjosh.chunks`;
  console.log(`Schema applied. bjosh.sermons=${sermons} bjosh.chunks=${chunks}`);
} catch (e) {
  console.error('Schema init failed:', e.message);
  process.exit(1);
} finally {
  await sql.end();
}
