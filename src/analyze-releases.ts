/**
 * Fetches GitHub releases, asks Claude to extract all merchant-relevant features,
 * and saves them to the SQLite DB for selection in the UI.
 *
 * Run: ts-node src/analyze-releases.ts v75.0 v76.0 v77.0 v78.0 v79.0
 * Or:  ts-node src/analyze-releases.ts --all   (fetches latest 10 major releases)
 * Add --repo=android or --repo=ios to pull from a mobile repo instead of hitpay-core (default).
 */
import dotenv from 'dotenv';
dotenv.config();

import db, { queries } from './db';
import { callOpenRouter, extractJsonArray } from './openrouter';
import { REPOS, RepoKey, isRepoKey, storedTag } from './repos';

interface AnalyzedFeature {
  product_area: string;
  title: string;
  description: string;
}

async function fetchRelease(rawTag: string, repoKey: RepoKey) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN required');
  const { owner, repo } = REPOS[repoKey];
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${rawTag}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub error for ${rawTag}: ${res.status}`);
  return res.json() as Promise<{ body: string; published_at: string }>;
}

function parsePRs(body: string): string[] {
  return body.split('\n')
    .filter(l => l.trim().startsWith('*') || l.trim().startsWith('-'))
    .map(l => {
      let t = l.trim().replace(/^[*-]\s+/, '');
      t = t.replace(/\s+by\s+@\S+.*$/, '');
      t = t.replace(/^\[HIT-\d+\]\s*/i, '').trim();
      return t;
    })
    .filter(t => t && !/^Cycle\s+\d+/i.test(t) && !/^Revert/i.test(t));
}

async function analyzeFeatures(tag: string, date: string, prs: string[]): Promise<AnalyzedFeature[]> {
  const text = await callOpenRouter({
    model: 'anthropic/claude-sonnet-4.5',
    maxTokens: 4096,
    system: `You are a product analyst for HitPay, a payment platform for SME merchants in Southeast Asia.
Extract ALL potentially merchant-facing changes from GitHub PR titles.
Skip purely internal items (refactors, CI, config, version bumps, code style).
Use "We" voice for descriptions.
Be exhaustive — include everything that could matter to a merchant.`,
    user: `Release ${tag} (${date}). PRs:\n${prs.map(p => `• ${p}`).join('\n')}

Output a JSON array only (no markdown):
[
  {
    "product_area": "e.g. Payments, BillPay, Checkout, Dashboard, Invoicing, Recurring Billing, Point of Sale, Integrations, Fraud & Security, Onboarding, Payment Links, Online Store",
    "title": "Short feature title (5-8 words)",
    "description": "1-2 sentences in We voice explaining the merchant benefit"
  }
]`,
  });
  const cleaned = extractJsonArray(text);

  try {
    return JSON.parse(cleaned) as AnalyzedFeature[];
  } catch {
    // Salvage complete objects from a truncated array
    const objects: AnalyzedFeature[] = [];
    const re = /\{\s*"product_area"\s*:[\s\S]*?"description"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      try { objects.push(JSON.parse(m[0]) as AnalyzedFeature); } catch { /* skip malformed */ }
    }
    if (objects.length > 0) {
      console.log(`  (salvaged ${objects.length} complete features from truncated response)`);
      return objects;
    }
    throw new Error(`Failed to parse Claude response for ${tag}`);
  }
}

async function analyzeTag(rawTag: string, repoKey: RepoKey): Promise<void> {
  const tag = storedTag(repoKey, rawTag);
  if (queries.releaseExists.get(tag)) {
    console.log(`  ${tag} already in DB — re-analyzing...`);
    queries.deleteFeaturesByTag.run(tag);
  }

  const release = await fetchRelease(rawTag, repoKey);
  const date = new Date(release.published_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const prs = parsePRs(release.body);
  console.log(`  ${tag}: ${prs.length} PRs → analyzing with Claude...`);

  const features = await analyzeFeatures(tag, date, prs);
  console.log(`  ${tag}: ${features.length} features extracted`);

  const insertMany = db.transaction((feats: AnalyzedFeature[]) => {
    queries.upsertRelease.run({ tag, published_at: release.published_at, analyzed_at: new Date().toISOString(), repo: REPOS[repoKey].repo });
    feats.forEach((f, i) => {
      queries.insertFeature.run({
        release_tag: tag,
        product_area: f.product_area,
        title: f.title,
        description: f.description,
        priority: i,
        platform: repoKey,
      });
    });
  });

  insertMany(features);
}

async function main() {
  const args = process.argv.slice(2);
  const repoArg = args.find(a => a.startsWith('--repo='))?.slice('--repo='.length) ?? 'web';
  if (!isRepoKey(repoArg)) {
    console.error(`Unknown --repo=${repoArg}. Valid options: ${Object.keys(REPOS).join(', ')}`);
    process.exit(1);
  }
  const repoKey = repoArg;

  const tags = args.includes('--all')
    ? await fetchLatestMajorTags(10, repoKey)
    : args.filter(a => /^v\d+\.\d+$/.test(a));

  if (tags.length === 0) {
    console.error('Usage: ts-node src/analyze-releases.ts [--repo=web|android|ios] v75.0 v76.0 ...');
    process.exit(1);
  }

  console.log(`Analyzing ${tags.length} release(s) from ${REPOS[repoKey].repo}...\n`);
  for (const tag of tags) {
    await analyzeTag(tag, repoKey);
  }
  console.log('\nDone. Run `npm run server` to open the selection UI.');
}

async function fetchLatestMajorTags(limit: number, repoKey: RepoKey): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN!;
  const { owner, repo } = REPOS[repoKey];
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=50`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  const releases: Array<{ tag_name: string }> = await res.json() as Array<{ tag_name: string }>;
  return releases
    .filter(r => /^v\d+\.0$/.test(r.tag_name))
    .slice(0, limit)
    .map(r => r.tag_name);
}

main().catch(err => { console.error(err.message); process.exit(1); });
