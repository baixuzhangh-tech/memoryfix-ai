#!/usr/bin/env python3
"""
Download the 7 homepage before/after restoration pairs chosen for the
MemoryFix landing page.

One-shot, idempotent. All 7 entries are hard-coded. For each pair we:
  1. Ask the MediaWiki API for canonical URL + size (batched, one call).
  2. Save `before` to public/examples/old-photos/pair-<id>-before.<ext>
     and `after` to public/examples/new-photos/pair-<id>-after.<ext>.
  3. Append an entry to restoration-pairs.manifest.json so landing.ts
     can be updated from a deterministic source.

Safe to re-run: will re-download over existing files.
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.parse
from pathlib import Path

USER_AGENT = "MemoryFixResearch/1.0 (https://artgen.site; support@artgen.site)"
API = "https://commons.wikimedia.org/w/api.php"
ROOT = Path(__file__).resolve().parent.parent
OLD_DIR = ROOT / "public/examples/old-photos"
NEW_DIR = ROOT / "public/examples/new-photos"
MANIFEST = ROOT / "public/examples/restoration-pairs.manifest.json"
LANDING_TS = ROOT / "src/config/landing.ts"
SOURCES_MD = ROOT / "public/examples/old-photos/SOURCES.md"

# id | caption (homepage) | license summary | original file | restored file
PAIRS = [
    (
        "carver-1910",
        "George Washington Carver, c. 1910",
        "Public domain (US Gov / pre-1928)",
        "File:George Washington Carver c1910.jpg",
        "File:George Washington Carver c1910 - Restoration.jpg",
    ),
    (
        "woolf-1902",
        "Virginia Woolf, photographed 1902",
        "Public domain (pre-1928)",
        "File:George Charles Beresford - Virginia Woolf in 1902.jpg",
        "File:George Charles Beresford - Virginia Woolf in 1902 - Restoration.jpg",
    ),
    (
        "cameron-met",
        "Portrait by Julia Margaret Cameron, 19th c.",
        "Public domain (MET Open Access)",
        "File:Julia Margaret Cameron MET DP114480.jpg",
        "File:Julia Margaret Cameron MET DP114480 - Restoration.jpg",
    ),
    (
        "nielsen-1908",
        "Composer Carl Nielsen, c. 1908",
        "Public domain (pre-1928)",
        "File:Carl Nielsen c. 1908.jpg",
        "File:Carl Nielsen c. 1908 - Restoration.jpg",
    ),
    (
        "fleetwood",
        "Sgt. Major Christian Fleetwood, Civil War",
        "Public domain (pre-1928)",
        "File:Sgt Major Christian Fleetwood - American Civil War Medal of Honor recipient.jpg",
        "File:Sgt Major Christian Fleetwood - American Civil War Medal of Honor recipient - Restoration.jpg",
    ),
    (
        "li-fu-lee",
        "Li Fu Lee at MIT radio lab, 1925",
        "Public domain (MIT Museum)",
        "File:Li Fu Lee at the Massachusetts Institute of Technology's radio experiment station, 1925 (MIT Museum).jpg",
        "File:Li Fu Lee at the Massachusetts Institute of Technology's radio experiment station, 1925 (MIT Museum) - Restoration.jpg",
    ),
    (
        "earle-coates",
        "Florence Earle Coates, platinum print",
        "Public domain (pre-1928)",
        "File:Florence Earle Coates Platinum Print 3.jpg",
        "File:Florence Earle Coates Platinum Print 3 - Restoration.jpg",
    ),
]


def curl_json(url: str) -> dict:
    out = subprocess.run(
        [
            "curl",
            "-sS",
            "--connect-timeout",
            "15",
            "--max-time",
            "60",
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
    return json.loads(out.stdout)


def curl_download(url: str, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    last = None
    for attempt in range(5):
        try:
            subprocess.run(
                [
                    "curl",
                    "-sSL",
                    "--fail",
                    "--connect-timeout",
                    "60",
                    "--max-time",
                    "300",
                    "--retry",
                    "3",
                    "--retry-delay",
                    "2",
                    "--retry-all-errors",
                    "-A",
                    USER_AGENT,
                    "-o",
                    str(dest),
                    url,
                ],
                check=True,
            )
            return dest.stat().st_size
        except subprocess.CalledProcessError as exc:
            last = exc
            print(
                f"   retry {attempt + 1}/5 ({url.rsplit('/', 1)[-1]}) -> exit {exc.returncode}",
                flush=True,
            )
    raise last  # type: ignore[misc]


def ext_from(url: str) -> str:
    path = urllib.parse.urlparse(url).path.lower()
    for e in (".jpg", ".jpeg", ".png", ".tif", ".tiff"):
        if path.endswith(e):
            return ".jpg" if e == ".jpeg" else e
    return ".jpg"


def update_landing_config(manifest: list[dict]) -> None:
    text = LANDING_TS.read_text(encoding="utf-8")

    hero = manifest[0]
    hero_before = hero["before"]["local_path"]
    hero_after = hero["after"]["local_path"]

    before_marker = "heroBeforeSrc: '"
    after_marker = "heroAfterSrc: '"
    before_start = text.index(before_marker) + len(before_marker)
    before_end = text.index("'", before_start)
    after_start = text.index(after_marker) + len(after_marker)
    after_end = text.index("'", after_start)
    text = text[:before_start] + hero_before + text[before_end:]
    text = text[:after_start] + hero_after + text[after_end:]

    gallery_start_marker = "export const landingGallery: GallerySample[] = ["
    gallery_end_marker = "]\n\nexport const landingPricing = {"
    gallery_start = text.index(gallery_start_marker) + len(gallery_start_marker)
    gallery_end = text.index(gallery_end_marker, gallery_start)

    gallery_items = []
    for pair in manifest[1:]:
        gallery_items.append(
            "\n  {\n"
            f"    id: '{pair['id']}',\n"
            f"    caption: '{pair['caption']}',\n"
            f"    beforeSrc: '{pair['before']['local_path']}',\n"
            f"    afterSrc: '{pair['after']['local_path']}',\n"
            "    hasRealPair: true,\n"
            "  },"
        )

    gallery_block = "".join(gallery_items) + "\n"
    text = text[:gallery_start] + gallery_block + text[gallery_end:]
    LANDING_TS.write_text(text, encoding="utf-8")


def update_sources_markdown(manifest: list[dict]) -> None:
    lines = [
        "# Old Photo Example Sources",
        "",
        "These images are used as public-domain or open-access before/after examples for the MemoryFix homepage showcase.",
        "",
        "## Homepage restoration set",
        "",
    ]

    for index, pair in enumerate(manifest, 1):
        before_name = pair["before"]["local_path"].split("/")[-1]
        after_name = pair["after"]["local_path"].split("/")[-1]
        lines.extend(
            [
                f"{index}. `{before_name}` → `{after_name}`",
                "",
                f"   - Caption: {pair['caption']}",
                f"   - Before source: {pair['before']['source_page']}",
                f"   - After source: {pair['after']['source_page']}",
                f"   - License: {pair['license']}",
                "   - Why useful: Strong before/after restoration contrast suitable for landing-page trust building.",
                "",
            ]
        )

    SOURCES_MD.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    titles: list[str] = []
    for _, _, _, before, after in PAIRS:
        titles.append(before)
        titles.append(after)

    print("Resolving Wikimedia file URLs...", flush=True)

    qs = urllib.parse.urlencode(
        {
            "action": "query",
            "titles": "|".join(titles),
            "prop": "imageinfo",
            "iiprop": "url|size|mime",
            "redirects": "1",
            "format": "json",
        }
    )
    data = curl_json(f"{API}?{qs}")

    pages = data.get("query", {}).get("pages", {})
    by_title: dict[str, dict] = {}
    for _, page in pages.items():
        t = page.get("title")
        if not t:
            continue
        if "missing" in page:
            by_title[t] = None
            continue
        ii = page.get("imageinfo") or []
        by_title[t] = ii[0] if ii else None

    norm = {n["from"]: n["to"] for n in data.get("query", {}).get("normalized", [])}
    redir = {r["from"]: r["to"] for r in data.get("query", {}).get("redirects", [])}

    def resolve(title: str):
        return by_title.get(redir.get(norm.get(title, title), norm.get(title, title)))

    OLD_DIR.mkdir(parents=True, exist_ok=True)
    NEW_DIR.mkdir(parents=True, exist_ok=True)

    manifest = []
    for pid, caption, lic, before_t, after_t in PAIRS:
        before = resolve(before_t)
        after = resolve(after_t)
        if not before or not after:
            print(
                f"!! {pid}: missing on Commons (before={bool(before)} after={bool(after)})",
                flush=True,
            )
            continue

        before_ext = ext_from(before["url"])
        after_ext = ext_from(after["url"])
        before_path = OLD_DIR / f"pair-{pid}-before{before_ext}"
        after_path = NEW_DIR / f"pair-{pid}-after{after_ext}"

        print(f"-- {pid}", flush=True)
        bs = curl_download(before["url"], before_path)
        as_ = curl_download(after["url"], after_path)
        print(f"   before {bs//1024}KB  after {as_//1024}KB", flush=True)

        manifest.append(
            {
                "id": pid,
                "caption": caption,
                "license": lic,
                "before": {
                    "commons_title": before_t,
                    "source_page": f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(before_t)}",
                    "local_path": f"/examples/old-photos/{before_path.name}",
                    "bytes": bs,
                },
                "after": {
                    "commons_title": after_t,
                    "source_page": f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(after_t)}",
                    "local_path": f"/examples/new-photos/{after_path.name}",
                    "bytes": as_,
                },
            }
        )

    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if len(manifest) == len(PAIRS):
        update_landing_config(manifest)
        update_sources_markdown(manifest)
    print(f"\nWrote manifest: {MANIFEST.relative_to(ROOT)} ({len(manifest)} pairs)", flush=True)
    return 0 if len(manifest) == len(PAIRS) else 2


if __name__ == "__main__":
    sys.exit(main())
