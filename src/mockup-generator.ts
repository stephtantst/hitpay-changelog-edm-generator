import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const TEMPLATE_PATH = path.join(__dirname, '../templates/mockup.html');
const OUTPUT_DIR = path.join(__dirname, '../output');

export async function generateMockup(screenshotPath: string, outputName: string): Promise<string> {
  const absoluteScreenshot = path.resolve(screenshotPath);
  if (!fs.existsSync(absoluteScreenshot)) {
    throw new Error(`Screenshot not found: ${absoluteScreenshot}`);
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  // Embed image as base64 data URL so Puppeteer can render it without file:// restrictions
  const ext = path.extname(absoluteScreenshot).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  const b64 = fs.readFileSync(absoluteScreenshot).toString('base64');
  const html = template.replace('{{SCREENSHOT_PATH}}', `data:${mime};base64,${b64}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Measure the true content height (body padding + card) and resize the
    // viewport to match exactly — prevents Chrome from padding the capture
    // with empty space up to the initial viewport height.
    const contentHeight = await page.evaluate(() => {
      document.body.style.display = 'inline-flex';
      return document.body.getBoundingClientRect().height;
    });
    await page.setViewport({ width: 1200, height: Math.ceil(contentHeight), deviceScaleFactor: 2 });

    const outputPath = path.join(OUTPUT_DIR, `${outputName}.png`);
    await page.screenshot({ path: outputPath as `${string}.png`, type: 'png' });

    return outputPath;
  } finally {
    await browser.close();
  }
}

// CLI entrypoint: ts-node src/mockup-generator.ts <screenshot-path> [output-name]
if (require.main === module) {
  const args = process.argv.slice(2);
  const screenshotPath = args[0];
  const outputName = args[1] || 'mockup-preview';

  if (!screenshotPath) {
    console.error('Usage: ts-node src/mockup-generator.ts <screenshot-path> [output-name]');
    process.exit(1);
  }

  generateMockup(screenshotPath, outputName)
    .then(out => {
      console.log(`Mockup saved to: ${out}`);
      // open in default viewer on macOS
      require('child_process').exec(`open "${out}"`);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
