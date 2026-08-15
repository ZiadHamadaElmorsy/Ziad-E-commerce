/**
 * SAFE build-bundle diagnostic — prints ONLY booleans.
 *
 * Walks .next/static/chunks + .next/server chunks and reports whether the
 * production-ish markers are present. Never prints the Supabase URL, anon key,
 * service-role key, Paymob secrets, or the Render API URL.
 *
 * Usage: node scripts/diag-bundle.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '.next');
const PROJECT_REF = 'mqrqfdawbesmldgredsu'; // public supabase project ref (presence check only)
const ANON_KEY_FRAGMENT = 'sb_publishable'; // never present; placeholder
const RENDER_REF = 'ziad-e-commerce-api';
const LOCALHOST = 'localhost:4000';

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (/(\.js|\.jsx|\.mjs|\.txt)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

let files = [];
try {
  files = walk(ROOT);
} catch {
  console.error('No .next directory found. Run `npm run build` first.');
  process.exit(1);
}

let hasSupabaseRef = false;
let hasAnonFragment = false;
let hasRenderRef = false;
let hasLocalhost = false;
let emptySupabaseUrl = false;
let emptyAnonKey = false;
let localhostApiUrl = false;

for (const file of files) {
  let content = '';
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (content.includes(PROJECT_REF)) hasSupabaseRef = true;
  if (content.includes(ANON_KEY_FRAGMENT)) hasAnonFragment = true;
  if (content.includes(RENDER_REF)) hasRenderRef = true;
  if (content.includes(LOCALHOST)) hasLocalhost = true;
  // Detect an inlined empty supabase config: `supabaseUrl:""` / `supabaseUrl:"",`
  if (/supabaseUrl:\s*""/.test(content)) emptySupabaseUrl = true;
  if (/supabaseAnonKey:\s*""/.test(content)) emptyAnonKey = true;
  if (/apiUrl:\s*"http:\/\/localhost:4000\/api\/v1"/.test(content)) localhostApiUrl = true;
}

console.log('bundle contains supabase project ref (NEXT_PUBLIC_SUPABASE_URL present):', hasSupabaseRef);
console.log('bundle contains anon key fragment (NEXT_PUBLIC_SUPABASE_ANON_KEY present):', hasAnonFragment);
console.log('bundle contains render api ref (NEXT_PUBLIC_API_URL present):', hasRenderRef);
console.log('bundle contains localhost:4000 anywhere:', hasLocalhost);
console.log('bundle has EMPTY supabaseUrl (""):', emptySupabaseUrl);
console.log('bundle has EMPTY supabaseAnonKey (""):', emptyAnonKey);
console.log('bundle has apiUrl = localhost:4000/api/v1:', localhostApiUrl);
