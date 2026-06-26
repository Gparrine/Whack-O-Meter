# Whack-O-Meter Analysis Worker

Cloudflare Worker proxy for **Run AI Analysis** on the live GitHub Pages site.

## Deploy (from this folder)

```bash
git pull origin main
cd worker
npx wrangler login          # first time only
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GITHUB_PAT   # optional — repo memory commits
npx wrangler secret delete GEMINI_MODEL   # safe to run even if missing
npx wrangler deploy
```

Use the URL printed by `wrangler deploy` as the GitHub repo variable **`ANALYSIS_API_URL`**.

## Verify deployment

After `wrangler deploy`, confirm the live worker is on the new model:

```bash
curl -s "https://YOUR-WORKER.workers.dev/health"
```

Expected response:

```json
{"ok":true,"service":"whack-o-meter-analysis","model":"gemini-3.1-flash-lite","githubPatConfigured":true,"githubRepository":"Gparrine/Whack-O-Meter"}
```

- `githubPatConfigured: false` → run `npx wrangler secret put GITHUB_PAT` in this folder (exact name).
- `githubPatConfigured: true` but analysis still fails to save memory → token lacks **Contents: Read and write** on `Gparrine/Whack-O-Meter`, or `main` branch protection blocks direct commits.

If `model` is still `gemini-3.1-flash`, you deployed stale code (wrong folder or old checkout). Pull latest `main` and redeploy from **`worker/` at the repo root**.

## Model

This worker always calls **`gemini-3.1-flash-lite`** (hardcoded in `analyze.js`).

`gemini-3.1-flash` (without `-lite`) is **not** a valid Gemini API model and returns HTTP 404.

If you previously ran `wrangler secret put GEMINI_MODEL`, delete it:

```bash
npx wrangler secret delete GEMINI_MODEL
```

Also remove `GEMINI_MODEL=...` from `.dev.vars` if present.

## Deploy from the correct directory

Run commands from **`worker/` at the repo root** — not a nested duplicate copy.

```bash
git clone https://github.com/Gparrine/Whack-O-Meter.git
cd Whack-O-Meter
git pull origin main
cd worker
npx wrangler deploy
```
