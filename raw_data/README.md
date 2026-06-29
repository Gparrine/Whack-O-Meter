# raw_data

Force-meter CSV exports from the **Loadstar Sensors LV-1000HS-10K** (50,000 samples/sec).

This folder is managed by the **CSV Manager Bot** (`scripts/csv_manager.py`), which runs automatically via GitHub Actions whenever CSV files are added or changed.

## Folder layout

CSV files are sorted into category subfolders by striking object / weapon type:

```text
raw_data/
├── steel-test-ball-drop/     # 2" steel test ball drops (existing dataset)
├── unsorted/YYYY-MM-DD/      # uploads when weapon type cannot be determined
└── csv_manager_memory.md     # bot metadata (nicknames, metrics, categories)
```

Future categories get their own slug folder (for example `longsword-steel/`). Folder slugs are lowercase with hyphens, derived from the weapon type name.

## What the bot does

- Trims insignificant baseline readings before and after each impact event
- Preserves original time signatures in CSV comment headers so full timelines can be reconstructed
- Assigns a descriptive **nickname** to each file for display in the UI
- Detects or assigns **weapon type** and **category**, then moves the file into the matching subfolder
- Records metrics and trim metadata in [`csv_manager_memory.md`](csv_manager_memory.md)

## Adding new files

1. Drop `.csv` / `.CSV` files into `raw_data/` (root) or directly into a category folder if you know it
2. Push to `main`
3. The [CSV Manager workflow](https://github.com/Gparrine/Whack-O-Meter/actions/workflows/csv_manager.yml) runs automatically
4. The bot optimizes the file, assigns a nickname, categorizes it, and commits the result

### Sorting rules

| Situation | Destination |
|-----------|-------------|
| Known weapon type (header, memory, env, or folder) | `raw_data/{category-slug}/` |
| Legacy file at repo root | `raw_data/steel-test-ball-drop/` |
| Weapon type unknown | `raw_data/unsorted/YYYY-MM-DD/` |

Optional workflow inputs when running the bot manually:

- **`CSV_WEAPON_TYPE`** — e.g. `Steel Test Ball Drop`
- **`CSV_CATEGORY`** — slug override, e.g. `steel-test-ball-drop`

## Manual reprocessing

Run the **CSV Manager Bot** workflow manually with **Reprocess all** enabled to optimize every file.

## File format

Processed files include a manager header block:

```csv
# Whack-O-Meter CSV Manager v2
# Weapon type: Steel Test Ball Drop
# Category: steel-test-ball-drop
# Nickname: control bare plate · 9.8kN peak · fast decay
```

Data rows retain **absolute timestamps** from the original recording.
