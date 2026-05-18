import fs from 'fs';
import path from 'path';

export interface GithubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

interface LastSentState {
  last_sent_tag: string;
  last_sent_at: string;
}

const STATE_FILE = path.join(__dirname, '../state/last_sent.json');

function isMajorRelease(tag: string): boolean {
  return /^v\d+\.0$/.test(tag);
}

function loadState(): LastSentState | null {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {
    // ignore corrupt state
  }
  return null;
}

export function saveState(tag: string): void {
  const state: LastSentState = { last_sent_tag: tag, last_sent_at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export async function detectNewMajorReleases(): Promise<GithubRelease[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');

  const res = await fetch('https://api.github.com/repos/hit-pay/hitpay-core/releases?per_page=20', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);

  const releases: GithubRelease[] = await res.json();
  const majorReleases = releases.filter(r => isMajorRelease(r.tag_name));

  const state = loadState();
  if (!state) return majorReleases.slice(0, 1); // first run: only send the latest

  const lastSentIndex = majorReleases.findIndex(r => r.tag_name === state.last_sent_tag);
  if (lastSentIndex === -1) return majorReleases.slice(0, 1); // state is stale, send latest only

  // return all major releases newer than last sent, oldest first
  return majorReleases.slice(0, lastSentIndex).reverse();
}
