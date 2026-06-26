#!/usr/bin/env python3
"""Analyze force-meter CSV curves with LLM + web research; update analysis/memory.md."""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "raw_data"
MEMORY_PATH = ROOT / "analysis" / "memory.md"

TIME_PATTERNS = (
    re.compile(r"^time", re.I),
    re.compile(r"^timestamp", re.I),
    re.compile(r"^t$", re.I),
    re.compile(r"^t_", re.I),
    re.compile(r"ms$", re.I),
    re.compile(r"seconds?$", re.I),
)

FORCE_PATTERNS = (
    re.compile(r"^force", re.I),
    re.compile(r"^g$", re.I),
    re.compile(r"^g_", re.I),
    re.compile(r"accel", re.I),
    re.compile(r"^impact", re.I),
    re.compile(r"reading", re.I),
    re.compile(r"_n$", re.I),
    re.compile(r"^n$", re.I),
)


@dataclass
class Series:
    filename: str
    time: list[float]
    force: list[float]
    time_label: str
    force_label: str


@dataclass
class Metrics:
    peak_force: float
    peak_time: float
    impulse: float
    duration_above_threshold: float
    rise_rate: float
    sample_count: int


def read_csv(path: Path) -> Series:
    import csv

    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    data_lines: list[str] = []
    started = False

    for line in lines:
        if line.startswith("#"):
            continue
        if not started:
            if re.search(r"time", line, re.I) and re.search(
                r"reading|force|\(n\)|impact|_g\b|\bg\b", line, re.I
            ):
                started = True
                data_lines.append(line)
            continue
        data_lines.append(line)

    if len(data_lines) < 2:
        raise ValueError(f"{path.name} has no recognizable data rows")

    reader = csv.DictReader(data_lines)
    rows = [row for row in reader if any((value or "").strip() for value in row.values())]
    if not rows:
        raise ValueError(f"{path.name} is empty")

    headers = reader.fieldnames or list(rows[0].keys())

    def numeric(header: str) -> bool:
        values = [row.get(header, "") for row in rows]
        nums = [v for v in values if v not in ("", None)]
        if not nums:
            return False
        try:
            [float(v) for v in nums]
            return True
        except ValueError:
            return False

    numeric_headers = [h for h in headers if numeric(h)]

    def match(headers_list: list[str], patterns: tuple[re.Pattern[str], ...]) -> str | None:
        for pattern in patterns:
            for header in headers_list:
                if pattern.search(header.strip()):
                    return header
        return None

    time_header = match(headers, TIME_PATTERNS) or numeric_headers[0]
    force_header = (
        match(headers, FORCE_PATTERNS)
        or next((h for h in numeric_headers if h != time_header), None)
    )
    if not time_header or not force_header:
        raise ValueError(f"Could not detect columns in {path.name}")

    time = [float(row[time_header]) for row in rows]
    force = [float(row[force_header]) for row in rows]

    if re.search(r"ms", time_header, re.I) and not re.search(r"seconds?", time_header, re.I):
        time = [value / 1000 for value in time]

    start = time[0]
    time = [value - start for value in time]

    return Series(path.name, time, force, time_header, force_header)


def compute_metrics(series: Series) -> Metrics:
    peak_index = max(range(len(series.force)), key=lambda i: series.force[i])
    peak_force = series.force[peak_index]
    peak_time = series.time[peak_index]

    impulse = 0.0
    for i in range(1, len(series.time)):
        dt = series.time[i] - series.time[i - 1]
        impulse += ((series.force[i] + series.force[i - 1]) / 2) * dt

    threshold = max(peak_force * 0.1, 1e-6)
    duration = 0.0
    for i in range(1, len(series.time)):
        if series.force[i] >= threshold or series.force[i - 1] >= threshold:
            duration += series.time[i] - series.time[i - 1]

    rise_rate = 0.0
    if peak_index > 0:
        dt = max(series.time[peak_index] - series.time[0], 1e-6)
        rise_rate = peak_force / dt

    return Metrics(
        peak_force=peak_force,
        peak_time=peak_time,
        impulse=impulse,
        duration_above_threshold=duration,
        rise_rate=rise_rate,
        sample_count=len(series.time),
    )


RESEARCH_FINDINGS_PATTERN = re.compile(
    r"### Research findings\s*\n([\s\S]*?)(?=\n### |\n- \*\*[A-Z][^\n]*\*\*:|\s*$)",
    re.I,
)

ANALYSIS_SYSTEM_PROMPT = """You are a sports biomechanics analyst specializing in HEMA impact force curves, concussion research, head acceleration literature, and automotive crash-test biomechanics (HIC, NCAP, sled tests). Write concise markdown bullet observations.

On every analysis request, use Google Search to find current, authoritative data relevant to the user parameters, curve metrics, concussion thresholds, and automotive head-impact context. Cite sources in RESULTS and compress durable findings into MEMORY.

Always respond using EXACTLY this format:

<!-- RESULTS -->
(user-facing markdown bullets for the operator)
<!-- /RESULTS -->
<!-- MEMORY -->
(concise memory summary for future runs; lightweight, no fluff)
<!-- /MEMORY -->

MEMORY structure (keep terse; merge/update prior research lines; drop superseded items):
- **Last analyzed**: ISO timestamp
- **Summary**: 1-2 sentences
- **Metrics**: peak, impulse, key timing (only if notable)
### Research findings
(one line per source; max ~8 lines; format: `- source | metric/threshold | finding`)
- `Org/Author` url | metric | one-line takeaway
- **Observations**: optional brief notes

In ### Research findings, store sources and metrics efficiently so future runs can reuse them without re-searching."""


def extract_research_findings(content: str) -> str:
    match = RESEARCH_FINDINGS_PATTERN.search(content)
    return match.group(1).strip() if match else ""


def collect_research_findings(sections: dict[str, str]) -> str:
    blocks = []
    for filename in sorted(sections):
        findings = extract_research_findings(sections[filename])
        if findings:
            blocks.append(f"From {filename}:\n{findings}")
    return "\n\n".join(blocks) if blocks else "none"


def parse_analysis_response(raw: str) -> tuple[str, str]:
    results_match = re.search(
        r"<!--\s*RESULTS\s*-->([\s\S]*?)<!--\s*/RESULTS\s*-->", raw, re.I
    )
    memory_match = re.search(
        r"<!--\s*MEMORY\s*-->([\s\S]*?)<!--\s*/MEMORY\s*-->", raw, re.I
    )
    if results_match and memory_match:
        return results_match.group(1).strip(), memory_match.group(1).strip()
    return raw.strip(), raw.strip()


def call_llm(prompt: str) -> str:
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if gemini_key:
        model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
        payload = json.dumps(
            {
                "systemInstruction": {"parts": [{"text": ANALYSIS_SYSTEM_PROMPT}]},
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2},
                "tools": [{"google_search": {}}],
            }
        ).encode()
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={gemini_key}"
        )
        request = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode())
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        return "".join(part.get("text", "") for part in parts).strip()

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        payload = json.dumps(
            {
                "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                "messages": [
                    {
                        "role": "system",
                        "content": ANALYSIS_SYSTEM_PROMPT,
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.2,
            }
        ).encode()
        request = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=payload,
            headers={
                "Authorization": f"Bearer {openai_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode())
        return data["choices"][0]["message"]["content"].strip()

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        payload = json.dumps(
            {
                "model": os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest"),
                "max_tokens": 1200,
                "messages": [{"role": "user", "content": prompt}],
            }
        ).encode()
        request = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            headers={
                "x-api-key": anthropic_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode())
        parts = data.get("content", [])
        return "".join(part.get("text", "") for part in parts).strip()

    return (
        "- **Summary**: LLM API key not configured. Metrics were computed locally.\n"
        "- **Observations**: Configure GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY "
        "for narrative analysis."
    )


def parse_sections(markdown: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    parts = re.split(r"^## ", markdown, flags=re.M)
    for part in parts[1:]:
        newline = part.find("\n")
        if newline == -1:
            continue
        filename = part[:newline].strip()
        sections[filename] = part[newline + 1 :].strip()
    return sections


def render_memory(sections: dict[str, str]) -> str:
    header = (
        "# Whack-O-Meter Analysis Memory\n\n"
        "> Auto-updated by AI analysis pipeline. Do not edit structure headers.\n\n"
    )
    body = []
    for filename in sorted(sections.keys()):
        body.append(f"## {filename}\n{sections[filename].strip()}\n")
    return header + "\n".join(body)


def analyze_file(path: Path, sections: dict[str, str]) -> tuple[str, bool]:
    series = read_csv(path)
    metrics = compute_metrics(series)
    research_findings = collect_research_findings(sections)

    sample_points = [
        {"t": series.time[i], "f": series.force[i]}
        for i in range(0, len(series.time), max(1, len(series.time) // 8))
    ]

    prompt = f"""
Analyze this Whack-O-Meter HEMA force curve and integrate sports-science and automotive crash-test context (HIC, NCAP, sled testing) where relevant.

Use Google Search on this request to find current authoritative sources for concussion/head-impact thresholds and automotive HIC/NCAP comparisons relevant to this curve.

File: {series.filename}
Columns: time={series.time_label}, force={series.force_label}
Metrics:
- peak_force: {metrics.peak_force:.4f}
- peak_time_s: {metrics.peak_time:.6f}
- impulse: {metrics.impulse:.4f}
- duration_above_threshold_s: {metrics.duration_above_threshold:.6f}
- rise_rate: {metrics.rise_rate:.4f}
- sample_count: {metrics.sample_count}
Sample points: {json.dumps(sample_points[:10])}

Stored research findings from analysis/memory.md (reuse and extend; do not duplicate):
{research_findings}

Existing memory section for this file (may be empty):
{sections.get(series.filename, "")}

Return RESULTS markdown bullets covering:
- **Last analyzed**: ISO timestamp
- **Peak force**: value with units inferred from column label
- **Summary**: 2-3 sentences
- **Research findings**: cite web sources discovered this run with specific metrics/thresholds
- **Automotive comparison**: relate metrics to crash-test / HIC context when relevant
- **Research context**: integrate search results with curve interpretation
- **Observations**: concise biomechanics notes

In MEMORY, include a ### Research findings subsection with one line per source (`source | metric | finding`). Merge with stored research findings above.

If existing content is substantially the same, reply with EXACTLY: NO_SIGNIFICANT_CHANGE
"""

    llm_output = call_llm(prompt)
    if llm_output.strip() == "NO_SIGNIFICANT_CHANGE" and series.filename in sections:
        return sections[series.filename], False

    _, memory_output = parse_analysis_response(llm_output)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if "**Last analyzed**" not in memory_output:
        memory_output = f"- **Last analyzed**: {timestamp}\n{memory_output}"

    return memory_output.strip(), True


def main() -> int:
    target = os.getenv("CSV_FILENAME", "").strip()
    csv_files = sorted(RAW_DIR.glob("*.csv"))
    if target:
        csv_files = [p for p in csv_files if p.name == target]

    if not csv_files:
        print("No CSV files found to analyze.")
        return 0

    MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    markdown = MEMORY_PATH.read_text(encoding="utf-8") if MEMORY_PATH.exists() else ""
    sections = parse_sections(markdown)

    changed = False
    for path in csv_files:
        print(f"Analyzing {path.name}...")
        try:
            content, updated = analyze_file(path, sections)
            if updated or path.name not in sections:
                sections[path.name] = content
                changed = True
                print(f"Updated section for {path.name}")
            else:
                print(f"No significant change for {path.name}")
        except Exception as exc:  # noqa: BLE001
            print(f"Failed to analyze {path.name}: {exc}", file=sys.stderr)

    if changed:
        MEMORY_PATH.write_text(render_memory(sections), encoding="utf-8")
        print(f"Wrote {MEMORY_PATH}")
    else:
        print("Memory file unchanged.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
