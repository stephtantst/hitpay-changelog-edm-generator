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
import { matchDocsUrl } from './docs-matcher';

interface SelectedFeature {
  id: number;
  release_tag?: string;
  product_area: string;
  title: string;
  description: string;
  docs_url?: string | null;
}

const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

const COUNTRY_FLAGS: Record<string, string> = {
  'singapore': '🇸🇬',
  'malaysia': '🇲🇾',
  'hong kong': '🇭🇰',
  'australia': '🇦🇺',
  'united kingdom': '🇬🇧',
  ' uk ': '🇬🇧',
  'indonesia': '🇮🇩',
  'thailand': '🇹🇭',
  'philippines': '🇵🇭',
  'india': '🇮🇳',
};

const COUNTRY_ABBR: Record<string, string> = {
  'singapore': 'SG',
  'malaysia': 'MY',
  'hong kong': 'HK',
  'australia': 'AU',
  'indonesia': 'ID',
  'thailand': 'TH',
  'philippines': 'PH',
  'india': 'IN',
  'united kingdom': 'UK',
  ' uk ': 'UK',
};

// Strip generic filler so titles read crisply in a preview snippet
const PREVIEW_STRIP = /\b(new|support for|support|powered by|integration for|available for|available in|feature|update|enhancement)\b/gi;

function buildPreviewText(features: SelectedFeature[]): string {
  const snippets = features.slice(0, 4).map(f => {
    let short = f.title.replace(PREVIEW_STRIP, '');

    // Strip full country name from the title and replace with abbreviation only.
    // e.g. "Tap to Pay for Malaysia" → "Tap to Pay in MY" (never "Malaysia in MY")
    const fullText = (f.title + ' ' + f.description).toLowerCase();
    let countryAbbr: string | null = null;
    for (const [kw, abbr] of Object.entries(COUNTRY_ABBR)) {
      const keyword = kw.trim();
      if (fullText.includes(keyword)) {
        short = short.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), '');
        countryAbbr = abbr;
        break;
      }
    }

    short = short
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/\s+(for|in|on|to|at|of|and)$/i, '')
      .trim();

    if (countryAbbr) short += ` in ${countryAbbr}`;

    return short;
  });

  // Join and cap at 90 chars (Gmail/Apple Mail sweet spot)
  const joined = snippets.join(', ');
  return joined.length > 90 ? joined.slice(0, 87).trimEnd() + '…' : joined;
}

function detectFlags(title: string, description: string): string {
  const text = (title + ' ' + description).toLowerCase();
  const seen = new Set<string>();
  const flags: string[] = [];
  for (const [keyword, flag] of Object.entries(COUNTRY_FLAGS)) {
    if (text.includes(keyword) && !seen.has(flag)) {
      seen.add(flag);
      flags.push(flag);
    }
  }
  return flags.join(' ');
}

function findFeatureImage(tag: string, featureId: number): string | null {
  const dir = path.join(SCREENSHOTS_DIR, tag);
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const p = path.join(dir, `feature-${featureId}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}


export async function generateFromSelections(
  tag: string,
  selected: SelectedFeature[],
  options?: { label?: string }
): Promise<string> {
  const label = options?.label ?? tag;

  // Use all selected features
  const features = selected.map(f => {
    const flags = detectFlags(f.title, f.description);
    const docsUrl = f.docs_url || matchDocsUrl(f.title, f.description);
    return {
      tag: f.product_area,
      title: f.title,
      description: f.description,
      ...(flags ? { flags } : {}),
      ...(docsUrl ? { docsUrl } : {}),
    };
  });

  const mockupAbsolutePaths: string[] = [];
  const mockupRelativePaths: string[] = [];

  for (let i = 0; i < features.length; i++) {
    const imgPath = findFeatureImage(selected[i].release_tag ?? tag, selected[i].id);
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
  const subject = `${topTitles} & more — ${label}`;

  const mjml = generateMjmlForZip({
    subject,
    preview_text: buildPreviewText(selected),
    intro: `Here's what we shipped in ${label}.`,
    features,
    tag,
    date: label,
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
