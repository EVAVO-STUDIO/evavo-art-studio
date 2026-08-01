import { normalizeJson, type JsonValue } from "@evavo/art-artifacts";

import {
  compileAutomaticSpriteFinalizationWorkflow as compileBaseAutomaticSpriteFinalizationWorkflow,
} from "./automatic-finalization-compiler.js";
import {
  automaticSpriteFinalizationRequestSha256,
} from "./automatic-finalization-validation.js";
import type {
  AutomaticSpriteFinalizationCompileRequestInput,
  CompiledAutomaticSpriteFinalizationWorkflow,
  NormalizedAutomaticSpriteFinalizationRequest,
} from "./automatic-finalization-types.js";
import { compileSpriteSupervisorWorkflow } from "./compiler.js";
import type {
  SpriteSupervisorArtifactSelectorInput,
  SpriteSupervisorCompileRequestInput,
  SpriteSupervisorTaskInput,
} from "./types.js";
import { SpriteSupervisorError } from "./types.js";
import { spriteSupervisorSha256 } from "./validation.js";

interface AdaptiveFinalizationOptions {
  readonly maximumRepairPasses: number;
  readonly transparentBleedRadius: number;
  readonly matteSearchRadius: number;
  readonly matteDistanceThreshold: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== "number" ||
    !Number.isInteger(result) ||
    result < minimum ||
    result > maximum
  ) {
    throw new SpriteSupervisorError(
      "ADAPTIVE_FINALIZATION_OPTION_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function adaptiveOptions(input: unknown): AdaptiveFinalizationOptions {
  const root = isRecord(input) ? input : {};
  const finalization = isRecord(root.finalization) ? root.finalization : {};
  return {
    maximumRepairPasses: integer(
      finalization.maximumDeterministicRepairPasses,
      2,
      0,
      8,
      "finalization.maximumDeterministicRepairPasses",
    ),
    transparentBleedRadius: integer(
      finalization.transparentBleedRadius,
      2,
      0,
      16,
      "finalization.transparentBleedRadius",
    ),
    matteSearchRadius: integer(
      finalization.matteSearchRadius,
      6,
      1,
      32,
      "finalization.matteSearchRadius",
    ),
    matteDistanceThreshold: integer(
      finalization.matteDistanceThreshold,
      72,
      1,
      441,
      "finalization.matteDistanceThreshold",
    ),
  };
}

function record(value: JsonValue): Readonly<Record<string, JsonValue>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SpriteSupervisorError(
      "ADAPTIVE_FINALIZATION_TASK_INVALID",
      "Expected a JSON object while adapting one finalization task.",
    );
  }
  return value as Readonly<Record<string, JsonValue>>;
}

function shortHash(value: string): string {
  return spriteSupervisorSha256(value).slice(0, 16);
}

function labelsWithoutQuality(
  labels: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  const source = labels ?? {};
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key !== "qualityState" && key !== "finalizationReady") {
      output[key] = value;
    }
  }
  return output;
}

function masteredSelector(
  task: SpriteSupervisorTaskInput,
): SpriteSupervisorArtifactSelectorInput {
  const selector = (task.outputBindings ?? []).find(
    (entry) =>
      entry.source === "output-artifact-labels" &&
      entry.labels?.artifactRole === "provider-candidate-alpha-master",
  );
  if (!selector) {
    throw new SpriteSupervisorError(
      "ADAPTIVE_FINALIZATION_MASTER_BINDING_MISSING",
      `Mastering task ${task.id} has no provider-candidate-alpha-master output binding.`,
    );
  }
  return selector;
}

function transformedMasterTask(
  task: SpriteSupervisorTaskInput,
  preAdaptiveRole: string,
): SpriteSupervisorTaskInput {
  const target = masteredSelector(task);
  const payload = record(task.payloadTemplate);
  return {
    ...task,
    payloadTemplate: normalizeJson({
      ...payload,
      deliveryProfileId: "godot-sprite-lossless",
    }),
    outputBindings: (task.outputBindings ?? []).map((selector) =>
      selector === target
        ? {
            ...selector,
            role: preAdaptiveRole,
            labels: labelsWithoutQuality(selector.labels),
          }
        : selector,
    ),
  };
}

function adaptiveTask(
  task: SpriteSupervisorTaskInput,
  selector: SpriteSupervisorArtifactSelectorInput,
  preAdaptiveRole: string,
  options: AdaptiveFinalizationOptions,
): SpriteSupervisorTaskInput {
  const payload = record(task.payloadTemplate);
  const hash = shortHash(task.id);
  const adaptiveId = `auto-adaptive-${hash}`;
  const proofRole = `automatic.adaptive-proof.${hash}`;
  const repairPlanRole = `automatic.adaptive-repair-plan.${hash}`;
  return {
    id: adaptiveId,
    stage: task.stage,
    title: `Adaptively repair and prove ${task.title}`,
    queue: "media",
    kind: "art.candidate.finalize-adaptive",
    dependencyTaskIds: [task.id],
    requiredArtifactRoles: [preAdaptiveRole],
    payloadTemplate: normalizeJson({
      candidateArtifactId: { $artifact: preAdaptiveRole },
      ...(payload.frameId === undefined ? {} : { frameId: payload.frameId }),
      ...(payload.quality === undefined ? {} : { quality: payload.quality }),
      ...(payload.deliveryProfileId === undefined
        ? {}
        : { deliveryProfileId: payload.deliveryProfileId }),
      ...(payload.proofBackgrounds === undefined
        ? {}
        : { proofBackgrounds: payload.proofBackgrounds }),
      ...(payload.resampling === undefined
        ? {}
        : { resampling: payload.resampling }),
      maximumRepairPasses: options.maximumRepairPasses,
      transparentBleedRadius: options.transparentBleedRadius,
      matteSearchRadius: options.matteSearchRadius,
      matteDistanceThreshold: options.matteDistanceThreshold,
    }),
    requiredCapabilities: [
      "media.adaptive-finalize",
      "media.raster",
      "quality.sprite-frame",
      "evidence.bundle",
    ],
    outputBindings: [
      {
        ...selector,
        labels: {
          ...(selector.labels ?? {}),
          qualityState: "passed",
          finalizationReady: "true",
          adaptiveFinalized: "true",
        },
      },
      {
        role: proofRole,
        source: "output-artifact-labels",
        labels: {
          artifactRole: "candidate-hostile-background-proof",
          qualityState: "passed",
        },
        cardinality: "one",
        required: true,
      },
      {
        role: repairPlanRole,
        source: "failure-details",
        pointer: "/repairPlanArtifactId",
        cardinality: "one",
        required: false,
      },
    ],
    maximumAttempts: 1,
    leaseDurationMs: 120_000,
    timeoutMs: 900_000,
    failurePolicy: {
      maxRedrives: 0,
      maxRepairCycles: 0,
      reviewCodePrefixes: ["ADAPTIVE_FINALIZER_"],
      abortCodePrefixes: [
        "ADAPTIVE_FINALIZER_SOURCE_TAMPERED",
        "ADAPTIVE_FINALIZER_INPUT_LINEAGE_MISSING",
        "ADAPTIVE_FINALIZER_ARTIFACT_ID_INVALID",
      ],
      reviewOnUnclassified: true,
    },
  };
}

function transformTasks(
  tasks: readonly SpriteSupervisorTaskInput[],
  options: AdaptiveFinalizationOptions,
): Readonly<{
  tasks: readonly SpriteSupervisorTaskInput[];
  adaptiveTaskIds: ReadonlyMap<string, string>;
}> {
  const adaptiveTaskIds = new Map<string, string>();
  const output: SpriteSupervisorTaskInput[] = [];
  for (const task of tasks) {
    if (task.kind !== "art.candidate.master-alpha") {
      output.push(task);
      continue;
    }
    const selector = masteredSelector(task);
    const preAdaptiveRole = `automatic.pre-adaptive.${shortHash(task.id)}`;
    output.push(transformedMasterTask(task, preAdaptiveRole));
    const adaptive = adaptiveTask(task, selector, preAdaptiveRole, options);
    output.push(adaptive);
    adaptiveTaskIds.set(task.id, adaptive.id);
  }
  return {
    tasks: output.map((task) =>
      task.kind === "art.candidate.finalize-adaptive"
        ? task
        : {
            ...task,
            dependencyTaskIds: (task.dependencyTaskIds ?? []).map(
              (dependency) => adaptiveTaskIds.get(dependency) ?? dependency,
            ),
          },
    ),
    adaptiveTaskIds,
  };
}

function normalizedRequestWithOptions(
  request: NormalizedAutomaticSpriteFinalizationRequest,
  options: AdaptiveFinalizationOptions,
): NormalizedAutomaticSpriteFinalizationRequest {
  const existingMetadata = isRecord(request.metadata) ? request.metadata : {};
  return {
    ...request,
    metadata: normalizeJson({
      ...existingMetadata,
      adaptiveFinalization: options,
    }),
  };
}

export function compileAutomaticSpriteFinalizationWorkflow(
  input: AutomaticSpriteFinalizationCompileRequestInput | unknown,
): CompiledAutomaticSpriteFinalizationWorkflow {
  const base = compileBaseAutomaticSpriteFinalizationWorkflow(input);
  const options = adaptiveOptions(input);
  const transformed = transformTasks(base.supervisorRequest.tasks, options);
  const maximumTasks = base.baseWorkflow.request.policy.maximumTasks;
  if (transformed.tasks.length > maximumTasks) {
    throw new SpriteSupervisorError(
      "ADAPTIVE_FINALIZATION_TASK_LIMIT_EXCEEDED",
      `Adaptive finalization requires ${transformed.tasks.length} tasks; the configured maximum is ${maximumTasks}.`,
      normalizeJson({
        baseTasks: base.supervisorRequest.tasks.length,
        adaptiveTasks: transformed.adaptiveTaskIds.size,
        totalTasks: transformed.tasks.length,
        maximumTasks,
      }),
    );
  }
  const request = normalizedRequestWithOptions(base.request, options);
  const existingMetadata = isRecord(base.supervisorRequest.metadata)
    ? base.supervisorRequest.metadata
    : {};
  const existingPolicy = base.supervisorRequest.policy ?? {};
  const supervisorRequest: SpriteSupervisorCompileRequestInput = {
    ...base.supervisorRequest,
    tasks: transformed.tasks,
    policy: {
      ...existingPolicy,
      maximumTicks: Math.max(
        existingPolicy.maximumTicks ?? 1_000,
        transformed.tasks.length * 8,
      ),
    },
    metadata: normalizeJson({
      ...existingMetadata,
      adaptiveFinalization: {
        ...options,
        adaptiveTaskCount: transformed.adaptiveTaskIds.size,
        qualityThresholdsRelaxed: false,
      },
    }),
  };
  const supervisorWorkflow = compileSpriteSupervisorWorkflow(supervisorRequest);
  return {
    ...base,
    request,
    requestSha256: automaticSpriteFinalizationRequestSha256(request),
    analysis: {
      ...base.analysis,
      base: {
        ...base.analysis.base,
        totals: {
          ...base.analysis.base.totals,
          tasks: transformed.tasks.length,
        },
      },
      finalization: {
        ...base.analysis.finalization,
        candidateFinalizationTasks: transformed.adaptiveTaskIds.size,
      },
    },
    supervisorRequest,
    supervisorWorkflow,
  };
}
