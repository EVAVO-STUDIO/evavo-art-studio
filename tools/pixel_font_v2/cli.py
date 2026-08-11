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


GODOT_EVIDENCE_SIZE = (320, 200)
GODOT_REPORT_NAME = "godot-4.6.2-report.json"
GODOT_SCREENSHOT_NAME = "godot-4.6.2-render.png"
GODOT_MIN_FOREGROUND_PIXELS = 64
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _paeth_predictor(left: int, up: int, upper_left: int) -> int:
    estimate = left + up - upper_left
    distance_left = abs(estimate - left)
    distance_up = abs(estimate - up)
    distance_upper_left = abs(estimate - upper_left)
    if distance_left <= distance_up and distance_left <= distance_upper_left:
        return left
    if distance_up <= distance_upper_left:
        return up
    return upper_left


def _decode_rgba_png(path: Path, label: str) -> tuple[int, int, bytes]:
    resolved = require_regular_file(path, label, max_bytes=16 * 1024 * 1024)
    data = resolved.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        fail(f"{label} signature is invalid")

    offset = len(PNG_SIGNATURE)
    width: int | None = None
    height: int | None = None
    compressed = bytearray()
    saw_header = False
    saw_image_data = False
    image_data_closed = False
    saw_end = False

    while offset < len(data):
        if offset + 12 > len(data):
            fail(f"{label} has a truncated chunk header")
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_end = offset + 12 + length
        if length > MAX_FILE_BYTES or chunk_end > len(data):
            fail(f"{label} has an invalid or truncated PNG chunk")
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        stored_crc = struct.unpack(">I", data[offset + 8 + length : chunk_end])[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != stored_crc:
            fail(f"{label} PNG chunk CRC mismatch")
        offset = chunk_end

        if kind == b"IHDR":
            if saw_header or length != 13 or offset != len(PNG_SIGNATURE) + 25:
                fail(f"{label} has an invalid IHDR")
            width, height, depth, colour, compression, filtering, interlace = struct.unpack(
                ">IIBBBBB",
                payload,
            )
            if width < 1 or height < 1 or width > MAX_SPECIMEN_EDGE or height > MAX_SPECIMEN_EDGE:
                fail(f"{label} dimensions are outside the supported boundary")
            if (depth, colour, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                fail(f"{label} must be 8-bit RGBA, non-interlaced PNG")
            saw_header = True
        elif kind == b"IDAT":
            if not saw_header or image_data_closed or saw_end:
                fail(f"{label} has invalid IDAT ordering")
            if len(compressed) + len(payload) > MAX_FILE_BYTES:
                fail(f"{label} compressed image data exceeds the bounded size")
            compressed.extend(payload)
            saw_image_data = True
        elif kind == b"IEND":
            if not saw_header or not saw_image_data or saw_end or length != 0:
                fail(f"{label} has an invalid IEND")
            saw_end = True
            break
        else:
            if saw_image_data:
                image_data_closed = True
            if kind not in {b"PLTE"} and kind[0] & 0x20 == 0:
                fail(f"{label} contains unsupported critical PNG chunk {kind!r}")

    if not saw_header or not saw_image_data or not saw_end or offset != len(data):
        fail(f"{label} PNG framing is incomplete or has trailing data")
    assert width is not None and height is not None

    stride = width * 4
    expected = height * (stride + 1)
    try:
        decompressor = zlib.decompressobj()
        raw = decompressor.decompress(bytes(compressed), expected + 1)
        if len(raw) > expected or decompressor.unconsumed_tail:
            fail(f"{label} decoded data exceeds the expected size")
        raw += decompressor.flush()
    except zlib.error as exc:
        fail(f"{label} has invalid compressed image data: {exc}")
    if len(raw) != expected or not decompressor.eof or decompressor.unused_data:
        fail(f"{label} decoded length or zlib framing is invalid")

    output = bytearray(width * height * 4)
    previous = bytes(stride)
    for row_index in range(height):
        source = raw[row_index * (stride + 1) : (row_index + 1) * (stride + 1)]
        filter_type = source[0]
        filtered = source[1:]
        reconstructed = bytearray(stride)
        for index, value in enumerate(filtered):
            left = reconstructed[index - 4] if index >= 4 else 0
            up = previous[index]
            upper_left = previous[index - 4] if index >= 4 else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = up
            elif filter_type == 3:
                predictor = (left + up) // 2
            elif filter_type == 4:
                predictor = _paeth_predictor(left, up, upper_left)
            else:
                fail(f"{label} uses unsupported PNG filter {filter_type}")
            reconstructed[index] = (value + predictor) & 0xFF
        start = row_index * stride
        output[start : start + stride] = reconstructed
        previous = bytes(reconstructed)
    return width, height, bytes(output)


def _validate_godot_engine_report(
    report: Any,
    *,
    report_path: Path,
    screenshot_path: Path,
    expected_face_count: int,
) -> None:
    if not isinstance(report, dict):
        fail("Godot report must be a JSON object")
    if report.get("schema") != GODOT_REPORT_SCHEMA:
        fail("Godot report schema mismatch")
    if report.get("expectedVersion") != EXPECTED_GODOT_VERSION:
        fail("Godot report expected-version mismatch")
    if report.get("observedVersion") != EXPECTED_GODOT_VERSION:
        fail("Godot report observed-version mismatch")
    if report.get("faceCount") != expected_face_count:
        fail("Godot report face-count mismatch")
    if report.get("nonBinaryPixelCount") != 0:
        fail("Godot report records non-binary rendered pixels")
    if report.get("failures") != []:
        fail(f"Godot report failed: {report.get('failures')}")
    if report.get("status") != "passed":
        fail(f"Godot report status is not passed: {report.get('status')!r}")

    reported_screenshot = report.get("screenshot")
    if not isinstance(reported_screenshot, str) or not reported_screenshot:
        fail("Godot report screenshot path is missing")
    try:
        reported_path = Path(reported_screenshot).expanduser().resolve()
    except (OSError, RuntimeError) as exc:
        fail(f"Godot report screenshot path is invalid: {exc}")
    if reported_path != screenshot_path.resolve():
        fail("Godot report screenshot path does not match the retained evidence file")
    if report_path.parent.resolve() != screenshot_path.parent.resolve():
        fail("Godot report and screenshot must share the isolated evidence root")


def _validate_godot_screenshot(path: Path) -> dict[str, Any]:
    width, height, rgba = _decode_rgba_png(path, "Godot render proof")
    if (width, height) != GODOT_EVIDENCE_SIZE:
        fail(
            f"Godot render proof must be {GODOT_EVIDENCE_SIZE[0]}x{GODOT_EVIDENCE_SIZE[1]}, "
            f"observed {width}x{height}"
        )

    foreground = 0
    background = 0
    unexpected = 0
    for index in range(0, len(rgba), 4):
        pixel = rgba[index : index + 4]
        if pixel == b"\xff\xff\xff\xff":
            foreground += 1
        elif pixel == b"\x00\x00\x00\xff":
            background += 1
        else:
            unexpected += 1
    if unexpected:
        fail(f"Godot render proof contains {unexpected} pixels outside the opaque black/white palette")
    if foreground < GODOT_MIN_FOREGROUND_PIXELS:
        fail(
            f"Godot render proof contains only {foreground} foreground pixels; "
            f"at least {GODOT_MIN_FOREGROUND_PIXELS} are required"
        )
    if background < 1:
        fail("Godot render proof contains no opaque black background pixels")

    resolved = require_regular_file(path, "Godot render proof", max_bytes=16 * 1024 * 1024)
    return {
        "path": resolved.name,
        "sha256": sha256_file(resolved),
        "width": width,
        "height": height,
        "pixelCount": width * height,
        "foregroundPixelCount": foreground,
        "backgroundPixelCount": background,
        "unexpectedPixelCount": unexpected,
        "palette": ["#000000ff", "#ffffffff"],
        "status": "passed",
    }


def _bounded_process(
    command: Sequence[str],
    *,
    label: str,
    timeout: int,
    env: Mapping[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            list(command),
            text=True,
            capture_output=True,
            shell=False,
            timeout=timeout,
            check=False,
            env=None if env is None else dict(env),
        )
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout.decode("utf-8", errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode("utf-8", errors="replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        details = (stderr or stdout)[-4000:]
        fail(f"{label} timed out after {timeout} seconds: {details}")


def _godot_render_command(
    godot_executable: Path,
    runtime_fixture: Path,
    env: dict[str, str],
) -> tuple[list[str], str, str | None]:
    # Godot's --headless display driver disables rendering. Importing can stay
    # headless, but pixel-output verification needs a real display-backed frame.
    command = [
        str(godot_executable),
        "--audio-driver",
        "Dummy",
        "--rendering-method",
        "gl_compatibility",
        "--disable-vsync",
        "--fixed-fps",
        "60",
        "--quit-after",
        "600",
        "--path",
        str(runtime_fixture),
    ]
    if not sys.platform.startswith("linux") or env.get("DISPLAY"):
        return command, "native-display", None

    configured = env.get("EVAVO_PIXEL_FONT_XVFB_RUN", "").strip()
    discovered = configured or (shutil.which("xvfb-run") or "")
    if not discovered:
        fail("Godot render verification requires xvfb-run on Linux when DISPLAY is unavailable")
    xvfb_run = require_regular_file(Path(discovered).expanduser().resolve(), "xvfb-run executable", max_bytes=1024 * 1024)
    if not os.access(xvfb_run, os.X_OK):
        fail(f"xvfb-run executable is not executable: {xvfb_run}")
    if shutil.which("xauth") is None:
        fail("Godot render verification requires xauth when using xvfb-run")
    env["LIBGL_ALWAYS_SOFTWARE"] = "1"
    return (
        [
            str(xvfb_run),
            "-a",
            "-s",
            "-screen 0 640x480x24 -nolisten tcp",
            *command,
        ],
        "xvfb-software-opengl",
        sha256_file(xvfb_run),
    )


def verify_godot(manifest_path: Path, godot_executable: Path, evidence_root: Path, expected_sha256: str | None) -> dict[str, Any]:
    manifest_path = require_regular_file(manifest_path, "family manifest")
    preflight = validate_output(manifest_path)
    godot_executable = require_regular_file(godot_executable, "Godot executable", max_bytes=512 * 1024 * 1024)
    if expected_sha256 and sha256_file(godot_executable) != expected_sha256:
        fail("Godot executable SHA-256 does not match the configured digest")
    version = _bounded_process(
        [str(godot_executable), "--version"],
        label="Godot version check",
        timeout=60,
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

    import_run = _bounded_process(
        [str(godot_executable), "--headless", "--editor", "--path", str(runtime_fixture), "--quit"],
        label="Godot import",
        timeout=180,
        env=env,
    )
    if import_run.returncode != 0:
        fail(f"Godot import failed: {(import_run.stderr or import_run.stdout)[-4000:]}")

    render_command, render_strategy, xvfb_run_sha256 = _godot_render_command(
        godot_executable,
        runtime_fixture,
        env,
    )
    render_run = _bounded_process(
        render_command,
        label="Godot render verification",
        timeout=180,
        env=env,
    )
    report_path = evidence_root / GODOT_REPORT_NAME
    screenshot_path = evidence_root / GODOT_SCREENSHOT_NAME
    if render_run.returncode != 0 or not report_path.is_file():
        fail(f"Godot render verification failed: {(render_run.stderr or render_run.stdout)[-4000:]}")

    report, _ = load_json(report_path, "Godot report")
    _validate_godot_engine_report(
        report,
        report_path=report_path,
        screenshot_path=screenshot_path,
        expected_face_count=preflight["faceCount"],
    )
    render_proof = _validate_godot_screenshot(screenshot_path)
    result = {
        "schema": GODOT_REPORT_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "familyId": preflight["familyId"],
        "godotExecutableSha256": sha256_file(godot_executable),
        "observedVersion": observed_version,
        "importExitCode": import_run.returncode,
        "renderExitCode": render_run.returncode,
        "renderStrategy": render_strategy,
        "xvfbRunSha256": xvfb_run_sha256,
        "preflightValidation": {
            "familyId": preflight["familyId"],
            "faceCount": preflight["faceCount"],
            "identityFileCount": preflight["identityFileCount"],
            "status": preflight["status"],
        },
        "engineReportSha256": sha256_file(report_path),
        "engineReport": report,
        "renderProof": render_proof,
        "evidenceIndependentlyVerified": True,
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
            "independent PNG evidence decoding, palette validation and SHA-256 retention",
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
            "linuxRenderStrategy": "xvfb-software-opengl-when-display-unavailable",
            "headlessRenderAllowed": False,
            "evidenceViewport": list(GODOT_EVIDENCE_SIZE),
            "independentPngEvidenceValidation": True,
            "opaqueBinaryEvidencePalette": True,
            "nonEmptyForegroundRequired": True,
            "evidenceHashesRequired": True,
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
