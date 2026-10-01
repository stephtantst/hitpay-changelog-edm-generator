# HitPay Changelog EDM Generator

Turns HitPay's GitHub release notes into the monthly merchant changelog email.
New releases are pulled from GitHub, Claude extracts the merchant-facing features,
you curate them in a local web UI, and it exports a Loops-ready ZIP.

## Run it locally

**Easiest:** open this folder in Claude Code and say *"run this on my local"*.
Claude follows the setup steps in `CLAUDE.md` and asks you for the two API keys.

**By hand** (macOS/Linux, Node 20+; `nvm use` picks up `.nvmrc`):

```bash
npm run setup      # installs deps, creates .env from .env.example, runs the setup check
# fill in GITHUB_TOKEN and OPENROUTER_API_KEY in .env (see below)
npm run doctor     # re-check — tells you exactly what's missing
npm run server     # opens http://localhost:3001
```

### Keys (`.env`)

| Key | Where to get it | What breaks without it |
|---|---|---|
| `GITHUB_TOKEN` | github.com/settings/tokens. Needs repo read access to `hit-pay/hitpay-core` (plus `hitpay-android` and `hitpay-ios` for mobile) | Pulling new releases |
| `OPENROUTER_API_KEY` | openrouter.ai/keys | Extracting features from releases, enriching descriptions, ✨ Suggest CTA |

Without keys, the web UI still works for curating what's already in the database
and for generating ZIPs.

## Day to day

- **Pull new releases:** `npm run analyze:new`, then refresh the UI. It only adds
  releases that aren't in the DB yet, so curation is never overwritten.
- **Weekly auto-pull (macOS, optional):** `npm run schedule:install` pulls new
  releases every Monday at 9am. If the repo is in `~/Documents`, `~/Desktop` or
  `~/Downloads`, it prints a one-time Full Disk Access step. Remove it with
  `npm run schedule:uninstall`.
- **Back up your curation:** `npm run save` commits and pushes `data/edm.db`.

## Sharing the database

`data/edm.db` is committed to git, so it's how curation travels between people.
It's a binary file and git can't merge it, so:

- `git pull` before you start, and `npm run save` when you're done.
- Don't have two people curating at the same time.
- Stop `npm run server` before any `git pull`, `checkout` or `stash`. Changing the
  file underneath a running server makes saves fail silently.

Feature screenshots (`screenshots/*/`) are **not** in git (they're large). A fresh
clone has all the features and text but no images. Re-add images in the UI if
you need them for a send.
