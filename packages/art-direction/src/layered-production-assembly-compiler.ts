import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProductionUnit,
  LayeredProductionLayerRole,
} from "./layered-production-types.js";
import {
  exactKeys,
  fail,
  freeze,
  idValue,
  integerValue,
  point,
  record,
  sha256,
  stringValue,
  strings,
} from "./layered-production-internal.js";
import { verifyLayeredProductionPlan } from "./layered-production-plan.js";
import type {
  CompiledLayeredAssemblyManifest,
  CompiledLayeredAssemblyPlacement,
  LayeredAssemblyOcclusionGroupInput,
  LayeredAssemblyPlacementMode,
  LayeredAssemblyScope,
  LayeredAssemblySourceReference,
} from "./layered-production-assembly-types.js";
import {
  LAYERED_ASSEMBLY_MANIFEST_KIND,
  LAYERED_ASSEMBLY_PROTOCOL_VERSION,
  LAYERED_ASSEMBLY_REQUEST_KIND,
} from "./layered-production-assembly-types.js";
import {
  ASSEMBLY_SCOPES,
  FOLLOW_ROLES,
  PLACEMENT_MODES,
  booleanTrue,
  layerMap,
  normalizedAnimationSets,
  normalizedCamera,
  normalizedDistrict,
  normalizedSources,
  semver,
  uniqueIds,
  unitMap,
} from "./layered-production-assembly-internal.js";
import {
  normalizedOutputs,
  normalizedRouteGraph,
} from "./layered-production-assembly-route.js";

export function compileLayeredAssemblyManifest(
  plan: CompiledLayeredProductionPlan,
  input: unknown,
): CompiledLayeredAssemblyManifest {
  verifyLayeredProductionPlan(plan);
  const request = record(input, "assembly");
  exactKeys(request, "assembly", [
    "schemaVersion",
    "kind",
    "assemblyId",
    "revision",
    "scope",
    "planId",
    "district",
    "camera",
    "sources",
    "animationSets",
    "placements",
    "routeGraph",
    "occlusionGroups",
    "outputs",
    "metadata",
  ]);
  if (request.schemaVersion !== "1.0" || request.kind !== LAYERED_ASSEMBLY_REQUEST_KIND) {
    fail(
      "LAYERED_ASSEMBLY_INPUT_INVALID",
      `assembly must use schemaVersion 1.0 and kind ${LAYERED_ASSEMBLY_REQUEST_KIND}.`,
    );
  }
  const scope = stringValue(request.scope, "assembly.scope", 40) as LayeredAssemblyScope;
  if (!ASSEMBLY_SCOPES.has(scope)) {
    fail("LAYERED_ASSEMBLY_INPUT_INVALID", "assembly.scope is unsupported.");
  }
  if (request.planId !== plan.planId) {
    fail("LAYERED_ASSEMBLY_PLAN_MISMATCH", "assembly.planId does not match the compiled plan.");
  }
  if (scope === "style-proof-review" && plan.styleProof.status !== "approval-required") {
    fail(
      "LAYERED_ASSEMBLY_SCOPE_INVALID",
      "style-proof-review assembly requires a pending style-proof plan.",
    );
  }
  if (scope === "runtime-candidate" && plan.styleProof.status !== "approved") {
    fail(
      "LAYERED_ASSEMBLY_SCOPE_INVALID",
      "runtime-candidate assembly requires an approved style-proof plan.",
    );
  }

  const district = normalizedDistrict(request.district, plan);
  const camera = normalizedCamera(request.camera, district);
  const units = unitMap(plan);
  const sources = normalizedSources(request.sources, scope, plan, units);
  const sourceByUnit = new Map(sources.map((source) => [source.unitId, source]));
  const animationSets = normalizedAnimationSets(
    request.animationSets,
    scope,
    plan,
    units,
    sourceByUnit,
  );
  const animationById = new Map(animationSets.map((set) => [set.id, set]));
  const planLayers = layerMap(plan);

  if (!Array.isArray(request.placements) || request.placements.length === 0 || request.placements.length > 4096) {
    fail(
      "LAYERED_ASSEMBLY_PLACEMENT_INVALID",
      "assembly.placements must contain between 1 and 4096 placements.",
    );
  }
  const placements = request.placements.map((raw, index) => {
    const label = `assembly.placements[${index}]`;
    const placement = record(raw, label);
    exactKeys(placement, label, [
      "id",
      "source",
      "layerId",
      "position",
      "mode",
      "visible",
      "routeNodeId",
      "occlusionGroupId",
      "instanceGroup",
    ]);
    const sourceInput = record(placement.source, `${label}.source`);
    exactKeys(sourceInput, `${label}.source`, ["kind", "id"]);
    const sourceKind = stringValue(sourceInput.kind, `${label}.source.kind`, 30);
    if (sourceKind !== "unit" && sourceKind !== "animation-set") {
      fail("LAYERED_ASSEMBLY_PLACEMENT_INVALID", `${label}.source.kind is unsupported.`);
    }
    const sourceId = idValue(sourceInput.id, `${label}.source.id`);
    const sourceReference = freeze({ kind: sourceKind, id: sourceId }) as LayeredAssemblySourceReference;
    const layerId = idValue(placement.layerId, `${label}.layerId`);
    const layer = planLayers.get(layerId);
    if (!layer) {
      fail("LAYERED_ASSEMBLY_PLACEMENT_INVALID", `${label} references unknown layer ${layerId}.`);
    }

    let sourceUnits: readonly CompiledLayeredProductionUnit[];
    let size: Readonly<{ width: number; height: number }>;
    let pivot: Readonly<{ x: number; y: number }> | undefined;
    let ySortOrigin: Readonly<{ x: number; y: number }> | undefined;
    if (sourceReference.kind === "unit") {
      const unit = units.get(sourceReference.id);
      if (!unit || !sourceByUnit.has(unit.id)) {
        fail(
          "LAYERED_ASSEMBLY_PLACEMENT_INVALID",
          `${label} requires a retained source binding for unit ${sourceReference.id}.`,
        );
      }
      if (unit.layerId !== layerId) {
        fail(
          "LAYERED_ASSEMBLY_PLACEMENT_INVALID",
          `${label} source unit belongs to layer ${unit.layerId}, not ${layerId}.`,
        );
      }
      if (scope === "runtime-candidate" && unit.kind === "animation-frame") {
        fail(
          "LAYERED_ASSEMBLY_ANIMATION_INCOMPLETE",
          `${label} runtime actor/effect animation frames must be placed through a complete animation set.`,
        );
      }
      sourceUnits = [unit];
      size = unit.dimensions;
      pivot = unit.pivot;
      ySortOrigin = unit.ySortOrigin;
    } else {
      const animationSet = animationById.get(sourceReference.id);
      if (!animationSet || animationSet.layerId !== layerId) {
        fail(
          "LAYERED_ASSEMBLY_PLACEMENT_INVALID",
          `${label} requires animation set ${sourceReference.id} on layer ${layerId}.`,
        );
      }
      sourceUnits = animationSet.unitIds.map((unitId) => {
        const unit = units.get(unitId);
        if (!unit) {
          fail("LAYERED_ASSEMBLY_PLACEMENT_INVALID", `${label} animation unit ${unitId} is missing.`);
        }
        return unit;
      });
      size = animationSet.dimensions;
      pivot = animationSet.pivot;
      ySortOrigin = animationSet.ySortOrigin;
    }

    const positionValue = point(
      placement.position,
      `${label}.position`,
      district.dimensions.width,
      district.dimensions.height,
    );
    if (
      positionValue.x + size.width > district.dimensions.width ||
      positionValue.y + size.height > district.dimensions.height
    ) {
      fail("LAYERED_ASSEMBLY_GEOMETRY_INVALID", `${label} source bounds escape the district canvas.`);
    }
    const mode = stringValue(placement.mode, `${label}.mode`, 20) as LayeredAssemblyPlacementMode;
    if (!PLACEMENT_MODES.has(mode)) {
      fail("LAYERED_ASSEMBLY_PLACEMENT_INVALID", `${label}.mode is unsupported.`);
    }
    if (sourceUnits.some((unit) => unit.kind === "full-canvas-layer")) {
      if (
        mode !== "baked" ||
        positionValue.x !== 0 ||
        positionValue.y !== 0 ||
        size.width !== district.dimensions.width ||
        size.height !== district.dimensions.height
      ) {
        fail(
          "LAYERED_ASSEMBLY_GEOMETRY_INVALID",
          `${label} full-canvas sources must be one baked placement at 0,0.`,
        );
      }
    }
    if (layer.ySortMode !== "none" && (mode !== "dynamic" || !ySortOrigin)) {
      fail(
        "LAYERED_ASSEMBLY_PLACEMENT_INVALID",
        `${label} Y-sorted layer requires dynamic placement with an exact Y-sort origin.`,
      );
    }
    if (mode === "dynamic" && layer.ySortMode === "none") {
      fail(
        "LAYERED_ASSEMBLY_PLACEMENT_INVALID",
        `${label} dynamic placement requires a Y-sorted plan layer.`,
      );
    }
    if (mode === "overlay" && !["ambient-effect", "route-highlight", "ui"].includes(layer.role)) {
      fail(
        "LAYERED_ASSEMBLY_PLACEMENT_INVALID",
        `${label} overlay mode is restricted to effect, route-highlight or UI layers.`,
      );
    }
    const bounds = freeze({
      x: positionValue.x,
      y: positionValue.y,
      width: size.width,
      height: size.height,
    });
    const worldPosition = freeze({
      x: district.worldOrigin.x + positionValue.x,
      y: district.worldOrigin.y + positionValue.y,
    });
    const worldBounds = freeze({
      x: worldPosition.x,
      y: worldPosition.y,
      width: size.width,
      height: size.height,
    });
    const routeNodeId =
      placement.routeNodeId === undefined
        ? undefined
        : idValue(placement.routeNodeId, `${label}.routeNodeId`);
    const occlusionGroupId =
      placement.occlusionGroupId === undefined
        ? undefined
        : idValue(placement.occlusionGroupId, `${label}.occlusionGroupId`);
    const instanceGroup =
      placement.instanceGroup === undefined
        ? undefined
        : idValue(placement.instanceGroup, `${label}.instanceGroup`);
    return freeze({
      id: idValue(placement.id, `${label}.id`),
      source: sourceReference,
      sourceUnitIds: sourceUnits.map((unit) => unit.id),
      sourceArtifactIds: sourceUnits.map((unit) => sourceByUnit.get(unit.id)?.artifactId ?? ""),
      layerId,
      layerRole: layer.role,
      zOrder: layer.zOrder,
      position: positionValue,
      worldPosition,
      dimensions: size,
      bounds,
      worldBounds,
      ...(pivot ? { pivot } : {}),
      ...(ySortOrigin ? { ySortOrigin } : {}),
      ...(ySortOrigin ? { sortY: positionValue.y + ySortOrigin.y } : {}),
      mode,
      visible: booleanTrue(placement.visible, `${label}.visible`),
      ...(routeNodeId === undefined ? {} : { routeNodeId }),
      ...(occlusionGroupId === undefined ? {} : { occlusionGroupId }),
      ...(instanceGroup === undefined ? {} : { instanceGroup }),
    });
  });
  uniqueIds(placements.map((placement) => placement.id), "assembly.placements IDs");
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));

  const fullCanvasCounts = new Map<string, number>();
  for (const placement of placements) {
    for (const unitId of placement.sourceUnitIds) {
      const unit = units.get(unitId);
      if (unit?.kind === "full-canvas-layer") {
        fullCanvasCounts.set(unitId, (fullCanvasCounts.get(unitId) ?? 0) + 1);
      }
    }
  }
  for (const [unitId, count] of fullCanvasCounts) {
    if (count !== 1) {
      fail(
        "LAYERED_ASSEMBLY_PLACEMENT_INVALID",
        `Full-canvas source ${unitId} must be placed exactly once.`,
      );
    }
  }

  const routeGraph = normalizedRouteGraph(request.routeGraph, district, placementById);
  const routeNodeIds = new Set(routeGraph.nodes.map((node) => node.id));
  for (const placement of placements) {
    if (placement.routeNodeId !== undefined && !routeNodeIds.has(placement.routeNodeId)) {
      fail(
        "LAYERED_ASSEMBLY_ROUTE_INVALID",
        `Placement ${placement.id} references unknown route node ${placement.routeNodeId}.`,
      );
    }
  }
  const followedStartPlacements = placements.filter(
    (placement) =>
      placement.mode === "dynamic" &&
      camera.journeyFollow.followLayerRoles.includes(placement.layerRole) &&
      placement.routeNodeId === routeGraph.startNodeId,
  );
  if (followedStartPlacements.length < 1) {
    fail(
      "LAYERED_ASSEMBLY_CAMERA_INVALID",
      "Journey-follow camera requires at least one dynamic followed actor placement on the route start node.",
    );
  }

  const rawOcclusionGroups = request.occlusionGroups ?? [];
  if (!Array.isArray(rawOcclusionGroups) || rawOcclusionGroups.length > 512) {
    fail(
      "LAYERED_ASSEMBLY_OCCLUSION_INVALID",
      "assembly.occlusionGroups must contain at most 512 entries.",
    );
  }
  const occlusionGroups = rawOcclusionGroups.map((raw, index) => {
    const label = `assembly.occlusionGroups[${index}]`;
    const group = record(raw, label);
    exactKeys(group, label, ["id", "foregroundPlacementId", "baselineY", "occludedRoles"]);
    const id = idValue(group.id, `${label}.id`);
    const foregroundPlacementId = idValue(
      group.foregroundPlacementId,
      `${label}.foregroundPlacementId`,
    );
    const foreground = placementById.get(foregroundPlacementId);
    if (!foreground || foreground.layerRole !== "foreground-occlusion") {
      fail(
        "LAYERED_ASSEMBLY_OCCLUSION_INVALID",
        `${label}.foregroundPlacementId must reference a foreground-occlusion placement.`,
      );
    }
    const roles = strings(group.occludedRoles, `${label}.occludedRoles`, 1, 12, 80).map(
      (entry) => entry as LayeredProductionLayerRole,
    );
    if (roles.some((role) => !FOLLOW_ROLES.has(role))) {
      fail(
        "LAYERED_ASSEMBLY_OCCLUSION_INVALID",
        `${label}.occludedRoles may only include player-character and crowd-character.`,
      );
    }
    const baselineY = integerValue(
      group.baselineY,
      `${label}.baselineY`,
      0,
      district.dimensions.height - 1,
    );
    if (
      baselineY < foreground.bounds.y ||
      baselineY >= foreground.bounds.y + foreground.bounds.height
    ) {
      fail(
        "LAYERED_ASSEMBLY_OCCLUSION_INVALID",
        `${label}.baselineY must fall inside the foreground placement bounds.`,
      );
    }
    return freeze({
      id,
      foregroundPlacementId,
      baselineY,
      occludedRoles: roles,
    });
  });
  uniqueIds(occlusionGroups.map((group) => group.id), "assembly.occlusionGroups IDs");
  const occlusionIds = new Set(occlusionGroups.map((group) => group.id));
  for (const placement of placements) {
    if (placement.occlusionGroupId !== undefined && !occlusionIds.has(placement.occlusionGroupId)) {
      fail(
        "LAYERED_ASSEMBLY_OCCLUSION_INVALID",
        `Placement ${placement.id} references unknown occlusion group ${placement.occlusionGroupId}.`,
      );
    }
  }
  const foregroundPlacements = placements.filter(
    (placement) => placement.layerRole === "foreground-occlusion",
  );
  if (foregroundPlacements.length > 0 && occlusionGroups.length === 0) {
    fail(
      "LAYERED_ASSEMBLY_OCCLUSION_INVALID",
      "Foreground-occlusion sources require explicit occlusion-group contracts.",
    );
  }

  const usedUnitIds = new Set(placements.flatMap((placement) => placement.sourceUnitIds));
  const unusedSources = sources.filter((source) => !usedUnitIds.has(source.unitId));
  if (unusedSources.length) {
    fail(
      "LAYERED_ASSEMBLY_SOURCE_INVALID",
      `Assembly contains unused retained sources: ${unusedSources.map((source) => source.unitId).join(", ")}.`,
    );
  }
  if (scope === "style-proof-review") {
    const missingProofUnits = plan.styleProof.unitIds.filter((unitId) => !usedUnitIds.has(unitId));
    if (missingProofUnits.length) {
      fail(
        "LAYERED_ASSEMBLY_STYLE_PROOF_BOUNDARY",
        `Style-proof assembly must place every proof unit: ${missingProofUnits.join(", ")}.`,
      );
    }
  }

  const outputs = normalizedOutputs(request.outputs, plan.project.runtimeRoot);
  const layers = plan.layers.map((layer) =>
    freeze({
      id: layer.id,
      role: layer.role,
      zOrder: layer.zOrder,
      alpha: layer.alpha,
      assemblyMode: layer.assemblyMode,
      ySortMode: layer.ySortMode,
      placements: placements
        .filter((placement) => placement.layerId === layer.id)
        .sort((left, right) => {
          const sortY = (left.sortY ?? left.position.y) - (right.sortY ?? right.position.y);
          return sortY || left.id.localeCompare(right.id);
        }),
    }),
  );
  const blockers =
    scope === "style-proof-review"
      ? freeze([
          "style-proof source images remain unapproved candidates",
          "review composite is evidence only and cannot be promoted as a runtime source",
          "runtime-candidate assembly requires content-addressed approval receipts for every source unit",
        ])
      : freeze([]);
  const partial = {
    schemaVersion: "1.0" as const,
    kind: LAYERED_ASSEMBLY_MANIFEST_KIND,
    protocolVersion: LAYERED_ASSEMBLY_PROTOCOL_VERSION,
    assemblyId: idValue(request.assemblyId, "assembly.assemblyId"),
    revision: semver(request.revision, "assembly.revision"),
    scope,
    requestSha256: sha256({ planSha256: plan.planSha256, request }),
    plan: freeze({
      planId: plan.planId,
      planSha256: plan.planSha256,
      styleFingerprintSha256: plan.styleFingerprintSha256,
      styleProofStatus: plan.styleProof.status,
    }),
    district,
    camera,
    sources,
    animationSets,
    layers,
    routeGraph,
    occlusionGroups,
    outputs,
    readiness: freeze({
      runtimeReady: scope === "runtime-candidate",
      candidateOnly: scope === "style-proof-review",
      reviewCompositeIsRuntimeSource: false as const,
      blockers,
    }),
    totals: freeze({
      sources: sources.length,
      approvedSources: sources.filter((source) => source.status === "approved").length,
      candidateSources: sources.filter((source) => source.status === "candidate").length,
      animationSets: animationSets.length,
      placements: placements.length,
      dynamicPlacements: placements.filter((placement) => placement.mode === "dynamic").length,
      routeNodes: routeGraph.nodes.length,
      routeEdges: routeGraph.edges.length,
      destinations: routeGraph.destinations.length,
      occlusionGroups: occlusionGroups.length,
    }),
    qualityGates: freeze([
      "every retained source is bound to one exact layered-production unit, artifact hash, dimensions and alpha policy",
      "style-proof review scope may use only the declared proof units and remains candidate-only",
      "runtime-candidate scope requires an approved style proof plus a source approval receipt for every retained unit",
      "full-canvas layers are placed exactly once at 0,0 and cannot be substituted by a flattened concept image",
      "dynamic actors retain identical frame geometry, pivots, Y-sort origins and complete clip timing before runtime assembly",
      "all placement bounds remain inside the district canvas and preserve exact world-origin translation",
      "route nodes, edges and destinations form a reachable graph with explicit travel costs and scene bindings",
      "foreground occluders declare exact baselines and the actor roles they may cover",
      "overview, journey-follow and destination-close cameras use bounded integer zoom with no filtered resampling",
      "review composites are derivative evidence only and never acquire runtime-source authority",
    ]),
    authority: freeze({
      planningOnly: true as const,
      providerExecution: false as const,
      creativeApproval: false as const,
      imageMutation: false as const,
      automaticAssembly: false as const,
      automaticPromotion: false as const,
      targetRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  return freeze({ ...partial, manifestSha256: sha256(partial) });
}
