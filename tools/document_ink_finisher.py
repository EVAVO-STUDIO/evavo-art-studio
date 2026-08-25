from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from pathlib import Path


def _pil():
    try:
        from PIL import Image, ImageChops, ImageDraw, ImageFilter
    except ImportError as exc:
        raise RuntimeError("Pillow is required for document ink finishing") from exc
    return Image, ImageChops, ImageDraw, ImageFilter


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


def _parse_rect(value: str | None, *, label: str) -> tuple[int, int, int, int] | None:
    if not value:
        return None
    parts = value.split(",")
    if len(parts) != 4:
        raise ValueError(f"{label} must be x0,y0,x1,y1")
    rect = tuple(int(round(float(item.strip()))) for item in parts)
    x0, y0, x1, y1 = rect
    if x1 <= x0 or y1 <= y0:
        raise ValueError(f"{label} must have positive area")
    return rect


def _luma(rgb) -> float:
    return 0.2126 * float(rgb[0]) + 0.7152 * float(rgb[1]) + 0.0722 * float(rgb[2])


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
        "text": {"rotation": 0.55, "scale": 0.014, "x": 0.45, "y": 0.45},
    }
    if kind not in limits:
        raise ValueError("kind must be signature, name, date or text")
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


def _component_cleanup(image, *, alpha_threshold: int, minimum_pixels: int) -> tuple[object, int]:
    if minimum_pixels <= 0:
        return image, 0
    alpha = image.getchannel("A")
    width, height = alpha.size
    px = alpha.load()
    seen = bytearray(width * height)
    small: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if seen[offset] or px[x, y] <= alpha_threshold:
                continue
            seen[offset] = 1
            stack = [(x, y)]
            component = []
            while stack:
                cx, cy = stack.pop()
                component.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        index = ny * width + nx
                        if not seen[index] and px[nx, ny] > alpha_threshold:
                            seen[index] = 1
                            stack.append((nx, ny))
            if len(component) < minimum_pixels:
                small.append(component)
    if not small:
        return image, 0
    cleaned = image.copy()
    cleaned_alpha = cleaned.getchannel("A")
    out = cleaned_alpha.load()
    for component in small:
        for x, y in component:
            out[x, y] = 0
    cleaned.putalpha(cleaned_alpha)
    return cleaned, len(small)


def _prune_low_alpha(image, *, cutoff: int) -> int:
    alpha = image.getchannel("A")
    px = alpha.load()
    removed = 0
    for y in range(alpha.height):
        for x in range(alpha.width):
            value = px[x, y]
            if 0 < value < cutoff:
                px[x, y] = 0
                removed += 1
    image.putalpha(alpha)
    return removed


def _edge_contact(image, *, threshold: int = 16, guard: int = 3) -> list[str]:
    alpha = image.getchannel("A")
    width, height = alpha.size
    px = alpha.load()
    guard = max(1, min(guard, max(1, width // 2), max(1, height // 2)))
    sides = []
    if any(px[x, y] > threshold for x in range(guard) for y in range(height)):
        sides.append("left")
    if any(px[x, y] > threshold for x in range(width - guard, width) for y in range(height)):
        sides.append("right")
    if any(px[x, y] > threshold for y in range(guard) for x in range(width)):
        sides.append("top")
    if any(px[x, y] > threshold for y in range(height - guard, height) for x in range(width)):
        sides.append("bottom")
    return sides


def _neutralise_transparent_rgb(image) -> None:
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            if a == 0:
                px[x, y] = (0, 0, 0, 0)
            elif a < 224:
                maximum = max(r, g, b, 1)
                scale = min(1.0, 96.0 / maximum)
                px[x, y] = (round(r * scale), round(g * scale), round(b * scale), a)


def extract_photo_handwriting(
    source: Path,
    output: Path,
    *,
    crop_rect: tuple[int, int, int, int] | None = None,
    keep_rect: tuple[int, int, int, int] | None = None,
    kind: str = "text",
    darkness_floor: float = 13.0,
    darkness_full: float = 58.0,
    weak_alpha_cutoff: int = 16,
    trim_threshold: int = 12,
    padding: int = 10,
    require_clear_edges: bool = True,
    proof: Path | None = None,
) -> dict:
    Image, ImageChops, ImageDraw, ImageFilter = _pil()
    if kind not in {"signature", "name", "date", "text", "glyph", "symbol"}:
        raise ValueError("unsupported photographed handwriting kind")
    if not source.is_file():
        raise ValueError(f"photographed handwriting source is missing: {source}")
    _require_create_only(output, "extracted handwriting output")
    if proof is not None:
        _require_create_only(proof, "proof output")
    full = Image.open(source).convert("RGB")
    full_size = [full.width, full.height]
    if crop_rect is None:
        crop_rect = (0, 0, full.width, full.height)
    x0, y0, x1, y1 = crop_rect
    if not (0 <= x0 < x1 <= full.width and 0 <= y0 < y1 <= full.height):
        raise ValueError("crop rectangle is outside source image")
    crop = full.crop(crop_rect)
    radius = max(24.0, min(crop.width, crop.height) / 4.0)
    local_paper = crop.filter(ImageFilter.GaussianBlur(radius=radius))
    source_px = crop.load()
    paper_px = local_paper.load()
    rgba = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    out_px = rgba.load()
    span = max(darkness_full - darkness_floor, 1e-6)
    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b = source_px[x, y]
            paper = paper_px[x, y]
            darkness = _luma(paper) - _luma((r, g, b))
            alpha = round(min(1.0, max(0.0, (darkness - darkness_floor) / span)) * 255)
            if alpha < weak_alpha_cutoff:
                alpha = 0
            maximum = max(r, g, b, 1)
            colour_scale = min(1.0, 100.0 / maximum)
            out_px[x, y] = (round(r * colour_scale), round(g * colour_scale), round(b * colour_scale), alpha)
    softened = rgba.getchannel("A").filter(ImageFilter.GaussianBlur(radius=0.28))
    softened = softened.point(lambda value: 0 if value < weak_alpha_cutoff else value)
    rgba.putalpha(softened)

    applied_keep = None
    if keep_rect is not None:
        kx0, ky0, kx1, ky1 = keep_rect
        if not (0 <= kx0 < kx1 <= crop.width and 0 <= ky0 < ky1 <= crop.height):
            raise ValueError("keep rectangle must be inside the reviewed crop")
        alpha = rgba.getchannel("A")
        mask = Image.new("L", rgba.size, 0)
        ImageDraw.Draw(mask).rectangle((kx0, ky0, kx1 - 1, ky1 - 1), fill=255)
        rgba.putalpha(ImageChops.multiply(alpha, mask))
        applied_keep = [kx0, ky0, kx1, ky1]

    minimum_pixels = 10 if kind in {"glyph", "symbol", "text", "date"} else 3
    rgba, removed_components = _component_cleanup(rgba, alpha_threshold=24, minimum_pixels=minimum_pixels)
    pruned_low_alpha = _prune_low_alpha(rgba, cutoff=max(weak_alpha_cutoff, trim_threshold))
    _neutralise_transparent_rgb(rgba)

    edge_probe = rgba.crop(tuple(applied_keep)) if applied_keep is not None else rgba
    edge_contact = _edge_contact(edge_probe, threshold=max(trim_threshold, 16), guard=3)
    if require_clear_edges and edge_contact:
        boundary = "keep rectangle" if applied_keep is not None else "crop"
        raise ValueError("trusted photographed handwriting touches " + boundary + " edge(s): " + ", ".join(edge_contact))

    alpha = rgba.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > trim_threshold else 0).getbbox()
    if bbox is None:
        raise ValueError("photographed crop contains no admitted handwriting ink")
    bx0, by0, bx1, by1 = bbox
    trim_box = [max(0, bx0 - padding), max(0, by0 - padding), min(rgba.width, bx1 + padding), min(rgba.height, by1 + padding)]
    mastered = rgba.crop(tuple(trim_box))
    pruned_low_alpha += _prune_low_alpha(mastered, cutoff=max(weak_alpha_cutoff, trim_threshold))
    _neutralise_transparent_rgb(mastered)
    output.parent.mkdir(parents=True, exist_ok=True)
    mastered.save(output, format="PNG", optimize=True)

    proof_sha = None
    if proof is not None:
        margin = 16
        w, h = mastered.size
        proof_image = Image.new("RGB", (w * 3 + margin * 4, h + margin * 2), (238, 238, 238))
        backgrounds = ((255, 255, 255), (18, 18, 18), (0, 175, 70))
        for index, colour in enumerate(backgrounds):
            panel = Image.new("RGBA", (w, h), (*colour, 255))
            panel.alpha_composite(mastered)
            proof_image.paste(panel.convert("RGB"), (margin + index * (w + margin), margin))
        proof.parent.mkdir(parents=True, exist_ok=True)
        proof_image.save(proof, format="PNG", optimize=True)
        proof_sha = _file_sha(proof)

    return {
        "schema": "evavo.art-studio.document-ink-photo-extraction.v1",
        "sourceSha256": _file_sha(source),
        "sourcePixelSize": full_size,
        "sourceCropRect": list(crop_rect),
        "inkKeepRect": applied_keep,
        "outputSha256": _file_sha(output),
        "outputPixelSize": [mastered.width, mastered.height],
        "trimBoxWithinCrop": trim_box,
        "kind": kind,
        "paperModel": "local-low-frequency-illumination",
        "paperCastRemoved": True,
        "shadowGradientRemoved": True,
        "weakPhotographicNoiseSuppressed": True,
        "postSoftenAlphaPruneApplied": True,
        "prunedLowAlphaPixelCount": pruned_low_alpha,
        "removedTinyComponents": removed_components,
        "edgeContactSides": edge_contact,
        "cropEdgeClear": not edge_contact,
        "hiddenPaperRgbNeutralised": True,
        "hostileBackgroundProofSha256": proof_sha,
        "syntheticHandwritingGenerated": False,
        "strokeGeometryChanged": False,
        "createOnly": True,
    }


def master_transparent_ink(source: Path, output: Path, *, trim_threshold: int = 8, padding: int = 8, feather: float = 0.25) -> dict:
    Image, _, _, ImageFilter = _pil()
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
    _prune_low_alpha(image, cutoff=max(trim_threshold, 8))
    _neutralise_transparent_rgb(image)
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
        "hiddenPaperRgbNeutralised": True,
        "syntheticHandwritingGenerated": False,
        "createOnly": True,
    }


def integrate_into_paper(mark_path: Path, background_path: Path, output: Path, *, seed: str, kind: str, opacity: float = 1.0, blur_radius: float = 0.22) -> dict:
    Image, ImageChops, _, ImageFilter = _pil()
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
    parser = argparse.ArgumentParser(description="Deterministic Photoshop-class finishing for genuine handwritten personal marks")
    sub = parser.add_subparsers(dest="command", required=True)
    extract = sub.add_parser("extract-photo")
    extract.add_argument("source")
    extract.add_argument("output")
    extract.add_argument("--kind", choices=["signature", "name", "date", "text", "glyph", "symbol"], default="text")
    extract.add_argument("--crop")
    extract.add_argument("--keep")
    extract.add_argument("--proof")
    extract.add_argument("--allow-edge-contact", action="store_true")
    extract.add_argument("--evidence")
    master = sub.add_parser("master")
    master.add_argument("source")
    master.add_argument("output")
    master.add_argument("--evidence")
    integrate = sub.add_parser("integrate")
    integrate.add_argument("mark")
    integrate.add_argument("background")
    integrate.add_argument("output")
    integrate.add_argument("--kind", choices=["signature", "name", "date", "text"], required=True)
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
        if args.command == "extract-photo":
            result = extract_photo_handwriting(
                Path(args.source),
                Path(args.output),
                crop_rect=_parse_rect(args.crop, label="crop"),
                keep_rect=_parse_rect(args.keep, label="keep"),
                kind=args.kind,
                require_clear_edges=not args.allow_edge_contact,
                proof=Path(args.proof) if args.proof else None,
            )
        elif args.command == "master":
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
