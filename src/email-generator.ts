import mjml2html from 'mjml';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import type { TransformedContent } from './transformer';

const TEMPLATE_PATH = path.join(__dirname, '../templates/changelog.mjml');
const OUTPUT_DIR = path.join(__dirname, '../output');

export interface EmailData extends TransformedContent {
  tag: string;
  date: string;
  unsubscribe_url: string;
  mockupImages?: string[];
}

/**
 * Returns the raw MJML string with relative img/ paths for bundling in a ZIP.
 * mockupImages should be ['img/mockup-1.png', 'img/mockup-2.png', ...] (relative).
 */
export function generateMjmlForZip(data: EmailData): string {
  const mjmlTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  const features = data.features.map((f, i) => ({
    ...f,
    mockupImage: data.mockupImages?.[i] ?? null,
  }));

  // Use relative img/ paths for ZIP; swap absolute logo URL for local asset
  const templateData = { ...data, features };
  return Handlebars.compile(mjmlTemplate)(templateData)
    .replace('https://hitpay.com/wp-content/uploads/2023/03/hitpay-logo.png', 'img/logo.png');
}

export function compileMjmlToHtml(mjml: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = mjml2html(mjml, { validationLevel: 'soft' }) as any;
  const errors: Array<{ formattedMessage: string }> = result.errors ?? [];
  if (errors.length > 0) {
    console.warn('MJML warnings:', errors.map((e) => e.formattedMessage).join('\n'));
  }
  return result.html as string;
}

export function generateEmail(data: EmailData): string {
  const mjmlTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  const features = data.features.map((f, i) => ({
    ...f,
    mockupImage: data.mockupImages?.[i] ?? null,
  }));

  const compiled = Handlebars.compile(mjmlTemplate)({ ...data, features });
  const html = compileMjmlToHtml(compiled);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `changelog-${data.tag}.html`);
  fs.writeFileSync(outputPath, html);
  console.log(`Email HTML saved to: ${outputPath}`);

  return html;
}
