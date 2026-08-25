from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import random
from pathlib import Path

ATLAS_SCHEMA = "evavo.art-studio.handwriting-atlas.v1"
RECEIPT_SCHEMA = "evavo.art-studio.handwriting-whole-mark-render.v1"


def _pil():
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required for whole handwriting mark rendering") from exc
    return Image


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


def _rng(seed: str, kind: str) -> random.Random:
    digest = hashlib.sha256(f"{kind}|{seed}".encode("utf-8")).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def _safe_asset(root: Path, relative: str) -> Path:
    raw = Path(relative)
    if raw.is_absolute():
        raise ValueError("whole handwriting mark asset path must be relative to assetRoot")
    root = root.resolve()
    path = (root / raw).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError("whole handwriting mark asset escapes assetRoot") from exc
    if not path.is_file():
        raise ValueError("whole handwriting mark asset is missing")
    return path


def _write_json_create_only(path: Path, value: dict) -> None:
    if path.exists():
        raise ValueError(f"create-only output already exists: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def render_whole_mark(
    atlas_path: Path,
    output: Path,
    *,
    kind: str,
    seed: str,
    style: str | None = None,
    previous_sha256: str | None = None,
    proof: Path | None = None,
    receipt: Path | None = None,
) -> dict:
    Image = _pil()
    if kind not in {"signature", "name"}:
        raise ValueError("kind must be signature or name")
    if output.exists():
        raise ValueError(f"create-only output already exists: {output}")
    if proof is not None and proof.exists():
        raise ValueError(f"create-only proof already exists: {proof}")
    if receipt is not None and receipt.exists():
        raise ValueError(f"create-only receipt already exists: {receipt}")

    atlas = _load(atlas_path)
    if atlas.get("schema") != ATLAS_SCHEMA:
        raise ValueError("invalid handwriting atlas schema")
    root = Path(str(atlas.get("assetRoot") or "")).resolve()
    marks = atlas.get("wholeMarks")
    entries = marks.get(kind) if isinstance(marks, dict) else None
    if not isinstance(entries, list) or not entries:
        raise ValueError(f"atlas contains no whole {kind} variants")

    candidates = []
    for index, item in enumerate(entries):
        if not isinstance(item, dict) or not isinstance(item.get("file"), str) or not isinstance(item.get("sha256"), str):
            continue
        if style and str(item.get("style") or "").casefold() != style.casefold():
            continue
        if previous_sha256 and item["sha256"] == previous_sha256 and len(entries) > 1:
            continue
        candidates.append((index, item))
    if not candidates:
        candidates = [(index, item) for index, item in enumerate(entries) if isinstance(item, dict) and isinstance(item.get("file"), str) and (not style or str(item.get("style") or "").casefold() == style.casefold())]
    if not candidates:
        raise ValueError(f"atlas contains no whole {kind} variant with requested style")

    r = _rng(seed, kind)
    selected_index, selected = candidates[r.randrange(len(candidates))]
    asset = _safe_asset(root, selected["file"])
    actual_sha = _sha_file(asset)
    if actual_sha != selected["sha256"]:
        raise ValueError("whole handwriting mark asset changed since atlas build")

    image = Image.open(asset).convert("RGBA")
    limits = {
        "signature": {"rotation": 0.8, "scale": 0.018},
        "name": {"rotation": 0.55, "scale": 0.015},
    }[kind]
    scale = 1.0 + r.uniform(-limits["scale"], limits["scale"])
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    angle = r.uniform(-limits["rotation"], limits["rotation"])
    if abs(angle) > 0.01:
        image = image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)

    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 12 else 0).getbbox()
    if bbox is None:
        raise ValueError("selected whole handwriting mark contains no visible ink")
    x0, y0, x1, y1 = bbox
    pad = 8
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(image.width, x1 + pad), min(image.height, y1 + pad)
    image = image.crop((x0, y0, x1, y1))

    # Clear hidden matte RGB where alpha is fully transparent. Semitransparent
    # pixels preserve the photographed ink colour; no stroke-level edits occur.
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, a = px[x, y]
            if a == 0:
                px[x, y] = (0, 0, 0, 0)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)

    proof_sha = None
    if proof is not None:
        margin = 14
        proof_image = Image.new("RGB", (image.width * 3 + margin * 4, image.height + margin * 2), (232, 232, 232))
        for index, colour in enumerate(((255, 255, 255), (18, 18, 18), (0, 175, 70))):
            panel = Image.new("RGBA", image.size, (*colour, 255))
            panel.alpha_composite(image)
            proof_image.paste(panel.convert("RGB"), (margin + index * (image.width + margin), margin))
        proof.parent.mkdir(parents=True, exist_ok=True)
        proof_image.save(proof, format="PNG", optimize=True)
        proof_sha = _sha_file(proof)

    result = {
        "schema": RECEIPT_SCHEMA,
        "kind": kind,
        "atlasId": atlas.get("atlasId"),
        "selectedVariant": selected_index,
        "selectedSourceSha256": selected["sha256"],
        "selectedStyle": selected.get("style"),
        "outputSha256": _sha_file(output),
        "pixelSize": [image.width, image.height],
        "scale": round(scale, 5),
        "rotationDegrees": round(angle, 4),
        "hostileBackgroundProofSha256": proof_sha,
        "truthBoundary": {
            "wholeGenuineCapturedVariant": True,
            "syntheticHandwritingGenerated": False,
            "strokeDeformation": False,
            "signatureSynthesizedFromGlyphs": False if kind == "signature" else None,
            "privatePathsReturned": False,
        },
    }
    if receipt is not None:
        _write_json_create_only(receipt, result)
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Render a whole genuine handwritten name or signature variant")
    parser.add_argument("atlas")
    parser.add_argument("output")
    parser.add_argument("--kind", choices=["signature", "name"], required=True)
    parser.add_argument("--seed", required=True)
    parser.add_argument("--style")
    parser.add_argument("--previous-sha256")
    parser.add_argument("--proof")
    parser.add_argument("--receipt")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = render_whole_mark(
            Path(args.atlas),
            Path(args.output),
            kind=args.kind,
            seed=args.seed,
            style=args.style,
            previous_sha256=args.previous_sha256,
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
