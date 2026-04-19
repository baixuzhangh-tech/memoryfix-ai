#!/usr/bin/env python3
"""
One-shot helper to fetch before/after old-photo restoration pairs from
Wikimedia Commons for the MemoryFix homepage gallery.

For each candidate entry we:
  1. Ask the MediaWiki API to resolve the canonical file + download URL.
  2. Download the file to public/examples/old-photos or new-photos.
  3. Reject files that are implausibly small (usually means we got a
     404 page or a stub).
  4. Emit a manifest.json with the pairs that succeeded so the next
     step (editing landing.ts) can consume it deterministically.

Run: python3 scripts/fetch-restoration-pairs.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

USER_AGENT = "MemoryFixResearch/1.0 (https://artgen.site; support@artgen.site)"
API = "https://commons.wikimedia.org/w/api.php"
ROOT = Path(__file__).resolve().parent.parent
OLD_DIR = ROOT / "public/examples/old-photos"
NEW_DIR = ROOT / "public/examples/new-photos"
MANIFEST = ROOT / "public/examples/restoration-pairs.manifest.json"

# id | caption | license | original file on Commons | restored file on Commons
CANDIDATES = [
    (
        "curtis-inupiat",
        "Inupiat family, Noatak Alaska 1929 (Edward S. Curtis)",
        "Public domain",
        "Inupiat Family from Noatak, Alaska, 1929, Edward S. Curtis.jpg",
        "Inupiat Family from Noatak, Alaska, 1929, Edward S. Curtis (restored).jpg",
    ),
    (
        "carver-1910",
        "George Washington Carver, c. 1910",
        "Public domain",
        "George Washington Carver c1910.jpg",
        "George Washington Carver c1910 - Restoration.jpg",
    ),
    (
        "tubman-1895",
        "Harriet Tubman, c. 1895",
        "Public domain",
        "Harriet Tubman c1895.jpg",
        "Harriet Tubman c1895 - Restoration.jpg",
    ),
    (
        "douglass-1879",
        "Frederick Douglass, c. 1879",
        "Public domain",
        "Frederick Douglass (circa 1879).jpg",
        "Frederick Douglass (circa 1879) - Restoration.jpg",
    ),
    (
        "twain-bradley",
        "Mark Twain, portrait by A. F. Bradley",
        "Public domain",
        "Mark Twain by AF Bradley.jpg",
        "Mark Twain by AF Bradley - Restoration.jpg",
    ),
    (
        "lincoln-gardner",
        "Abraham Lincoln by Alexander Gardner, 1863",
        "Public domain",
        "Abraham Lincoln November 1863.jpg",
        "Abraham Lincoln November 1863 - Restoration.jpg",
    ),
    (
        "anthony-1891",
        "Susan B. Anthony, 1891",
        "Public domain",
        "Susan B Anthony c1891.jpg",
        "Susan B Anthony c1891 - Restoration.jpg",
    ),
    (
        "curie-1903",
        "Marie Curie, 1903 Nobel portrait",
        "Public domain",
        "Marie Curie c1903.jpg",
        "Marie Curie c1903 - Restoration.jpg",
    ),
    (
        "jordan",
        "Rep. Barbara Jordan",
        "Public domain (US Gov)",
        "Barbara Jordan.jpg",
        "Rep. Barbara Jordan - Restoration.jpg",
    ),
    (
        "roosevelt-family",
        "Theodore Roosevelt family, 1903",
        "Public domain",
        "Roosevelt family in 1903.jpg",
        "Roosevelt family in 1903 - Restoration.jpg",
    ),
    (
        "queen-victoria-family",
        "Queen Victoria and family, 1846",
        "Public domain",
        "The Royal Family in 1846 by Franz Xaver Winterhalter.jpg",
        "The Royal Family in 1846 by Franz Xaver Winterhalter - Restoration.jpg",
    ),
    (
        "einstein-1879",
        "Einstein portrait",
        "Public domain",
        "Albert Einstein 1879 1955.jpg",
        "Portrait of Albert Einstein and Others (1879-1955), Physicist - Restoration1.jpg",
    ),
    (
        "cajal-portrait",
        "Santiago Ramón y Cajal portrait",
        "Public domain",
        "Santiago Ramón y Cajal (1852-1934) portrait.jpg",
        "Santiago Ramón y Cajal (1852-1934) portrait (restored).jpg",
    ),
    (
        "nadar-self",
        "Nadar self-portrait",
        "Public domain",
        "Self-portrait of Nadar.jpg",
        "Self-portrait of Nadar - Restoration.jpg",
    ),
    (
        "washington-gilbert",
        "George Washington by Gilbert Stuart",
        "Public domain",
        "Gilbert Stuart Williamstown Portrait of George Washington.jpg",
        "Gilbert Stuart Williamstown Portrait of George Washington - Restoration.jpg",
    ),
]


def _curl_env():
    env = os.environ.copy()
    for key in (
        "http_proxy",
        "https_proxy",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "all_proxy",
    ):
        env.pop(key, None)
    return env


def http_json(params):
    qs = urllib.parse.urlencode(params)
    url = f"{API}?{qs}"
    result = subprocess.run(
        [
            "curl",
            "-sSL",
            "--noproxy",
            "*",
            "--max-time",
            "30",
            "-A",
            USER_AGENT,
            url,
        ],
        capture_output=True,
        check=True,
        env=_curl_env(),
    )
    return json.loads(result.stdout)


def resolve_file(title):
    """Return (canonical_title, download_url, mime, size) or None."""
    data = http_json(
        {
            "action": "query",
            "titles": f"File:{title}",
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
        return page["title"], info.get("url"), info.get("mime"), info.get("size", 0)
    return None


def download(url, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "curl",
            "-sSL",
            "--noproxy",
            "*",
            "--fail",
            "--max-time",
            "120",
            "-A",
            USER_AGENT,
            "-o",
            str(dest),
            url,
        ],
        check=True,
        env=_curl_env(),
    )
    return dest.stat().st_size


def pick_ext(url: str, mime: str) -> str:
    path = urllib.parse.urlparse(url).path.lower()
    for ext in (".jpg", ".jpeg", ".png", ".tif", ".tiff"):
        if path.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext
    if mime == "image/png":
        return ".png"
    if mime in ("image/tiff",):
        return ".tif"
    return ".jpg"


def main() -> int:
    OLD_DIR.mkdir(parents=True, exist_ok=True)
    NEW_DIR.mkdir(parents=True, exist_ok=True)

    pairs = []
    for cid, caption, lic, original_name, restored_name in CANDIDATES:
        if len(pairs) >= 7:
            break
        print(f"-- {cid}", flush=True)
        try:
            before = resolve_file(original_name)
            time.sleep(0.3)
            after = resolve_file(restored_name)
            time.sleep(0.3)
        except Exception as exc:
            print(f"   api error: {exc}")
            continue
        if not before:
            print(f"   miss original: {original_name}")
            continue
        if not after:
            print(f"   miss restored: {restored_name}")
            continue

        before_title, before_url, before_mime, before_size = before
        after_title, after_url, after_mime, after_size = after
        if before_size < 30_000 or after_size < 30_000:
            print("   too small, skipping")
            continue

        before_ext = pick_ext(before_url, before_mime)
        after_ext = pick_ext(after_url, after_mime)
        before_local = OLD_DIR / f"pair-{cid}-before{before_ext}"
        after_local = NEW_DIR / f"pair-{cid}-after{after_ext}"
        try:
            bsize = download(before_url, before_local)
            asize = download(after_url, after_local)
        except Exception as exc:
            print(f"   download error: {exc}")
            continue

        if bsize < 30_000 or asize < 30_000:
            print("   download too small")
            try:
                before_local.unlink(missing_ok=True)
                after_local.unlink(missing_ok=True)
            except Exception:
                pass
            continue

        pairs.append(
            {
                "id": cid,
                "caption": caption,
                "license": lic,
                "before": {
                    "commons_title": before_title,
                    "local_path": f"/examples/old-photos/{before_local.name}",
                    "source": f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(before_title)}",
                    "bytes": bsize,
                },
                "after": {
                    "commons_title": after_title,
                    "local_path": f"/examples/new-photos/{after_local.name}",
                    "source": f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(after_title)}",
                    "bytes": asize,
                },
            }
        )
        print(f"   ok ({bsize//1024}KB / {asize//1024}KB)")

    MANIFEST.write_text(json.dumps(pairs, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved {len(pairs)} pairs -> {MANIFEST.relative_to(ROOT)}")
    return 0 if len(pairs) >= 7 else 2


if __name__ == "__main__":
    sys.exit(main())
