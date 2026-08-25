from __future__ import annotations

import argparse
import json
from pathlib import Path

SCHEMA = "evavo.art-studio.handwriting-capture-spec.v1"

DEFAULT_GROUPS = [
    {"id": "lowercase", "tokens": list("abcdefghijklmnopqrstuvwxyz"), "variants": 2, "kind": "glyph", "style": "natural-lowercase"},
    {"id": "digits", "tokens": list("0123456789"), "variants": 3, "kind": "glyph", "style": "natural-numeric"},
    {"id": "punctuation", "tokens": ["/", ".", ",", "-", "@", "&", "(", ")", "+", "#"], "variants": 2, "kind": "glyph", "style": "natural-symbol"},
    {"id": "fragments", "tokens": [".com", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], "variants": 2, "kind": "fragment", "style": "natural-fragment"},
    {"id": "name", "tokens": ["FULL_NAME"], "variants": 4, "kind": "name", "style": "natural"},
    {"id": "signature", "tokens": ["SIGNATURE"], "variants": 4, "kind": "signature", "style": "natural"},
]


def build_spec(*, profile_id: str, include_uppercase: bool = False) -> dict:
    groups = [dict(group) for group in DEFAULT_GROUPS]
    if include_uppercase:
        groups.insert(0, {"id": "uppercase", "tokens": list("ABCDEFGHIJKLMNOPQRSTUVWXYZ"), "variants": 2, "kind": "glyph", "style": "natural-uppercase"})
    slots = []
    order = 0
    for group in groups:
        for token in group["tokens"]:
            for variant in range(1, int(group["variants"]) + 1):
                order += 1
                safe = token.replace("/", "slash").replace(".", "dot").replace("@", "at").replace("&", "and").replace("(", "lparen").replace(")", "rparen").replace("+", "plus").replace("#", "hash").replace(" ", "-")
                slots.append({
                    "id": f"{group['id']}-{safe}-v{variant}",
                    "order": order,
                    "group": group["id"],
                    "token": token,
                    "variant": variant,
                    "kind": group["kind"],
                    "style": group["style"],
                    "review": {"cropRequired": True, "keepRegionRequiredWhenNeighboursPresent": True, "hostileBackgroundProofRequired": True},
                })
    return {
        "schema": SCHEMA,
        "profileId": profile_id,
        "instructions": {
            "pen": "Use the same normal pen and writing pressure you would naturally use on forms.",
            "paper": "Use plain unruled paper with generous spacing between samples.",
            "capture": "Photograph the full sheet square-on with all four paper edges visible where practical and avoid flash hotspots.",
            "authenticity": "Write every requested sample naturally. Do not trace or copy a previous sample stroke-for-stroke.",
            "privacy": "Treat photographed sheets and all transparent derivatives as private personal-mark assets; do not commit them to Git.",
        },
        "groups": groups,
        "slots": slots,
        "acceptance": {
            "minimumVariants": {group["id"]: int(group["variants"]) for group in groups},
            "paperHaloAllowed": False,
            "neighbourInkAllowed": False,
            "clippedInkAllowed": False,
            "fontFallbackAllowed": False,
            "syntheticStrokeGenerationAllowed": False,
            "signatureMustRemainWholeCapture": True,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create a deterministic handwriting capture worksheet specification")
    parser.add_argument("output")
    parser.add_argument("--profile-id", required=True)
    parser.add_argument("--include-uppercase", action="store_true")
    args = parser.parse_args(argv)
    output = Path(args.output)
    if output.exists():
        raise SystemExit("create-only output already exists")
    value = build_spec(profile_id=args.profile_id, include_uppercase=args.include_uppercase)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "schema": SCHEMA, "slotCount": len(value["slots"]), "privateAssetPathsReturned": False}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
