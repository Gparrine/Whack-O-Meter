# Whack-O-Meter

Browser-based force curve viewer with cassette-futurism UI, automatic signal trimming, and AI-powered sports-science analysis.

Live site: **https://gparrine.github.io/Whack-O-Meter/**

## Features

- Graph force vs. time from Loadstar LV-1000HS-10K CSV exports in `raw_data/`
- **CSV Manager Bot** trims baseline noise from files and assigns descriptive nicknames
- **Impact Readout** panel: peak force (N/lbf), time to peak, force decay, impulse, weapon type
- Auto-trim and optional full-timeline reconstruction from preserved trim metadata
- Axis scale slider to zoom in/out from auto bounds
- Search and cycle through CSV files by nickname or filename
- Centralized **error console** for system failures
- AI analysis panel backed by `analysis/memory.md`
- GitHub Actions workflows for CSV optimization, LLM analysis, and web research

## Local development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173/Whack-O-Meter/`.

## Adding CSV data

1. Drop `.csv` files into [`raw_data/`](raw_data/)
2. Push to `main` — the CSV Manager Bot runs automatically
3. The bot trims insignificant baseline readings, preserves trim timestamps, and updates [`raw_data/csv_manager_memory.md`](raw_data/csv_manager_memory.md)

CSV files stay in `raw_data/` on GitHub and are loaded at runtime via raw URLs (not bundled into the Pages deploy).

See [`raw_data/README.md`](raw_data/README.md) for details on the CSV manager bot.

## GitHub Pages deployment

The built site is published to [`docs/`](docs/) on each deploy.

**One-time setup (fixes blank white screen):**

1. Open [Repository Settings → Pages](https://github.com/Gparrine/Whack-O-Meter/settings/pages)
2. Under **Build and deployment**, choose **Deploy from a branch**
3. Set **Branch** to `main` and folder to **`/docs`**
4. Save, then re-run [Deploy GitHub Pages](https://github.com/Gparrine/Whack-O-Meter/actions/workflows/deploy.yml) if needed

Alternatively, set **Source** to **GitHub Actions** (the deploy workflow also uploads a Pages artifact).

Push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the app and commits updated files to `docs/`.

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| [csv_manager.yml](.github/workflows/csv_manager.yml) | Push to `raw_data/` | Trim CSVs, assign nicknames, update manager memory |
| [analyze.yml](.github/workflows/analyze.yml) | Push to `raw_data/` | AI analysis + web research |
| [deploy.yml](.github/workflows/deploy.yml) | Push to `main` | Build and deploy GitHub Pages |

Run **CSV Manager Bot** manually with **Reprocess all** to optimize every existing file.

## AI analysis secrets

| Secret | Purpose |
|--------|---------|
| `GEMINI_API_KEY` | LLM analysis via Google Gemini (`gemini-3.1-flash`) |
| `GOOGLE_API_KEY` | Alias for Gemini if named that way in repo secrets |
| `OPENAI_API_KEY` | Alternative LLM provider |
| `ANTHROPIC_API_KEY` | Alternative LLM provider |
| `TAVILY_API_KEY` | Web research (preferred) |
| `SERPER_API_KEY` | Alternative web search API |

The AI workflow updates [`analysis/memory.md`](analysis/memory.md), which the UI reads in the Data Analysis panel.

## Project structure

```
raw_data/                  CSV sensor exports + csv_manager_memory.md
analysis/                  AI memory markdown
public/data/               Generated manifest (build step)
scripts/                   CSV manager, manifest generator, AI analyzer
src/                       React frontend
```

## License

MIT (add license file if needed)
