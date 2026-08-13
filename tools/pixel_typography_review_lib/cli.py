"""Command-line interface for EVAVO native-resolution typography review."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Sequence

from pixel_font_universal.common import PixelFontUniversalError

from .build import build_review
from .common import (
    ENGINE_VERSION,
    PixelTypographyReviewError,
    catalog,
    fail,
    load_json,
    normalise_profile,
    profile_from_preset,
)
from .validate import compare_reviews, validate_review


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(prog="pixel_typography_review")
    value.add_argument("--version", action="version", version=ENGINE_VERSION)
    sub = value.add_subparsers(dest="command", required=True)
    sub.add_parser("catalog")

    example = sub.add_parser("profile-example")
    example.add_argument("--preset", required=True)
    example.add_argument("--profile-id")

    validate_profile = sub.add_parser("validate-profile")
    validate_profile.add_argument("--profile", required=True)

    build = sub.add_parser("build")
    build.add_argument("--font", required=True)
    build.add_argument("--style", required=True)
    build.add_argument("--profile", required=True)
    build.add_argument("--output", required=True)

    validate_output = sub.add_parser("validate-output")
    validate_output.add_argument("--output", required=True)

    compare = sub.add_parser("compare")
    compare.add_argument("--first", required=True)
    compare.add_argument("--second", required=True)
    return value


def command_main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "catalog":
            result = catalog()
        elif args.command == "profile-example":
            result = profile_from_preset(args.preset, args.profile_id)
        elif args.command == "validate-profile":
            result = normalise_profile(load_json(Path(args.profile).resolve(), "review profile"))
        elif args.command == "build":
            result = build_review(
                Path(args.font),
                Path(args.style),
                load_json(Path(args.profile).resolve(), "review profile"),
                Path(args.output),
            )
        elif args.command == "validate-output":
            result = validate_review(Path(args.output))
        elif args.command == "compare":
            result = compare_reviews(Path(args.first), Path(args.second))
        else:
            fail(f"unsupported command {args.command!r}")
    except (PixelTypographyReviewError, PixelFontUniversalError, UnicodeDecodeError, OSError) as exc:
        sys.stderr.write(f"{exc}\n")
        return 2
    sys.stdout.write(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n")
    return 0
