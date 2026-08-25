from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path


def _pil():
    try:
        from PIL import Image, ImageChops, ImageFilter
    except ImportError as exc:
        raise RuntimeError("Pillow is required for document ink finishing") from exc
    return Image, ImageChops, ImageFilter


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _file_sha(path: Path) -> str:
    return _sha256(path.read_bytes())


def _rng(seed: str) -> random.Random:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def _require_create_only(path: Path, label: str) -> None:
    if path.exists():
        raise ValueError(f"{label} already exists; document ink finishing is create-only: {path}")


def choose_genuine_variant(asset_paths: list[Path], *, seed: str, previous_sha256: str | None = None) -> dict:
    if not asset_paths:
        raise ValueError("at least one genuine personal-mark asset is required")
    variants = []
    for path in asset_paths:
        if not path.is_file():
            raise ValueError(f"personal-mark variant is missing: {path}")
        variants.append({"path": path, "sha256": _file_sha(path)})
    candidates = [item for item in variants if item["sha256"] != previous_sha256] or variants
    selected = candidates[_rng(seed).randrange(len(candidates))]
    return {"selectedSha256": selected["sha256"], "selectedPath": str(selected["path"]), "variantCount": len(variants)}


def natural_transform(*, seed: str, kind: str) -> dict:
    limits = {
        "signature": {"rotation": 0.8, "scale": 0.018, "x": 0.7, "y": 0.7},
        "name": {"rotation": 0.55, "scale": 0.015, "x": 0.55, "y": 0.55},
        "date": {"rotation": 0.7, "scale": 0.018, "x": 0.65, "y": 0.65},
    }
    if kind not in limits:
        raise ValueError("kind must be signature, name or date")
    r = _rng(f"{kind}|{seed}")
    lim = limits[kind]
    return {
        "rotationDegrees": round(r.uniform(-lim["rotation"], lim["rotation"]), 4),
        "scale": round(1.0 + r.uniform(-lim["scale"], lim["scale"]), 5),
        "xOffsetMm": round(r.uniform(-lim["x"], lim["x"]), 4),
        "yOffsetMm": round(r.uniform(-lim["y"], lim["y"]), 4),
        "preserveAspectRatio": True,
        "syntheticStrokeDeformation": False,
    }


def master_transparent_ink(source: Path, output: Path, *, trim_threshold: int = 8, padding: int = 8, feather: float = 0.25) -> dict:
    Image, _, ImageFilter = _pil()
    if not source.is_file():
        raise ValueError(f"personal mark source is missing: {source}")
    _require_create_only(output, "master output")
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > trim_threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("personal mark contains no visible alpha")
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - padding), max(0, y0 - padding)
    x1, y1 = min(image.width, x1 + padding), min(image.height, y1 + padding)
    image = image.crop((x0, y0, x1, y1))
    if feather > 0:
        image.putalpha(image.getchannel("A").filter(ImageFilter.GaussianBlur(feather)))
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                pixels[x, y] = (0, 0, 0, 0)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)
    return {
        "schema": "evavo.art-studio.document-ink-master.v1",
        "sourceSha256": _file_sha(source),
        "outputSha256": _file_sha(output),
        "pixelSize": [image.width, image.height],
        "trimBox": [x0, y0, x1, y1],
        "featherRadiusPx": feather,
        "visibleInkRgbPreserved": True,
        "syntheticHandwritingGenerated": False,
        "createOnly": True,
    }


def integrate_into_paper(mark_path: Path, background_path: Path, output: Path, *, seed: str, kind: str, opacity: float = 1.0, blur_radius: float = 0.22) -> dict:
    Image, ImageChops, ImageFilter = _pil()
    if not mark_path.is_file() or not background_path.is_file():
        raise ValueError("mark and background inputs must be existing files")
    _require_create_only(output, "integration output")
    if not 0.65 <= opacity <= 1.0:
        raise ValueError("opacity must be between 0.65 and 1.0")
    mark = Image.open(mark_path).convert("RGBA")
    background = Image.open(background_path).convert("RGB")
    transform = natural_transform(seed=seed, kind=kind)
    scale = transform["scale"]
    mark = mark.resize((max(1, round(mark.width * scale)), max(1, round(mark.height * scale))), Image.Resampling.LANCZOS)
    rotation = transform["rotationDegrees"]
    if abs(rotation) > 0.001:
        mark = mark.rotate(rotation, resample=Image.Resampling.BICUBIC, expand=True)
    ratio = min((background.width - 4) / max(mark.width, 1), (background.height - 4) / max(mark.height, 1), 1.0)
    if ratio < 1:
        mark = mark.resize((max(1, round(mark.width * ratio)), max(1, round(mark.height * ratio))), Image.Resampling.LANCZOS)
    if blur_radius > 0:
        mark = mark.filter(ImageFilter.GaussianBlur(blur_radius))
    alpha = mark.getchannel("A")
    if opacity < 1:
        alpha = alpha.point(lambda value: round(value * opacity))
        mark.putalpha(alpha)
    layer = Image.new("RGBA", background.size, (255, 255, 255, 0))
    px_per_mm = max(background.width, background.height) / 210.0
    dx = round(transform["xOffsetMm"] * px_per_mm)
    dy = round(transform["yOffsetMm"] * px_per_mm)
    offset = ((background.width - mark.width) // 2 + dx, (background.height - mark.height) // 2 + dy)
    layer.alpha_composite(mark, offset)
    multiplied = ImageChops.multiply(background, layer.convert("RGB"))
    integrated = Image.composite(multiplied, background, layer.getchannel("A"))
    output.parent.mkdir(parents=True, exist_ok=True)
    integrated.save(output, format="PNG", optimize=True)
    return {
        "schema": "evavo.art-studio.document-ink-integration.v1",
        "markSha256": _file_sha(mark_path),
        "backgroundSha256": _file_sha(background_path),
        "outputSha256": _file_sha(output),
        "kind": kind,
        "transform": transform,
        "opacity": opacity,
        "blurRadiusPx": blur_radius,
        "blendMode": "multiply-local-paper",
        "wholePageDegradationApplied": False,
        "syntheticHandwritingGenerated": False,
        "createOnly": True,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Deterministic finishing for genuine handwritten personal marks")
    sub = parser.add_subparsers(dest="command", required=True)
    master = sub.add_parser("master")
    master.add_argument("source")
    master.add_argument("output")
    master.add_argument("--evidence")
    integrate = sub.add_parser("integrate")
    integrate.add_argument("mark")
    integrate.add_argument("background")
    integrate.add_argument("output")
    integrate.add_argument("--kind", choices=["signature", "name", "date"], required=True)
    integrate.add_argument("--seed", required=True)
    integrate.add_argument("--opacity", type=float, default=1.0)
    integrate.add_argument("--evidence")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        evidence = Path(args.evidence) if args.evidence else None
        if evidence is not None:
            _require_create_only(evidence, "evidence output")
        if args.command == "master":
            result = master_transparent_ink(Path(args.source), Path(args.output))
        else:
            result = integrate_into_paper(Path(args.mark), Path(args.background), Path(args.output), seed=args.seed, kind=args.kind, opacity=args.opacity)
        if evidence is not None:
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
