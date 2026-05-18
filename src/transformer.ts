import Anthropic from '@anthropic-ai/sdk';

export interface TransformedContent {
  subject: string;
  preview_text: string;
  intro: string;
  features: Array<{ tag: string; title: string; description: string }>;
}

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a copywriter for HitPay, a payment platform serving SME merchants in Southeast Asia (Singapore, Malaysia, Hong Kong, and the Philippines).

Transform technical GitHub PR titles into a merchant-friendly changelog email. Write in first-person plural ("We") — the same voice Cal.com uses in their changelogs. HitPay is speaking to merchants directly.

Tone: Professional, clear, warm. No engineering jargon. Short sentences.

Voice rules (strictly follow these):
- Always use "We" — never "You can now", never "If you", never second-person
- Feature descriptions: "We've added...", "We now support...", "We've improved...", "We've made it easier to..."
- Intro paragraph: "This release, we've focused on..." or "We've been working on..."
- Fixes: "We fixed...", "We resolved...", "We've corrected..."
- Group related PRs into a single feature when they describe the same thing
- Skip internal/infrastructure PRs (CI, refactors, config changes) unless merchant-impactful
- Features should describe BENEFITS in "We" voice, not code changes`;

export async function transformReleaseContent(
  tag: string,
  date: string,
  items: string[]
): Promise<TransformedContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const userPrompt = `Release: ${tag} — ${date}

PR titles (${items.length} total):
${items.map(i => `• ${i}`).join('\n')}

Output valid JSON only (no markdown wrapper):
{
  "subject": "short compelling email subject under 60 chars",
  "preview_text": "preview text under 90 chars",
  "intro": "2-3 sentence friendly intro paragraph",
  "features": [
    {
      "tag": "Product area (e.g. Payments, BillPay, Dashboard, Point of Sale, Payment Links, Invoicing, Recurring Billing, Online Store, Integrations, Platform)",
      "title": "Feature name",
      "description": "1-2 sentence merchant benefit in We voice"
    }
  ]
}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  // Strip markdown code fences
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  try {
    return JSON.parse(cleaned) as TransformedContent;
  } catch {
    // If the JSON was truncated (output hit token limit mid-array),
    // salvage what we have by closing off the incomplete structure.
    const salvaged = salvageJson(cleaned);
    if (salvaged) return salvaged;
    throw new Error(`Failed to parse Claude response as JSON.\nRaw output:\n${cleaned.slice(0, 300)}`);
  }
}

function salvageJson(raw: string): TransformedContent | null {
  try {
    // Find the last complete feature object ending with }
    const featuresMatch = raw.match(/"features"\s*:\s*\[/);
    if (!featuresMatch) return null;

    const featuresStart = raw.indexOf('"features"');
    const preamble = raw.slice(0, featuresStart);

    // Extract complete feature objects only
    const featureObjects: string[] = [];
    const featureRegex = /\{\s*"tag"\s*:[\s\S]*?"description"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g;
    const featuresPart = raw.slice(featuresStart);
    let match;
    while ((match = featureRegex.exec(featuresPart)) !== null) {
      featureObjects.push(match[0]);
    }

    if (featureObjects.length === 0) return null;

    const reconstructed = preamble + `"features": [${featureObjects.join(',')}]}`;
    return JSON.parse(reconstructed) as TransformedContent;
  } catch {
    return null;
  }
}
