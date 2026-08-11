import type {
  LayeredProductionLayerRole,
} from "./layered-production-types.js";
import { fail } from "./layered-production-internal.js";
import type {
  CompiledLayeredAssemblyManifest,
  CompiledLayeredAssemblyPlacement,
} from "./layered-production-assembly-types.js";
import {
  EDGE_DIRECTIONS,
  FOLLOW_ROLES,
  uniqueIds,
} from "./layered-production-assembly-internal.js";

function verifyManifestRouteGraph(
  manifest: CompiledLayeredAssemblyManifest,
  placementById: Map<string, CompiledLayeredAssemblyPlacement>,
): void {
  const nodes = manifest.routeGraph.nodes;
  const edges = manifest.routeGraph.edges;
  const destinations = manifest.routeGraph.destinations;
  uniqueIds(nodes.map((node) => node.id), "manifest route node IDs");
  uniqueIds(edges.map((edge) => edge.id), "manifest route edge IDs");
  uniqueIds(destinations.map((destination) => destination.id), "manifest destination IDs");
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (!nodeById.has(manifest.routeGraph.startNodeId)) {
    fail("LAYERED_ASSEMBLY_MANIFEST_INVALID", "Manifest route start node is missing.");
  }
  const destinationById = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  for (const node of nodes) {
    if (
      node.position.x < 0 ||
      node.position.y < 0 ||
      node.position.x >= manifest.district.dimensions.width ||
      node.position.y >= manifest.district.dimensions.height
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest route node ${node.id} escapes the district.`,
      );
    }
    if (
      (node.kind === "destination") !== (node.destinationId !== undefined) ||
      (node.destinationId !== undefined && !destinationById.has(node.destinationId))
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest route node ${node.id} has an invalid destination binding.`,
      );
    }
  }
  const canonicalEdges = new Set<string>();
  const adjacency = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  let totalTravelCost = 0;
  for (const edge of edges) {
    if (
      !nodeById.has(edge.from) ||
      !nodeById.has(edge.to) ||
      edge.from === edge.to ||
      !EDGE_DIRECTIONS.has(edge.direction) ||
      !Number.isInteger(edge.travelCost) ||
      edge.travelCost < 1
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest route edge ${edge.id} is invalid.`,
      );
    }
    const canonical =
      edge.direction === "bidirectional"
        ? [edge.from, edge.to].sort().join("<->")
        : `${edge.from}->${edge.to}`;
    if (canonicalEdges.has(canonical)) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest route connection ${canonical} is duplicated.`,
      );
    }
    canonicalEdges.add(canonical);
    adjacency.get(edge.from)?.push(edge.to);
    if (edge.direction === "bidirectional") adjacency.get(edge.to)?.push(edge.from);
    totalTravelCost += edge.travelCost;
  }
  const visited = new Set<string>();
  const queue = [manifest.routeGraph.startNodeId];
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  if (
    visited.size !== nodes.length ||
    manifest.routeGraph.reachableNodeCount !== visited.size ||
    manifest.routeGraph.totalTravelCost !== totalTravelCost
  ) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Manifest route reachability or total travel cost is invalid.",
    );
  }
  for (const destination of destinations) {
    const node = nodeById.get(destination.nodeId);
    if (
      !node ||
      node.kind !== "destination" ||
      node.destinationId !== destination.id ||
      !destination.targetScenePath.endsWith(".tscn")
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest destination ${destination.id} is not bound to its exact route node and scene.`,
      );
    }
    if (destination.structurePlacementId !== undefined) {
      const placement = placementById.get(destination.structurePlacementId);
      if (
        !placement ||
        placement.layerRole !== "destination-structure" ||
        placement.routeNodeId !== destination.nodeId
      ) {
        fail(
          "LAYERED_ASSEMBLY_MANIFEST_INVALID",
          `Manifest destination ${destination.id} has an invalid structure placement.`,
        );
      }
    }
  }
}

export function verifyManifestAssemblyContent(
  manifest: CompiledLayeredAssemblyManifest,
): void {
  uniqueIds(manifest.layers.map((layer) => layer.id), "manifest layer IDs");
  uniqueIds(manifest.layers.map((layer) => String(layer.zOrder)), "manifest layer zOrder values");
  const sourceByUnit = new Map(manifest.sources.map((source) => [source.unitId, source]));
  const animationById = new Map(
    manifest.animationSets.map((animationSet) => [animationSet.id, animationSet]),
  );
  uniqueIds(manifest.animationSets.map((set) => set.id), "manifest animation-set IDs");
  uniqueIds(
    manifest.animationSets.flatMap((set) => set.unitIds),
    "manifest animation-set frame membership",
  );
  for (const animationSet of manifest.animationSets) {
    const clipUnitIds = animationSet.clips.flatMap((clip) => clip.unitIds);
    if (
      clipUnitIds.length !== animationSet.unitIds.length ||
      !animationSet.unitIds.every((unitId) => clipUnitIds.includes(unitId)) ||
      animationSet.unitIds.some((unitId) => !sourceByUnit.has(unitId))
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest animation set ${animationSet.id} has invalid frame membership.`,
      );
    }
    uniqueIds(animationSet.clips.map((clip) => clip.clipId), `${animationSet.id} clip IDs`);
    for (const clip of animationSet.clips) {
      const frameNumbers = [...clip.suppliedFrameNumbers];
      if (
        frameNumbers.length !== clip.unitIds.length ||
        new Set(frameNumbers).size !== frameNumbers.length ||
        (clip.complete &&
          (frameNumbers.length !== clip.frameCount ||
            !frameNumbers.every((frame, index) => frame === index + 1)))
      ) {
        fail(
          "LAYERED_ASSEMBLY_MANIFEST_INVALID",
          `Manifest animation set ${animationSet.id} clip ${clip.clipId} is invalid.`,
        );
      }
    }
  }

  const placements = manifest.layers.flatMap((layer) =>
    layer.placements.map((placement) => ({ layer, placement })),
  );
  uniqueIds(
    placements.map(({ placement }) => placement.id),
    "manifest placement IDs",
  );
  const placementById = new Map(
    placements.map(({ placement }) => [placement.id, placement]),
  );
  const usedSourceUnits = new Set<string>();
  for (const { layer, placement } of placements) {
    if (
      placement.layerId !== layer.id ||
      placement.layerRole !== layer.role ||
      placement.zOrder !== layer.zOrder ||
      placement.visible !== true ||
      placement.position.x < 0 ||
      placement.position.y < 0 ||
      placement.bounds.x !== placement.position.x ||
      placement.bounds.y !== placement.position.y ||
      placement.bounds.width !== placement.dimensions.width ||
      placement.bounds.height !== placement.dimensions.height ||
      placement.position.x + placement.dimensions.width > manifest.district.dimensions.width ||
      placement.position.y + placement.dimensions.height > manifest.district.dimensions.height ||
      placement.worldPosition.x !== manifest.district.worldOrigin.x + placement.position.x ||
      placement.worldPosition.y !== manifest.district.worldOrigin.y + placement.position.y ||
      placement.worldBounds.x !== placement.worldPosition.x ||
      placement.worldBounds.y !== placement.worldPosition.y ||
      placement.worldBounds.width !== placement.dimensions.width ||
      placement.worldBounds.height !== placement.dimensions.height
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest placement ${placement.id} has invalid layer or geometry bindings.`,
      );
    }
    if (
      placement.sourceUnitIds.length < 1 ||
      placement.sourceUnitIds.length !== placement.sourceArtifactIds.length
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest placement ${placement.id} has invalid source bindings.`,
      );
    }
    if (placement.source.kind === "unit") {
      if (
        placement.sourceUnitIds.length !== 1 ||
        placement.sourceUnitIds[0] !== placement.source.id
      ) {
        fail(
          "LAYERED_ASSEMBLY_MANIFEST_INVALID",
          `Manifest placement ${placement.id} does not match its unit source.`,
        );
      }
    } else {
      const animationSet = animationById.get(placement.source.id);
      if (
        !animationSet ||
        animationSet.layerId !== layer.id ||
        animationSet.unitIds.length !== placement.sourceUnitIds.length ||
        !animationSet.unitIds.every(
          (unitId, index) => placement.sourceUnitIds[index] === unitId,
        )
      ) {
        fail(
          "LAYERED_ASSEMBLY_MANIFEST_INVALID",
          `Manifest placement ${placement.id} does not match its animation set.`,
        );
      }
    }
    for (const [index, unitId] of placement.sourceUnitIds.entries()) {
      const source = sourceByUnit.get(unitId);
      if (
        !source ||
        source.layerId !== layer.id ||
        source.layerRole !== layer.role ||
        placement.sourceArtifactIds[index] !== source.artifactId
      ) {
        fail(
          "LAYERED_ASSEMBLY_MANIFEST_INVALID",
          `Manifest placement ${placement.id} has an invalid retained source for ${unitId}.`,
        );
      }
      usedSourceUnits.add(unitId);
    }
    if (
      (placement.mode === "dynamic" &&
        (layer.ySortMode === "none" ||
          placement.ySortOrigin === undefined ||
          placement.sortY !== placement.position.y + placement.ySortOrigin.y)) ||
      (layer.ySortMode !== "none" && placement.mode !== "dynamic")
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest placement ${placement.id} has an invalid Y-sort contract.`,
      );
    }
  }
  if (
    usedSourceUnits.size !== manifest.sources.length ||
    manifest.sources.some((source) => !usedSourceUnits.has(source.unitId))
  ) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Manifest retained sources are not used exactly by the assembly placements.",
    );
  }

  verifyManifestRouteGraph(manifest, placementById);
  const routeNodeIds = new Set(manifest.routeGraph.nodes.map((node) => node.id));
  for (const { placement } of placements) {
    if (placement.routeNodeId !== undefined && !routeNodeIds.has(placement.routeNodeId)) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest placement ${placement.id} references an unknown route node.`,
      );
    }
  }
  const followedStarts = placements.filter(
    ({ placement }) =>
      placement.mode === "dynamic" &&
      manifest.camera.journeyFollow.followLayerRoles.includes(placement.layerRole) &&
      placement.routeNodeId === manifest.routeGraph.startNodeId,
  );
  if (followedStarts.length < 1) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Manifest has no followed dynamic actor on the route start node.",
    );
  }

  uniqueIds(manifest.occlusionGroups.map((group) => group.id), "manifest occlusion IDs");
  const occlusionIds = new Set(manifest.occlusionGroups.map((group) => group.id));
  for (const group of manifest.occlusionGroups) {
    const foreground = placementById.get(group.foregroundPlacementId);
    if (
      !foreground ||
      foreground.layerRole !== "foreground-occlusion" ||
      group.baselineY < foreground.bounds.y ||
      group.baselineY >= foreground.bounds.y + foreground.bounds.height ||
      group.occludedRoles.some((role) => !FOLLOW_ROLES.has(role))
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest occlusion group ${group.id} is invalid.`,
      );
    }
  }
  for (const { placement } of placements) {
    if (
      placement.occlusionGroupId !== undefined &&
      !occlusionIds.has(placement.occlusionGroupId)
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Manifest placement ${placement.id} references an unknown occlusion group.`,
      );
    }
  }
}
