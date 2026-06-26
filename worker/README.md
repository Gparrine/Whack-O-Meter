# Whack-O-Meter Analysis Worker

Cloudflare Worker proxy for **Run AI Analysis** on the live GitHub Pages site.

## Deploy (from this folder)

```bash
cd worker
npx wrangler login          # first time only
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GITHUB_PAT   # optional — repo memory commits
npx wrangler deploy
```

Use the URL printed by `wrangler deploy` as the GitHub repo variable **`ANALYSIS_API_URL`**.

## Model

This worker always calls **`gemini-3.1-flash`** (hardcoded in `analyze.js`).

If you previously ran `wrangler secret put GEMINI_MODEL`, delete it so it cannot override the model:

```bash
npx wrangler secret delete GEMINI_MODEL
```

Also remove `GEMINI_MODEL=...` from `.dev.vars` if present.

## Deploy from the correct directory

Run commands from **`Whack-O-Meter/worker`** at the repo root — not a nested duplicate copy.

```bash
git clone https://github.com/Gparrine/Whack-O-Meter.git
cd Whack-O-Meter/worker
npx wrangler deploy
```
