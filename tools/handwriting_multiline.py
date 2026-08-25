from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from pathlib import Path

try:
    from tools.handwriting_atlas import render_text
except ModuleNotFoundError:  # direct `python tools/handwriting_multiline.py`
    from handwriting_atlas import render_text

SCHEMA = "evavo.art-studio.handwriting-multiline-render.v1"
LINE_START_JITTER_FRACTION = 0.04


def _pil():
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required for multiline handwriting rendering") from exc
    return Image


def _sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def _signed_unit(seed: str) -> float:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    integer = int.from_bytes(digest[:8], "big")
    unit = integer / float((1 << 64) - 1)
    return unit * 2.0 - 1.0


def render_multiline(
    atlas: Path,
    text: str,
    output: Path,
    *,
    seed: str,
    style: str | None = None,
    line_spacing_factor: float = 0.55,
    proof: Path | None = None,
    receipt: Path | None = None,
) -> dict:
    if output.exists():
        raise ValueError(f"create-only output already exists: {output}")
    if proof is not None and proof.exists():
        raise ValueError(f"create-only proof already exists: {proof}")
    if receipt is not None and receipt.exists():
        raise ValueError(f"create-only receipt already exists: {receipt}")
    if not 0.20 <= float(line_spacing_factor) <= 2.0:
        raise ValueError("line_spacing_factor must be between 0.20 and 2.0")
    lines = text.splitlines()
    if not lines:
        raise ValueError("multiline handwriting text is empty")
    if len(lines) > 32:
        raise ValueError("multiline handwriting supports at most 32 lines")
    if any(len(line) > 512 for line in lines):
        raise ValueError("each handwriting line supports at most 512 characters")
    if not any(line.strip() for line in lines):
        raise ValueError("multiline handwriting contains no ink")

    Image = _pil()
    rendered_lines: list[dict] = []
    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        for index, line in enumerate(lines):
            if not line.strip():
                rendered_lines.append({"kind": "blank", "line": index + 1})
                continue
            path = temp / f"line-{index + 1:02d}.png"
            result = render_text(
                atlas,
                line,
                path,
                seed=f"{seed}|line:{index + 1}",
                style=style,
            )
            target_ink = result.get("targetInkHeightPx")
            if not isinstance(target_ink, (int, float)) or isinstance(target_ink, bool) or float(target_ink) <= 0:
                raise ValueError("single-line handwriting receipt lacks targetInkHeightPx")
            rendered_lines.append({
                "kind": "ink",
                "line": index + 1,
                "result": result,
                "image": Image.open(path).convert("RGBA"),
                "sourceTargetInkHeightPx": float(target_ink),
            })

        ink_items = [item for item in rendered_lines if item["kind"] == "ink"]
        if not ink_items:
            raise ValueError("multiline handwriting contains no ink")
        shared_target_ink = _median([item["sourceTargetInkHeightPx"] for item in ink_items])

        # Preserve one coherent writing-session scale across lines. The transform is applied
        # to the entire already-rendered line, so individual captured glyph strokes are never morphed.
        for item in ink_items:
            source_target = item["sourceTargetInkHeightPx"]
            raw_scale = shared_target_ink / source_target
            scale = max(0.88, min(1.12, raw_scale))
            source_image = item["image"]
            source_size = [source_image.width, source_image.height]
            if abs(scale - 1.0) > 0.0005:
                source_image = source_image.resize(
                    (max(1, round(source_image.width * scale)), max(1, round(source_image.height * scale))),
                    Image.Resampling.LANCZOS,
                )
            line_start_offset = _signed_unit(f"{seed}|line-start:{item['line']}") * shared_target_ink * LINE_START_JITTER_FRACTION
            item["image"] = source_image
            item["lineScale"] = scale
            item["rawLineScale"] = raw_scale
            item["sourcePixelSize"] = source_size
            item["normalizedPixelSize"] = [source_image.width, source_image.height]
            item["effectiveTargetInkHeightPx"] = source_target * scale
            item["lineStartOffsetPx"] = line_start_offset

        ink_heights = [item["image"].height for item in ink_items]
        median_height = round(_median([float(value) for value in ink_heights]))
        gap = max(4, round(median_height * float(line_spacing_factor)))
        blank_advance = median_height + gap
        min_x = min(0.0, min(item["lineStartOffsetPx"] for item in ink_items))
        max_x = max(item["lineStartOffsetPx"] + item["image"].width for item in ink_items)
        width = max(1, round(max_x - min_x))
        height = 0
        for item in rendered_lines:
            if item["kind"] == "blank":
                height += blank_advance
            else:
                height += item["image"].height + gap
        height = max(1, height - gap)
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        y = 0
        line_results = []
        for item in rendered_lines:
            if item["kind"] == "blank":
                line_results.append({"line": item["line"], "blank": True, "yPx": y})
                y += blank_advance
                continue
            image = item["image"]
            x = round(item["lineStartOffsetPx"] - min_x)
            canvas.alpha_composite(image, (x, y))
            result = item["result"]
            line_results.append({
                "line": item["line"],
                "blank": False,
                "xPx": x,
                "yPx": y,
                "lineStartOffsetPx": round(item["lineStartOffsetPx"], 3),
                "text": result.get("text"),
                "sourceOutputSha256": result.get("outputSha256"),
                "sourcePixelSize": item["sourcePixelSize"],
                "pixelSize": item["normalizedPixelSize"],
                "sourceTargetInkHeightPx": round(item["sourceTargetInkHeightPx"], 3),
                "effectiveTargetInkHeightPx": round(item["effectiveTargetInkHeightPx"], 3),
                "lineScale": round(item["lineScale"], 6),
                "rawLineScale": round(item["rawLineScale"], 6),
                "tokenCount": len(result.get("tokens", [])),
            })
            y += image.height + gap

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
        "schema": SCHEMA,
        "text": text,
        "style": style,
        "lineCount": len(lines),
        "inkLineCount": sum(1 for item in line_results if not item["blank"]),
        "blankLineCount": sum(1 for item in line_results if item["blank"]),
        "lineSpacingFactor": float(line_spacing_factor),
        "lineGapPx": gap,
        "sharedTargetInkHeightPx": round(shared_target_ink, 3),
        "lineScaleNormalization": {"minimum": 0.88, "maximum": 1.12, "wholeLineRigidScaleOnly": True},
        "lineStartVariation": {"fractionOfSharedInkHeight": LINE_START_JITTER_FRACTION, "wholeLineTranslationOnly": True},
        "pixelSize": [canvas.width, canvas.height],
        "outputSha256": _sha_file(output),
        "hostileBackgroundProofSha256": proof_sha,
        "lines": line_results,
        "truthBoundary": {
            "fontFallbackUsed": False,
            "syntheticHandwritingGenerated": False,
            "lineImagesRenderedByGenuineAtlas": True,
            "lineScaleNormalizedAsWholeRigidRaster": True,
            "lineStartVariationIsWholeRigidTranslation": True,
            "strokeDeformation": False,
        },
    }
    if receipt is not None:
        receipt.parent.mkdir(parents=True, exist_ok=True)
        receipt.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render multiline text from a genuine handwriting atlas")
    parser.add_argument("atlas")
    parser.add_argument("text")
    parser.add_argument("output")
    parser.add_argument("--seed", required=True)
    parser.add_argument("--style")
    parser.add_argument("--line-spacing-factor", type=float, default=0.55)
    parser.add_argument("--proof")
    parser.add_argument("--receipt")
    args = parser.parse_args(argv)
    try:
        result = render_multiline(
            Path(args.atlas),
            args.text,
            Path(args.output),
            seed=args.seed,
            style=args.style,
            line_spacing_factor=args.line_spacing_factor,
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
