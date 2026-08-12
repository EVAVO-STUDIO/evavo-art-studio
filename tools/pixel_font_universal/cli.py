"""Public universal pixel-font CLI."""
from .common import *
from .source import *
from .operations import *
from .packing import *
from .formats import *
from .build import *

def load_json(path: Path, label: str) -> Any:
    resolved = path.expanduser().resolve()
    if not resolved.is_file() or resolved.is_symlink():
        fail(f"{label} must be a regular non-symlink file: {resolved}")
    data = resolved.read_bytes()
    if len(data) > MAX_INPUT_BYTES:
        fail(f"{label} exceeds {MAX_INPUT_BYTES} bytes")
    if resolved.suffix == ".gz":
        try:
            data = gzip.decompress(data)
        except gzip.BadGzipFile as exc:
            fail(f"{label} is invalid gzip: {exc}")
    try:
        return json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"{label} is invalid UTF-8 JSON: {exc}")


def command_main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="EVAVO Pixel Font Studio universal style compiler")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("catalog")
    face_parser = sub.add_parser("validate-face"); face_parser.add_argument("--face", required=True)
    profile_parser = sub.add_parser("validate-profile"); profile_parser.add_argument("--profile", required=True)
    preset_parser = sub.add_parser("profile-example"); preset_parser.add_argument("--preset", required=True); preset_parser.add_argument("--profile-id")
    compile_parser = sub.add_parser("compile"); compile_parser.add_argument("--face", required=True); compile_parser.add_argument("--profile", required=True); compile_parser.add_argument("--output", required=True)
    validate_parser = sub.add_parser("validate-output"); validate_parser.add_argument("--output", required=True)
    compare_parser = sub.add_parser("compare"); compare_parser.add_argument("--first", required=True); compare_parser.add_argument("--second", required=True)
    arguments = parser.parse_args(argv)
    if arguments.command == "catalog":
        result = style_catalog()
    elif arguments.command == "validate-face":
        face = normalise_face(load_json(Path(arguments.face), "face")); result = {"schema": "evavo.pixel-font-universal-face-validation.v1", "familyId": face["familyId"], "faceId": face["faceId"], "pixelMode": face["pixelMode"], "glyphCount": len(face["glyphs"]), "kerningPairCount": len(face["kerning"]), "status": "passed"}
    elif arguments.command == "validate-profile":
        result = normalise_profile(load_json(Path(arguments.profile), "style profile"))
    elif arguments.command == "profile-example":
        result = profile_from_preset(arguments.preset, arguments.profile_id)
    elif arguments.command == "compile":
        result = compile_face(load_json(Path(arguments.face), "face"), load_json(Path(arguments.profile), "style profile"), Path(arguments.output))
    elif arguments.command == "validate-output":
        result = validate_build(Path(arguments.output))
    else:
        result = compare_builds(Path(arguments.first), Path(arguments.second))
    sys.stdout.write(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n")
    return 0


def main() -> None:
    try:
        raise SystemExit(command_main())
    except PixelFontUniversalError as exc:
        sys.stderr.write(f"PIXEL_FONT_UNIVERSAL_ERROR: {exc}\n")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
