#!/usr/bin/env python3
from __future__ import annotations

import binascii
import math
import re
import struct
import zlib
from typing import Any, Mapping, Sequence

from pixel_font_studio_common import (
    GLYPH_SETS, MASTER_5X7, MAX_ATLAS_PIXELS, MAX_ATLAS_SIDE, PNG_SIGNATURE,
    Glyph, PackedGlyph, checked_int, fail, next_power_of_two, parse_colour,
)

def matrix_from_pattern(pattern: Sequence[str]) -> list[list[int]]:
    return [[1 if cell == "#" else 0 for cell in row] for row in pattern]

def trim_matrix(matrix: list[list[int]], preserve_height: bool = True) -> tuple[list[list[int]], int, int]:
    if not matrix or not matrix[0]:
        return [[0]], 0, 0
    height = len(matrix)
    width = len(matrix[0])
    filled = [(x, y) for y in range(height) for x in range(width) if matrix[y][x]]
    if not filled:
        return [[0]], 0, 0
    min_x = min(x for x, _ in filled)
    max_x = max(x for x, _ in filled)
    min_y = 0 if preserve_height else min(y for _, y in filled)
    max_y = height - 1 if preserve_height else max(y for _, y in filled)
    return [row[min_x:max_x + 1] for row in matrix[min_y:max_y + 1]], min_x, min_y

def scale_matrix(matrix: list[list[int]], scale_x: int, scale_y: int) -> list[list[int]]:
    result: list[list[int]] = []
    for row in matrix:
        expanded = [cell for cell in row for _ in range(scale_x)]
        for _ in range(scale_y):
            result.append(list(expanded))
    return result

def bold_matrix(matrix: list[list[int]], amount: int) -> list[list[int]]:
    if amount <= 0:
        return matrix
    width = len(matrix[0]) + amount
    result = [[0] * width for _ in matrix]
    for y, row in enumerate(matrix):
        for x, cell in enumerate(row):
            if cell:
                for delta in range(amount + 1):
                    result[y][x + delta] = 1
    return result

def slant_matrix(matrix: list[list[int]], amount: int) -> tuple[list[list[int]], int]:
    if amount <= 0:
        return matrix, 0
    height = len(matrix)
    shifts = [(height - 1 - y) // amount for y in range(height)]
    width = len(matrix[0]) + max(shifts)
    result = [[0] * width for _ in matrix]
    for y, row in enumerate(matrix):
        for x, cell in enumerate(row):
            if cell:
                result[y][x + shifts[y]] = 1
    return result, max(shifts)

def glyph_chars(spec: Mapping[str, Any], font: Mapping[str, Any]) -> list[str]:
    requested = font.get("glyphSets", spec.get("glyphSets", ["ascii-printable"]))
    if not isinstance(requested, list) or not requested:
        fail("glyphSets must be a non-empty array")
    result: list[str] = []
    for index, set_name in enumerate(requested):
        if not isinstance(set_name, str) or set_name not in GLYPH_SETS:
            fail(f"glyphSets[{index}] is unsupported")
        result.extend(GLYPH_SETS[set_name])
    extras = font.get("extraGlyphs", [])
    if not isinstance(extras, list):
        fail("extraGlyphs must be an array")
    for index, item in enumerate(extras):
        if not isinstance(item, str) or len(item) != 1 or item not in MASTER_5X7:
            fail(f"extraGlyphs[{index}] is not an available one-character glyph")
        result.append(item)
    return sorted(set(result), key=ord)

def compile_glyph(char: str, style: Mapping[str, Any]) -> Glyph:
    if char not in MASTER_5X7:
        fail(f"glyph master is missing U+{ord(char):04X} {char!r}")
    scale_x = checked_int(style.get("scaleX", 1), "style.scaleX", 1, 8)
    scale_y = checked_int(style.get("scaleY", 1), "style.scaleY", 1, 8)
    bold_x = checked_int(style.get("boldX", 0), "style.boldX", 0, 3)
    slant = checked_int(style.get("slantRows", 0), "style.slantRows", 0, 8)
    tracking = checked_int(style.get("tracking", 1), "style.tracking", 0, 16)
    monospace = bool(style.get("monospace", False))
    uppercase_only = bool(style.get("uppercaseOnly", False))
    source = char.upper() if uppercase_only and char.isalpha() else char
    matrix = matrix_from_pattern(MASTER_5X7.get(source, MASTER_5X7[char]))
    if char == " ":
        cell_width = checked_int(style.get("spaceWidth", 3), "style.spaceWidth", 1, 16) * scale_x
        line_height = 7 * scale_y
        return Glyph(char, ord(char), tuple((0,) * cell_width for _ in range(line_height)), cell_width, line_height, 0, 0, cell_width + tracking)
    if not monospace:
        matrix, left_trim, _ = trim_matrix(matrix, preserve_height=True)
    else:
        left_trim = 0
    matrix = scale_matrix(matrix, scale_x, scale_y)
    matrix = bold_matrix(matrix, bold_x)
    matrix, _ = slant_matrix(matrix, slant)
    width = len(matrix[0])
    height = len(matrix)
    xadvance = (5 * scale_x + bold_x + tracking) if monospace else width + tracking
    return Glyph(char, ord(char), tuple(tuple(row) for row in matrix), width, height, left_trim * scale_x, 0, xadvance)

def pack_glyphs(glyphs: Sequence[Glyph], padding: int, max_width: int, power_of_two: bool) -> tuple[list[PackedGlyph], int, int]:
    if not glyphs:
        fail("font has no glyphs")
    max_width = checked_int(max_width, "atlas.maxWidth", 32, MAX_ATLAS_SIDE)
    padding = checked_int(padding, "atlas.padding", 0, 16)
    x = padding
    y = padding
    row_height = 0
    packed: list[PackedGlyph] = []
    used_width = 0
    for glyph in glyphs:
        cell_width = max(1, glyph.width) + padding * 2
        cell_height = max(1, glyph.height) + padding * 2
        if cell_width > max_width:
            fail(f"glyph U+{glyph.codepoint:04X} exceeds atlas maxWidth")
        if x + cell_width > max_width and x > padding:
            x = padding
            y += row_height
            row_height = 0
        packed.append(PackedGlyph(glyph, x + padding, y + padding))
        x += cell_width
        row_height = max(row_height, cell_height)
        used_width = max(used_width, x)
    used_height = y + row_height + padding
    width = next_power_of_two(used_width) if power_of_two else used_width
    height = next_power_of_two(used_height) if power_of_two else used_height
    if width > MAX_ATLAS_SIDE or height > MAX_ATLAS_SIDE or width * height > MAX_ATLAS_PIXELS:
        fail(f"atlas {width}x{height} exceeds the compiler boundary")
    return packed, width, height

def _chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF)

def encode_png(width: int, height: int, pixels: bytes) -> bytes:
    if len(pixels) != width * height * 4:
        fail("RGBA byte length does not match PNG dimensions")
    rows = b"".join(b"\x00" + pixels[y * width * 4:(y + 1) * width * 4] for y in range(height))
    return PNG_SIGNATURE + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + _chunk(b"IDAT", zlib.compress(rows, 9)) + _chunk(b"IEND", b"")

def decode_png(data: bytes) -> tuple[int, int, bytes]:
    if not data.startswith(PNG_SIGNATURE):
        fail("PNG signature is invalid")
    offset = len(PNG_SIGNATURE)
    width = height = None
    idat: list[bytes] = []
    seen_iend = False
    while offset < len(data):
        if offset + 12 > len(data):
            fail("PNG chunk is truncated")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        end = offset + 12 + length
        if end > len(data):
            fail("PNG payload is truncated")
        payload = data[offset + 8:offset + 8 + length]
        observed_crc = struct.unpack(">I", data[offset + 8 + length:end])[0]
        if observed_crc != (binascii.crc32(kind + payload) & 0xFFFFFFFF):
            fail("PNG chunk CRC differs")
        if kind == b"IHDR":
            width, height, depth, colour, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if depth != 8 or colour != 6 or compression or filtering or interlace:
                fail("PNG must be non-interlaced 8-bit RGBA")
        elif kind == b"IDAT":
            idat.append(payload)
        elif kind == b"IEND":
            seen_iend = True
            offset = end
            break
        offset = end
    if not seen_iend or offset != len(data) or width is None or height is None:
        fail("PNG structure is incomplete or has trailing bytes")
    raw = zlib.decompress(b"".join(idat))
    stride = width * 4
    if len(raw) != height * (stride + 1):
        fail("PNG decoded byte length differs")
    pixels = bytearray()
    for y in range(height):
        row = raw[y * (stride + 1):(y + 1) * (stride + 1)]
        if row[0] != 0:
            fail("compiler PNG must use filter 0")
        pixels.extend(row[1:])
    return width, height, bytes(pixels)

def atlas_pixels(width: int, height: int, packed: Sequence[PackedGlyph]) -> bytes:
    pixels = bytearray(width * height * 4)
    for entry in packed:
        for gy, row in enumerate(entry.glyph.pixels):
            for gx, cell in enumerate(row):
                if cell:
                    index = ((entry.y + gy) * width + entry.x + gx) * 4
                    pixels[index:index + 4] = b"\xff\xff\xff\xff"
    return bytes(pixels)

def fnt_text(font_id: str, packed: Sequence[PackedGlyph], width: int, height: int, line_height: int, base: int, atlas_name: str, nominal_size: int) -> str:
    lines = [f'info face="{font_id}" size={nominal_size} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1', f"common lineHeight={line_height} base={base} scaleW={width} scaleH={height} pages=1 packed=0 alphaChnl=1 redChnl=4 greenChnl=4 blueChnl=4", f'page id=0 file="{atlas_name}"', f"chars count={len(packed)}"]
    for entry in packed:
        glyph = entry.glyph
        lines.append("char id={id} x={x} y={y} width={w} height={h} xoffset={xo} yoffset={yo} xadvance={xa} page=0 chnl=15".format(id=glyph.codepoint, x=entry.x, y=entry.y, w=max(1, glyph.width), h=max(1, glyph.height), xo=glyph.xoffset, yo=glyph.yoffset, xa=glyph.xadvance))
    lines.append("kernings count=0")
    return "\n".join(lines) + "\n"

def parse_fnt(text: str) -> dict[str, Any]:
    common: dict[str, int] | None = None
    page: str | None = None
    chars: list[dict[str, int]] = []
    declared = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("common "):
            common = {key: int(value) for key, value in re.findall(r"(\w+)=(-?\d+)", line)}
        elif line.startswith("page "):
            match = re.search(r'file="([^"]+)"', line)
            page = match.group(1) if match else None
        elif line.startswith("chars "):
            match = re.search(r"count=(\d+)", line)
            declared = int(match.group(1)) if match else None
        elif line.startswith("char "):
            chars.append({key: int(value) for key, value in re.findall(r"(\w+)=(-?\d+)", line)})
    if common is None or page is None or declared is None or declared != len(chars):
        fail("BMFont descriptor is incomplete")
    return {"common": common, "page": page, "chars": chars}

def _canvas(width: int, height: int, colour: tuple[int, int, int, int]) -> bytearray:
    return bytearray(bytes(colour) * (width * height))

def _fill(canvas: bytearray, width: int, height: int, x: int, y: int, w: int, h: int, colour: tuple[int, int, int, int]) -> None:
    for py in range(max(0, y), min(height, y + h)):
        for px in range(max(0, x), min(width, x + w)):
            index = (py * width + px) * 4
            canvas[index:index + 4] = bytes(colour)

def _draw(canvas: bytearray, width: int, height: int, glyph: Glyph, x: int, y: int, colour: tuple[int, int, int, int], scale: int = 1) -> None:
    for gy, row in enumerate(glyph.pixels):
        for gx, cell in enumerate(row):
            if cell:
                _fill(canvas, width, height, x + gx * scale, y + gy * scale, scale, scale, colour)

def _text(canvas: bytearray, width: int, height: int, glyphs: Mapping[str, Glyph], text: str, x: int, y: int, colour: tuple[int, int, int, int], scale: int = 1, maximum_width: int | None = None) -> int:
    cursor_x, cursor_y = x, y
    line_height = max(g.height for g in glyphs.values()) * scale + 2 * scale
    for char in text:
        if char == "\n":
            cursor_x, cursor_y = x, cursor_y + line_height
            continue
        glyph = glyphs.get(char) or glyphs.get("?")
        if glyph is None:
            continue
        advance = glyph.xadvance * scale
        if maximum_width and cursor_x + advance > x + maximum_width and char != " ":
            cursor_x, cursor_y = x, cursor_y + line_height
        if cursor_y + glyph.height * scale > height:
            break
        _draw(canvas, width, height, glyph, cursor_x, cursor_y, colour, scale)
        cursor_x += advance
    return cursor_y + line_height

def specimen_png(font_id: str, glyphs: Mapping[str, Glyph], palette: Mapping[str, Any]) -> bytes:
    width, height = 1280, 720
    black = parse_colour(palette.get("black", "#000000"), "palette.black")
    white = parse_colour(palette.get("white", "#ffffff"), "palette.white")
    red = parse_colour(palette.get("signal", "#ff244e"), "palette.signal")
    grey = parse_colour(palette.get("mid", "#5a5a5a"), "palette.mid")
    canvas = _canvas(width, height, black)
    samples = [font_id.upper().replace("_", " ").replace("-", " "), "SAIL • SELL • SURVIVE   1871   £12 4s 6d", "PACK MY SHIP WITH FIVE DOZEN LIQUOR JUGS.", "Pack my ship with five dozen liquor jugs.", "NAVAL LOG  05:00  WIND NW 12kt  CARGO 074/120", "┌──────────────┬──────────────┐  ⚓ ⚠ ☠ ← → ↑ ↓", "0O 1Il 2Z 5S 6G 8B  rn m  cl d  punctuation: ,.;:!?"]
    bands = [(black, white), (white, black), (grey, white), (red, white)]
    band_height = height // len(bands)
    for index, (background, foreground) in enumerate(bands):
        top = index * band_height
        _fill(canvas, width, height, 0, top, width, band_height, background)
        y = top + 10
        for sample_index, sample in enumerate(samples):
            y = _text(canvas, width, height, glyphs, sample, 20, y, foreground, 2 if sample_index == 0 else 1, width - 40)
    return encode_png(width, height, bytes(canvas))

def glyph_sheet_png(glyphs: Mapping[str, Glyph], palette: Mapping[str, Any]) -> bytes:
    cell_width = max(g.width for g in glyphs.values()) + 8
    cell_height = max(g.height for g in glyphs.values()) + 8
    columns = 16
    rows = math.ceil(len(glyphs) / columns)
    width = next_power_of_two(max(256, columns * cell_width))
    height = next_power_of_two(max(64, rows * cell_height))
    if width * height > MAX_ATLAS_PIXELS:
        fail("glyph sheet exceeds image boundary")
    canvas = _canvas(width, height, parse_colour(palette.get("black", "#000000"), "palette.black"))
    foreground = parse_colour(palette.get("white", "#ffffff"), "palette.white")
    for index, glyph in enumerate(glyphs.values()):
        _draw(canvas, width, height, glyph, (index % columns) * cell_width + 4, (index // columns) * cell_height + 4, foreground)
    return encode_png(width, height, bytes(canvas))
