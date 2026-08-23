#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "sprite_animation_preview.py"
_spec = importlib.util.spec_from_file_location("evavo_sprite_animation_preview_contract", SOURCE)
if _spec is None or _spec.loader is None:
    raise RuntimeError("EVAVO_PREVIEW_TEST_IMPORT")
preview = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(preview)


def sha256(file: Path) -> str:
    return hashlib.sha256(file.read_bytes()).hexdigest()


def write_plan(file: Path, frames: list[dict], *, fps: int = 10, scale: int = 2) -> str:
    document = {
        "schema": "evavo.sprite-animation-preview-plan.v1",
        "createOnlyOutput": True,
        "repositoryMutation": False,
        "fps": fps,
        "scale": scale,
        "background": "transparent",
        "frames": frames,
    }
    payload = (json.dumps(document, sort_keys=True, indent=2) + "\n").encode("utf-8")
    file.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def make_frame(file: Path, value: int) -> None:
    Image.new("RGBA", (4, 4), (value, 255 - value, value // 2, 255)).save(file, "PNG")


def expect_failure(fn, text: str, output: Path, parent: Path) -> None:
    try:
        fn()
    except ValueError as exc:
        if text not in str(exc):
            raise AssertionError(f"unexpected failure: {exc}") from exc
    else:
        raise AssertionError(f"expected failure containing {text!r}")
    if output.exists():
        raise AssertionError("failed preview left final output")
    leftovers = [item for item in parent.iterdir() if item.name.startswith(f".{output.name}.preview-")]
    if leftovers:
        raise AssertionError(f"failed preview left private staging: {leftovers}")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="evavo-preview-contract-") as temporary:
        workspace = Path(temporary).resolve()
        frame_a = workspace / "frame-a.png"
        frame_b = workspace / "frame-b.png"
        make_frame(frame_a, 64)
        make_frame(frame_b, 192)

        plan = workspace / "plan.json"
        plan_sha = write_plan(
            plan,
            [
                {"path": frame_a.name, "sha256": sha256(frame_a), "durationMs": 80},
                {"path": frame_b.name, "sha256": sha256(frame_b), "durationMs": 240},
            ],
        )
        output = workspace / "preview"
        receipt = preview.render_preview(
            workspace_root=str(workspace),
            plan_path=str(plan),
            plan_sha256=plan_sha,
            output_root=str(output),
        )
        if receipt["timingMode"] != "per-frame-or-fps-fallback":
            raise AssertionError("timing mode was not recorded")
        if receipt["defaultFrameDurationMs"] != 100:
            raise AssertionError("FPS fallback duration drifted")
        if [entry["durationMs"] for entry in receipt["frames"]] != [80, 240]:
            raise AssertionError("effective frame durations were not retained")
        if receipt["automaticApproval"] is not False or receipt["publication"] is not False:
            raise AssertionError("preview gained approval/publication authority")

        gif_path = output / "animation-preview.gif"
        strip_path = output / "frame-strip.png"
        receipt_path = output / "receipt.json"
        if receipt["gifSha256"] != sha256(gif_path) or receipt["stripSha256"] != sha256(strip_path):
            raise AssertionError("receipt artifact digests do not match output bytes")
        persisted = json.loads(receipt_path.read_text(encoding="utf-8"))
        if persisted != receipt:
            raise AssertionError("persisted receipt differs from returned receipt")

        with Image.open(gif_path) as animation:
            if getattr(animation, "n_frames", 1) != 2:
                raise AssertionError("GIF frame count drifted")
            durations = []
            for index in range(animation.n_frames):
                animation.seek(index)
                durations.append(int(animation.info.get("duration", -1)))
            if durations != [80, 240]:
                raise AssertionError(f"GIF durations were not actually applied: {durations}")
            if animation.size != (8, 8):
                raise AssertionError(f"GIF nearest-neighbour scale drifted: {animation.size}")
        with Image.open(strip_path) as strip:
            if strip.size != (16, 8):
                raise AssertionError(f"frame strip geometry drifted: {strip.size}")

        occupied = workspace / "occupied"
        occupied.mkdir()
        try:
            preview.render_preview(
                workspace_root=str(workspace),
                plan_path=str(plan),
                plan_sha256=plan_sha,
                output_root=str(occupied),
            )
        except ValueError as exc:
            if "create-only" not in str(exc):
                raise AssertionError(f"unexpected occupied-output failure: {exc}") from exc
        else:
            raise AssertionError("pre-existing output was not rejected")

        wrong_plan = workspace / "wrong-plan.json"
        wrong_sha = write_plan(
            wrong_plan,
            [
                {"path": frame_a.name, "sha256": "0" * 64, "durationMs": 80},
                {"path": frame_b.name, "sha256": sha256(frame_b), "durationMs": 240},
            ],
        )
        rejected = workspace / "rejected"
        expect_failure(
            lambda: preview.render_preview(
                workspace_root=str(workspace),
                plan_path=str(wrong_plan),
                plan_sha256=wrong_sha,
                output_root=str(rejected),
            ),
            "frame 0 hash mismatch",
            rejected,
            workspace,
        )

        bad_duration_plan = workspace / "bad-duration.json"
        bad_duration_sha = write_plan(
            bad_duration_plan,
            [
                {"path": frame_a.name, "sha256": sha256(frame_a), "durationMs": "80"},
                {"path": frame_b.name, "sha256": sha256(frame_b), "durationMs": 240},
            ],
        )
        bad_duration_output = workspace / "bad-duration-output"
        expect_failure(
            lambda: preview.render_preview(
                workspace_root=str(workspace),
                plan_path=str(bad_duration_plan),
                plan_sha256=bad_duration_sha,
                output_root=str(bad_duration_output),
            ),
            "durationMs invalid",
            bad_duration_output,
            workspace,
        )

        link = workspace / "linked-frame.png"
        try:
            os.symlink(frame_a, link)
        except (OSError, NotImplementedError):
            link = None
        if link is not None:
            linked_plan = workspace / "linked-plan.json"
            linked_sha = write_plan(
                linked_plan,
                [
                    {"path": link.name, "sha256": sha256(frame_a), "durationMs": 80},
                    {"path": frame_b.name, "sha256": sha256(frame_b), "durationMs": 240},
                ],
            )
            linked_output = workspace / "linked-output"
            expect_failure(
                lambda: preview.render_preview(
                    workspace_root=str(workspace),
                    plan_path=str(linked_plan),
                    plan_sha256=linked_sha,
                    output_root=str(linked_output),
                ),
                "ordinary non-link file",
                linked_output,
                workspace,
            )

    print(json.dumps({
        "ok": True,
        "contract": "evavo-sprite-animation-preview-timing-v2",
        "perFrameDurationsApplied": True,
        "exactFrameShaRequired": True,
        "createOnlyPromotion": True,
        "failureRollback": True,
        "sourceSymlinksRejected": True,
        "automaticApproval": False,
        "publicationAuthority": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
