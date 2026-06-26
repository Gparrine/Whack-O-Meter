#!/usr/bin/env python3
"""Manage and optimize Loadstar force-meter CSV files in raw_data/."""

from __future__ import annotations

import hashlib
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import median, pstdev

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "raw_data"
MEMORY_PATH = RAW_DIR / "csv_manager_memory.md"
WEAPON_TYPE = "Rengenyei Standard"
LBF_PER_N = 1 / 4.44822
MANAGER_VERSION = "Whack-O-Meter CSV Manager v1"
TIMESTAMP_SUFFIX = re.compile(r"-20\d{12}$", re.I)


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
    filename: str
    nickname: str
    metrics: CatalogMetrics
    window: ImpactWindow
    original_samples: int
    retained_samples: int
    content_hash: str


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
            if re.search(r"time", line, re.I) and re.search(r"reading|force|\(n\)|impact|_g\b|\bg\b", line, re.I):
                phase = "data"
                data_lines.append(line)
                continue
            continue

        if phase == "loadstar":
            if re.search(r"time", line, re.I) and re.search(r"reading|force|\(n\)|impact|_g\b|\bg\b", line, re.I):
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


def compute_metrics(rows: list[tuple[float, float]], window: ImpactWindow) -> CatalogMetrics:
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
        weapon_type=WEAPON_TYPE,
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


def build_nickname(filename: str, metrics: CatalogMetrics, assigned: set[str]) -> str:
    base = filename_base(filename)
    descriptor = f"{peak_descriptor(metrics.peak_force_n)} · {decay_descriptor(metrics.force_decay_ms)}"
    nickname = f"{base} · {descriptor}"
    if nickname not in assigned:
        assigned.add(nickname)
        return nickname

    counter = 2
    while True:
        candidate = f"{base} · {descriptor} · run {counter}"
        if candidate not in assigned:
            assigned.add(candidate)
            return candidate
        counter += 1


def render_csv(parsed: ParsedCsv, window: ImpactWindow, metrics: CatalogMetrics, nickname: str) -> str:
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
        f"## {result.filename}\n"
        f"- **Nickname**: {result.nickname}\n"
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


def process_file(path: Path, assigned_nicknames: set[str]) -> ProcessResult | None:
    parsed = read_csv(path)
    window = detect_impact_window(parsed.rows)
    metrics = compute_metrics(parsed.rows, window)
    nickname = build_nickname(path.name, metrics, assigned_nicknames)
    rendered = render_csv(parsed, window, metrics, nickname)
    existing_hash = None
    if parsed.manager_lines:
        existing = parse_manager_metadata(parsed.manager_lines)
        existing_hash = existing.get("content hash")

    new_hash = content_hash(rendered)
    if existing_hash == new_hash or path.read_text(encoding="utf-8") == rendered:
        return None

    path.write_text(rendered, encoding="utf-8")
    retained = window.end_index - window.start_index + 1
    return ProcessResult(
        filename=path.name,
        nickname=nickname,
        metrics=metrics,
        window=window,
        original_samples=len(parsed.rows),
        retained_samples=retained,
        content_hash=new_hash,
    )


def main() -> int:
    reprocess_all = os.getenv("REPROCESS_ALL", "").lower() in {"1", "true", "yes"}
    target = os.getenv("CSV_FILENAME", "").strip()

    csv_files = sorted(
        path
        for path in RAW_DIR.glob("*")
        if path.suffix.lower() == ".csv" and path.name != "csv_manager_memory.md"
    )
    if target:
        csv_files = [path for path in csv_files if path.name == target]

    if not csv_files:
        print("No CSV files found.")
        return 0

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

    changed = False
    for path in csv_files:
        if not reprocess_all and path.name in sections and not target:
            current_hash = content_hash(path.read_text(encoding="utf-8"))
            stored_hash_match = re.search(r"\*\*Content hash\*\*:\s*([a-f0-9]+)", sections[path.name], re.I)
            if stored_hash_match and stored_hash_match.group(1) == current_hash:
                print(f"Skipping unchanged {path.name}")
                continue

        print(f"Processing {path.name}...")
        try:
            result = process_file(path, assigned_nicknames)
            if result is None:
                print(f"No changes needed for {path.name}")
                continue
            sections[result.filename] = render_memory_section(result).split("\n", 1)[1]
            changed = True
            print(f"Optimized {path.name} ({result.original_samples} → {result.retained_samples} samples)")
        except Exception as exc:  # noqa: BLE001
            print(f"Failed to process {path.name}: {exc}", file=sys.stderr)

    if changed:
        MEMORY_PATH.write_text(render_memory(sections), encoding="utf-8")
        print(f"Updated {MEMORY_PATH}")
    else:
        print("No CSV manager changes.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
