import type { CompiledLayeredAssemblyPlacement } from "./layered-production-assembly-types.js";
import type {
  LayeredAssemblyEdgeDirection,
  LayeredAssemblyRouteNodeKind,
} from "./layered-production-assembly-types.js";
import {
  exactKeys,
  fail,
  freeze,
  idValue,
  integerValue,
  point,
  record,
  relativePath,
  stringValue,
} from "./layered-production-internal.js";
import {
  EDGE_DIRECTIONS,
  ROUTE_NODE_KINDS,
  uniqueIds,
} from "./layered-production-assembly-internal.js";

export function normalizedRouteGraph(
  value: unknown,
  district: Readonly<{ dimensions: Readonly<{ width: number; height: number }> }>,
  placementById: Map<string, CompiledLayeredAssemblyPlacement>,
) {
  const input = record(value, "assembly.routeGraph");
  exactKeys(input, "assembly.routeGraph", ["startNodeId", "nodes", "edges", "destinations"]);
  if (!Array.isArray(input.nodes) || input.nodes.length < 2 || input.nodes.length > 4096) {
    fail("LAYERED_ASSEMBLY_ROUTE_INVALID", "assembly.routeGraph.nodes must contain 2..4096 nodes.");
  }
  const nodes = input.nodes.map((raw, index) => {
    const label = `assembly.routeGraph.nodes[${index}]`;
    const node = record(raw, label);
    exactKeys(node, label, ["id", "position", "kind", "destinationId"]);
    const kind = stringValue(node.kind, `${label}.kind`, 30) as LayeredAssemblyRouteNodeKind;
    if (!ROUTE_NODE_KINDS.has(kind)) {
      fail("LAYERED_ASSEMBLY_ROUTE_INVALID", `${label}.kind is unsupported.`);
    }
    const destinationId =
      node.destinationId === undefined
        ? undefined
        : idValue(node.destinationId, `${label}.destinationId`);
    if ((kind === "destination") !== (destinationId !== undefined)) {
      fail(
        "LAYERED_ASSEMBLY_ROUTE_INVALID",
        `${label} destination nodes require destinationId and non-destination nodes forbid it.`,
      );
    }
    return freeze({
      id: idValue(node.id, `${label}.id`),
      position: point(
        node.position,
        `${label}.position`,
        district.dimensions.width - 1,
        district.dimensions.height - 1,
      ),
      kind,
      ...(destinationId === undefined ? {} : { destinationId }),
    });
  });
  uniqueIds(nodes.map((node) => node.id), "assembly.routeGraph.nodes IDs");
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const startNodeId = idValue(input.startNodeId, "assembly.routeGraph.startNodeId");
  if (!nodeById.has(startNodeId)) {
    fail("LAYERED_ASSEMBLY_ROUTE_INVALID", "assembly.routeGraph.startNodeId is unknown.");
  }

  if (!Array.isArray(input.edges) || input.edges.length < 1 || input.edges.length > 8192) {
    fail("LAYERED_ASSEMBLY_ROUTE_INVALID", "assembly.routeGraph.edges must contain 1..8192 edges.");
  }
  const canonicalEdges = new Set<string>();
  const edges = input.edges.map((raw, index) => {
    const label = `assembly.routeGraph.edges[${index}]`;
    const edge = record(raw, label);
    exactKeys(edge, label, ["id", "from", "to", "direction", "travelCost"]);
    const from = idValue(edge.from, `${label}.from`);
    const to = idValue(edge.to, `${label}.to`);
    if (!nodeById.has(from) || !nodeById.has(to) || from === to) {
      fail("LAYERED_ASSEMBLY_ROUTE_INVALID", `${label} has unknown or identical endpoints.`);
    }
    const direction = stringValue(edge.direction, `${label}.direction`, 20) as LayeredAssemblyEdgeDirection;
    if (!EDGE_DIRECTIONS.has(direction)) {
      fail("LAYERED_ASSEMBLY_ROUTE_INVALID", `${label}.direction is unsupported.`);
    }
    const canonical =
      direction === "bidirectional"
        ? [from, to].sort().join("<->")
        : `${from}->${to}`;
    if (canonicalEdges.has(canonical)) {
      fail("LAYERED_ASSEMBLY_ROUTE_INVALID", `${label} duplicates route connection ${canonical}.`);
    }
    canonicalEdges.add(canonical);
    return freeze({
      id: idValue(edge.id, `${label}.id`),
      from,
      to,
      direction,
      travelCost: integerValue(edge.travelCost, `${label}.travelCost`, 1, 10000),
    });
  });
  uniqueIds(edges.map((edge) => edge.id), "assembly.routeGraph.edges IDs");

  if (!Array.isArray(input.destinations) || input.destinations.length > 512) {
    fail(
      "LAYERED_ASSEMBLY_ROUTE_INVALID",
      "assembly.routeGraph.destinations must contain at most 512 destinations.",
    );
  }
  const destinations = input.destinations.map((raw, index) => {
    const label = `assembly.routeGraph.destinations[${index}]`;
    const destination = record(raw, label);
    exactKeys(destination, label, [
      "id",
      "label",
      "nodeId",
      "entrance",
      "interactionId",
      "targetScenePath",
      "structurePlacementId",
    ]);
    const id = idValue(destination.id, `${label}.id`);
    const nodeId = idValue(destination.nodeId, `${label}.nodeId`);
    const node = nodeById.get(nodeId);
    if (!node || node.kind !== "destination" || node.destinationId !== id) {
      fail(
        "LAYERED_ASSEMBLY_ROUTE_INVALID",
        `${label} must bind an exact destination node carrying destinationId ${id}.`,
      );
    }
    const structurePlacementId =
      destination.structurePlacementId === undefined
        ? undefined
        : idValue(destination.structurePlacementId, `${label}.structurePlacementId`);
    if (structurePlacementId !== undefined) {
      const placement = placementById.get(structurePlacementId);
      if (!placement || placement.layerRole !== "destination-structure") {
        fail(
          "LAYERED_ASSEMBLY_ROUTE_INVALID",
          `${label}.structurePlacementId must reference a destination-structure placement.`,
        );
      }
      if (placement.routeNodeId !== nodeId) {
        fail(
          "LAYERED_ASSEMBLY_ROUTE_INVALID",
          `${label}.structurePlacementId must be bound to route node ${nodeId}.`,
        );
      }
    }
    const targetScenePath = relativePath(destination.targetScenePath, `${label}.targetScenePath`);
    if (!targetScenePath.endsWith(".tscn")) {
      fail("LAYERED_ASSEMBLY_PATH_INVALID", `${label}.targetScenePath must end with .tscn.`);
    }
    return freeze({
      id,
      label: stringValue(destination.label, `${label}.label`, 200),
      nodeId,
      entrance: point(
        destination.entrance,
        `${label}.entrance`,
        district.dimensions.width - 1,
        district.dimensions.height - 1,
      ),
      interactionId: idValue(destination.interactionId, `${label}.interactionId`),
      targetScenePath,
      ...(structurePlacementId === undefined ? {} : { structurePlacementId }),
    });
  });
  uniqueIds(destinations.map((destination) => destination.id), "assembly.routeGraph.destinations IDs");
  const destinationIds = new Set(destinations.map((destination) => destination.id));
  for (const node of nodes) {
    if (node.destinationId !== undefined && !destinationIds.has(node.destinationId)) {
      fail(
        "LAYERED_ASSEMBLY_ROUTE_INVALID",
        `Destination node ${node.id} has no destination binding for ${node.destinationId}.`,
      );
    }
  }

  const adjacency = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    if (edge.direction === "bidirectional") adjacency.get(edge.to)?.push(edge.from);
  }
  const visited = new Set<string>();
  const queue = [startNodeId];
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  if (visited.size !== nodes.length) {
    const unreachable = nodes.filter((node) => !visited.has(node.id)).map((node) => node.id);
    fail(
      "LAYERED_ASSEMBLY_ROUTE_DISCONNECTED",
      `Route graph is not reachable from ${startNodeId}: ${unreachable.join(", ")}.`,
    );
  }

  return freeze({
    startNodeId,
    nodes,
    edges,
    destinations,
    reachableNodeCount: visited.size,
    totalTravelCost: edges.reduce((sum, edge) => sum + edge.travelCost, 0),
  });
}

export function normalizedOutputs(value: unknown, runtimeRoot: string) {
  const input = record(value, "assembly.outputs");
  exactKeys(input, "assembly.outputs", [
    "manifestPath",
    "routeGraphPath",
    "placementManifestPath",
    "godotScenePath",
    "reviewCompositePath",
  ]);
  const manifestPath = relativePath(input.manifestPath, "assembly.outputs.manifestPath");
  const routeGraphPath = relativePath(input.routeGraphPath, "assembly.outputs.routeGraphPath");
  const placementManifestPath = relativePath(
    input.placementManifestPath,
    "assembly.outputs.placementManifestPath",
  );
  const godotScenePath = relativePath(input.godotScenePath, "assembly.outputs.godotScenePath");
  const reviewCompositePath = relativePath(
    input.reviewCompositePath,
    "assembly.outputs.reviewCompositePath",
  );
  for (const [label, output] of [
    ["manifestPath", manifestPath],
    ["routeGraphPath", routeGraphPath],
    ["placementManifestPath", placementManifestPath],
    ["reviewCompositePath", reviewCompositePath],
  ] as const) {
    if (!output.startsWith(`${runtimeRoot}/`)) {
      fail(
        "LAYERED_ASSEMBLY_PATH_INVALID",
        `assembly.outputs.${label} must remain beneath project.runtimeRoot.`,
      );
    }
  }
  if (!manifestPath.endsWith(".json") || !routeGraphPath.endsWith(".json") || !placementManifestPath.endsWith(".json")) {
    fail("LAYERED_ASSEMBLY_PATH_INVALID", "Assembly manifest outputs must be JSON files.");
  }
  if (!reviewCompositePath.endsWith(".png")) {
    fail("LAYERED_ASSEMBLY_PATH_INVALID", "Assembly review composite must be a PNG path.");
  }
  if (!godotScenePath.endsWith(".tscn")) {
    fail("LAYERED_ASSEMBLY_PATH_INVALID", "Assembly Godot scene path must end with .tscn.");
  }
  uniqueIds(
    [manifestPath, routeGraphPath, placementManifestPath, godotScenePath, reviewCompositePath],
    "assembly output paths",
  );
  return freeze({
    manifestPath,
    routeGraphPath,
    placementManifestPath,
    godotScenePath,
    reviewCompositePath,
  });
}
