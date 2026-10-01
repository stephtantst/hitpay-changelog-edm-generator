/**
 * Setup check for a fresh clone: `npm run doctor`.
 * Verifies everything the curation pipeline needs and says exactly what to fix.
 * Exits non-zero only on problems that stop the web UI from running at all.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
dotenv.config({ path: ENV_PATH });

type Status = 'ok' | 'warn' | 'fail';
const results: Array<{ status: Status; name: string; detail: string }> = [];
const report = (status: Status, name: string, detail: string) => results.push({ status, name, detail });

// Placeholder values copied straight from .env.example count as "not set"
const isSet = (v?: string) => !!v && !/x{6,}/i.test(v);

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20) report('ok', 'Node.js', `v${process.versions.node}`);
  else report('fail', 'Node.js', `v${process.versions.node} — need v20+ (v22 recommended, see .nvmrc)`);

  if (fs.existsSync(path.join(ROOT, 'node_modules'))) report('ok', 'Dependencies', 'node_modules present');
  else report('fail', 'Dependencies', 'run `npm install`');

  try {
    // Loading the native module catches a better-sqlite3 build made for a different Node version
    const db = require('./db').default;
    const n = (db.prepare(`SELECT COUNT(*) as n FROM features`).get() as { n: number }).n;
    db.prepare(`SELECT 1`).get();
    report('ok', 'Database', `data/edm.db opened — ${n} features`);
  } catch (err) {
    const msg = (err as Error).message;
    report('fail', 'Database', /NODE_MODULE_VERSION|was compiled against/.test(msg)
      ? 'better-sqlite3 was built for another Node version — run `npm rebuild better-sqlite3`'
      : msg);
  }

  try {
    const puppeteer = require('puppeteer');
    const exe = puppeteer.executablePath();
    if (fs.existsSync(exe)) report('ok', 'Chromium (mockups)', 'installed');
    else report('warn', 'Chromium (mockups)', 'missing — run `npx puppeteer browsers install chrome` (needed for ZIPs with screenshots)');
  } catch {
    report('warn', 'Chromium (mockups)', 'puppeteer not loadable — run `npm install`');
  }

  if (!fs.existsSync(ENV_PATH)) {
    report('warn', '.env', 'missing — run `cp .env.example .env`, then fill in the keys below');
  } else {
    report('ok', '.env', 'present');
  }

  const gh = process.env.GITHUB_TOKEN;
  if (!isSet(gh)) {
    report('warn', 'GITHUB_TOKEN', 'not set — needed to pull new releases (`npm run analyze:new`)');
  } else {
    const res = await fetch('https://api.github.com/repos/hit-pay/hitpay-core', {
      headers: { Authorization: `Bearer ${gh}`, Accept: 'application/vnd.github+json' },
    }).catch(() => null);
    if (res?.ok) report('ok', 'GITHUB_TOKEN', 'can read hit-pay/hitpay-core');
    else report('warn', 'GITHUB_TOKEN', `can't read hit-pay/hitpay-core (${res ? res.status : 'network error'}) — token needs repo read access to the hit-pay org`);
  }

  const or = process.env.OPENROUTER_API_KEY;
  if (!isSet(or)) {
    report('warn', 'OPENROUTER_API_KEY', 'not set — needed to extract features from releases, enrich descriptions, and ✨ Suggest CTA');
  } else {
    const res = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${or}` } }).catch(() => null);
    if (res?.ok) report('ok', 'OPENROUTER_API_KEY', 'valid');
    else report('warn', 'OPENROUTER_API_KEY', `rejected by OpenRouter (${res ? res.status : 'network error'})`);
  }

  const icon = { ok: '✅', warn: '⚠️ ', fail: '❌' };
  console.log('\nHitPay EDM Generator — setup check\n');
  for (const r of results) console.log(`${icon[r.status]} ${r.name.padEnd(20)} ${r.detail}`);

  const fails = results.filter(r => r.status === 'fail').length;
  const warns = results.filter(r => r.status === 'warn').length;
  console.log('');
  if (fails) console.log(`${fails} blocking problem(s) — fix these before \`npm run server\`.`);
  else if (warns) console.log('The web UI will run (`npm run server`). Fix the warnings above to unlock the features they mention.');
  else console.log('All good — run `npm run server`.');
  process.exit(fails ? 1 : 0);
}

main();
