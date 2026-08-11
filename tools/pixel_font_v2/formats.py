"""Deterministic bitmap, BMFont, BDF, atlas, grid and TrueType formats."""
from .common import *
from .schema import *



def png_rgba(width: int, height: int, rgba: bytes) -> bytes:
    if len(rgba) != width * height * 4:
        fail("internal PNG buffer length mismatch")
    raw = b"".join(b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def decode_owned_png(data: bytes) -> tuple[int, int, bytes]:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        fail("PNG signature is invalid")
    offset = 8
    width = height = None
    compressed = bytearray()
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        crc = struct.unpack(">I", data[offset + 8 + length : offset + 12 + length])[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
            fail("PNG chunk CRC mismatch")
        offset += 12 + length
        if kind == b"IHDR":
            width, height, depth, colour, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if (depth, colour, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                fail("PNG is not owned 8-bit RGBA non-interlaced format")
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            break
    if width is None or height is None:
        fail("PNG is missing IHDR")
    raw = zlib.decompress(bytes(compressed))
    stride = width * 4
    expected = height * (stride + 1)
    if len(raw) != expected:
        fail("PNG decoded length mismatch")
    rows: list[bytes] = []
    for y in range(height):
        row = raw[y * (stride + 1) : (y + 1) * (stride + 1)]
        if row[0] != 0:
            fail("PNG uses an unsupported nonzero filter")
        rows.append(row[1:])
    return width, height, b"".join(rows)


def shelf_pack(records: Mapping[int, Mapping[str, Any]], max_edge: int, padding: int) -> tuple[int, int, list[tuple[int, Mapping[str, Any], int, int]]]:
    items = sorted(records.items(), key=lambda item: (-item[1]["height"], -item[1]["width"], item[0]))
    minimum_width = max(glyph["width"] + padding * 2 for _, glyph in items)
    candidates: list[tuple[int, int, list[tuple[int, Mapping[str, Any], int, int]]]] = []
    width = power_of_two_at_least(minimum_width, 64)
    while width <= max_edge:
        x = padding
        y = padding
        row_height = 0
        placed: list[tuple[int, Mapping[str, Any], int, int]] = []
        valid = True
        for cp, glyph in items:
            if x + glyph["width"] + padding > width:
                x = padding
                y += row_height + padding
                row_height = 0
            if y + glyph["height"] + padding > max_edge:
                valid = False
                break
            placed.append((cp, glyph, x, y))
            x += glyph["width"] + padding
            row_height = max(row_height, glyph["height"])
        if valid:
            height = power_of_two_at_least(y + row_height + padding, 32)
            if height <= max_edge:
                candidates.append((width, height, placed))
        width <<= 1
    if not candidates:
        fail(f"font atlas exceeds configured maximum edge {max_edge}")
    return min(candidates, key=lambda candidate: (candidate[0] * candidate[1], max(candidate[0], candidate[1]), candidate[0]))


def bmfont_escape(value: str) -> str:
    return value.replace('"', "").replace("\n", " ").replace("\r", " ")


def parse_bmfont(text: str) -> dict[str, Any]:
    result: dict[str, Any] = {"chars": {}, "kernings": {}}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = shlex.split(line)
        section = parts[0]
        values: dict[str, str] = {}
        for token in parts[1:]:
            if "=" in token:
                key, value = token.split("=", 1)
                values[key] = value
        if section in {"info", "common", "page"}:
            result[section] = values
        elif section == "chars":
            result["charsHeader"] = values
        elif section == "kernings":
            result["kerningsHeader"] = values
        elif section == "char":
            cp = int(values["id"])
            result["chars"][cp] = {key: int(value) for key, value in values.items() if key != "letter"}
        elif section == "kerning":
            key = (int(values["first"]), int(values["second"]))
            result["kernings"][key] = int(values["amount"])
    return result


def render_text_pixels(
    text: str,
    records: Mapping[int, Mapping[str, Any]],
    kerning: Mapping[tuple[int, int], int],
    start_x: int,
    start_y: int,
) -> tuple[set[tuple[int, int]], int]:
    cursor = start_x
    previous: int | None = None
    pixels: set[tuple[int, int]] = set()
    for character in text:
        cp = ord(character)
        glyph = records.get(cp)
        if glyph is None:
            fail(f"specimen text requires missing glyph U+{cp:04X}")
        if previous is not None:
            cursor += kerning.get((previous, cp), 0)
        pixels.update((cursor + x, start_y + y) for x, y in glyph_pixel_set(glyph))
        cursor += glyph["xAdvance"]
        previous = cp
    return pixels, cursor


def render_specimen(face: Mapping[str, Any], specimen: Mapping[str, Any]) -> bytes:
    width = specimen["width"]
    height = specimen["height"]
    rgba = bytearray(width * height * 4)
    for index in range(width * height):
        rgba[index * 4 + 3] = 255
    records = {glyph["codepoint"]: glyph for glyph in face["glyphs"]}
    kern = {(item["first"], item["second"]): item["amount"] for item in face["kerning"]}
    margin = 8
    for x in range(margin, width - margin):
        for y in (margin - 2, height - margin + 1):
            if 0 <= y < height:
                offset = (y * width + x) * 4
                rgba[offset : offset + 4] = b"\xff\xff\xff\xff"
    cursor_y = margin + 4
    for line in specimen["lines"]:
        if cursor_y + face["metrics"]["lineHeight"] >= height - margin:
            fail(f"specimen for {face['faceId']} exceeds {width}x{height}")
        pixels, end_x = render_text_pixels(line, records, kern, margin, cursor_y)
        if end_x > width - margin:
            fail(f"specimen line for {face['faceId']} exceeds width {width}: {line!r}")
        for x, y in pixels:
            if 0 <= x < width and 0 <= y < height:
                offset = (y * width + x) * 4
                rgba[offset : offset + 4] = b"\xff\xff\xff\xff"
        cursor_y += face["metrics"]["lineHeight"] + 2
    return png_rgba(width, height, bytes(rgba))


def nearest_scale_png(png: bytes, scale: int) -> bytes:
    width, height, rgba = decode_owned_png(png)
    out_width = width * scale
    out_height = height * scale
    if out_width > MAX_SPECIMEN_EDGE or out_height > MAX_SPECIMEN_EDGE:
        fail("scaled specimen exceeds maximum edge")
    out = bytearray(out_width * out_height * 4)
    for y in range(out_height):
        source_y = y // scale
        for x in range(out_width):
            source_x = x // scale
            source = (source_y * width + source_x) * 4
            target = (y * out_width + x) * 4
            out[target : target + 4] = rgba[source : source + 4]
    return png_rgba(out_width, out_height, bytes(out))


def glyph_name(cp: int) -> str:
    return f"uni{cp:04X}" if cp <= 0xFFFF else f"u{cp:06X}"



def bdf_row_hex(row: str) -> str:
    padded = row + "." * ((8 - len(row) % 8) % 8)
    if not padded:
        return "00"
    return "".join(
        f"{int(padded[index:index + 8].replace('#', '1').replace('.', '0'), 2):02X}"
        for index in range(0, len(padded), 8)
    )


def build_bdf(face: Mapping[str, Any], destination: Path, license_info: Mapping[str, str]) -> dict[str, Any]:
    records = sorted(face["glyphs"], key=lambda glyph: glyph["codepoint"])
    metrics = face["metrics"]
    baseline = metrics["baseline"]
    bounding = [
        (
            glyph["width"],
            glyph["height"],
            glyph["xOffset"],
            baseline - (glyph["yOffset"] + glyph["height"]),
        )
        for glyph in records
    ]
    max_width = max(width for width, _height, _x, _y in bounding)
    max_height = max(height for _width, height, _x, _y in bounding)
    min_x = min(x for _width, _height, x, _y in bounding)
    min_y = min(y for _width, _height, _x, y in bounding)
    default_char = 0xFFFD if any(glyph["codepoint"] == 0xFFFD for glyph in records) else 0x3F
    font_name = re.sub(r"[^A-Za-z0-9_-]", "_", face["displayName"])
    lines = [
        "STARTFONT 2.1",
        f"COMMENT Generated by EVAVO Pixel Font Studio {TOOL_VERSION}",
        f"COMMENT {license_info['copyright']}",
        f"FONT -EVAVO-{font_name}-MEDIUM-R-NORMAL--{metrics['lineHeight']}-0-75-75-P-0-ISO10646-1",
        f"SIZE {metrics['lineHeight']} 75 75",
        f"FONTBOUNDINGBOX {max_width} {max_height} {min_x} {min_y}",
        "STARTPROPERTIES 8",
        f"FONT_ASCENT {metrics['ascent']}",
        f"FONT_DESCENT {metrics['descent']}",
        f"CAP_HEIGHT {metrics['capHeight']}",
        f"X_HEIGHT {metrics['xHeight']}",
        f"PIXEL_SIZE {metrics['lineHeight']}",
        f"DEFAULT_CHAR {default_char}",
        'SPACING "P"',
        f'COPYRIGHT "{license_info["copyright"].replace(chr(34), chr(39))}"',
        "ENDPROPERTIES",
        f"CHARS {len(records)}",
    ]
    for glyph in records:
        bottom = baseline - (glyph["yOffset"] + glyph["height"])
        scalable_width = round(glyph["xAdvance"] * 1000 / max(1, metrics["lineHeight"]))
        lines.extend(
            [
                f"STARTCHAR {glyph_name(glyph['codepoint'])}",
                f"ENCODING {glyph['codepoint']}",
                f"SWIDTH {scalable_width} 0",
                f"DWIDTH {glyph['xAdvance']} 0",
                f"BBX {glyph['width']} {glyph['height']} {glyph['xOffset']} {bottom}",
                "BITMAP",
            ]
        )
        lines.extend(bdf_row_hex(row) for row in glyph["bitmap"])
        lines.append("ENDCHAR")
    lines.append("ENDFONT")
    write_create_only(destination, ("\n".join(lines) + "\n").encode("ascii"))
    return {
        "format": "BDF 2.1",
        "canonicalRuntime": False,
        "glyphCount": len(records),
        "sha256": sha256_file(destination),
    }


def parse_bdf(path: Path) -> dict[str, Any]:
    lines = path.read_text(encoding="ascii").splitlines()
    if not lines or lines[0] != "STARTFONT 2.1" or lines[-1] != "ENDFONT":
        fail(f"BDF framing is invalid in {path}")
    declared = next((int(line.split()[1]) for line in lines if line.startswith("CHARS ")), None)
    encodings = [int(line.split()[1]) for line in lines if line.startswith("ENCODING ")]
    dwidths = [tuple(map(int, line.split()[1:3])) for line in lines if line.startswith("DWIDTH ")]
    if declared is None or declared != len(encodings) or len(dwidths) != len(encodings):
        fail(f"BDF character count is invalid in {path}")
    return {"glyphCount": len(encodings), "codepoints": encodings, "dwidths": dwidths}


def build_atlas_json(
    face: Mapping[str, Any],
    destination: Path,
    atlas_name: str,
    width: int,
    height: int,
    padding: int,
    placed: Sequence[tuple[int, Mapping[str, Any], int, int]],
) -> dict[str, Any]:
    payload = {
        "schema": "evavo.pixel-font-atlas.v1",
        "toolVersion": TOOL_VERSION,
        "faceId": face["faceId"],
        "displayName": face["displayName"],
        "image": atlas_name,
        "width": width,
        "height": height,
        "padding": padding,
        "metrics": face["metrics"],
        "glyphs": [
            {
                "codepoint": cp,
                "character": glyph["character"],
                "x": atlas_x,
                "y": atlas_y,
                "width": glyph["width"],
                "height": glyph["height"],
                "xOffset": glyph["xOffset"],
                "yOffset": glyph["yOffset"],
                "xAdvance": glyph["xAdvance"],
            }
            for cp, glyph, atlas_x, atlas_y in sorted(placed, key=lambda item: item[0])
        ],
        "kerning": face["kerning"],
    }
    write_json_create_only(destination, payload)
    return {"format": "EVAVO atlas JSON v1", "glyphCount": len(payload["glyphs"]), "sha256": sha256_file(destination)}


def build_grid_sheet(face: Mapping[str, Any], png_destination: Path, json_destination: Path) -> dict[str, Any]:
    records = sorted(face["glyphs"], key=lambda glyph: glyph["codepoint"])
    columns = 16
    rows = math.ceil(len(records) / columns)
    minimum_x = min(0, min(glyph["xOffset"] for glyph in records))
    maximum_x = max(max(glyph["xAdvance"], glyph["xOffset"] + glyph["width"]) for glyph in records)
    minimum_y = min(0, min(glyph["yOffset"] for glyph in records))
    maximum_y = max(face["metrics"]["lineHeight"], max(glyph["yOffset"] + glyph["height"] for glyph in records))
    cell_width = maximum_x - minimum_x + 2
    cell_height = maximum_y - minimum_y + 2
    width = columns * cell_width
    height = rows * cell_height
    if width > MAX_SPECIMEN_EDGE or height > MAX_SPECIMEN_EDGE:
        fail(f"grid sheet for {face['faceId']} exceeds maximum edge")
    rgba = bytearray(width * height * 4)
    cells: list[dict[str, Any]] = []
    for index, glyph in enumerate(records):
        column = index % columns
        row_index = index // columns
        cell_x = column * cell_width
        cell_y = row_index * cell_height
        origin_x = cell_x + 1 - minimum_x
        origin_y = cell_y + 1 - minimum_y
        for y, bitmap_row in enumerate(glyph["bitmap"]):
            for x, value in enumerate(bitmap_row):
                if value != "#":
                    continue
                target_x = origin_x + glyph["xOffset"] + x
                target_y = origin_y + glyph["yOffset"] + y
                offset = (target_y * width + target_x) * 4
                rgba[offset : offset + 4] = b"\xff\xff\xff\xff"
        cells.append(
            {
                "index": index,
                "codepoint": glyph["codepoint"],
                "character": glyph["character"],
                "cell": {"x": cell_x, "y": cell_y, "width": cell_width, "height": cell_height},
                "origin": {"x": origin_x, "y": origin_y},
                "xOffset": glyph["xOffset"],
                "yOffset": glyph["yOffset"],
                "xAdvance": glyph["xAdvance"],
                "width": glyph["width"],
                "height": glyph["height"],
            }
        )
    write_create_only(png_destination, png_rgba(width, height, bytes(rgba)))
    payload = {
        "schema": "evavo.pixel-font-grid-sheet.v1",
        "toolVersion": TOOL_VERSION,
        "faceId": face["faceId"],
        "image": png_destination.name,
        "columns": columns,
        "rows": rows,
        "width": width,
        "height": height,
        "cellWidth": cell_width,
        "cellHeight": cell_height,
        "minimumX": minimum_x,
        "minimumY": minimum_y,
        "metrics": face["metrics"],
        "cells": cells,
    }
    write_json_create_only(json_destination, payload)
    return {
        "format": "transparent review grid PNG + JSON",
        "glyphCount": len(records),
        "columns": columns,
        "rows": rows,
        "cell": [cell_width, cell_height],
        "imageSha256": sha256_file(png_destination),
        "mapSha256": sha256_file(json_destination),
    }


def build_ttf(face: Mapping[str, Any], destination: Path, pixel_units: int, license_info: Mapping[str, str]) -> dict[str, Any]:
    try:
        from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
        from fontTools.fontBuilder import FontBuilder
        from fontTools.pens.ttGlyphPen import TTGlyphPen
        from fontTools.ttLib import TTFont, newTable
        from fontTools.ttLib.tables._k_e_r_n import KernTable_format_0
    except ImportError as exc:
        fail("TTF output requires fontTools; install requirements/pixel-font-studio-v2.txt")

    records = {glyph["codepoint"]: glyph for glyph in face["glyphs"]}
    glyph_order = [".notdef"] + [glyph_name(cp) for cp in sorted(records)]
    units_per_em = power_of_two_at_least(face["metrics"]["lineHeight"] * pixel_units, 1024)
    fb = FontBuilder(units_per_em, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    cmap = {cp: glyph_name(cp) for cp in sorted(records)}
    fb.setupCharacterMap(cmap)

    glyphs: dict[str, Any] = {}
    horizontal_metrics: dict[str, tuple[int, int]] = {}
    pen = TTGlyphPen(None)
    glyphs[".notdef"] = pen.glyph()
    horizontal_metrics[".notdef"] = (face["metrics"]["spaceAdvance"] * pixel_units, 0)
    baseline = face["metrics"]["baseline"]
    for cp in sorted(records):
        record = records[cp]
        pen = TTGlyphPen(None)
        for y, row in enumerate(record["bitmap"]):
            for x, value in enumerate(row):
                if value != "#":
                    continue
                left = (record["xOffset"] + x) * pixel_units
                right = left + pixel_units
                top = (baseline - (record["yOffset"] + y)) * pixel_units
                bottom = top - pixel_units
                pen.moveTo((left, bottom))
                pen.lineTo((right, bottom))
                pen.lineTo((right, top))
                pen.lineTo((left, top))
                pen.closePath()
        name = glyph_name(cp)
        glyphs[name] = pen.glyph()
        horizontal_metrics[name] = (record["xAdvance"] * pixel_units, record["xOffset"] * pixel_units)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(horizontal_metrics)
    ascent = face["metrics"]["ascent"] * pixel_units
    descent = -face["metrics"]["descent"] * pixel_units
    line_gap = max(0, face["metrics"]["lineHeight"] * pixel_units - ascent + descent)
    fb.setupHorizontalHeader(ascent=ascent, descent=descent, lineGap=line_gap)
    fb.setupNameTable(
        {
            "familyName": face["displayName"],
            "styleName": "Regular",
            "uniqueFontIdentifier": f"EVAVO:{face['familyId']}:{face['faceId']}:{face['version']}",
            "fullName": face["displayName"],
            "psName": re.sub(r"[^A-Za-z0-9-]", "", face["displayName"].replace(" ", "-"))[:63],
            "version": f"Version {face['version']}",
            "copyright": license_info["copyright"],
            "licenseDescription": license_info["text"],
            "licenseInfoURL": license_info.get("url", ""),
        }
    )
    fb.setupOS2(
        sTypoAscender=ascent,
        sTypoDescender=descent,
        sTypoLineGap=line_gap,
        usWinAscent=max(0, ascent),
        usWinDescent=max(0, -descent),
        sxHeight=face["metrics"]["xHeight"] * pixel_units,
        sCapHeight=face["metrics"]["capHeight"] * pixel_units,
        usWeightClass=400,
        usWidthClass=5,
        fsSelection=0x40,
        fsType=0,
    )
    fb.setupPost(keepGlyphNames=True)
    fb.setupMaxp()
    font = fb.font
    # FontTools otherwise writes the current clock into head.modified, breaking exact builds.
    font.recalcTimestamp = False
    font["head"].created = 3786912000
    font["head"].modified = 3786912000

    kerning_pairs = {
        (glyph_name(item["first"]), glyph_name(item["second"])): item["amount"] * pixel_units
        for item in face["kerning"]
    }
    if kerning_pairs:
        feature_lines = ["languagesystem DFLT dflt;", "feature kern {"]
        feature_lines.extend(f"  pos {left} {right} {amount};" for (left, right), amount in sorted(kerning_pairs.items()))
        feature_lines.append("} kern;")
        addOpenTypeFeaturesFromString(font, "\n".join(feature_lines))
        kern_table = newTable("kern")
        kern_table.version = 0
        subtable = KernTable_format_0()
        subtable.version = 0
        subtable.coverage = 1
        subtable.kernTable = kerning_pairs
        kern_table.kernTables = [subtable]
        font["kern"] = kern_table

    destination.parent.mkdir(parents=True, exist_ok=True)
    font.save(destination)
    reopened = TTFont(destination, recalcBBoxes=False, recalcTimestamp=False)
    best_cmap = reopened.getBestCmap() or {}
    if set(best_cmap) != set(records):
        fail(f"TTF cmap mismatch for {face['faceId']}")
    if kerning_pairs and "kern" not in reopened and "GPOS" not in reopened:
        fail(f"TTF kerning tables missing for {face['faceId']}")
    if reopened["head"].unitsPerEm != units_per_em:
        fail(f"TTF unitsPerEm mismatch for {face['faceId']}")
    if reopened["OS/2"].fsType != 0:
        fail(f"TTF embedding bits must be unrestricted for authorised project use: {face['faceId']}")
    reopened.close()
    return {
        "format": "TrueType",
        "canonicalRuntime": False,
        "glyphCount": len(records),
        "kerningPairCount": len(kerning_pairs),
        "unitsPerEm": units_per_em,
        "pixelUnits": pixel_units,
        "embeddingFsType": 0,
        "sha256": sha256_file(destination),
    }
