#!/usr/bin/env python3
"""
Read-only discovery for before/after restoration pairs on Wikimedia
Commons.

Strategy:
  1. Search File: namespace for titles containing restoration markers
     (" - Restoration", "(restored)", "digital restoration", "restored
     version").
  2. For each candidate restored filename, derive a likely original
     filename by stripping the marker, and ask the API whether that
     file exists.
  3. Only print entries that form a verified (original, restored) pair.

No images are downloaded. Safe to run any number of times.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.parse
from pathlib import Path

USER_AGENT = "MemoryFixResearch/1.0 (https://artgen.site; support@artgen.site)"
API = "https://commons.wikimedia.org/w/api.php"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/examples/restoration-candidates.json"

SEARCHES = [
    'intitle:"- Restoration" portrait',
    'intitle:"- Restoration" family',
    'intitle:"- Restoration" child',
    'intitle:"- Restoration" wedding',
    'intitle:"(restored)" portrait',
    'intitle:"(restored)" family',
    'intitle:"digital restoration" portrait',
    'intitle:"restored version" portrait',
]

# Markers we try to strip from a restored filename to find the original.
STRIP_PATTERNS = [
    re.compile(r"\s*-\s*Restoration\d*(?=\.[^.]+$)"),
    re.compile(r"\s*\(restored\)(?=\.[^.]+$)", re.IGNORECASE),
    re.compile(r"\s*\(digital restoration\)(?=\.[^.]+$)", re.IGNORECASE),
    re.compile(r"\s*digital\s+restoration(?=\.[^.]+$)", re.IGNORECASE),
    re.compile(r"\s*restored\s+version(?=\.[^.]+$)", re.IGNORECASE),
    re.compile(r"\s*-\s*restored(?=\.[^.]+$)", re.IGNORECASE),
]


def http_json(params):
    qs = urllib.parse.urlencode(params)
    url = f"{API}?{qs}"
    last_err = None
    for attempt in range(3):
        try:
            result = subprocess.run(
                [
                    "curl",
                    "-sSL",
                    "--connect-timeout",
                    "15",
                    "--max-time",
                    "45",
                    "--retry",
                    "2",
                    "--retry-delay",
                    "1",
                    "-A",
                    USER_AGENT,
                    url,
                ],
                capture_output=True,
                check=True,
            )
            return json.loads(result.stdout)
        except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
            last_err = exc
            continue
    raise RuntimeError(f"api failed after retries: {last_err}")


def search(query):
    data = http_json(
        {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srnamespace": 6,
            "srlimit": 50,
            "srwhat": "text",
            "format": "json",
        }
    )
    return [h["title"] for h in data.get("query", {}).get("search", [])]


def file_info(title):
    data = http_json(
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|size|mime",
            "redirects": 1,
            "format": "json",
        }
    )
    pages = data.get("query", {}).get("pages", {})
    for _, page in pages.items():
        if "missing" in page:
            return None
        ii = page.get("imageinfo")
        if not ii:
            return None
        info = ii[0]
        return {
            "title": page["title"],
            "url": info.get("url"),
            "mime": info.get("mime"),
            "bytes": info.get("size", 0),
        }
    return None


def guess_original(restored_title):
    # restored_title looks like "File:Something - Restoration.jpg"
    if not restored_title.startswith("File:"):
        return None
    name = restored_title[len("File:") :]
    for pat in STRIP_PATTERNS:
        new, n = pat.subn("", name)
        if n and new != name:
            return f"File:{new}"
    return None


def main():
    candidates = []
    seen = set()
    for q in SEARCHES:
        try:
            hits = search(q)
        except subprocess.CalledProcessError as exc:
            print(f"search failed: {q}: {exc}", file=sys.stderr)
            continue
        for title in hits:
            if title in seen:
                continue
            seen.add(title)
            original_guess = guess_original(title)
            if not original_guess:
                continue
            try:
                after = file_info(title)
                before = file_info(original_guess) if after else None
            except Exception as exc:
                print(f"skip {title}: {exc}", file=sys.stderr)
                continue
            if not before or not after:
                continue
            if before["bytes"] < 30_000 or after["bytes"] < 30_000:
                continue
            candidates.append({"before": before, "after": after})
            print(f"  pair: {before['title']} + {after['title']}", file=sys.stderr)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nverified pairs: {len(candidates)}\n")
    for i, c in enumerate(candidates, 1):
        b = c["before"]["title"][len("File:") :]
        a = c["after"]["title"][len("File:") :]
        bkb = c["before"]["bytes"] // 1024
        akb = c["after"]["bytes"] // 1024
        print(f"{i:2d}. {b}")
        print(f"     -> {a}")
        print(f"     sizes: {bkb}KB / {akb}KB")


if __name__ == "__main__":
    main()
