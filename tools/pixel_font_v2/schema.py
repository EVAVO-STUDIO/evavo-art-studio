"""Face and family master validation."""
from .common import *



def validate_metrics(face: Mapping[str, Any], label: str) -> dict[str, int]:
    raw = face.get("metrics")
    if not isinstance(raw, dict):
        fail(f"{label}.metrics must be an object")
    baseline = bounded_int(raw.get("baseline"), f"{label}.metrics.baseline", 1, 512)
    ascent = bounded_int(raw.get("ascent", baseline), f"{label}.metrics.ascent", 1, 512)
    descent = bounded_int(raw.get("descent", max(0, raw.get("lineHeight", baseline) - baseline)), f"{label}.metrics.descent", 0, 256)
    line_height = bounded_int(raw.get("lineHeight"), f"{label}.metrics.lineHeight", 1, 768)
    cap_height = bounded_int(raw.get("capHeight"), f"{label}.metrics.capHeight", 1, 512)
    x_height = bounded_int(raw.get("xHeight"), f"{label}.metrics.xHeight", 1, 512)
    space_advance = bounded_int(raw.get("spaceAdvance"), f"{label}.metrics.spaceAdvance", 1, 512)
    if baseline != ascent:
        fail(f"{label}.metrics.baseline must equal ascent for deterministic BMFont placement")
    if ascent + descent > line_height:
        fail(f"{label}.metrics ascent + descent exceeds lineHeight")
    if not x_height <= cap_height <= ascent:
        fail(f"{label}.metrics must satisfy xHeight <= capHeight <= ascent")
    return {
        "ascent": ascent,
        "descent": descent,
        "baseline": baseline,
        "lineHeight": line_height,
        "capHeight": cap_height,
        "xHeight": x_height,
        "spaceAdvance": space_advance,
    }


def parse_allowed_pairs(value: Any, label: str) -> set[tuple[int, int]]:
    if value is None:
        return set()
    if not isinstance(value, list):
        fail(f"{label} must be an array")
    result: set[tuple[int, int]] = set()
    for index, entry in enumerate(value):
        if not isinstance(entry, list) or len(entry) != 2 or not all(is_codepoint(item) for item in entry):
            fail(f"{label}[{index}] must contain two Unicode codepoints")
        result.add((entry[0], entry[1]))
    return result


def validate_face_document(face: Any, *, source_label: str = "face") -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(face, dict):
        fail(f"{source_label} must be an object")
    if face.get("schema") != FACE_MASTER_SCHEMA:
        fail(f"{source_label}.schema must be {FACE_MASTER_SCHEMA}")
    family_id = safe_id(face.get("familyId"), f"{source_label}.familyId")
    face_id = safe_id(face.get("faceId"), f"{source_label}.faceId")
    display_name = string(face.get("displayName"), f"{source_label}.displayName", 128)
    version = string(face.get("version", "1.0.0"), f"{source_label}.version", 64)
    metrics = validate_metrics(face, source_label)
    raw_glyphs = face.get("glyphs")
    if not isinstance(raw_glyphs, list) or not 1 <= len(raw_glyphs) <= MAX_GLYPHS:
        fail(f"{source_label}.glyphs must contain 1..{MAX_GLYPHS} entries")
    records: dict[int, dict[str, Any]] = {}
    for index, raw in enumerate(raw_glyphs):
        label = f"{source_label}.glyphs[{index}]"
        if not isinstance(raw, dict):
            fail(f"{label} must be an object")
        cp = raw.get("codepoint")
        if not is_codepoint(cp) or cp < 0x20:
            fail(f"{label}.codepoint is invalid or a control code")
        if cp in records:
            fail(f"{label}.codepoint U+{cp:04X} is duplicated")
        rows = normalise_bitmap(raw.get("bitmap"), label)
        width = bounded_int(raw.get("width"), f"{label}.width", 1, 512)
        height = bounded_int(raw.get("height"), f"{label}.height", 1, 512)
        if width != len(rows[0]) or height != len(rows):
            fail(f"{label} dimensions disagree with bitmap")
        x_offset = bounded_int(raw.get("xOffset"), f"{label}.xOffset", -128, 512)
        y_offset = bounded_int(raw.get("yOffset"), f"{label}.yOffset", -128, 768)
        x_advance = bounded_int(raw.get("xAdvance"), f"{label}.xAdvance", 1, 512)
        visible = any("#" in row for row in rows)
        if not visible and cp not in EMPTY_CODEPOINTS:
            fail(f"{label} is unexpectedly empty")
        if visible and cp in {0x20, 0xA0, 0x200B}:
            fail(f"{label} must be empty")
        canonical = {
            "codepoint": cp,
            "character": chr(cp),
            "width": width,
            "height": height,
            "xOffset": x_offset,
            "yOffset": y_offset,
            "xAdvance": x_advance,
            "bitmap": list(rows),
        }
        pixels = glyph_pixel_set(canonical)
        if pixels:
            min_y = min(y for _, y in pixels)
            max_y = max(y for _, y in pixels)
            if min_y < 0 or max_y >= metrics["lineHeight"]:
                fail(
                    f"{label} pixels escape line box 0..{metrics['lineHeight'] - 1}: "
                    f"observed {min_y}..{max_y}"
                )
            min_x = min(x for x, _ in pixels)
            max_x = max(x for x, _ in pixels)
            if min_x < -32 or max_x >= x_advance + 32:
                fail(f"{label} horizontal overhang is outside the supported boundary")
        records[cp] = canonical
    if 0x20 not in records:
        fail(f"{source_label} is missing U+0020 SPACE")
    if records[0x20]["xAdvance"] != metrics["spaceAdvance"]:
        fail(f"{source_label} SPACE xAdvance must equal metrics.spaceAdvance")

    raw_kerning = face.get("kerning", [])
    if not isinstance(raw_kerning, list) or len(raw_kerning) > MAX_KERNING_PAIRS:
        fail(f"{source_label}.kerning must contain no more than {MAX_KERNING_PAIRS} entries")
    kerning: dict[tuple[int, int], int] = {}
    canonical_kerning: list[dict[str, int]] = []
    for index, raw in enumerate(raw_kerning):
        label = f"{source_label}.kerning[{index}]"
        if not isinstance(raw, dict) or set(raw) != {"first", "second", "amount"}:
            fail(f"{label} must contain first, second and amount only")
        first = raw.get("first")
        second = raw.get("second")
        amount = raw.get("amount")
        if first not in records or second not in records:
            fail(f"{label} references a missing glyph")
        amount = bounded_int(amount, f"{label}.amount", -64, 64)
        if amount == 0:
            fail(f"{label}.amount must not be zero")
        key = (first, second)
        if key in kerning:
            fail(f"{label} duplicates kerning pair U+{first:04X}/U+{second:04X}")
        kerning[key] = amount
        canonical_kerning.append({"first": first, "second": second, "amount": amount})

    coverage = face.get("coverage", {})
    if not isinstance(coverage, dict):
        fail(f"{source_label}.coverage must be an object")
    required_profiles = coverage.get("requiredProfiles", ["printable-ascii"])
    if not isinstance(required_profiles, list) or not required_profiles or not all(isinstance(item, str) for item in required_profiles):
        fail(f"{source_label}.coverage.requiredProfiles must be a non-empty string array")
    required: set[int] = set()
    for profile in required_profiles:
        required.update(profile_codepoints(profile))
    extra_required = coverage.get("requiredCodepoints", [])
    if not isinstance(extra_required, list) or not all(is_codepoint(item) for item in extra_required):
        fail(f"{source_label}.coverage.requiredCodepoints must be a codepoint array")
    required.update(extra_required)
    missing = sorted(required - set(records))
    if missing:
        preview = ", ".join(f"U+{cp:04X}" for cp in missing[:24])
        fail(f"{source_label} is missing {len(missing)} required glyphs: {preview}")

    qa = face.get("qa", {})
    if not isinstance(qa, dict):
        fail(f"{source_label}.qa must be an object")
    allowed_collisions = parse_allowed_pairs(qa.get("allowedCollisions"), f"{source_label}.qa.allowedCollisions")
    allowed_duplicates = parse_allowed_pairs(qa.get("allowedExactDuplicates"), f"{source_label}.qa.allowedExactDuplicates")

    duplicate_groups: list[list[int]] = []
    signatures: dict[tuple[Any, ...], list[int]] = defaultdict(list)
    for cp, glyph in records.items():
        if cp not in EMPTY_CODEPOINTS:
            signatures[glyph_visual_signature(glyph)].append(cp)
    for group in signatures.values():
        if len(group) > 1:
            duplicate_groups.append(sorted(group))

    duplicate_violations: list[tuple[int, int]] = []
    letter_or_number = lambda cp: unicodedata.category(chr(cp))[0] in {"L", "N"}
    for group in duplicate_groups:
        for index, first in enumerate(group):
            for second in group[index + 1 :]:
                pair = (first, second)
                reverse = (second, first)
                if pair in allowed_duplicates or reverse in allowed_duplicates:
                    continue
                if letter_or_number(first) and letter_or_number(second):
                    duplicate_violations.append(pair)

    confusable_violations: list[list[str]] = []
    for group in DEFAULT_CONFUSABLE_SEQUENCES:
        available: list[tuple[str, frozenset[tuple[int, int]]]] = []
        for sequence in group:
            pixels = sequence_pixel_set(sequence, records, kerning)
            if pixels is not None:
                available.append((sequence, pixels))
        for index, (left_name, left_pixels) in enumerate(available):
            for right_name, right_pixels in available[index + 1 :]:
                if left_pixels == right_pixels:
                    confusable_violations.append([left_name, right_name])

    collisions: list[dict[str, Any]] = []
    sorted_items = sorted(records.items())
    pixel_cache = {cp: glyph_pixel_set(glyph) for cp, glyph in sorted_items}
    for first_cp, first_glyph in sorted_items:
        first_pixels = pixel_cache[first_cp]
        if not first_pixels:
            continue
        for second_cp, _second_glyph in sorted_items:
            second_pixels = pixel_cache[second_cp]
            if not second_pixels:
                continue
            shift = first_glyph["xAdvance"] + kerning.get((first_cp, second_cp), 0)
            if first_pixels.intersection((x + shift, y) for x, y in second_pixels):
                pair = (first_cp, second_cp)
                if pair not in allowed_collisions:
                    collisions.append(
                        {
                            "first": first_cp,
                            "second": second_cp,
                            "amount": kerning.get(pair, 0),
                        }
                    )
                    if len(collisions) >= 64:
                        break
        if len(collisions) >= 64:
            break

    if duplicate_violations:
        preview = ", ".join(f"U+{a:04X}/U+{b:04X}" for a, b in duplicate_violations[:16])
        fail(f"{source_label} has identical letter/number glyphs: {preview}")
    if confusable_violations:
        preview = ", ".join("/".join(item) for item in confusable_violations[:16])
        fail(f"{source_label} has indistinguishable confusable forms: {preview}")
    if collisions:
        preview = ", ".join(
            f"U+{item['first']:04X}/U+{item['second']:04X}" for item in collisions[:16]
        )
        fail(f"{source_label} has glyph-pair pixel collisions: {preview}")

    canonical_face = {
        "schema": FACE_MASTER_SCHEMA,
        "familyId": family_id,
        "faceId": face_id,
        "displayName": display_name,
        "version": version,
        "metrics": metrics,
        "coverage": {
            "requiredProfiles": required_profiles,
            "requiredCodepoints": sorted(extra_required),
        },
        "qa": {
            "allowedCollisions": [list(item) for item in sorted(allowed_collisions)],
            "allowedExactDuplicates": [list(item) for item in sorted(allowed_duplicates)],
        },
        "glyphCount": len(records),
        "glyphs": [records[cp] for cp in sorted(records)],
        "kerning": sorted(canonical_kerning, key=lambda item: (item["first"], item["second"])),
    }
    report = {
        "schema": AUDIT_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "familyId": family_id,
        "faceId": face_id,
        "glyphCount": len(records),
        "kerningPairCount": len(kerning),
        "requiredCodepointCount": len(required),
        "coverage": {
            profile: {
                "required": len(profile_codepoints(profile)),
                "present": len(profile_codepoints(profile).intersection(records)),
            }
            for profile in required_profiles
        },
        "metrics": metrics,
        "offsets": {
            "minimumX": min(glyph["xOffset"] for glyph in records.values()),
            "maximumX": max(glyph["xOffset"] for glyph in records.values()),
            "minimumY": min(glyph["yOffset"] for glyph in records.values()),
            "maximumY": max(glyph["yOffset"] for glyph in records.values()),
            "nonZeroXCount": sum(1 for glyph in records.values() if glyph["xOffset"] != 0),
            "nonZeroYCount": sum(1 for glyph in records.values() if glyph["yOffset"] != 0),
        },
        "duplicateGroups": duplicate_groups,
        "confusableChecks": [list(group) for group in DEFAULT_CONFUSABLE_SEQUENCES],
        "collisionChecks": len(records) * len(records),
        "status": "passed",
    }
    return canonical_face, report


def resolve_child(parent: Path, relative: str, label: str) -> Path:
    if not isinstance(relative, str) or not relative or len(relative) > 4096:
        fail(f"{label} must be a non-empty relative path")
    candidate = (parent / relative).resolve()
    try:
        candidate.relative_to(parent.resolve())
    except ValueError:
        fail(f"{label} escapes the family master directory")
    return require_regular_file(candidate, label)


def validate_godot_policy(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    policy = {
        "targetVersion": string(value.get("targetVersion"), f"{label}.targetVersion", 32),
        "resourceBasePath": string(value.get("resourceBasePath"), f"{label}.resourceBasePath", 256),
        "textureFilter": value.get("textureFilter"),
        "integerScaleOnly": value.get("integerScaleOnly"),
        "subpixelPositioning": value.get("subpixelPositioning"),
        "mipmaps": value.get("mipmaps"),
        "systemFallback": value.get("systemFallback"),
    }
    if policy["targetVersion"] != EXPECTED_GODOT_VERSION:
        fail(f"{label}.targetVersion must be {EXPECTED_GODOT_VERSION}")
    if policy["textureFilter"] != "nearest":
        fail(f"{label}.textureFilter must be nearest")
    for field, expected in (
        ("integerScaleOnly", True),
        ("subpixelPositioning", False),
        ("mipmaps", False),
        ("systemFallback", False),
    ):
        if policy[field] is not expected:
            fail(f"{label}.{field} must be {str(expected).lower()}")
    resource_base = policy["resourceBasePath"].replace("\\", "/").strip("/")
    if resource_base.startswith("..") or "/../" in f"/{resource_base}/":
        fail(f"{label}.resourceBasePath must not escape res://")
    policy["resourceBasePath"] = resource_base
    return policy


def validate_family_document(
    family: Any,
    *,
    source_path: Path | None = None,
    source_label: str = "family",
    load_faces: bool = True,
) -> tuple[dict[str, Any], list[tuple[dict[str, Any], dict[str, Any], Path | None]], dict[str, Any]]:
    if not isinstance(family, dict):
        fail(f"{source_label} must be an object")
    if family.get("schema") != FAMILY_MASTER_SCHEMA:
        fail(f"{source_label}.schema must be {FAMILY_MASTER_SCHEMA}")
    family_id = safe_id(family.get("familyId"), f"{source_label}.familyId")
    display_name = string(family.get("displayName"), f"{source_label}.displayName", 128)
    version = string(family.get("version"), f"{source_label}.version", 64)
    godot = validate_godot_policy(family.get("godot"), f"{source_label}.godot")
    output_raw = family.get("output", {})
    if not isinstance(output_raw, dict):
        fail(f"{source_label}.output must be an object")
    output = {
        "includeTtf": boolean(output_raw.get("includeTtf", True), f"{source_label}.output.includeTtf"),
        "includeBdf": boolean(output_raw.get("includeBdf", True), f"{source_label}.output.includeBdf"),
        "includeAtlasJson": boolean(output_raw.get("includeAtlasJson", True), f"{source_label}.output.includeAtlasJson"),
        "includeGridSheet": boolean(output_raw.get("includeGridSheet", True), f"{source_label}.output.includeGridSheet"),
        "includeSpecimens": boolean(output_raw.get("includeSpecimens", True), f"{source_label}.output.includeSpecimens"),
        "atlasMaximumEdge": bounded_int(
            output_raw.get("atlasMaximumEdge", 2048),
            f"{source_label}.output.atlasMaximumEdge",
            64,
            MAX_ATLAS_EDGE,
        ),
        "atlasPadding": bounded_int(output_raw.get("atlasPadding", 1), f"{source_label}.output.atlasPadding", 1, 8),
        "ttfPixelUnits": bounded_int(output_raw.get("ttfPixelUnits", 64), f"{source_label}.output.ttfPixelUnits", 16, 256),
    }
    raw_faces = family.get("faces")
    if not isinstance(raw_faces, list) or not 1 <= len(raw_faces) <= 64:
        fail(f"{source_label}.faces must contain 1..64 entries")
    face_refs: list[dict[str, Any]] = []
    face_ids: set[str] = set()
    roles: set[str] = set()
    loaded: list[tuple[dict[str, Any], dict[str, Any], Path | None]] = []
    for index, raw in enumerate(raw_faces):
        label = f"{source_label}.faces[{index}]"
        if not isinstance(raw, dict):
            fail(f"{label} must be an object")
        role = safe_id(raw.get("role"), f"{label}.role")
        master = string(raw.get("master"), f"{label}.master", 4096)
        if role in roles:
            fail(f"{label}.role is duplicated: {role}")
        roles.add(role)
        face_refs.append({"role": role, "master": master})
        if load_faces:
            if source_path is None:
                fail("source_path is required when loading face masters")
            face_path = resolve_child(source_path.parent, master, f"{label}.master")
            face_value, _face_raw = load_json(face_path, f"{label}.master")
            canonical_face, audit = validate_face_document(face_value, source_label=f"face:{face_path.name}")
            if canonical_face["familyId"] != family_id:
                fail(f"{label}.master familyId does not match {family_id}")
            if canonical_face["faceId"] in face_ids:
                fail(f"{label}.master duplicates faceId {canonical_face['faceId']}")
            face_ids.add(canonical_face["faceId"])
            loaded.append((canonical_face, audit, face_path))
    specimens_raw = family.get("specimens", [])
    if not isinstance(specimens_raw, list) or len(specimens_raw) > 128:
        fail(f"{source_label}.specimens must be an array of at most 128 entries")
    specimens: list[dict[str, Any]] = []
    for index, raw in enumerate(specimens_raw):
        label = f"{source_label}.specimens[{index}]"
        if not isinstance(raw, dict):
            fail(f"{label} must be an object")
        face_id = safe_id(raw.get("faceId"), f"{label}.faceId")
        width = bounded_int(raw.get("width", 320), f"{label}.width", 64, MAX_SPECIMEN_EDGE)
        height = bounded_int(raw.get("height", 200), f"{label}.height", 64, MAX_SPECIMEN_EDGE)
        lines = raw.get("lines")
        if not isinstance(lines, list) or not 1 <= len(lines) <= 64:
            fail(f"{label}.lines must contain 1..64 strings")
        if not all(isinstance(line, str) and len(line) <= 1024 for line in lines):
            fail(f"{label}.lines contains an invalid string")
        specimens.append({"faceId": face_id, "width": width, "height": height, "lines": lines})
    if load_faces:
        unknown = sorted({item["faceId"] for item in specimens} - face_ids)
        if unknown:
            fail(f"{source_label}.specimens references unknown faces: {unknown}")
    license_info = family.get("license", {})
    if not isinstance(license_info, dict):
        fail(f"{source_label}.license must be an object")
    canonical_license = {
        "copyright": string(license_info.get("copyright", "Copyright EVAVO Studio"), f"{source_label}.license.copyright", 256),
        "text": string(license_info.get("text", "All rights reserved."), f"{source_label}.license.text", 2048),
        "url": str(license_info.get("url", ""))[:512],
    }
    canonical = {
        "schema": FAMILY_MASTER_SCHEMA,
        "familyId": family_id,
        "displayName": display_name,
        "version": version,
        "godot": godot,
        "output": output,
        "license": canonical_license,
        "faces": face_refs,
        "specimens": specimens,
    }
    report = {
        "schema": AUDIT_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "familyId": family_id,
        "version": version,
        "faceCount": len(face_refs),
        "faces": [audit for _, audit, _ in loaded],
        "godot": godot,
        "output": output,
        "status": "passed",
    }
    return canonical, loaded, report
