/**
 * Registry of GitHub repos ingested into the changelog pipeline.
 * `prefix` namespaces stored release tags for non-web repos (e.g. "android-v12.0")
 * so they can't collide with hitpay-core's `vXX.0` tags on the `releases.tag`
 * PRIMARY KEY. A hyphen (not ":") is used since the tag also becomes a
 * `screenshots/<tag>/` directory name, and ":" is invalid in Windows paths.
 */
export const REPOS = {
  web: { owner: 'hit-pay', repo: 'hitpay-core', prefix: null },
  android: { owner: 'hit-pay', repo: 'hitpay-android', prefix: 'android' },
  ios: { owner: 'hit-pay', repo: 'hitpay-ios', prefix: 'ios' },
} as const;

export type RepoKey = keyof typeof REPOS;

export function isRepoKey(value: string): value is RepoKey {
  return value in REPOS;
}

export function storedTag(repoKey: RepoKey, rawTag: string): string {
  const prefix = REPOS[repoKey].prefix;
  return prefix ? `${prefix}-${rawTag}` : rawTag;
}

export function rawTagFrom(tag: string): string {
  for (const { prefix } of Object.values(REPOS)) {
    if (prefix && tag.startsWith(`${prefix}-`)) return tag.slice(prefix.length + 1);
  }
  return tag;
}

export function repoKeyFromTag(tag: string): RepoKey {
  const match = (Object.entries(REPOS) as Array<[RepoKey, typeof REPOS[RepoKey]]>)
    .find(([, v]) => v.prefix && tag.startsWith(`${v.prefix}-`));
  return match ? match[0] : 'web';
}
