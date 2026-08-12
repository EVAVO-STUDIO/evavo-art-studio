"""Deterministic bitmap-title compositor for EVAVO Pixel Font Studio.

Pixel Text Studio consumes canonical AngelCode BMFont + RGBA PNG output from
Pixel Font Studio and produces pixel-perfect static or animated text/title
assets.  Font masters stay authoritative; title treatments are independent,
reusable data profiles.
"""
from __future__ import annotations

from dataclasses import dataclass
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import zlib
from typing import Any, Mapping, Sequence

from pixel_font_universal.common import (
    PixelFontUniversalError,
    PixelMap,
    RGBA,
    TRANSPARENT,
    alpha_composite,
    boolean,
    bounded_int,
    canonical_json,
    colour_hex,
    fail,
    merge_maps,
    parse_colour,
    pretty_json,
    safe_id,
    sha256_bytes,
    sha256_file,
    text as bounded_text,
)
from pixel_font_universal.formats import decode_png, parse_bmfont, png_rgba
from pixel_font_universal.operations import BUILTIN_OPERATIONS, OperationContext

ENGINE_VERSION = "1.0.0"
STYLE_SCHEMA = "evavo.pixel-text-style.v1"
BUILD_SCHEMA = "evavo.pixel-text-build.v1"
VALIDATION_SCHEMA = "evavo.pixel-text-validation.v1"
CATALOG_SCHEMA = "evavo.pixel-text-catalog.v1"
MAX_TEXT_LENGTH = 4096
MAX_FRAMES = 256
MAX_CANVAS_EDGE = 8192
MAX_PIXELS = 64 * 1024 * 1024
MAX_OPERATIONS = 48
MAX_MOTIONS = 16

TITLE_OPERATIONS = frozenset({"bands", "extrude", "bevel", "taper", "plate"})
TITLE_MOTIONS = frozenset({"wave", "jitter", "shine", "sparkle", "palette-cycle", "blink", "type-on"})
ALLOWED_OPERATIONS = frozenset(BUILTIN_OPERATIONS) | TITLE_OPERATIONS


@dataclass(frozen=True)
class BitmapGlyph:
    codepoint: int
    width: int
    height: int
    xoffset: int
    yoffset: int
    xadvance: int
    pixels: PixelMap


@dataclass(frozen=True)
class BitmapFont:
    path: Path
    line_height: int
    baseline: int
    glyphs: Mapping[int, BitmapGlyph]
    kernings: Mapping[tuple[int, int], int]
    page_paths: tuple[Path, ...]
    descriptor_sha256: str
    page_sha256: tuple[str, ...]


@dataclass(frozen=True)
class Placement:
    index: int
    codepoint: int
    glyph: BitmapGlyph
    x: int
    y: int



def _paeth(a: int, b: int, c: int) -> int:
    estimate = a + b - c
    pa = abs(estimate - a)
    pb = abs(estimate - b)
    pc = abs(estimate - c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c


def decode_rgba_png(data: bytes, label: str) -> tuple[int, int, bytes]:
    """Decode ordinary non-interlaced 8-bit RGBA PNGs with filters 0..4."""
    signature = b"\x89PNG\r\n\x1a\n"
    if not data.startswith(signature):
        fail(f"{label} is not a PNG")
    offset = len(signature)
    width = height = None
    compressed = bytearray()
    saw_end = False
    while offset < len(data):
        if offset + 12 > len(data):
            fail(f"{label} has a truncated PNG chunk")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        end = offset + 12 + length
        if length > 128 * 1024 * 1024 or end > len(data):
            fail(f"{label} has an invalid PNG chunk length")
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        stored_crc = struct.unpack(">I", data[offset + 8 + length:end])[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != stored_crc:
            fail(f"{label} PNG chunk CRC mismatch")
        offset = end
        if kind == b"IHDR":
            if length != 13:
                fail(f"{label} has an invalid PNG IHDR")
            width, height, depth, colour, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if (depth, colour, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                fail(f"{label} must be an 8-bit RGBA non-interlaced PNG")
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            if length != 0:
                fail(f"{label} has an invalid PNG IEND")
            saw_end = True
            break
        elif kind[0] & 0x20 == 0:
            fail(f"{label} contains unsupported critical PNG chunk {kind!r}")
    if width is None or height is None or not saw_end or offset != len(data):
        fail(f"{label} PNG framing is incomplete or has trailing data")
    try:
        raw = zlib.decompress(bytes(compressed))
    except zlib.error as exc:
        fail(f"{label} PNG IDAT stream is invalid: {exc}")
    stride = width * 4
    if len(raw) != height * (stride + 1):
        fail(f"{label} PNG decoded length mismatch")
    rows: list[bytes] = []
    previous = bytearray(stride)
    for y in range(height):
        row = raw[y * (stride + 1):(y + 1) * (stride + 1)]
        filter_type = row[0]
        source = row[1:]
        if filter_type > 4:
            fail(f"{label} PNG uses invalid filter {filter_type}")
        recon = bytearray(stride)
        for i, value in enumerate(source):
            left = recon[i - 4] if i >= 4 else 0
            up = previous[i]
            upper_left = previous[i - 4] if i >= 4 else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = up
            elif filter_type == 3:
                predictor = (left + up) // 2
            else:
                predictor = _paeth(left, up, upper_left)
            recon[i] = (value + predictor) & 0xFF
        rows.append(bytes(recon))
        previous = recon
    return width, height, b"".join(rows)

def _load_json(path: Path, label: str) -> Any:
    if not path.is_file() or path.is_symlink():
        fail(f"{label} must be a regular non-symlink file: {path}")
    if path.stat().st_size > 16 * 1024 * 1024:
        fail(f"{label} exceeds the 16 MiB limit")
    try:
        return json.loads(path.read_text("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"{label} is not valid UTF-8 JSON: {exc}")


def _padding(value: Any, label: str) -> dict[str, int]:
    if isinstance(value, int) and not isinstance(value, bool):
        amount = bounded_int(value, label, 0, 512)
        return {"top": amount, "right": amount, "bottom": amount, "left": amount}
    if not isinstance(value, dict):
        fail(f"{label} must be an integer or object")
    return {
        side: bounded_int(value.get(side, 0), f"{label}.{side}", 0, 512)
        for side in ("top", "right", "bottom", "left")
    }


def _colour_list(value: Any, label: str, *, minimum: int = 1, maximum: int = 32) -> list[str]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        fail(f"{label} must contain {minimum}..{maximum} colours")
    return [colour_hex(parse_colour(item, f"{label}[{index}]")) for index, item in enumerate(value)]


def normalise_style(value: Any, *, label: str = "pixel text style") -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("schema") != STYLE_SCHEMA:
        fail(f"{label}.schema must be {STYLE_SCHEMA}")
    style_id = safe_id(value.get("styleId"), f"{label}.styleId")
    layout_raw = value.get("layout", {})
    if not isinstance(layout_raw, dict):
        fail(f"{label}.layout must be an object")
    align = layout_raw.get("align", "left")
    if align not in {"left", "center", "right"}:
        fail(f"{label}.layout.align must be left, center or right")
    missing = layout_raw.get("missingGlyph", "error")
    if missing not in {"error", "replace", "skip"}:
        fail(f"{label}.layout.missingGlyph must be error, replace or skip")
    replacement = layout_raw.get("replacementCodepoint", 0xFFFD)
    replacement = bounded_int(replacement, f"{label}.layout.replacementCodepoint", 0, 0x10FFFF)
    canvas_raw = value.get("canvas", {})
    if not isinstance(canvas_raw, dict):
        fail(f"{label}.canvas must be an object")
    canvas_anchor = canvas_raw.get("anchor", "center")
    if canvas_anchor not in {"center", "top-left"}:
        fail(f"{label}.canvas.anchor must be center or top-left")
    width = bounded_int(canvas_raw.get("width", 0), f"{label}.canvas.width", 0, MAX_CANVAS_EDGE)
    height = bounded_int(canvas_raw.get("height", 0), f"{label}.canvas.height", 0, MAX_CANVAS_EDGE)

    operations_raw = value.get("operations", [])
    if not isinstance(operations_raw, list) or len(operations_raw) > MAX_OPERATIONS:
        fail(f"{label}.operations must contain at most {MAX_OPERATIONS} entries")
    operations: list[dict[str, Any]] = []
    for index, raw in enumerate(operations_raw):
        if not isinstance(raw, dict):
            fail(f"{label}.operations[{index}] must be an object")
        name = safe_id(raw.get("op"), f"{label}.operations[{index}].op")
        if name not in ALLOWED_OPERATIONS:
            fail(f"{label}.operations[{index}].op {name!r} is not supported")
        item = {"op": name, **{key: raw[key] for key in sorted(raw) if key != "op"}}
        if name == "bands":
            item["colours"] = _colour_list(raw.get("colours", raw.get("colors")), f"{label}.operations[{index}].colours", minimum=2)
            axis = raw.get("axis", "vertical")
            if axis not in {"vertical", "horizontal"}:
                fail(f"{label}.operations[{index}].axis must be vertical or horizontal")
            item["axis"] = axis
            item["bandHeight"] = bounded_int(raw.get("bandHeight", 0), f"{label}.operations[{index}].bandHeight", 0, 512)
            item["phase"] = bounded_int(raw.get("phase", 0), f"{label}.operations[{index}].phase", -4096, 4096)
            item["phasePerFrame"] = bounded_int(raw.get("phasePerFrame", 0), f"{label}.operations[{index}].phasePerFrame", -64, 64)
        elif name == "extrude":
            item["depth"] = bounded_int(raw.get("depth", 2), f"{label}.operations[{index}].depth", 1, 64)
            item["dx"] = bounded_int(raw.get("dx", 1), f"{label}.operations[{index}].dx", -16, 16)
            item["dy"] = bounded_int(raw.get("dy", 1), f"{label}.operations[{index}].dy", -16, 16)
            item["colours"] = _colour_list(raw.get("colours", raw.get("colors", ["#000000ff"])), f"{label}.operations[{index}].colours")
        elif name == "bevel":
            item["highlight"] = colour_hex(parse_colour(raw.get("highlight", "#ffffffff"), f"{label}.operations[{index}].highlight"))
            item["shadow"] = colour_hex(parse_colour(raw.get("shadow", "#000000ff"), f"{label}.operations[{index}].shadow"))
            item["dx"] = bounded_int(raw.get("dx", -1), f"{label}.operations[{index}].dx", -8, 8)
            item["dy"] = bounded_int(raw.get("dy", -1), f"{label}.operations[{index}].dy", -8, 8)
            if item["dx"] == 0 and item["dy"] == 0:
                fail(f"{label}.operations[{index}] bevel direction must be non-zero")
        elif name == "taper":
            item["topPercent"] = bounded_int(raw.get("topPercent", 100), f"{label}.operations[{index}].topPercent", 25, 400)
            item["bottomPercent"] = bounded_int(raw.get("bottomPercent", 100), f"{label}.operations[{index}].bottomPercent", 25, 400)
            anchor = raw.get("anchor", "center")
            if anchor not in {"left", "center", "right"}:
                fail(f"{label}.operations[{index}].anchor must be left, center or right")
            item["anchor"] = anchor
        elif name == "plate":
            item["fill"] = colour_hex(parse_colour(raw.get("fill", "#181018ff"), f"{label}.operations[{index}].fill"))
            item["border"] = colour_hex(parse_colour(raw.get("border", "#ffffffff"), f"{label}.operations[{index}].border"))
            item["padding"] = bounded_int(raw.get("padding", 2), f"{label}.operations[{index}].padding", 0, 64)
            item["borderWidth"] = bounded_int(raw.get("borderWidth", 1), f"{label}.operations[{index}].borderWidth", 0, 8)
            item["cornerCut"] = bounded_int(raw.get("cornerCut", 0), f"{label}.operations[{index}].cornerCut", 0, 32)
        operations.append(item)

    animation_raw = value.get("animation", {})
    if not isinstance(animation_raw, dict):
        fail(f"{label}.animation must be an object")
    frames = bounded_int(animation_raw.get("frames", 1), f"{label}.animation.frames", 1, MAX_FRAMES)
    fps = bounded_int(animation_raw.get("fps", 8), f"{label}.animation.fps", 1, 60)
    motions_raw = animation_raw.get("motions", [])
    if not isinstance(motions_raw, list) or len(motions_raw) > MAX_MOTIONS:
        fail(f"{label}.animation.motions must contain at most {MAX_MOTIONS} entries")
    motions: list[dict[str, Any]] = []
    for index, raw in enumerate(motions_raw):
        if not isinstance(raw, dict):
            fail(f"{label}.animation.motions[{index}] must be an object")
        name = safe_id(raw.get("op"), f"{label}.animation.motions[{index}].op")
        if name not in TITLE_MOTIONS:
            fail(f"{label}.animation.motions[{index}].op {name!r} is unsupported")
        item = {"op": name}
        if name == "wave":
            pattern = raw.get("pattern", [0, 1, 1, 0, -1, -1])
            if not isinstance(pattern, list) or not 2 <= len(pattern) <= 64:
                fail(f"{label}.animation.motions[{index}].pattern must contain 2..64 integer offsets")
            item["pattern"] = [bounded_int(v, f"{label}.animation.motions[{index}].pattern", -64, 64) for v in pattern]
            item["glyphPhase"] = bounded_int(raw.get("glyphPhase", 1), f"{label}.animation.motions[{index}].glyphPhase", -64, 64)
            item["framePhase"] = bounded_int(raw.get("framePhase", 1), f"{label}.animation.motions[{index}].framePhase", -64, 64)
        elif name == "jitter":
            item["x"] = bounded_int(raw.get("x", 1), f"{label}.animation.motions[{index}].x", 0, 16)
            item["y"] = bounded_int(raw.get("y", 1), f"{label}.animation.motions[{index}].y", 0, 16)
            item["seed"] = bounded_text(str(raw.get("seed", style_id)), f"{label}.animation.motions[{index}].seed", 256)
        elif name == "shine":
            item["colour"] = colour_hex(parse_colour(raw.get("colour", raw.get("color", "#ffffffff")), f"{label}.animation.motions[{index}].colour"))
            item["width"] = bounded_int(raw.get("width", 1), f"{label}.animation.motions[{index}].width", 1, 32)
            item["slope"] = bounded_int(raw.get("slope", 1), f"{label}.animation.motions[{index}].slope", -8, 8)
            item["alpha"] = bounded_int(raw.get("alpha", 255), f"{label}.animation.motions[{index}].alpha", 0, 255)
        elif name == "sparkle":
            item["colour"] = colour_hex(parse_colour(raw.get("colour", raw.get("color", "#ffffffff")), f"{label}.animation.motions[{index}].colour"))
            item["count"] = bounded_int(raw.get("count", 1), f"{label}.animation.motions[{index}].count", 1, 32)
            item["radius"] = bounded_int(raw.get("radius", 1), f"{label}.animation.motions[{index}].radius", 1, 4)
            item["seed"] = bounded_text(str(raw.get("seed", style_id)), f"{label}.animation.motions[{index}].seed", 256)
        elif name == "palette-cycle":
            item["colours"] = _colour_list(raw.get("colours", raw.get("colors")), f"{label}.animation.motions[{index}].colours", minimum=2)
            item["step"] = bounded_int(raw.get("step", 1), f"{label}.animation.motions[{index}].step", -32, 32)
        elif name == "blink":
            pattern = raw.get("pattern", [255, 255, 0, 255])
            if not isinstance(pattern, list) or not 1 <= len(pattern) <= 64:
                fail(f"{label}.animation.motions[{index}].pattern must contain 1..64 alpha values")
            item["pattern"] = [bounded_int(v, f"{label}.animation.motions[{index}].pattern", 0, 255) for v in pattern]
        elif name == "type-on":
            item["startFrame"] = bounded_int(raw.get("startFrame", 0), f"{label}.animation.motions[{index}].startFrame", 0, frames - 1)
            item["endFrame"] = bounded_int(raw.get("endFrame", frames - 1), f"{label}.animation.motions[{index}].endFrame", 0, frames - 1)
            if item["endFrame"] < item["startFrame"]:
                fail(f"{label}.animation.motions[{index}].endFrame must be >= startFrame")
        motions.append(item)

    output_raw = value.get("output", {})
    if not isinstance(output_raw, dict):
        fail(f"{label}.output must be an object")
    godot_root = output_raw.get("godotResourceRoot", "")
    if not isinstance(godot_root, str) or len(godot_root) > 1024:
        fail(f"{label}.output.godotResourceRoot must be text")
    if godot_root and (not godot_root.startswith("res://") or ".." in godot_root.split("/")):
        fail(f"{label}.output.godotResourceRoot must be an absolute res:// path without '..'")

    individual_frames = boolean(output_raw.get("individualFrames", True), f"{label}.output.individualFrames")
    sheet = boolean(output_raw.get("sheet", True), f"{label}.output.sheet")
    web_bundle = boolean(output_raw.get("webBundle", True), f"{label}.output.webBundle")
    if not individual_frames:
        fail(f"{label}.output.individualFrames must remain true so frame manifests, web bundles and Godot resources are self-contained")

    return {
        "schema": STYLE_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "styleId": style_id,
        "displayName": bounded_text(value.get("displayName", style_id), f"{label}.displayName", 256),
        "description": bounded_text(value.get("description", "Author-defined deterministic pixel text treatment."), f"{label}.description", 4096),
        "background": colour_hex(parse_colour(value.get("background", "#00000000"), f"{label}.background")),
        "padding": _padding(value.get("padding", 2), f"{label}.padding"),
        "layout": {
            "align": align,
            "tracking": bounded_int(layout_raw.get("tracking", 0), f"{label}.layout.tracking", -64, 128),
            "lineGap": bounded_int(layout_raw.get("lineGap", 0), f"{label}.layout.lineGap", -64, 256),
            "tabSpaces": bounded_int(layout_raw.get("tabSpaces", 4), f"{label}.layout.tabSpaces", 1, 16),
            "missingGlyph": missing,
            "replacementCodepoint": replacement,
        },
        "canvas": {"width": width, "height": height, "anchor": canvas_anchor},
        "operations": operations,
        "animation": {"frames": frames, "fps": fps, "loop": boolean(animation_raw.get("loop", True), f"{label}.animation.loop"), "motions": motions},
        "output": {
            "individualFrames": individual_frames,
            "sheet": sheet,
            "webBundle": web_bundle,
            "godotResourceRoot": godot_root.rstrip("/"),
        },
    }


BUILTIN_PRESETS: dict[str, dict[str, Any]] = {
    "dos-brass-title": {
        "operations": [
            {"op": "bands", "axis": "vertical", "colours": ["#fff0b0ff", "#d8a85cff", "#8e592fff", "#e5bd6aff", "#7a3f29ff"]},
            {"op": "bevel", "dx": -1, "dy": -1, "highlight": "#fff8d7ff", "shadow": "#5d2d22ff"},
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#160b12ff"},
            {"op": "extrude", "depth": 2, "dx": 1, "dy": 1, "colours": ["#6e4930ff", "#2d1420ff"]},
        ]
    },
    "arcade-chrome-title": {
        "operations": [
            {"op": "bands", "axis": "vertical", "colours": ["#dceeffff", "#7aa2c8ff", "#f8fbffff", "#3f678fff", "#bcd2e6ff", "#263c59ff"]},
            {"op": "bevel", "dx": -1, "dy": -1, "highlight": "#ffffffff", "shadow": "#10243cff"},
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#05070cff"},
            {"op": "extrude", "depth": 2, "dx": 1, "dy": 1, "colours": ["#29466aff", "#09101cff"]},
        ]
    },
    "fantasy-fire-title": {
        "operations": [
            {"op": "bands", "axis": "vertical", "colours": ["#fff2a3ff", "#ffbd42ff", "#e85a2dff", "#8f1e2dff"]},
            {"op": "bevel", "dx": -1, "dy": -1, "highlight": "#fff7c7ff", "shadow": "#621228ff"},
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#2b0b11ff"},
            {"op": "shadow", "dx": 2, "dy": 2, "colour": "#1c0810dd"},
        ],
        "animation": {"frames": 8, "fps": 8, "loop": True, "motions": [{"op": "shine", "colour": "#ffffffff", "width": 1, "slope": 1, "alpha": 220}, {"op": "sparkle", "colour": "#fff9d7ff", "count": 1, "radius": 1, "seed": "fantasy-fire"}]},
    },
    "strategy-ui-emboss": {
        "operations": [
            {"op": "shadow", "dx": 1, "dy": 1, "colour": "#08050dcc"},
            {"op": "recolour", "colour": "#d7c49aff"},
            {"op": "highlight", "dx": -1, "dy": -1, "colour": "#fff0c7ff"},
        ]
    },
    "cga-menu": {
        "operations": [
            {"op": "bands", "axis": "horizontal", "bandHeight": 2, "colours": ["#55ffffff", "#ff55ffff", "#ffffffff"]},
            {"op": "outline", "radius": 1, "connectivity": 4, "colour": "#000000ff"},
        ]
    },
    "website-pixel-neon": {
        "operations": [
            {"op": "bands", "axis": "vertical", "colours": ["#86fff8ff", "#2ed3f0ff", "#d078ffff"]},
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#090613ff"},
            {"op": "extrude", "depth": 2, "dx": 1, "dy": 1, "colours": ["#4b1678ff", "#19104cff"]},
        ],
        "animation": {"frames": 6, "fps": 6, "loop": True, "motions": [{"op": "blink", "pattern": [255, 255, 220, 255, 200, 255]}]},
    },
    "gothic-violet-title": {
        "operations": [
            {"op": "bands", "axis": "vertical", "colours": ["#f1d8ffff", "#b982d9ff", "#70418fff", "#35234fff"]},
            {"op": "bevel", "dx": -1, "dy": -1, "highlight": "#fff3ffff", "shadow": "#25152fff"},
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#0b0712ff"},
            {"op": "extrude", "depth": 3, "dx": 1, "dy": 1, "colours": ["#4a2863ff", "#20132fff", "#0e0917ff"]},
        ]
    },
    "ice-rune-title": {
        "operations": [
            {"op": "bands", "axis": "vertical", "colours": ["#ffffffff", "#c6f4ffff", "#6fc7e9ff", "#3976a8ff"]},
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#102743ff"},
            {"op": "shadow", "dx": 2, "dy": 2, "colour": "#071426cc"},
        ],
        "animation": {"frames": 8, "fps": 8, "loop": True, "motions": [{"op": "shine", "colour": "#ffffffff", "width": 1, "slope": -1, "alpha": 235}]}
    },
    "toxic-tech-title": {
        "operations": [
            {"op": "bands", "axis": "horizontal", "bandHeight": 2, "colours": ["#d7ff6aff", "#6ce83eff", "#1c7e45ff"]},
            {"op": "outline", "radius": 1, "connectivity": 4, "colour": "#07120cff"},
            {"op": "extrude", "depth": 2, "dx": 1, "dy": 1, "colours": ["#184a31ff", "#071a14ff"]},
            {"op": "mask", "pattern": "scanline", "phase": 0, "alpha": 210},
        ],
        "animation": {"frames": 6, "fps": 10, "loop": True, "motions": [{"op": "palette-cycle", "colours": ["#d7ff6aff", "#6ce83eff", "#30c86fff"], "step": 1}]}
    },
    "stone-carved-title": {
        "operations": [
            {"op": "bands", "axis": "vertical", "colours": ["#d8cfb4ff", "#a99b7cff", "#716650ff", "#9d8c70ff"]},
            {"op": "bevel", "dx": -1, "dy": -1, "highlight": "#eee4c9ff", "shadow": "#403a31ff"},
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#201d19ff"},
            {"op": "shadow", "dx": 2, "dy": 2, "colour": "#0d0b09cc"},
        ]
    },
    "warning-red-title": {
        "operations": [
            {"op": "bands", "axis": "vertical", "colours": ["#ffd08dff", "#ff6c45ff", "#b51e2fff", "#671525ff"]},
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#17080dff"},
            {"op": "extrude", "depth": 2, "dx": 1, "dy": 1, "colours": ["#69151fff", "#2c0b13ff"]},
        ],
        "animation": {"frames": 4, "fps": 8, "loop": True, "motions": [{"op": "blink", "pattern": [255, 205, 255, 235]}]}
    },
    "hologram-cyan-title": {
        "operations": [
            {"op": "bands", "axis": "vertical", "colours": ["#d9ffffff", "#5ee9ffff", "#2a9fcdff"]},
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#061821ff"},
            {"op": "mask", "pattern": "scanline", "phase": 0, "alpha": 200},
        ],
        "animation": {"frames": 8, "fps": 12, "loop": True, "motions": [{"op": "jitter", "x": 1, "y": 0, "seed": "hologram-cyan"}, {"op": "shine", "colour": "#ffffffff", "width": 1, "slope": 1, "alpha": 180}]}
    },
    "brass-plaque-label": {
        "operations": [
            {"op": "recolour", "colour": "#f4dfacff"},
            {"op": "shadow", "dx": 1, "dy": 1, "colour": "#1a0b12cc"},
            {"op": "plate", "fill": "#3a2028ff", "border": "#c99a55ff", "padding": 3, "borderWidth": 1, "cornerCut": 2},
        ]
    },
    "blue-command-badge": {
        "operations": [
            {"op": "recolour", "colour": "#d8efffff"},
            {"op": "outline", "radius": 1, "connectivity": 4, "colour": "#071525ff"},
            {"op": "plate", "fill": "#102c4bff", "border": "#5d9bc9ff", "padding": 3, "borderWidth": 1, "cornerCut": 1},
        ]
    },
}


def style_from_preset(preset: str, style_id: str | None = None) -> dict[str, Any]:
    if preset not in BUILTIN_PRESETS:
        fail(f"unknown pixel-text preset {preset!r}")
    source = BUILTIN_PRESETS[preset]
    result: dict[str, Any] = {
        "schema": STYLE_SCHEMA,
        "styleId": style_id or preset,
        "displayName": (style_id or preset).replace("-", " ").title(),
        "description": f"Deterministic {preset} pixel text/title starter treatment.",
        "background": "#00000000",
        "padding": 4,
        "layout": {"align": "center", "tracking": 0, "lineGap": 1, "tabSpaces": 4, "missingGlyph": "error", "replacementCodepoint": 65533},
        "canvas": {"width": 0, "height": 0, "anchor": "center"},
        "operations": source.get("operations", []),
        "animation": source.get("animation", {"frames": 1, "fps": 8, "loop": True, "motions": []}),
        "output": {"individualFrames": True, "sheet": True, "webBundle": True, "godotResourceRoot": ""},
    }
    return normalise_style(result)


def catalog() -> dict[str, Any]:
    return {
        "schema": CATALOG_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "purpose": "Pixel-perfect text, headings, logos and animated title treatments built from canonical bitmap-font output without mutating font masters.",
        "fontInput": "AngelCode BMFont text plus matching RGBA PNG page(s)",
        "operations": sorted(ALLOWED_OPERATIONS),
        "motions": sorted(TITLE_MOTIONS),
        "presets": sorted(BUILTIN_PRESETS),
        "outputs": ["RGBA PNG frame(s)", "horizontal sprite sheet", "SHA-256 manifest", "web CSS/JavaScript", "optional Godot SpriteFrames .tres"],
        "renderingPolicy": {"integerCoordinates": True, "nearestOnly": True, "antialiasing": False, "fontMasterMutation": False, "vectorResampling": False},
        "authority": {"creativeApproval": False, "targetRepositoryMutation": False, "gitCommit": False, "gitPush": False, "publication": False},
    }


def load_bitmap_font(path: Path) -> BitmapFont:
    path = path.resolve()
    if not path.is_file() or path.is_symlink():
        fail(f"font descriptor must be a regular non-symlink file: {path}")
    try:
        descriptor = path.read_text("utf-8")
    except UnicodeDecodeError as exc:
        fail(f"font descriptor is not UTF-8: {exc}")
    parsed = parse_bmfont(descriptor)
    if "common" not in parsed or "info" not in parsed:
        fail("BMFont descriptor is missing info/common records")
    if parsed["info"].get("smooth") not in {None, "0"}:
        fail("Pixel Text Studio requires BMFont smooth=0")
    line_height = int(parsed["common"].get("lineHeight", "0"))
    baseline = int(parsed["common"].get("base", "0"))
    if not 1 <= line_height <= 4096 or not 0 <= baseline <= line_height * 2:
        fail("BMFont lineHeight/base is invalid")
    pages = parsed["pages"]
    if not pages or sorted(pages) != list(range(len(pages))):
        fail("BMFont pages must be contiguous from zero")
    page_paths: list[Path] = []
    page_buffers: list[tuple[int, int, bytes]] = []
    for index in range(len(pages)):
        name = pages[index]
        if Path(name).name != name or "/" in name or "\\" in name:
            fail("BMFont page names must be local filenames")
        page_path = path.parent / name
        if not page_path.is_file() or page_path.is_symlink():
            fail(f"BMFont page is missing or symbolic: {page_path}")
        page_paths.append(page_path)
        page_buffers.append(decode_rgba_png(page_path.read_bytes(), f"BMFont page {index}"))
    glyphs: dict[int, BitmapGlyph] = {}
    for cp, record in parsed["chars"].items():
        page = int(record.get("page", 0))
        if page not in range(len(page_buffers)):
            fail(f"glyph U+{cp:04X} references missing page {page}")
        width = int(record.get("width", 0))
        height = int(record.get("height", 0))
        source_x = int(record.get("x", 0))
        source_y = int(record.get("y", 0))
        xoffset = int(record.get("xoffset", 0))
        yoffset = int(record.get("yoffset", 0))
        xadvance = int(record.get("xadvance", 0))
        if min(width, height, source_x, source_y, xadvance) < 0:
            fail(f"glyph U+{cp:04X} contains negative unsigned metrics")
        page_width, page_height, rgba = page_buffers[page]
        if source_x + width > page_width or source_y + height > page_height:
            fail(f"glyph U+{cp:04X} escapes its PNG page")
        pixels: PixelMap = {}
        for y in range(height):
            for x in range(width):
                offset = ((source_y + y) * page_width + source_x + x) * 4
                colour: RGBA = tuple(rgba[offset : offset + 4])  # type: ignore[assignment]
                if colour[3] > 0:
                    pixels[(x, y)] = colour
        glyphs[cp] = BitmapGlyph(cp, width, height, xoffset, yoffset, xadvance, pixels)
    if not glyphs:
        fail("BMFont descriptor contains no glyphs")
    return BitmapFont(
        path=path,
        line_height=line_height,
        baseline=baseline,
        glyphs=glyphs,
        kernings={pair: int(amount) for pair, amount in parsed["kernings"].items()},
        page_paths=tuple(page_paths),
        descriptor_sha256=sha256_file(path),
        page_sha256=tuple(sha256_file(page) for page in page_paths),
    )


def _resolve_glyph(font: BitmapFont, cp: int, style: Mapping[str, Any]) -> BitmapGlyph | None:
    glyph = font.glyphs.get(cp)
    if glyph is not None:
        return glyph
    policy = style["layout"]["missingGlyph"]
    if policy == "skip":
        return None
    if policy == "replace":
        replacement = font.glyphs.get(style["layout"]["replacementCodepoint"])
        if replacement is not None:
            return replacement
    fail(f"BMFont has no glyph for U+{cp:04X}")


def layout_text(font: BitmapFont, value: str, style: Mapping[str, Any]) -> list[Placement]:
    if not isinstance(value, str) or not value or len(value) > MAX_TEXT_LENGTH:
        fail(f"text must contain 1..{MAX_TEXT_LENGTH} characters")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    if "\x00" in value:
        fail("text must not contain NUL")
    line_height = font.line_height + style["layout"]["lineGap"]
    if line_height < 1:
        fail("lineGap makes line advance non-positive")
    tracking = style["layout"]["tracking"]
    tab_spaces = style["layout"]["tabSpaces"]
    lines = value.split("\n")
    line_placements: list[list[Placement]] = []
    line_widths: list[int] = []
    logical_index = 0
    for line_index, line in enumerate(lines):
        x = 0
        previous: int | None = None
        placements: list[Placement] = []
        expanded: list[int] = []
        for character in line:
            if character == "\t":
                expanded.extend([0x20] * tab_spaces)
            else:
                expanded.append(ord(character))
        for raw_cp in expanded:
            glyph = _resolve_glyph(font, raw_cp, style)
            if glyph is None:
                previous = None
                logical_index += 1
                continue
            cp = glyph.codepoint
            if previous is not None:
                x += font.kernings.get((previous, cp), 0)
            placements.append(Placement(logical_index, cp, glyph, x, line_index * line_height))
            x += glyph.xadvance + tracking
            previous = cp
            logical_index += 1
        if placements and tracking:
            x -= tracking
        line_placements.append(placements)
        line_widths.append(max(0, x))
    maximum_width = max(line_widths, default=0)
    output: list[Placement] = []
    for placements, width in zip(line_placements, line_widths):
        align = style["layout"]["align"]
        offset = 0 if align == "left" else (maximum_width - width) // 2 if align == "center" else maximum_width - width
        output.extend(Placement(item.index, item.codepoint, item.glyph, item.x + offset, item.y) for item in placements)
    return output


def _deterministic_offset(seed: str, frame: int, index: int, axis: str, radius: int) -> int:
    if radius <= 0:
        return 0
    digest = hashlib.sha256(f"{seed}|{frame}|{index}|{axis}".encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % (radius * 2 + 1) - radius


def _visible_limit(placements: Sequence[Placement], motion: Mapping[str, Any], frame: int) -> int:
    total = len(placements)
    start = motion["startFrame"]
    end = motion["endFrame"]
    if frame < start:
        return 0
    if frame >= end or end == start:
        return total
    return (total * (frame - start + 1) + (end - start)) // (end - start + 1)


def compose_glyphs(font: BitmapFont, placements: Sequence[Placement], style: Mapping[str, Any], frame: int) -> PixelMap:
    wave = next((item for item in style["animation"]["motions"] if item["op"] == "wave"), None)
    jitter = next((item for item in style["animation"]["motions"] if item["op"] == "jitter"), None)
    type_on = next((item for item in style["animation"]["motions"] if item["op"] == "type-on"), None)
    visible = len(placements) if type_on is None else _visible_limit(placements, type_on, frame)
    output: PixelMap = {}
    for sequence_index, placement in enumerate(placements[:visible]):
        dx = dy = 0
        if wave:
            pattern = wave["pattern"]
            dy += pattern[(sequence_index * wave["glyphPhase"] + frame * wave["framePhase"]) % len(pattern)]
        if jitter:
            dx += _deterministic_offset(jitter["seed"], frame, sequence_index, "x", jitter["x"])
            dy += _deterministic_offset(jitter["seed"], frame, sequence_index, "y", jitter["y"])
        origin_x = placement.x + placement.glyph.xoffset + dx
        origin_y = placement.y + placement.glyph.yoffset + dy
        glyph_pixels = {(origin_x + x, origin_y + y): colour for (x, y), colour in placement.glyph.pixels.items()}
        output = merge_maps(output, glyph_pixels)
    return output


def _bounds(pixels: Mapping[tuple[int, int], RGBA]) -> tuple[int, int, int, int] | None:
    if not pixels:
        return None
    xs = [point[0] for point in pixels]
    ys = [point[1] for point in pixels]
    return min(xs), min(ys), max(xs), max(ys)


def op_bands(pixels: PixelMap, operation: Mapping[str, Any], frame: int) -> PixelMap:
    if not pixels:
        return {}
    colours = [parse_colour(item, "bands.colours") for item in operation["colours"]]
    axis = operation["axis"]
    coords = [point[1] if axis == "vertical" else point[0] for point in pixels]
    lower, upper = min(coords), max(coords)
    span = max(1, upper - lower + 1)
    band_height = operation["bandHeight"]
    phase = operation["phase"] + frame * operation["phasePerFrame"]
    output: PixelMap = {}
    for point, source in pixels.items():
        coordinate = point[1] if axis == "vertical" else point[0]
        if band_height:
            index = ((coordinate - lower + phase) // band_height) % len(colours)
        else:
            scaled = ((coordinate - lower) * len(colours) + phase) // span
            index = scaled % len(colours)
        colour = colours[index]
        output[point] = (colour[0], colour[1], colour[2], (colour[3] * source[3] + 127) // 255)
    return output


def op_extrude(pixels: PixelMap, operation: Mapping[str, Any]) -> PixelMap:
    colours = [parse_colour(item, "extrude.colours") for item in operation["colours"]]
    under: PixelMap = {}
    for depth in range(operation["depth"], 0, -1):
        colour = colours[(depth - 1) % len(colours)]
        layer = {
            (x + operation["dx"] * depth, y + operation["dy"] * depth): (
                colour[0], colour[1], colour[2], (colour[3] * source[3] + 127) // 255
            )
            for (x, y), source in pixels.items()
        }
        under = merge_maps(under, layer)
    return merge_maps(under, pixels)


def op_bevel(pixels: PixelMap, operation: Mapping[str, Any]) -> PixelMap:
    if not pixels:
        return {}
    occupied = set(pixels)
    highlight = parse_colour(operation["highlight"], "bevel.highlight")
    shadow = parse_colour(operation["shadow"], "bevel.shadow")
    dx = operation["dx"]
    dy = operation["dy"]
    overlay: PixelMap = {}
    for x, y in occupied:
        if (x + dx, y + dy) not in occupied:
            overlay[(x, y)] = highlight
        elif (x - dx, y - dy) not in occupied:
            overlay[(x, y)] = shadow
    return merge_maps(pixels, overlay)


def op_taper(pixels: PixelMap, operation: Mapping[str, Any]) -> PixelMap:
    if not pixels:
        return {}
    bounds = _bounds(pixels)
    assert bounds is not None
    min_x, min_y, max_x, max_y = bounds
    source_width = max_x - min_x + 1
    source_height = max(1, max_y - min_y)
    output: PixelMap = {}
    for y in range(min_y, max_y + 1):
        numerator = y - min_y
        percent = (operation["topPercent"] * (source_height - numerator) + operation["bottomPercent"] * numerator + source_height // 2) // source_height
        target_width = max(1, (source_width * percent + 50) // 100)
        if operation["anchor"] == "left":
            start = min_x
        elif operation["anchor"] == "right":
            start = max_x - target_width + 1
        else:
            center_twice = min_x + max_x
            start = (center_twice - target_width + 1) // 2
        for target_offset in range(target_width):
            source_offset = min(source_width - 1, (target_offset * source_width) // target_width)
            source = pixels.get((min_x + source_offset, y))
            if source is not None:
                output[(start + target_offset, y)] = source
    return output


def op_plate(pixels: PixelMap, operation: Mapping[str, Any]) -> PixelMap:
    if not pixels:
        return {}
    bounds = _bounds(pixels)
    assert bounds is not None
    min_x, min_y, max_x, max_y = bounds
    padding = operation["padding"]
    left, top, right, bottom = min_x - padding, min_y - padding, max_x + padding, max_y + padding
    cut = min(operation["cornerCut"], max(0, (right - left) // 2), max(0, (bottom - top) // 2))
    shape: set[tuple[int, int]] = set()
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            lx, rx = x - left, right - x
            ty, by = y - top, bottom - y
            if cut and (lx + ty < cut or rx + ty < cut or lx + by < cut or rx + by < cut):
                continue
            shape.add((x, y))
    fill = parse_colour(operation["fill"], "plate.fill")
    border = parse_colour(operation["border"], "plate.border")
    background: PixelMap = {point: fill for point in shape}
    interior = set(shape)
    for _ in range(operation["borderWidth"]):
        eroded = {
            point for point in interior
            if all((point[0] + dx, point[1] + dy) in interior for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        }
        for point in interior - eroded:
            background[point] = border
        interior = eroded
        if not interior:
            break
    return merge_maps(background, pixels)


def apply_static_operations(pixels: PixelMap, font: BitmapFont, style: Mapping[str, Any], frame: int) -> PixelMap:
    output = dict(pixels)
    context = OperationContext(codepoint=0, metrics={"lineHeight": font.line_height}, baseline=font.baseline)
    for operation in style["operations"]:
        name = operation["op"]
        if name == "bands":
            output = op_bands(output, operation, frame)
        elif name == "extrude":
            output = op_extrude(output, operation)
        elif name == "bevel":
            output = op_bevel(output, operation)
        elif name == "taper":
            output = op_taper(output, operation)
        elif name == "plate":
            output = op_plate(output, operation)
        else:
            output = BUILTIN_OPERATIONS[name](output, operation, context)
        if len(output) > MAX_PIXELS:
            fail(f"operation {name!r} exceeded the pixel budget")
    return output


def apply_motion_effects(pixels: PixelMap, style: Mapping[str, Any], frame: int) -> PixelMap:
    output = dict(pixels)
    frames = style["animation"]["frames"]
    for motion in style["animation"]["motions"]:
        name = motion["op"]
        if name in {"wave", "jitter", "type-on"}:
            continue
        if name == "blink":
            alpha = motion["pattern"][frame % len(motion["pattern"])]
            output = {point: (colour[0], colour[1], colour[2], (colour[3] * alpha + 127) // 255) for point, colour in output.items() if colour[3] and alpha}
        elif name == "sparkle" and output:
            points = sorted(output, key=lambda point: (point[1], point[0]))
            colour = parse_colour(motion["colour"], "sparkle.colour")
            overlay: PixelMap = {}
            for sparkle_index in range(motion["count"]):
                digest = hashlib.sha256(f"{motion['seed']}|{frame}|{sparkle_index}".encode("utf-8")).digest()
                center = points[int.from_bytes(digest[:8], "big") % len(points)]
                radius = motion["radius"]
                for delta in range(-radius, radius + 1):
                    overlay[(center[0] + delta, center[1])] = colour
                    overlay[(center[0], center[1] + delta)] = colour
            output = merge_maps(output, overlay)
        elif name == "palette-cycle":
            palette = [parse_colour(item, "palette-cycle.colours") for item in motion["colours"]]
            shift = frame * motion["step"]
            mapping = {palette[index]: palette[(index + shift) % len(palette)] for index in range(len(palette))}
            output = {point: mapping.get(colour, colour) for point, colour in output.items()}
        elif name == "shine" and output:
            colour = parse_colour(motion["colour"], "shine.colour")
            alpha = motion["alpha"]
            metrics = [x + motion["slope"] * y for x, y in output]
            lower, upper = min(metrics), max(metrics)
            travel = max(1, upper - lower + 1 + motion["width"] * 2)
            center = lower - motion["width"] + (travel * frame) // max(1, frames - 1)
            overlay: PixelMap = {}
            for point, source in output.items():
                metric = point[0] + motion["slope"] * point[1]
                if abs(metric - center) < motion["width"]:
                    overlay[point] = (colour[0], colour[1], colour[2], (colour[3] * alpha * source[3] + 32512) // (255 * 255))
            output = merge_maps(output, overlay)
    return output


def _translate(pixels: PixelMap, dx: int, dy: int) -> PixelMap:
    return {(x + dx, y + dy): colour for (x, y), colour in pixels.items()}


def _render_rgba(width: int, height: int, pixels: PixelMap, background: RGBA) -> bytes:
    if not 1 <= width <= MAX_CANVAS_EDGE or not 1 <= height <= MAX_CANVAS_EDGE or width * height > MAX_PIXELS:
        fail("rendered canvas exceeds supported bounds")
    rgba = bytearray(bytes(background) * (width * height))
    for (x, y), colour in pixels.items():
        if not 0 <= x < width or not 0 <= y < height:
            fail("internal rendered pixel escaped the canvas")
        offset = (y * width + x) * 4
        under: RGBA = tuple(rgba[offset : offset + 4])  # type: ignore[assignment]
        rgba[offset : offset + 4] = bytes(alpha_composite(under, colour))
    return png_rgba(width, height, bytes(rgba))


def _sheet_rgba(width: int, height: int, frames: Sequence[bytes]) -> bytes:
    sheet_width = width * len(frames)
    if sheet_width > MAX_CANVAS_EDGE or sheet_width * height > MAX_PIXELS:
        fail("horizontal sprite sheet exceeds supported bounds")
    target = bytearray(sheet_width * height * 4)
    for frame_index, data in enumerate(frames):
        fw, fh, rgba = decode_rgba_png(data, f"frame {frame_index}")
        if (fw, fh) != (width, height):
            fail("internal frame dimensions differ")
        for y in range(height):
            source_offset = y * width * 4
            target_offset = (y * sheet_width + frame_index * width) * 4
            target[target_offset : target_offset + width * 4] = rgba[source_offset : source_offset + width * 4]
    return png_rgba(sheet_width, height, bytes(target))


def _godot_spriteframes(style: Mapping[str, Any], frame_names: Sequence[str]) -> bytes | None:
    root = style["output"]["godotResourceRoot"]
    if not root:
        return None
    lines = [f"[gd_resource type=\"SpriteFrames\" load_steps={len(frame_names) + 1} format=3]", ""]
    for index, name in enumerate(frame_names, 1):
        lines.append(f"[ext_resource type=\"Texture2D\" path=\"{root}/{name}\" id=\"{index}\"]")
    lines.extend(["", "[resource]", "animations = [{", '"frames": ['])
    for index in range(1, len(frame_names) + 1):
        comma = "," if index < len(frame_names) else ""
        lines.append(f'{{"duration": 1.0, "texture": ExtResource("{index}")}}{comma}')
    lines.extend([
        "],",
        f'"loop": {str(style["animation"]["loop"]).lower()},',
        '"name": &"default",',
        f'"speed": {float(style["animation"]["fps"]):.1f}',
        "}]",
        "",
    ])
    return "\n".join(lines).encode("utf-8")


def _web_bundle(style: Mapping[str, Any], manifest: Mapping[str, Any]) -> dict[str, bytes]:
    class_name = f"evavo-pixel-text-{style['styleId']}"
    css = f""".{class_name} {{\n  image-rendering: pixelated;\n  image-rendering: crisp-edges;\n  width: auto;\n  height: auto;\n}}\n"""
    js = f"""export function mountPixelText(image, baseUrl = '.') {{\n  const frames = {json.dumps([item['path'] for item in manifest['frames']])};\n  const fps = {style['animation']['fps']};\n  const loop = {str(style['animation']['loop']).lower()};\n  let index = 0;\n  image.classList.add('{class_name}');\n  image.src = `${{baseUrl}}/${{frames[0]}}`;\n  if (frames.length <= 1) return () => {{}};\n  const timer = setInterval(() => {{\n    if (!loop && index >= frames.length - 1) {{ clearInterval(timer); return; }}\n    index = (index + 1) % frames.length;\n    image.src = `${{baseUrl}}/${{frames[index]}}`;\n  }}, Math.max(1, Math.round(1000 / fps)));\n  return () => clearInterval(timer);\n}}\n"""
    return {"web/pixel-text.css": css.encode("utf-8"), "web/pixel-text.js": js.encode("utf-8")}


def render_build(font_path: Path, value: str, style_value: Any, output_root: Path) -> dict[str, Any]:
    style = normalise_style(style_value)
    output_root = output_root.resolve()
    if output_root.exists():
        fail(f"output root already exists: {output_root}")
    if not output_root.parent.is_dir() or output_root.parent.is_symlink():
        fail("output parent must be an existing non-symlink directory")
    font = load_bitmap_font(font_path)
    placements = layout_text(font, value, style)
    frame_maps: list[PixelMap] = []
    for frame in range(style["animation"]["frames"]):
        pixels = compose_glyphs(font, placements, style, frame)
        pixels = apply_static_operations(pixels, font, style, frame)
        pixels = apply_motion_effects(pixels, style, frame)
        frame_maps.append(pixels)
    non_empty_bounds = [bounds for pixels in frame_maps if (bounds := _bounds(pixels)) is not None]
    if non_empty_bounds:
        min_x = min(item[0] for item in non_empty_bounds)
        min_y = min(item[1] for item in non_empty_bounds)
        max_x = max(item[2] for item in non_empty_bounds)
        max_y = max(item[3] for item in non_empty_bounds)
    else:
        min_x = min_y = 0
        max_x = max_y = 0
    padding = style["padding"]
    auto_width = max_x - min_x + 1 + padding["left"] + padding["right"]
    auto_height = max_y - min_y + 1 + padding["top"] + padding["bottom"]
    width = style["canvas"]["width"] or max(1, auto_width)
    height = style["canvas"]["height"] or max(1, auto_height)
    if width < auto_width or height < auto_height:
        fail("fixed canvas is smaller than the complete animated title bounds")
    if style["canvas"]["anchor"] == "center":
        dx = padding["left"] - min_x + (width - auto_width) // 2
        dy = padding["top"] - min_y + (height - auto_height) // 2
    else:
        dx = padding["left"] - min_x
        dy = padding["top"] - min_y
    translated = [_translate(pixels, dx, dy) for pixels in frame_maps]
    background = parse_colour(style["background"], "style.background")
    frame_pngs = [_render_rgba(width, height, pixels, background) for pixels in translated]
    frame_names = [f"frames/frame-{index:03d}.png" for index in range(len(frame_pngs))]
    files: dict[str, bytes] = {}
    if style["output"]["individualFrames"]:
        files.update({name: data for name, data in zip(frame_names, frame_pngs)})
    if len(frame_pngs) == 1:
        files["title.png"] = frame_pngs[0]
    if style["output"]["sheet"]:
        files["sheet.png"] = _sheet_rgba(width, height, frame_pngs)
    files["source/style.json"] = pretty_json(style)
    files["source/text.txt"] = value.encode("utf-8")

    manifest: dict[str, Any] = {
        "schema": BUILD_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "status": "passed",
        "styleId": style["styleId"],
        "font": {"descriptorName": font.path.name, "descriptorSha256": font.descriptor_sha256, "pages": [{"name": page_path.name, "sha256": page_sha} for page_path, page_sha in zip(font.page_paths, font.page_sha256)]},
        "textSha256": sha256_bytes(value.encode("utf-8")),
        "styleSha256": sha256_bytes(canonical_json(style)),
        "width": width,
        "height": height,
        "frameCount": len(frame_pngs),
        "fps": style["animation"]["fps"],
        "loop": style["animation"]["loop"],
        "frames": [{"index": index, "path": name, "sha256": sha256_bytes(data)} for index, (name, data) in enumerate(zip(frame_names, frame_pngs))],
        "policy": {"nearestOnly": True, "integerCoordinates": True, "antialiasing": False, "fontMasterMutation": False, "createOnly": True},
        "authority": {"creativeApproval": False, "targetRepositoryMutation": False, "gitCommit": False, "gitPush": False, "publication": False},
    }
    if style["output"]["webBundle"]:
        files.update(_web_bundle(style, manifest))
    godot = _godot_spriteframes(style, frame_names)
    if godot is not None:
        files["godot/pixel-text-spriteframes.tres"] = godot
    manifest["files"] = [
        {"path": path, "bytes": len(data), "sha256": sha256_bytes(data)}
        for path, data in sorted(files.items())
    ]
    manifest["buildSha256"] = sha256_bytes(canonical_json({key: manifest[key] for key in sorted(manifest) if key != "buildSha256"}))
    files["pixel-text-build.json"] = pretty_json(manifest)

    temporary = Path(tempfile.mkdtemp(prefix=f".{output_root.name}.pixel-text-", dir=output_root.parent))
    try:
        for relative, data in sorted(files.items()):
            path = temporary / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        validate_build(temporary)
        temporary.replace(output_root)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return manifest


def validate_build(output_root: Path) -> dict[str, Any]:
    output_root = output_root.resolve()
    if not output_root.is_dir() or output_root.is_symlink():
        fail(f"output root must be a non-symlink directory: {output_root}")
    manifest_path = output_root / "pixel-text-build.json"
    manifest = _load_json(manifest_path, "pixel text build manifest")
    if not isinstance(manifest, dict) or manifest.get("schema") != BUILD_SCHEMA:
        fail(f"pixel-text-build.json schema must be {BUILD_SCHEMA}")
    if manifest.get("engineVersion") != ENGINE_VERSION or manifest.get("status") != "passed":
        fail("pixel text build engine/status mismatch")
    expected_build_sha = sha256_bytes(canonical_json({key: manifest[key] for key in sorted(manifest) if key != "buildSha256"}))
    if manifest.get("buildSha256") != expected_build_sha:
        fail("pixel text build self-hash mismatch")
    expected_files = {item["path"]: item for item in manifest.get("files", [])}
    observed_files = sorted(path.relative_to(output_root).as_posix() for path in output_root.rglob("*") if path.is_file() and path.name != "pixel-text-build.json")
    if sorted(expected_files) != observed_files:
        fail("pixel text build file inventory mismatch")
    for relative, record in expected_files.items():
        path = output_root / relative
        if path.is_symlink() or not path.is_file():
            fail(f"retained build file is missing or symbolic: {relative}")
        if path.stat().st_size != record["bytes"] or sha256_file(path) != record["sha256"]:
            fail(f"retained build file identity mismatch: {relative}")
    width = bounded_int(manifest.get("width"), "manifest.width", 1, MAX_CANVAS_EDGE)
    height = bounded_int(manifest.get("height"), "manifest.height", 1, MAX_CANVAS_EDGE)
    frames = manifest.get("frames")
    if not isinstance(frames, list) or len(frames) != manifest.get("frameCount"):
        fail("manifest frame inventory mismatch")
    for frame in frames:
        path = output_root / frame["path"]
        if not path.is_file():
            fail(f"frame file missing: {frame['path']}")
        fw, fh, _ = decode_rgba_png(path.read_bytes(), frame["path"])
        if (fw, fh) != (width, height) or sha256_file(path) != frame["sha256"]:
            fail(f"frame validation failed: {frame['path']}")
    return {
        "schema": VALIDATION_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "status": "passed",
        "buildSha256": manifest["buildSha256"],
        "frameCount": len(frames),
        "width": width,
        "height": height,
        "fileCount": len(expected_files) + 1,
    }


def compare_builds(first: Path, second: Path) -> dict[str, Any]:
    first_validation = validate_build(first)
    second_validation = validate_build(second)
    def tree(root: Path) -> dict[str, str]:
        return {path.relative_to(root).as_posix(): sha256_file(path) for path in sorted(root.rglob("*")) if path.is_file()}
    first_tree = tree(first.resolve())
    second_tree = tree(second.resolve())
    if first_tree != second_tree:
        fail("pixel text builds are not byte-for-byte identical")
    return {"schema": VALIDATION_SCHEMA, "engineVersion": ENGINE_VERSION, "status": "passed", "identical": True, "fileCount": len(first_tree), "treeSha256": sha256_bytes(canonical_json(first_tree)), "firstBuildSha256": first_validation["buildSha256"], "secondBuildSha256": second_validation["buildSha256"]}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pixel_text_studio")
    parser.add_argument("--version", action="version", version=ENGINE_VERSION)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("catalog")
    example = sub.add_parser("style-example")
    example.add_argument("--preset", required=True)
    example.add_argument("--style-id")
    validate_style = sub.add_parser("validate-style")
    validate_style.add_argument("--style", required=True)
    render = sub.add_parser("render")
    render.add_argument("--font", required=True)
    text_group = render.add_mutually_exclusive_group(required=True)
    text_group.add_argument("--text")
    text_group.add_argument("--text-file")
    render.add_argument("--style", required=True)
    render.add_argument("--output", required=True)
    validate_output = sub.add_parser("validate-output")
    validate_output.add_argument("--output", required=True)
    compare = sub.add_parser("compare")
    compare.add_argument("--first", required=True)
    compare.add_argument("--second", required=True)
    return parser


def command_main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "catalog":
            result = catalog()
        elif args.command == "style-example":
            result = style_from_preset(args.preset, args.style_id)
        elif args.command == "validate-style":
            result = normalise_style(_load_json(Path(args.style).resolve(), "pixel text style"))
        elif args.command == "render":
            if args.text_file:
                text_path = Path(args.text_file).resolve()
                if not text_path.is_file() or text_path.is_symlink() or text_path.stat().st_size > 1024 * 1024:
                    fail("text-file must be a regular non-symlink file no larger than 1 MiB")
                value = text_path.read_text("utf-8")
            else:
                value = args.text
            result = render_build(Path(args.font), value, _load_json(Path(args.style).resolve(), "pixel text style"), Path(args.output))
        elif args.command == "validate-output":
            result = validate_build(Path(args.output))
        elif args.command == "compare":
            result = compare_builds(Path(args.first), Path(args.second))
        else:
            fail(f"unsupported command {args.command!r}")
    except (PixelFontUniversalError, UnicodeDecodeError, OSError) as exc:
        sys.stderr.write(f"{exc}\n")
        return 2
    sys.stdout.write(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(command_main())
