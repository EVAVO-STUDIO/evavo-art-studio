"""Universal binary, indexed, RGBA, layered and component face sources."""
from .common import *

def _raw_glyph_pixels(
    glyph: Mapping[str, Any],
    *,
    mode: str,
    palette: Mapping[str, RGBA],
    label: str,
) -> tuple[PixelMap, int, int]:
    if "layers" in glyph:
        layers = glyph["layers"]
        if not isinstance(layers, list) or not 1 <= len(layers) <= MAX_LAYERS:
            fail(f"{label}.layers must contain 1..{MAX_LAYERS} entries")
        merged: PixelMap = {}
        maximum_x = maximum_y = 0
        for index, layer in enumerate(layers):
            layer_label = f"{label}.layers[{index}]"
            if not isinstance(layer, dict):
                fail(f"{layer_label} must be an object")
            rows = normalise_binary_rows(layer.get("bitmap"), f"{layer_label}.bitmap")
            colour = parse_colour(
                layer.get("colour", layer.get("color", "#ffffffff")),
                f"{layer_label}.colour",
            )
            dx = bounded_int(layer.get("dx", 0), f"{layer_label}.dx", -4096, 4096)
            dy = bounded_int(layer.get("dy", 0), f"{layer_label}.dy", -4096, 4096)
            pixels = {(x + dx, y + dy): c for (x, y), c in bitmap_to_pixels(rows, colour).items()}
            merged = merge_maps(merged, pixels)
            maximum_x = max(maximum_x, dx + len(rows[0]))
            maximum_y = max(maximum_y, dy + len(rows))
        return merged, max(1, maximum_x), max(1, maximum_y)
    if mode == "binary":
        rows = normalise_binary_rows(glyph.get("bitmap"), f"{label}.bitmap")
        return bitmap_to_pixels(rows, palette["#"]), len(rows[0]), len(rows)
    if mode == "indexed":
        rows = normalise_indexed_rows(glyph.get("bitmap"), f"{label}.bitmap", palette)
        pixels: PixelMap = {}
        for y, row in enumerate(rows):
            for x, symbol in enumerate(row):
                if symbol != "." and palette[symbol][3] > 0:
                    pixels[(x, y)] = palette[symbol]
        return pixels, len(rows[0]), len(rows)
    if mode == "rgba":
        rows = normalise_rgba_rows(glyph.get("pixels", glyph.get("bitmap")), f"{label}.pixels")
        return rgba_to_pixels(rows), len(rows[0]), len(rows)
    fail(f"{label} uses unsupported pixel mode {mode!r}")


def normalise_face(value: Any, *, label: str = "face") -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    schema = value.get("schema")
    if schema not in {V2_FACE_SCHEMA, FACE_SCHEMA}:
        fail(f"{label}.schema must be {V2_FACE_SCHEMA} or {FACE_SCHEMA}")
    family_id = safe_id(value.get("familyId"), f"{label}.familyId")
    face_id = safe_id(value.get("faceId"), f"{label}.faceId")
    display_name = text(value.get("displayName", face_id), f"{label}.displayName", 256)
    version = text(value.get("version", "1.0.0"), f"{label}.version", 64)
    kind = text(value.get("kind", "custom-pixel-font"), f"{label}.kind", 256)
    tags_raw = value.get("styleTags", [])
    if not isinstance(tags_raw, list) or len(tags_raw) > 128 or not all(
        isinstance(item, str) and 0 < len(item) <= 128 for item in tags_raw
    ):
        fail(f"{label}.styleTags must be an array of at most 128 non-empty strings")
    design_intent = text(
        value.get("designIntent", "Author-defined pixel-font design."),
        f"{label}.designIntent",
        4096,
    )
    mode = value.get("pixelMode", "binary")
    if mode not in {"binary", "indexed", "rgba", "layered"}:
        fail(f"{label}.pixelMode must be binary, indexed, rgba or layered")
    source_mode = "binary" if mode == "layered" else mode
    palette = normalise_palette(value.get("palette"), source_mode, f"{label}.palette")
    metrics = normalise_metrics(value.get("metrics"), f"{label}.metrics")
    raw_glyphs = value.get("glyphs")
    if not isinstance(raw_glyphs, list) or not 1 <= len(raw_glyphs) <= MAX_GLYPHS:
        fail(f"{label}.glyphs must contain 1..{MAX_GLYPHS} entries")

    raw_records: dict[int, dict[str, Any]] = {}
    for index, raw in enumerate(raw_glyphs):
        glyph_label = f"{label}.glyphs[{index}]"
        if not isinstance(raw, dict):
            fail(f"{glyph_label} must be an object")
        cp = codepoint(raw.get("codepoint"), f"{glyph_label}.codepoint")
        if cp in raw_records:
            fail(f"{glyph_label} duplicates U+{cp:04X}")
        has_components = isinstance(raw.get("components"), list) and bool(raw.get("components"))
        has_direct_source = any(key in raw for key in ("bitmap", "pixels", "layers"))
        if has_components and not has_direct_source:
            inferred_width = bounded_int(raw.get("width"), f"{glyph_label}.width", 1, MAX_GLYPH_EDGE)
            inferred_height = bounded_int(raw.get("height"), f"{glyph_label}.height", 1, MAX_GLYPH_EDGE)
            pixels = {}
        else:
            pixels, inferred_width, inferred_height = _raw_glyph_pixels(
                raw, mode=source_mode, palette=palette, label=glyph_label
            )
        width = bounded_int(raw.get("width", inferred_width), f"{glyph_label}.width", 1, MAX_GLYPH_EDGE)
        height = bounded_int(raw.get("height", inferred_height), f"{glyph_label}.height", 1, MAX_GLYPH_EDGE)
        if not has_components and (width != inferred_width or height != inferred_height):
            fail(f"{glyph_label} width/height must exactly describe its direct source bitmap")
        bearing_x = bounded_int(
            raw.get("xOffset", raw.get("bearingX", 0)), f"{glyph_label}.xOffset", -4096, 4096
        )
        y_offset = bounded_int(
            raw.get("yOffset", metrics["baseline"] - raw.get("bearingY", metrics["baseline"])),
            f"{glyph_label}.yOffset",
            -4096,
            4096,
        )
        advance = bounded_int(
            raw.get("xAdvance", raw.get("advance")), f"{glyph_label}.xAdvance", 0, 4096
        )
        anchors_raw = raw.get("anchors", {})
        if not isinstance(anchors_raw, dict) or len(anchors_raw) > 128:
            fail(f"{glyph_label}.anchors must be an object")
        anchors: dict[str, tuple[int, int]] = {}
        for name, point in anchors_raw.items():
            anchor_id = safe_id(name, f"{glyph_label}.anchors key")
            if not isinstance(point, list) or len(point) != 2:
                fail(f"{glyph_label}.anchors.{anchor_id} must be [x,y]")
            anchors[anchor_id] = (
                bounded_int(point[0], f"{glyph_label}.anchors.{anchor_id}[0]", -4096, 4096),
                bounded_int(point[1], f"{glyph_label}.anchors.{anchor_id}[1]", -4096, 4096),
            )
        components_raw = raw.get("components", [])
        if not isinstance(components_raw, list) or len(components_raw) > MAX_COMPONENTS:
            fail(f"{glyph_label}.components must contain at most {MAX_COMPONENTS} entries")
        components: list[dict[str, Any]] = []
        for component_index, component in enumerate(components_raw):
            component_label = f"{glyph_label}.components[{component_index}]"
            if not isinstance(component, dict):
                fail(f"{component_label} must be an object")
            palette_map_raw = component.get("paletteMap", {})
            if not isinstance(palette_map_raw, dict) or len(palette_map_raw) > 256:
                fail(f"{component_label}.paletteMap must be an object")
            palette_map = {
                colour_hex(parse_colour(source, f"{component_label}.paletteMap source")): colour_hex(
                    parse_colour(target, f"{component_label}.paletteMap target")
                )
                for source, target in palette_map_raw.items()
            }
            components.append(
                {
                    "codepoint": codepoint(component.get("codepoint"), f"{component_label}.codepoint"),
                    "dx": bounded_int(component.get("dx", 0), f"{component_label}.dx", -4096, 4096),
                    "dy": bounded_int(component.get("dy", 0), f"{component_label}.dy", -4096, 4096),
                    "sourceAnchor": (
                        safe_id(component["sourceAnchor"], f"{component_label}.sourceAnchor")
                        if "sourceAnchor" in component
                        else None
                    ),
                    "targetAnchor": (
                        safe_id(component["targetAnchor"], f"{component_label}.targetAnchor")
                        if "targetAnchor" in component
                        else None
                    ),
                    "paletteMap": palette_map,
                }
            )
        raw_records[cp] = {
            "codepoint": cp,
            "character": chr(cp),
            "width": width,
            "height": height,
            "xOffset": bearing_x,
            "yOffset": y_offset,
            "xAdvance": advance,
            "pixels": pixels,
            "anchors": anchors,
            "components": components,
        }

    resolving: set[int] = set()
    resolved: dict[int, PixelMap] = {}

    def resolve(cp: int) -> PixelMap:
        if cp in resolved:
            return resolved[cp]
        if cp in resolving:
            fail(f"{label} component cycle reaches U+{cp:04X}")
        record = raw_records.get(cp)
        if record is None:
            fail(f"{label} component references missing U+{cp:04X}")
        resolving.add(cp)
        pixels = {
            (x + record["xOffset"], y + record["yOffset"]): colour
            for (x, y), colour in record["pixels"].items()
        }
        for component in record["components"]:
            source_record = raw_records.get(component["codepoint"])
            if source_record is None:
                fail(f"{label} component references missing U+{component['codepoint']:04X}")
            dx = component["dx"]
            dy = component["dy"]
            if component["sourceAnchor"] is not None or component["targetAnchor"] is not None:
                if component["sourceAnchor"] is None or component["targetAnchor"] is None:
                    fail("component anchor attachment requires both sourceAnchor and targetAnchor")
                source_anchor = source_record["anchors"].get(component["sourceAnchor"])
                target_anchor = record["anchors"].get(component["targetAnchor"])
                if source_anchor is None or target_anchor is None:
                    fail("component anchor attachment references an undeclared anchor")
                source_absolute = (
                    source_anchor[0] + source_record["xOffset"],
                    source_anchor[1] + source_record["yOffset"],
                )
                target_absolute = (
                    target_anchor[0] + record["xOffset"],
                    target_anchor[1] + record["yOffset"],
                )
                dx += target_absolute[0] - source_absolute[0]
                dy += target_absolute[1] - source_absolute[1]
            source_pixels = resolve(component["codepoint"])
            mapped: PixelMap = {}
            for (x, y), colour in source_pixels.items():
                replacement = component["paletteMap"].get(colour_hex(colour))
                mapped[(x + dx, y + dy)] = parse_colour(replacement, "component paletteMap") if replacement else colour
            pixels = merge_maps(pixels, mapped)
        resolving.remove(cp)
        resolved[cp] = pixels
        return pixels

    records: list[dict[str, Any]] = []
    for cp in sorted(raw_records):
        raw = raw_records[cp]
        pixels = resolve(cp)
        if cp in EMPTY_CODEPOINTS and pixels:
            fail(f"{label} spacing/default-ignorable glyph U+{cp:04X} must be empty")
        if cp not in EMPTY_CODEPOINTS and not pixels:
            fail(f"{label} glyph U+{cp:04X} is unexpectedly empty")
        if pixels:
            minimum_x = min(point[0] for point in pixels)
            maximum_x = max(point[0] for point in pixels)
            minimum_y = min(point[1] for point in pixels)
            maximum_y = max(point[1] for point in pixels)
            if (
                minimum_x < raw["xOffset"]
                or maximum_x >= raw["xOffset"] + raw["width"]
                or minimum_y < raw["yOffset"]
                or maximum_y >= raw["yOffset"] + raw["height"]
            ):
                fail(f"{label} resolved U+{cp:04X} escapes its declared glyph canvas")
        records.append(
            {
                "codepoint": cp,
                "character": chr(cp),
                "width": raw["width"],
                "height": raw["height"],
                "xOffset": raw["xOffset"],
                "yOffset": raw["yOffset"],
                "xAdvance": raw["xAdvance"],
                "anchors": {key: list(value) for key, value in sorted(raw["anchors"].items())},
                "pixels": [
                    [x, y, colour_hex(colour)]
                    for (x, y), colour in sorted(pixels.items(), key=lambda item: (item[0][1], item[0][0]))
                ],
            }
        )

    if 0x20 not in raw_records:
        fail(f"{label} must contain U+0020 SPACE")
    if raw_records[0x20]["xAdvance"] != metrics["spaceAdvance"]:
        fail(f"{label} SPACE xAdvance must equal metrics.spaceAdvance")

    kerning_raw = value.get("kerning", [])
    if not isinstance(kerning_raw, list) or len(kerning_raw) > 1_000_000:
        fail(f"{label}.kerning must be an array with at most 1,000,000 entries")
    kerning: list[dict[str, int]] = []
    seen_pairs: set[tuple[int, int]] = set()
    present = set(raw_records)
    for index, item in enumerate(kerning_raw):
        pair_label = f"{label}.kerning[{index}]"
        if not isinstance(item, dict):
            fail(f"{pair_label} must be an object")
        first = codepoint(item.get("first"), f"{pair_label}.first")
        second = codepoint(item.get("second"), f"{pair_label}.second")
        amount = bounded_int(item.get("amount"), f"{pair_label}.amount", -512, 512)
        if not amount:
            fail(f"{pair_label}.amount must not be zero")
        if first not in present or second not in present:
            fail(f"{pair_label} references a missing glyph")
        if (first, second) in seen_pairs:
            fail(f"{pair_label} duplicates a kerning pair")
        seen_pairs.add((first, second))
        kerning.append({"first": first, "second": second, "amount": amount})

    coverage = value.get("coverage", {})
    if not isinstance(coverage, dict):
        fail(f"{label}.coverage must be an object")
    required_raw = coverage.get("requiredCodepoints", [])
    if not isinstance(required_raw, list) or len(required_raw) > MAX_GLYPHS:
        fail(f"{label}.coverage.requiredCodepoints must be an array")
    required = sorted({codepoint(item, f"{label}.coverage.requiredCodepoints") for item in required_raw})
    missing = sorted(set(required) - present)
    if missing:
        fail(f"{label} is missing required glyphs: {', '.join(f'U+{cp:04X}' for cp in missing[:32])}")

    return {
        "schema": FACE_SCHEMA,
        "sourceSchema": schema,
        "engineVersion": ENGINE_VERSION,
        "familyId": family_id,
        "faceId": face_id,
        "displayName": display_name,
        "version": version,
        "kind": kind,
        "styleTags": list(tags_raw),
        "designIntent": design_intent,
        "pixelMode": mode,
        "palette": {key: colour_hex(value) for key, value in sorted(palette.items())},
        "metrics": metrics,
        "coverage": {"requiredCodepoints": required},
        "glyphs": records,
        "kerning": sorted(kerning, key=lambda item: (item["first"], item["second"])),
    }


