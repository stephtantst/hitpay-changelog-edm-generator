export interface LoopsSendOptions {
  subject: string;
  previewText: string;
  htmlContent: string;
  tag: string;
}

export async function sendViaLoops(options: LoopsSendOptions): Promise<void> {
  if (process.env.DRY_RUN === 'true') {
    console.log(`[DRY RUN] Would send email for ${options.tag} — Loops not called.`);
    return;
  }

  const apiKey = process.env.LOOPS_API_KEY;
  const transactionalId = process.env.LOOPS_TRANSACTIONAL_ID;

  if (!apiKey) throw new Error('LOOPS_API_KEY is required');
  if (!transactionalId || transactionalId === 'xxxxxxxxxxxxxxxx') {
    throw new Error('LOOPS_TRANSACTIONAL_ID is not configured — set a real template ID before sending');
  }

  // Loops transactional API sends to all contacts with the specified transactional template
  const res = await fetch('https://app.loops.so/api/v1/transactional', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transactionalId,
      // dataVariables are injected into the Loops template
      // The Loops template should have a variable {{{htmlContent}}} for the full HTML body
      dataVariables: {
        subject: options.subject,
        previewText: options.previewText,
        htmlContent: options.htmlContent,
        releaseTag: options.tag,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Loops API error ${res.status}: ${body}`);
  }

  console.log(`Email sent via Loops for release ${options.tag}`);
}
