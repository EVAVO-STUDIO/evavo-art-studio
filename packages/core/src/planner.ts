import {
  ART_STUDIO_PROTOCOL_VERSION,
  assertArtBrief,
  type DeliverableSpec,
  type ProductionPlan,
  type QualityGateSpec,
  type WorkItem,
} from "@evavo/art-contracts";
import { compileSpriteContinuityBlueprints } from "./sprite-continuity.js";
import { genericWorkItemsFor, hash, slug } from "./planner-common.js";
import { deliverablesFor } from "./planner-deliverables.js";
import { qualityGatesFor } from "./planner-quality.js";
import { spriteWorkItemsFor } from "./planner-sprite-work.js";
import { plannerWarnings } from "./planner-warnings.js";

export function createProductionPlan(input: unknown): ProductionPlan {
  const brief = assertArtBrief(input);
  const briefHash = hash(brief);
  const spriteBlueprints = compileSpriteContinuityBlueprints(brief);
  const blueprintByInstance = new Map(
    spriteBlueprints.map((blueprint) => [blueprint.assetInstanceId, blueprint] as const),
  );
  const workItems: WorkItem[] = [];
  const deliverables: DeliverableSpec[] = [];
  const qualityGates: Record<string, readonly QualityGateSpec[]> = {};

  for (const asset of brief.assets) {
    for (let index = 0; index < asset.quantity; index += 1) {
      const instance = `${slug(asset.id)}-${String(index + 1).padStart(2, "0")}`;
      const blueprint = blueprintByInstance.get(instance);
      workItems.push(
        ...(blueprint
          ? spriteWorkItemsFor(asset, blueprint, brief)
          : genericWorkItemsFor(asset, index, brief)),
      );
      deliverables.push(...deliverablesFor(asset, index, brief, blueprint));
      qualityGates[instance] = qualityGatesFor(asset, brief, blueprint);
    }
  }

  return {
    schemaVersion: "1.0",
    protocolVersion: ART_STUDIO_PROTOCOL_VERSION,
    id: `plan_${briefHash.slice(0, 16)}`,
    projectName: brief.project.projectName,
    createdFromBriefHash: briefHash,
    autonomy: brief.autonomy,
    spriteBlueprints,
    workItems,
    qualityGates,
    deliverables,
    warnings: plannerWarnings(brief, spriteBlueprints),
  };
}
