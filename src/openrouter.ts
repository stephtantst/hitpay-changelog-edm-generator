/**
 * Minimal OpenRouter chat-completions client, used in place of the Anthropic
 * SDK so the analyze/enrich pipelines aren't blocked by Anthropic API usage caps.
 */

export async function callOpenRouter(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY required');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://hit-pay.com',
      'X-Title': 'HitPay Changelog EDM Generator',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${body}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content;
}

/**
 * Pulls the JSON array out of a model response, tolerating a fenced code
 * block followed by trailing prose (OpenRouter/Bedrock models often add
 * commentary after the fence, unlike the direct Anthropic API).
 */
export function extractJsonArray(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1).trim();
  return text.trim();
}
