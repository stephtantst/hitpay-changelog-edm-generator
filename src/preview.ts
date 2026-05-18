/**
 * Generates a sample email preview using mock data + the test screenshot mockup.
 * Run: ts-node src/preview.ts
 */
import path from 'path';
import { exec } from 'child_process';
import { generateEmail } from './email-generator';
import { generateMockup } from './mockup-generator';

async function main() {
  // Generate mockup from sample screenshot
  const sampleScreenshot = path.join(__dirname, '../screenshots/hitpay-sample.png');
  const mockupPath = await generateMockup(sampleScreenshot, 'preview-mockup');
  console.log('Mockup generated:', mockupPath);

  const html = generateEmail({
    tag: 'v80.0',
    date: 'May 17, 2026',
    subject: 'Faster onboarding, BillPay upgrades & more',
    preview_text: 'Get started faster, manage bills with ease, and more in HitPay v80.0',
    intro: 'Hello, welcome to this month\'s HitPay product update! This cycle we\'ve focused on making it easier to get started, improving how you manage bills, and rolling out new payment integrations across Southeast Asia.',
    features: [
      {
        title: 'Faster Account Onboarding',
        description: 'We\'ve streamlined the account setup flow — new merchants can now complete onboarding in fewer steps, with clearer guidance at each stage. Getting your first payment up and running has never been quicker.',
      },
      {
        title: 'BillPay Dashboard Improvements',
        description: 'The BillPay section of your dashboard has been redesigned for clarity. You can now view, manage, and pay bills in one unified view, with real-time status updates and smarter filtering.',
      },
      {
        title: 'Stripe Payment Integration',
        description: 'HitPay now supports Stripe as a payment method, giving your customers more ways to pay. Enable it in your Payment Methods settings with a single click.',
      },
    ],
    fixes: [
      'Fixed ZaloPay VietQR onboarding not completing for some merchants',
      'Resolved an array index error on the reports page',
      'Corrected bank account display in Payouts & Balances for SGD accounts',
    ],
    unsubscribe_url: '#unsubscribe',
    mockupImages: [mockupPath],
  });

  const outputPath = path.join(__dirname, '../output/changelog-preview.html');
  console.log(`\nEmail preview: ${outputPath}`);
  exec(`open "${outputPath}"`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
