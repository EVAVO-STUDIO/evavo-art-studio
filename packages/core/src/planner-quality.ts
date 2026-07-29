import type {
  ArtBrief,
  AssetRequest,
  QualityGateId,
  QualityGateSpec,
  SpriteContinuityBlueprint,
} from "@evavo/art-contracts";

export function gate(
  id: QualityGateId,
  severity: QualityGateSpec["severity"],
  description: string,
  evidence: readonly string[],
  threshold?: number,
): QualityGateSpec {
  return threshold === undefined
    ? { id, severity, description, evidence }
    : { id, severity, description, evidence, threshold };
}

export function qualityGatesFor(
  asset: AssetRequest,
  brief: ArtBrief,
  blueprint?: SpriteContinuityBlueprint,
): readonly QualityGateSpec[] {
  const gates: QualityGateSpec[] = [
    gate("dimensions", "blocking", "Exact pixel dimensions must match the work order.", [
      "decoded-width",
      "decoded-height",
    ]),
    gate("file-format", "blocking", "The decoded format must match the declared output profile.", [
      "mime-type",
      "decoder-format",
    ]),
    gate("colour-profile", "blocking", "Colour space and embedded profile must match the target profile.", [
      "icc-profile",
      "colour-space",
    ]),
    gate(
      "palette",
      "blocking",
      "Palette membership, value grouping and indexed-colour limits must match the approved family profile.",
      ["palette-table", "out-of-palette-report", "value-histogram"],
      0.99,
    ),
    gate(
      "style-consistency",
      "blocking",
      "The asset must remain inside the approved art-direction envelope.",
      ["reference-comparison", "palette-distance", "silhouette-report"],
      brief.autonomy.autoApproveThreshold,
    ),
    gate("composition", "blocking", "Camera, staging, crop and silhouette rules must be satisfied.", [
      "composition-report",
    ]),
    gate(
      "artifact-scan",
      "blocking",
      "Visible generation, resampling, tiling, anatomy, text and edge artifacts must be absent.",
      ["artifact-report"],
      0.98,
    ),
    gate(
      "compression-delta",
      "blocking",
      "Runtime compression must remain inside the approved perceptual delta from the master.",
      ["master-hash", "runtime-hash", "perceptual-delta"],
      0.99,
    ),
    gate(
      "provenance",
      "blocking",
      "Every deliverable must retain source, tool, provider, prompt, seed and decision provenance.",
      ["provenance-json", "sha256-manifest"],
    ),
  ];

  if (asset.transparency !== "opaque") {
    gates.push(
      gate(
        "alpha-channel",
        "blocking",
        "The file must contain a real alpha channel with expected transparent coverage.",
        ["alpha-channel", "alpha-histogram"],
      ),
      gate(
        "fake-transparency",
        "blocking",
        "Checkerboards, flat matte colours and baked transparency grids must be rejected.",
        ["periodicity-scan", "matte-cluster-report"],
      ),
      gate(
        "edge-halo",
        "blocking",
        "Edges must remain clean against black, white, grey, green and magenta test mattes.",
        ["matte-contact-sheet", "edge-colour-distance"],
        0.98,
      ),
      gate(
        "transparent-pixel-colour",
        "blocking",
        "RGB values under transparent pixels must be decontaminated for filtered rendering.",
        ["transparent-rgb-report"],
      ),
    );
  }

  if (blueprint) {
    gates.push(
      gate(
        "frame-canvas",
        "blocking",
        "Every source frame and registered layer must share the locked canvas and source size.",
        ["frame-dimension-table", "source-size-table"],
      ),
      gate(
        "frame-anchor",
        "blocking",
        "Pivots, baseline, ground contact and centre of action must remain stable unless explicitly animated.",
        ["anchor-drift-report", "baseline-overlay", "pivot-table"],
        0.99,
      ),
      gate(
        "frame-crop",
        "blocking",
        "No limb, weapon, shadow, effect trail or required padding may cross the safe frame bounds.",
        ["safe-bounds-overlay", "crop-report"],
        1,
      ),
      gate(
        "frame-order",
        "blocking",
        "Direction order, frame indices, tags and manifest order must agree exactly.",
        ["frame-order-table", "tag-range-report"],
      ),
      gate(
        "frame-duration",
        "blocking",
        "Aseprite millisecond durations and Godot relative duration units must reproduce the approved timing.",
        ["frame-duration-table", "godot-duration-table"],
      ),
      gate(
        "frame-duplicates",
        "blocking",
        "Accidental duplicate, missing or substituted frames must be absent.",
        ["frame-hash-table", "sequence-gap-report"],
      ),
      gate(
        "identity-consistency",
        "blocking",
        "Face, costume, body identity and defining marks must match the canonical identity master.",
        ["identity-embedding-distance", "landmark-report", "canonical-overlay"],
        brief.autonomy.autoApproveThreshold,
      ),
      gate(
        "proportion-consistency",
        "blocking",
        "Head, torso, limb and equipment proportions must remain inside the approved tolerance.",
        ["proportion-table", "skeleton-overlay"],
        0.98,
      ),
      gate(
        "silhouette-consistency",
        "blocking",
        "Silhouette language may animate but may not redesign itself between neighbouring frames.",
        ["silhouette-distance", "neighbour-overlay"],
        0.98,
      ),
      gate(
        "direction-consistency",
        "blocking",
        "All direction masters must describe the same identity, costume and material construction.",
        ["direction-contact-sheet", "cross-direction-identity-report"],
        0.98,
      ),
      gate(
        "equipment-consistency",
        "blocking",
        "Declared equipment, handedness, scale and attachment points must remain stable.",
        ["equipment-detection-table", "handedness-report", "attachment-overlay"],
        0.99,
      ),
      gate(
        "source-composite-parity",
        "blocking",
        "Recompositing registered source layers must reproduce the approved colour frame exactly.",
        ["composite-diff", "layer-hash-manifest"],
        1,
      ),
      gate(
        "editable-source",
        "blocking",
        "The editable source must retain layers, cels, tags, frame durations, slices and pivots declared by the blueprint.",
        ["source-document-report", "layer-cel-matrix", "tag-slice-report"],
      ),
    );

    const independentLayers = blueprint.layers.filter((layer) =>
      ["layer-frames", "engine-sidecar"].includes(layer.exportPolicy),
    );
    if (independentLayers.length > 0) {
      gates.push(
        gate(
          "layer-registration",
          "blocking",
          "Independent layers must retain exact canvas registration, pivot and parent alignment.",
          ["layer-registration-table", "registration-overlay"],
          1,
        ),
        gate(
          "layer-occlusion",
          "blocking",
          "Per-frame front/behind relationships must agree with the declared z-order and occlusion plan.",
          ["occlusion-table", "occlusion-contact-sheet"],
          1,
        ),
      );
    }
    if (asset.animation?.loop) {
      gates.push(
        gate(
          "loop-closure",
          "blocking",
          "Loop start and end motion must close without a visible hitch or identity jump.",
          ["loop-delta", "motion-curve", "endpoint-overlay"],
          0.98,
        ),
      );
    }
  } else if (asset.animation || ["animation", "sprite-sheet", "particle", "cinematic"].includes(asset.kind)) {
    gates.push(
      gate("frame-canvas", "blocking", "Every frame must share the declared canvas dimensions.", [
        "frame-dimension-table",
      ]),
      gate(
        "frame-anchor",
        "blocking",
        "Pivots, feet, baselines and centre of action must remain stable unless intentionally animated.",
        ["anchor-drift-report"],
        0.98,
      ),
      gate("frame-duplicates", "blocking", "Accidental duplicate or missing frames must be absent.", [
        "frame-hash-table",
      ]),
    );
    if (asset.animation?.loop) {
      gates.push(
        gate(
          "loop-closure",
          "blocking",
          "Loop start and end motion must close without a visible hitch.",
          ["loop-delta", "motion-curve"],
          0.98,
        ),
      );
    }
  }

  if (["sprite-sheet", "tileset", "particle"].includes(asset.kind)) {
    gates.push(
      gate(
        "atlas-padding",
        "blocking",
        "Packed regions must respect target padding, trim and rotation policy.",
        ["atlas-layout", "padding-report"],
      ),
      gate(
        "atlas-bleed",
        "blocking",
        "Extruded edge pixels must prevent filtered sampling bleed.",
        ["atlas-edge-scan"],
      ),
      gate(
        "manifest-integrity",
        "blocking",
        "Every named region, source size, pivot, duration and frame must resolve to a valid atlas rectangle.",
        ["manifest-validation"],
      ),
    );
  }

  if (asset.kind === "tileset") {
    gates.push(
      gate(
        "tile-seams",
        "blocking",
        "Required tile neighbours must join without visual seams.",
        ["neighbour-matrix", "seam-contact-sheet"],
        0.99,
      ),
    );
  }
  if (asset.kind === "print" || brief.project.targets.some((target) => target.kind === "print")) {
    gates.push(
      gate(
        "print-resolution",
        "blocking",
        "Physical size and effective DPI must meet the print profile.",
        ["physical-size", "density-dpi"],
      ),
      gate(
        "print-safe-area",
        "blocking",
        "Bleed, trim and safe-area geometry must be valid.",
        ["print-geometry-report"],
      ),
    );
  }

  return gates;
}
