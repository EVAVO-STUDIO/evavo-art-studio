from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

ATLAS_SCHEMA = "evavo.art-studio.handwriting-atlas.v1"
SINGLE_SCHEMA = "evavo.art-studio.handwriting-render.v1"
MULTILINE_SCHEMA = "evavo.art-studio.handwriting-multiline-render.v1"
PARAGRAPH_SCHEMA = "evavo.art-studio.handwriting-paragraph-render.v1"
QA_SCHEMA = "evavo.art-studio.handwriting-realism-qa.v1"
BALANCED_MODE = "deterministic-shuffled-genuine-variant-bag-v1"


def _load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = _mean(values)
    return math.sqrt(sum((value - mean) ** 2 for value in values) / len(values))


def _atlas_variant_counts(atlas: dict, style: str | None) -> dict[str, int]:
    glyphs = atlas.get("glyphs")
    if not isinstance(glyphs, dict):
        raise ValueError("atlas has no glyphs")
    result = {}
    for token, entries in glyphs.items():
        if not isinstance(token, str) or not isinstance(entries, list):
            continue
        count = sum(
            1
            for item in entries
            if isinstance(item, dict)
            and (not style or str(item.get("style") or "").casefold() == style.casefold())
        )
        if count:
            result[token] = count
    return result


def _single_metrics(receipt: dict, atlas_counts: dict[str, int]) -> dict:
    tokens = receipt.get("tokens")
    if not isinstance(tokens, list):
        raise ValueError("single-line receipt lacks tokens")
    by_token: dict[str, list[int]] = defaultdict(list)
    rotations = []
    scales = []
    cycles_by_token: dict[str, list[int]] = defaultdict(list)
    for item in tokens:
        if not isinstance(item, dict):
            continue
        token = item.get("text")
        variant = item.get("variant")
        if isinstance(token, str) and isinstance(variant, int):
            by_token[token].append(variant)
            cycle = item.get("variantCycle")
            if isinstance(cycle, int) and not isinstance(cycle, bool):
                cycles_by_token[token].append(cycle)
        rotation = item.get("rotationDegrees")
        scale = item.get("scale")
        if isinstance(rotation, (int, float)) and not isinstance(rotation, bool):
            rotations.append(float(rotation))
        if isinstance(scale, (int, float)) and not isinstance(scale, bool):
            scales.append(float(scale))

    repeated = {token: values for token, values in by_token.items() if len(values) >= 2}
    repeat_metrics = []
    immediate_repeat_count = 0
    under_varied = []
    bag_cycle_failures = []
    for token, variants in sorted(repeated.items()):
        distinct = len(set(variants))
        available = atlas_counts.get(token, 0)
        immediate = sum(1 for left, right in zip(variants, variants[1:]) if left == right)
        immediate_repeat_count += immediate
        if len(variants) >= 3 and available >= 3 and distinct < min(3, available):
            under_varied.append(token)
        cycles = cycles_by_token.get(token, [])
        if cycles and available >= 2:
            grouped: dict[int, list[int]] = defaultdict(list)
            for variant, cycle in zip(variants, cycles):
                grouped[cycle].append(variant)
            for cycle, used in grouped.items():
                if len(used) >= available and len(set(used[:available])) < available:
                    bag_cycle_failures.append({"token": token, "cycle": cycle})
        repeat_metrics.append({
            "token": token,
            "occurrences": len(variants),
            "distinctVariantsUsed": distinct,
            "availableGenuineVariants": available,
            "immediateSameVariantRepeats": immediate,
        })

    low_bank = sorted(token for token in by_token if atlas_counts.get(token, 0) < 2)
    return {
        "tokenCount": len(tokens),
        "uniqueTokenCount": len(by_token),
        "repeatedTokens": repeat_metrics,
        "immediateSameVariantRepeatCount": immediate_repeat_count,
        "underVariedRepeatedTokens": sorted(set(under_varied)),
        "tokensWithOnlyOneGenuineVariant": low_bank,
        "balancedBagCycleFailures": bag_cycle_failures,
        "rotationStdDegrees": round(_std(rotations), 5),
        "scaleStd": round(_std(scales), 6),
    }


def _multiline_metrics(receipt: dict) -> dict:
    lines = receipt.get("lines")
    if not isinstance(lines, list):
        raise ValueError("multiline receipt lacks lines")
    ink_lines = [item for item in lines if isinstance(item, dict) and item.get("blank") is False]
    starts = [float(item.get("xPx", 0.0)) for item in ink_lines if isinstance(item.get("xPx", 0.0), (int, float))]
    scales = [float(item.get("lineScale", 1.0)) for item in ink_lines if isinstance(item.get("lineScale", 1.0), (int, float))]
    effective_heights = [
        float(item["effectiveTargetInkHeightPx"])
        for item in ink_lines
        if isinstance(item.get("effectiveTargetInkHeightPx"), (int, float))
    ]
    return {
        "inkLineCount": len(ink_lines),
        "blankLineCount": sum(1 for item in lines if isinstance(item, dict) and item.get("blank") is True),
        "lineStartStdPx": round(_std(starts), 4),
        "lineScaleStd": round(_std(scales), 6),
        "effectiveInkHeightStdPx": round(_std(effective_heights), 4),
        "allLineScalesWithinBound": all(0.88 <= value <= 1.12 for value in scales),
    }


def _balanced_variant_selection(receipt: dict) -> bool:
    selection = receipt.get("variantSelection")
    return isinstance(selection, dict) and selection.get("mode") == BALANCED_MODE


def evaluate(atlas_path: Path, receipt_path: Path) -> dict:
    atlas = _load(atlas_path)
    receipt = _load(receipt_path)
    if atlas.get("schema") != ATLAS_SCHEMA:
        raise ValueError("invalid handwriting atlas schema")
    schema = receipt.get("schema")
    if schema not in {SINGLE_SCHEMA, MULTILINE_SCHEMA, PARAGRAPH_SCHEMA}:
        raise ValueError("unsupported handwriting render receipt schema")
    truth = receipt.get("truthBoundary")
    if not isinstance(truth, dict):
        raise ValueError("render receipt lacks truthBoundary")
    if truth.get("fontFallbackUsed") is not False or truth.get("syntheticHandwritingGenerated") is not False or truth.get("strokeDeformation") is not False:
        raise ValueError("render receipt truth boundary is incompatible with realism QA")

    style = receipt.get("style") if isinstance(receipt.get("style"), str) else None
    atlas_counts = _atlas_variant_counts(atlas, style)
    warnings: list[dict] = []
    metrics: dict = {}
    balanced = _balanced_variant_selection(receipt)
    metrics["balancedVariantSelection"] = {
        "mode": receipt.get("variantSelection", {}).get("mode") if isinstance(receipt.get("variantSelection"), dict) else None,
        "preferredProductionMode": BALANCED_MODE,
        "used": balanced,
    }

    if schema == SINGLE_SCHEMA:
        single = _single_metrics(receipt, atlas_counts)
        metrics["singleLine"] = single
        repeated_with_choice = any(
            item["occurrences"] >= 2 and item["availableGenuineVariants"] >= 2
            for item in single["repeatedTokens"]
        )
        if repeated_with_choice and not balanced:
            warnings.append({"code": "legacy-variant-selection", "severity": "medium", "detail": "Repeated text did not prove use of the preferred balanced genuine-variant bag."})
        if single["immediateSameVariantRepeatCount"]:
            warnings.append({"code": "immediate-variant-repeat", "severity": "high", "detail": "A repeated token reused the same captured variant immediately."})
        if single["underVariedRepeatedTokens"]:
            warnings.append({"code": "under-varied-repeat", "severity": "medium", "tokens": single["underVariedRepeatedTokens"]})
        if single["balancedBagCycleFailures"]:
            warnings.append({"code": "balanced-bag-cycle-failure", "severity": "high", "cycles": single["balancedBagCycleFailures"]})
        if single["tokensWithOnlyOneGenuineVariant"]:
            warnings.append({"code": "single-variant-bank", "severity": "medium", "tokens": single["tokensWithOnlyOneGenuineVariant"]})
        if single["tokenCount"] >= 8 and single["rotationStdDegrees"] < 0.05 and single["scaleStd"] < 0.001:
            warnings.append({"code": "over-regular-transforms", "severity": "low", "detail": "Long line shows very little bounded transform diversity."})
    else:
        multi = _multiline_metrics(receipt)
        metrics["multiline"] = multi
        if multi["inkLineCount"] >= 1 and not balanced:
            warnings.append({"code": "legacy-variant-selection", "severity": "medium", "detail": "Multiline render did not prove use of balanced genuine-variant bags."})
        if not multi["allLineScalesWithinBound"]:
            warnings.append({"code": "line-scale-out-of-bound", "severity": "high"})
        if multi["inkLineCount"] >= 3 and multi["lineStartStdPx"] < 0.35:
            warnings.append({"code": "mechanical-line-starts", "severity": "medium", "detail": "Three or more ink lines begin at nearly identical horizontal positions."})
        if multi["effectiveInkHeightStdPx"] > 2.5:
            warnings.append({"code": "line-size-inconsistency", "severity": "medium", "detail": "Effective handwriting size varies noticeably between lines."})
        if schema == PARAGRAPH_SCHEMA:
            wrap = receipt.get("wrapEvidence")
            if not isinstance(wrap, list):
                warnings.append({"code": "missing-wrap-evidence", "severity": "high"})
            metrics["paragraph"] = {
                "maxWidthPx": receipt.get("maxWidthPx"),
                "wrapLineCount": len(wrap) if isinstance(wrap, list) else 0,
                "widthMeasurementModel": receipt.get("widthMeasurementModel"),
            }

    severity_weight = {"low": 7, "medium": 16, "high": 30}
    penalty = sum(severity_weight.get(str(item.get("severity")), 10) for item in warnings)
    score = max(0, 100 - penalty)
    grade = "strong" if score >= 90 else "review" if score >= 70 else "weak"
    return {
        "schema": QA_SCHEMA,
        "renderSchema": schema,
        "score": score,
        "grade": grade,
        "metrics": metrics,
        "warnings": warnings,
        "recommendations": [
            "Use the preferred realistic renderer so repeated tokens consume each genuine variant before bag refill.",
            "Prefer at least three genuine variants for frequently repeated letters and punctuation.",
            "Use whole genuine fragments for common captured fragments where available.",
            "Review hostile-background proof at final placement scale, not only enlarged on screen.",
        ] if warnings else [],
        "truthBoundary": {
            "readOnlyDiagnostic": True,
            "handwritingModified": False,
            "fontFallbackIntroduced": False,
            "syntheticHandwritingGenerated": False,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Assess handwriting render receipts for mechanical-looking warning signs without modifying handwriting")
    parser.add_argument("atlas")
    parser.add_argument("receipt")
    parser.add_argument("--output")
    args = parser.parse_args(argv)
    try:
        result = evaluate(Path(args.atlas), Path(args.receipt))
        if args.output:
            output = Path(args.output)
            if output.exists():
                raise ValueError(f"create-only QA output already exists: {output}")
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
