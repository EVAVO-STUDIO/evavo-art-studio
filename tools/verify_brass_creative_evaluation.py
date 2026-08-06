#!/usr/bin/env python3
"""Permanent executable regression for Brass static and animation evaluation."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
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
    candidate_image, _ = core.read_rgba(candidate, 2_147_483_648, 220_000_000)
    features = core.image_features(candidate_image)
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
    if static_report["sourceBinding"] != {
        "descriptorBoundRead": True,
        "decodedFromRetainedBytes": True,
        "singleFrameImage": True,
    }:
        raise AssertionError("static source binding evidence is incomplete")
    bad_candidate = candidate_root / "bad-canvas.png"
    make_character(bad_candidate, width=256, height=256)
    bad_args = SimpleNamespace(**{**vars(static_args), "candidate": "bad-canvas.png", "expected_candidate_sha256": None, "runtime_scale_sheet": evidence / "bad-runtime.png", "matte_sheet": evidence / "bad-matte.png", "output": evidence / "bad-static.json"})
    bad_report = static.evaluate(bad_args)
    if "wrong-canvas" not in bad_report["blockers"]:
        raise AssertionError("wrong canvas was accepted")

    race_candidate = candidate_root / "race-standing.png"
    make_character(race_candidate)
    race_candidate_sha = hashlib.sha256(race_candidate.read_bytes()).hexdigest()
    race_args = SimpleNamespace(**{
        **vars(static_args),
        "candidate": race_candidate.name,
        "expected_candidate_sha256": race_candidate_sha,
        "runtime_scale_sheet": evidence / "race-runtime.png",
        "matte_sheet": evidence / "race-matte.png",
        "output": evidence / "race-static.json",
    })
    original_stable_bytes = core.stable_bytes
    static_swap_performed = False

    def replace_static_after_read(path: Path, maximum: int) -> bytes:
        nonlocal static_swap_performed
        data = original_stable_bytes(path, maximum)
        if not static_swap_performed and Path(path).resolve() == race_candidate.resolve():
            replacement = candidate_root / ".race-static-replacement.png"
            make_character(replacement, width=256, height=256)
            os.replace(replacement, race_candidate)
            static_swap_performed = True
        return data

    core.stable_bytes = replace_static_after_read
    try:
        static_race_report = static.evaluate(race_args)
    finally:
        core.stable_bytes = original_stable_bytes
    if not static_swap_performed:
        raise AssertionError("static source replacement attack did not execute")
    if static_race_report["status"] != "passed" or static_race_report["blockers"]:
        raise AssertionError(f"static evaluation reopened a replaced source path: {static_race_report['blockers']}")
    if static_race_report["candidateSha256"] != race_candidate_sha or static_race_report["features"]["width"] != 512:
        raise AssertionError("static evaluation did not remain bound to retained source bytes")
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
    if not all(frame["sourceBinding"]["decodedFromRetainedBytes"] for frame in animation_report["frames"]):
        raise AssertionError("animation frame binding evidence is incomplete")

    race_frames_root = work / "race-frames"
    race_frames_root.mkdir(parents=True, exist_ok=True)
    race_frame_records = []
    for index, (shift, tags) in enumerate(zip([0, 3, -2, 0], [["idle"], ["weight-shift"], ["idle"], ["idle"]])):
        path = race_frames_root / f"idle_{index:02d}.png"
        make_character(path, shift=shift)
        race_frame_records.append({"path": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "durationMs": 120, "pivot": [0.5, 1.0], "baseline": 0.97, "groundContact": 0.97, "poseTags": tags})
    race_manifest = {**manifest, "frames": race_frame_records}
    race_manifest_path = work / "race-animation.json"
    write_json(race_manifest_path, race_manifest)
    race_animation_args = SimpleNamespace(**{
        **vars(animation_args),
        "frame_root": race_frames_root,
        "manifest": race_manifest_path,
        "contact_sheet": evidence / "race-animation-sheet.png",
        "output": evidence / "race-animation-report.json",
    })
    race_frame = race_frames_root / "idle_01.png"
    animation_swap_performed = False

    def replace_animation_after_read(path: Path, maximum: int) -> bytes:
        nonlocal animation_swap_performed
        data = original_stable_bytes(path, maximum)
        if not animation_swap_performed and Path(path).resolve() == race_frame.resolve():
            replacement = race_frames_root / ".race-animation-replacement.png"
            Image.new("RGBA", (32, 32), (255, 0, 0, 255)).save(replacement, format="PNG")
            os.replace(replacement, race_frame)
            animation_swap_performed = True
        return data

    core.stable_bytes = replace_animation_after_read
    try:
        animation_race_report = animation.evaluate(race_animation_args)
    finally:
        core.stable_bytes = original_stable_bytes
    if not animation_swap_performed:
        raise AssertionError("animation source replacement attack did not execute")
    if animation_race_report["status"] != "passed" or animation_race_report["blockers"]:
        raise AssertionError(f"animation evaluation reopened a replaced frame path: {animation_race_report['blockers']}")
    if animation_race_report["frames"][1]["features"]["width"] != 512:
        raise AssertionError("animation evaluation did not remain bound to retained frame bytes")
    duplicate = json.loads(json.dumps(manifest))
    duplicate["frames"][1]["path"] = duplicate["frames"][0]["path"]
    duplicate["frames"][1]["sha256"] = duplicate["frames"][0]["sha256"]
    duplicate_path = work / "duplicate-animation.json"
    write_json(duplicate_path, duplicate)
    duplicate_args = SimpleNamespace(**{**vars(animation_args), "manifest": duplicate_path, "contact_sheet": evidence / "duplicate-sheet.png", "output": evidence / "duplicate-report.json"})
    duplicate_report = animation.evaluate(duplicate_args)
    if not any(value.startswith("adjacent-duplicate-frame") for value in duplicate_report["blockers"]):
        raise AssertionError("adjacent duplicate animation frame was accepted")

    collision_target = evidence / "create-only-race.json"
    original_mkstemp = core.tempfile.mkstemp
    collision_injected = False

    def inject_output_collision(*args, **kwargs):
        nonlocal collision_injected
        descriptor, name = original_mkstemp(*args, **kwargs)
        if not collision_injected:
            collision_target.write_bytes(b"intruder-owned-evidence\n")
            collision_injected = True
        return descriptor, name

    core.tempfile.mkstemp = inject_output_collision
    try:
        try:
            core.atomic_json(collision_target, {"mustNot": "overwrite"})
        except ValueError as error:
            if "already exists" not in str(error):
                raise
        else:
            raise AssertionError("create-only evidence publication overwrote a racing target")
    finally:
        core.tempfile.mkstemp = original_mkstemp
    if collision_target.read_bytes() != b"intruder-owned-evidence\n":
        raise AssertionError("create-only collision changed the pre-existing target bytes")

    multi_frame = work / "multi-frame.gif"
    Image.new("RGBA", (16, 16), (0, 0, 0, 255)).save(
        multi_frame,
        format="GIF",
        save_all=True,
        append_images=[Image.new("RGBA", (16, 16), (255, 255, 255, 255))],
        duration=100,
        loop=0,
    )
    try:
        core.read_rgba(multi_frame, 1_000_000, 1_000_000)
    except ValueError as error:
        if "multi-frame image is not allowed" not in str(error):
            raise
    else:
        raise AssertionError("multi-frame source image was accepted")

    return {
        "status": "passed",
        "staticEvaluationSha256": static_report["evaluationSha256"],
        "animationEvaluationSha256": animation_report["evaluationSha256"],
        "staticBlockerFixture": bad_report["blockers"],
        "animationBlockerFixture": duplicate_report["blockers"],
        "staticSourceReplacementRace": "retained-original-bytes",
        "animationSourceReplacementRace": "retained-original-bytes",
        "createOnlyPublicationRace": "rejected-without-overwrite",
        "multiFrameSource": "rejected",
    }


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
