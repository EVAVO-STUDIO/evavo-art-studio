#!/usr/bin/env python3
"""Adversarial, deterministic checks for the universal pixel-font compiler."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import py_compile
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
CLI_PATH = TOOLS / "pixel_font_universal.py"
MODULE_PATHS = [
    TOOLS / "pixel_font_universal_engine.py",
    *(sorted((TOOLS / "pixel_font_universal").glob("*.py"))),
]
EXAMPLES = ROOT / "examples" / "pixel-font-universal"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
import pixel_font_universal as module


def need(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load(name: str) -> dict:
    return json.loads((EXAMPLES / name).read_text("utf-8"))


def expanded_binary_face(count: int = 72) -> dict:
    source = load("binary-proportional.face.json")
    templates = [glyph for glyph in source["glyphs"] if glyph["codepoint"] not in {32, 65533}]
    glyphs = [next(glyph for glyph in source["glyphs"] if glyph["codepoint"] == 32)]
    for index in range(count - 2):
        template = json.loads(json.dumps(templates[index % len(templates)]))
        template["codepoint"] = 0x100 + index
        template["xAdvance"] = 5 + index % 3
        glyphs.append(template)
    replacement = json.loads(json.dumps(next(glyph for glyph in source["glyphs"] if glyph["codepoint"] == 65533)))
    glyphs.append(replacement)
    source["faceId"] = "universal-example-stress"
    source["displayName"] = "Universal Example Stress"
    source["coverage"] = {"requiredCodepoints": [32, 0x100, 65533]}
    source["glyphs"] = glyphs
    source["kerning"] = [{"first": 0x100, "second": 0x101, "amount": -1}]
    return source


def style(profile_id: str, operations: list[dict], *, strategy: str = "maxrects", maximum_edge: int = 64, strikes: list[int] | None = None, ttf: bool = False, spacing: str = "preserve") -> dict:
    return {
        "schema": module.PROFILE_SCHEMA,
        "profileId": profile_id,
        "displayName": profile_id.replace("-", " ").title(),
        "version": "1.0.0",
        "description": "Universal compiler adversarial test profile.",
        "ink": "#ffffffff",
        "background": "#00000000",
        "padding": 1,
        "spacing": {
            "mode": spacing,
            "tracking": 0,
            "cellAdvance": 8,
            "wideAdvance": 16,
            "fixedCellWidth": 18,
            "fixedCellHeight": 18,
        },
        "operations": operations,
        "atlas": {
            "strategy": strategy,
            "maximumEdge": maximum_edge,
            "padding": 1,
            "powerOfTwo": True,
            "allowMultiPage": True,
            "columns": 4,
            "cellWidth": 18,
            "cellHeight": 18,
        },
        "output": {
            "bmfont": True,
            "atlasJson": True,
            "gridSheet": True,
            "bdf": True,
            "ttf": ttf,
            "godotResource": True,
            "includeNormalisedFace": True,
            "godotResourceBasePath": "assets/fonts",
            "ttfPixelUnits": 64,
        },
        "strikes": strikes or [1],
    }


catalog = module.style_catalog()
need(catalog["engineVersion"] == "3.0.0", "engine version drift")
need(set(catalog["pixelModes"]) >= {"binary", "indexed", "rgba", "layered", "component-composed"}, "pixel-mode catalogue incomplete")
need(set(catalog["atlasStrategies"]) == {"maxrects", "shelf", "fixed-grid"}, "atlas packer catalogue incomplete")
need(set(catalog["operations"]) == set(module.BUILTIN_OPERATIONS), "operation catalogue drift")
need(len(catalog["presets"]) >= 8, "preset catalogue is incomplete")
need(all(value is False for value in catalog["authority"].values()), "catalogue grants prohibited authority")

for path in sorted(EXAMPLES.glob("*.face.json")):
    face = module.normalise_face(json.loads(path.read_text("utf-8")), label=path.name)
    need(face["glyphs"], f"{path.name} has no glyphs")
for path in sorted(EXAMPLES.glob("*.profile.json")):
    module.normalise_profile(json.loads(path.read_text("utf-8")), label=path.name)

# Exercise every operation directly through the validated library boundary.
base = {(0, 0): (255, 255, 255, 255), (1, 0): (255, 255, 255, 255), (0, 1): (255, 255, 255, 255)}
context = module.OperationContext(65, {"baseline": 2, "lineHeight": 4}, 2)
operation_samples = {
    "recolour": {"op": "recolour", "colour": "#80c0ffff"},
    "palette-map": {"op": "palette-map", "mapping": {"#ffffffff": "#ff00ffff"}},
    "gradient": {"op": "gradient", "start": "#ffffffff", "end": "#ff0000ff", "axis": "vertical"},
    "outline": {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#000000ff"},
    "shadow": {"op": "shadow", "dx": 1, "dy": 1, "colour": "#000000aa"},
    "highlight": {"op": "highlight", "dx": -1, "dy": -1, "colour": "#ffff00ff"},
    "inline": {"op": "inline", "connectivity": 4, "colour": "#000000ff"},
    "dilate": {"op": "dilate", "radius": 1, "connectivity": 4},
    "erode": {"op": "erode", "radius": 1, "connectivity": 4},
    "shear": {"op": "shear", "numerator": 1, "denominator": 2, "anchor": "baseline"},
    "mirror": {"op": "mirror", "axis": "horizontal"},
    "rotate90": {"op": "rotate90", "turns": 1},
    "mask": {"op": "mask", "pattern": "bayer4", "phase": 9, "alpha": 96},
    "translate": {"op": "translate", "dx": 2, "dy": -1},
    "scale": {"op": "scale", "factor": 2},
}
for name, operation in operation_samples.items():
    result = module.apply_operations(base, [operation], context, None)
    need(isinstance(result, dict), f"operation {name} did not return a pixel map")

with tempfile.TemporaryDirectory(prefix="evavo-universal-pixel-font-") as temporary:
    temp = Path(temporary)
    builds: list[dict] = []

    # MaxRects, multi-page, multiple strikes, TTF, BDF and deterministic rebuild.
    stress_face = expanded_binary_face()
    stress_style = style(
        "stress-maxrects",
        [
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#1a0b12ff"},
            {"op": "shadow", "dx": 2, "dy": 2, "colour": "#5a1d88aa"},
            {"op": "highlight", "dx": -1, "dy": -1, "colour": "#ffe5a0ff"},
        ],
        strategy="maxrects",
        maximum_edge=64,
        strikes=[1, 2],
        ttf=True,
    )
    first = temp / "first"
    second = temp / "second"
    result = module.compile_face(stress_face, stress_style, first)
    need(result["status"] == "passed", "stress build failed")
    need(any(item["atlas"]["pageCount"] > 1 for item in result["strikes"]), "multi-page path was not exercised")
    validation = module.validate_build(first)
    need(validation["status"] == "passed", "stress build validation failed")
    need(all(item["glyphCount"] == 72 for item in validation["strikes"]), "glyph counts drifted")
    need(all(item["kerningPairCount"] == 1 for item in validation["strikes"]), "kerning counts drifted")
    need(all(item["ttf"]["embeddingFsType"] == 0 for item in validation["strikes"]), "TTF embedding policy drifted")
    module.compile_face(stress_face, stress_style, second)
    comparison = module.compare_builds(first, second)
    need(comparison["status"] == "passed", "clean rebuilds were not byte-identical")
    builds.append({"profile": "stress-maxrects", "validation": validation, "comparison": comparison})

    # Existing v2 masters remain valid, including legacy mixed-case face IDs
    # and empty soft-hyphen transport glyphs.
    legacy_v2 = load("binary-proportional.face.json")
    legacy_v2["schema"] = module.V2_FACE_SCHEMA
    legacy_v2["faceId"] = "Legacy_UI"
    legacy_v2.pop("kind", None)
    legacy_v2.pop("styleTags", None)
    legacy_v2.pop("designIntent", None)
    legacy_v2.pop("pixelMode", None)
    legacy_v2.pop("palette", None)
    legacy_v2["glyphs"].append(
        {
            "codepoint": 0x00AD,
            "width": 1,
            "height": 1,
            "xOffset": 0,
            "yOffset": 0,
            "xAdvance": 0,
            "bitmap": ["."],
        }
    )
    legacy_normalised = module.normalise_face(legacy_v2, label="legacy v2 face")
    legacy_output = temp / "legacy-v2"
    legacy_result = module.compile_face(
        legacy_v2,
        style("legacy-v2-source-clean", [], maximum_edge=64),
        legacy_output,
    )
    legacy_validation = module.validate_build(legacy_output)
    need(legacy_normalised["sourceSchema"] == module.V2_FACE_SCHEMA, "v2 source schema was not retained")
    need(legacy_result["faceId"] == "Legacy_UI", "mixed-case v2 face ID was rewritten")
    need(legacy_validation["status"] == "passed", "v2 compatibility build failed")
    builds.append({"profile": "legacy-v2-source-clean", "validation": legacy_validation})

    # Shelf packing with indexed colour and colour-preserving runtime atlases.
    indexed = load("indexed-arcade.face.json")
    indexed_style = load("colour-rune.profile.json")
    indexed_style["atlas"]["strategy"] = "shelf"
    indexed_output = temp / "indexed"
    indexed_result = module.compile_face(indexed, indexed_style, indexed_output)
    indexed_validation = module.validate_build(indexed_output)
    need(indexed_result["pixelMode"] == "indexed", "indexed source mode was not retained")
    builds.append({"profile": "indexed-shelf", "validation": indexed_validation})

    # Fixed grid, direct RGBA, layers, anchors, components and duospace metrics.
    rgba_output = temp / "rgba"
    rgba_profile = load("duospace-cjk-ready.profile.json")
    rgba_profile["profileId"] = "duospace-cjk-ready-ttf"
    rgba_profile["output"]["ttf"] = True
    rgba_result = module.compile_face(load("rgba-layered-components.face.json"), rgba_profile, rgba_output)
    rgba_validation = module.validate_build(rgba_output)
    need(rgba_result["pixelMode"] == "rgba", "RGBA source mode was not retained")
    need(all(item["atlas"]["strategy"] == "fixed-grid" for item in rgba_result["strikes"]), "fixed-grid packer was not used")
    need(all(item["ttf"]["status"] == "passed" for item in rgba_validation["strikes"]), "component/combining-mark TTF projection failed")
    bmfont = next((rgba_output / "runtime").glob("*-1x.fnt")).read_text("utf-8")
    combining_line = next((line for line in bmfont.splitlines() if line.startswith("char id=769 ")), "")
    need("xadvance=0" in combining_line, "zero-advance combining mark was not retained in BMFont")
    builds.append({"profile": "rgba-fixed-grid-ttf", "validation": rgba_validation})

    # A reviewed custom library operation is supported, but not exposed by CLI/MCP.
    def invert(pixels, _operation, _context):
        return {
            point: (255 - colour[0], 255 - colour[1], 255 - colour[2], colour[3])
            for point, colour in pixels.items()
        }

    custom_output = temp / "custom"
    module.compile_face(
        load("binary-proportional.face.json"),
        style("custom-registry", [{"op": "invert-reviewed"}], maximum_edge=64),
        custom_output,
        operation_registry={"invert-reviewed": invert},
    )
    module.validate_build(custom_output)

    # Tamper rejection.
    corrupted = temp / "corrupted"
    shutil.copytree(first, corrupted)
    page = next((corrupted / "runtime").glob("*.png"))
    data = bytearray(page.read_bytes())
    data[-1] ^= 1
    page.write_bytes(data)
    try:
        module.validate_build(corrupted)
    except module.PixelFontUniversalError:
        pass
    else:
        raise AssertionError("tampered output was accepted")

    # Create-only and transactional cleanup.
    try:
        module.compile_face(stress_face, stress_style, first)
    except module.PixelFontUniversalError:
        pass
    else:
        raise AssertionError("an existing build was replaced")
    denied_target = temp / "denied"
    try:
        module.compile_face(
            stress_face,
            style("unknown-operation", [{"op": "shell"}], maximum_edge=64),
            denied_target,
        )
    except module.PixelFontUniversalError as exc:
        need("not registered" in str(exc), "unknown operation failed for the wrong reason")
        need(not denied_target.exists(), "failed transactional build left a published output root")
    else:
        raise AssertionError("unknown operation was accepted")

for module_path in [*MODULE_PATHS, CLI_PATH]:
    py_compile.compile(str(module_path), doraise=True)
source = "\n".join(path.read_text("utf-8") for path in MODULE_PATHS)
for prohibited in ("eval(", "exec(", "os.system", "shell=True", "subprocess"):
    need(prohibited not in source, f"engine contains prohibited execution surface: {prohibited}")

report = {
    "schema": "evavo.pixel-font-universal-check.v1",
    "engineVersion": module.ENGINE_VERSION,
    "operationCount": len(module.BUILTIN_OPERATIONS),
    "presetCount": len(module.BUILTIN_PRESETS),
    "pixelModes": catalog["pixelModes"],
    "spacingModes": catalog["spacingModes"],
    "atlasStrategies": catalog["atlasStrategies"],
    "exampleFaceCount": len(list(EXAMPLES.glob("*.face.json"))),
    "exampleProfileCount": len(list(EXAMPLES.glob("*.profile.json"))),
    "builds": builds,
    "negativeTests": [
        "tampered output",
        "existing output replacement",
        "unknown operation",
        "transactional partial-output cleanup",
    ],
    "status": "passed",
}
(ROOT / "universal-pixel-font-check-report.json").write_text(
    json.dumps(report, indent=2) + "\n",
    encoding="utf-8",
)
print("EVAVO_PIXEL_FONT_UNIVERSAL_CHECK_OK")
print(json.dumps({key: report[key] for key in ("engineVersion", "operationCount", "presetCount", "exampleFaceCount", "exampleProfileCount", "status")}, indent=2))
