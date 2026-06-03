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
index.mjml      -- Source MJML (upload this ZIP to Loops)
index.html      -- Local preview (open in browser after extracting)
img/            -- All images (Loops hosts these automatically)

HOW TO UPLOAD TO LOOPS
----------------------
1. Extract this ZIP and open index.html in a browser to preview
2. In Loops: Templates > New Template > Upload MJML > upload this ZIP file
   Loops will host all images in img/ on its CDN automatically.

NOTES
-----
- {unsubscribe_link} is replaced by Loops at send time
`;
}

/**
 * Returns the HTML with img/ references left as relative paths.
 * The HTML is for local browser preview only (extract the ZIP first).
 * Loops rewrites img/ paths to its CDN when you upload the ZIP.
 */
export function inlineImagesInHtml(html: string, _mockupImagePaths: string[]): string {
  // Replace the remote HitPay logo URL with the local img/ reference so
  // it resolves correctly from an extracted ZIP.
  html = html.replace(
    /https?:\/\/[^\s"']+hitpay[^\s"']*logo[^\s"']*\.png/gi,
    'img/logo.png'
  );
  return html;
}

export async function generateZip(input: ZipInput): Promise<string> {
  const outputDir = path.join(__dirname, '../output');
  fs.mkdirSync(outputDir, { recursive: true });

  const zip = new JSZip();
  const imgFolder = zip.folder('img')!;

  // Static assets (logo, social icons, help banner)
  const assetsDir = path.join(__dirname, '../assets');
  const assetFiles = fs.readdirSync(assetsDir).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
  for (const filename of assetFiles) {
    imgFolder.file(filename, fs.readFileSync(path.join(assetsDir, filename)));
  }

  // Dynamic mockup screenshots
  input.mockupImagePaths.forEach((imgPath, i) => {
    if (imgPath && fs.existsSync(imgPath)) {
      imgFolder.file(`mockup-${i + 1}.png`, fs.readFileSync(imgPath));
    }
  });

  zip.file('index.mjml', input.mjmlContent);
  zip.file('index.html', input.compiledHtml);
  zip.file('README.txt', makeReadme(input.tag, input.subject));

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const zipPath = path.join(outputDir, `changelog-${input.tag}.zip`);
  fs.writeFileSync(zipPath, zipBuffer);
  return zipPath;
}
