from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def edge_alpha_stats(img: Image.Image) -> dict:
    if "A" not in img.getbands():
        return {"has_alpha": False, "transparent_edge_fraction": 0.0, "edge_alpha_min": 255, "edge_alpha_max": 255}
    alpha = img.getchannel("A")
    w, h = img.size
    samples = []
    for x in range(w):
        samples.append(alpha.getpixel((x, 0)))
        samples.append(alpha.getpixel((x, h - 1)))
    for y in range(h):
        samples.append(alpha.getpixel((0, y)))
        samples.append(alpha.getpixel((w - 1, y)))
    transparent = sum(1 for v in samples if v < 8)
    return {
        "has_alpha": True,
        "transparent_edge_fraction": round(transparent / max(1, len(samples)), 6),
        "edge_alpha_min": min(samples) if samples else 255,
        "edge_alpha_max": max(samples) if samples else 255,
    }


def border_difference_score(img: Image.Image) -> float:
    rgb = img.convert("RGB")
    w, h = rgb.size
    if w < 2 or h < 2:
        return 0.0
    left = rgb.crop((0, 0, 1, h)).resize((1, h))
    right = rgb.crop((w - 1, 0, w, h)).resize((1, h))
    top = rgb.crop((0, 0, w, 1)).resize((w, 1))
    bottom = rgb.crop((0, h - 1, w, h)).resize((w, 1))
    lr = ImageStat.Stat(ImageChops.difference(left, right)).mean
    tb = ImageStat.Stat(ImageChops.difference(top, bottom)).mean
    mean = (sum(lr) + sum(tb)) / 6.0
    return round(mean / 255.0, 6)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run technical review checks on a MÔN art candidate")
    parser.add_argument("image", type=Path)
    parser.add_argument("--role", required=True)
    parser.add_argument("--expected-width", type=int)
    parser.add_argument("--expected-height", type=int)
    parser.add_argument("--require-alpha", action="store_true")
    parser.add_argument("--seam-candidate", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    path = args.image.resolve()
    if not path.is_file():
        raise SystemExit(f"image not found: {path}")

    with Image.open(path) as img:
        img.load()
        alpha = edge_alpha_stats(img)
        bbox = img.getchannel("A").getbbox() if "A" in img.getbands() else (0, 0, img.width, img.height)
        issues = []
        if args.expected_width and img.width != args.expected_width:
            issues.append(f"width mismatch: {img.width} != {args.expected_width}")
        if args.expected_height and img.height != args.expected_height:
            issues.append(f"height mismatch: {img.height} != {args.expected_height}")
        if args.require_alpha and not alpha["has_alpha"]:
            issues.append("true alpha required but image has no alpha channel")
        if args.require_alpha and bbox and (bbox[0] == 0 or bbox[1] == 0 or bbox[2] == img.width or bbox[3] == img.height):
            issues.append("opaque content touches canvas edge; check accidental crop/halo risk")
        seam_score = border_difference_score(img) if args.seam_candidate else None
        if args.seam_candidate and seam_score is not None and seam_score > 0.12:
            issues.append(f"seam candidate opposite-edge difference is high: {seam_score}")
        report = {
            "schema_version": 1,
            "image": str(path),
            "sha256": sha256_file(path),
            "role": args.role,
            "width": img.width,
            "height": img.height,
            "mode": img.mode,
            "format": img.format,
            "opaque_bounds": list(bbox) if bbox else None,
            "alpha": alpha,
            "seam_edge_difference_score": seam_score,
            "issues": issues,
            "technical_pass": not issues,
            "creative_review_required": True,
            "runtime_authority": False,
        }
    out = args.output.resolve() if args.output else path.with_suffix(path.suffix + ".review.json")
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": report["technical_pass"], "report": str(out), "issues": report["issues"]}, indent=2))
    return 0 if report["technical_pass"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
