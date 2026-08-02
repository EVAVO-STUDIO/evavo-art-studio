import type { ArtifactId } from "@evavo/art-artifacts";

import {
  SpriteSupervisorError,
  type NormalizedSpriteSupervisorCompileRequest,
  type SpriteSupervisorCompileRequestInput,
} from "./types.js";
import {
  spriteSupervisorRequestSha256,
  spriteSupervisorSha256,
  validateSpriteSupervisorCompileRequest as validateCoreRequest,
} from "./validation-core.js";

export {
  spriteSupervisorRequestSha256,
  spriteSupervisorSha256,
};

const ADAPTIVE_FINALIZER_KIND = "art.candidate.finalize-adaptive";
const CORE_MEDIA_KIND = "art.candidate.master-alpha";
const VALIDATION_ONLY_ARTIFACT = `artifact_${"0".repeat(64)}` as ArtifactId;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roleStrings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function omitNormalizedLabelRootPointer(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.outputBindings)) return value;
  const outputBindings = value.outputBindings.map((candidate) => {
    if (
      !isRecord(candidate) ||
      candidate.source !== "output-artifact-labels" ||
      candidate.pointer !== ""
    ) {
      return candidate;
    }
    const { pointer: _pointer, ...outputBinding } = candidate;
    return outputBinding;
  });
  return { ...value, outputBindings };
}

function prepareCoreInput(input: unknown): Readonly<{
  input: unknown;
  adaptiveFinalizerTaskIndexes: ReadonlySet<number>;
  injectedDormantRoles: ReadonlySet<string>;
}> {
  if (!isRecord(input) || !Array.isArray(input.tasks)) {
    return {
      input,
      adaptiveFinalizerTaskIndexes: new Set<number>(),
      injectedDormantRoles: new Set<string>(),
    };
  }

  const adaptiveFinalizerTaskIndexes = new Set<number>();
  const transformedTasks = input.tasks.map((candidate, index) => {
    const normalizedCandidate = omitNormalizedLabelRootPointer(candidate);
    if (
      !isRecord(normalizedCandidate) ||
      normalizedCandidate.kind !== ADAPTIVE_FINALIZER_KIND
    ) {
      return normalizedCandidate;
    }
    adaptiveFinalizerTaskIndexes.add(index);
    return { ...normalizedCandidate, kind: CORE_MEDIA_KIND };
  });

  const availableRoles = new Set<string>();
  if (Array.isArray(input.initialArtifactBindings)) {
    for (const candidate of input.initialArtifactBindings) {
      if (isRecord(candidate) && typeof candidate.role === "string") {
        availableRoles.add(candidate.role);
      }
    }
  }
  for (const candidate of input.tasks) {
    if (!isRecord(candidate) || !Array.isArray(candidate.outputBindings)) continue;
    for (const output of candidate.outputBindings) {
      if (isRecord(output) && typeof output.role === "string") {
        availableRoles.add(output.role);
      }
    }
  }

  const activeRequiredRoles = new Set<string>();
  if (isRecord(input.policy)) {
    for (const role of roleStrings(input.policy.requiredReleaseArtifactRoles)) {
      activeRequiredRoles.add(role);
    }
  }
  for (const candidate of input.tasks) {
    if (!isRecord(candidate) || candidate.triggeredByFailureOfTaskId !== undefined) {
      continue;
    }
    for (const role of roleStrings(candidate.requiredArtifactRoles)) {
      activeRequiredRoles.add(role);
    }
  }

  const injectedDormantRoles = new Set<string>();
  for (const candidate of input.tasks) {
    if (!isRecord(candidate) || candidate.triggeredByFailureOfTaskId === undefined) {
      continue;
    }
    for (const role of roleStrings(candidate.requiredArtifactRoles)) {
      if (!availableRoles.has(role) && !activeRequiredRoles.has(role)) {
        injectedDormantRoles.add(role);
      }
    }
  }

  if (!injectedDormantRoles.size) {
    return {
      input: { ...input, tasks: transformedTasks },
      adaptiveFinalizerTaskIndexes,
      injectedDormantRoles,
    };
  }
  if (
    input.initialArtifactBindings !== undefined &&
    !Array.isArray(input.initialArtifactBindings)
  ) {
    return {
      input: { ...input, tasks: transformedTasks },
      adaptiveFinalizerTaskIndexes,
      injectedDormantRoles: new Set<string>(),
    };
  }

  const existingBindings = Array.isArray(input.initialArtifactBindings)
    ? input.initialArtifactBindings
    : [];
  const validationBindings = [...injectedDormantRoles]
    .sort()
    .map((role) => ({ role, artifactIds: [VALIDATION_ONLY_ARTIFACT] }));
  return {
    input: {
      ...input,
      tasks: transformedTasks,
      initialArtifactBindings: [...existingBindings, ...validationBindings],
    },
    adaptiveFinalizerTaskIndexes,
    injectedDormantRoles,
  };
}

/**
 * Extends the strict core validator only for runtime contracts already governed
 * elsewhere in this package:
 *
 * - adaptive finalization is an explicitly registered media-queue child kind;
 * - failure-triggered repair tasks may depend on evidence that is bound only
 *   after the source task fails.
 *
 * The core validator still performs all secret, bypass, shape, task, plan,
 * selector, dependency, release-role and hash validation. Temporary bindings
 * exist only while proving dormant task structure and are removed from the
 * normalized request before hashing or execution.
 */
export function validateSpriteSupervisorCompileRequest(
  input: SpriteSupervisorCompileRequestInput | unknown,
): NormalizedSpriteSupervisorCompileRequest {
  const prepared = prepareCoreInput(input);
  const normalized = validateCoreRequest(prepared.input);
  const tasks = normalized.tasks.map((task, index) => {
    if (!prepared.adaptiveFinalizerTaskIndexes.has(index)) return task;
    if (task.queue !== "media") {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_QUEUE_MISMATCH",
        `Task ${task.id} uses queue ${task.queue}; ${ADAPTIVE_FINALIZER_KIND} must use media.`,
        {
          taskId: task.id,
          kind: ADAPTIVE_FINALIZER_KIND,
          suppliedQueue: task.queue,
          expectedQueue: "media",
        },
      );
    }
    return { ...task, kind: ADAPTIVE_FINALIZER_KIND };
  });
  const initialArtifactBindings = normalized.initialArtifactBindings.filter(
    (binding) => !prepared.injectedDormantRoles.has(binding.role),
  );
  return {
    ...normalized,
    tasks,
    initialArtifactBindings,
  };
}
