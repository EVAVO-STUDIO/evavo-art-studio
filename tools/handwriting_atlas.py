from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import random
import re
from pathlib import Path, PurePosixPath

ATLAS_SCHEMA = "evavo.art-studio.handwriting-atlas.v1"
RENDER_SCHEMA = "evavo.art-studio.handwriting-render.v1"
MARK_SCHEMA = "evavo.art-studio.handwriting-whole-mark.v1"
_SHA_RE = re.compile(r"^[a-f0-9]{64}$")
_DRIVE_RE = re.compile(r"^[A-Za-z]:")


def _pil():
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required for handwriting atlas work") from exc
    return Image


def _sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _write_create_only(path: Path, value: dict) -> None:
    if path.exists():
        raise ValueError(f"create-only output already exists: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _safe_asset(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative or _DRIVE_RE.match(relative) or relative.startswith(("/", "\\")):
        raise ValueError("handwriting atlas assets must use confined relative paths beneath assetRoot")
    normalized = relative.replace("\\", "/")
    pure = PurePosixPath(normalized)
    if pure.is_absolute() or ".." in pure.parts:
        raise ValueError(f"handwriting asset escapes assetRoot: {relative}")
    root = root.resolve()
    path = (root / Path(*pure.parts)).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"handwriting asset escapes assetRoot: {relative}") from exc
    if not path.is_file():
        raise ValueError(f"handwriting asset is missing: {relative}")
    return path


def _alpha_metrics(path: Path) -> dict:
    Image = _pil()
    image = Image.open(path).convert("RGBA")
    bbox = image.getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"handwriting asset contains no visible ink: {path.name}")
    x0, y0, x1, y1 = bbox
    ink_w = max(1, x1 - x0)
    ink_h = max(1, y1 - y0)
    left = max(0, x0)
    right = max(0, image.width - x1)
    top = max(0, y0)
    bottom = max(0, image.height - y1)
    # Preserve some genuine breathing room but never let safety padding dominate.
    bearing_budget = min(left + right, max(2.0, ink_h * 0.28))
    natural_advance = ink_w + bearing_budget
    return {
        "pixelSize": [image.width, image.height],
        "inkBox": [x0, y0, x1, y1],
        "inkSize": [ink_w, ink_h],
        "sideBearingPx": {"left": left, "right": right, "top": top, "bottom": bottom},
        "naturalAdvancePx": round(float(natural_advance), 3),
    }


def build_atlas(catalog_path: Path, *, asset_root: Path, output: Path) -> dict:
    catalog = _load(catalog_path)
    glyphs = catalog.get("glyphs")
    whole_marks = catalog.get("wholeMarks", {})
    if not isinstance(glyphs, dict) or not glyphs:
        raise ValueError("catalog.glyphs must be a non-empty object")
    if whole_marks is not None and not isinstance(whole_marks, dict):
        raise ValueError("catalog.wholeMarks must be an object")
    root = asset_root.resolve()
    atlas_glyphs: dict[str, list[dict]] = {}
    coverage = {}
    for token, entries in glyphs.items():
        if not isinstance(token, str) or not token or len(token) > 32:
            raise ValueError("glyph token must contain 1..32 characters")
        if not isinstance(entries, list) or not entries:
            raise ValueError(f"glyph {token!r} must have at least one genuine variant")
        built = []
        seen_sha = set()
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict) or not isinstance(entry.get("file"), str):
                raise ValueError(f"glyph {token!r} variant {index} requires file")
            path = _safe_asset(root, entry["file"])
            sha = _sha_file(path)
            expected = entry.get("sha256")
            if expected and str(expected).casefold() != sha:
                raise ValueError(f"glyph {token!r} variant {index} sha256 mismatch")
            if sha in seen_sha:
                continue
            seen_sha.add(sha)
            metrics = _alpha_metrics(path)
            item = {
                "file": PurePosixPath(entry["file"].replace("\\", "/")).as_posix(),
                "sha256": sha,
                **metrics,
                "style": entry.get("style"),
                "label": entry.get("label"),
            }
            if entry.get("advancePx") is not None:
                item["naturalAdvancePx"] = max(1.0, float(entry["advancePx"]))
            built.append(item)
        if not built:
            raise ValueError(f"glyph {token!r} contains no unique genuine variants")
        atlas_glyphs[token] = built
        coverage[token] = len(built)

    marks_out: dict[str, list[dict]] = {}
    for kind, entries in (whole_marks or {}).items():
        if kind not in {"signature", "name"}:
            raise ValueError("wholeMarks supports only signature and name")
        if not isinstance(entries, list) or not entries:
            continue
        values = []
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict) or not isinstance(entry.get("file"), str):
                raise ValueError(f"whole mark {kind} variant {index} requires file")
            path = _safe_asset(root, entry["file"])
            sha = _sha_file(path)
            expected = entry.get("sha256")
            if expected and str(expected).casefold() != sha:
                raise ValueError(f"whole mark {kind} variant {index} sha256 mismatch")
            values.append({
                "file": PurePosixPath(entry["file"].replace("\\", "/")).as_posix(),
                "sha256": sha,
                "style": entry.get("style"),
                "label": entry.get("label"),
                **_alpha_metrics(path),
            })
        marks_out[kind] = values

    uppercase = all(coverage.get(letter, 0) > 0 for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    digits = all(coverage.get(str(number), 0) > 0 for number in range(10))
    atlas = {
        "schema": ATLAS_SCHEMA,
        "atlasId": str(catalog.get("atlasId") or "handwriting"),
        "assetRoot": str(root),
        "glyphs": atlas_glyphs,
        "wholeMarks": marks_out,
        "rendering": {
            "trackingPx": float(catalog.get("trackingPx", 1.5)),
            "spaceFactor": float(catalog.get("spaceFactor", 0.48)),
            "baselineJitterFraction": float(catalog.get("baselineJitterFraction", 0.016)),
            "scaleJitterFraction": float(catalog.get("scaleJitterFraction", 0.012)),
            "rotationDegrees": float(catalog.get("rotationDegrees", 0.45)),
            "preferLongestFragments": True,
            "avoidImmediateVariantRepeat": True,
        },
        "coverage": {
            "variantCounts": coverage,
            "completeUppercaseAlphabet": uppercase,
            "completeDigits": digits,
        },
        "truthBoundary": {
            "fontFallbackUsed": False,
            "syntheticHandwritingGenerated": False,
            "signatureSynthesizedFromGlyphs": False,
            "wholeSignatureVariantsOnly": True,
        },
    }
    _write_create_only(output, atlas)
    return {"ok": True, "atlasId": atlas["atlasId"], "atlasSha256": _sha_file(output), "coverage": atlas["coverage"], "privatePathsReturned": False}


def _rng(seed: str) -> random.Random:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def _tokenize(text: str, glyphs: dict[str, list[dict]]) -> list[str]:
    keys = sorted((key for key in glyphs if isinstance(key, str) and key), key=lambda key: (-len(key), key))
    result = []
    position = 0
    missing = []
    while position < len(text):
        if text[position].isspace():
            result.append(text[position])
            position += 1
            continue
        token = next((key for key in keys if text.startswith(key, position)), None)
        if token is None:
            missing.append(text[position])
            position += 1
            continue
        result.append(token)
        position += len(token)
    if missing:
        raise ValueError("genuine handwriting atlas is missing character(s): " + "".join(dict.fromkeys(missing)))
    return result


def _public(value):
    if isinstance(value, dict):
        return {key: _public(item) for key, item in value.items() if key not in {"assetPath", "assetRoot", "file"}}
    if isinstance(value, list):
        return [_public(item) for item in value]
    return value


def render_text(atlas_path: Path, text: str, output: Path, *, seed: str, style: str | None = None, proof: Path | None = None, receipt: Path | None = None) -> dict:
    Image = _pil()
    atlas = _load(atlas_path)
    if atlas.get("schema") != ATLAS_SCHEMA:
        raise ValueError("invalid handwriting atlas schema")
    if output.exists():
        raise ValueError(f"create-only output already exists: {output}")
    if proof is not None and proof.exists():
        raise ValueError(f"create-only proof already exists: {proof}")
    if receipt is not None and receipt.exists():
        raise ValueError(f"create-only receipt already exists: {receipt}")
    root = Path(str(atlas.get("assetRoot") or "")).resolve()
    glyphs = atlas.get("glyphs")
    if not isinstance(glyphs, dict) or not glyphs:
        raise ValueError("atlas has no glyphs")
    tokens = _tokenize(text, glyphs)
    cfg = atlas.get("rendering") if isinstance(atlas.get("rendering"), dict) else {}
    r = _rng(f"{atlas.get('atlasId')}|{text}|{style or 'default'}|{seed}")
    selected = []
    previous: dict[str, int] = {}
    ink_heights = []
    for token in tokens:
        if token.isspace():
            selected.append({"kind": "space", "text": token})
            continue
        entries = glyphs[token]
        candidates = [(index, item) for index, item in enumerate(entries) if not style or str(item.get("style") or "").casefold() == style.casefold()]
        if not candidates:
            raise ValueError(f"no genuine variant for {token!r} with requested style {style!r}")
        position = r.randrange(len(candidates))
        index, item = candidates[position]
        if len(candidates) > 1 and previous.get(token) == index:
            position = (position + 1 + r.randrange(len(candidates) - 1)) % len(candidates)
            index, item = candidates[position]
        previous[token] = index
        path = _safe_asset(root, item["file"])
        if item.get("sha256") and _sha_file(path) != item["sha256"]:
            raise ValueError(f"handwriting asset changed since atlas build for {token!r}")
        image = Image.open(path).convert("RGBA")
        ink_box = item.get("inkBox")
        if not isinstance(ink_box, list) or len(ink_box) != 4:
            raise ValueError(f"atlas glyph {token!r} lacks ink metrics")
        ink_h = max(1, int(ink_box[3]) - int(ink_box[1]))
        ink_heights.append(ink_h)
        selected.append({"kind": "glyph", "text": token, "variant": index, "item": item, "assetPath": path, "image": image})
    if not ink_heights:
        raise ValueError("handwritten text contains no ink")
    target_h = float(sorted(ink_heights)[len(ink_heights) // 2])
    baseline = target_h + 10.0
    tracking = float(cfg.get("trackingPx", 1.5))
    rotation_limit = max(0.0, min(2.0, float(cfg.get("rotationDegrees", 0.45))))
    scale_jitter = max(0.0, min(0.05, float(cfg.get("scaleJitterFraction", 0.012))))
    baseline_jitter = max(0.0, min(0.08, float(cfg.get("baselineJitterFraction", 0.016)))) * target_h
    all_advances = [float(item["naturalAdvancePx"]) for entries in glyphs.values() for item in entries if isinstance(item, dict) and isinstance(item.get("naturalAdvancePx"), (int, float)) and not isinstance(item.get("naturalAdvancePx"), bool) and float(item["naturalAdvancePx"]) > 0]
    if not all_advances:
        raise ValueError("atlas contains no valid natural advances")
    median_advance = sorted(all_advances)[len(all_advances) // 2]
    space_advance = max(target_h * 0.35, median_advance * float(cfg.get("spaceFactor", 0.48)))
    cursor = 0.0
    rendered = []
    evidence = []
    for token in selected:
        if token["kind"] == "space":
            cursor += space_advance
            continue
        item = token["item"]
        image = token["image"]
        ink_box = item["inkBox"]
        source_ink_h = max(1, ink_box[3] - ink_box[1])
        scale = (target_h / source_ink_h) * (1.0 + r.uniform(-scale_jitter, scale_jitter))
        image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
        angle = r.uniform(-rotation_limit, rotation_limit)
        if abs(angle) > 0.01:
            image = image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        bbox = image.getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()
        if bbox is None:
            raise ValueError("selected handwriting variant became empty")
        rx0, ry0, rx1, ry1 = bbox
        x_jitter = r.uniform(-0.55, 0.55)
        y_jitter = r.uniform(-baseline_jitter, baseline_jitter)
        x = cursor - rx0 + x_jitter
        y = baseline - ry1 + y_jitter
        rendered.append((image, x, y))
        normalized_advance = max(1.0, float(item.get("naturalAdvancePx", rx1 - rx0)) * scale)
        normalized_advance = max((rx1 - rx0) + 1.0, min(normalized_advance, (rx1 - rx0) + target_h * 0.30))
        cursor += normalized_advance + tracking
        evidence.append({
            "text": token["text"],
            "variant": token["variant"],
            "sourceAssetSha256": item["sha256"],
            "sourceNaturalAdvancePx": item["naturalAdvancePx"],
            "renderedNaturalAdvancePx": round(normalized_advance, 3),
            "scale": round(scale, 5),
            "rotationDegrees": round(angle, 4),
            "aspectRatioPreserved": True,
            "strokeDeformation": False,
        })
    min_x = min(x for image, x, y in rendered)
    min_y = min(y for image, x, y in rendered)
    max_x = max(x + image.width for image, x, y in rendered)
    max_y = max(y + image.height for image, x, y in rendered)
    pad = 8
    canvas = Image.new("RGBA", (max(1, math.ceil(max_x - min_x) + pad * 2), max(1, math.ceil(max_y - min_y) + pad * 2)), (0, 0, 0, 0))
    for image, x, y in rendered:
        canvas.alpha_composite(image, (round(x - min_x) + pad, round(y - min_y) + pad))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)

    proof_sha = None
    if proof is not None:
        margin = 14
        proof_image = Image.new("RGB", (canvas.width * 3 + margin * 4, canvas.height + margin * 2), (232, 232, 232))
        for index, colour in enumerate(((255, 255, 255), (18, 18, 18), (0, 175, 70))):
            panel = Image.new("RGBA", canvas.size, (*colour, 255))
            panel.alpha_composite(canvas)
            proof_image.paste(panel.convert("RGB"), (margin + index * (canvas.width + margin), margin))
        proof.parent.mkdir(parents=True, exist_ok=True)
        proof_image.save(proof, format="PNG", optimize=True)
        proof_sha = _sha_file(proof)

    result = {
        "schema": RENDER_SCHEMA,
        "atlasId": atlas.get("atlasId"),
        "text": text,
        "style": style,
        "outputSha256": _sha_file(output),
        "pixelSize": [canvas.width, canvas.height],
        "hostileBackgroundProofSha256": proof_sha,
        "targetInkHeightPx": round(target_h, 3),
        "tokens": evidence,
        "truthBoundary": {
            "fontFallbackUsed": False,
            "syntheticHandwritingGenerated": False,
            "glyphVariantsAreGenuineCaptures": True,
            "strokeDeformation": False,
        },
    }
    if receipt is not None:
        _write_create_only(receipt, result)
    return _public(result)


def select_whole_mark(atlas_path: Path, *, kind: str, seed: str, style: str | None = None, previous_sha256: str | None = None) -> dict:
    atlas = _load(atlas_path)
    if kind not in {"signature", "name"}:
        raise ValueError("whole mark kind must be signature or name")
    marks = atlas.get("wholeMarks")
    entries = marks.get(kind) if isinstance(marks, dict) else None
    if not isinstance(entries, list) or not entries:
        raise ValueError(f"atlas contains no whole {kind} variants")
    candidates = [item for item in entries if (not style or str(item.get("style") or "").casefold() == style.casefold()) and item.get("sha256") != previous_sha256]
    if not candidates:
        candidates = [item for item in entries if not style or str(item.get("style") or "").casefold() == style.casefold()]
    if not candidates:
        raise ValueError(f"atlas contains no whole {kind} variant with requested style")
    selected = candidates[_rng(f"{kind}|{style or 'default'}|{seed}").randrange(len(candidates))]
    return {
        "schema": MARK_SCHEMA,
        "kind": kind,
        "selectedSha256": selected["sha256"],
        "style": selected.get("style"),
        "variantCount": len(entries),
        "signatureSynthesizedFromGlyphs": False if kind == "signature" else None,
        "privatePathsReturned": False,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build and render genuine multi-variant handwriting atlases")
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("catalog")
    build.add_argument("asset_root")
    build.add_argument("output")
    render = sub.add_parser("render")
    render.add_argument("atlas")
    render.add_argument("text")
    render.add_argument("output")
    render.add_argument("--seed", required=True)
    render.add_argument("--style")
    render.add_argument("--proof")
    render.add_argument("--receipt")
    mark = sub.add_parser("select-mark")
    mark.add_argument("atlas")
    mark.add_argument("--kind", choices=["signature", "name"], required=True)
    mark.add_argument("--seed", required=True)
    mark.add_argument("--style")
    mark.add_argument("--previous-sha256")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "build":
            result = build_atlas(Path(args.catalog), asset_root=Path(args.asset_root), output=Path(args.output))
        elif args.command == "render":
            result = render_text(Path(args.atlas), args.text, Path(args.output), seed=args.seed, style=args.style, proof=Path(args.proof) if args.proof else None, receipt=Path(args.receipt) if args.receipt else None)
        else:
            result = select_whole_mark(Path(args.atlas), kind=args.kind, seed=args.seed, style=args.style, previous_sha256=args.previous_sha256)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
