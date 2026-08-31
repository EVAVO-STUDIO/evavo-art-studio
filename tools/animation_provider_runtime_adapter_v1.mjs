import {
  compileProviderCandidateRuntimeContract,
} from "../packages/providers/dist/index.js";
import {
  assertAnimationProductionProfileIntegrity,
} from "./animation_production_profile_v1.mjs";

export const ANIMATION_PROVIDER_RUNTIME_ADAPTER_VERSION =
  "evavo.animation-provider-runtime-adapter.v1";
export const ANIMATION_PROVIDER_RUNTIME_BATCH_VERSION =
  "evavo.animation-provider-runtime-batch.v1";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code, String(value));
  return value;
}

function artifactId(value, code) {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) fail(code, String(value));
  return value;
}

function integer(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code, String(value));
  return value;
}

function falseAuthority() {
  return Object.freeze({
    providerExecution: false,
    automaticCreativeApproval: false,
    artifactPromotion: false,
    targetRepositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    publication: false,
  });
}

function drawingMap(profile) {
  return new Map(profile.drawings.map((drawing) => [drawing.id, drawing]));
}

function artifactMap(value = {}) {
  const source = object(value, "ANIMATION_PROVIDER_ARTIFACT_MAP_INVALID");
  const result = new Map();
  for (const [drawingId, id] of Object.entries(source)) {
    safeId(drawingId, "ANIMATION_PROVIDER_ARTIFACT_DRAWING_ID_INVALID");
    result.set(drawingId, artifactId(id, "ANIMATION_PROVIDER_ARTIFACT_ID_INVALID"));
  }
  return result;
}

function reference(artifactIdValue, role, note, strength = 1) {
  return Object.freeze({
    artifactId: artifactIdValue,
    role,
    strength,
    required: true,
    note,
  });
}

function dependencyReferences(profile, drawing, acceptedArtifacts) {
  const references = [
    reference(
      artifactId(profile.request.subject.identityReferenceArtifactId, "ANIMATION_PROVIDER_IDENTITY_ARTIFACT_INVALID"),
      "canonical-identity",
      "Immutable approved EVA/character identity master. Identity, silhouette and design must not drift.",
      1.25,
    ),
  ];
  const dependencies = drawing.dependencyDrawingIds ?? [];
  for (let index = 0; index < dependencies.length; index += 1) {
    const dependencyDrawingId = dependencies[index];
    const resolved = acceptedArtifacts.get(dependencyDrawingId);
    if (!resolved) {
      return Object.freeze({
        ready: false,
        missingDrawingIds: Object.freeze(dependencies.filter((id) => !acceptedArtifacts.has(id))),
        references: Object.freeze(references),
      });
    }
    references.push(reference(
      resolved,
      index === 0 ? "previous-key-pose" : "next-key-pose",
      index === 0
        ? "Accepted left/bounding authored key. Match its identity, registration, contact and local continuity."
        : "Accepted right/bounding authored key. Preserve the intended arc and arrive without identity drift.",
      1.1,
    ));
  }
  return Object.freeze({
    ready: true,
    missingDrawingIds: Object.freeze([]),
    references: Object.freeze(references),
  });
}

function optionalPoseReference(options, drawingId) {
  const value = options.poseControlArtifacts?.[drawingId];
  if (value == null) return null;
  return reference(
    artifactId(value, "ANIMATION_PROVIDER_POSE_CONTROL_ARTIFACT_INVALID"),
    "pose-control",
    "Provider-neutral authored pose/control artifact for this exact drawing phase; appearance remains governed by the canonical identity references.",
    1,
  );
}

function providerPhase(drawing) {
  return drawing.generationClass === "key-pose" ? "key-pose" : "in-between";
}

function providerStyle(profile) {
  const request = profile.request;
  return Object.freeze({
    styleName: request.style.styleId,
    intent: request.style.lineTreatment,
    mustHave: Object.freeze([
      ...request.style.shapeLanguage,
      ...request.style.antiGenericTraits,
      request.subject.anatomyRule,
    ]),
    mustAvoid: Object.freeze([...request.style.exclusions]),
    identityLocks: Object.freeze([
      ...request.subject.silhouetteAnchors,
      ...request.subject.costumeAnchors,
      ...request.subject.asymmetricVisualAnchors,
    ]),
    palette: Object.freeze([request.style.paletteLockId]),
    lineTreatment: Object.freeze([request.style.lineTreatment]),
    materials: Object.freeze([]),
    cameraRules: Object.freeze([
      request.camera.framing,
      profile.perspectiveGuidance.rootPivotPolicy,
      ...profile.perspectiveGuidance.rules,
    ]),
    compositionRules: Object.freeze([
      `Keep root offset at x=${profile.request.delivery.pivot.x}, y=${profile.request.delivery.pivot.y}.`,
      "Preserve the exact locked canvas and registration; do not crop, zoom or introduce scenery.",
    ]),
    eraRules: Object.freeze([]),
  });
}

function providerShot(profile, drawing) {
  return Object.freeze({
    subject: profile.request.subject.subjectId,
    action: drawing.poseIntent,
    direction: profile.request.direction,
    include: Object.freeze([
      `authored role: ${drawing.role}`,
      `contact anchor: ${drawing.contactAnchor}`,
      `ground contact required: ${drawing.groundContactRequired}`,
      `expected root offset x=${drawing.expectedRootOffset.x}, y=${drawing.expectedRootOffset.y}`,
      `performance intent: ${profile.request.performance.intent}`,
      `performance weight: ${profile.request.performance.weight}`,
    ]),
    exclude: Object.freeze([
      "unrequested camera motion",
      "new props, costume changes, background elements or duplicated anatomy",
      "whole-body phoneme animation or generic bobbing",
    ]),
    separateAssets: Object.freeze([]),
    framing: Object.freeze([
      profile.request.camera.framing,
      `locked ${profile.request.camera.projection} ${profile.request.camera.perspective} camera`,
    ]),
  });
}

function providerRequest(profile, batch, drawing, references, options) {
  const attempt = integer(options.attempt ?? 1, 1, profile.iterationPolicy.maximumAttemptsPerDrawing, "ANIMATION_PROVIDER_ATTEMPT_INVALID");
  const candidateCount = Math.min(
    batch.maximumCandidatesPerDrawing,
    integer(options.maximumCandidateCount ?? batch.maximumCandidatesPerDrawing, 1, 8, "ANIMATION_PROVIDER_CANDIDATE_COUNT_INVALID"),
  );
  const selection = object(options.selection ?? {}, "ANIMATION_PROVIDER_SELECTION_INVALID");
  return Object.freeze({
    schemaVersion: "1.0",
    requestId: `${drawing.id}:attempt-${attempt}`,
    operation: "generate",
    assetKind: "sprite-frame",
    continuityPhase: providerPhase(drawing),
    assetId: drawing.id,
    candidateFamilyId: `${profile.profileId}:${drawing.poseId}:attempt-${attempt}`,
    frameId: drawing.id,
    creativeIntent: `${drawing.poseIntent} ${profile.request.performance.intent}`,
    negativeIntent: "Do not redesign the character, camera, costume, palette, anatomy, proportions, root registration or approved neighbouring keys.",
    style: providerStyle(profile),
    shot: providerShot(profile, drawing),
    target: Object.freeze({
      width: profile.request.delivery.canvas.width,
      height: profile.request.delivery.canvas.height,
      transparency: profile.request.delivery.alphaRequired ? "required" : "preferred",
      outputFormat: "png",
    }),
    background: Object.freeze({ strategy: "native-alpha" }),
    quality: "high",
    candidateCount,
    ...(Number.isSafeInteger(options.seedBase)
      ? { seed: (options.seedBase + drawing.ordinal + attempt * 1009) >>> 0 }
      : {}),
    references: Object.freeze(references),
    selection: Object.freeze({
      ...(selection.preferredAdapterId ? { preferredAdapterId: safeId(selection.preferredAdapterId, "ANIMATION_PROVIDER_ADAPTER_ID_INVALID") } : {}),
      ...(selection.preferredModel ? { preferredModel: String(selection.preferredModel) } : {}),
      allowedAdapterIds: Object.freeze(Array.isArray(selection.allowedAdapterIds)
        ? selection.allowedAdapterIds.map((id) => safeId(id, "ANIMATION_PROVIDER_ADAPTER_ID_INVALID"))
        : []),
      allowFallback: selection.allowFallback !== false,
      requireSeed: Boolean(selection.requireSeed),
    }),
    metadata: Object.freeze({
      schema: ANIMATION_PROVIDER_RUNTIME_ADAPTER_VERSION,
      profileId: profile.profileId,
      profileContentDigest: profile.contentDigest,
      generationBatchId: batch.id,
      drawingId: drawing.id,
      drawingOrdinal: drawing.ordinal,
      poseId: drawing.poseId,
      generationClass: drawing.generationClass,
      exposureStartFrame: drawing.exposureStartFrame,
      exposureEndFrame: drawing.exposureEndFrame,
      exposureFrames: drawing.exposureFrames,
      attempt,
    }),
  });
}

export function compileAnimationProviderRuntimeBatch(profileValue, generationBatchIdValue, options = {}) {
  const profile = object(profileValue, "ANIMATION_PROVIDER_PROFILE_INVALID");
  assertAnimationProductionProfileIntegrity(profile);
  const generationBatchId = safeId(generationBatchIdValue, "ANIMATION_PROVIDER_BATCH_ID_INVALID");
  const batch = profile.generationBatches.find((entry) => entry.id === generationBatchId);
  if (!batch) fail("ANIMATION_PROVIDER_BATCH_UNKNOWN", generationBatchId);
  const byDrawing = drawingMap(profile);
  const acceptedArtifacts = artifactMap(options.acceptedDrawingArtifacts ?? {});
  const jobs = [];
  const blocked = [];
  for (const drawingId of batch.drawingIds) {
    const drawing = byDrawing.get(drawingId);
    if (!drawing) fail("ANIMATION_PROVIDER_DRAWING_UNKNOWN", drawingId);
    const dependency = dependencyReferences(profile, drawing, acceptedArtifacts);
    if (!dependency.ready) {
      blocked.push(Object.freeze({
        drawingId,
        code: "ANIMATION_PROVIDER_DEPENDENCY_ARTIFACT_MISSING",
        missingDrawingIds: dependency.missingDrawingIds,
        remediation: "Accept and content-address the bounding authored dependency drawings before compiling this provider runtime job.",
      }));
      continue;
    }
    const poseReference = optionalPoseReference(options, drawingId);
    const references = poseReference
      ? [...dependency.references, poseReference]
      : [...dependency.references];
    try {
      const request = providerRequest(profile, batch, drawing, references, options);
      const contract = compileProviderCandidateRuntimeContract(request);
      jobs.push(Object.freeze({
        drawingId,
        generationClass: drawing.generationClass,
        request,
        contract,
      }));
    } catch (error) {
      blocked.push(Object.freeze({
        drawingId,
        code: "ANIMATION_PROVIDER_CONTRACT_INVALID",
        missingDrawingIds: Object.freeze([]),
        remediation: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  return Object.freeze({
    schema: ANIMATION_PROVIDER_RUNTIME_BATCH_VERSION,
    adapterVersion: ANIMATION_PROVIDER_RUNTIME_ADAPTER_VERSION,
    profileId: profile.profileId,
    profileContentDigest: profile.contentDigest,
    generationBatchId: batch.id,
    phase: batch.phase,
    status: jobs.length === 0
      ? blocked.length > 0 ? "blocked" : "idle"
      : blocked.length > 0 ? "partially-ready" : "ready",
    jobs: Object.freeze(jobs),
    blocked: Object.freeze(blocked),
    counts: Object.freeze({
      requested: batch.drawingIds.length,
      ready: jobs.length,
      blocked: blocked.length,
    }),
    authority: falseAuthority(),
  });
}
