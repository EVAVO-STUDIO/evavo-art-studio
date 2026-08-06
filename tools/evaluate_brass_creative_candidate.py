#!/usr/bin/env python3
"""Evaluate one Brass & Brine static art candidate against game and style evidence."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from brass_creative_evaluation import (
    STATIC_SCHEMA,
    atomic_image,
    atomic_json,
    contact_sheet_mattes,
    contact_sheet_runtime_scales,
    image_features,
    load_contracts,
    load_style_bank,
    profile_style_distance,
    read_rgba,
    report_hash,
    resolve_inside,
)


def evaluate(args: argparse.Namespace) -> dict:
    repo = args.repo.resolve()
    game_root = args.game_root.resolve()
    candidate_root = args.candidate_root.resolve()
    evaluation, evaluation_bytes, game, game_bytes = load_contracts(repo, game_root, args.art_contract)
    role_profiles = game.get("roleProfiles")
    if not isinstance(role_profiles, dict) or not isinstance(role_profiles.get(args.role), dict):
        raise ValueError(f"game art direction lacks role profile: {args.role}")
    role = role_profiles[args.role]
    bank, bank_bytes, style_profile = load_style_bank(args.style_bank.resolve(), int(evaluation["limits"]["maximumJsonBytes"]), args.role)
    candidate_path = resolve_inside(candidate_root, args.candidate, "candidate")
    image, candidate_bytes = read_rgba(
        candidate_path,
        int(evaluation["limits"]["maximumImageBytes"]),
        int(evaluation["limits"]["maximumDecodedPixels"]),
    )
    candidate_sha = hashlib.sha256(candidate_bytes).hexdigest()
    candidate_size = len(candidate_bytes)
    if args.expected_candidate_sha256 and candidate_sha != args.expected_candidate_sha256.lower():
        raise ValueError("candidate SHA-256 differs from expected bytes")
    features = image_features(image)
    blockers: list[str] = []
    warnings: list[str] = []
    canvas = role.get("canvas")
    if [features["width"], features["height"]] != canvas:
        blockers.append("wrong-canvas")
    alpha_policy = role.get("alphaPolicy")
    meaningful = features["alpha"]["meaningfulAlpha"]
    if alpha_policy == "meaningful-alpha-required" and not meaningful:
        blockers.append("meaningful-alpha-required")
    if alpha_policy == "opaque" and not features["alpha"]["fullyOpaque"]:
        blockers.append("opaque-role-has-alpha")
    if alpha_policy == "preserve-authored-black-stage" and meaningful:
        warnings.append("authored-stage-contains-alpha-review-required")
    active = role.get("activeRatio")
    if not (float(active[0]) <= float(features["activeRatio"]) <= float(active[1])):
        blockers.append("active-ratio-outside-role-profile")
    palette = game.get("palette", {}).get("rules", {})
    red_limit = float(palette.get("maximumSignalRedRatio", 1.0))
    if float(features["redAccentRatio"]) > red_limit:
        blockers.append("signal-red-ratio-exceeded")
    luminance = float(features["luminanceDeviation"])
    if luminance < float(palette.get("minimumLuminanceDeviation", 0.0)):
        blockers.append("insufficient-value-separation")
    if luminance > float(palette.get("maximumLuminanceDeviation", 255.0)):
        warnings.append("extreme-value-separation-review-required")
    style = profile_style_distance(features, style_profile)
    if style.get("score") is None:
        blockers.append("style-profile-not-comparable")
    elif float(style["score"]) > float(evaluation["limits"]["maximumStyleDistance"]):
        blockers.append("role-style-distance-exceeded")
    scales = [float(value) for value in role.get("runtimeScaleChecks", [1.0])]
    mattes = [
        ("black", (0, 0, 0)),
        ("white", (255, 255, 255)),
        ("mid-grey", (128, 128, 128)),
        ("signal-red", (255, 36, 78)),
    ]
    runtime_sheet = contact_sheet_runtime_scales(image, scales)
    matte_sheet = contact_sheet_mattes(image, mattes)
    runtime_sha, runtime_size = atomic_image(args.runtime_scale_sheet.resolve(), runtime_sheet, args.replace)
    matte_sha, matte_size = atomic_image(args.matte_sheet.resolve(), matte_sheet, args.replace)
    report = {
        "schema": STATIC_SCHEMA,
        "contract": evaluation["contract"],
        "status": "passed" if not blockers else "blocked",
        "semanticRole": args.role,
        "candidateRoot": str(candidate_root),
        "candidatePath": Path(args.candidate).as_posix(),
        "candidateSha256": candidate_sha,
        "candidateSizeBytes": candidate_size,
        "sourceBinding": {
            "descriptorBoundRead": True,
            "decodedFromRetainedBytes": True,
            "singleFrameImage": True,
        },
        "artDirectionContractPath": args.art_contract,
        "artDirectionContractSha256": hashlib.sha256(game_bytes).hexdigest(),
        "evaluationContractSha256": hashlib.sha256(evaluation_bytes).hexdigest(),
        "styleBankPath": str(args.style_bank.resolve()),
        "styleBankFileSha256": hashlib.sha256(bank_bytes).hexdigest(),
        "styleBankSha256": bank.get("bankSha256"),
        "features": features,
        "roleProfile": role,
        "styleDistance": style,
        "runtimeScaleEvidence": {
            "path": str(args.runtime_scale_sheet.resolve()),
            "sha256": runtime_sha,
            "sizeBytes": runtime_size,
            "scales": scales,
        },
        "matteEvidence": {
            "path": str(args.matte_sheet.resolve()),
            "sha256": matte_sha,
            "sizeBytes": matte_size,
            "mattes": [name for name, _ in mattes],
        },
        "blockers": sorted(set(blockers)),
        "warnings": sorted(set(warnings)),
        "semanticReviewRequired": {
            "identity": True,
            "cameraAndComposition": True,
            "historicalAndCulturalSpecificity": True,
            "approvedTraitsPreserved": True,
            "forbiddenTraitsAbsent": True,
            "gameplayReadabilityAtRuntime": True,
        },
        "creativeApproval": False,
        "historicalApproval": False,
        "runtimeApproval": False,
        "publicationAuthority": False,
        "authority": evaluation["authority"],
    }
    return report_hash(report, "evaluationSha256")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--game-root", type=Path, required=True)
    parser.add_argument("--candidate-root", type=Path, required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--role", required=True)
    parser.add_argument("--art-contract", default="config/art/brass_art_direction_animation.v1.json")
    parser.add_argument("--style-bank", type=Path, required=True)
    parser.add_argument("--expected-candidate-sha256")
    parser.add_argument("--runtime-scale-sheet", type=Path, required=True)
    parser.add_argument("--matte-sheet", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()
    try:
        report = evaluate(args)
        atomic_json(args.output.resolve(), report, args.replace)
    except (OSError, UnicodeError, ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        print(f"Brass creative candidate evaluation failed: {error}", file=sys.stderr)
        return 2
    print(json.dumps({"status": report["status"], "evaluationSha256": report["evaluationSha256"], "blockers": report["blockers"]}, sort_keys=True))
    return 0 if report["status"] == "passed" else 3


if __name__ == "__main__":
    raise SystemExit(main())
