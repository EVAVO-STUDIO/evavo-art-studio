#!/usr/bin/env python3
"""Public CLI and library surface for the deterministic EVAVO pixel-font studio."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

from pixel_font_studio_common import (
    BRIEF_SCHEMA, COMPILER_ID, COMPILER_VERSION, GLYPH_MASTER_SHA256,
    MANIFEST_SCHEMA, QA_SCHEMA, SPEC_SCHEMA, PixelFontError,
    hash_document, read_json, sha256_bytes, verify_document_hash,
)
from pixel_font_studio_pipeline import compile_family, provider_brief, verify_family
from pixel_font_studio_raster import parse_fnt
from pixel_font_studio_spec import normalize_spec

__all__ = [
    "BRIEF_SCHEMA", "COMPILER_ID", "COMPILER_VERSION",
    "GLYPH_MASTER_SHA256", "MANIFEST_SCHEMA", "QA_SCHEMA", "SPEC_SCHEMA",
    "PixelFontError", "compile_family", "hash_document", "normalize_spec",
    "parse_fnt", "provider_brief", "verify_document_hash", "verify_family",
]

def print_json(value: Mapping[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pixel-font-studio")
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate_parser = subparsers.add_parser("validate", help="validate and normalize a family spec")
    validate_parser.add_argument("--spec", required=True, type=Path)
    compile_parser = subparsers.add_parser("compile", help="compile a family into BMFont/Godot outputs")
    compile_parser.add_argument("--spec", required=True, type=Path)
    compile_parser.add_argument("--output-dir", required=True, type=Path)
    compile_parser.add_argument("--replace-generated", action="store_true")
    verify_parser = subparsers.add_parser("verify", help="verify a compiled family manifest and all files")
    verify_parser.add_argument("--manifest", required=True, type=Path)
    brief_parser = subparsers.add_parser("provider-brief", help="create a provider-neutral visual ideation brief")
    brief_parser.add_argument("--spec", required=True, type=Path)
    brief_parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "validate":
            spec_bytes, raw = read_json(args.spec)
            normalized = normalize_spec(raw)
            print_json(hash_document({
                "schema": "evavo.pixel-font-spec-validation.v1",
                "status": "passed",
                "specSha256": sha256_bytes(spec_bytes),
                "normalizedSpec": normalized,
            }, "validationSha256"))
        elif args.command == "compile":
            print_json(compile_family(args.spec, args.output_dir, args.replace_generated))
        elif args.command == "verify":
            print_json(verify_family(args.manifest))
        elif args.command == "provider-brief":
            print_json(provider_brief(args.spec, args.output))
        else:  # pragma: no cover
            raise PixelFontError("unsupported command")
        return 0
    except PixelFontError as exc:
        sys.stderr.write(f"pixel-font-studio: {exc}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
