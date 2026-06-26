# Whack-O-Meter

Browser-based force curve viewer with cassette-futurism UI, automatic signal trimming, and AI-powered sports-science analysis.

Live site: **https://gparrine.github.io/whack-o-meter/**

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

The dev server runs at `http://localhost:5173/whack-o-meter/`.

## Adding CSV data

1. Drop `.csv` files into [`raw_data/`](raw_data/)
2. Include headers with recognizable time/force columns (`time_s`, `force_N`, `timestamp_ms`, `impact_g`, etc.)
3. Run `npm run generate:manifest` or `npm run build` to refresh the manifest

## GitHub Pages deployment

Push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

In repository settings, enable **GitHub Pages** with source **GitHub Actions**.

## AI analysis workflow

Run [`.github/workflows/analyze.yml`](.github/workflows/analyze.yml) manually or push new CSV files to `raw_data/`.

### Required secrets

| Secret | Purpose |
|--------|---------|
| `OPENAI_API_KEY` | LLM analysis (preferred) |
| `ANTHROPIC_API_KEY` | Alternative LLM provider |
| `TAVILY_API_KEY` | Web research (preferred) |
| `SERPER_API_KEY` | Alternative web search API |

At least one LLM key and one search key are recommended for full analysis.

The workflow updates [`analysis/memory.md`](analysis/memory.md), which the UI reads in the Data Analysis panel. Use **Check for Updates** in the app to poll for new results after triggering the workflow.

## Project structure

```
raw_data/           CSV sensor exports
analysis/           AI memory markdown
public/data/        Generated manifest (build step)
scripts/            Manifest generator + AI analyzer
src/                React frontend
```

## License

MIT (add license file if needed)
