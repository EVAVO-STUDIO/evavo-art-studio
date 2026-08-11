"""Inspection, comparison, native Godot verification and CLI."""
from .common import *
from .schema import *
from .formats import *
from .build import *


def inspect_glyph(face_path: Path, codepoint: int) -> dict[str, Any]:
    face_value, _ = load_json(face_path, "face master")
    face, _audit = validate_face_document(face_value, source_label="face master")
    record = next((glyph for glyph in face["glyphs"] if glyph["codepoint"] == codepoint), None)
    if record is None:
        fail(f"face {face['faceId']} has no glyph U+{codepoint:04X}")
    pairs = [item for item in face["kerning"] if item["first"] == codepoint or item["second"] == codepoint]
    return {
        "schema": "evavo.pixel-font-glyph-inspection.v2",
        "faceId": face["faceId"],
        "glyph": record,
        "pixels": len(glyph_pixel_set(record)),
        "kerning": pairs,
    }


def compare_builds(first: Path, second: Path) -> dict[str, Any]:
    first_hashes = tree_hashes(first)
    second_hashes = tree_hashes(second)
    if first_hashes != second_hashes:
        changed = sorted(path for path in first_hashes.keys() & second_hashes.keys() if first_hashes[path] != second_hashes[path])
        fail(
            f"builds are not reproducible: missing={sorted(set(first_hashes)-set(second_hashes))}, "
            f"unexpected={sorted(set(second_hashes)-set(first_hashes))}, changed={changed}"
        )
    return {
        "schema": "evavo.pixel-font-reproducibility.v2",
        "fileCount": len(first_hashes),
        "treeSha256": sha256_bytes(canonical_json_bytes(first_hashes)),
        "status": "passed",
    }


def verify_godot(manifest_path: Path, godot_executable: Path, evidence_root: Path, expected_sha256: str | None) -> dict[str, Any]:
    manifest_path = require_regular_file(manifest_path, "family manifest")
    godot_executable = require_regular_file(godot_executable, "Godot executable", max_bytes=512 * 1024 * 1024)
    if expected_sha256 and sha256_file(godot_executable) != expected_sha256:
        fail("Godot executable SHA-256 does not match the configured digest")
    version = subprocess.run(
        [str(godot_executable), "--version"],
        text=True,
        capture_output=True,
        shell=False,
        timeout=60,
        check=False,
    )
    observed_version = (version.stdout or version.stderr).strip()
    if version.returncode != 0 or not observed_version.startswith(EXPECTED_GODOT_VERSION):
        fail(f"expected Godot {EXPECTED_GODOT_VERSION}, observed {observed_version!r}")
    root = manifest_path.parent.resolve()
    source_fixture = root / "godot_fixture"
    evidence_root = evidence_root.resolve()
    if evidence_root.exists():
        fail(f"Godot evidence root must not already exist: {evidence_root}")
    evidence_root.mkdir(parents=True, exist_ok=False)
    runtime_fixture = evidence_root / "fixture"
    shutil.copytree(source_fixture, runtime_fixture, symlinks=False, ignore=shutil.ignore_patterns("delivery"))
    shutil.copytree(root / "fonts", runtime_fixture / "delivery" / "fonts")
    env = {
        **os.environ,
        "EVAVO_PIXEL_FONT_EVIDENCE_ROOT": str(evidence_root),
    }
    import_run = subprocess.run(
        [str(godot_executable), "--headless", "--editor", "--path", str(runtime_fixture), "--quit"],
        text=True,
        capture_output=True,
        shell=False,
        timeout=180,
        check=False,
        env=env,
    )
    if import_run.returncode != 0:
        fail(f"Godot import failed: {(import_run.stderr or import_run.stdout)[-4000:]}")
    render_run = subprocess.run(
        [
            str(godot_executable),
            "--headless",
            "--rendering-method",
            "gl_compatibility",
            "--path",
            str(runtime_fixture),
        ],
        text=True,
        capture_output=True,
        shell=False,
        timeout=180,
        check=False,
        env=env,
    )
    report_path = evidence_root / "godot-4.6.2-report.json"
    if render_run.returncode != 0 or not report_path.is_file():
        fail(f"Godot render verification failed: {(render_run.stderr or render_run.stdout)[-4000:]}")
    report, _ = load_json(report_path, "Godot report")
    if report.get("status") != "passed":
        fail(f"Godot report failed: {report.get('failures')}")
    result = {
        "schema": GODOT_REPORT_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "familyId": json.loads(manifest_path.read_text(encoding="utf-8"))["familyId"],
        "godotExecutableSha256": sha256_file(godot_executable),
        "observedVersion": observed_version,
        "importExitCode": import_run.returncode,
        "renderExitCode": render_run.returncode,
        "engineReport": report,
        "logs": {
            "importStdout": import_run.stdout[-8000:],
            "importStderr": import_run.stderr[-8000:],
            "renderStdout": render_run.stdout[-8000:],
            "renderStderr": render_run.stderr[-8000:],
        },
        "status": "passed",
    }
    write_json_create_only(evidence_root / "verification-summary.json", result)
    return result


def seal_document(kind: str, document: Any, output: Path) -> dict[str, Any]:
    if output.exists():
        fail(f"seal output already exists: {output}")
    if kind == "face":
        canonical, audit = validate_face_document(document, source_label="candidate face")
        write_json_create_only(output, canonical)
        return {"kind": kind, "faceId": canonical["faceId"], "sha256": sha256_file(output), "audit": audit}
    canonical, _loaded, audit = validate_family_document(document, source_label="candidate family", load_faces=False)
    write_json_create_only(output, canonical)
    return {"kind": kind, "familyId": canonical["familyId"], "sha256": sha256_file(output), "audit": audit}


def catalog() -> dict[str, Any]:
    return {
        "schema": FAMILY_MASTER_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "canonicalRuntime": ["AngelCode BMFont text .fnt", "RGBA PNG atlas"],
        "interchangeFormats": [
            "BDF 2.1 bitmap font",
            "EVAVO atlas JSON v1",
            "transparent fixed-cell review grid PNG + JSON",
        ],
        "optionalDerivatives": ["TrueType .ttf with cmap, legacy kern and OpenType GPOS kerning"],
        "profiles": available_profiles(),
        "supports": [
            "independent per-face explicit glyph masters",
            "arbitrary rectangular glyph matrices",
            "per-glyph x/y offsets and advances",
            "ascent, descent, baseline, cap height, x-height and line height",
            "face-specific kerning",
            "Western Latin and game-specific Unicode coverage profiles",
            "confusable, duplicate, clipping and exhaustive pair-collision QA",
            "deterministic packed RGBA atlases",
            "engine-neutral atlas JSON maps",
            "BDF 2.1 bitmap interchange",
            "transparent fixed-cell review grid sheets",
            "native 320x200 and exact integer-scaled specimens",
            "optional pixel-outline TrueType derivatives",
            "no-system-fallback Godot fixture",
            "pinned Godot 4.6.2 import and render verification",
            "create-only builds and sealed masters",
        ],
        "godot": {
            "targetVersion": EXPECTED_GODOT_VERSION,
            "officialLinuxArchiveSha256": EXPECTED_GODOT_LINUX_ARCHIVE_SHA256,
            "textureFilter": "nearest",
            "integerScaleOnly": True,
            "subpixelPositioning": False,
            "mipmaps": False,
            "systemFallback": False,
        },
    }


def read_stdin_json() -> Any:
    raw = sys.stdin.buffer.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        fail("stdin JSON exceeds maximum size")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"stdin is not valid UTF-8 JSON: {exc}")


def command_main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="EVAVO Pixel Font Studio v2")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("catalog")
    audit_parser = sub.add_parser("audit")
    audit_parser.add_argument("--face")
    audit_parser.add_argument("--family")
    inspect_parser = sub.add_parser("inspect")
    inspect_parser.add_argument("--face", required=True)
    inspect_parser.add_argument("--codepoint", required=True)
    build_parser = sub.add_parser("build")
    build_parser.add_argument("--master", required=True)
    build_parser.add_argument("--output", required=True)
    validate_parser = sub.add_parser("validate")
    validate_parser.add_argument("--family", required=True)
    compare_parser = sub.add_parser("compare")
    compare_parser.add_argument("--first", required=True)
    compare_parser.add_argument("--second", required=True)
    seal_face_parser = sub.add_parser("seal-face")
    seal_face_parser.add_argument("--output", required=True)
    seal_family_parser = sub.add_parser("seal-family")
    seal_family_parser.add_argument("--output", required=True)
    godot_parser = sub.add_parser("verify-godot")
    godot_parser.add_argument("--family", required=True)
    godot_parser.add_argument("--godot", required=True)
    godot_parser.add_argument("--evidence", required=True)
    godot_parser.add_argument("--sha256")
    arguments = parser.parse_args(argv)

    if arguments.command == "catalog":
        result = catalog()
    elif arguments.command == "audit":
        if bool(arguments.face) == bool(arguments.family):
            fail("audit requires exactly one of --face or --family")
        if arguments.face:
            value, _ = load_json(Path(arguments.face), "face master")
            _face, result = validate_face_document(value, source_label="face master")
        else:
            path = Path(arguments.family).resolve()
            value, _ = load_json(path, "family master")
            _family, _loaded, result = validate_family_document(value, source_path=path, source_label="family master")
    elif arguments.command == "inspect":
        token = arguments.codepoint.strip()
        if token.upper().startswith("U+"):
            codepoint = int(token[2:], 16)
        elif len(token) == 1:
            codepoint = ord(token)
        else:
            codepoint = int(token, 0)
        if not is_codepoint(codepoint):
            fail("inspect codepoint is invalid")
        result = inspect_glyph(Path(arguments.face), codepoint)
    elif arguments.command == "build":
        result = build_family(Path(arguments.master).resolve(), Path(arguments.output).resolve())
    elif arguments.command == "validate":
        result = validate_output(Path(arguments.family).resolve())
    elif arguments.command == "compare":
        result = compare_builds(Path(arguments.first).resolve(), Path(arguments.second).resolve())
    elif arguments.command == "seal-face":
        result = seal_document("face", read_stdin_json(), Path(arguments.output).resolve())
    elif arguments.command == "seal-family":
        result = seal_document("family", read_stdin_json(), Path(arguments.output).resolve())
    else:
        result = verify_godot(
            Path(arguments.family).resolve(),
            Path(arguments.godot).resolve(),
            Path(arguments.evidence).resolve(),
            arguments.sha256,
        )
    sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return 0


def main() -> None:
    try:
        raise SystemExit(command_main())
    except PixelFontError as exc:
        sys.stderr.write(f"PIXEL_FONT_V2_ERROR: {exc}\n")
        raise SystemExit(2)
