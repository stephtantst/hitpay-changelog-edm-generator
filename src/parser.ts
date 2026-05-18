export interface ParsedRelease {
  items: string[];
}

export function parseReleaseNotes(body: string): ParsedRelease {
  const lines = body.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('*') && !trimmed.startsWith('-')) continue;

    // strip leading bullet
    let text = trimmed.replace(/^[*-]\s+/, '');

    // strip " by @username in https://..." trailing part
    text = text.replace(/\s+by\s+@\S+.*$/, '');

    // strip [HIT-XXXXX] ticket prefix
    text = text.replace(/^\[HIT-\d+\]\s*/i, '');

    // skip cycle markers and empty lines
    if (!text || /^Cycle\s+\d+/i.test(text)) continue;

    items.push(text.trim());
  }

  return { items };
}
