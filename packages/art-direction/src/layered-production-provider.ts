import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProviderRequest,
  LayeredProviderCandidateRequest,
  LayeredProviderReferenceInput,
  LayeredProviderReferenceRole,
} from "./layered-production-types.js";
import {
  LAYERED_PRODUCTION_PLAN_KIND,
  LAYERED_PRODUCTION_PROTOCOL_VERSION,
  LAYERED_PRODUCTION_REQUEST_KIND,
} from "./layered-production-types.js";
import { fail, freeze, numberValue, sha256, stringValue } from "./layered-production-internal.js";
import { getLayeredProductionUnit, verifyLayeredProductionPlan } from "./layered-production-plan.js";

const PROVIDER_REFERENCE_ROLES = new Set<LayeredProviderReferenceRole>([
  "canonical-identity",
  "direction-master",
  "previous-key-pose",
  "next-key-pose",
  "palette-reference",
  "line-reference",
  "material-reference",
  "layer-context",
]);

function providerSafeId(value: string, prefix: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) return value;
  return `${prefix}-${sha256(value).slice(0, 40)}`;
}

function providerList(values: readonly string[], label: string): readonly string[] {
  const result = [...new Set(values)];
  if (result.length > 64) fail("LAYERED_PRODUCTION_PROVIDER_REQUEST_INVALID", `${label} exceeds the provider maximum of 64 entries.`);
  for (const [index, value] of result.entries()) {
    if (value.length > 1024) fail("LAYERED_PRODUCTION_PROVIDER_REQUEST_INVALID", `${label}[${index}] exceeds 1024 characters.`);
  }
  return result;
}

function providerReferences(
  values: readonly LayeredProviderReferenceInput[],
  requiredRoles: readonly LayeredProviderReferenceRole[],
): readonly LayeredProviderReferenceInput[] {
  if (!Array.isArray(values) || values.length > 16) {
    fail("LAYERED_PRODUCTION_PROVIDER_REQUEST_INVALID", "references must contain at most 16 entries.");
  }
  const seen = new Set<string>();
  const result = values.map((entry, index) => {
    if (!entry || typeof entry !== "object") fail("LAYERED_PRODUCTION_PROVIDER_REQUEST_INVALID", `references[${index}] must be an object.`);
    if (!/^artifact_[0-9a-f]{64}$/.test(entry.artifactId)) {
      fail("LAYERED_PRODUCTION_PROVIDER_REQUEST_INVALID", `references[${index}].artifactId must use artifact_<sha256> format.`);
    }
    if (!PROVIDER_REFERENCE_ROLES.has(entry.role)) {
      fail("LAYERED_PRODUCTION_PROVIDER_REQUEST_INVALID", `references[${index}].role is unsupported.`);
    }
    const key = `${entry.role}\0${entry.artifactId}`;
    if (seen.has(key)) fail("LAYERED_PRODUCTION_PROVIDER_REQUEST_INVALID", `Duplicate provider reference ${entry.role}.`);
    seen.add(key);
    return freeze({
      artifactId: entry.artifactId,
      role: entry.role,
      strength: entry.strength === undefined ? 1 : numberValue(entry.strength, `references[${index}].strength`, 0, 2),
      required: entry.required ?? true,
      ...(entry.note === undefined ? {} : { note: stringValue(entry.note, `references[${index}].note`, 512) }),
    });
  });
  for (const role of requiredRoles) {
    if (!result.some((entry) => entry.role === role && entry.required === true)) {
      fail("LAYERED_PRODUCTION_PROVIDER_REFERENCE_REQUIRED", `Provider request requires a named ${role} artifact reference.`);
    }
  }
  return freeze(result);
}

export function compileLayeredProviderCandidateRequest(
  plan: CompiledLayeredProductionPlan,
  unitId: string,
  references: readonly LayeredProviderReferenceInput[] = [],
): CompiledLayeredProviderRequest {
  verifyLayeredProductionPlan(plan);
  const unit = getLayeredProductionUnit(plan, unitId);
  const layer = plan.layers.find((entry) => entry.id === unit.layerId);
  if (!layer) fail("LAYERED_PRODUCTION_PLAN_INVALID", `Unit ${unit.id} references missing layer ${unit.layerId}.`);
  const contract = unit.providerJob.providerContract;
  const boundReferences = providerReferences(references, contract.requiredReferenceRoles);
  const identityLocks = providerList([
    `continuity key ${unit.continuityKey}`,
    `fixed camera yaw ${plan.style.camera.yawDegrees}, pitch ${plan.style.camera.pitchDegrees}, roll ${plan.style.camera.rollDegrees}, scale ${plan.style.camera.orthographicScale}`,
    `fixed lighting key ${plan.style.lighting.keyDirectionDegrees}, elevation ${plan.style.lighting.keyElevationDegrees}, shadow ${plan.style.lighting.shadowDirectionDegrees}`,
    `palette budget ${plan.style.palette.maximumLocalColours} local / ${plan.style.palette.maximumSceneColours} scene colours; preserve indices`,
    `pixel grammar: no antialiasing, no subpixel motion, ${plan.style.pixelGrammar.dithering} dithering, ${plan.style.pixelGrammar.outline} outlines`,
  ], "style.identityLocks");
  const mustHave = providerList([
    ...plan.style.distinctiveMotifs,
    ...layer.include,
    ...unit.include,
  ], "style.mustHave");
  const mustAvoid = providerList([
    ...plan.style.forbiddenModernTraits,
    ...plan.style.forbiddenGenericTraits,
    ...layer.exclude,
    ...unit.exclude,
  ], "style.mustAvoid");
  const separateAssets = providerList(
    plan.layers.filter((entry) => entry.id !== layer.id).map((entry) => `${entry.role} layer`),
    "shot.separateAssets",
  );
  const shotInclude = providerList([...layer.include, ...unit.include], "shot.include");
  const shotExclude = providerList([...layer.exclude, ...unit.exclude], "shot.exclude");
  const framing = providerList([
    `exact ${unit.dimensions.width}x${unit.dimensions.height} native canvas`,
    `exclusive ${layer.role} ownership`,
    ...(unit.position ? [`assembly position ${unit.position.x},${unit.position.y}`] : []),
    ...(unit.pivot ? [`pivot ${unit.pivot.x},${unit.pivot.y}`] : []),
    ...(unit.ySortOrigin ? [`Y-sort origin ${unit.ySortOrigin.x},${unit.ySortOrigin.y}`] : []),
  ], "shot.framing");
  const requestId = `layered-${sha256({ plan: plan.planSha256, unit: unit.id, references: boundReferences }).slice(0, 40)}`;
  const providerRequest: LayeredProviderCandidateRequest = freeze({
    schemaVersion: "1.0" as const,
    requestId,
    operation: "generate" as const,
    assetKind: contract.assetKind,
    continuityPhase: contract.continuityPhase,
    assetId: providerSafeId(unit.id, "asset"),
    candidateFamilyId: `layered-family-${sha256({ plan: plan.planId, continuityKey: unit.continuityKey }).slice(0, 40)}`,
    ...(unit.frame ? { frameId: providerSafeId(`${unit.frame.clipId}-f${String(unit.frame.frameNumber).padStart(3, "0")}`, "frame") } : {}),
    layerId: providerSafeId(layer.id, "layer"),
    creativeIntent: unit.providerJob.prompt,
    negativeIntent: unit.providerJob.negativePrompt,
    style: freeze({
      styleName: plan.style.title,
      intent: `${plan.style.authoredEra}; ${plan.style.renderingMode}; ${plan.style.projection}; one isolated runtime source unit.`,
      mustHave,
      mustAvoid,
      identityLocks,
      palette: providerList(plan.style.palette.colours ?? [], "style.palette"),
      lineTreatment: providerList(plan.style.lineRules, "style.lineTreatment"),
      materials: providerList(plan.style.materialVocabulary, "style.materials"),
      cameraRules: providerList([
        `fixed yaw ${plan.style.camera.yawDegrees}`,
        `fixed pitch ${plan.style.camera.pitchDegrees}`,
        `fixed roll ${plan.style.camera.rollDegrees}`,
        `orthographic scale ${plan.style.camera.orthographicScale}`,
      ], "style.cameraRules"),
      compositionRules: providerList(plan.style.compositionRules, "style.compositionRules"),
      eraRules: providerList([
        plan.style.authoredEra,
        "no modern gloss, bloom, soft gradients, high-resolution texture noise or generic AI concept-art treatment",
      ], "style.eraRules"),
    }),
    shot: freeze({
      subject: unit.purpose,
      ...(unit.frame ? { action: unit.frame.pose } : {}),
      include: shotInclude,
      exclude: shotExclude,
      separateAssets,
      framing,
    }),
    target: freeze({
      width: unit.dimensions.width,
      height: unit.dimensions.height,
      transparency: unit.alpha === "opaque" ? "opaque" as const : "required" as const,
      outputFormat: "png" as const,
    }),
    background: freeze({
      strategy: unit.alpha === "opaque" ? "opaque-source" as const : "native-alpha" as const,
    }),
    quality: "high" as const,
    candidateCount: 1 as const,
    references: boundReferences,
    selection: freeze({ allowedAdapterIds: [], allowFallback: false as const, requireSeed: false as const }),
    metadata: freeze({
      schema: "evavo.layered-production.provider-metadata.v1" as const,
      planId: plan.planId,
      planSha256: plan.planSha256,
      styleFingerprintSha256: plan.styleFingerprintSha256,
      unitId: unit.id,
      unitIdempotencyKey: unit.providerJob.idempotencyKey,
      continuityKey: unit.continuityKey,
      targetPath: unit.targetPath,
      layerRole: unit.layerRole,
      candidateOnly: true as const,
      styleProofStatus: plan.styleProof.status,
      approvals: freeze({
        source: false as const,
        assembly: false as const,
        final: false as const,
      }),
    }),
  });
  return freeze({
    planId: plan.planId,
    planSha256: plan.planSha256,
    unitId: unit.id,
    requiredReferenceRoles: contract.requiredReferenceRoles,
    request: providerRequest,
    authority: freeze({
      providerExecution: false as const,
      approval: false as const,
      targetRepositoryMutation: false as const,
    }),
  });
}

export function layeredProductionProtocolSummary() {
  return freeze({
    schemaVersion: "1.0" as const,
    protocolVersion: LAYERED_PRODUCTION_PROTOCOL_VERSION,
    requestKind: LAYERED_PRODUCTION_REQUEST_KIND,
    planKind: LAYERED_PRODUCTION_PLAN_KIND,
    supportedIntents: ["style-proof", "runtime-source"] as const,
    sourceRules: [
      "Concept/reference images are never runtime-source inputs.",
      "Every provider job owns one layer role and returns exactly one image.",
      "Complete scenes, screenshots, sprite sheets, contact sheets, grids, collages, storyboards and generated readable text are forbidden as runtime sources.",
      "Style proof units require named human approval before production expansion.",
      "Composites are approval-gated derivatives assembled from approved individual PNGs.",
      "Provider candidate requests are compiled only after required continuity artifact references are bound.",
    ],
    reviewRules: [
      "Review every unit at native scale and 2x nearest-neighbour.",
      "Prove alpha against hostile mattes and compare with approved lower layers.",
      "Run palette, cluster, edge, camera, lighting, continuity and anti-generic checks.",
      "A generated candidate is not approval, integration or promotion.",
    ],
    authority: {
      providerExecution: false,
      automaticAssembly: false,
      automaticPromotion: false,
      targetRepositoryMutation: false,
      gitPush: false,
    },
  });
}
