/**
 * Fetches GitHub releases, asks Claude to extract all merchant-relevant features,
 * and saves them to the SQLite DB for selection in the UI.
 *
 * Run: ts-node src/analyze-releases.ts v75.0 v76.0 v77.0 v78.0 v79.0
 * Or:  ts-node src/analyze-releases.ts --all   (fetches latest 10 major releases)
 */
import dotenv from 'dotenv';
dotenv.config();

import Anthropic from '@anthropic-ai/sdk';
import db, { queries } from './db';

const client = new Anthropic();

interface AnalyzedFeature {
  product_area: string;
  title: string;
  description: string;
}

async function fetchRelease(tag: string) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN required');
  const res = await fetch(`https://api.github.com/repos/hit-pay/hitpay-core/releases/tags/${tag}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub error for ${tag}: ${res.status}`);
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
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: `You are a product analyst for HitPay, a payment platform for SME merchants in Southeast Asia.
Extract ALL potentially merchant-facing changes from GitHub PR titles.
Skip purely internal items (refactors, CI, config, version bumps, code style).
Use "We" voice for descriptions.
Be exhaustive — include everything that could matter to a merchant.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Release ${tag} (${date}). PRs:\n${prs.map(p => `• ${p}`).join('\n')}

Output a JSON array only (no markdown):
[
  {
    "product_area": "e.g. Payments, BillPay, Checkout, Dashboard, Invoicing, Recurring Billing, Point of Sale, Integrations, Fraud & Security, Onboarding, Payment Links, Online Store",
    "title": "Short feature title (5-8 words)",
    "description": "1-2 sentences in We voice explaining the merchant benefit"
  }
]`,
      },
    ],
  });

  const text = (msg.content[0] as { type: string; text: string }).text;
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

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

async function analyzeTag(tag: string): Promise<void> {
  if (queries.releaseExists.get(tag)) {
    console.log(`  ${tag} already in DB — re-analyzing...`);
    queries.deleteFeaturesByTag.run(tag);
  }

  const release = await fetchRelease(tag);
  const date = new Date(release.published_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const prs = parsePRs(release.body);
  console.log(`  ${tag}: ${prs.length} PRs → analyzing with Claude...`);

  const features = await analyzeFeatures(tag, date, prs);
  console.log(`  ${tag}: ${features.length} features extracted`);

  const insertMany = db.transaction((feats: AnalyzedFeature[]) => {
    queries.upsertRelease.run({ tag, published_at: release.published_at, analyzed_at: new Date().toISOString() });
    feats.forEach((f, i) => {
      queries.insertFeature.run({
        release_tag: tag,
        product_area: f.product_area,
        title: f.title,
        description: f.description,
        priority: i,
      });
    });
  });

  insertMany(features);
}

async function main() {
  const args = process.argv.slice(2);
  const tags = args.includes('--all')
    ? await fetchLatestMajorTags(10)
    : args.filter(a => /^v\d+\.\d+$/.test(a));

  if (tags.length === 0) {
    console.error('Usage: ts-node src/analyze-releases.ts v75.0 v76.0 ...');
    process.exit(1);
  }

  console.log(`Analyzing ${tags.length} release(s)...\n`);
  for (const tag of tags) {
    await analyzeTag(tag);
  }
  console.log('\nDone. Run `npm run server` to open the selection UI.');
}

async function fetchLatestMajorTags(limit: number): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN!;
  const res = await fetch(`https://api.github.com/repos/hit-pay/hitpay-core/releases?per_page=50`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  const releases: Array<{ tag_name: string }> = await res.json() as Array<{ tag_name: string }>;
  return releases
    .filter(r => /^v\d+\.0$/.test(r.tag_name))
    .slice(0, limit)
    .map(r => r.tag_name);
}

main().catch(err => { console.error(err.message); process.exit(1); });
