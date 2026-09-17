# UTGA Grant Navigator — Automation Step 3

## Goal

Make the existing live Navigator read the automatically updated catalogue at runtime instead of requiring `page.tsx` edits for every grant.

The complete flow becomes:

`Grant Watcher → grant-inbox.json → Evidence Gate → data/grants.json → public JSON feed → live Navigator`

## What Step 3 changes

### 1. Navigator runtime data source

`app/page.tsx` now:

- starts with a safe embedded fallback catalogue;
- fetches `NEXT_PUBLIC_GRANT_FEED_URL` when the page opens;
- validates the JSON shape before accepting it;
- refreshes the feed every 15 minutes while the page is open;
- uses `cache: no-store`;
- keeps the existing browser-local human decision overrides;
- falls back safely if the remote feed fails;
- shows `LIVE` + catalogue update timestamp in the header when the feed is healthy.

The bot still cannot overwrite the user's local decision overrides.

### 2. Public machine-readable feed

`scripts/publish-feed.mjs` copies:

- `data/grants.json` → `public/grants.json`
- `data/catalogue-meta.json` → `public/catalogue-meta.json`

It also prepares `_site/` for GitHub Pages and writes `_site/health.json`.

### 3. GitHub Pages deployment

`.github/workflows/grant-feed-pages.yml` publishes the JSON feed whenever the catalogue changes on `main`.

After Pages is enabled, the feed URL will normally be:

`https://<github-owner>.github.io/<repository>/grants.json`

and metadata:

`https://<github-owner>.github.io/<repository>/catalogue-meta.json`

## One-time activation

### A. In the watcher repository

1. Copy this Step 3 package over the Step 2 repository.
2. In GitHub open **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Run **Publish UTGA Grant Feed** once manually.
5. Open the resulting Pages URL and confirm that `/grants.json` returns JSON.

### B. In the live Navigator build

Set one public build variable:

`NEXT_PUBLIC_GRANT_FEED_URL=https://<github-owner>.github.io/<repository>/grants.json`

Then publish the Navigator **once** with the Step 3 `app/page.tsx`.

After this one-time publication, catalogue changes no longer require editing `page.tsx` or republishing the Navigator. Every visitor loads the latest verified catalogue directly from the public feed.

## Why a public feed is required

The user's browser cannot read a private GitHub repository without exposing credentials. The GitHub Pages workflow publishes only the two safe catalogue JSON files, not the repository and not secrets.

Do **not** put `FIRECRAWL_API_KEY`, GitHub tokens, internal notes, or private partner data into the Pages feed.

## Fail-safe behaviour

If the feed:

- returns a non-200 response;
- contains malformed JSON;
- fails schema validation;
- is temporarily unreachable;

then the Navigator keeps the embedded fallback catalogue and marks the header as `Резервні дані` instead of silently displaying invalid external data.

## Human decision boundary

Automation may update factual grant fields after Evidence Gate verification. It does not autonomously decide UTGA strategy. Existing human fields remain protected in Step 2:

- decision
- score
- idea
- owner
- internalDeadline
- nextAction
- risk
- fit

Browser-local changes to decision/owner/nextAction remain local to that device under the current architecture.

## End-to-end test

1. Change a harmless factual field in a test record in `data/grant-inbox.json`.
2. Run `node scripts/merge-grants.mjs data/grant-inbox.json`.
3. Commit `data/grants.json` + `data/catalogue-meta.json` to `main`.
4. Wait for `Publish UTGA Grant Feed` to complete.
5. Open the public `/grants.json` and verify the change.
6. Reload the live Navigator. It should show `LIVE` in the header and the new value.
7. Revert the test change if it was only a test.


## CSS integration (required)

Step 3 now ships a **complete** `app/globals.css`, not only a fragment. Replace the existing Grant Navigator `app/globals.css` with this file. It includes:

- feed status classes for `LIVE`, `loading`, `fallback`, and `error`;
- the existing `SUBMITTED` styling;
- a corrected desktop `decision-strip` grid with **6 columns** for the 6 decision states (`SUBMITTED`, `GO`, `PARTNER`, `PREPARE`, `MONITOR`, `NO-GO`).

`app/globals.step3.css` is retained only as a reference fragment. Do not use it instead of the full `app/globals.css`.

If you prefer a patch-only install, apply `step-3-css.patch` to the previously verified `globals.updated.css`.

## Repository hygiene (Step 3.2)

Generated files must not be committed as source. Keep the supplied `.gitignore` in the repository root. The canonical catalogue remains in `data/grants.json` and `data/catalogue-meta.json`; `scripts/publish-feed.mjs` regenerates `public/grants.json`, `public/catalogue-meta.json`, and `_site/*` during build/deploy.
