import { resolveArtDirectionOutputProfile } from "./output-profiles.js";
import {
  validateArtDirectionCompileRequest as validateBaseArtDirectionCompileRequest,
} from "./strict-validation-base.js";
import type {
  ArtDirectionGodotTarget,
  NormalizedArtDirectionCompileRequest,
} from "./types.js";
import { ArtDirectionError } from "./types.js";

function selectedGodotTargets(
  request: NormalizedArtDirectionCompileRequest,
): ReadonlySet<ArtDirectionGodotTarget> {
  const targets = new Set<ArtDirectionGodotTarget>();
  for (const outputId of request.outputProfileIds) {
    const target = resolveArtDirectionOutputProfile(outputId).target;
    if (target === "godot-4.6.2" || target === "godot-4.7.1") {
      targets.add(target);
    }
  }
  return targets;
}

function assertGodotTargetCompatibility(
  request: NormalizedArtDirectionCompileRequest,
): void {
  const targets = selectedGodotTargets(request);
  if (targets.size > 1) {
    throw new ArtDirectionError(
      "ART_DIRECTION_GODOT_TARGET_MIXED",
      "One art-direction contract may not mix Godot 4.6.2 and Godot 4.7.1 output profiles.",
      { targets: [...targets], outputProfileIds: request.outputProfileIds },
    );
  }

  if (
    targets.has("godot-4.7.1") &&
    request.project.engineVersion !== "4.7.1"
  ) {
    throw new ArtDirectionError(
      "ART_DIRECTION_GODOT_VERSION_MISMATCH",
      "The Godot 4.7.1 output profile requires project.engineVersion to be exactly 4.7.1.",
      {
        engine: request.project.engine,
        engineVersion: request.project.engineVersion,
        outputProfileIds: request.outputProfileIds,
      },
    );
  }
}

export function validateArtDirectionCompileRequest(
  input: unknown,
): NormalizedArtDirectionCompileRequest {
  const request = validateBaseArtDirectionCompileRequest(input);
  assertGodotTargetCompatibility(request);
  return request;
}
