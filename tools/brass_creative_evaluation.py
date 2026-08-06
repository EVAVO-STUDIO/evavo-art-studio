#!/usr/bin/env python3
"""Provider-neutral Brass & Brine static and animation creative QA primitives."""
from __future__ import annotations

import hashlib
import io
import json
import os
import stat
import tempfile
from pathlib import Path
from statistics import median
from typing import Any, Iterable

from PIL import Image, ImageChops, ImageDraw, ImageOps, ImageStat

CONTRACT_ID = "evavo.brass-creative-evaluation.v1"
GAME_CONTRACT_ID = "evavo.brass-brine.art-direction-animation.v1"
STYLE_BANK_SCHEMA = "evavo.image-style-reference-bank.v1"
STATIC_SCHEMA = "evavo.brass-creative-candidate-evaluation.v1"
ANIMATION_MANIFEST_SCHEMA = "evavo.brass-brine.animation-sequence-manifest.v1"
ANIMATION_SCHEMA = "evavo.brass-animation-sequence-evaluation.v1"
HEX64 = set("0123456789abcdef")
RESAMPLE = getattr(Image, "Resampling", Image).LANCZOS
REQUIRED_EVIDENCE_REQUIREMENTS = (
    "exactGameContractBinding",
    "exactCandidateBytes",
    "descriptorBoundSourceReads",
    "decodedPixelsFromRetainedSourceBytes",
    "singleFrameSourceImagesOnly",
    "atomicCreateOnlyEvidencePublication",
    "publishedEvidenceByteVerification",
)


def fail(message: str) -> None:
    raise ValueError(message)


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def valid_sha(value: Any) -> str:
    text = str(value or "").strip().lower()
    if len(text) != 64 or any(char not in HEX64 for char in text):
        fail("expected exact SHA-256")
    return text


def _identity(value: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _assert_no_symlink_components(path: Path) -> Path:
    absolute = Path(os.path.abspath(os.fspath(path)))
    parts = absolute.parts
    current = Path(parts[0]) if parts else absolute
    for part in parts[1:]:
        current /= part
        metadata = os.lstat(current)
        if stat.S_ISLNK(metadata.st_mode):
            fail(f"symlinked path component is not allowed: {current}")
    return absolute


def stable_bytes(path: Path, maximum: int) -> bytes:
    if not isinstance(maximum, int) or isinstance(maximum, bool) or maximum < 0:
        fail("maximum byte policy must be a non-negative integer")
    absolute = _assert_no_symlink_components(path)
    before_path = os.stat(absolute, follow_symlinks=False)
    if not stat.S_ISREG(before_path.st_mode):
        fail(f"not a regular file: {path}")
    if before_path.st_size > maximum:
        fail(f"file exceeds maximum bytes: {absolute}")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(absolute, flags)
    try:
        before_descriptor = os.fstat(descriptor)
        if _identity(before_descriptor) != _identity(before_path):
            fail(f"file identity changed before descriptor read: {absolute}")
        chunks: list[bytes] = []
        remaining = before_descriptor.st_size
        while remaining:
            chunk = os.read(descriptor, min(1024 * 1024, remaining))
            if not chunk:
                fail(f"file was truncated while being read: {absolute}")
            chunks.append(chunk)
            remaining -= len(chunk)
        if os.read(descriptor, 1):
            fail(f"file grew while being read: {absolute}")
        after_descriptor = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    after_path = os.stat(absolute, follow_symlinks=False)
    if (
        _identity(before_descriptor) != _identity(after_descriptor)
        or _identity(before_path) != _identity(after_path)
    ):
        fail(f"file changed while being read: {absolute}")
    data = b"".join(chunks)
    if len(data) != before_descriptor.st_size:
        fail(f"file byte count changed while being read: {absolute}")
    return data


def read_object(path: Path, maximum: int) -> tuple[dict[str, Any], bytes]:
    data = stable_bytes(path, maximum)
    value = json.loads(data.decode("utf-8-sig"))
    if not isinstance(value, dict):
        fail(f"JSON root is not an object: {path}")
    return value, data


def resolve_inside(root: Path, relative: str, label: str) -> Path:
    if not isinstance(relative, str) or not relative.strip():
        fail(f"{label} path is required")
    value = Path(relative)
    if value.is_absolute() or ".." in value.parts:
        fail(f"{label} escaped approved root: {relative}")
    root_absolute = _assert_no_symlink_components(root)
    root_resolved = root_absolute.resolve(strict=True)
    candidate_unresolved = root_resolved / value
    _assert_no_symlink_components(candidate_unresolved)
    candidate = candidate_unresolved.resolve(strict=True)
    try:
        candidate.relative_to(root_resolved)
    except ValueError as error:
        raise ValueError(f"{label} escaped approved root: {relative}") from error
    if not candidate.is_file():
        fail(f"{label} is not a regular file: {candidate}")
    return candidate


def decode_rgba(data: bytes, maximum_pixels: int, label: str = "image") -> Image.Image:
    if not isinstance(maximum_pixels, int) or isinstance(maximum_pixels, bool) or maximum_pixels < 1:
        fail("maximum decoded-pixel policy must be a positive integer")
    with Image.open(io.BytesIO(data)) as opened:
        if int(getattr(opened, "n_frames", 1)) != 1:
            fail(f"multi-frame image is not allowed: {label}")
        width, height = opened.size
        if width < 1 or height < 1 or width * height > maximum_pixels:
            fail(f"decoded image exceeds pixel policy: {label}")
        image = ImageOps.exif_transpose(opened)
        image.load()
        return image.convert("RGBA")


def read_rgba(path: Path, maximum_bytes: int, maximum_pixels: int) -> tuple[Image.Image, bytes]:
    data = stable_bytes(path, maximum_bytes)
    return decode_rgba(data, maximum_pixels, str(path)), data


def load_rgba(path: Path, maximum_pixels: int) -> Image.Image:
    image, _ = read_rgba(path, 2_147_483_648, maximum_pixels)
    return image


def file_sha(path: Path, maximum: int) -> tuple[str, int]:
    data = stable_bytes(path, maximum)
    return hashlib.sha256(data).hexdigest(), len(data)


def active_mask(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    if sum(histogram[:255]) > 0:
        return alpha.point(lambda value: 255 if value > 8 else 0, mode="1")
    rgb = image.convert("RGB")
    corners = [rgb.getpixel(point) for point in ((0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1))]
    background = tuple(int(median(channel)) for channel in zip(*corners))
    flat = Image.new("RGB", rgb.size, background)
    return ImageChops.difference(rgb, flat).convert("L").point(lambda value: 255 if value > 18 else 0, mode="1")


def perceptual_dhash(image: Image.Image) -> str:
    gray = image.convert("L").resize((9, 8), RESAMPLE)
    pixels = list(gray.getdata())
    value = 0
    for row in range(8):
        start = row * 9
        for column in range(8):
            value = (value << 1) | int(pixels[start + column] > pixels[start + column + 1])
    return f"{value:016x}"


def hamming(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def image_features(image: Image.Image) -> dict[str, Any]:
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    total = max(1, image.width * image.height)
    transparent = histogram[0]
    opaque = histogram[255]
    partial = total - transparent - opaque
    mask = active_mask(image)
    bbox = mask.getbbox()
    active_ratio = ImageStat.Stat(mask.convert("L")).mean[0] / 255.0
    if bbox:
        left, top, right, bottom = bbox
        bounds = [left / mask.width, top / mask.height, right / mask.width, bottom / mask.height]
    else:
        bounds = [0.0, 0.0, 0.0, 0.0]
    preview = image.copy()
    preview.thumbnail((256, 256), RESAMPLE)
    luminance = preview.convert("L")
    luminance_stats = ImageStat.Stat(luminance)
    red = 0
    for r, g, b, a in preview.getdata():
        if a > 8 and r >= 72 and r >= g * 1.35 and r >= b * 1.35 and r - min(g, b) >= 28:
            red += 1
    red_ratio = red / max(1, preview.width * preview.height)
    return {
        "width": image.width,
        "height": image.height,
        "aspectRatio": image.width / image.height,
        "alpha": {
            "transparentRatio": transparent / total,
            "partialRatio": partial / total,
            "opaqueRatio": opaque / total,
            "meaningfulAlpha": transparent > 0 or partial > 0,
            "fullyTransparent": transparent == total,
            "fullyOpaque": opaque == total,
        },
        "activeRatio": active_ratio,
        "activeBounds": bounds,
        "luminanceMean": luminance_stats.mean[0],
        "luminanceDeviation": luminance_stats.stddev[0],
        "redAccentRatio": red_ratio,
        "dhash": perceptual_dhash(image),
    }


def profile_style_distance(features: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    scalars = profile.get("scalars")
    if not isinstance(scalars, dict):
        return {"score": None, "components": {}, "reason": "role-profile-has-no-scalars"}
    components: dict[str, float] = {}
    denominators = {
        "aspectRatio": max(0.25, float(features["aspectRatio"])),
        "luminanceMean": 255.0,
        "luminanceDeviation": 128.0,
        "redAccentRatio": 0.25,
        "activeRatio": 1.0,
    }
    for name, denominator in denominators.items():
        record = scalars.get(name)
        if isinstance(record, dict) and isinstance(record.get("median"), (int, float)):
            components[name] = min(1.0, abs(float(features[name]) - float(record["median"])) / denominator)
    if not components:
        return {"score": None, "components": {}, "reason": "role-profile-has-no-compatible-scalars"}
    weights = {"aspectRatio": 0.12, "luminanceMean": 0.22, "luminanceDeviation": 0.24, "redAccentRatio": 0.18, "activeRatio": 0.24}
    denominator = sum(weights[name] for name in components)
    score = sum(components[name] * weights[name] for name in components) / max(denominator, 1e-9)
    hashes: Iterable[str] = profile.get("referenceDhashes", [])
    distances = [hamming(features["dhash"], value) for value in hashes if isinstance(value, str) and len(value) == 16]
    return {"score": score, "components": components, "nearestReferenceDhashDistance": min(distances) if distances else None}


def _fsync_directory(directory: Path) -> None:
    if os.name == "nt":
        return
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_CLOEXEC", 0)
    descriptor = os.open(directory, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _publish_temporary(temporary: Path, path: Path, replace: bool, label: str) -> None:
    if replace:
        os.replace(temporary, path)
    else:
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError as error:
            raise ValueError(f"{label} already exists: {path}") from error
        temporary.unlink()
    _fsync_directory(path.parent)


def _verify_published_bytes(path: Path, expected_sha256: str, expected_size: int) -> None:
    published = stable_bytes(path, expected_size)
    if len(published) != expected_size or hashlib.sha256(published).hexdigest() != expected_sha256:
        fail(f"published evidence differs from the exact staged bytes: {path}")


def atomic_json(path: Path, value: dict[str, Any], replace: bool = False) -> tuple[str, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w+", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
            handle.seek(0)
            payload = handle.read().encode("utf-8")
        digest = hashlib.sha256(payload).hexdigest()
        size = len(payload)
        _publish_temporary(temporary, path, replace, "output")
        _verify_published_bytes(path, digest, size)
        return digest, size
    finally:
        temporary.unlink(missing_ok=True)


def atomic_image(path: Path, image: Image.Image, replace: bool = False) -> tuple[str, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".png", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w+b") as handle:
            image.save(handle, format="PNG", optimize=True)
            handle.flush()
            os.fsync(handle.fileno())
            handle.seek(0)
            payload = handle.read()
        digest = hashlib.sha256(payload).hexdigest()
        size = len(payload)
        _publish_temporary(temporary, path, replace, "evidence image")
        _verify_published_bytes(path, digest, size)
        return digest, size
    finally:
        temporary.unlink(missing_ok=True)


def contact_sheet_runtime_scales(image: Image.Image, scales: list[float]) -> Image.Image:
    blocks = []
    for scale in scales:
        width = max(1, round(image.width * scale))
        height = max(1, round(image.height * scale))
        resized = image.resize((width, height), RESAMPLE)
        block = Image.new("RGBA", (max(160, width + 24), max(160, height + 48)), (48, 48, 48, 255))
        block.alpha_composite(resized, ((block.width - width) // 2, 24))
        ImageDraw.Draw(block).text((8, 6), f"{scale:g}x {width}x{height}", fill=(255, 255, 255, 255))
        blocks.append(block)
    output = Image.new("RGBA", (sum(block.width for block in blocks), max(block.height for block in blocks)), (24, 24, 24, 255))
    cursor = 0
    for block in blocks:
        output.alpha_composite(block, (cursor, 0))
        cursor += block.width
    return output


def contact_sheet_mattes(image: Image.Image, mattes: list[tuple[str, tuple[int, int, int]]]) -> Image.Image:
    maximum = 320
    preview = image.copy()
    preview.thumbnail((maximum, maximum), RESAMPLE)
    blocks = []
    for name, rgb in mattes:
        block = Image.new("RGBA", (maximum + 24, maximum + 48), (*rgb, 255))
        block.alpha_composite(preview, ((block.width - preview.width) // 2, 24 + (maximum - preview.height) // 2))
        text_fill = (255, 255, 255, 255) if sum(rgb) < 360 else (0, 0, 0, 255)
        ImageDraw.Draw(block).text((8, 6), name, fill=text_fill)
        blocks.append(block)
    output = Image.new("RGBA", (sum(block.width for block in blocks), max(block.height for block in blocks)), (0, 0, 0, 255))
    cursor = 0
    for block in blocks:
        output.alpha_composite(block, (cursor, 0))
        cursor += block.width
    return output


def load_contracts(repo: Path, game_root: Path, art_contract_relative: str) -> tuple[dict[str, Any], bytes, dict[str, Any], bytes]:
    evaluation, evaluation_bytes = read_object(repo / "config" / "brass-creative-evaluation.v1.json", 1024 * 1024)
    if evaluation.get("schemaVersion") != "1.1" or evaluation.get("contract") != CONTRACT_ID:
        fail("unexpected creative evaluation contract")
    requirements = evaluation.get("requirements")
    if not isinstance(requirements, dict):
        fail("creative evaluation requirements are missing")
    for requirement in REQUIRED_EVIDENCE_REQUIREMENTS:
        if requirements.get(requirement) is not True:
            fail(f"creative evaluation requirement is not enabled: {requirement}")
    game_path = resolve_inside(game_root, art_contract_relative, "game art-direction contract")
    game, game_bytes = read_object(game_path, int(evaluation["limits"]["maximumJsonBytes"]))
    if game.get("contract") != GAME_CONTRACT_ID:
        fail("unexpected game art-direction contract")
    return evaluation, evaluation_bytes, game, game_bytes


def load_style_bank(path: Path, maximum: int, role: str) -> tuple[dict[str, Any], bytes, dict[str, Any]]:
    bank, bank_bytes = read_object(path, maximum)
    if bank.get("schema") != STYLE_BANK_SCHEMA:
        fail("unexpected style-bank schema")
    profiles = bank.get("roleProfiles")
    if not isinstance(profiles, dict) or not isinstance(profiles.get(role), dict):
        fail(f"style bank lacks role profile: {role}")
    return bank, bank_bytes, profiles[role]


def report_hash(report: dict[str, Any], key: str) -> dict[str, Any]:
    unhashed = dict(report)
    unhashed.pop(key, None)
    report[key] = sha256_json(unhashed)
    report["runId"] = report[key][:20]
    return report
