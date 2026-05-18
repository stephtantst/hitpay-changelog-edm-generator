/**
 * Generate a Loops-ready ZIP for specific release tags (for vetting/preview).
 * Usage: ts-node src/generate-for-tag.ts v78.0 v79.0
 * Output: output/changelog-v78.0.zip, output/changelog-v79.0.zip
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

import { parseReleaseNotes } from './parser';
import { transformReleaseContent } from './transformer';
import { generateMockup } from './mockup-generator';
import { generateMjmlForZip, compileMjmlToHtml } from './email-generator';
import { generateZip, inlineImagesInHtml } from './zip-generator';
import { exec } from 'child_process';

const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

interface GithubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
}

async function fetchRelease(tag: string): Promise<GithubRelease> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');

  const res = await fetch(`https://api.github.com/repos/hit-pay/hitpay-core/releases/tags/${tag}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) throw new Error(`GitHub API error for ${tag}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GithubRelease>;
}

function findScreenshots(tag: string): string[] {
  const dir = path.join(SCREENSHOTS_DIR, tag);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort()
    .map(f => path.join(dir, f));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function generateForTag(tag: string): Promise<void> {
  console.log(`\n── Generating ZIP for ${tag} ──`);

  const release = await fetchRelease(tag);
  const { items } = parseReleaseNotes(release.body);
  console.log(`  ${items.length} PR items parsed`);

  console.log('  Transforming with Claude AI...');
  const content = await transformReleaseContent(tag, formatDate(release.published_at), items);
  console.log(`  Subject: "${content.subject}"`);

  // Generate mockup images for any screenshots dropped in screenshots/vX.0/
  const screenshotPaths = findScreenshots(tag);
  const mockupAbsolutePaths: string[] = [];
  const mockupRelativePaths: string[] = [];

  for (let i = 0; i < Math.min(screenshotPaths.length, content.features.length); i++) {
    const mockupPath = await generateMockup(screenshotPaths[i], `mockup-${tag}-${i + 1}`);
    mockupAbsolutePaths.push(mockupPath);
    mockupRelativePaths.push(`img/mockup-${i + 1}.png`);
    console.log(`  Mockup ${i + 1} generated`);
  }

  // Generate raw MJML with relative img/ paths (for the source file in ZIP)
  const mjml = generateMjmlForZip({
    ...content,
    tag,
    date: formatDate(release.published_at),
    unsubscribe_url: '{unsubscribe_link}',
    mockupImages: mockupRelativePaths,
  });

  // Compile MJML → HTML, then inline all images as base64 (no CDN needed)
  const rawHtml = compileMjmlToHtml(mjml);
  const inlinedHtml = inlineImagesInHtml(rawHtml, mockupAbsolutePaths);

  // Bundle into ZIP: index.html (self-contained) + index.mjml (source)
  const zipPath = await generateZip({
    mjmlContent: mjml,
    compiledHtml: inlinedHtml,
    mockupImagePaths: mockupAbsolutePaths,
    tag,
    subject: content.subject,
  });

  console.log(`  ZIP: ${zipPath}`);
  exec(`open "${path.dirname(zipPath)}"`);
}

async function main() {
  const tags = process.argv.slice(2);
  if (tags.length === 0) {
    console.error('Usage: ts-node src/generate-for-tag.ts v78.0 v79.0');
    process.exit(1);
  }

  for (const tag of tags) {
    await generateForTag(tag);
  }

  console.log('\nDone. ZIPs are in the output/ folder.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
