#!/usr/bin/env python3
"""Build a create-only visual review catalog for an immutable PNG source tree."""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import html
import json
import math
import os
import re
import shutil
import statistics
import sys
import textwrap
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageStat


SCHEMA = "evavo.raw-art-visual-catalog.v1"
VERIFY_SCHEMA = "evavo.raw-art-visual-catalog-verification.v1"
INSPECTION_SCHEMA = "evavo.raw-art-visual-context-inspection.v1"
WORKBOOK_SCHEMA = "evavo.raw-art-visual-review-workbook.v1"
AUTHORITY = {
    "creativeApproval": False,
    "styleApproval": False,
    "provenanceApproval": False,
    "sourceMutation": False,
    "sourceDeletion": False,
    "candidatePromotion": False,
    "runtimeSubmission": False,
    "repositoryMutation": False,
    "gitCommit": False,
    "gitPush": False,
    "publication": False,
}

OWNER_INTENT_PRIOR = {
    "interpretation": "likely-owner-desired-visual-direction",
    "weight": "strong-prior",
    "meaning": "Preserve and learn from RAW_ART unless full-resolution review identifies a conflict, duplicate, defect or outlier.",
    "notAutomaticProductionApproval": True,
    "notAutomaticStyleApproval": True,
    "namedReferenceSelectionRequired": True,
}

ANIMATION_TOKENS = frozenset({
    "anim", "animation", "attack", "cast", "climb", "death", "die", "dodge", "fall", "frame",
    "hit", "hurt", "idle", "jump", "loop", "pose", "recover", "run", "shoot", "spawn", "sprite",
    "stand", "turn", "walk", "windup",
})
DIRECTION_TOKENS = frozenset({"n", "ne", "e", "se", "s", "sw", "w", "nw", "north", "south", "east", "west", "front", "back", "left", "right"})


class CatalogError(RuntimeError):
    """A fail-closed visual catalog error."""


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def manifest_hash(value: dict[str, Any]) -> str:
    copy = dict(value)
    copy.pop("manifestSha256", None)
    return sha256_bytes(canonical_json(copy).encode("utf-8"))


def self_hash(value: dict[str, Any], field: str) -> str:
    copy = dict(value)
    copy.pop(field, None)
    return sha256_bytes(canonical_json(copy).encode("utf-8"))


def is_within(parent: Path, child: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def resolve_existing_directory(value: str, label: str) -> Path:
    requested = Path(value).expanduser()
    if requested.is_symlink():
        raise CatalogError(f"{label} must not be a symbolic link: {requested}")
    resolved = requested.resolve(strict=True)
    if not resolved.is_dir():
        raise CatalogError(f"{label} must be a directory: {resolved}")
    return resolved


def resolve_future_directory(value: str, label: str) -> Path:
    requested = Path(value).expanduser().absolute()
    if requested.exists():
        raise CatalogError(f"{label} already exists; catalogs are create-only: {requested}")
    parent = requested.parent.resolve(strict=True)
    return parent / requested.name


def assert_disjoint(raw_root: Path, output_root: Path) -> None:
    if raw_root == output_root or is_within(raw_root, output_root) or is_within(output_root, raw_root):
        raise CatalogError("outputRoot and rawArtRoot must be completely disjoint")


def walk_pngs(root: Path, maximum_files: int, maximum_bytes: int) -> list[Path]:
    files: list[Path] = []
    total_bytes = 0

    def visit(current: Path) -> None:
        nonlocal total_bytes
        entries = sorted(os.scandir(current), key=lambda item: (item.name.casefold(), item.name))
        for entry in entries:
            path = Path(entry.path)
            if entry.is_symlink():
                raise CatalogError(f"RAW_ART contains a symbolic link: {path.relative_to(root).as_posix()}")
            if entry.is_dir(follow_symlinks=False):
                visit(path)
                continue
            if not entry.is_file(follow_symlinks=False) or path.suffix.lower() != ".png":
                continue
            if len(files) >= maximum_files:
                raise CatalogError(f"PNG file limit exceeded ({maximum_files})")
            size = entry.stat(follow_symlinks=False).st_size
            total_bytes += size
            if total_bytes > maximum_bytes:
                raise CatalogError(f"PNG byte limit exceeded ({maximum_bytes})")
            files.append(path)

    visit(root)
    if not files:
        raise CatalogError(f"No PNG files were found beneath {root}")
    return files


def stable_source_identity(path: Path) -> tuple[str, int]:
    before = path.stat(follow_symlinks=False)
    if not path.is_file() or path.is_symlink():
        raise CatalogError(f"Source must remain a regular non-symbolic file: {path}")
    digest = sha256_file(path)
    after = path.stat(follow_symlinks=False)
    fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_nlink")
    if any(getattr(before, field) != getattr(after, field) for field in fields):
        raise CatalogError(f"Source changed during visual inspection: {path}")
    return digest, before.st_size


def checkerboard(size: tuple[int, int], tile: int = 12) -> Image.Image:
    image = Image.new("RGBA", size, (46, 48, 53, 255))
    draw = ImageDraw.Draw(image)
    light = (78, 81, 88, 255)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, min(x + tile - 1, size[0] - 1), min(y + tile - 1, size[1] - 1)), fill=light)
    return image


def composited_sample(image: Image.Image, size: tuple[int, int] = (64, 64)) -> Image.Image:
    rgba = image.convert("RGBA")
    backdrop = Image.new("RGBA", rgba.size, (32, 32, 32, 255))
    composite = Image.alpha_composite(backdrop, rgba).convert("RGB")
    return ImageOps.contain(composite, size, Image.Resampling.LANCZOS).resize(size, Image.Resampling.LANCZOS)


def flattened_pixels(image: Image.Image) -> Iterable[Any]:
    getter = getattr(image, "get_flattened_data", None)
    return getter() if callable(getter) else image.getdata()


def dhash(image: Image.Image) -> str:
    gray = composited_sample(image, (9, 8)).convert("L")
    pixels = list(flattened_pixels(gray))
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | int(pixels[y * 9 + x] > pixels[y * 9 + x + 1])
    return f"{bits:016x}"


def dominant_palette(image: Image.Image, count: int = 8) -> list[dict[str, Any]]:
    sampled = composited_sample(image)
    quantized = sampled.quantize(colors=count, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    values = sorted(quantized.getcolors(maxcolors=4096) or [], reverse=True)
    total = max(1, sampled.width * sampled.height)
    result = []
    for occurrences, index in values[:count]:
        offset = index * 3
        rgb = tuple(palette[offset : offset + 3])
        if len(rgb) != 3:
            continue
        result.append({
            "hex": "#" + "".join(f"{channel:02x}" for channel in rgb),
            "coverage": round(occurrences / total, 6),
        })
    return result


def image_metrics(image: Image.Image) -> dict[str, Any]:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    alpha_hist = alpha.histogram()
    total = max(1, image.width * image.height)
    transparent = alpha_hist[0]
    opaque = alpha_hist[255]
    semitransparent = total - transparent - opaque
    bbox = alpha.getbbox()
    border_values: list[int] = []
    if image.width and image.height:
        border_values.extend(flattened_pixels(alpha.crop((0, 0, image.width, 1))))
        if image.height > 1:
            border_values.extend(flattened_pixels(alpha.crop((0, image.height - 1, image.width, image.height))))
        if image.height > 2:
            border_values.extend(flattened_pixels(alpha.crop((0, 1, 1, image.height - 1))))
            if image.width > 1:
                border_values.extend(flattened_pixels(alpha.crop((image.width - 1, 1, image.width, image.height - 1))))

    sample = composited_sample(image)
    gray_stats = ImageStat.Stat(sample.convert("L"))
    saturation_stats = ImageStat.Stat(sample.convert("HSV").getchannel("S"))
    corners = [rgba.getpixel((0, 0)), rgba.getpixel((image.width - 1, 0)), rgba.getpixel((0, image.height - 1)), rgba.getpixel((image.width - 1, image.height - 1))]
    warnings: list[str] = []
    has_alpha_channel = "A" in image.getbands() or image.mode in {"LA", "PA"}
    if not has_alpha_channel:
        warnings.append("source-has-no-alpha-channel")
    elif transparent == 0 and semitransparent == 0:
        warnings.append("alpha-channel-is-fully-opaque")
    if any(0 < value < 255 for value in border_values):
        warnings.append("semi-transparent-pixels-touch-canvas-edge")
    if bbox == (0, 0, image.width, image.height):
        warnings.append("visible-content-touches-all-canvas-edges")
    if len(set(corners)) == 1 and corners[0][3] == 255:
        warnings.append("uniform-opaque-corner-background-candidate")

    return {
        "mode": image.mode,
        "width": image.width,
        "height": image.height,
        "aspectRatio": round(image.width / max(1, image.height), 6),
        "hasAlphaChannel": has_alpha_channel,
        "alpha": {
            "transparentPixels": transparent,
            "semiTransparentPixels": semitransparent,
            "opaquePixels": opaque,
            "visibleCoverage": round((total - transparent) / total, 6),
            "contentBounds": list(bbox) if bbox else None,
        },
        "visualEvidence": {
            "meanLuminance": round(gray_stats.mean[0], 4),
            "luminanceDeviation": round(gray_stats.stddev[0], 4),
            "meanSaturation": round(saturation_stats.mean[0], 4),
            "dominantCompositePalette": dominant_palette(image),
            "dHash64": dhash(image),
            "semanticInferenceAuthoritative": False,
        },
        "warnings": warnings,
    }


def choose_resampling(image: Image.Image) -> tuple[int, str]:
    if max(image.size) <= 512:
        return Image.Resampling.NEAREST, "nearest"
    return Image.Resampling.LANCZOS, "lanczos"


def render_thumbnail(image: Image.Image, relative_path: str, canvas_size: int) -> tuple[Image.Image, str]:
    label_height = 58
    preview_size = (canvas_size, canvas_size)
    canvas = checkerboard((canvas_size, canvas_size + label_height))
    resampling, resampling_name = choose_resampling(image)
    preview = ImageOps.contain(image.convert("RGBA"), (canvas_size - 20, canvas_size - 20), resampling)
    x = (canvas_size - preview.width) // 2
    y = (canvas_size - preview.height) // 2
    canvas.alpha_composite(preview, (x, y))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, canvas_size, canvas_size, canvas_size + label_height), fill=(18, 19, 22, 255))
    font = ImageFont.load_default()
    lines = textwrap.wrap(relative_path, width=max(18, canvas_size // 8))[:3]
    draw.multiline_text((8, canvas_size + 6), "\n".join(lines), font=font, fill=(238, 239, 242, 255), spacing=2)
    return canvas, resampling_name


def file_artifact(path: Path, root: Path) -> dict[str, Any]:
    return {
        "relativePath": path.relative_to(root).as_posix(),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
    }


def visual_bucket(value: float, low: float, high: float) -> str:
    if value < low:
        return "low"
    if value > high:
        return "high"
    return "mid"


def palette_hue(record: dict[str, Any]) -> str:
    palette = record["visualEvidence"].get("dominantCompositePalette", [])
    if not palette:
        return "unknown"
    value = palette[0].get("hex", "")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        return "unknown"
    red, green, blue = (int(value[offset : offset + 2], 16) / 255 for offset in (1, 3, 5))
    hue, saturation, _ = colorsys.rgb_to_hsv(red, green, blue)
    if saturation < 0.14:
        return "neutral"
    degrees = hue * 360
    for boundary, label in (
        (20, "red"), (50, "orange"), (75, "yellow"), (155, "green"),
        (195, "cyan"), (255, "blue"), (290, "purple"), (335, "magenta"), (360, "red"),
    ):
        if degrees < boundary:
            return label
    return "red"


def technical_style_signature(record: dict[str, Any]) -> dict[str, str]:
    alpha = record["alpha"]
    if alpha["transparentPixels"] > 0:
        alpha_profile = "cutout-or-transparent"
    elif alpha["semiTransparentPixels"] > 0:
        alpha_profile = "partial-alpha"
    else:
        alpha_profile = "opaque-canvas"
    aspect = record["aspectRatio"]
    aspect_family = "portrait" if aspect < 0.8 else "landscape" if aspect > 1.25 else "squareish"
    visual = record["visualEvidence"]
    return {
        "alphaProfile": alpha_profile,
        "aspectFamily": aspect_family,
        "luminanceFamily": visual_bucket(visual["meanLuminance"], 78, 176),
        "saturationFamily": visual_bucket(visual["meanSaturation"], 52, 154),
        "dominantCompositeHue": palette_hue(record),
    }


def sequence_evidence(relative_path: str) -> dict[str, Any] | None:
    source = Path(relative_path)
    stem = source.stem.casefold()
    parent = source.parent.as_posix().casefold()
    index_match = re.search(r"(?:^|[\s_.\-(\[])(\d{1,4})[\])]?\s*$", stem)
    order = int(index_match.group(1)) if index_match else None
    without_index = stem[: index_match.start()].rstrip(" ._-([") if index_match else stem
    chatgpt = re.match(
        r"^chatgpt\s+image\s+(.+?),\s*(\d{1,2})[_:](\d{2})(?:[_:]\d{2})?\s*(am|pm)$",
        without_index,
    )
    if chatgpt:
        date, hour, minute, meridiem = chatgpt.groups()
        key = f"{parent}|chatgpt-export|{date}|{hour}:{minute}{meridiem}"
        return {
            "key": key,
            "candidateKind": "generated-export-batch",
            "confidence": "medium",
            "order": order,
            "signals": ["shared-export-minute", "optional-export-index"],
            "warning": "An export batch may contain alternatives, iterations or frames; visual review must decide which.",
        }

    tokens = re.findall(r"[a-z0-9]+", without_index)
    animation = sorted(set(tokens).intersection(ANIMATION_TOKENS))
    direction = next((token for token in reversed(tokens) if token in DIRECTION_TOKENS), None)
    base_tokens = list(tokens)
    if direction and direction in base_tokens:
        base_tokens.remove(direction)
    key_base = "-".join(base_tokens) or without_index
    if direction:
        return {
            "key": f"{parent}|directional|{key_base}",
            "candidateKind": "directional-frame-family",
            "confidence": "medium",
            "order": order,
            "signals": ["direction-token", *( ["animation-token"] if animation else [] ), *( ["numeric-suffix"] if order is not None else [] )],
            "warning": "Direction labels help group views but never prove animation order, mirroring safety or runtime pivots.",
        }
    if animation and order is not None:
        return {
            "key": f"{parent}|animation|{key_base}",
            "candidateKind": "probable-animation-frame-sequence",
            "confidence": "medium",
            "order": order,
            "signals": ["animation-token", "numeric-suffix"],
            "warning": "Numeric order is only a review suggestion; inspect motion, canvas, pivot and continuity before use.",
        }
    if order is not None:
        return {
            "key": f"{parent}|numbered|{key_base}",
            "candidateKind": "numbered-variant-or-frame-batch",
            "confidence": "low",
            "order": order,
            "signals": ["numeric-suffix"],
            "warning": "A number alone cannot distinguish a frame from a variation, duplicate, page or export order.",
        }
    return None


def compile_review_intelligence(records: list[dict[str, Any]], packets: list[dict[str, Any]]) -> dict[str, Any]:
    packet_for_path = {
        source_path: packet["packetId"]
        for packet in packets
        for source_path in packet["sourcePaths"]
    }
    family_members: dict[str, list[str]] = defaultdict(list)
    family_signatures: dict[str, dict[str, str]] = {}
    for record in records:
        signature = technical_style_signature(record)
        key = canonical_json(signature)
        family_members[key].append(record["relativePath"])
        family_signatures[key] = signature

    families: list[dict[str, Any]] = []
    family_for_path: dict[str, str] = {}
    for key, paths in sorted(family_members.items(), key=lambda item: (-len(item[1]), item[0])):
        family_id = f"technical-family-{sha256_bytes(key.encode('utf-8'))[:12]}"
        ordered = sorted(paths, key=str.casefold)
        for relative_path in ordered:
            family_for_path[relative_path] = family_id
        families.append({
            "familyId": family_id,
            "technicalSignature": family_signatures[key],
            "sourcePaths": ordered,
            "memberCount": len(ordered),
            "semanticStyleAuthority": False,
            "requiresVisualNamingAndCoherenceReview": True,
        })

    candidate_members: dict[str, list[tuple[dict[str, Any], str]]] = defaultdict(list)
    for record in records:
        evidence = sequence_evidence(record["relativePath"])
        if evidence:
            candidate_members[evidence["key"]].append((evidence, record["relativePath"]))
    candidates: list[dict[str, Any]] = []
    candidate_for_path: dict[str, list[str]] = defaultdict(list)
    for key, members in sorted(candidate_members.items(), key=lambda item: (-len(item[1]), item[0])):
        if len(members) < 2:
            continue
        first = members[0][0]
        ordered_members = sorted(members, key=lambda item: (item[0]["order"] is None, item[0]["order"] or 0, item[1].casefold()))
        candidate_id = f"candidate-group-{sha256_bytes(key.encode('utf-8'))[:12]}"
        paths = [relative_path for _, relative_path in ordered_members]
        for relative_path in paths:
            candidate_for_path[relative_path].append(candidate_id)
        candidates.append({
            "candidateId": candidate_id,
            "candidateKind": first["candidateKind"],
            "confidence": first["confidence"],
            "signals": first["signals"],
            "warning": first["warning"],
            "suggestedReviewOrder": paths,
            "frameOrderAuthoritative": False,
            "requiresFullResolutionVisualConfirmation": True,
            "reviewDecision": "unreviewed",
        })

    items = []
    for record in records:
        relative_path = record["relativePath"]
        items.append({
            "relativePath": relative_path,
            "sourceSha256": record["sourceSha256"],
            "sourceBytes": record["sourceBytes"],
            "dimensions": {"width": record["width"], "height": record["height"]},
            "previewRelativePath": record["preview"]["relativePath"],
            "contactSheetPacketId": packet_for_path[relative_path],
            "technicalStyleFamilyId": family_for_path[relative_path],
            "candidateGroupIds": candidate_for_path.get(relative_path, []),
            "review": {
                "contactSheetInspected": False,
                "originalInspectedAtFullResolution": False,
                "subjectAndIdentity": None,
                "gameRole": None,
                "visualStyleLabel": None,
                "continuityFamily": None,
                "frameOrVariant": "unreviewed",
                "sequenceId": None,
                "frameOrder": None,
                "pivotAndCanvasNotes": None,
                "styleReferenceDecision": "unreviewed",
                "disposition": "unreviewed",
                "strengthsToPreserve": [],
                "defectsOrConflicts": [],
                "notes": None,
            },
        })
    return {
        "sourceSetSha256": sha256_bytes(canonical_json([
            [record["relativePath"], record["sourceSha256"], record["sourceBytes"]] for record in records
        ]).encode("utf-8")),
        "technicalVisualFamilies": families,
        "sequenceAndVariantCandidates": candidates,
        "items": items,
    }


def write_review_intelligence(
    temp_root: Path,
    project_id: str,
    generated_at: str,
    records: list[dict[str, Any]],
    packets: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    intelligence = compile_review_intelligence(records, packets)
    workbook: dict[str, Any] = {
        "schema": WORKBOOK_SCHEMA,
        "projectId": project_id,
        "generatedAt": generated_at,
        "sourceSetSha256": intelligence["sourceSetSha256"],
        "policy": {
            "ownerIntentPrior": OWNER_INTENT_PRIOR,
            "generatedWorkbookIsImmutableEvidence": True,
            "copyBeforeRecordingDecisions": True,
            "fullResolutionInspectionRequired": True,
            "filenamesAndTechnicalClustersAreNotSemanticAuthority": True,
            "authority": AUTHORITY,
        },
        "reviewAxes": [
            "subject-and-identity", "game-role", "silhouette-and-proportions", "value-grouping", "palette-ramps",
            "materials-and-surface-treatment", "line-or-pixel-language", "lighting", "camera-and-perspective",
            "alpha-and-edges", "canvas-pivot-and-runtime-scale", "animation-rhythm-and-motion-topology",
            "ui-density", "provenance", "strengths-to-preserve", "defects-or-conflicts",
        ],
        "technicalVisualFamilies": intelligence["technicalVisualFamilies"],
        "sequenceAndVariantCandidates": intelligence["sequenceAndVariantCandidates"],
        "items": intelligence["items"],
    }
    workbook["workbookSha256"] = self_hash(workbook, "workbookSha256")
    workbook_path = temp_root / "RAW_ART_REVIEW_WORKBOOK.json"
    workbook_path.write_text(json.dumps(workbook, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8", newline="\n")

    context_path = temp_root / "AGENT_VISUAL_CONTEXT.md"
    context_path.write_text(
        "# RAW_ART agent visual context\n\n"
        "## Default interpretation\n\n"
        "Treat this RAW_ART collection as strong evidence of the owner's intended look. Start by preserving and learning from it. "
        "Do not flatten coherent families into a generic average, and do not discard an unusual image until it has been inspected as a possible deliberate exception. "
        "This prior is not production approval: only named, full-resolution references may enter an approved style bank.\n\n"
        "## Complete visual pass\n\n"
        "1. Open every PNG in `contact-sheets/` with an image-viewing tool.\n"
        "2. Use `index.html` to search paths and compare nearby work.\n"
        "3. Copy `RAW_ART_REVIEW_WORKBOOK.json` into a reviewed evidence workspace; never edit the catalog copy.\n"
        "4. For every shortlisted item, open the original RAW_ART PNG at full resolution and actual intended runtime scale.\n"
        "5. Name coherent visual families from what is visible: silhouette, proportions, value grouping, palette ramps, material treatment, line or pixel language, lighting, camera, edge treatment and density.\n"
        "6. Record conflicts and outliers explicitly. Select a small named reference bank rather than blending incompatible examples.\n\n"
        "## Frames, variants and sheets\n\n"
        "`GROUP_REVIEW_QUEUE.md` contains filename and technical grouping evidence only. Decide visually whether a group is an animation sequence, directional family, variant set, duplicate set, atlas/sheet or unrelated export batch. "
        "Before accepting frame order, compare canvas size, alpha bounds, pivot/ground line, identity landmarks, camera, lighting, palette, action arcs, spacing, loop closure and likely timing. "
        "Never let a provider redesign frames independently; continuity and motion topology belong to the family.\n\n"
        "## Safe experimentation\n\n"
        "Use `raw_art_folder_mcp.mjs` to create a reviewed `working-copy`, `reference`, `sequence-frame` or `atlas-frame` session outside RAW_ART. "
        "Every copy remains bound to the original relative path, SHA-256 and byte length. Run Project Art sandbox, mastering, sprite, atlas, provider and Godot Test Lab tools only on those copies. "
        "Never edit, rename, optimize, reorganize or delete a RAW_ART original.\n",
        encoding="utf-8",
        newline="\n",
    )

    queue_path = temp_root / "GROUP_REVIEW_QUEUE.md"
    lines = [
        "# RAW_ART group review queue", "",
        "These are non-authoritative review aids. Open the relevant contact sheet and then each shortlisted original at full resolution.", "",
        "## Probable sequences, directional families and export batches", "",
    ]
    if not intelligence["sequenceAndVariantCandidates"]:
        lines.extend(["No multi-file filename candidate groups were detected. Visual review may still discover sequences or variants.", ""])
    for group in intelligence["sequenceAndVariantCandidates"]:
        lines.extend([
            f"### {group['candidateId']} · {group['candidateKind']}", "",
            f"Confidence: `{group['confidence']}`. {group['warning']}", "",
            *[f"- `{relative_path}`" for relative_path in group["suggestedReviewOrder"]], "",
        ])
    lines.extend(["## Technical visual triage families", "", "These clusters are navigation aids, not semantic style families or approvals.", ""])
    for family in intelligence["technicalVisualFamilies"]:
        signature = ", ".join(f"{key}={value}" for key, value in family["technicalSignature"].items())
        lines.extend([
            f"### {family['familyId']} · {family['memberCount']} item(s)", "", signature, "",
            *[f"- `{relative_path}`" for relative_path in family["sourcePaths"]], "",
        ])
    queue_path.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    return ({
        "agentVisualContext": file_artifact(context_path, temp_root),
        "reviewWorkbook": file_artifact(workbook_path, temp_root),
        "groupReviewQueue": file_artifact(queue_path, temp_root),
    }, intelligence)


def build_catalog(args: argparse.Namespace) -> dict[str, Any]:
    raw_root = resolve_existing_directory(args.raw_art_root, "rawArtRoot")
    output_root = resolve_future_directory(args.output_root, "outputRoot")
    assert_disjoint(raw_root, output_root)
    if not 4 <= args.packet_size <= 100:
        raise CatalogError("packetSize must be between 4 and 100")
    if not 128 <= args.thumbnail_size <= 512:
        raise CatalogError("thumbnailSize must be between 128 and 512")

    pngs = walk_pngs(raw_root, args.maximum_files, args.maximum_bytes)
    temp_root = output_root.parent / f".{output_root.name}.building-{os.getpid()}-{uuid.uuid4().hex}"
    temp_root.mkdir(mode=0o700)
    thumbnail_root = temp_root / "thumbnails"
    sheet_root = temp_root / "contact-sheets"
    thumbnail_root.mkdir()
    sheet_root.mkdir()

    originals_before: dict[str, tuple[str, int]] = {}
    records: list[dict[str, Any]] = []
    try:
        Image.MAX_IMAGE_PIXELS = args.maximum_pixels
        for index, source in enumerate(pngs, start=1):
            relative_path = source.relative_to(raw_root).as_posix()
            digest, byte_count = stable_source_identity(source)
            originals_before[relative_path] = (digest, byte_count)
            try:
                with Image.open(source) as verification:
                    if verification.format != "PNG":
                        raise CatalogError(f"File has .png extension but is not PNG: {relative_path}")
                    verification.verify()
                with Image.open(source) as opened:
                    opened.load()
                    metrics = image_metrics(opened)
                    thumbnail, resampling = render_thumbnail(opened, relative_path, args.thumbnail_size)
            except CatalogError:
                raise
            except Exception as error:
                raise CatalogError(f"PNG decode failed for {relative_path}: {error}") from error

            thumbnail_name = f"{index:06d}-{digest[:12]}.png"
            thumbnail_path = thumbnail_root / thumbnail_name
            thumbnail.save(thumbnail_path, format="PNG", optimize=True)
            records.append({
                "relativePath": relative_path,
                "sourceSha256": digest,
                "sourceBytes": byte_count,
                **metrics,
                "preview": {
                    "relativePath": thumbnail_path.relative_to(temp_root).as_posix(),
                    "sha256": sha256_file(thumbnail_path),
                    "bytes": thumbnail_path.stat().st_size,
                    "resampling": resampling,
                    "derivativeOnly": True,
                },
            })

        packets: list[dict[str, Any]] = []
        columns = max(2, min(5, int(math.sqrt(args.packet_size))))
        cell_width = args.thumbnail_size
        cell_height = args.thumbnail_size + 58
        for packet_index, start in enumerate(range(0, len(records), args.packet_size), start=1):
            packet_records = records[start : start + args.packet_size]
            rows = math.ceil(len(packet_records) / columns)
            sheet = Image.new("RGBA", (columns * cell_width, rows * cell_height), (12, 13, 15, 255))
            for offset, record in enumerate(packet_records):
                with Image.open(temp_root / record["preview"]["relativePath"]) as tile:
                    x = (offset % columns) * cell_width
                    y = (offset // columns) * cell_height
                    sheet.alpha_composite(tile.convert("RGBA"), (x, y))
            sheet_path = sheet_root / f"packet-{packet_index:04d}.png"
            sheet.save(sheet_path, format="PNG", optimize=True)
            packets.append({
                "packetId": f"packet-{packet_index:04d}",
                "contactSheet": file_artifact(sheet_path, temp_root),
                "sourcePaths": [record["relativePath"] for record in packet_records],
                "requiresContactSheetInspection": True,
                "requiresOriginalInspectionBeforeSelectionOrEdit": True,
                "semanticDecision": "human-or-vision-agent-required",
            })

        dimensions = Counter(f"{record['width']}x{record['height']}" for record in records)
        modes = Counter(record["mode"] for record in records)
        warnings = Counter(warning for record in records for warning in record["warnings"])
        exact_groups: dict[str, list[str]] = defaultdict(list)
        perceptual_groups: dict[str, list[str]] = defaultdict(list)
        for record in records:
            exact_groups[record["sourceSha256"]].append(record["relativePath"])
            perceptual_groups[record["visualEvidence"]["dHash64"]].append(record["relativePath"])

        index_path = temp_root / "index.html"
        cards = []
        for record in records:
            searchable = html.escape(record["relativePath"].casefold(), quote=True)
            warning_text = ", ".join(record["warnings"]) or "none"
            cards.append(
                f'<article class="card" data-search="{searchable}" data-alpha="{str(record["hasAlphaChannel"]).lower()}">'
                f'<img loading="lazy" src="{html.escape(record["preview"]["relativePath"], quote=True)}" alt="Preview of {html.escape(record["relativePath"], quote=True)}">'
                f'<h2>{html.escape(record["relativePath"])}</h2>'
                f'<p>{record["width"]}×{record["height"]} · {html.escape(record["mode"])}</p>'
                f'<p class="warning">{html.escape(warning_text)}</p>'
                f'<code>{record["sourceSha256"]}</code></article>'
            )
        index_path.write_text(
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            f"<title>{html.escape(args.project_id)} RAW_ART visual catalog</title><style>"
            ":root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#0c0d0f;color:#f2f3f5}body{margin:0;padding:24px}"
            "header{position:sticky;top:0;background:#0c0d0fee;padding:12px 0 20px;z-index:2}input{width:min(720px,100%);padding:12px;border:1px solid #454950;background:#17191d;color:inherit}"
            ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}.card{background:#17191d;border:1px solid #2a2d33;padding:10px;overflow:hidden}"
            ".card img{width:100%;height:auto;image-rendering:auto}.card h2{font-size:13px;overflow-wrap:anywhere}.card p,.card code{font-size:11px;overflow-wrap:anywhere}.warning{color:#f1b86a}"
            "</style></head><body><header><h1>RAW_ART visual catalog</h1>"
            f"<p>{len(records)} immutable PNG sources · visual evidence only · no automatic style approval</p>"
            "<input id=\"search\" type=\"search\" placeholder=\"Filter by path\"></header><main class=\"grid\">"
            + "".join(cards)
            + "</main><script>const q=document.querySelector('#search');q.addEventListener('input',()=>{const v=q.value.toLowerCase();document.querySelectorAll('.card').forEach(c=>c.hidden=!c.dataset.search.includes(v));});</script></body></html>",
            encoding="utf-8",
            newline="\n",
        )

        review_path = temp_root / "AGENT_REVIEW_QUEUE.md"
        packet_lines = []
        for packet in packets:
            packet_lines.extend([
                f"## {packet['packetId']}",
                "",
                f"Open `{packet['contactSheet']['relativePath']}` with an image-viewing tool.",
                "",
                "Inspect the original PNG before selecting it, modifying a working copy, or treating it as a style reference.",
                "",
                *[f"- `{path}`" for path in packet["sourcePaths"]],
                "",
            ])
        review_path.write_text(
            "# RAW_ART visual review queue\n\n"
            "Review every packet. Technical metrics and filenames are not semantic or creative authority. "
            "Record subject, role, style traits, continuity family, usability, provenance status and any required repair. "
            "Never modify an original in RAW_ART; create a reviewed working copy first.\n\n"
            + "\n".join(packet_lines),
            encoding="utf-8",
            newline="\n",
        )

        review_artifacts, review_intelligence = write_review_intelligence(
            temp_root,
            args.project_id,
            args.generated_at,
            records,
            packets,
        )

        values = [record["visualEvidence"]["meanLuminance"] for record in records]
        manifest: dict[str, Any] = {
            "schema": SCHEMA,
            "projectId": args.project_id,
            "generatedAt": args.generated_at,
            "sourceRootLabel": raw_root.name,
            "sourceRootPathIncluded": False,
            "policy": {
                "originalsReadOnly": True,
                "previewsAreDisposableDerivatives": True,
                "semanticInferenceAuthoritative": False,
                "visualInspectionRequired": True,
                "originalInspectionRequiredBeforeSelectionOrEdit": True,
                "ownerIntentPrior": OWNER_INTENT_PRIOR,
                "authority": AUTHORITY,
            },
            "totals": {
                "pngFiles": len(records),
                "sourceBytes": sum(record["sourceBytes"] for record in records),
                "contactSheets": len(packets),
                "warnings": sum(warnings.values()),
            },
            "aggregateVisualEvidence": {
                "dimensionFamilies": dict(sorted(dimensions.items(), key=lambda item: (-item[1], item[0]))),
                "modes": dict(sorted(modes.items())),
                "warningCounts": dict(sorted(warnings.items())),
                "meanLuminance": round(statistics.fmean(values), 4),
                "luminanceDeviationAcrossImages": round(statistics.pstdev(values), 4) if len(values) > 1 else 0.0,
                "exactDuplicateGroups": [paths for paths in exact_groups.values() if len(paths) > 1],
                "identicalDHashGroups": [paths for paths in perceptual_groups.values() if len(paths) > 1],
                "semanticInferenceAuthoritative": False,
            },
            "visualReviewIntelligence": {
                "sourceSetSha256": review_intelligence["sourceSetSha256"],
                "technicalVisualFamilies": review_intelligence["technicalVisualFamilies"],
                "sequenceAndVariantCandidates": review_intelligence["sequenceAndVariantCandidates"],
                "semanticStyleAuthority": False,
                "frameOrderAuthority": False,
            },
            "files": records,
            "reviewPackets": packets,
            "artifacts": {
                "htmlGallery": file_artifact(index_path, temp_root),
                "agentReviewQueue": file_artifact(review_path, temp_root),
                **review_artifacts,
            },
        }
        manifest["manifestSha256"] = manifest_hash(manifest)
        manifest_path = temp_root / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8", newline="\n")

        for relative_path, expected in originals_before.items():
            actual = stable_source_identity(raw_root / relative_path)
            if actual != expected:
                raise CatalogError(f"RAW_ART source drifted during catalog build: {relative_path}")

        temp_root.rename(output_root)
        return {
            "status": "built",
            "schema": SCHEMA,
            "projectId": args.project_id,
            "outputRoot": str(output_root),
            "manifestPath": str(output_root / "manifest.json"),
            "galleryPath": str(output_root / "index.html"),
            "reviewQueuePath": str(output_root / "AGENT_REVIEW_QUEUE.md"),
            "agentContextPath": str(output_root / "AGENT_VISUAL_CONTEXT.md"),
            "reviewWorkbookPath": str(output_root / "RAW_ART_REVIEW_WORKBOOK.json"),
            "groupReviewQueuePath": str(output_root / "GROUP_REVIEW_QUEUE.md"),
            "contactSheetPaths": [str(output_root / packet["contactSheet"]["relativePath"]) for packet in packets],
            "manifestSha256": manifest["manifestSha256"],
            "totals": manifest["totals"],
            "sourceMutation": False,
        }
    except Exception:
        shutil.rmtree(temp_root, ignore_errors=True)
        raise


def verify_catalog(args: argparse.Namespace) -> dict[str, Any]:
    output_root = resolve_existing_directory(args.output_root, "outputRoot")
    manifest_path = output_root / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as error:
        raise CatalogError(f"Visual catalog manifest is unreadable: {error}") from error
    if manifest.get("schema") != SCHEMA or manifest_hash(manifest) != manifest.get("manifestSha256"):
        raise CatalogError("Visual catalog manifest schema or self-hash differs")

    artifacts: list[dict[str, Any]] = list(manifest["artifacts"].values())
    artifacts.extend(record["preview"] for record in manifest.get("files", []))
    artifacts.extend(packet["contactSheet"] for packet in manifest.get("reviewPackets", []))
    seen: set[str] = set()
    for artifact in artifacts:
        relative_path = artifact["relativePath"]
        if relative_path in seen:
            continue
        seen.add(relative_path)
        target = (output_root / relative_path).resolve(strict=True)
        if not is_within(output_root, target) or target.is_symlink() or not target.is_file():
            raise CatalogError(f"Catalog artifact escapes or is invalid: {relative_path}")
        if target.stat().st_size != artifact["bytes"] or sha256_file(target) != artifact["sha256"]:
            raise CatalogError(f"Catalog artifact identity differs: {relative_path}")

    sources_verified = 0
    if args.raw_art_root:
        raw_root = resolve_existing_directory(args.raw_art_root, "rawArtRoot")
        assert_disjoint(raw_root, output_root)
        for record in manifest.get("files", []):
            target = (raw_root / record["relativePath"]).resolve(strict=True)
            if not is_within(raw_root, target):
                raise CatalogError(f"Source path escapes RAW_ART: {record['relativePath']}")
            digest, byte_count = stable_source_identity(target)
            if digest != record["sourceSha256"] or byte_count != record["sourceBytes"]:
                raise CatalogError(f"RAW_ART source identity differs: {record['relativePath']}")
            sources_verified += 1

    return {
        "schema": VERIFY_SCHEMA,
        "status": "passed",
        "outputRoot": str(output_root),
        "manifestSha256": manifest["manifestSha256"],
        "artifactsVerified": len(seen),
        "sourcesVerified": sources_verified,
        "sourceMutation": False,
    }


def inspect_catalog(args: argparse.Namespace) -> dict[str, Any]:
    verification = verify_catalog(argparse.Namespace(output_root=args.output_root, raw_art_root=None))
    output_root = resolve_existing_directory(args.output_root, "outputRoot")
    manifest = json.loads((output_root / "manifest.json").read_text(encoding="utf-8"))
    artifacts = manifest["artifacts"]
    intelligence = manifest.get("visualReviewIntelligence", {})
    contact_sheets = [str(output_root / packet["contactSheet"]["relativePath"]) for packet in manifest.get("reviewPackets", [])]
    result: dict[str, Any] = {
        "schema": INSPECTION_SCHEMA,
        "status": "inspectable",
        "projectId": manifest["projectId"],
        "manifestSha256": manifest["manifestSha256"],
        "sourceSetSha256": intelligence.get("sourceSetSha256"),
        "ownerIntentPrior": manifest["policy"].get("ownerIntentPrior", OWNER_INTENT_PRIOR),
        "totals": manifest["totals"],
        "paths": {
            "htmlGallery": str(output_root / artifacts["htmlGallery"]["relativePath"]),
            "agentReviewQueue": str(output_root / artifacts["agentReviewQueue"]["relativePath"]),
            "agentVisualContext": str(output_root / artifacts["agentVisualContext"]["relativePath"]),
            "reviewWorkbook": str(output_root / artifacts["reviewWorkbook"]["relativePath"]),
            "groupReviewQueue": str(output_root / artifacts["groupReviewQueue"]["relativePath"]),
            "contactSheets": contact_sheets,
        },
        "technicalVisualFamilies": intelligence.get("technicalVisualFamilies", [])[: args.maximum_groups],
        "sequenceAndVariantCandidates": intelligence.get("sequenceAndVariantCandidates", [])[: args.maximum_groups],
        "groupsTruncated": (
            len(intelligence.get("technicalVisualFamilies", [])) > args.maximum_groups
            or len(intelligence.get("sequenceAndVariantCandidates", [])) > args.maximum_groups
        ),
        "imageBytesIncluded": False,
        "openReturnedPathsWithImageViewer": True,
        "generatedWorkbookIsImmutableEvidence": True,
        "copyWorkbookBeforeRecordingDecisions": True,
        "artifactVerification": verification,
        "authority": AUTHORITY,
    }
    if args.relative_path:
        records = {record["relativePath"]: record for record in manifest.get("files", [])}
        record = records.get(args.relative_path)
        if record is None:
            raise CatalogError(f"relativePath is not present in the catalog: {args.relative_path}")
        packet = next(packet for packet in manifest["reviewPackets"] if args.relative_path in packet["sourcePaths"])
        item = {
            "relativePath": record["relativePath"],
            "sourceSha256": record["sourceSha256"],
            "sourceBytes": record["sourceBytes"],
            "dimensions": {"width": record["width"], "height": record["height"]},
            "alpha": record["alpha"],
            "visualEvidence": record["visualEvidence"],
            "warnings": record["warnings"],
            "previewPath": str(output_root / record["preview"]["relativePath"]),
            "contactSheetPath": str(output_root / packet["contactSheet"]["relativePath"]),
            "originalInspectionRequired": True,
            "sourceVerified": False,
        }
        if args.raw_art_root:
            raw_root = resolve_existing_directory(args.raw_art_root, "rawArtRoot")
            assert_disjoint(raw_root, output_root)
            original = (raw_root / record["relativePath"]).resolve(strict=True)
            if not is_within(raw_root, original):
                raise CatalogError(f"Source path escapes RAW_ART: {record['relativePath']}")
            digest, byte_count = stable_source_identity(original)
            if digest != record["sourceSha256"] or byte_count != record["sourceBytes"]:
                raise CatalogError(f"RAW_ART source identity differs: {record['relativePath']}")
            item["originalPath"] = str(original)
            item["sourceVerified"] = True
        result["item"] = item
    elif args.raw_art_root:
        raise CatalogError("rawArtRoot is accepted only with relativePath; use verify to revalidate every source")
    return result


def canonical_timestamp(value: str | None) -> str:
    if value:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
            raise CatalogError("generatedAt must be an ISO-8601 UTC timestamp")
        return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    commands = value.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build", help="Create a new immutable visual review catalog")
    build.add_argument("--raw-art-root", required=True)
    build.add_argument("--output-root", required=True)
    build.add_argument("--project-id", default="raw-art-project")
    build.add_argument("--generated-at")
    build.add_argument("--packet-size", type=int, default=20)
    build.add_argument("--thumbnail-size", type=int, default=256)
    build.add_argument("--maximum-files", type=int, default=100_000)
    build.add_argument("--maximum-bytes", type=int, default=64 * 1024**3)
    build.add_argument("--maximum-pixels", type=int, default=250_000_000)
    verify = commands.add_parser("verify", help="Verify catalog artifacts and optionally source identities")
    verify.add_argument("--output-root", required=True)
    verify.add_argument("--raw-art-root")
    inspect = commands.add_parser("inspect", help="Return agent context paths, visual groups and an optional full-resolution source path")
    inspect.add_argument("--output-root", required=True)
    inspect.add_argument("--raw-art-root")
    inspect.add_argument("--relative-path")
    inspect.add_argument("--maximum-groups", type=int, default=50, choices=range(1, 101))
    return value


def main(argv: Iterable[str] | None = None) -> int:
    try:
        args = parser().parse_args(list(argv) if argv is not None else None)
        if args.command == "build":
            args.generated_at = canonical_timestamp(args.generated_at)
            result = build_catalog(args)
        elif args.command == "verify":
            result = verify_catalog(args)
        else:
            result = inspect_catalog(args)
        sys.stdout.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n")
        return 0
    except Exception as error:
        sys.stderr.write(f"RAW_ART_VISUAL_CATALOG_ERROR: {error}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
