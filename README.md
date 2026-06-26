# Whack-O-Meter

Force sensor data viewer for Loadstar LV-1000HS-10K CSV files. Cassette-futurism UI with force vs time graphs, CSV search, and AI analysis.

**Live site:** https://gparrine.github.io/Whack-O-Meter/

## GitHub Pages setup (one-time)

After the first deploy workflow run:

1. Open **Settings → Pages**
2. Under **Build and deployment → Source**, choose **Deploy from a branch**
3. **Branch:** `gh-pages` · **Folder:** `/ (root)`
4. Save

The deploy workflow pushes a fresh build to the `gh-pages` branch on every push to `main`. Do **not** use `/docs` on `main` — that folder is no longer used for hosting.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173/Whack-O-Meter/ — CSV files are served from the local `raw_data/` folder.

## Build

```bash
npm run build
npm run preview   # http://localhost:4173/Whack-O-Meter/
```

## CSV data

Raw Loadstar CSVs live in `raw_data/`. At runtime the app loads them from GitHub (`raw.githubusercontent.com`), not from the built bundle.

## CSV Manager bot

On push to `raw_data/`, `.github/workflows/csv_manager.yml` runs `scripts/csv_manager.py`:

- Trims baseline noise from each CSV
- Assigns a short nickname from the filename
- Writes metrics and trim metadata into `raw_data/csv_manager_memory.md`
- Rewrites trimmed CSVs in place

Reprocess everything manually: **Actions → CSV Manager → Run workflow → reprocess_all**.

## AI analysis

### In the browser (Data Analysis panel)

- Click **Run AI Analysis** to call Gemini directly — no manual API key entry in the UI.
- **Local dev:** set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in your shell before `npm run dev`; the Vite dev server proxies `/api/analyze`.
- **Production (GitHub Pages):** the deploy workflow injects `GEMINI_API_KEY` at build time as `VITE_GEMINI_API_KEY`.
- Optional repo secret **`ANALYSIS_COMMIT_PAT`** (fine-grained, Contents write) is injected at build to persist analysis memory automatically.
- Use **Analysis Parameters** to add custom questions or context to the prompt.
- With two readout panes loaded, the AI compares both curves automatically.
- **Check for Previous Analysis** loads stored memory for the selected curve(s).

### GitHub Actions (batch)

`.github/workflows/analyze.yml` runs `scripts/analyze_csv.py` when CSVs change. Set repository secret **`GEMINI_API_KEY`** (or `GOOGLE_API_KEY`) for Gemini. Output: `analysis/memory.md`, copied into the site at build time.

## Project layout

| Path | Purpose |
|------|---------|
| `src/` | React app (Vite + TypeScript, uPlot) |
| `raw_data/` | Source CSV files |
| `scripts/csv_manager.py` | Trim + nickname automation |
| `scripts/analyze_csv.py` | Gemini analysis |
| `scripts/generate_manifest.js` | Builds `public/data/manifest.json` |
| `.github/workflows/deploy.yml` | Build + push to `gh-pages` |
