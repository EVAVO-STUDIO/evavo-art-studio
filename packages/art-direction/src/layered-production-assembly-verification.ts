import type {
  CompiledLayeredProductionPlan,
} from "./layered-production-types.js";
import {
  fail,
  relativePath,
  sha256,
} from "./layered-production-internal.js";
import { verifyLayeredProductionPlan } from "./layered-production-plan.js";
import type {
  CompiledLayeredAssemblyManifest,
} from "./layered-production-assembly-types.js";
import {
  LAYERED_ASSEMBLY_MANIFEST_KIND,
  LAYERED_ASSEMBLY_PROTOCOL_VERSION,
} from "./layered-production-assembly-types.js";
import {
  ASSEMBLY_SCOPES,
  SHA256_PATTERN,
  layerMap,
  uniqueIds,
  unitMap,
} from "./layered-production-assembly-internal.js";
import { verifyManifestAssemblyContent } from "./layered-production-assembly-verification-content.js";

export function verifyLayeredAssemblyManifest(
  manifest: CompiledLayeredAssemblyManifest,
  plan?: CompiledLayeredProductionPlan,
): true {
  if (
    manifest.kind !== LAYERED_ASSEMBLY_MANIFEST_KIND ||
    manifest.protocolVersion !== LAYERED_ASSEMBLY_PROTOCOL_VERSION ||
    !SHA256_PATTERN.test(manifest.manifestSha256)
  ) {
    fail("LAYERED_ASSEMBLY_MANIFEST_INVALID", "Layered assembly manifest identity is invalid.");
  }
  const { manifestSha256, ...withoutHash } = manifest;
  if (sha256(withoutHash) !== manifestSha256) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Layered assembly manifest hash does not match its canonical payload.",
    );
  }
  if (
    !SHA256_PATTERN.test(manifest.requestSha256) ||
    !SHA256_PATTERN.test(manifest.plan.planSha256) ||
    !SHA256_PATTERN.test(manifest.plan.styleFingerprintSha256)
  ) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Layered assembly request or plan hashes are invalid.",
    );
  }
  if (!ASSEMBLY_SCOPES.has(manifest.scope)) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Layered assembly manifest scope is invalid.",
    );
  }
  const expectedRuntimeReady = manifest.scope === "runtime-candidate";
  if (
    manifest.readiness.runtimeReady !== expectedRuntimeReady ||
    manifest.readiness.candidateOnly === expectedRuntimeReady ||
    manifest.readiness.reviewCompositeIsRuntimeSource !== false
  ) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Layered assembly readiness does not match its declared scope.",
    );
  }
  if (
    (manifest.scope === "style-proof-review" && manifest.readiness.blockers.length < 1) ||
    (manifest.scope === "runtime-candidate" && manifest.readiness.blockers.length !== 0)
  ) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Layered assembly readiness blockers do not match the declared scope.",
    );
  }
  const sourceUnitIds = manifest.sources.map((source) => source.unitId);
  const sourceArtifactIds = manifest.sources.map((source) => source.artifactId);
  uniqueIds(sourceUnitIds, "manifest source unit IDs");
  uniqueIds(sourceArtifactIds, "manifest source artifact IDs");
  for (const source of manifest.sources) {
    if (
      !SHA256_PATTERN.test(source.sha256) ||
      source.artifactId !== `artifact_${source.sha256}` ||
      (manifest.scope === "style-proof-review" &&
        (source.status !== "candidate" ||
          source.approvalReceiptSha256 !== undefined ||
          source.approvalReceiptArtifactId !== undefined)) ||
      (manifest.scope === "runtime-candidate" &&
        (source.status !== "approved" ||
          source.approvalReceiptSha256 === undefined ||
          !SHA256_PATTERN.test(source.approvalReceiptSha256) ||
          source.approvalReceiptArtifactId !==
            `artifact_${source.approvalReceiptSha256}`))
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        `Layered assembly source ${source.unitId} has invalid retained evidence.`,
      );
    }
  }
  if (
    manifest.scope === "runtime-candidate" &&
    manifest.animationSets.some(
      (set) =>
        set.completeness !== "complete" ||
        set.clips.some((clip) => clip.complete !== true),
    )
  ) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Runtime-candidate assembly contains an incomplete animation set.",
    );
  }
  verifyManifestAssemblyContent(manifest);
  const placements = manifest.layers.flatMap((layer) => layer.placements);
  const expectedTotals = {
    sources: manifest.sources.length,
    approvedSources: manifest.sources.filter((source) => source.status === "approved").length,
    candidateSources: manifest.sources.filter((source) => source.status === "candidate").length,
    animationSets: manifest.animationSets.length,
    placements: placements.length,
    dynamicPlacements: placements.filter((placement) => placement.mode === "dynamic").length,
    routeNodes: manifest.routeGraph.nodes.length,
    routeEdges: manifest.routeGraph.edges.length,
    destinations: manifest.routeGraph.destinations.length,
    occlusionGroups: manifest.occlusionGroups.length,
  };
  if (JSON.stringify(manifest.totals) !== JSON.stringify(expectedTotals)) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Layered assembly totals do not match the retained manifest content.",
    );
  }
  if (Object.values(manifest.authority).some((value) => value !== false && value !== true)) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Layered assembly authority contains an unsupported value.",
    );
  }
  if (
    manifest.authority.planningOnly !== true ||
    Object.entries(manifest.authority).some(
      ([key, value]) => key !== "planningOnly" && value !== false,
    )
  ) {
    fail(
      "LAYERED_ASSEMBLY_MANIFEST_INVALID",
      "Layered assembly authority must remain planning-only with every execution capability false.",
    );
  }
  if (plan) {
    verifyLayeredProductionPlan(plan);
    const planUnits = unitMap(plan);
    const planLayers = layerMap(plan);
    if (
      manifest.district.dimensions.width !== plan.canvas.width ||
      manifest.district.dimensions.height !== plan.canvas.height ||
      manifest.district.worldOrigin.x + manifest.district.dimensions.width >
        plan.canvas.worldWidth ||
      manifest.district.worldOrigin.y + manifest.district.dimensions.height >
        plan.canvas.worldHeight
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        "Layered assembly district does not fit the supplied production-plan world.",
      );
    }
    for (const source of manifest.sources) {
      const unit = planUnits.get(source.unitId);
      if (
        !unit ||
        source.layerId !== unit.layerId ||
        source.layerRole !== unit.layerRole ||
        source.width !== unit.dimensions.width ||
        source.height !== unit.dimensions.height ||
        source.alpha !== unit.alpha
      ) {
        fail(
          "LAYERED_ASSEMBLY_MANIFEST_INVALID",
          `Layered assembly source ${source.unitId} does not match the supplied production plan.`,
        );
      }
    }
    for (const layer of manifest.layers) {
      const planned = planLayers.get(layer.id);
      if (
        !planned ||
        layer.role !== planned.role ||
        layer.zOrder !== planned.zOrder ||
        layer.alpha !== planned.alpha ||
        layer.assemblyMode !== planned.assemblyMode ||
        layer.ySortMode !== planned.ySortMode
      ) {
        fail(
          "LAYERED_ASSEMBLY_MANIFEST_INVALID",
          `Layered assembly layer ${layer.id} does not match the supplied production plan.`,
        );
      }
    }
    if (
      manifest.plan.planId !== plan.planId ||
      manifest.plan.planSha256 !== plan.planSha256 ||
      manifest.plan.styleFingerprintSha256 !== plan.styleFingerprintSha256 ||
      manifest.plan.styleProofStatus !== plan.styleProof.status
    ) {
      fail(
        "LAYERED_ASSEMBLY_MANIFEST_INVALID",
        "Layered assembly manifest is not bound to the supplied production plan.",
      );
    }
    for (const [name, output] of Object.entries(manifest.outputs)) {
      const canonical = relativePath(output, `manifest.outputs.${name}`);
      if (
        name !== "godotScenePath" &&
        !canonical.startsWith(`${plan.project.runtimeRoot}/`)
      ) {
        fail(
          "LAYERED_ASSEMBLY_MANIFEST_INVALID",
          `Layered assembly output ${name} escapes the supplied runtime root.`,
        );
      }
    }
  }
  return true;
}
