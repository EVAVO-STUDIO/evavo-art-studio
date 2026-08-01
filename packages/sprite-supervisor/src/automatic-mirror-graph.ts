import { normalizeJson } from "@evavo/art-artifacts";

import type {
  AutomaticSpriteWorkflowAnalysis,
  CompiledAutomaticSpriteWorkflow,
} from "./automatic-types.js";
import {
  FAMILY_MIRROR_PROOF_ROLE,
  MIRROR_OPERATION,
  createMirrorDrafts,
  createMirrorTask,
} from "./automatic-mirror-drafts.js";
import {
  transformMirrorFamilyTask,
  updatedMirrorAnalysis,
} from "./automatic-mirror-family.js";
import { compileSpriteSupervisorWorkflow } from "./compiler.js";
import type { SpriteSupervisorCompileRequestInput } from "./types.js";
import { SpriteSupervisorError } from "./types.js";

export { FAMILY_MIRROR_PROOF_ROLE } from "./automatic-mirror-drafts.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function applyDeterministicMirroring(
  base: CompiledAutomaticSpriteWorkflow,
  sourceSupervisorRequest: SpriteSupervisorCompileRequestInput,
  requireFinalHumanApproval: boolean,
): Readonly<{
  analysis: AutomaticSpriteWorkflowAnalysis;
  supervisorRequest: SpriteSupervisorCompileRequestInput;
  supervisorWorkflow: CompiledAutomaticSpriteWorkflow["supervisorWorkflow"];
}> {
  const drafts = createMirrorDrafts(base, sourceSupervisorRequest.tasks);
  if (!drafts.length) {
    return {
      analysis: base.analysis,
      supervisorRequest: sourceSupervisorRequest,
      supervisorWorkflow: compileSpriteSupervisorWorkflow(
        sourceSupervisorRequest,
      ),
    };
  }
  const mirrorTasks = drafts.map((draft) => createMirrorTask(base, draft));
  const familyTask = sourceSupervisorRequest.tasks.find(
    (task) => task.kind === "sprite.family.verify",
  );
  if (!familyTask) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_MIRROR_FAMILY_TASK_MISSING",
      "The workflow has no family-verification task to extend.",
    );
  }
  const tasks = [
    ...sourceSupervisorRequest.tasks.filter(
      (task) => task.id !== familyTask.id,
    ),
    ...mirrorTasks,
    transformMirrorFamilyTask(base, familyTask, drafts),
  ];
  if (tasks.length > base.request.policy.maximumTasks) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_MIRROR_TASK_LIMIT_EXCEEDED",
      `Deterministic mirroring requires ${tasks.length} tasks; the configured maximum is ${base.request.policy.maximumTasks}.`,
      normalizeJson({
        baseTasks: sourceSupervisorRequest.tasks.length,
        mirrorTasks: mirrorTasks.length,
        totalTasks: tasks.length,
        maximumTasks: base.request.policy.maximumTasks,
      }),
    );
  }
  const analysis = updatedMirrorAnalysis(base, drafts);
  const existingMetadata = isRecord(sourceSupervisorRequest.metadata)
    ? sourceSupervisorRequest.metadata
    : {};
  const supervisorRequest: SpriteSupervisorCompileRequestInput = {
    ...sourceSupervisorRequest,
    tasks,
    policy: {
      ...(sourceSupervisorRequest.policy ?? {}),
      maximumTicks: Math.max(
        sourceSupervisorRequest.policy?.maximumTicks ?? 1_000,
        tasks.length * 8,
      ),
      requireFinalHumanApproval:
        requireFinalHumanApproval ||
        analysis.disposition === "review-required",
      requiredReleaseArtifactRoles: [
        ...new Set([
          ...(sourceSupervisorRequest.policy?.requiredReleaseArtifactRoles ?? []),
          FAMILY_MIRROR_PROOF_ROLE,
        ]),
      ],
    },
    metadata: normalizeJson({
      ...existingMetadata,
      deterministicMirroring: {
        operation: MIRROR_OPERATION,
        mirrorTaskCount: drafts.length,
        derivedDirectionCount: analysis.totals.derivedDirections ?? 0,
        derivedFrameCount: analysis.totals.derivedFrames ?? 0,
        familyProofRole: FAMILY_MIRROR_PROOF_ROLE,
        qualityThresholdsRelaxed: false,
      },
    }),
  };
  return {
    analysis,
    supervisorRequest,
    supervisorWorkflow: compileSpriteSupervisorWorkflow(supervisorRequest),
  };
}
