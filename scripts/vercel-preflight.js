// First step of the Vercel build: explains in plain words which settings are still missing.
const need = [
  ['DATABASE_URL', 'Storage tab → create/connect a Neon database to this project'],
  ['DATABASE_URL_UNPOOLED', 'added together with DATABASE_URL when Neon is connected'],
  ['BLOB_READ_WRITE_TOKEN', 'Storage tab → create/connect a Blob store (for photos and backups)'],
  ['JWT_SECRET', 'Settings → Environment Variables (a long random key, see DEPLOY.md step 2)'],
  ['SMTP_HOST', 'Settings → Environment Variables (smtp.gmail.com for Gmail)'],
  ['SMTP_USER', 'Settings → Environment Variables (the Gmail address)'],
  ['SMTP_PASS', 'Settings → Environment Variables (the Gmail app password)'],
];
const missing = need.filter(([k]) => !process.env[k]);
const shortSecret = process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32;

if (missing.length || shortSecret) {
  console.error('\n================ GVA: settings missing ================');
  for (const [k, how] of missing) console.error(`  ✗ ${k.padEnd(22)} → ${how}`);
  if (shortSecret) console.error(`  ✗ JWT_SECRET             → must be at least 32 characters`);
  console.error('\nAdd them in Vercel, then Deployments → ⋯ → Redeploy. (Full guide: DEPLOY.md)');
  console.error('=======================================================\n');
  process.exit(1);
}
console.log('GVA: all required settings are present ✓');
