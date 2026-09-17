# Step 3.2 — repository hygiene

This maintenance update does **not** change Grant Watcher, Evidence Gate, feed validation, fallback logic, schedules, or secret handling.

It only removes generated runtime/build artefacts from the distributable repository package and adds `.gitignore` rules so they are not committed accidentally.

Ignored/generated paths:

- `__pycache__/`
- `*.py[cod]`
- `_site/`
- `public/grants.json`
- `public/catalogue-meta.json`
- local `.env*` files (except `.env.example`)

Canonical source-of-truth feed files remain versioned under `data/`:

- `data/grants.json`
- `data/catalogue-meta.json`

`scripts/publish-feed.mjs` recreates `public/*.json` and `_site/*` when the feed is built/deployed.
