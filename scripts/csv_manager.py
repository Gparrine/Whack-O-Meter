#!/usr/bin/env python3
"""Manage and optimize Loadstar force-meter CSV files in raw_data/."""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import median, pstdev

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "raw_data"
MEMORY_PATH = RAW_DIR / "csv_manager_memory.md"
DEFAULT_WEAPON_TYPE = "Steel Test Ball Drop"
DEFAULT_CATEGORY_SLUG = "steel-test-ball-drop"
UNSORTED_ROOT = "unsorted"
# Folder slug → weapon type and optional nickname prefix for the UI readout.
CATEGORY_REGISTRY: dict[str, dict[str, str]] = {
    "steel-test-ball-drop": {
        "weapon_type": "Steel Test Ball Drop",
    },
    "Regenyei_Standard_Federschwert": {
        "weapon_type": "Regenyei Standard Feder",
        "nickname_prefix": "Regenyei",
    },
}
LBF_PER_N = 1 / 4.44822
MANAGER_VERSION = "Whack-O-Meter CSV Manager v2"
TIMESTAMP_SUFFIX = re.compile(r"-20\d{12}$", re.I)
SKIP_FILENAMES = {"csv_manager_memory.md"}


@dataclass
class ParsedCsv:
    manager_lines: list[str]
    loadstar_lines: list[str]
    header: str
    rows: list[tuple[float, float]]
    samples_per_sec: float | None
    sensor_line: str | None


@dataclass
class ImpactWindow:
    start_index: int
    end_index: int
    peak_index: int
    baseline: float
    start_time: float
    end_time: float
    peak_time: float
    original_start: float
    original_end: float


@dataclass
class CatalogMetrics:
    peak_force_n: float
    peak_force_lbf: float
    time_to_peak_ms: float
    force_decay_ms: float
    impulse_ns: float
    weapon_type: str


@dataclass
class ProcessResult:
    relative_path: str
    nickname: str
    category: str
    metrics: CatalogMetrics
    window: ImpactWindow
    original_samples: int
    retained_samples: int
    content_hash: str


def relative_path(path: Path) -> str:
    return path.relative_to(RAW_DIR).as_posix()


def slugify_category(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "uncategorized"


def normalize_category_key(category: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", category.strip().lower()).strip("-")


def lookup_category_registry(category: str) -> dict[str, str] | None:
    if not category:
        return None
    normalized = normalize_category_key(category)
    for key, entry in CATEGORY_REGISTRY.items():
        if normalize_category_key(key) == normalized:
            return entry
    return None


def category_weapon_type(category: str) -> str | None:
    entry = lookup_category_registry(category)
    return entry.get("weapon_type") if entry else None


def category_nickname_prefix(category: str) -> str | None:
    entry = lookup_category_registry(category)
    if entry and entry.get("nickname_prefix"):
        return entry["nickname_prefix"]
    if not category or category == DEFAULT_CATEGORY_SLUG:
        return None
    if category.startswith(f"{UNSORTED_ROOT}/") or category == UNSORTED_ROOT:
        return None
    token = re.split(r"[_\-]+", category.strip())[0]
    if not token or token.lower() in {"steel", "unsorted", "sample"}:
        return None
    return token.replace("-", " ").title()


def parent_category(relative: str) -> str | None:
    parts = relative.split("/")
    if len(parts) <= 1:
        return None
    parent = parts[0]
    if parent == UNSORTED_ROOT:
        return parts[1] if len(parts) > 2 else UNSORTED_ROOT
    return parent


def discover_csv_files() -> list[Path]:
    files: list[Path] = []
    for path in RAW_DIR.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() != ".csv":
            continue
        if path.name in SKIP_FILENAMES:
            continue
        files.append(path)
    return sorted(files, key=lambda item: relative_path(item).lower())


def parse_manager_metadata(lines: list[str]) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for line in lines:
        if not line.startswith("#"):
            continue
        text = line[1:].strip()
        if ":" not in text:
            continue
        key, value = text.split(":", 1)
        metadata[key.strip().lower()] = value.strip()
    return metadata


def read_weapon_from_parsed(parsed: ParsedCsv | None) -> str | None:
    if not parsed:
        return None
    metadata = parse_manager_metadata(parsed.manager_lines)
    return metadata.get("weapon type") or None


def read_category_from_parsed(parsed: ParsedCsv | None) -> str | None:
    if not parsed:
        return None
    metadata = parse_manager_metadata(parsed.manager_lines)
    return metadata.get("category") or None


def read_weapon_from_memory(sections: dict[str, str], key: str) -> str | None:
    section = sections.get(key)
    if not section:
        return None
    match = re.search(r"\*\*Weapon type\*\*:\s*(.+)$", section, re.M)
    return match.group(1).strip() if match else None


def read_nickname_from_memory(sections: dict[str, str], key: str) -> str | None:
    section = sections.get(key)
    if not section:
        return None
    match = re.search(r"\*\*Nickname\*\*:\s*(.+)$", section, re.M)
    return match.group(1).strip() if match else None


def needs_metadata_refresh(
    path: Path,
    parsed: ParsedCsv | None,
    sections: dict[str, str],
) -> bool:
    rel = relative_path(path)
    weapon_type, category = resolve_category(path, parsed, sections)
    stored_weapon = read_weapon_from_memory(sections, rel) or read_weapon_from_memory(
        sections, path.name
    )
    if stored_weapon and stored_weapon != weapon_type:
        return True

    prefix = category_nickname_prefix(category)
    if not prefix:
        return False

    stored_nickname = read_nickname_from_memory(sections, rel) or read_nickname_from_memory(
        sections, path.name
    )
    if stored_nickname and not stored_nickname.lower().startswith(f"{prefix.lower()} ·"):
        return True

    parsed_weapon = read_weapon_from_parsed(parsed)
    if parsed_weapon and parsed_weapon != weapon_type:
        return True

    parsed_metadata = parse_manager_metadata(parsed.manager_lines) if parsed else {}
    parsed_nickname = parsed_metadata.get("nickname")
    if prefix and parsed_nickname and not parsed_nickname.lower().startswith(f"{prefix.lower()} ·"):
        return True

    return False


def migrate_memory_key(sections: dict[str, str], old_key: str, new_key: str) -> None:
    if old_key == new_key:
        return
    if old_key in sections and new_key not in sections:
        sections[new_key] = sections.pop(old_key)
    elif old_key in sections and new_key in sections:
        sections.pop(old_key, None)


def resolve_category(
    path: Path,
    parsed: ParsedCsv | None,
    sections: dict[str, str],
) -> tuple[str, str]:
    rel = relative_path(path)
    env_weapon = os.getenv("CSV_WEAPON_TYPE", "").strip()
    env_category = os.getenv("CSV_CATEGORY", "").strip()
    if env_weapon:
        return env_weapon, env_category or slugify_category(env_weapon)

    folder = parent_category(rel)
    if folder and folder != UNSORTED_ROOT and not folder.startswith(f"{UNSORTED_ROOT}/"):
        folder_weapon = category_weapon_type(folder)
        if folder_weapon:
            return folder_weapon, folder

    parsed_weapon = read_weapon_from_parsed(parsed)
    parsed_category = read_category_from_parsed(parsed)
    if parsed_weapon:
        return parsed_weapon, parsed_category or slugify_category(parsed_weapon)

    memory_weapon = read_weapon_from_memory(sections, rel) or read_weapon_from_memory(
        sections, path.name
    )
    memory_category = read_category_from_memory(sections, rel) or read_category_from_memory(
        sections, path.name
    )
    if memory_weapon:
        return memory_weapon, memory_category or slugify_category(memory_weapon)

    if folder and folder != UNSORTED_ROOT:
        return DEFAULT_WEAPON_TYPE, folder

    if path.parent == RAW_DIR:
        return DEFAULT_WEAPON_TYPE, DEFAULT_CATEGORY_SLUG

    dated = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return "Uncategorized", f"{UNSORTED_ROOT}/{dated}"


def category_directory(category: str) -> Path:
    return RAW_DIR / category


def ensure_categorized_path(
    path: Path,
    category: str,
    sections: dict[str, str],
) -> Path:
    dest_dir = category_directory(category)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / path.name
    if path.resolve() == dest.resolve():
        return dest

    old_rel = relative_path(path)
    new_rel = relative_path(dest)
    if dest.exists() and dest.resolve() != path.resolve():
        raise ValueError(f"Cannot move {old_rel} → {new_rel}: destination already exists")

    shutil.move(str(path), str(dest))
    migrate_memory_key(sections, old_rel, new_rel)
    migrate_memory_key(sections, path.name, new_rel)
    print(f"Sorted {path.name} → {new_rel}")
    return dest


def migrate_legacy_root_csvs(sections: dict[str, str]) -> bool:
    changed = False
    for path in list(RAW_DIR.iterdir()):
        if not path.is_file() or path.suffix.lower() != ".csv":
            continue
        if path.name in SKIP_FILENAMES:
            continue
        dest = ensure_categorized_path(path, DEFAULT_CATEGORY_SLUG, sections)
        migrate_memory_key(sections, path.name, relative_path(dest))
        changed = True
    return changed


def read_csv(path: Path) -> ParsedCsv:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    manager_lines: list[str] = []
    loadstar_lines: list[str] = []
    data_lines: list[str] = []
    phase = "manager"

    for line in lines:
        if phase == "manager":
            if line.startswith("#"):
                manager_lines.append(line)
                continue
            if line.startswith("Loadstar Sensors"):
                phase = "loadstar"
                loadstar_lines.append(line)
                continue
            if re.search(r"time", line, re.I) and re.search(
                r"reading|force|\(n\)|impact|_g\b|\bg\b", line, re.I
            ):
                phase = "data"
                data_lines.append(line)
                continue
            continue

        if phase == "loadstar":
            if re.search(r"time", line, re.I) and re.search(
                r"reading|force|\(n\)|impact|_g\b|\bg\b", line, re.I
            ):
                phase = "data"
                data_lines.append(line)
            else:
                loadstar_lines.append(line)
            continue

        data_lines.append(line)

    if not data_lines:
        raise ValueError(f"{path.name} has no recognizable data header")

    header = data_lines[0]
    rows: list[tuple[float, float]] = []
    for line in data_lines[1:]:
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) < 2:
            continue
        try:
            rows.append((float(parts[0]), float(parts[1])))
        except ValueError:
            continue

    if not rows:
        raise ValueError(f"{path.name} has no numeric data rows")

    samples_per_sec = None
    sensor_line = None
    for line in loadstar_lines:
        if line.lower().startswith("samples/sec:"):
            samples_per_sec = float(line.split(",", 1)[1])
        if line.lower().startswith("sensor:"):
            sensor_line = line

    return ParsedCsv(manager_lines, loadstar_lines, header, rows, samples_per_sec, sensor_line)


def detect_impact_window(rows: list[tuple[float, float]], k: float = 3.0) -> ImpactWindow:
    times = [row[0] for row in rows]
    forces = [row[1] for row in rows]

    edge_count = max(1, len(forces) // 20)
    baseline_samples = forces[:edge_count] + forces[-edge_count:]
    baseline = median(baseline_samples)
    spread = pstdev(baseline_samples) if len(baseline_samples) > 1 else 0.0
    peak_delta = max(abs(value - baseline) for value in forces)
    threshold = max(spread * k, peak_delta * 0.05, 1e-6)

    start_index = 0
    end_index = len(forces) - 1
    for index, value in enumerate(forces):
        if abs(value - baseline) > threshold:
            start_index = index
            break
    for index in range(len(forces) - 1, -1, -1):
        if abs(forces[index] - baseline) > threshold:
            end_index = index
            break

    if start_index >= end_index:
        peak_index = max(range(len(forces)), key=lambda i: forces[i])
        pad = max(2, len(forces) // 50)
        start_index = max(0, peak_index - pad)
        end_index = min(len(forces) - 1, peak_index + pad)
    else:
        pad = max(1, (end_index - start_index + 1) // 50)
        start_index = max(0, start_index - pad)
        end_index = min(len(forces) - 1, end_index + pad)
        peak_index = max(range(start_index, end_index + 1), key=lambda i: forces[i])

    return ImpactWindow(
        start_index=start_index,
        end_index=end_index,
        peak_index=peak_index,
        baseline=baseline,
        start_time=times[start_index],
        end_time=times[end_index],
        peak_time=times[peak_index],
        original_start=times[0],
        original_end=times[-1],
    )


def compute_metrics(
    rows: list[tuple[float, float]], window: ImpactWindow, weapon_type: str
) -> CatalogMetrics:
    event_rows = rows[window.start_index : window.end_index + 1]
    peak_force_n = event_rows[window.peak_index - window.start_index][1]

    impulse_ns = 0.0
    for index in range(1, len(event_rows)):
        t0, f0 = event_rows[index - 1]
        t1, f1 = event_rows[index]
        impulse_ns += ((f0 + f1) / 2) * (t1 - t0)

    return CatalogMetrics(
        peak_force_n=peak_force_n,
        peak_force_lbf=peak_force_n * LBF_PER_N,
        time_to_peak_ms=max(0.0, window.peak_time - window.start_time) * 1000,
        force_decay_ms=max(0.0, window.end_time - window.peak_time) * 1000,
        impulse_ns=impulse_ns,
        weapon_type=weapon_type,
    )


def filename_base(name: str) -> str:
    stem = Path(name).stem
    stem = TIMESTAMP_SUFFIX.sub("", stem)
    return re.sub(r"[_+\-]+", " ", stem).strip().lower()


def peak_descriptor(peak_force_n: float) -> str:
    if abs(peak_force_n) >= 1000:
        return f"{abs(peak_force_n / 1000):.1f}kN peak"
    return f"{abs(peak_force_n):.0f}N peak"


def decay_descriptor(force_decay_ms: float) -> str:
    return "slow decay" if force_decay_ms >= 8 else "fast decay"


def build_nickname(
    filename: str,
    metrics: CatalogMetrics,
    assigned: set[str],
    category: str,
) -> str:
    base = filename_base(filename)
    descriptor = f"{peak_descriptor(metrics.peak_force_n)} · {decay_descriptor(metrics.force_decay_ms)}"
    prefix = category_nickname_prefix(category)
    nickname = f"{prefix} · {base} · {descriptor}" if prefix else f"{base} · {descriptor}"
    if nickname not in assigned:
        assigned.add(nickname)
        return nickname

    counter = 2
    while True:
        stem = f"{prefix} · {base}" if prefix else base
        candidate = f"{stem} · {descriptor} · run {counter}"
        if candidate not in assigned:
            assigned.add(candidate)
            return candidate
        counter += 1


def render_csv(
    parsed: ParsedCsv,
    window: ImpactWindow,
    metrics: CatalogMetrics,
    nickname: str,
    category: str,
) -> str:
    trimmed_rows = parsed.rows[window.start_index : window.end_index + 1]
    samples_per_sec = parsed.samples_per_sec or 50000
    lines = [
        f"# {MANAGER_VERSION}",
        f"# Original samples: {len(parsed.rows)}",
        f"# Samples/sec: {samples_per_sec:g}",
        f"# Prefix trimmed: {window.original_start:.5f} - {window.start_time:.5f} sec",
        f"# Suffix trimmed: {window.end_time:.5f} - {window.original_end:.5f} sec",
        f"# Event start: {window.start_time:.5f} sec",
        f"# Event end: {window.end_time:.5f} sec",
        f"# Baseline (N): {window.baseline:.1f}",
        f"# Weapon type: {metrics.weapon_type}",
        f"# Category: {category}",
        f"# Nickname: {nickname}",
    ]

    if parsed.loadstar_lines:
        lines.extend(parsed.loadstar_lines)
    else:
        lines.extend(
            [
                "Loadstar Sensors LV-1000HS-10K - Log File",
                parsed.sensor_line or "Sensor:,Whackometer",
                f"Samples/Sec:,{samples_per_sec:g}",
            ]
        )

    lines.append(parsed.header)
    for time_value, force_value in trimmed_rows:
        lines.append(f"{time_value:.5f},{force_value}")
    lines.append("")
    return "\n".join(lines)


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_memory_sections(markdown: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    parts = re.split(r"^## ", markdown, flags=re.M)
    for part in parts[1:]:
        newline = part.find("\n")
        if newline == -1:
            continue
        filename = part[:newline].strip()
        sections[filename] = part[newline + 1 :].strip()
    return sections


def render_memory_section(result: ProcessResult) -> str:
    return (
        f"## {result.relative_path}\n"
        f"- **Nickname**: {result.nickname}\n"
        f"- **Category**: {result.category}\n"
        f"- **Processed**: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}\n"
        f"- **Original samples**: {result.original_samples} → **Retained**: {result.retained_samples}\n"
        f"- **Event window**: {result.window.start_time:.5f} – {result.window.end_time:.5f} sec\n"
        f"- **Prefix trimmed**: {result.window.original_start:.5f} – {result.window.start_time:.5f} sec\n"
        f"- **Suffix trimmed**: {result.window.end_time:.5f} – {result.window.original_end:.5f} sec\n"
        f"- **Peak**: {result.metrics.peak_force_n:.1f} N ({result.metrics.peak_force_lbf:.1f} lbf)\n"
        f"- **Time to peak**: {result.metrics.time_to_peak_ms:.2f} ms\n"
        f"- **Force decay**: {result.metrics.force_decay_ms:.2f} ms\n"
        f"- **Impulse**: {result.metrics.impulse_ns:.2f} N·s\n"
        f"- **Weapon type**: {result.metrics.weapon_type}\n"
        f"- **Content hash**: {result.content_hash}\n"
    )


def render_memory(sections: dict[str, str]) -> str:
    header = (
        "# Whack-O-Meter CSV Manager Memory\n\n"
        "> Auto-updated by the CSV manager bot. Do not edit structure headers.\n\n"
    )
    body = [f"## {key}\n{sections[key].strip()}\n" for key in sorted(sections.keys())]
    return header + "\n".join(body)


def process_file(
    path: Path,
    assigned_nicknames: set[str],
    sections: dict[str, str],
) -> ProcessResult | None:
    parsed = read_csv(path)
    weapon_type, category = resolve_category(path, parsed, sections)
    path = ensure_categorized_path(path, category, sections)

    parsed = read_csv(path)
    weapon_type, category = resolve_category(path, parsed, sections)
    window = detect_impact_window(parsed.rows)
    metrics = compute_metrics(parsed.rows, window, weapon_type)
    nickname = build_nickname(path.name, metrics, assigned_nicknames, category)
    rendered = render_csv(parsed, window, metrics, nickname, category)

    existing_hash = None
    if parsed.manager_lines:
        existing = parse_manager_metadata(parsed.manager_lines)
        existing_hash = existing.get("content hash")

    new_hash = content_hash(rendered)
    rel = relative_path(path)
    if existing_hash == new_hash and path.read_text(encoding="utf-8") == rendered:
        return None

    path.write_text(rendered, encoding="utf-8")
    retained = window.end_index - window.start_index + 1
    return ProcessResult(
        relative_path=rel,
        nickname=nickname,
        category=category,
        metrics=metrics,
        window=window,
        original_samples=len(parsed.rows),
        retained_samples=retained,
        content_hash=new_hash,
    )


def main() -> int:
    reprocess_all = os.getenv("REPROCESS_ALL", "").lower() in {"1", "true", "yes"}
    target = os.getenv("CSV_FILENAME", "").strip()

    memory_text = (
        MEMORY_PATH.read_text(encoding="utf-8")
        if MEMORY_PATH.exists()
        else "# Whack-O-Meter CSV Manager Memory\n\n> Auto-updated by the CSV manager bot.\n\n"
    )
    sections = parse_memory_sections(memory_text)
    assigned_nicknames = set(
        re.search(r"\*\*Nickname\*\*:\s*(.+)$", section, re.M).group(1).strip()
        for section in sections.values()
        if re.search(r"\*\*Nickname\*\*:\s*(.+)$", section, re.M)
    )

    migrated = migrate_legacy_root_csvs(sections)
    if migrated:
        print(f"Moved legacy root CSV files into {DEFAULT_CATEGORY_SLUG}/")

    csv_files = discover_csv_files()
    if target:
        csv_files = [
            path
            for path in csv_files
            if path.name == target or relative_path(path) == target or path.name.endswith(target)
        ]

    if not csv_files:
        print("No CSV files found.")
        if migrated:
            MEMORY_PATH.write_text(render_memory(sections), encoding="utf-8")
        return 0

    changed = migrated
    for path in csv_files:
        rel = relative_path(path)
        if not reprocess_all and rel in sections and not target:
            current_hash = content_hash(path.read_text(encoding="utf-8"))
            stored_hash_match = re.search(r"\*\*Content hash\*\*:\s*([a-f0-9]+)", sections[rel], re.I)
            if not stored_hash_match:
                stored_hash_match = re.search(
                    r"\*\*Content hash\*\*:\s*([a-f0-9]+)", sections.get(path.name, ""), re.I
                )
            if (
                stored_hash_match
                and stored_hash_match.group(1) == current_hash
                and not needs_metadata_refresh(path, read_csv(path), sections)
            ):
                print(f"Skipping unchanged {rel}")
                continue

        print(f"Processing {rel}...")
        try:
            result = process_file(path, assigned_nicknames, sections)
            if result is None:
                print(f"No changes needed for {rel}")
                continue
            sections[result.relative_path] = render_memory_section(result).split("\n", 1)[1]
            if path.name in sections and path.name != result.relative_path:
                sections.pop(path.name, None)
            changed = True
            print(
                f"Optimized {result.relative_path} "
                f"({result.original_samples} → {result.retained_samples} samples)"
            )
        except Exception as exc:  # noqa: BLE001
            print(f"Failed to process {rel}: {exc}", file=sys.stderr)

    if changed:
        MEMORY_PATH.write_text(render_memory(sections), encoding="utf-8")
        print(f"Updated {MEMORY_PATH}")
    else:
        print("No CSV manager changes.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
