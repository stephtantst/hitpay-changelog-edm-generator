import Anthropic from '@anthropic-ai/sdk';
import db, { Feature } from './db';

const client = new Anthropic();
const GITHUB_HEADERS = () => ({
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

interface ParsedPR { number: number; title: string; ticket: string | null; }

export function parsePRsFromBody(body: string): ParsedPR[] {
  return body.split('\n').map(l => {
    const urlMatch = l.match(/pull\/(\d+)/);
    if (!urlMatch) return null;
    let title = l.trim().replace(/^[*-]\s+/, '').replace(/\s+by\s+@\S+.*$/, '').trim();
    const ticketMatch = title.match(/\[?(HIT-\d+)\]?/i);
    const ticket = ticketMatch ? ticketMatch[1].toUpperCase() : null;
    title = title.replace(/^\[?HIT-\d+\]?\s*/i, '').replace(/^feature\/HIT-\d+\s*/i, '').trim();
    return { number: parseInt(urlMatch[1]), title, ticket };
  }).filter((p): p is ParsedPR => p !== null && p.title.length > 0);
}

export function matchToPR(featureTitle: string, prs: ParsedPR[]): ParsedPR | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !['the','for','and','with','from','this','that','in','on','to','of','a','an'].includes(w));
  const fWords = new Set(norm(featureTitle));
  let best: ParsedPR | null = null;
  let bestScore = 0;
  for (const pr of prs) {
    const pWords = norm(pr.title);
    const overlap = pWords.filter(w => fWords.has(w)).length;
    const score = overlap / Math.max(fWords.size, pWords.length, 1);
    if (score > bestScore && score >= 0.25) { bestScore = score; best = pr; }
  }
  return best;
}

export async function fetchPRBody(prNumber: number): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/hit-pay/hitpay-core/pulls/${prNumber}`, {
    headers: GITHUB_HEADERS(),
  });
  if (!res.ok) return '';
  const data = await res.json() as { body?: string };
  return (data.body || '').replace(/<!--[\s\S]*?-->/g, '').replace(/^#{1,3}\s+Summary by.*$/gim, '').trim().slice(0, 1500);
}

export async function fetchReleasePRs(tag: string): Promise<ParsedPR[]> {
  const res = await fetch(`https://api.github.com/repos/hit-pay/hitpay-core/releases/tags/${tag}`, {
    headers: GITHUB_HEADERS(),
  });
  const release = await res.json() as { body: string };
  return parsePRsFromBody(release.body);
}

export async function enrichFeatures(features: Feature[], prs: ParsedPR[]): Promise<Array<{ id: number; description: string }>> {
  // Match each feature to a PR and fetch its body
  const prDetails = new Map<number, { pr: ParsedPR; body: string }>();
  for (const f of features) {
    const pr = matchToPR(f.title, prs);
    if (pr) {
      const body = await fetchPRBody(pr.number);
      prDetails.set(f.id, { pr, body });
    }
  }

  const items = features.map(f => {
    const match = prDetails.get(f.id);
    return { id: f.id, title: f.title, current_description: f.description, pr_title: match?.pr.title ?? null, pr_body: match?.body ?? null };
  });

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: [{
      type: 'text',
      text: `You are writing merchant-facing feature descriptions for HitPay, a payment platform for SME merchants in Southeast Asia.
Rules:
- Use "We" voice (We added, We improved, We fixed, We now support)
- 1 sentence if straightforward; up to 2 sentences if the feature warrants more detail
- Focus on merchant benefit, not technical implementation details
- Do not mention internal ticket numbers, PR numbers, or developer terms
- If the PR body provides useful context, use it to be more specific
- If no useful PR info, improve the existing description for clarity`,
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{
      role: 'user',
      content: `For each feature below, write an improved description. Return a JSON array only (no markdown).

Features:
${JSON.stringify(items, null, 2)}

Output: [{"id": 123, "description": "improved description"}]`,
    }],
  });

  const text = (msg.content[0] as { type: string; text: string }).text;
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const objects: Array<{ id: number; description: string }> = [];
    const re = /\{\s*"id"\s*:\s*\d+\s*,\s*"description"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g;
    let m;
    while ((m = re.exec(cleaned)) !== null) { try { objects.push(JSON.parse(m[0])); } catch { /* skip */ } }
    return objects;
  }
}

export function applyEnrichedDescriptions(enriched: Array<{ id: number; description: string }>): void {
  const update = db.prepare(`UPDATE features SET description = ? WHERE id = ?`);
  db.transaction((items: typeof enriched) => {
    for (const item of items) update.run(item.description, item.id);
  })(enriched);
}
