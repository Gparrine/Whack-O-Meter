# Whack-O-Meter

Browser-based force curve viewer with cassette-futurism UI, automatic signal trimming, and AI-powered sports-science analysis.

Live site: **https://gparrine.github.io/Whack-O-Meter/**

## Features

- Graph force vs. time from CSV files in `raw_data/`
- Auto-trim to significant impact regions
- Axis scale slider to zoom in/out from auto bounds
- Search and cycle through CSV files with prev/next controls
- AI analysis panel backed by `analysis/memory.md`
- GitHub Actions workflow for LLM + web research enrichment

## Local development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173/Whack-O-Meter/`.

## Adding CSV data

1. Drop `.csv` files into [`raw_data/`](raw_data/)
2. Include headers with recognizable time/force columns (`time_s`, `force_N`, `timestamp_ms`, `impact_g`, etc.)
3. Run `npm run generate:manifest` or `npm run build` to refresh the manifest

CSV files stay in `raw_data/` on GitHub and are loaded at runtime via raw URLs (not bundled into the Pages deploy).

## GitHub Pages deployment

**One-time setup (required — site 404s without this):**

1. Open [Repository Settings → Pages](https://github.com/Gparrine/Whack-O-Meter/settings/pages)
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push to `main` or re-run the [Deploy GitHub Pages](https://github.com/Gparrine/Whack-O-Meter/actions/workflows/deploy.yml) workflow

Push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## AI analysis workflow

Run [`.github/workflows/analyze.yml`](.github/workflows/analyze.yml) manually or push new CSV files to `raw_data/`.

### Required secrets

| Secret | Purpose |
|--------|---------|
| `GEMINI_API_KEY` | LLM analysis via Google Gemini (`gemini-3.1-flash`) |
| `GOOGLE_API_KEY` | Alias for Gemini if named that way in repo secrets |
| `OPENAI_API_KEY` | Alternative LLM provider |
| `ANTHROPIC_API_KEY` | Alternative LLM provider |
| `TAVILY_API_KEY` | Web research (preferred) |
| `SERPER_API_KEY` | Alternative web search API |

At least one LLM key and one search key are recommended for full analysis.

The workflow updates [`analysis/memory.md`](analysis/memory.md), which the UI reads in the Data Analysis panel. Use **Check for Updates** in the app to poll for new results after triggering the workflow.

## Project structure

```
raw_data/           CSV sensor exports (served via raw.githubusercontent.com)
analysis/           AI memory markdown
public/data/        Generated manifest (build step)
scripts/            Manifest generator + AI analyzer
src/                React frontend
```

## License

MIT (add license file if needed)
