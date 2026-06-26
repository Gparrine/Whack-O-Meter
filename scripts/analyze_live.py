#!/usr/bin/env python3
"""Run a live UI analysis request and write results + memory."""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from analyze_csv import (  # noqa: E402
    call_llm,
    parse_analysis_response,
    parse_sections,
    render_memory,
)

MEMORY_PATH = ROOT / "analysis" / "memory.md"
LIVE_RESULT_PATH = ROOT / "public" / "analysis" / "live-result.json"


def main() -> int:
    payload_b64 = os.getenv("PAYLOAD_B64", "").strip()
    if not payload_b64:
        print("Missing PAYLOAD_B64", file=sys.stderr)
        return 1

    try:
        payload = json.loads(base64.b64decode(payload_b64).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"Invalid payload: {exc}", file=sys.stderr)
        return 1

    prompt = payload.get("prompt", "").strip()
    section_key = payload.get("sectionKey", "").strip()
    if not prompt or not section_key:
        print("Payload must include prompt and sectionKey", file=sys.stderr)
        return 1

    raw = call_llm(prompt)
    results, memory = parse_analysis_response(raw)

    markdown = MEMORY_PATH.read_text(encoding="utf-8") if MEMORY_PATH.exists() else ""
    sections = parse_sections(markdown)
    sections[section_key] = memory.strip()
    MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    MEMORY_PATH.write_text(render_memory(sections), encoding="utf-8")

    LIVE_RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    LIVE_RESULT_PATH.write_text(
        json.dumps(
            {
                "sectionKey": section_key,
                "results": results,
                "memory": memory,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    public_memory = ROOT / "public" / "analysis" / "memory.md"
    public_memory.parent.mkdir(parents=True, exist_ok=True)
    public_memory.write_text(MEMORY_PATH.read_text(encoding="utf-8"), encoding="utf-8")

    print(f"Wrote live result for {section_key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
