/**
 * Enriches feature descriptions in the DB using GitHub PR bodies.
 * Matches each DB feature to its source PR, fetches the PR body for context,
 * then calls Claude to write improved merchant-facing descriptions.
 *
 * Run: ts-node src/enrich-descriptions.ts v79.0
 */
import dotenv from 'dotenv';
dotenv.config();

import { queries, Feature } from './db';
import { fetchReleasePRs, enrichFeatures, applyEnrichedDescriptions, matchToPR } from './enrich-utils';


async function main() {
  const tag = process.argv[2];
  if (!tag || !/^v\d+\.\d+$/.test(tag)) {
    console.error('Usage: ts-node src/enrich-descriptions.ts v79.0');
    process.exit(1);
  }

  const isFix = (f: Feature) =>
    /\b(fix(es|ed)?|bug|patch|resolv|correct(ed)?|issu|broken|crash|error|revert)\b/i.test(f.title + ' ' + f.description);

  // Load features from DB (skip hidden and fixes)
  const features = (queries.getFeaturesByTag.all(tag) as Feature[]).filter(f => !f.is_hidden && !isFix(f));
  console.log(`\nEnriching ${features.length} features for ${tag}...\n`);

  // Fetch release PRs
  const prs = await fetchReleasePRs(tag);
  console.log(`  Found ${prs.length} PRs in release body`);

  let matched = 0;
  for (const f of features) {
    const pr = matchToPR(f.title, prs);
    if (pr) { console.log(`  ✓ "${f.title}" → PR #${pr.number}`); matched++; }
    else { console.log(`  – "${f.title}" → no PR match`); }
  }
  console.log(`\n  Matched ${matched}/${features.length} features to PRs`);

  console.log('\n  Calling Claude to enrich descriptions...');
  const enriched = await enrichFeatures(features, prs);
  applyEnrichedDescriptions(enriched);

  console.log(`\n  ✓ Updated ${enriched.length} descriptions in DB`);
  console.log('\nDone. Refresh the UI to see updated descriptions.\n');
}

main().catch(err => { console.error(err.message); process.exit(1); });
