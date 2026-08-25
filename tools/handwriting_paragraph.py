from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from pathlib import Path

try:
    from tools import handwriting_atlas as atlas_tool
    from tools.handwriting_multiline import render_multiline
except ModuleNotFoundError:
    import handwriting_atlas as atlas_tool  # type: ignore
    from handwriting_multiline import render_multiline  # type: ignore

SCHEMA = "evavo.art-studio.handwriting-paragraph-render.v1"
MEASUREMENT_MODEL = "normalized-genuine-advance-v1"


def _load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _median(values: list[float]) -> float:
    if not values:
        raise ValueError("cannot measure handwriting atlas without genuine glyph metrics")
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def _eligible(entries: list[dict], style: str | None) -> list[dict]:
    values = [
        item for item in entries
        if isinstance(item, dict)
        and (not style or str(item.get("style") or "").casefold() == style.casefold())
    ]
    if not values:
        raise ValueError(f"no genuine handwriting variant is available for requested style {style!r}")
    return values


def _ink_metrics(item: dict) -> tuple[float, float, float]:
    box = item.get("inkBox")
    if not isinstance(box, list) or len(box) != 4:
        raise ValueError("genuine handwriting atlas variant lacks inkBox metrics")
    try:
        ink_w = float(box[2]) - float(box[0])
        ink_h = float(box[3]) - float(box[1])
        natural = float(item.get("naturalAdvancePx"))
    except (TypeError, ValueError) as exc:
        raise ValueError("genuine handwriting atlas variant has invalid advance/ink metrics") from exc
    if ink_w <= 0 or ink_h <= 0 or natural <= 0:
        raise ValueError("genuine handwriting atlas variant has non-positive advance/ink metrics")
    return ink_w, ink_h, natural


def _target_ink_height(tokens: list[str], glyphs: dict[str, list[dict]], style: str | None) -> float:
    heights = []
    for token in tokens:
        if token.isspace():
            continue
        entries = glyphs.get(token)
        if not isinstance(entries, list) or not entries:
            raise ValueError(f"genuine handwriting atlas is missing token {token!r}")
        for item in _eligible(entries, style):
            _ink_w, ink_h, _natural = _ink_metrics(item)
            heights.append(ink_h)
    return _median(heights)


def _normalized_variant_advance(item: dict, target_h: float) -> float:
    ink_w, ink_h, natural = _ink_metrics(item)
    scale = target_h / ink_h
    rendered_ink_w = ink_w * scale
    normalized = natural * scale
    # Mirror handwriting_atlas.render_text(): preserve genuine advance but cap padding-derived gaps.
    return max(rendered_ink_w + 1.0, min(normalized, rendered_ink_w + target_h * 0.30))


def _measure_text(atlas: dict, text: str, *, style: str | None) -> float:
    glyphs = atlas.get("glyphs")
    if not isinstance(glyphs, dict) or not glyphs:
        raise ValueError("atlas has no glyphs")
    tokens = atlas_tool._tokenize(text, glyphs)
    rendering = atlas.get("rendering") if isinstance(atlas.get("rendering"), dict) else {}
    tracking = float(rendering.get("trackingPx", 1.5))
    target_h = _target_ink_height(tokens, glyphs, style)

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
    median_advance = _median(all_advances)
    space_advance = max(target_h * 0.35, median_advance * float(rendering.get("spaceFactor", 0.48)))

    width = 0.0
    glyph_count = 0
    for token in tokens:
        if token.isspace():
            width += space_advance
            continue
        entries = glyphs.get(token)
        if not isinstance(entries, list) or not entries:
            raise ValueError(f"genuine handwriting atlas is missing token {token!r}")
        advances = [_normalized_variant_advance(item, target_h) for item in _eligible(entries, style)]
        width += _median(advances)
        glyph_count += 1
    if glyph_count > 1:
        width += tracking * (glyph_count - 1)
    return max(0.0, width)


def wrap_text(atlas_path: Path, text: str, *, max_width_px: int, style: str | None = None) -> tuple[str, list[dict]]:
    if not isinstance(max_width_px, int) or isinstance(max_width_px, bool) or not 120 <= max_width_px <= 8192:
        raise ValueError("max_width_px must be an integer between 120 and 8192")
    atlas = _load(atlas_path)
    if atlas.get("schema") != atlas_tool.ATLAS_SCHEMA:
        raise ValueError("invalid handwriting atlas schema")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("paragraph handwriting text is empty")
    if len(text) > 8192:
        raise ValueError("paragraph handwriting supports at most 8192 characters")

    output_lines: list[str] = []
    evidence: list[dict] = []
    source_lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    for source_index, source_line in enumerate(source_lines, start=1):
        if not source_line.strip():
            output_lines.append("")
            evidence.append({"sourceLine": source_index, "wrappedLine": len(output_lines), "blank": True})
            continue
        words = source_line.split()
        current = ""
        for word in words:
            word_width = _measure_text(atlas, word, style=style)
            if word_width > max_width_px:
                raise ValueError(f"genuine handwritten word exceeds max_width_px and cannot be safely split: {word!r}")
            candidate = word if not current else current + " " + word
            candidate_width = _measure_text(atlas, candidate, style=style)
            if current and candidate_width > max_width_px:
                line_width = _measure_text(atlas, current, style=style)
                output_lines.append(current)
                evidence.append({
                    "sourceLine": source_index,
                    "wrappedLine": len(output_lines),
                    "blank": False,
                    "estimatedWidthPx": round(line_width, 3),
                    "maxWidthPx": max_width_px,
                    "measurementModel": MEASUREMENT_MODEL,
                })
                current = word
            else:
                current = candidate
        if current:
            line_width = _measure_text(atlas, current, style=style)
            output_lines.append(current)
            evidence.append({
                "sourceLine": source_index,
                "wrappedLine": len(output_lines),
                "blank": False,
                "estimatedWidthPx": round(line_width, 3),
                "maxWidthPx": max_width_px,
                "measurementModel": MEASUREMENT_MODEL,
            })
    return "\n".join(output_lines), evidence


def render_paragraph(
    atlas: Path,
    text: str,
    output: Path,
    *,
    seed: str,
    max_width_px: int,
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
    wrapped, wrap_evidence = wrap_text(atlas, text, max_width_px=max_width_px, style=style)
    with tempfile.TemporaryDirectory() as directory:
        temp_receipt = Path(directory) / "multiline.json"
        multiline = render_multiline(
            atlas,
            wrapped,
            output,
            seed=seed,
            style=style,
            line_spacing_factor=line_spacing_factor,
            proof=proof,
            receipt=temp_receipt,
        )
    result = {
        "schema": SCHEMA,
        "sourceText": text,
        "wrappedText": wrapped,
        "style": style,
        "maxWidthPx": max_width_px,
        "measurementModel": MEASUREMENT_MODEL,
        "lineCount": multiline["lineCount"],
        "inkLineCount": multiline["inkLineCount"],
        "blankLineCount": multiline["blankLineCount"],
        "lineSpacingFactor": multiline["lineSpacingFactor"],
        "pixelSize": multiline["pixelSize"],
        "outputSha256": _sha_file(output),
        "hostileBackgroundProofSha256": multiline.get("hostileBackgroundProofSha256"),
        "wrapEvidence": wrap_evidence,
        "lines": multiline["lines"],
        "truthBoundary": {
            "fontFallbackUsed": False,
            "syntheticHandwritingGenerated": False,
            "wordWrappingUsesMeasuredGenuineAdvances": True,
            "wrappingMatchesNormalizedInkHeightModel": True,
            "wordsSplitWithoutCapturedGlyphBoundary": False,
            "strokeDeformation": False,
        },
    }
    if receipt is not None:
        receipt.parent.mkdir(parents=True, exist_ok=True)
        receipt.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Wrap and render paragraph text from a genuine handwriting atlas")
    parser.add_argument("atlas")
    parser.add_argument("text")
    parser.add_argument("output")
    parser.add_argument("--seed", required=True)
    parser.add_argument("--max-width-px", required=True, type=int)
    parser.add_argument("--style")
    parser.add_argument("--line-spacing-factor", type=float, default=0.55)
    parser.add_argument("--proof")
    parser.add_argument("--receipt")
    args = parser.parse_args(argv)
    try:
        result = render_paragraph(
            Path(args.atlas),
            args.text,
            Path(args.output),
            seed=args.seed,
            max_width_px=args.max_width_px,
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
