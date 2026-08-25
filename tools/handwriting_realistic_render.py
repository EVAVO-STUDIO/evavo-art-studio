from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

try:
    from tools import handwriting_atlas as atlas_tool
except ModuleNotFoundError:  # direct `python tools/handwriting_realistic_render.py`
    import handwriting_atlas as atlas_tool  # type: ignore


def _candidate_bag(entries: list[dict], *, style: str | None, rng, previous: int | None) -> list[tuple[int, dict]]:
    candidates = [
        (index, item)
        for index, item in enumerate(entries)
        if isinstance(item, dict)
        and (not style or str(item.get("style") or "").casefold() == style.casefold())
    ]
    if not candidates:
        raise ValueError(f"no genuine handwriting variant is available for requested style {style!r}")
    rng.shuffle(candidates)
    if previous is not None and len(candidates) > 1 and candidates[0][0] == previous:
        swap_index = next((i for i, candidate in enumerate(candidates[1:], start=1) if candidate[0] != previous), None)
        if swap_index is not None:
            candidates[0], candidates[swap_index] = candidates[swap_index], candidates[0]
    return candidates


def render_text(
    atlas_path: Path,
    text: str,
    output: Path,
    *,
    seed: str,
    style: str | None = None,
    proof: Path | None = None,
    receipt: Path | None = None,
) -> dict:
    if not isinstance(text, str) or not text:
        raise ValueError("single-line handwriting text is empty")
    if "\n" in text or "\r" in text:
        raise ValueError("single-line handwriting cannot contain line breaks; use multiline or paragraph rendering")
    if any(character in text for character in ("\t", "\v", "\f")):
        raise ValueError("single-line handwriting cannot contain control whitespace; use ordinary spaces")

    Image = atlas_tool._pil()
    atlas = atlas_tool._load(atlas_path)
    if atlas.get("schema") != atlas_tool.ATLAS_SCHEMA:
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
    tokens = atlas_tool._tokenize(text, glyphs)
    cfg = atlas.get("rendering") if isinstance(atlas.get("rendering"), dict) else {}
    rng = atlas_tool._rng(f"{atlas.get('atlasId')}|{text}|{style or 'default'}|{seed}|balanced-bag-v1")

    selected: list[dict] = []
    bags: dict[str, list[tuple[int, dict]]] = {}
    previous: dict[str, int] = {}
    cycles: dict[str, int] = {}
    ink_heights: list[int] = []

    for token in tokens:
        if token.isspace():
            selected.append({"kind": "space", "text": token})
            continue
        entries = glyphs.get(token)
        if not isinstance(entries, list) or not entries:
            raise ValueError(f"genuine handwriting atlas is missing token {token!r}")
        bag = bags.get(token)
        if not bag:
            bag = _candidate_bag(entries, style=style, rng=rng, previous=previous.get(token))
            bags[token] = bag
            cycles[token] = cycles.get(token, 0) + 1
        index, item = bag.pop(0)
        previous[token] = index

        path = atlas_tool._safe_asset(root, item.get("file"))
        if item.get("sha256") and atlas_tool._sha_file(path) != item["sha256"]:
            raise ValueError(f"handwriting asset changed since atlas build for {token!r}")
        image = Image.open(path).convert("RGBA")
        ink_box = item.get("inkBox")
        if not isinstance(ink_box, list) or len(ink_box) != 4:
            raise ValueError(f"atlas glyph {token!r} lacks ink metrics")
        ink_h = max(1, int(ink_box[3]) - int(ink_box[1]))
        ink_heights.append(ink_h)
        selected.append({
            "kind": "glyph",
            "text": token,
            "variant": index,
            "variantCycle": cycles[token],
            "item": item,
            "assetPath": path,
            "image": image,
        })

    if not ink_heights:
        raise ValueError("handwritten text contains no ink")

    target_h = float(sorted(ink_heights)[len(ink_heights) // 2])
    baseline = target_h + 10.0
    tracking = float(cfg.get("trackingPx", 1.5))
    rotation_limit = max(0.0, min(2.0, float(cfg.get("rotationDegrees", 0.45))))
    scale_jitter = max(0.0, min(0.05, float(cfg.get("scaleJitterFraction", 0.012))))
    baseline_limit = max(0.0, min(0.08, float(cfg.get("baselineJitterFraction", 0.016)))) * target_h
    baseline_step = baseline_limit * 0.22
    local_baseline_limit = baseline_limit * 0.28
    all_advances = [
        float(item["naturalAdvancePx"])
        for entries in glyphs.values()
        if isinstance(entries, list)
        for item in entries
        if isinstance(item, dict)
        and isinstance(item.get("naturalAdvancePx"), (int, float))
        and not isinstance(item.get("naturalAdvancePx"), bool)
        and float(item["naturalAdvancePx"]) > 0
    ]
    if not all_advances:
        raise ValueError("atlas contains no valid natural advances")
    median_advance = sorted(all_advances)[len(all_advances) // 2]
    space_advance = max(target_h * 0.35, median_advance * float(cfg.get("spaceFactor", 0.48)))

    cursor = 0.0
    baseline_drift = 0.0
    rendered: list[tuple[object, float, float]] = []
    evidence: list[dict] = []
    for token in selected:
        if token["kind"] == "space":
            cursor += space_advance
            continue
        item = token["item"]
        image = token["image"]
        ink_box = item["inkBox"]
        source_ink_h = max(1, ink_box[3] - ink_box[1])
        scale = (target_h / source_ink_h) * (1.0 + rng.uniform(-scale_jitter, scale_jitter))
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
        angle = rng.uniform(-rotation_limit, rotation_limit)
        if abs(angle) > 0.01:
            image = image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        bbox = image.getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()
        if bbox is None:
            raise ValueError("selected handwriting variant became empty")
        rx0, ry0, rx1, ry1 = bbox
        x_jitter = rng.uniform(-0.55, 0.55)
        if baseline_limit > 0:
            baseline_drift = max(-baseline_limit, min(baseline_limit, baseline_drift + rng.uniform(-baseline_step, baseline_step)))
            local_baseline = rng.uniform(-local_baseline_limit, local_baseline_limit)
        else:
            baseline_drift = 0.0
            local_baseline = 0.0
        y_jitter = baseline_drift + local_baseline
        x = cursor - rx0 + x_jitter
        y = baseline - ry1 + y_jitter
        rendered.append((image, x, y))
        normalized_advance = max(1.0, float(item.get("naturalAdvancePx", rx1 - rx0)) * scale)
        normalized_advance = max((rx1 - rx0) + 1.0, min(normalized_advance, (rx1 - rx0) + target_h * 0.30))
        cursor += normalized_advance + tracking
        evidence.append({
            "text": token["text"],
            "variant": token["variant"],
            "variantCycle": token["variantCycle"],
            "sourceAssetSha256": item["sha256"],
            "sourceNaturalAdvancePx": item["naturalAdvancePx"],
            "renderedNaturalAdvancePx": round(normalized_advance, 3),
            "scale": round(scale, 5),
            "rotationDegrees": round(angle, 4),
            "baselineOffsetPx": round(y_jitter, 4),
            "baselineDriftPx": round(baseline_drift, 4),
            "localBaselineJitterPx": round(local_baseline, 4),
            "horizontalOffsetPx": round(x_jitter, 4),
            "aspectRatioPreserved": True,
            "strokeDeformation": False,
        })

    min_x = min(x for image, x, y in rendered)
    min_y = min(y for image, x, y in rendered)
    max_x = max(x + image.width for image, x, y in rendered)
    max_y = max(y + image.height for image, x, y in rendered)
    pad = 8
    canvas = Image.new(
        "RGBA",
        (max(1, math.ceil(max_x - min_x) + pad * 2), max(1, math.ceil(max_y - min_y) + pad * 2)),
        (0, 0, 0, 0),
    )
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
        proof_sha = atlas_tool._sha_file(proof)

    result = {
        "schema": atlas_tool.RENDER_SCHEMA,
        "atlasId": atlas.get("atlasId"),
        "text": text,
        "style": style,
        "outputSha256": atlas_tool._sha_file(output),
        "pixelSize": [canvas.width, canvas.height],
        "hostileBackgroundProofSha256": proof_sha,
        "targetInkHeightPx": round(target_h, 3),
        "variantSelection": {
            "mode": "deterministic-shuffled-genuine-variant-bag-v1",
            "usesEveryAvailableVariantBeforeRefill": True,
            "avoidsSameVariantAcrossBagBoundary": True,
        },
        "baselineModel": {
            "mode": "bounded-random-walk-v1",
            "maximumDriftFractionOfInkHeight": round(baseline_limit / target_h if target_h else 0.0, 5),
            "stepFractionOfMaximumDrift": 0.22,
            "localJitterFractionOfMaximumDrift": 0.28,
        },
        "tokens": evidence,
        "truthBoundary": {
            "fontFallbackUsed": False,
            "syntheticHandwritingGenerated": False,
            "glyphVariantsAreGenuineCaptures": True,
            "strokeDeformation": False,
        },
    }
    if receipt is not None:
        atlas_tool._write_create_only(receipt, result)
    return atlas_tool._public(result)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render genuine handwriting with balanced captured-variant usage and smooth baseline drift")
    parser.add_argument("atlas")
    parser.add_argument("text")
    parser.add_argument("output")
    parser.add_argument("--seed", required=True)
    parser.add_argument("--style")
    parser.add_argument("--proof")
    parser.add_argument("--receipt")
    args = parser.parse_args(argv)
    try:
        result = render_text(
            Path(args.atlas),
            args.text,
            Path(args.output),
            seed=args.seed,
            style=args.style or None,
            proof=Path(args.proof) if args.proof else None,
            receipt=Path(args.receipt) if args.receipt else None,
        )
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
