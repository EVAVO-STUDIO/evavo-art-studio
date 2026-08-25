from __future__ import annotations

import argparse
import json
from pathlib import Path

ATLAS_SCHEMA = "evavo.art-studio.handwriting-atlas.v1"
SPEC_SCHEMA = "evavo.art-studio.handwriting-capture-spec.v1"
REPORT_SCHEMA = "evavo.art-studio.handwriting-capture-gap.v1"


def _load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def compare(spec_path: Path, atlas_path: Path) -> dict:
    spec = _load(spec_path)
    atlas = _load(atlas_path)
    if spec.get("schema") != SPEC_SCHEMA:
        raise ValueError("invalid handwriting capture spec schema")
    if atlas.get("schema") != ATLAS_SCHEMA:
        raise ValueError("invalid handwriting atlas schema")

    glyphs = atlas.get("glyphs") if isinstance(atlas.get("glyphs"), dict) else {}
    marks = atlas.get("wholeMarks") if isinstance(atlas.get("wholeMarks"), dict) else {}
    missing = []
    complete = []

    grouped: dict[tuple[str, str], dict] = {}
    for slot in spec.get("slots", []):
        if not isinstance(slot, dict):
            continue
        key = (str(slot.get("kind") or ""), str(slot.get("token") or ""))
        state = grouped.setdefault(key, {"required": 0, "slotIds": []})
        state["required"] += 1
        state["slotIds"].append(str(slot.get("id") or ""))

    for (kind, token), requirement in sorted(grouped.items()):
        if kind in {"signature", "name"}:
            actual = len(marks.get(kind, [])) if isinstance(marks.get(kind), list) else 0
        else:
            actual = len(glyphs.get(token, [])) if isinstance(glyphs.get(token), list) else 0
        item = {
            "kind": kind,
            "token": token,
            "requiredVariants": int(requirement["required"]),
            "actualVariants": actual,
            "missingVariants": max(0, int(requirement["required"]) - actual),
            "slotIds": requirement["slotIds"],
        }
        if item["missingVariants"]:
            missing.append(item)
        else:
            complete.append(item)

    return {
        "schema": REPORT_SCHEMA,
        "specProfileId": spec.get("profileId"),
        "atlasId": atlas.get("atlasId"),
        "completeRequirementCount": len(complete),
        "missingRequirementCount": len(missing),
        "missingVariantCount": sum(item["missingVariants"] for item in missing),
        "missing": missing,
        "complete": complete,
        "truthBoundary": {
            "fontFallbackUsed": False,
            "syntheticHandwritingGenerated": False,
            "signatureSynthesizedFromGlyphs": False,
            "privateAssetPathsReturned": False,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compare a desired handwriting capture spec with a genuine handwriting atlas")
    parser.add_argument("spec")
    parser.add_argument("atlas")
    parser.add_argument("--output")
    args = parser.parse_args(argv)
    try:
        report = compare(Path(args.spec), Path(args.atlas))
        if args.output:
            target = Path(args.output)
            if target.exists():
                raise ValueError(f"create-only output already exists: {target}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(report, sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
