/**
 * Generates a ZIP using manually selected features from the DB (no AI rewrite).
 * Called by the server when the user clicks Generate in the UI.
 */
import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import fs from 'fs';
import { generateMockup } from './mockup-generator';
import { generateMjmlForZip, compileMjmlToHtml } from './email-generator';
import { generateZip, inlineImagesInHtml } from './zip-generator';
import { queries } from './db';

interface SelectedFeature {
  id: number;
  product_area: string;
  title: string;
  description: string;
}

const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

function findFeatureImage(tag: string, featureId: number): string | null {
  const dir = path.join(SCREENSHOTS_DIR, tag);
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const p = path.join(dir, `feature-${featureId}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function generateFromSelections(
  tag: string,
  selected: SelectedFeature[]
): Promise<string> {
  const release = queries.releaseExists.get(tag) as { tag: string; published_at?: string } | undefined;
  const publishedAt = (release as { published_at?: string })?.published_at ?? new Date().toISOString();

  // Use selected features directly (up to 5 for email template)
  const features = selected.slice(0, 5).map(f => ({
    tag: f.product_area,
    title: f.title,
    description: f.description,
  }));

  const mockupAbsolutePaths: string[] = [];
  const mockupRelativePaths: string[] = [];

  for (let i = 0; i < features.length; i++) {
    const imgPath = findFeatureImage(tag, selected[i].id);
    if (imgPath) {
      const mockupPath = await generateMockup(imgPath, `mockup-${tag}-${i + 1}`);
      mockupAbsolutePaths.push(mockupPath);
      mockupRelativePaths.push(`img/mockup-${i + 1}.png`);
      console.log(`  Mockup ${i + 1} generated`);
    } else {
      mockupAbsolutePaths.push('');
      mockupRelativePaths.push('');
    }
  }

  // Build a subject from the top features
  const topTitles = features.slice(0, 2).map(f => f.title).join(', ');
  const subject = `${topTitles} & more — ${tag}`;

  const mjml = generateMjmlForZip({
    subject,
    preview_text: `What's new in HitPay ${tag}`,
    intro: `Here's what we shipped in ${tag} — ${formatDate(publishedAt)}.`,
    features,
    tag,
    date: formatDate(publishedAt),
    unsubscribe_url: '{unsubscribe_link}',
    mockupImages: mockupRelativePaths,
  });

  const rawHtml = compileMjmlToHtml(mjml);
  const inlinedHtml = inlineImagesInHtml(rawHtml, mockupAbsolutePaths);

  const zipPath = await generateZip({
    mjmlContent: mjml,
    compiledHtml: inlinedHtml,
    mockupImagePaths: mockupAbsolutePaths,
    tag,
    subject,
  });

  console.log(`ZIP generated: ${zipPath}`);
  return zipPath;
}
