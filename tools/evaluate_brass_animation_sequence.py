#!/usr/bin/env python3
"""Evaluate an exact Brass & Brine animation sequence manifest."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from brass_creative_evaluation import (
    ANIMATION_MANIFEST_SCHEMA,
    ANIMATION_SCHEMA,
    atomic_image,
    atomic_json,
    hamming,
    image_features,
    load_contracts,
    read_rgba,
    report_hash,
    resolve_inside,
    stable_bytes,
)


def clip_profile(game: dict, family: str, clip_id: str) -> dict:
    profiles = game["animation"]["clipProfiles"]
    crosswalk = {
        ("standingCharacter", "idle"): "character_idle", ("standingCharacter", "walk"): "character_walk",
        ("standingCharacter", "talk"): "character_talk", ("standingCharacter", "gesture"): "character_gesture",
        ("standingCharacter", "hurt"): "character_hurt", ("standingCharacter", "collapse"): "character_collapse",
        ("combatCharacter", "pistol_aim"): "pistol_aim", ("combatCharacter", "pistol_fire"): "pistol_fire",
        ("combatCharacter", "sword_high"): "sword_attack", ("combatCharacter", "sword_low"): "sword_attack",
        ("combatCharacter", "sword_stab"): "sword_attack", ("combatCharacter", "block"): "character_block",
        ("combatCharacter", "death"): "character_death", ("ship", "idle_bob"): "ship_idle",
        ("ship", "sail"): "ship_sail", ("ship", "turn"): "ship_turn",
        ("ship", "broadside_fire"): "ship_fire", ("ship", "bow_fire"): "ship_fire",
        ("ship", "stern_fire"): "ship_fire", ("ship", "damage"): "ship_damage",
        ("ship", "sinking"): "ship_sinking", ("weather", "rain_light"): "weather_loop",
        ("weather", "rain_heavy"): "weather_loop", ("weather", "snow"): "weather_loop",
        ("weather", "fog"): "weather_loop", ("weather", "spray"): "weather_loop",
        ("weather", "lightning"): "weather_loop", ("weather", "sea_foam"): "weather_loop",
        ("combatEffect", "combat_effect"): "combat_effect",
    }
    profile_id = crosswalk.get((family, clip_id))
    if not profile_id or profile_id not in profiles:
        raise ValueError(f"unknown governed animation clip: {family}/{clip_id}")
    return {"profileId": profile_id, **profiles[profile_id]}


def contact_sheet(frames: list[tuple[dict, Image.Image]], width: int = 192) -> Image.Image:
    blocks = []
    for index, (record, image) in enumerate(frames):
        preview = image.copy()
        preview.thumbnail((width, width), getattr(Image, "Resampling", Image).LANCZOS)
        block = Image.new("RGBA", (width + 24, width + 52), (48, 48, 48, 255))
        block.alpha_composite(preview, ((block.width - preview.width) // 2, 24 + (width - preview.height) // 2))
        ImageDraw.Draw(block).text((6, 5), f"{index:02d} {record['durationMs']}ms", fill=(255, 255, 255, 255))
        blocks.append(block)
    columns = min(6, max(1, len(blocks)))
    rows = (len(blocks) + columns - 1) // columns
    output = Image.new("RGBA", (columns * blocks[0].width, rows * blocks[0].height), (20, 20, 20, 255))
    for index, block in enumerate(blocks):
        output.alpha_composite(block, ((index % columns) * block.width, (index // columns) * block.height))
    return output


def evaluate(args: argparse.Namespace) -> dict:
    repo = args.repo.resolve()
    game_root = args.game_root.resolve()
    frame_root = args.frame_root.resolve()
    evaluation, evaluation_bytes, game, game_bytes = load_contracts(repo, game_root, args.art_contract)
    manifest_bytes = stable_bytes(args.manifest.resolve(), int(evaluation["limits"]["maximumJsonBytes"]))
    manifest = json.loads(manifest_bytes.decode("utf-8-sig"))
    if not isinstance(manifest, dict) or manifest.get("schema") != ANIMATION_MANIFEST_SCHEMA:
        raise ValueError("unexpected animation manifest schema")
    family = str(manifest.get("sourceFamily") or "")
    clip_id = str(manifest.get("clipId") or "")
    profile = clip_profile(game, family, clip_id)
    frames = manifest.get("frames")
    if not isinstance(frames, list) or not frames:
        raise ValueError("animation manifest has no frames")
    if len(frames) > int(evaluation["limits"]["maximumFrames"]):
        raise ValueError("animation manifest exceeds maximum frame count")
    blockers: list[str] = []
    warnings: list[str] = []
    if not int(profile["minimumFrames"]) <= len(frames) <= int(profile["maximumFrames"]):
        blockers.append("frame-count-outside-profile")
    if bool(manifest.get("loop")) != bool(profile["loop"]):
        blockers.append("loop-policy-mismatch")
    required_tags = set(profile.get("requiredTags") or [])
    present_tags: set[str] = set()
    decoded: list[tuple[dict, Image.Image]] = []
    identities: list[dict] = []
    seen_paths: set[str] = set()
    for index, frame in enumerate(frames):
        if not isinstance(frame, dict):
            raise ValueError(f"frame {index} is not an object")
        relative = str(frame.get("path") or "")
        if relative in seen_paths:
            blockers.append("duplicate-frame-path")
        seen_paths.add(relative)
        path = resolve_inside(frame_root, relative, f"frame {index}")
        image, frame_bytes = read_rgba(
            path,
            int(evaluation["limits"]["maximumImageBytes"]),
            int(evaluation["limits"]["maximumDecodedPixels"]),
        )
        sha = hashlib.sha256(frame_bytes).hexdigest()
        size = len(frame_bytes)
        if sha != str(frame.get("sha256") or "").lower():
            blockers.append(f"frame-hash-mismatch:{index}")
        duration = frame.get("durationMs")
        if not isinstance(duration, int) or not int(profile["durationMsRange"][0]) <= duration <= int(profile["durationMsRange"][1]):
            blockers.append(f"frame-duration-outside-profile:{index}")
        for key in ("pivot", "baseline", "groundContact"):
            if key not in frame:
                blockers.append(f"missing-{key}:{index}")
        tags = frame.get("poseTags")
        if not isinstance(tags, list) or not tags:
            blockers.append(f"missing-pose-tags:{index}")
        else:
            present_tags.update(str(tag) for tag in tags)
        features = image_features(image)
        decoded.append((frame, image))
        identities.append({
            "index": index,
            "path": relative,
            "sha256": sha,
            "sizeBytes": size,
            "sourceBinding": {
                "descriptorBoundRead": True,
                "decodedFromRetainedBytes": True,
                "singleFrameImage": True,
            },
            "features": features,
        })
    missing_tags = sorted(required_tags - present_tags)
    if missing_tags:
        blockers.append("missing-required-pose-tags:" + ",".join(missing_tags))
    global_rules = game["animation"]["global"]
    adjacent: list[dict] = []
    for index in range(1, len(identities)):
        left, right = identities[index - 1], identities[index]
        record = {
            "from": index - 1, "to": index,
            "duplicateBytes": left["sha256"] == right["sha256"],
            "dhashDistance": hamming(left["features"]["dhash"], right["features"]["dhash"]),
            "baselineDrift": abs(float(frames[index].get("baseline", 0)) - float(frames[index - 1].get("baseline", 0))),
            "groundContactDrift": abs(float(frames[index].get("groundContact", 0)) - float(frames[index - 1].get("groundContact", 0))),
            "activeRatioChange": abs(float(right["features"]["activeRatio"]) - float(left["features"]["activeRatio"])),
        }
        adjacent.append(record)
        if record["duplicateBytes"]:
            blockers.append(f"adjacent-duplicate-frame:{index - 1}-{index}")
        if record["dhashDistance"] > int(global_rules["maximumIdentityDhashDistance"]):
            blockers.append(f"identity-or-camera-drift:{index - 1}-{index}")
        if record["baselineDrift"] > float(global_rules["maximumBaselineDriftNormalized"]):
            blockers.append(f"baseline-drift:{index - 1}-{index}")
        if record["groundContactDrift"] > float(global_rules["maximumPlantedFootDriftNormalized"]):
            blockers.append(f"planted-foot-drift:{index - 1}-{index}")
        if record["activeRatioChange"] > float(global_rules["maximumActiveBoundsAreaChangePerFrame"]):
            blockers.append(f"active-bounds-pop:{index - 1}-{index}")
    seam = None
    if bool(profile["loop"]):
        seam_distance = hamming(identities[-1]["features"]["dhash"], identities[0]["features"]["dhash"])
        similarity = 1.0 - seam_distance / 64.0
        seam = {"dhashDistance": seam_distance, "similarity": similarity}
        if similarity < float(global_rules["minimumLoopSeamDhashSimilarity"]):
            blockers.append("loop-seam-pop")
    elif not present_tags.intersection({"final-hold", "hold", "settle", "aftermath"}):
        warnings.append("terminal-hold-tag-review-required")
    sheet = contact_sheet(decoded)
    sheet_sha, sheet_size = atomic_image(args.contact_sheet.resolve(), sheet, args.replace)
    report = {
        "schema": ANIMATION_SCHEMA,
        "contract": evaluation["contract"],
        "status": "passed" if not blockers else "blocked",
        "sourceFamily": family, "clipId": clip_id, "variant": manifest.get("variant"),
        "semanticIdentity": manifest.get("semanticIdentity"), "direction": manifest.get("direction"),
        "loop": bool(manifest.get("loop")), "spriteFramesDestination": manifest.get("spriteFramesDestination"),
        "manifestPath": str(args.manifest.resolve()), "manifestFileSha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "artDirectionContractPath": args.art_contract, "artDirectionContractSha256": hashlib.sha256(game_bytes).hexdigest(),
        "evaluationContractSha256": hashlib.sha256(evaluation_bytes).hexdigest(), "profile": profile,
        "frameCount": len(frames), "frames": identities, "adjacentContinuity": adjacent, "loopSeam": seam,
        "contactSheet": {"path": str(args.contact_sheet.resolve()), "sha256": sheet_sha, "sizeBytes": sheet_size},
        "blockers": sorted(set(blockers)), "warnings": sorted(set(warnings)),
        "semanticReviewRequired": {"identityAnchors": game["animation"]["identityAnchors"], "poseLanguage": True, "historicalEquipmentAndCostume": True, "cameraAndLightDirection": True},
        "creativeApproval": False, "historicalApproval": False, "runtimeApproval": False,
        "publicationAuthority": False, "authority": evaluation["authority"],
    }
    return report_hash(report, "evaluationSha256")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--game-root", type=Path, required=True)
    parser.add_argument("--frame-root", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--art-contract", default="config/art/brass_art_direction_animation.v1.json")
    parser.add_argument("--contact-sheet", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()
    try:
        report = evaluate(args)
        atomic_json(args.output.resolve(), report, args.replace)
    except (OSError, UnicodeError, ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        print(f"Brass animation sequence evaluation failed: {error}", file=sys.stderr)
        return 2
    print(json.dumps({"status": report["status"], "evaluationSha256": report["evaluationSha256"], "blockers": report["blockers"]}, sort_keys=True))
    return 0 if report["status"] == "passed" else 3


if __name__ == "__main__":
    raise SystemExit(main())
