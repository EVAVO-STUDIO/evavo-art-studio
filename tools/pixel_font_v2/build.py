"""Face/family compilation, Godot helpers and output validation."""
from .common import *
from .schema import *
from .formats import *


def build_face(
    face: Mapping[str, Any],
    audit: Mapping[str, Any],
    output_root: Path,
    family: Mapping[str, Any],
    role: str,
) -> dict[str, Any]:
    face_id = face["faceId"]
    face_root = output_root / "fonts" / face_id
    face_root.mkdir(parents=True, exist_ok=False)
    records = {glyph["codepoint"]: glyph for glyph in face["glyphs"]}
    width, height, placed = shelf_pack(
        records,
        family["output"]["atlasMaximumEdge"],
        family["output"]["atlasPadding"],
    )
    rgba = bytearray(width * height * 4)
    pixel_count = 0
    for _cp, glyph, atlas_x, atlas_y in placed:
        for y, row in enumerate(glyph["bitmap"]):
            for x, value in enumerate(row):
                if value == "#":
                    offset = ((atlas_y + y) * width + atlas_x + x) * 4
                    rgba[offset : offset + 4] = b"\xff\xff\xff\xff"
                    pixel_count += 1
    atlas_name = f"{face_id}.png"
    fnt_name = f"{face_id}.fnt"
    bdf_name = f"{face_id}.bdf"
    atlas_json_name = f"{face_id}.atlas.json"
    grid_name = f"{face_id}.grid.png"
    grid_json_name = f"{face_id}.grid.json"
    tres_name = f"{face_id}.tres"
    master_name = f"{face_id}.master.json"
    audit_name = f"{face_id}.audit.json"
    write_create_only(face_root / atlas_name, png_rgba(width, height, bytes(rgba)))
    metrics = face["metrics"]
    lines = [
        f'info face="{bmfont_escape(face["displayName"])}" size={metrics["lineHeight"]} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=0 padding=0,0,0,0 spacing=0,0',
        f'common lineHeight={metrics["lineHeight"]} base={metrics["baseline"]} scaleW={width} scaleH={height} pages=1 packed=0 alphaChnl=0 redChnl=4 greenChnl=4 blueChnl=4',
        f'page id=0 file="{atlas_name}"',
        f'chars count={len(placed)}',
    ]
    for cp, glyph, atlas_x, atlas_y in sorted(placed, key=lambda item: item[0]):
        lines.append(
            f"char id={cp} x={atlas_x} y={atlas_y} width={glyph['width']} height={glyph['height']} "
            f"xoffset={glyph['xOffset']} yoffset={glyph['yOffset']} xadvance={glyph['xAdvance']} page=0 chnl=15"
        )
    lines.append(f"kernings count={len(face['kerning'])}")
    for item in face["kerning"]:
        lines.append(f"kerning first={item['first']} second={item['second']} amount={item['amount']}")
    write_create_only(face_root / fnt_name, ("\n".join(lines) + "\n").encode("utf-8"))
    resource_path = f"res://{family['godot']['resourceBasePath']}/fonts/{face_id}/{fnt_name}"
    tres = (
        '[gd_resource type="FontVariation" load_steps=2 format=3]\n\n'
        f'[ext_resource type="FontFile" path="{resource_path}" id="1_font"]\n\n'
        "[resource]\n"
        'base_font = ExtResource("1_font")\n'
        "spacing_glyph = 0\n"
        "spacing_space = 0\n"
        "spacing_top = 0\n"
        "spacing_bottom = 0\n"
    )
    write_create_only(face_root / tres_name, tres.encode("utf-8"))
    write_json_create_only(face_root / master_name, face)
    write_json_create_only(face_root / audit_name, audit)

    bdf_report: dict[str, Any] | None = None
    if family["output"]["includeBdf"]:
        bdf_report = build_bdf(face, face_root / bdf_name, family["license"])

    atlas_json_report: dict[str, Any] | None = None
    if family["output"]["includeAtlasJson"]:
        atlas_json_report = build_atlas_json(
            face,
            face_root / atlas_json_name,
            atlas_name,
            width,
            height,
            family["output"]["atlasPadding"],
            placed,
        )

    grid_report: dict[str, Any] | None = None
    if family["output"]["includeGridSheet"]:
        grid_report = build_grid_sheet(face, face_root / grid_name, face_root / grid_json_name)

    ttf_report: dict[str, Any] | None = None
    if family["output"]["includeTtf"]:
        ttf_name = f"{face_id}.ttf"
        ttf_report = build_ttf(
            face,
            face_root / ttf_name,
            family["output"]["ttfPixelUnits"],
            family["license"],
        )

    files = {
        path.name: sha256_file(path)
        for path in sorted(face_root.iterdir())
        if path.is_file()
    }
    return {
        "role": role,
        "faceId": face_id,
        "displayName": face["displayName"],
        "version": face["version"],
        "glyphCount": len(records),
        "kerningPairCount": len(face["kerning"]),
        "metrics": metrics,
        "atlas": {
            "width": width,
            "height": height,
            "padding": family["output"]["atlasPadding"],
            "pixelCount": pixel_count,
        },
        "coverage": audit["coverage"],
        "qa": {
            "collisionChecks": audit["collisionChecks"],
            "duplicateGroupCount": len(audit["duplicateGroups"]),
            "status": "passed",
        },
        "interchange": {
            "bdf": bdf_report,
            "atlasJson": atlas_json_report,
            "gridSheet": grid_report,
        },
        "ttf": ttf_report,
        "files": files,
    }


def generate_godot_runtime_helpers(
    output_root: Path,
    family: Mapping[str, Any],
    face_outputs: Sequence[Mapping[str, Any]],
) -> dict[str, str]:
    runtime_root = output_root / "godot"
    runtime_root.mkdir(parents=True, exist_ok=False)
    base = family["godot"]["resourceBasePath"].rstrip("/")
    roles = {
        item["role"]: {
            "faceId": item["faceId"],
            "bmfont": f"res://{base}/fonts/{item['faceId']}/{item['faceId']}.fnt",
            "fontVariation": f"res://{base}/fonts/{item['faceId']}/{item['faceId']}.tres",
            "atlas": f"res://{base}/fonts/{item['faceId']}/{item['faceId']}.png",
        }
        for item in face_outputs
    }
    role_map = {
        "schema": "evavo.pixel-font-godot-role-map.v1",
        "toolVersion": TOOL_VERSION,
        "familyId": family["familyId"],
        "targetVersion": family["godot"]["targetVersion"],
        "roles": roles,
        "policy": family["godot"],
    }
    write_json_create_only(runtime_root / "role-map.json", role_map)
    face_paths = ",\n".join(
        f'    &"{role}": "{value["bmfont"]}"'
        for role, value in sorted(roles.items())
    )
    script = f"""extends RefCounted

const FACE_PATHS := {{
{face_paths}
}}

static func load_role(role: StringName) -> FontFile:
    assert(FACE_PATHS.has(role), "Unknown pixel-font role: %s" % role)
    var font := load(FACE_PATHS[role]) as FontFile
    assert(font != null, "Could not load pixel-font role: %s" % role)
    font.allow_system_fallback = false
    font.generate_mipmaps = false
    font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
    return font
"""
    write_create_only(runtime_root / "PixelFontFamily.gd", script.encode("utf-8"))
    install = f"""# Godot {family["godot"]["targetVersion"]} installation

Copy the complete delivery directory to:

`res://{base}/`

Use `godot/PixelFontFamily.gd` to load a face by role, or assign the generated `.tres` resource directly to a Label, RichTextLabel, Theme or custom control.

Keep nearest filtering, integer scaling, mipmaps disabled and subpixel positioning disabled. The canonical runtime is each `.fnt` file beside its matching `.png` atlas.
"""
    write_create_only(runtime_root / "INSTALL.md", install.encode("utf-8"))
    return {
        "script": "godot/PixelFontFamily.gd",
        "roleMap": "godot/role-map.json",
        "install": "godot/INSTALL.md",
    }


def generate_godot_fixture(output_root: Path, family: Mapping[str, Any], face_outputs: Sequence[Mapping[str, Any]]) -> dict[str, str]:
    fixture = output_root / "godot_fixture"
    fixture.mkdir(parents=True, exist_ok=False)
    project = """[application]
config/name="EVAVO Pixel Font Studio v2 Verification"
run/main_scene="res://verify.tscn"

[display]
window/size/viewport_width=320
window/size/viewport_height=200
window/size/window_width_override=320
window/size/window_height_override=200
window/stretch/mode="canvas_items"

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
textures/default_filters/use_nearest_mipmap_filter=false
textures/canvas_textures/default_texture_filter=0

environment/defaults/default_clear_color=Color(0, 0, 0, 1)
"""
    scene = """[gd_scene load_steps=2 format=3]

[ext_resource path="res://verify.gd" type="Script" id="1"]

[node name="PixelFontVerifier" type="Node2D"]
script = ExtResource("1")
"""
    # Required codepoints are embedded from copied masters at runtime, avoiding a giant GDScript literal.
    script = f'''extends Node2D

const EXPECTED_VERSION := "{EXPECTED_GODOT_VERSION}"
const FACE_IDS := {json.dumps([item["faceId"] for item in face_outputs])}
var failures: Array[String] = []
var labels: Array[Label] = []

func _ready() -> void:
    var version := Engine.get_version_info()
    var observed := "%s.%s.%s" % [version.get("major", -1), version.get("minor", -1), version.get("patch", -1)]
    if observed != EXPECTED_VERSION:
        failures.append("Expected Godot %s, observed %s" % [EXPECTED_VERSION, observed])
    var y := 8
    for face_id in FACE_IDS:
        var master_path := "res://delivery/fonts/%s/%s.master.json" % [face_id, face_id]
        var master_file := FileAccess.open(master_path, FileAccess.READ)
        if master_file == null:
            failures.append("Could not read " + master_path)
            continue
        var parsed = JSON.parse_string(master_file.get_as_text())
        if typeof(parsed) != TYPE_DICTIONARY:
            failures.append("Invalid master JSON for " + face_id)
            continue
        var font_path := "res://delivery/fonts/%s/%s.fnt" % [face_id, face_id]
        var font = load(font_path)
        if font == null or not (font is FontFile):
            failures.append("Could not import FontFile " + font_path)
            continue
        font.allow_system_fallback = false
        font.generate_mipmaps = false
        font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
        for glyph in parsed.get("glyphs", []):
            var cp := int(glyph.get("codepoint", -1))
            if cp >= 0 and not font.has_char(cp):
                failures.append("%s missing U+%04X" % [face_id, cp])
                if failures.size() >= 64:
                    break
        var label := Label.new()
        label.text = "%s  CHECKMATE  ÀČŁŒ  ♔♛  0123456789" % face_id
        label.position = Vector2(8, y)
        label.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
        label.add_theme_font_override("font", font)
        label.add_theme_font_size_override("font_size", int(parsed.get("metrics", {{}}).get("lineHeight", 10)))
        label.add_theme_color_override("font_color", Color.WHITE)
        add_child(label)
        labels.append(label)
        y += int(parsed.get("metrics", {{}}).get("lineHeight", 10)) + 14
    await get_tree().process_frame
    await RenderingServer.frame_post_draw
    var image := get_viewport().get_texture().get_image()
    var non_binary := 0
    for yy in range(image.get_height()):
        for xx in range(image.get_width()):
            var pixel := image.get_pixel(xx, yy)
            for channel in [pixel.r, pixel.g, pixel.b, pixel.a]:
                if not is_equal_approx(channel, 0.0) and not is_equal_approx(channel, 1.0):
                    non_binary += 1
                    break
    if non_binary > 0:
        failures.append("Rendered image contains %d non-binary pixels" % non_binary)
    var evidence_root := OS.get_environment("EVAVO_PIXEL_FONT_EVIDENCE_ROOT")
    if evidence_root.is_empty():
        evidence_root = "user://"
    DirAccess.make_dir_recursive_absolute(evidence_root)
    var screenshot_path := evidence_root.path_join("godot-4.6.2-render.png")
    var save_error := image.save_png(screenshot_path)
    if save_error != OK:
        failures.append("Could not save render proof: %s" % save_error)
    var report := {{
        "schema": "{GODOT_REPORT_SCHEMA}",
        "expectedVersion": EXPECTED_VERSION,
        "observedVersion": observed,
        "faceCount": FACE_IDS.size(),
        "nonBinaryPixelCount": non_binary,
        "screenshot": screenshot_path,
        "failures": failures,
        "status": "passed" if failures.is_empty() else "failed"
    }}
    var report_path := evidence_root.path_join("godot-4.6.2-report.json")
    var report_file := FileAccess.open(report_path, FileAccess.WRITE)
    if report_file != null:
        report_file.store_string(JSON.stringify(report, "  "))
    print(JSON.stringify(report))
    get_tree().quit(0 if failures.is_empty() else 1)
'''
    write_create_only(fixture / "project.godot", project.encode("utf-8"))
    write_create_only(fixture / "verify.tscn", scene.encode("utf-8"))
    write_create_only(fixture / "verify.gd", script.encode("utf-8"))
    # Verification copies the immutable font delivery into an isolated fixture.
    link_mode = "copy-required"
    return {
        "project": "godot_fixture/project.godot",
        "scene": "godot_fixture/verify.tscn",
        "script": "godot_fixture/verify.gd",
        "deliveryLinkMode": link_mode,
    }


def tree_hashes(root: Path, *, exclude: Iterable[str] = ()) -> dict[str, str]:
    excluded = set(exclude)
    return {
        path.relative_to(root).as_posix(): sha256_file(path)
        for path in sorted(root.rglob("*"))
        if path.is_file() and path.relative_to(root).as_posix() not in excluded
    }


def build_family(master_path: Path, output_root: Path) -> dict[str, Any]:
    master_path = require_regular_file(master_path, "family master")
    family_value, family_raw = load_json(master_path, "family master")
    family, loaded_faces, family_audit = validate_family_document(
        family_value,
        source_path=master_path,
        source_label="family master",
        load_faces=True,
    )
    if output_root.exists():
        fail(f"output root must not already exist: {output_root}")
    output_root.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output_root.name}.staging-", dir=output_root.parent))
    try:
        face_outputs: list[dict[str, Any]] = []
        source_faces: list[dict[str, str]] = []
        for (face, audit, source), reference in zip(loaded_faces, family["faces"], strict=True):
            relative_source = source.relative_to(master_path.parent).as_posix() if source else ""
            role = reference["role"]
            face_outputs.append(build_face(face, audit, staging, family, role))
            source_faces.append(
                {
                    "faceId": face["faceId"],
                    "path": relative_source,
                    "sha256": sha256_file(source),
                }
            )
        specimens: list[dict[str, Any]] = []
        if family["output"]["includeSpecimens"]:
            specimen_root = staging / "specimens"
            specimen_root.mkdir(parents=True, exist_ok=False)
            face_map = {face[0]["faceId"]: face[0] for face in loaded_faces}
            for spec in family["specimens"]:
                face = face_map[spec["faceId"]]
                native = render_specimen(face, spec)
                base_name = f"{face['faceId']}-{spec['width']}x{spec['height']}"
                native_path = specimen_root / f"{base_name}-1x.png"
                write_create_only(native_path, native)
                entries = {"1x": native_path.name}
                for scale in (2, 4):
                    scaled = nearest_scale_png(native, scale)
                    scaled_path = specimen_root / f"{base_name}-{scale}x.png"
                    write_create_only(scaled_path, scaled)
                    entries[f"{scale}x"] = scaled_path.name
                specimens.append(
                    {
                        "faceId": face["faceId"],
                        "native": [spec["width"], spec["height"]],
                        "files": entries,
                    }
                )
        runtime_helpers = generate_godot_runtime_helpers(staging, family, face_outputs)
        fixture = generate_godot_fixture(staging, family, face_outputs)
        write_json_create_only(staging / "family.master.json", family)
        write_json_create_only(staging / "family.audit.json", family_audit)
        write_create_only(
            staging / "LICENSE.txt",
            (family["license"]["copyright"] + "\n\n" + family["license"]["text"] + "\n").encode("utf-8"),
        )
        face_lines = "\n".join(
            f"- **{item['displayName']}** (`{item['role']}`): {item['glyphCount']} glyphs, "
            f"{item['kerningPairCount']} kerning pairs, {item['metrics']['lineHeight']} px line height."
            for item in face_outputs
        )
        readme = f"""# {family['displayName']}\n\n""" \
            + "This directory is a deterministic Pixel Font Studio v2 delivery.\n\n" \
            + "## Canonical game runtime\n\n" \
            + "Use each AngelCode BMFont `.fnt` beside its matching RGBA `.png` atlas. " \
            + "The `.tres` files are Godot `FontVariation` wrappers. `godot/PixelFontFamily.gd` loads faces by semantic role and enforces no-fallback, no-mipmap and no-subpixel policy.\n\n" \
            + f"Copy the delivery into `res://{family['godot']['resourceBasePath'].rstrip('/')}/`.\n\n" \
            + "Required rendering policy: nearest filtering, integer scaling, no mipmaps, " \
            + "no subpixel positioning and no system fallback during QA.\n\n" \
            + "## Faces\n\n" + face_lines + "\n\n" \
            + "## Interchange and editing formats\n\n" \
            + "Each face also includes a BDF bitmap font, an engine-neutral atlas JSON map and a transparent fixed-cell review grid PNG plus JSON map. " \
            + "The packed PNG atlas plus `.fnt` remains the efficient runtime sprite-sheet form.\n\n" \
            + "## TrueType derivatives\n\n" \
            + ("The `.ttf` files are verified convenience derivatives generated from the same "
               "pixel masters. Their OS/2 `fsType` is `0`, so authorised installation and game "
               "embedding are not technically blocked; the family licence remains authoritative. "
               "Host applications can antialias scalable outlines, so `.fnt + .png` remains the "
               "pixel-perfect Godot source.\n\n"
               if family['output']['includeTtf'] else "No TrueType derivative was requested for this build.\n\n") \
            + "## Evidence\n\n" \
            + "`family.audit.json`, per-face audits, native specimens, `pixel-font-family.json`, " \
            + "`CHECKSUMS.sha256` and `build-receipt.json` retain the exact production evidence.\n"
        write_create_only(staging / "README.md", readme.encode("utf-8"))
        source = {
            "familyMaster": {
                "path": master_path.name,
                "sha256": sha256_bytes(family_raw),
            },
            "faces": source_faces,
        }
        manifest_without_files = {
            "schema": FAMILY_OUTPUT_SCHEMA,
            "toolVersion": TOOL_VERSION,
            "familyId": family["familyId"],
            "displayName": family["displayName"],
            "version": family["version"],
            "canonicalRuntime": ["AngelCode BMFont text .fnt", "RGBA PNG atlas"],
            "interchangeFormats": [
                item
                for item, enabled in (
                    ("BDF 2.1 bitmap font", family["output"]["includeBdf"]),
                    ("EVAVO atlas JSON v1", family["output"]["includeAtlasJson"]),
                    ("transparent review grid PNG + JSON", family["output"]["includeGridSheet"]),
                )
                if enabled
            ],
            "optionalDerivatives": ["TrueType .ttf"] if family["output"]["includeTtf"] else [],
            "godot": family["godot"],
            "source": source,
            "faces": face_outputs,
            "specimens": specimens,
            "godotRuntime": runtime_helpers,
            "godotFixture": fixture,
            "license": family["license"],
        }
        write_json_create_only(staging / "pixel-font-family.json", manifest_without_files)
        checksum_hashes = tree_hashes(staging)
        checksum_text = "".join(
            f"{digest}  {relative}\n" for relative, digest in sorted(checksum_hashes.items())
        )
        write_create_only(staging / "CHECKSUMS.sha256", checksum_text.encode("utf-8"))
        file_hashes = tree_hashes(staging)
        receipt = {
            "schema": "evavo.pixel-font-build-receipt.v2",
            "toolVersion": TOOL_VERSION,
            "familyId": family["familyId"],
            "fileCount": len(file_hashes),
            "files": file_hashes,
            "deterministic": True,
            "createOnly": True,
        }
        write_json_create_only(staging / "build-receipt.json", receipt)
        os.replace(staging, output_root)
        return {**manifest_without_files, "buildReceipt": receipt}
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def validate_ttf(path: Path, face_master: Mapping[str, Any]) -> dict[str, Any]:
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        fail("TTF validation requires fontTools")
    font = TTFont(path, recalcBBoxes=False, recalcTimestamp=False)
    cmap = font.getBestCmap() or {}
    expected = {glyph["codepoint"] for glyph in face_master["glyphs"]}
    missing = sorted(expected - set(cmap))
    unexpected = sorted(set(cmap) - expected)
    has_kern = "kern" in font or "GPOS" in font
    expected_kern = bool(face_master["kerning"])
    report = {
        "glyphCount": len(cmap),
        "missing": missing,
        "unexpected": unexpected,
        "kerningPresent": has_kern,
        "expectedKerning": expected_kern,
        "unitsPerEm": font["head"].unitsPerEm,
        "embeddingFsType": font["OS/2"].fsType,
    }
    font.close()
    if missing or unexpected:
        fail(f"TTF cmap mismatch in {path}")
    if expected_kern and not has_kern:
        fail(f"TTF is missing kerning in {path}")
    if report["embeddingFsType"] != 0:
        fail(f"TTF embedding bits are not suitable for authorised project use in {path}")
    return report


def validate_output(manifest_path: Path) -> dict[str, Any]:
    manifest_path = require_regular_file(manifest_path, "family manifest")
    value, _raw = load_json(manifest_path, "family manifest")
    if not isinstance(value, dict) or value.get("schema") != FAMILY_OUTPUT_SCHEMA:
        fail(f"family manifest schema must be {FAMILY_OUTPUT_SCHEMA}")
    root = manifest_path.parent.resolve()
    receipt_value, _ = load_json(root / "build-receipt.json", "build receipt")
    expected_hashes = receipt_value.get("files")
    if not isinstance(expected_hashes, dict):
        fail("build receipt files must be an object")
    observed_hashes = tree_hashes(root, exclude={"build-receipt.json"})
    if expected_hashes != observed_hashes:
        missing = sorted(set(expected_hashes) - set(observed_hashes))
        unexpected = sorted(set(observed_hashes) - set(expected_hashes))
        changed = sorted(path for path in expected_hashes.keys() & observed_hashes.keys() if expected_hashes[path] != observed_hashes[path])
        fail(f"family identity mismatch: missing={missing}, unexpected={unexpected}, changed={changed}")

    checksum_path = require_regular_file(root / "CHECKSUMS.sha256", "checksum manifest")
    checksum_records: dict[str, str] = {}
    for line_number, line in enumerate(checksum_path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        parts = line.split("  ", 1)
        if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            fail(f"CHECKSUMS.sha256 line {line_number} is invalid")
        relative = parts[1]
        if relative in checksum_records or relative in {"CHECKSUMS.sha256", "build-receipt.json"}:
            fail(f"CHECKSUMS.sha256 line {line_number} has a prohibited or duplicate path")
        candidate = (root / relative).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            fail(f"CHECKSUMS.sha256 line {line_number} escapes the delivery")
        checksum_records[relative] = parts[0]
    checksum_observed = tree_hashes(root, exclude={"CHECKSUMS.sha256", "build-receipt.json"})
    if checksum_records != checksum_observed:
        fail("CHECKSUMS.sha256 does not match the retained delivery files")

    runtime = value.get("godotRuntime")
    if not isinstance(runtime, dict):
        fail("family manifest is missing godotRuntime")
    role_map_value, _ = load_json(root / runtime.get("roleMap", ""), "Godot role map")
    if role_map_value.get("schema") != "evavo.pixel-font-godot-role-map.v1":
        fail("Godot role map schema mismatch")
    runtime_script = require_regular_file(root / runtime.get("script", ""), "Godot runtime loader").read_text(encoding="utf-8")
    for required in ("allow_system_fallback = false", "generate_mipmaps = false", "SUBPIXEL_POSITIONING_DISABLED"):
        if required not in runtime_script:
            fail(f"Godot runtime loader is missing policy: {required}")

    face_reports: list[dict[str, Any]] = []
    for face in value.get("faces", []):
        face_id = safe_id(face.get("faceId"), "manifest faceId")
        face_root = root / "fonts" / face_id
        master, _ = load_json(face_root / f"{face_id}.master.json", f"{face_id} master")
        canonical_master, audit = validate_face_document(master, source_label=f"output:{face_id}")
        fnt_path = require_regular_file(face_root / f"{face_id}.fnt", f"{face_id} BMFont")
        parsed = parse_bmfont(fnt_path.read_text(encoding="utf-8"))
        if set(parsed["chars"]) != {glyph["codepoint"] for glyph in canonical_master["glyphs"]}:
            fail(f"{face_id} BMFont character coverage mismatch")
        if len(parsed["kernings"]) != len(canonical_master["kerning"]):
            fail(f"{face_id} BMFont kerning count mismatch")
        png_path = require_regular_file(face_root / f"{face_id}.png", f"{face_id} atlas")
        width, height, rgba = decode_owned_png(png_path.read_bytes())
        binary_violations = 0
        for index in range(0, len(rgba), 4):
            pixel = rgba[index : index + 4]
            if pixel not in {b"\x00\x00\x00\x00", b"\xff\xff\xff\xff"}:
                binary_violations += 1
        if binary_violations:
            fail(f"{face_id} atlas contains {binary_violations} non-binary pixels")
        for cp, char in parsed["chars"].items():
            if char["x"] < 0 or char["y"] < 0 or char["x"] + char["width"] > width or char["y"] + char["height"] > height:
                fail(f"{face_id} BMFont glyph U+{cp:04X} escapes atlas")
        bdf_path = face_root / f"{face_id}.bdf"
        bdf_report = None
        if bdf_path.exists():
            parsed_bdf = parse_bdf(bdf_path)
            expected_codepoints = [glyph["codepoint"] for glyph in canonical_master["glyphs"]]
            if parsed_bdf["codepoints"] != expected_codepoints:
                fail(f"{face_id} BDF character coverage or ordering mismatch")
            expected_advances = [(glyph["xAdvance"], 0) for glyph in canonical_master["glyphs"]]
            if parsed_bdf["dwidths"] != expected_advances:
                fail(f"{face_id} BDF advances mismatch")
            bdf_report = {"glyphCount": parsed_bdf["glyphCount"], "status": "passed"}

        atlas_json_path = face_root / f"{face_id}.atlas.json"
        atlas_json_report = None
        if atlas_json_path.exists():
            atlas_value, _ = load_json(atlas_json_path, f"{face_id} atlas JSON")
            if atlas_value.get("schema") != "evavo.pixel-font-atlas.v1":
                fail(f"{face_id} atlas JSON schema mismatch")
            atlas_glyphs = atlas_value.get("glyphs")
            if not isinstance(atlas_glyphs, list) or len(atlas_glyphs) != len(canonical_master["glyphs"]):
                fail(f"{face_id} atlas JSON glyph count mismatch")
            for glyph, mapped in zip(canonical_master["glyphs"], atlas_glyphs, strict=True):
                for key in ("codepoint", "width", "height", "xOffset", "yOffset", "xAdvance"):
                    if mapped.get(key) != glyph[key]:
                        fail(f"{face_id} atlas JSON {key} mismatch for U+{glyph['codepoint']:04X}")
            atlas_json_report = {"glyphCount": len(atlas_glyphs), "status": "passed"}

        grid_png_path = face_root / f"{face_id}.grid.png"
        grid_json_path = face_root / f"{face_id}.grid.json"
        grid_report = None
        if grid_png_path.exists() or grid_json_path.exists():
            if not grid_png_path.exists() or not grid_json_path.exists():
                fail(f"{face_id} grid PNG and JSON must be delivered together")
            grid_value, _ = load_json(grid_json_path, f"{face_id} grid JSON")
            if grid_value.get("schema") != "evavo.pixel-font-grid-sheet.v1":
                fail(f"{face_id} grid JSON schema mismatch")
            grid_width, grid_height, grid_rgba = decode_owned_png(grid_png_path.read_bytes())
            if [grid_width, grid_height] != [grid_value.get("width"), grid_value.get("height")]:
                fail(f"{face_id} grid dimensions mismatch")
            if len(grid_value.get("cells", [])) != len(canonical_master["glyphs"]):
                fail(f"{face_id} grid cell count mismatch")
            for index in range(0, len(grid_rgba), 4):
                if grid_rgba[index:index + 4] not in {b"\x00\x00\x00\x00", b"\xff\xff\xff\xff"}:
                    fail(f"{face_id} grid contains non-binary pixels")
            grid_report = {"glyphCount": len(grid_value["cells"]), "size": [grid_width, grid_height], "status": "passed"}

        ttf_path = face_root / f"{face_id}.ttf"
        ttf_report = validate_ttf(ttf_path, canonical_master) if ttf_path.exists() else None
        face_reports.append(
            {
                "faceId": face_id,
                "glyphCount": len(canonical_master["glyphs"]),
                "kerningPairCount": len(canonical_master["kerning"]),
                "atlas": [width, height],
                "audit": audit["status"],
                "bdf": bdf_report,
                "atlasJson": atlas_json_report,
                "gridSheet": grid_report,
                "ttf": ttf_report,
                "status": "passed",
            }
        )

    for specimen in value.get("specimens", []):
        native_name = specimen["files"]["1x"]
        native_path = root / "specimens" / native_name
        native_width, native_height, native_rgba = decode_owned_png(native_path.read_bytes())
        for scale in (2, 4):
            scaled_path = root / "specimens" / specimen["files"][f"{scale}x"]
            scaled_width, scaled_height, scaled_rgba = decode_owned_png(scaled_path.read_bytes())
            if (scaled_width, scaled_height) != (native_width * scale, native_height * scale):
                fail(f"scaled specimen dimensions are invalid: {scaled_path}")
            for y in range(scaled_height):
                for x in range(scaled_width):
                    source = ((y // scale) * native_width + (x // scale)) * 4
                    target = (y * scaled_width + x) * 4
                    if scaled_rgba[target : target + 4] != native_rgba[source : source + 4]:
                        fail(f"scaled specimen is not exact nearest-neighbour output: {scaled_path}")
    return {
        "schema": VALIDATION_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "familyId": value["familyId"],
        "faceCount": len(face_reports),
        "faces": face_reports,
        "identityFileCount": len(expected_hashes),
        "systemFallback": False,
        "status": "passed",
    }
