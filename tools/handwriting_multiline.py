from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from pathlib import Path

from tools.handwriting_atlas import render_text

SCHEMA = "evavo.art-studio.handwriting-multiline-render.v1"


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
            rendered_lines.append({
                "kind": "ink",
                "line": index + 1,
                "path": path,
                "result": result,
                "image": Image.open(path).convert("RGBA"),
            })

        ink_heights = [item["image"].height for item in rendered_lines if item["kind"] == "ink"]
        if not ink_heights:
            raise ValueError("multiline handwriting contains no ink")
        median_height = sorted(ink_heights)[len(ink_heights) // 2]
        gap = max(4, round(median_height * float(line_spacing_factor)))
        blank_advance = median_height + gap
        width = max(item["image"].width for item in rendered_lines if item["kind"] == "ink")
        height = 0
        placements = []
        for item in rendered_lines:
            if item["kind"] == "blank":
                height += blank_advance
                placements.append({"line": item["line"], "blank": True, "yPx": height})
                continue
            image = item["image"]
            placements.append({"line": item["line"], "blank": False, "yPx": height, "pixelSize": [image.width, image.height]})
            height += image.height + gap
        height = max(1, height - gap)
        canvas = Image.new("RGBA", (max(1, width), height), (0, 0, 0, 0))
        y = 0
        line_results = []
        for item in rendered_lines:
            if item["kind"] == "blank":
                y += blank_advance
                line_results.append({"line": item["line"], "blank": True})
                continue
            image = item["image"]
            canvas.alpha_composite(image, (0, y))
            result = item["result"]
            line_results.append({
                "line": item["line"],
                "blank": False,
                "text": result.get("text"),
                "outputSha256": result.get("outputSha256"),
                "pixelSize": result.get("pixelSize"),
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
        "pixelSize": [canvas.width, canvas.height],
        "outputSha256": _sha_file(output),
        "hostileBackgroundProofSha256": proof_sha,
        "lines": line_results,
        "truthBoundary": {
            "fontFallbackUsed": False,
            "syntheticHandwritingGenerated": False,
            "lineImagesRenderedByGenuineAtlas": True,
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
