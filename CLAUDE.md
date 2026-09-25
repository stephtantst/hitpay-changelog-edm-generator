# HitPay Changelog EDM Generator

Turns HitPay's GitHub release notes into merchant-facing changelog emails
("EDMs"). Two independent pipelines exist — see below, only one is in active
use.

## Which pipeline is actually used

**Manual curated pipeline (active, this is the one to work on):**
`analyze-releases.ts` pulls GitHub releases → Claude extracts merchant-facing
features → stored in SQLite (`data/edm.db`) → curated by hand in the web UI
(`npm run server`, `src/server.ts` + `public/index.html`) → features get
grouped into a monthly "Newsletter" batch → `generate-from-selections.ts`
produces a Loops-ready ZIP for that month.

Three repos feed this pipeline: `hit-pay/hitpay-core` (Web), `hitpay-android`,
and `hitpay-ios` (both "Mobile"). See `src/repos.ts` for the registry. The
curation UI lets Steph manage Web and Mobile features separately (platform
filter chips on Releases and on the Monthly Changelog view), but they always
combine into one ZIP/email — platform is purely a curation-time filter, not
a split in the output.

**Automated hourly pipeline (`src/index.ts`, `.github/workflows/generate-edm.yml`,
likely dormant):** on a schedule, auto-detects new major releases and sends
one email per release immediately via Loops, no human review. `state/last_sent.json`
is still at its initial empty value (`last_sent_tag: ""`), meaning this has
never successfully completed a send — either the workflow's secrets were
never configured, or it's been abandoned in favor of the manual monthly flow.
Confirm with Steph before assuming this is live or touching it.

## Dev workflow

```
npm run server        # web UI at localhost:3001 — the day-to-day tool
npm run analyze        # ts-node src/analyze-releases.ts v83.0 v84.0 ...   (Web/hitpay-core, default)
                        #   or --all for the latest 10 major releases
npm run analyze:android # same, but --repo=android (hitpay-android)
npm run analyze:ios     # same, but --repo=ios (hitpay-ios)
npm run enrich          # re-enrich descriptions from PR bodies via Claude
                        #   (repo is inferred from the tag's DB row — pass the tag
                        #   as stored, e.g. `android-v12.0`, not the bare GitHub tag)
npm run generate:tag    # ts-node src/generate-for-tag.ts — one-off ZIP for vetting a tag
                        #   add --repo=android|ios to vet a mobile tag
npm run save            # git add data/edm.db && commit && push (manual DB backup)
npx tsc --noEmit        # type-check (src/preview.ts has 3 pre-existing type
                        #   errors unrelated to any recent work — safe to ignore)
```

Requires a `.env` (see `.env.example`): `GITHUB_TOKEN` (repo read scope on
`hit-pay/hitpay-core`, `hit-pay/hitpay-android`, and `hit-pay/hitpay-ios`),
`ANTHROPIC_API_KEY`, `LOOPS_API_KEY`, `LOOPS_TRANSACTIONAL_ID`, `DRY_RUN`.

The server auto-opens `http://localhost:3001` in a browser on start (macOS
`open` command in `src/server.ts`).

## Data model (`data/edm.db`, tracked in git — see `npm run save`)

- **`releases`**: one row per GitHub release tag. `is_hidden` lets you tuck
  away releases you've already published, without deleting data.
  A synthetic row `tag = 'manual'` (`is_hidden = 1`) exists solely to satisfy
  the FK for manually-added features — don't delete it.
  - `repo` — `hitpay-core` / `hitpay-android` / `hitpay-ios`. Non-web tags are
    stored with a prefix (`android-v12.0`, `ios-v3.0`) to avoid colliding with
    core's own `vXX.0` tags on the `tag` PRIMARY KEY, since both mobile repos
    use the same versioning convention. `src/repos.ts` has the
    `storedTag`/`rawTagFrom` helpers; the UI always strips the prefix before
    displaying a tag.
- **`features`**: one row per merchant-facing feature.
  - `release_tag` — FK to `releases.tag`; `'manual'` for hand-added features.
  - `platform` — `web` / `android` / `ios`, denormalized from the release at
    ingestion time (manually-added features set it directly since they have
    no real release). Drives the Web/Mobile filter chips in the UI; "Mobile"
    means `android` or `ios` combined.
  - `is_selected` / `priority` — used by the per-release ("Releases") view.
  - `newsletter_month` / `newsletter_priority` — used by the "Monthly
    Changelog" view; a feature only needs `newsletter_month` set to appear
    there (independent of `is_selected`/`is_hidden`).
  - `is_hidden` — hides a feature from the release view without deleting it.
  - `docs_url` — `null`/unset = auto-detect via `docs-matcher.ts`; `'none'` =
    explicitly suppressed; anything else = manual override.
  - `flags_override` — `null` = auto-detect country flags; `""` = force none;
    `"singapore,malaysia"` = explicit list.

## Known gotchas

- **Never run `git stash`/`checkout`/similar while `npm run server` is
  running.** The server holds `data/edm.db` open for the whole session; if
  the file gets rewritten out from under it (e.g. by a git operation), the
  connection can get stuck thinking the DB is read-only, and every write
  from then on silently fails until the server is restarted. If writes stop
  persisting, restart `npm run server` first before investigating further.
- The front-end (`public/index.html`) always checks response status via the
  shared `apiFetch()` helper before updating local state — if you add a new
  mutating endpoint, use `apiFetch` (not bare `fetch`) so a failed save
  surfaces a toast instead of silently reverting on next reload.
- Screenshots dropped into the UI are resized client-side (canvas, max width
  1200px, stepped/high-quality downscale) before upload — see
  `resizeImageDataUrl()` in `public/index.html`. Don't remove this; full-res
  screenshots (some were 5000px+, multi-MB) make the email slow to load with
  no visible quality gain at the ~550px display width.
- `screenshots/v*/` is gitignored — feature images are local-only, not backed
  up by git. `data/edm.db` is tracked and pushed via `npm run save`.

## Architecture map

| File | Role |
|---|---|
| `src/analyze-releases.ts` | Fetch GitHub releases, extract features via Claude, save to DB |
| `src/enrich-descriptions.ts` / `enrich-utils.ts` | Improve feature descriptions using full PR body context |
| `src/db.ts` | SQLite schema, migrations, all prepared queries |
| `src/server.ts` | Express API backing the web UI |
| `public/index.html` | The web UI (single-file, vanilla JS) |
| `src/generate-from-selections.ts` | Builds the email ZIP from curated/selected features (no AI rewrite) |
| `src/email-generator.ts` | Handlebars + MJML → HTML |
| `templates/changelog.mjml` | The actual email template |
| `src/zip-generator.ts` | Packages MJML/HTML/images into a Loops-ready ZIP |
| `src/docs-matcher.ts` | Keyword → docs.hitpayapp.com URL matching |
| `src/mockup-generator.ts` | Puppeteer-rendered device mockup frames around screenshots |
| `src/index.ts` / `detector.ts` / `parser.ts` / `transformer.ts` | The automated (likely dormant) per-release pipeline |
| `src/repos.ts` | Registry of the three ingested GitHub repos (Web/Android/iOS) and tag-prefix helpers |
