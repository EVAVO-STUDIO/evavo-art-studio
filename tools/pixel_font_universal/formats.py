"""Deterministic PNG, BMFont, BDF, TTF and review-grid formats."""
from .common import *
from .source import *
from .operations import *
from .packing import *

def png_rgba(width: int, height: int, rgba: bytes) -> bytes:
    if width < 1 or height < 1 or len(rgba) != width * height * 4:
        fail("internal PNG dimensions or RGBA buffer are invalid")
    raw = b"".join(b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return PNG_SIGNATURE + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def decode_png(data: bytes, label: str) -> tuple[int, int, bytes]:
    if not data.startswith(PNG_SIGNATURE):
        fail(f"{label} is not a PNG")
    offset = len(PNG_SIGNATURE)
    width = height = None
    compressed = bytearray()
    saw_end = False
    while offset < len(data):
        if offset + 12 > len(data):
            fail(f"{label} has a truncated chunk")
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        end = offset + 12 + length
        if length > MAX_INPUT_BYTES or end > len(data):
            fail(f"{label} has an invalid chunk length")
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        stored_crc = struct.unpack(">I", data[offset + 8 + length : end])[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != stored_crc:
            fail(f"{label} chunk CRC mismatch")
        offset = end
        if kind == b"IHDR":
            if length != 13:
                fail(f"{label} has an invalid IHDR")
            width, height, depth, colour, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if (depth, colour, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                fail(f"{label} must be 8-bit RGBA non-interlaced PNG")
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            if length != 0:
                fail(f"{label} has an invalid IEND")
            saw_end = True
            break
        elif kind[0] & 0x20 == 0:
            fail(f"{label} contains unsupported critical chunk {kind!r}")
    if width is None or height is None or not saw_end or offset != len(data):
        fail(f"{label} framing is incomplete or has trailing data")
    raw = zlib.decompress(bytes(compressed))
    stride = width * 4
    if len(raw) != height * (stride + 1):
        fail(f"{label} decoded length mismatch")
    rows: list[bytes] = []
    for y in range(height):
        row = raw[y * (stride + 1) : (y + 1) * (stride + 1)]
        if row[0] != 0:
            fail(f"{label} uses an unsupported PNG filter")
        rows.append(row[1:])
    return width, height, b"".join(rows)


def render_pages(rectangles: Sequence[Rectangle], width: int, height: int, page_count: int, background: RGBA) -> list[bytes]:
    pages: list[bytes] = []
    for page_index in range(page_count):
        rgba = bytearray(width * height * 4)
        for index in range(width * height):
            rgba[index * 4 : index * 4 + 4] = bytes(background)
        for item in rectangles:
            if item.page != page_index:
                continue
            for (x, y), colour in item.pixels.items():
                target_x = item.x + x - item.xoffset
                target_y = item.y + y - item.yoffset
                if not 0 <= target_x < width or not 0 <= target_y < height:
                    fail("internal atlas placement escaped the page")
                offset = (target_y * width + target_x) * 4
                current = tuple(rgba[offset : offset + 4])  # type: ignore[assignment]
                rgba[offset : offset + 4] = bytes(alpha_composite(current, colour))
        pages.append(png_rgba(width, height, bytes(rgba)))
    return pages


def bmfont_text(face: Mapping[str, Any], profile: Mapping[str, Any], strike: int, rectangles: Sequence[Rectangle], page_names: Sequence[str], width: int, height: int, line_height: int, baseline: int) -> bytes:
    name = face["displayName"].replace('"', "")
    lines = [
        f'info face="{name}" size={line_height} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=0 padding=0,0,0,0 spacing=0,0',
        f"common lineHeight={line_height} base={baseline} scaleW={width} scaleH={height} pages={len(page_names)} packed=0 alphaChnl=0 redChnl=4 greenChnl=4 blueChnl=4",
    ]
    for index, page_name in enumerate(page_names):
        lines.append(f'page id={index} file="{page_name}"')
    by_codepoint = {item.codepoint: item for item in rectangles}
    glyphs = face["glyphs"]
    lines.append(f"chars count={len(glyphs)}")
    for glyph in glyphs:
        item = by_codepoint.get(glyph["codepoint"])
        if item is None:
            values = {"x": 0, "y": 0, "width": 0, "height": 0, "xoffset": 0, "yoffset": 0, "xadvance": spacing_advance(glyph, profile) * strike, "page": 0}
        else:
            values = {"x": item.x, "y": item.y, "width": item.width, "height": item.height, "xoffset": item.xoffset, "yoffset": item.yoffset, "xadvance": item.advance, "page": item.page}
        lines.append(
            "char id={codepoint} x={x} y={y} width={width} height={height} xoffset={xoffset} yoffset={yoffset} xadvance={xadvance} page={page} chnl=15".format(codepoint=glyph["codepoint"], **values)
        )
    kerning = face["kerning"]
    lines.append(f"kernings count={len(kerning)}")
    for pair in kerning:
        lines.append(f"kerning first={pair['first']} second={pair['second']} amount={pair['amount'] * strike}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def parse_bmfont(value: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "pages": {},
        "chars": {},
        "kernings": {},
        "charsHeader": {},
        "kerningsHeader": {},
    }
    for raw_line in value.splitlines():
        parts = shlex.split(raw_line)
        if not parts:
            continue
        section = parts[0]
        fields: dict[str, str] = {}
        for token in parts[1:]:
            if "=" in token:
                key, field_value = token.split("=", 1)
                fields[key] = field_value
        if section in {"info", "common"}:
            result[section] = fields
        elif section == "chars":
            result["charsHeader"] = fields
        elif section == "kernings":
            result["kerningsHeader"] = fields
        elif section == "page":
            page_id = int(fields["id"])
            if page_id in result["pages"]:
                fail(f"BMFont duplicates page id {page_id}")
            result["pages"][page_id] = fields["file"]
        elif section == "char":
            cp = int(fields["id"])
            if cp in result["chars"]:
                fail(f"BMFont duplicates char id {cp}")
            result["chars"][cp] = {
                key: int(field_value)
                for key, field_value in fields.items()
                if key != "letter"
            }
        elif section == "kerning":
            pair = (int(fields["first"]), int(fields["second"]))
            if pair in result["kernings"]:
                fail(f"BMFont duplicates kerning pair {pair}")
            result["kernings"][pair] = int(fields["amount"])
    return result


def bdf_text(face: Mapping[str, Any], strike: int, rectangles: Sequence[Rectangle], line_height: int, baseline: int) -> bytes:
    by_cp = {item.codepoint: item for item in rectangles}
    lines = [
        "STARTFONT 2.1",
        f"FONT -EVAVO-{face['faceId'].replace('-', '_')}-MEDIUM-R-NORMAL--{line_height * 10}-0-75-75-C-0-ISO10646-1",
        f"SIZE {line_height} 75 75",
        f"FONTBOUNDINGBOX {max((item.width for item in rectangles), default=1)} {line_height} 0 {baseline - line_height}",
        "STARTPROPERTIES 4",
        f"FONT_ASCENT {baseline}",
        f"FONT_DESCENT {line_height - baseline}",
        "DEFAULT_CHAR 65533",
        f"PIXEL_SIZE {line_height}",
        "ENDPROPERTIES",
        f"CHARS {len(face['glyphs'])}",
    ]
    for glyph in face["glyphs"]:
        cp = glyph["codepoint"]
        item = by_cp.get(cp)
        rows: list[str] = []
        width = height = xoffset = yoffset = 0
        advance = spacing_advance(glyph, {"spacing": {"mode": "preserve", "tracking": 0}}) * strike
        if item:
            width, height, xoffset, yoffset, advance = item.width, item.height, item.xoffset, item.yoffset, item.advance
            local = {(x - item.xoffset, y - item.yoffset) for (x, y), colour in item.pixels.items() if colour[3] >= 128}
            for y in range(height):
                bits = "".join("1" if (x, y) in local else "0" for x in range(width))
                bits += "0" * ((8 - len(bits) % 8) % 8)
                rows.append("".join(f"{int(bits[index:index+8], 2):02X}" for index in range(0, len(bits), 8)) or "00")
        lines.extend([
            f"STARTCHAR uni{cp:04X}",
            f"ENCODING {cp}",
            f"SWIDTH {advance * 100} 0",
            f"DWIDTH {advance} 0",
            f"BBX {width} {height} {xoffset} {line_height - baseline - yoffset - height}",
            "BITMAP",
            *rows,
            "ENDCHAR",
        ])
    lines.append("ENDFONT")
    return ("\n".join(lines) + "\n").encode("ascii")


def ttf_bytes(face: Mapping[str, Any], rectangles: Sequence[Rectangle], line_height: int, baseline: int, units: int) -> bytes:
    try:
        from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
        from fontTools.fontBuilder import FontBuilder
        from fontTools.pens.ttGlyphPen import TTGlyphPen
        from fontTools.ttLib import newTable
        from fontTools.ttLib.tables._k_e_r_n import KernTable_format_0
    except ImportError as exc:
        fail("TTF output requires fonttools==4.63.0")
    import fontTools
    if fontTools.__version__ != "4.63.0":
        fail(f"TTF output requires fonttools==4.63.0, observed {fontTools.__version__}")
    by_cp = {item.codepoint: item for item in rectangles}
    order = [".notdef"] + [f"uni{glyph['codepoint']:04X}" for glyph in face["glyphs"]]
    upm = 2048
    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({glyph["codepoint"]: f"uni{glyph['codepoint']:04X}" for glyph in face["glyphs"]})
    outlines: dict[str, Any] = {}
    hmtx: dict[str, tuple[int, int]] = {".notdef": (units * 8, 0)}
    pen = TTGlyphPen(None)
    pen.moveTo((0, 0)); pen.lineTo((units * 6, 0)); pen.lineTo((units * 6, units * 8)); pen.lineTo((0, units * 8)); pen.closePath()
    outlines[".notdef"] = pen.glyph()
    for glyph in face["glyphs"]:
        cp = glyph["codepoint"]
        item = by_cp.get(cp)
        pen = TTGlyphPen(None)
        if item:
            for (x, y), colour in sorted(item.pixels.items(), key=lambda entry: (entry[0][1], entry[0][0])):
                if colour[3] < 128:
                    continue
                x0 = x * units
                y1 = (baseline - y) * units
                pen.moveTo((x0, y1 - units)); pen.lineTo((x0 + units, y1 - units)); pen.lineTo((x0 + units, y1)); pen.lineTo((x0, y1)); pen.closePath()
            advance = item.advance
        else:
            advance = max(1, glyph["xAdvance"])
        name = f"uni{cp:04X}"
        outlines[name] = pen.glyph()
        hmtx[name] = (advance * units, 0)
    fb.setupGlyf(outlines)
    fb.setupHorizontalMetrics(hmtx)
    ascent = baseline * units
    descent = -(line_height - baseline) * units
    fb.setupHorizontalHeader(ascent=ascent, descent=descent, lineGap=0)
    family = face["displayName"]
    postscript = "".join(character for character in face["faceId"].title() if character.isalnum())
    fb.setupNameTable({"familyName": family, "styleName": "Regular", "uniqueFontIdentifier": f"EVAVO:{face['faceId']}:{face['version']}", "fullName": family, "psName": postscript, "version": f"Version {face['version']}", "copyright": "Copyright EVAVO Studio. All rights reserved."})
    fb.setupOS2(sTypoAscender=ascent, sTypoDescender=descent, sTypoLineGap=0, usWinAscent=max(0, ascent), usWinDescent=max(0, -descent), fsType=0)
    fb.setupPost(keepGlyphNames=True)
    fb.setupMaxp()
    font = fb.font
    font.recalcTimestamp = False
    fixed_timestamp = 2082844800 + 1577836800
    font["head"].created = fixed_timestamp
    font["head"].modified = fixed_timestamp
    gasp = newTable("gasp"); gasp.gaspRange = {65535: 0x0001}; font["gasp"] = gasp
    pairs = [pair for pair in face["kerning"] if pair["first"] in by_cp and pair["second"] in by_cp]
    if pairs:
        kern = newTable("kern"); kern.version = 0
        subtable = KernTable_format_0(); subtable.version = 0; subtable.coverage = 1; subtable.format = 0
        subtable.kernTable = {(f"uni{pair['first']:04X}", f"uni{pair['second']:04X}"): pair["amount"] * units for pair in pairs}
        kern.kernTables = [subtable]; font["kern"] = kern
        feature = "feature kern {\n" + "\n".join(f"pos uni{pair['first']:04X} uni{pair['second']:04X} {pair['amount'] * units};" for pair in pairs) + "\n} kern;\n"
        addOpenTypeFeaturesFromString(font, feature)
    import io
    stream = io.BytesIO(); font.save(stream, reorderTables=True); return stream.getvalue()


def grid_sheet(rectangles: Sequence[Rectangle], background: RGBA, columns: int = 16) -> tuple[bytes, dict[str, Any]]:
    cell_width = max((item.width for item in rectangles), default=1) + 4
    cell_height = max((item.height for item in rectangles), default=1) + 4
    rows = max(1, math.ceil(len(rectangles) / columns))
    width, height = columns * cell_width, rows * cell_height
    rgba = bytearray(width * height * 4)
    for index in range(width * height):
        rgba[index * 4 : index * 4 + 4] = bytes(background)
    mapping: list[dict[str, int]] = []
    for index, item in enumerate(sorted(rectangles, key=lambda candidate: candidate.codepoint)):
        cell_x, cell_y = (index % columns) * cell_width, (index // columns) * cell_height
        for (x, y), colour in item.pixels.items():
            target_x = cell_x + 2 + x - item.xoffset
            target_y = cell_y + 2 + y - item.yoffset
            if 0 <= target_x < width and 0 <= target_y < height:
                offset = (target_y * width + target_x) * 4
                rgba[offset : offset + 4] = bytes(alpha_composite(tuple(rgba[offset : offset + 4]), colour))
        mapping.append({"codepoint": item.codepoint, "cellX": cell_x, "cellY": cell_y, "cellWidth": cell_width, "cellHeight": cell_height})
    return png_rgba(width, height, bytes(rgba)), {"width": width, "height": height, "columns": columns, "cellWidth": cell_width, "cellHeight": cell_height, "glyphs": mapping}


