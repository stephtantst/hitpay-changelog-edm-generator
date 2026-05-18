import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

import { detectNewMajorReleases, saveState } from './detector';
import { parseReleaseNotes } from './parser';
import { transformReleaseContent } from './transformer';
import { generateMockup } from './mockup-generator';
import { generateEmail } from './email-generator';
import { sendViaLoops } from './loops-sender';

const DRY_RUN = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');
const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

function findScreenshotsForRelease(tag: string): string[] {
  const releaseDir = path.join(SCREENSHOTS_DIR, tag);
  if (!fs.existsSync(releaseDir)) return [];
  return fs.readdirSync(releaseDir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .map(f => path.join(releaseDir, f));
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function processRelease(release: { tag_name: string; body: string; published_at: string; html_url: string }) {
  const { tag_name: tag, body, published_at, html_url } = release;
  console.log(`\nProcessing release: ${tag}`);

  // 1. Parse release notes
  const { items } = parseReleaseNotes(body);
  console.log(`  Parsed ${items.length} PR items`);

  if (items.length === 0) {
    console.log('  No items found, skipping');
    return;
  }

  // 2. Transform via Claude AI
  console.log('  Transforming with Claude AI...');
  const content = await transformReleaseContent(tag, formatDate(published_at), items);
  console.log(`  Subject: ${content.subject}`);

  // 3. Generate mockup images for screenshots
  const screenshotPaths = findScreenshotsForRelease(tag);
  const mockupImages: string[] = [];

  for (let i = 0; i < Math.min(screenshotPaths.length, content.features.length); i++) {
    const outputName = `mockup-${tag}-feature-${i + 1}`;
    console.log(`  Generating mockup ${i + 1}/${screenshotPaths.length}...`);
    const mockupPath = await generateMockup(screenshotPaths[i], outputName);
    mockupImages.push(mockupPath);
  }

  // 4. Generate HTML email
  const html = generateEmail({
    ...content,
    tag,
    date: formatDate(published_at),
    unsubscribe_url: '{unsubscribe_link}',
    mockupImages,
  });

  // 5. Send via Loops (or skip if dry run)
  if (DRY_RUN) {
    console.log(`  DRY RUN: Email HTML at output/changelog-${tag}.html — not sent.`);
    return;
  }

  await sendViaLoops({
    subject: content.subject,
    previewText: content.preview_text,
    htmlContent: html,
    tag,
  });

  // 6. Update state
  saveState(tag);
  console.log(`  State updated: last_sent_tag = ${tag}`);
}

async function main() {
  console.log('HitPay Changelog EDM Generator');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  const releases = await detectNewMajorReleases();

  if (releases.length === 0) {
    console.log('No new major releases found. Nothing to do.');
    return;
  }

  console.log(`Found ${releases.length} new major release(s): ${releases.map(r => r.tag_name).join(', ')}`);

  for (const release of releases) {
    await processRelease(release);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
