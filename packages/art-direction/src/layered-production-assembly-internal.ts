import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProductionUnit,
  LayeredProductionAlphaPolicy,
  LayeredProductionLayerRole,
} from "./layered-production-types.js";
import {
  dimensions,
  exactKeys,
  fail,
  freeze,
  idValue,
  integerValue,
  point,
  record,
  stringValue,
  strings,
} from "./layered-production-internal.js";
import type {
  LayeredAssemblyAnimationCompleteness,
  LayeredAssemblyEdgeDirection,
  LayeredAssemblyPlacementMode,
  LayeredAssemblyRouteNodeKind,
  LayeredAssemblyScope,
  LayeredAssemblySourceStatus,
} from "./layered-production-assembly-types.js";

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const ARTIFACT_ID_PATTERN = /^artifact_[0-9a-f]{64}$/;
export const ASSEMBLY_SCOPES = new Set<LayeredAssemblyScope>([
  "style-proof-review",
  "runtime-candidate",
]);
export const SOURCE_STATUSES = new Set<LayeredAssemblySourceStatus>([
  "candidate",
  "approved",
]);
export const PLACEMENT_MODES = new Set<LayeredAssemblyPlacementMode>([
  "baked",
  "static",
  "dynamic",
  "overlay",
]);
export const ROUTE_NODE_KINDS = new Set<LayeredAssemblyRouteNodeKind>([
  "path",
  "junction",
  "destination",
  "transition",
]);
export const EDGE_DIRECTIONS = new Set<LayeredAssemblyEdgeDirection>([
  "bidirectional",
  "one-way",
]);
export const FOLLOW_ROLES = new Set<LayeredProductionLayerRole>([
  "player-character",
  "crowd-character",
]);

export function booleanTrue(value: unknown, label: string): true {
  if (value !== true) {
    fail("LAYERED_ASSEMBLY_INPUT_INVALID", `${label} must remain true.`);
  }
  return true;
}

export function semver(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  if (!/^\d+\.\d+\.\d+$/.test(output)) {
    fail("LAYERED_ASSEMBLY_INPUT_INVALID", `${label} must be semantic version text.`);
  }
  return output;
}

export function shaValue(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  if (!SHA256_PATTERN.test(output)) {
    fail("LAYERED_ASSEMBLY_IDENTITY_INVALID", `${label} must be a lowercase SHA-256.`);
  }
  return output;
}

export function artifactId(value: unknown, hash: string, label: string): string {
  const output = stringValue(value, label, 80);
  if (!ARTIFACT_ID_PATTERN.test(output) || output !== `artifact_${hash}`) {
    fail(
      "LAYERED_ASSEMBLY_IDENTITY_INVALID",
      `${label} must equal artifact_<sha256> for the retained source bytes.`,
    );
  }
  return output;
}

export function uniqueIds(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      fail("LAYERED_ASSEMBLY_INPUT_INVALID", `${label} contains duplicate ID ${value}.`);
    }
    seen.add(value);
  }
}

export function rectangle(
  value: unknown,
  label: string,
  maximumWidth: number,
  maximumHeight: number,
): Readonly<{ x: number; y: number; width: number; height: number }> {
  const input = record(value, label);
  exactKeys(input, label, ["x", "y", "width", "height"]);
  const x = integerValue(input.x, `${label}.x`, 0, maximumWidth);
  const y = integerValue(input.y, `${label}.y`, 0, maximumHeight);
  const width = integerValue(input.width, `${label}.width`, 1, maximumWidth);
  const height = integerValue(input.height, `${label}.height`, 1, maximumHeight);
  if (x + width > maximumWidth || y + height > maximumHeight) {
    fail("LAYERED_ASSEMBLY_GEOMETRY_INVALID", `${label} escapes its containing rectangle.`);
  }
  return freeze({ x, y, width, height });
}

export function unitMap(plan: CompiledLayeredProductionPlan): Map<string, CompiledLayeredProductionUnit> {
  return new Map(
    plan.layers.flatMap((layer) => layer.units).map((unit) => [unit.id, unit]),
  );
}

export function layerMap(plan: CompiledLayeredProductionPlan) {
  return new Map(plan.layers.map((layer) => [layer.id, layer]));
}

export function normalizedDistrict(value: unknown, plan: CompiledLayeredProductionPlan) {
  const input = record(value, "assembly.district");
  exactKeys(input, "assembly.district", ["id", "title", "worldOrigin", "dimensions"]);
  const size = dimensions(input.dimensions, "assembly.district.dimensions");
  if (size.width !== plan.canvas.width || size.height !== plan.canvas.height) {
    fail(
      "LAYERED_ASSEMBLY_GEOMETRY_INVALID",
      `assembly.district.dimensions must equal the plan canvas ${plan.canvas.width}x${plan.canvas.height}.`,
    );
  }
  const origin = point(
    input.worldOrigin,
    "assembly.district.worldOrigin",
    plan.canvas.worldWidth - size.width,
    plan.canvas.worldHeight - size.height,
  );
  return freeze({
    id: idValue(input.id, "assembly.district.id"),
    title: stringValue(input.title, "assembly.district.title", 300),
    worldOrigin: origin,
    dimensions: size,
  });
}

export function normalizedCamera(
  value: unknown,
  district: Readonly<{ dimensions: Readonly<{ width: number; height: number }> }>,
) {
  const input = record(value, "assembly.camera");
  exactKeys(input, "assembly.camera", ["overview", "journeyFollow", "destinationClose"]);

  const overviewInput = record(input.overview, "assembly.camera.overview");
  exactKeys(overviewInput, "assembly.camera.overview", ["zoom", "bounds"]);
  const overviewZoom = integerValue(overviewInput.zoom, "assembly.camera.overview.zoom", 1, 4);
  if (overviewZoom !== 1) {
    fail(
      "LAYERED_ASSEMBLY_CAMERA_INVALID",
      "The district overview must remain at native 1x zoom; wider city overview uses separately authored overview/LOD sources.",
    );
  }
  const overviewBounds = rectangle(
    overviewInput.bounds,
    "assembly.camera.overview.bounds",
    district.dimensions.width,
    district.dimensions.height,
  );
  if (
    overviewBounds.x !== 0 ||
    overviewBounds.y !== 0 ||
    overviewBounds.width !== district.dimensions.width ||
    overviewBounds.height !== district.dimensions.height
  ) {
    fail(
      "LAYERED_ASSEMBLY_CAMERA_INVALID",
      "The district overview must cover the complete native district canvas.",
    );
  }

  const followInput = record(input.journeyFollow, "assembly.camera.journeyFollow");
  exactKeys(followInput, "assembly.camera.journeyFollow", [
    "zoom",
    "followLayerRoles",
    "deadZone",
    "lookAhead",
  ]);
  const followZoom = integerValue(followInput.zoom, "assembly.camera.journeyFollow.zoom", 1, 4);
  if (followZoom <= overviewZoom) {
    fail(
      "LAYERED_ASSEMBLY_CAMERA_INVALID",
      "Journey-follow zoom must be closer than the overview zoom.",
    );
  }
  const followRoles = strings(
    followInput.followLayerRoles,
    "assembly.camera.journeyFollow.followLayerRoles",
    1,
    2,
    80,
  ).map((entry) => entry as LayeredProductionLayerRole);
  if (followRoles.some((role) => !FOLLOW_ROLES.has(role))) {
    fail(
      "LAYERED_ASSEMBLY_CAMERA_INVALID",
      "Journey-follow camera may only follow player-character or crowd-character layers.",
    );
  }
  const deadZone = dimensions(followInput.deadZone, "assembly.camera.journeyFollow.deadZone");
  if (
    deadZone.width >= district.dimensions.width / followZoom ||
    deadZone.height >= district.dimensions.height / followZoom
  ) {
    fail(
      "LAYERED_ASSEMBLY_CAMERA_INVALID",
      "Journey-follow dead zone must fit inside the zoomed native viewport.",
    );
  }
  const lookAheadInput = record(followInput.lookAhead, "assembly.camera.journeyFollow.lookAhead");
  exactKeys(lookAheadInput, "assembly.camera.journeyFollow.lookAhead", ["x", "y"]);
  const lookAhead = freeze({
    x: integerValue(
      lookAheadInput.x,
      "assembly.camera.journeyFollow.lookAhead.x",
      -district.dimensions.width,
      district.dimensions.width,
    ),
    y: integerValue(
      lookAheadInput.y,
      "assembly.camera.journeyFollow.lookAhead.y",
      -district.dimensions.height,
      district.dimensions.height,
    ),
  });

  const closeInput = record(input.destinationClose, "assembly.camera.destinationClose");
  exactKeys(closeInput, "assembly.camera.destinationClose", ["zoom", "transitionFrames"]);
  const closeZoom = integerValue(closeInput.zoom, "assembly.camera.destinationClose.zoom", followZoom, 4);
  const transitionFrames = integerValue(
    closeInput.transitionFrames,
    "assembly.camera.destinationClose.transitionFrames",
    1,
    240,
  );

  return freeze({
    overview: freeze({ zoom: overviewZoom, bounds: overviewBounds }),
    journeyFollow: freeze({
      zoom: followZoom,
      followLayerRoles: followRoles,
      deadZone,
      lookAhead,
    }),
    destinationClose: freeze({ zoom: closeZoom, transitionFrames }),
  });
}

export function normalizedSources(
  value: unknown,
  scope: LayeredAssemblyScope,
  plan: CompiledLayeredProductionPlan,
  units: Map<string, CompiledLayeredProductionUnit>,
) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2048) {
    fail(
      "LAYERED_ASSEMBLY_SOURCE_INVALID",
      "assembly.sources must contain between 1 and 2048 retained source bindings.",
    );
  }
  const proofUnits = new Set(plan.styleProof.unitIds);
  const output = value.map((raw, index) => {
    const label = `assembly.sources[${index}]`;
    const input = record(raw, label);
    exactKeys(input, label, [
      "unitId",
      "artifactId",
      "sha256",
      "bytes",
      "width",
      "height",
      "alpha",
      "status",
      "approvalReceiptArtifactId",
      "approvalReceiptSha256",
    ]);
    const unitId = idValue(input.unitId, `${label}.unitId`);
    const unit = units.get(unitId);
    if (!unit) {
      fail("LAYERED_ASSEMBLY_SOURCE_INVALID", `${label} references unknown plan unit ${unitId}.`);
    }
    if (scope === "style-proof-review" && !proofUnits.has(unitId)) {
      fail(
        "LAYERED_ASSEMBLY_STYLE_PROOF_BOUNDARY",
        `${label} references ${unitId}, which is outside the pending style-proof set.`,
      );
    }
    const hash = shaValue(input.sha256, `${label}.sha256`);
    const status = stringValue(input.status, `${label}.status`, 20) as LayeredAssemblySourceStatus;
    if (!SOURCE_STATUSES.has(status)) {
      fail("LAYERED_ASSEMBLY_SOURCE_INVALID", `${label}.status is unsupported.`);
    }
    if (scope === "style-proof-review" && status !== "candidate") {
      fail(
        "LAYERED_ASSEMBLY_SOURCE_INVALID",
        `${label} must remain candidate evidence in style-proof review scope.`,
      );
    }
    if (scope === "runtime-candidate" && status !== "approved") {
      fail(
        "LAYERED_ASSEMBLY_SOURCE_INVALID",
        `${label} must be approved before runtime-candidate assembly.`,
      );
    }
    const approvalReceiptSha256 =
      input.approvalReceiptSha256 === undefined
        ? undefined
        : shaValue(input.approvalReceiptSha256, `${label}.approvalReceiptSha256`);
    const approvalReceiptArtifactId =
      input.approvalReceiptArtifactId === undefined || approvalReceiptSha256 === undefined
        ? undefined
        : artifactId(
            input.approvalReceiptArtifactId,
            approvalReceiptSha256,
            `${label}.approvalReceiptArtifactId`,
          );
    if (
      status === "approved" &&
      (approvalReceiptSha256 === undefined || approvalReceiptArtifactId === undefined)
    ) {
      fail(
        "LAYERED_ASSEMBLY_SOURCE_INVALID",
        `${label} approved source requires a content-addressed approval receipt artifact and SHA-256.`,
      );
    }
    if (
      status === "candidate" &&
      (approvalReceiptSha256 !== undefined || approvalReceiptArtifactId !== undefined)
    ) {
      fail(
        "LAYERED_ASSEMBLY_SOURCE_INVALID",
        `${label} candidate source may not claim an approval receipt.`,
      );
    }
    const width = integerValue(input.width, `${label}.width`, 1, 8192);
    const height = integerValue(input.height, `${label}.height`, 1, 8192);
    if (width !== unit.dimensions.width || height !== unit.dimensions.height) {
      fail(
        "LAYERED_ASSEMBLY_SOURCE_INVALID",
        `${label} dimensions do not match exact plan unit ${unitId}.`,
      );
    }
    const alpha = stringValue(input.alpha, `${label}.alpha`, 20) as LayeredProductionAlphaPolicy;
    if (alpha !== unit.alpha) {
      fail(
        "LAYERED_ASSEMBLY_SOURCE_INVALID",
        `${label}.alpha does not match exact plan unit ${unitId}.`,
      );
    }
    return freeze({
      unitId,
      layerId: unit.layerId,
      layerRole: unit.layerRole,
      artifactId: artifactId(input.artifactId, hash, `${label}.artifactId`),
      sha256: hash,
      bytes: integerValue(input.bytes, `${label}.bytes`, 1, 64 * 1024 * 1024),
      width,
      height,
      alpha,
      status,
      ...(approvalReceiptArtifactId === undefined
        ? {}
        : { approvalReceiptArtifactId }),
      ...(approvalReceiptSha256 === undefined ? {} : { approvalReceiptSha256 }),
    });
  });
  uniqueIds(output.map((entry) => entry.unitId), "assembly.sources unit IDs");
  uniqueIds(output.map((entry) => entry.artifactId), "assembly.sources artifact IDs");
  return freeze(output.sort((left, right) => {
    const leftUnit = units.get(left.unitId);
    const rightUnit = units.get(right.unitId);
    return (leftUnit?.sequence ?? 0) - (rightUnit?.sequence ?? 0);
  }));
}

export function normalizedAnimationSets(
  value: unknown,
  scope: LayeredAssemblyScope,
  plan: CompiledLayeredProductionPlan,
  units: Map<string, CompiledLayeredProductionUnit>,
  sourceByUnit: Map<string, ReturnType<typeof normalizedSources>[number]>,
) {
  if (value === undefined) return freeze([]);
  if (!Array.isArray(value) || value.length > 256) {
    fail(
      "LAYERED_ASSEMBLY_ANIMATION_INVALID",
      "assembly.animationSets must be an array containing at most 256 entries.",
    );
  }
  const layers = layerMap(plan);
  const output = value.map((raw, index) => {
    const label = `assembly.animationSets[${index}]`;
    const input = record(raw, label);
    exactKeys(input, label, ["id", "layerId", "continuityKey", "completeness", "unitIds"]);
    const id = idValue(input.id, `${label}.id`);
    const layerId = idValue(input.layerId, `${label}.layerId`);
    const layer = layers.get(layerId);
    if (!layer) {
      fail("LAYERED_ASSEMBLY_ANIMATION_INVALID", `${label} references unknown layer ${layerId}.`);
    }
    const completeness = stringValue(
      input.completeness,
      `${label}.completeness`,
      30,
    ) as LayeredAssemblyAnimationCompleteness;
    if (!new Set(["proof-partial", "complete"]).has(completeness)) {
      fail("LAYERED_ASSEMBLY_ANIMATION_INVALID", `${label}.completeness is unsupported.`);
    }
    if (scope === "style-proof-review" && completeness !== "proof-partial") {
      fail(
        "LAYERED_ASSEMBLY_ANIMATION_INVALID",
        `${label} may only be proof-partial before style-proof approval.`,
      );
    }
    if (scope === "runtime-candidate" && completeness !== "complete") {
      fail(
        "LAYERED_ASSEMBLY_ANIMATION_INVALID",
        `${label} must be complete for runtime-candidate assembly.`,
      );
    }
    const continuityKey = idValue(input.continuityKey, `${label}.continuityKey`);
    const unitIds = strings(input.unitIds, `${label}.unitIds`, 1, 1024, 160).map((unitId) =>
      idValue(unitId, `${label}.unitIds`),
    );
    const setUnits = unitIds.map((unitId) => {
      const unit = units.get(unitId);
      if (!unit || unit.kind !== "animation-frame") {
        fail(
          "LAYERED_ASSEMBLY_ANIMATION_INVALID",
          `${label} requires animation-frame unit ${unitId}.`,
        );
      }
      if (!sourceByUnit.has(unitId)) {
        fail(
          "LAYERED_ASSEMBLY_ANIMATION_INVALID",
          `${label} requires retained source binding for ${unitId}.`,
        );
      }
      if (unit.layerId !== layerId || unit.continuityKey !== continuityKey) {
        fail(
          "LAYERED_ASSEMBLY_ANIMATION_INVALID",
          `${label} units must share layer ${layerId} and continuity ${continuityKey}.`,
        );
      }
      return unit;
    });
    const first = setUnits[0];
    if (!first) {
      fail("LAYERED_ASSEMBLY_ANIMATION_INVALID", `${label} is empty.`);
    }
    for (const unit of setUnits.slice(1)) {
      if (
        unit.dimensions.width !== first.dimensions.width ||
        unit.dimensions.height !== first.dimensions.height ||
        JSON.stringify(unit.pivot ?? null) !== JSON.stringify(first.pivot ?? null) ||
        JSON.stringify(unit.ySortOrigin ?? null) !== JSON.stringify(first.ySortOrigin ?? null)
      ) {
        fail(
          "LAYERED_ASSEMBLY_ANIMATION_INVALID",
          `${label} frame geometry, pivots and Y-sort origins must remain identical.`,
        );
      }
    }
    const byClip = new Map<string, CompiledLayeredProductionUnit[]>();
    for (const unit of setUnits) {
      const frame = unit.frame;
      if (!frame) {
        fail("LAYERED_ASSEMBLY_ANIMATION_INVALID", `${label} unit ${unit.id} has no frame metadata.`);
      }
      const entries = byClip.get(frame.clipId) ?? [];
      entries.push(unit);
      byClip.set(frame.clipId, entries);
    }
    const clips = [...byClip.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([clipId, clipUnits]) => {
        const metadata = clipUnits[0]?.frame;
        if (!metadata) {
          fail("LAYERED_ASSEMBLY_ANIMATION_INVALID", `${label} clip ${clipId} has no metadata.`);
        }
        for (const unit of clipUnits) {
          const frame = unit.frame;
          if (
            !frame ||
            frame.frameCount !== metadata.frameCount ||
            frame.framesPerSecond !== metadata.framesPerSecond ||
            frame.loop !== metadata.loop
          ) {
            fail(
              "LAYERED_ASSEMBLY_ANIMATION_INVALID",
              `${label} clip ${clipId} has inconsistent timing metadata.`,
            );
          }
        }
        const sortedUnits = [...clipUnits].sort(
          (left, right) => (left.frame?.frameNumber ?? 0) - (right.frame?.frameNumber ?? 0),
        );
        const frameNumbers = sortedUnits.map((unit) => unit.frame?.frameNumber ?? 0);
        uniqueIds(frameNumbers.map(String), `${label} clip ${clipId} frame numbers`);
        const complete =
          frameNumbers.length === metadata.frameCount &&
          frameNumbers.every((frameNumber, frameIndex) => frameNumber === frameIndex + 1);
        if (completeness === "complete" && !complete) {
          fail(
            "LAYERED_ASSEMBLY_ANIMATION_INCOMPLETE",
            `${label} clip ${clipId} must contain exact frames 1..${metadata.frameCount}.`,
          );
        }
        return freeze({
          clipId,
          frameCount: metadata.frameCount,
          framesPerSecond: metadata.framesPerSecond,
          loop: metadata.loop,
          suppliedFrameNumbers: frameNumbers,
          unitIds: sortedUnits.map((unit) => unit.id),
          complete,
        });
      });
    return freeze({
      id,
      layerId,
      layerRole: layer.role,
      continuityKey,
      completeness,
      dimensions: first.dimensions,
      ...(first.pivot ? { pivot: first.pivot } : {}),
      ...(first.ySortOrigin ? { ySortOrigin: first.ySortOrigin } : {}),
      clips,
      unitIds,
    });
  });
  uniqueIds(output.map((entry) => entry.id), "assembly.animationSets IDs");
  uniqueIds(
    output.flatMap((entry) => entry.unitIds),
    "assembly.animationSets frame membership",
  );
  return freeze(output);
}
