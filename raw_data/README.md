# raw_data

Force-meter CSV exports from the **Loadstar Sensors LV-1000HS-10K** (50,000 samples/sec).

This folder is managed by the **CSV Manager Bot** (`scripts/csv_manager.py`), which runs automatically via GitHub Actions whenever CSV files are added or changed.

## What the bot does

- Trims insignificant baseline readings before and after each impact event
- Preserves original time signatures in CSV comment headers so full timelines can be reconstructed
- Assigns a descriptive **nickname** to each file for display in the UI
- Records metrics and trim metadata in [`csv_manager_memory.md`](csv_manager_memory.md)

## Adding new files

1. Drop `.csv` or `.CSV` files into this folder
2. Push to `main`
3. The [CSV Manager workflow](https://github.com/Gparrine/Whack-O-Meter/actions/workflows/csv_manager.yml) runs automatically
4. Optimized files and updated memory are committed back to the repo

## Manual reprocessing

Run the **CSV Manager Bot** workflow manually with **Reprocess all** enabled to optimize every file.

## File format

Processed files include a manager header block:

```csv
# Whack-O-Meter CSV Manager v1
# Prefix trimmed: 0.00000 - 0.84200 sec
# Suffix trimmed: 0.85100 - 1.00200 sec
# Event start: 0.84200 sec
# Event end: 0.85100 sec
# Nickname: control bare plate · 9.8kN peak · fast decay
```

Data rows retain **absolute timestamps** from the original recording.
