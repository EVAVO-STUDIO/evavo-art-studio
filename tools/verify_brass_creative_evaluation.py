#!/usr/bin/env python3
"""Permanent executable regression for Brass static and animation evaluation."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

from PIL import Image, ImageDraw

import brass_creative_evaluation as core
import evaluate_brass_animation_sequence as animation
import evaluate_brass_creative_candidate as static


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def make_character(path: Path, shift: int = 0, width: int = 512, height: int = 512) -> None:
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((190 + shift, 44, 320 + shift, 178), fill=(216, 198, 168, 255), outline=(18, 18, 18, 255), width=7)
    draw.rectangle((154 + shift, 166, 358 + shift, 470), fill=(42, 48, 50, 255), outline=(226, 220, 198, 255), width=8)
    draw.line((206 + shift, 470, 200 + shift, 504), fill=(218, 210, 190, 255), width=18)
    draw.line((306 + shift, 470, 312 + shift, 504), fill=(218, 210, 190, 255), width=18)
    image.save(path, format="PNG")


def fixture(repo: Path, game: Path, work: Path) -> dict:
    candidate_root, evidence, frames_root = work / "candidates", work / "evidence", work / "frames"
    for directory in (candidate_root, evidence, frames_root):
        directory.mkdir(parents=True, exist_ok=True)
    candidate = candidate_root / "standing.png"
    make_character(candidate)
    features = core.image_features(core.load_rgba(candidate, 220_000_000))
    style_bank = {
        "schema": core.STYLE_BANK_SCHEMA,
        "contract": "evavo.executable-image-pipeline.v1",
        "bankSha256": "b" * 64,
        "runId": "b" * 20,
        "roleProfiles": {"standing_character": {
            "referenceCount": 1,
            "confidence": "low",
            "scalars": {name: {"median": features[name], "p10": features[name], "p90": features[name]} for name in ("aspectRatio", "luminanceMean", "luminanceDeviation", "redAccentRatio", "activeRatio")},
            "referenceDhashes": [features["dhash"]],
        }},
    }
    style_path = work / "style-bank.json"
    write_json(style_path, style_bank)
    static_args = SimpleNamespace(repo=repo, game_root=game, candidate_root=candidate_root, candidate="standing.png", role="standing_character", art_contract="config/art/brass_art_direction_animation.v1.json", style_bank=style_path, expected_candidate_sha256=hashlib.sha256(candidate.read_bytes()).hexdigest(), runtime_scale_sheet=evidence / "runtime-scales.png", matte_sheet=evidence / "mattes.png", output=evidence / "static.json", replace=False)
    static_report = static.evaluate(static_args)
    if static_report["status"] != "passed" or static_report["blockers"]:
        raise AssertionError(f"valid static fixture blocked: {static_report['blockers']}")
    bad_candidate = candidate_root / "bad-canvas.png"
    make_character(bad_candidate, width=256, height=256)
    bad_args = SimpleNamespace(**{**vars(static_args), "candidate": "bad-canvas.png", "expected_candidate_sha256": None, "runtime_scale_sheet": evidence / "bad-runtime.png", "matte_sheet": evidence / "bad-matte.png", "output": evidence / "bad-static.json"})
    bad_report = static.evaluate(bad_args)
    if "wrong-canvas" not in bad_report["blockers"]:
        raise AssertionError("wrong canvas was accepted")
    frame_records = []
    for index, (shift, tags) in enumerate(zip([0, 3, -2, 0], [["idle"], ["weight-shift"], ["idle"], ["idle"]])):
        path = frames_root / f"idle_{index:02d}.png"
        make_character(path, shift=shift)
        frame_records.append({"path": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "durationMs": 120, "pivot": [0.5, 1.0], "baseline": 0.97, "groundContact": 0.97, "poseTags": tags})
    manifest = {"schema": core.ANIMATION_MANIFEST_SCHEMA, "semanticIdentity": "fixture-character", "sourceFamily": "standingCharacter", "clipId": "idle", "variant": None, "direction": "right", "loop": True, "spriteFramesDestination": "res://assets/art/characters/fixture/fixture.tres", "frames": frame_records}
    manifest_path = work / "animation.json"
    write_json(manifest_path, manifest)
    animation_args = SimpleNamespace(repo=repo, game_root=game, frame_root=frames_root, manifest=manifest_path, art_contract="config/art/brass_art_direction_animation.v1.json", contact_sheet=evidence / "animation-sheet.png", output=evidence / "animation-report.json", replace=False)
    animation_report = animation.evaluate(animation_args)
    if animation_report["status"] != "passed" or animation_report["blockers"]:
        raise AssertionError(f"valid animation fixture blocked: {animation_report['blockers']}")
    duplicate = json.loads(json.dumps(manifest))
    duplicate["frames"][1]["path"] = duplicate["frames"][0]["path"]
    duplicate["frames"][1]["sha256"] = duplicate["frames"][0]["sha256"]
    duplicate_path = work / "duplicate-animation.json"
    write_json(duplicate_path, duplicate)
    duplicate_args = SimpleNamespace(**{**vars(animation_args), "manifest": duplicate_path, "contact_sheet": evidence / "duplicate-sheet.png", "output": evidence / "duplicate-report.json"})
    duplicate_report = animation.evaluate(duplicate_args)
    if not any(value.startswith("adjacent-duplicate-frame") for value in duplicate_report["blockers"]):
        raise AssertionError("adjacent duplicate animation frame was accepted")
    return {"status": "passed", "staticEvaluationSha256": static_report["evaluationSha256"], "animationEvaluationSha256": animation_report["evaluationSha256"], "staticBlockerFixture": bad_report["blockers"], "animationBlockerFixture": duplicate_report["blockers"]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.parse_args()
    try:
        repo = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(prefix="evavo-brass-creative-") as temporary:
            root = Path(temporary)
            game = root / "Brass_Brine"
            write_json(game / "config" / "art" / "brass_art_direction_animation.v1.json", {
                "contract": core.GAME_CONTRACT_ID,
                "targetRepository": "EVAVO-STUDIO/Brass_Brine",
                "palette": {"rules": {"maximumSignalRedRatio": 0.12, "minimumLuminanceDeviation": 18.0, "maximumLuminanceDeviation": 92.0}},
                "roleProfiles": {"standing_character": {"canvas": [512, 512], "alphaPolicy": "meaningful-alpha-required", "activeRatio": [0.22, 0.78], "runtimeScaleChecks": [1.0, 0.5, 0.25, 0.125]}},
                "animation": {"identityAnchors": ["face", "body-proportions", "costume", "camera", "light-direction"], "global": {"maximumIdentityDhashDistance": 24, "maximumBaselineDriftNormalized": 0.018, "maximumPlantedFootDriftNormalized": 0.012, "maximumActiveBoundsAreaChangePerFrame": 0.22, "minimumLoopSeamDhashSimilarity": 0.55}, "clipProfiles": {"character_idle": {"minimumFrames": 4, "maximumFrames": 8, "durationMsRange": [90, 220], "loop": True, "requiredTags": ["idle", "weight-shift"]}}}
            })
            result = fixture(repo, game, root / "work")
    except (OSError, UnicodeError, ValueError, TypeError, KeyError, json.JSONDecodeError, AssertionError) as error:
        print(f"Brass creative evaluation verification failed: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
