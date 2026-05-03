#!/usr/bin/env python3
"""Try to trick the deployed shahed detector with look-alikes."""
import io
import json
from pathlib import Path

import requests
from ddgs import DDGS
from PIL import Image

API = "https://shahed-detector.panda-anaconda.ts.net/api/backend/detect/image?conf=0.05"
OUT = Path("~/Downloads/redteam").expanduser()
OUT.mkdir(exist_ok=True)

QUERIES = {
    "delta_kite":       "delta wing kite flying sky",
    "stealth_b2":       "B-2 stealth bomber flight",
    "f117":             "F-117 stealth fighter sky",
    "concorde":         "concorde supersonic flying delta wing",
    "mavic_drone":      "DJI mavic drone flying",
    "fpv_drone":        "FPV racing drone in flight",
    "lancet_drone":     "lancet kamikaze drone",
    "missile_air":      "cruise missile in flight",
    "passenger_jet":    "passenger jet in sky",
    "bird_eagle":       "eagle flying silhouette sky",
    "bird_seagull":     "seagull silhouette sky",
    "balloon":          "weather balloon in sky",
    "paper_plane":      "paper airplane flying outdoor",
    "kite_diamond":     "diamond kite flying day",
    "moon":             "moon photograph",
    "cloud":            "wispy cloud blue sky",
}

def download_one(query: str, dest: Path) -> Path | None:
    try:
        with DDGS() as ddgs:
            results = list(ddgs.images(query=query, max_results=3, safesearch="off"))
    except Exception as e:
        print(f"  search failed: {e}")
        return None
    for r in results:
        url = r.get("image")
        if not url:
            continue
        try:
            resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code != 200 or not resp.headers.get("content-type", "").startswith("image/"):
                continue
            img = Image.open(io.BytesIO(resp.content)).convert("RGB")
            if img.width < 300 or img.height < 200:
                continue
            ext = "jpg"
            img.save(dest.with_suffix(f".{ext}"), "JPEG", quality=85)
            return dest.with_suffix(f".{ext}")
        except Exception:
            continue
    return None

def detect(img_path: Path) -> dict:
    with open(img_path, "rb") as f:
        r = requests.post(
            API,
            files={"file": (img_path.name, f, "image/jpeg")},
            timeout=30,
        )
    return r.json()

print(f"{'label':<18} {'image':<35} {'top_conf':<8} {'verdict'}")
print("-" * 80)
results = []
for label, q in QUERIES.items():
    img = download_one(q, OUT / label)
    if not img:
        print(f"{label:<18} (download failed)")
        continue
    try:
        det = detect(img)
        boxes = det.get("detections", [])
        top = max((b["conf"] for b in boxes), default=0.0)
        verdict = (
            "✗ MISSED (no detection)" if top == 0
            else f"✓ FIRED — {len(boxes)} bbox" if top > 0.5
            else f"~ weak ({top:.2f})"
        )
        print(f"{label:<18} {img.name:<35} {top:.3f}    {verdict}")
        results.append({"label": label, "image": img.name, "top_conf": top, "n_boxes": len(boxes)})
    except Exception as e:
        print(f"{label:<18} ERROR: {e}")

(OUT / "_results.json").write_text(json.dumps(results, indent=2))
print(f"\nimages saved: {OUT}")
