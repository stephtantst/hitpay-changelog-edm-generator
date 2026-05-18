import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

export interface ZipInput {
  mjmlContent: string;
  compiledHtml: string;
  mockupImagePaths: string[];
  tag: string;
  subject: string;
}

function makeReadme(tag: string, subject: string): string {
  return `HitPay Changelog EDM
====================
Release : ${tag}
Subject : ${subject}

CONTENTS
--------
index.html   -- Compiled, self-contained HTML (all images embedded)
index.mjml   -- Source MJML (for reference / future edits)

HOW TO UPLOAD TO LOOPS
----------------------
1. Open index.html in a browser to preview the email
2. In Loops: Templates > New Template > Custom HTML > paste the full contents of index.html

NOTES
-----
- All images are embedded as base64 — no CDN or external hosting needed
- {{unsubscribeUrl}} is replaced by Loops at send time
`;
}

function toDataUri(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  const b64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

export function inlineImagesInHtml(html: string, mockupImagePaths: string[]): string {
  const assetsDir = path.join(__dirname, '../assets');

  // Inline every file in assets/ that is referenced as img/<filename> in the HTML
  const assetFiles = fs.readdirSync(assetsDir).filter(f => /\.(png|jpg|jpeg|gif)$/i.test(f));
  for (const filename of assetFiles) {
    const assetPath = path.join(assetsDir, filename);
    const dataUri = toDataUri(assetPath);
    const safeName = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`["']img/${safeName}["']`, 'g'), `"${dataUri}"`);
    if (filename === 'logo.png') {
      html = html.replace(/https?:\/\/[^\s"']+hitpay[^\s"']*logo[^\s"']*\.png/gi, dataUri);
    }
  }

  // Inline mockup images
  mockupImagePaths.forEach((imgPath, i) => {
    if (fs.existsSync(imgPath)) {
      const dataUri = toDataUri(imgPath);
      const relRef = new RegExp(`["']img/mockup-${i + 1}\\.png["']`, 'g');
      html = html.replace(relRef, `"${dataUri}"`);
      const absRef = new RegExp(imgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      html = html.replace(absRef, dataUri);
    }
  });

  return html;
}

export async function generateZip(input: ZipInput): Promise<string> {
  const outputDir = path.join(__dirname, '../output');
  fs.mkdirSync(outputDir, { recursive: true });

  const zip = new JSZip();
  zip.file('index.html', input.compiledHtml);
  zip.file('index.mjml', input.mjmlContent);
  zip.file('README.txt', makeReadme(input.tag, input.subject));

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  const zipPath = path.join(outputDir, `changelog-${input.tag}.zip`);
  fs.writeFileSync(zipPath, zipBuffer);
  return zipPath;
}
