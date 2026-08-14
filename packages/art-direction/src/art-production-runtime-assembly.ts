import {
  exactKeys,
  fail,
  freeze,
  idValue,
  integerValue,
  record,
  sha256,
  stringValue,
} from "./layered-production-internal.js";
import type { CompiledLayeredProductionPlan } from "./layered-production-types.js";
import {
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
  ART_PRODUCTION_RUNTIME_ASSEMBLY_HANDOFF_KIND,
} from "./art-production-contract.js";
import type { ArtProductionHumanApprovalReceipt } from "./art-production-human-approval-types.js";
import type { ArtProductionLoop } from "./art-production-loop-types.js";
import type { ArtProductionPackagingPlan } from "./art-production-packaging-types.js";
import type {
  ArtProductionRuntimeAssemblyHandoff,
  ArtProductionRuntimeAssemblySourceBinding,
} from "./art-production-runtime-assembly-types.js";
import { verifyArtProductionLoop } from "./art-production-loop.js";
import { verifyArtProductionPackagingPlan } from "./art-production-packaging-verification.js";
import { verifyArtProductionHumanApprovalReceiptForVerifiedLoop } from "./art-production-human-approval.js";
import { compileLayeredAssemblyManifest } from "./layered-production-assembly-compiler.js";
import { verifyLayeredAssemblyManifest } from "./layered-production-assembly-verification.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID_PATTERN = /^artifact_[0-9a-f]{64}$/u;
const MAXIMUM_SOURCE_BYTES = 256 * 1024 * 1024;

function invalid(message: string, details?: unknown): never {
  fail("ART_PRODUCTION_RUNTIME_ASSEMBLY_INVALID", message, details);
}

function gated(message: string): never {
  fail("ART_PRODUCTION_RUNTIME_ASSEMBLY_GATED", message);
}

function sha256Value(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  if (!SHA256_PATTERN.test(output)) {
    invalid(`${label} must be lowercase SHA-256.`);
  }
  return output;
}

function artifactIdValue(
  value: unknown,
  label: string,
  expectedSha256: string,
): string {
  const output = stringValue(value, label, 73);
  if (
    !ARTIFACT_ID_PATTERN.test(output) ||
    output !== `artifact_${expectedSha256}`
  ) {
    invalid(`${label} must identify the exact declared SHA-256.`);
  }
  return output;
}

function approvalMap(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: unknown,
): ReadonlyMap<string, ArtProductionHumanApprovalReceipt> {
  if (!Array.isArray(input) || input.length !== loop.unitStates.length) {
    gated(
      "Runtime assembly handoff requires one complete named-human approval receipt for every full-production source unit.",
    );
  }
  const output = new Map<string, ArtProductionHumanApprovalReceipt>();
  for (const entry of input) {
    verifyArtProductionHumanApprovalReceiptForVerifiedLoop(
      plan,
      loop,
      entry,
    );
    const receipt = entry as ArtProductionHumanApprovalReceipt;
    if (output.has(receipt.unitId)) {
      invalid(
        `Runtime assembly approval receipts duplicate unit ${receipt.unitId}.`,
      );
    }
    output.set(receipt.unitId, receipt);
  }
  return output;
}

function packagingSourceMap(
  packagingPlan: ArtProductionPackagingPlan,
): ReadonlyMap<string, ArtProductionPackagingPlan["individualSources"][number]> {
  const output = new Map<
    string,
    ArtProductionPackagingPlan["individualSources"][number]
  >();
  for (const source of packagingPlan.individualSources) {
    if (output.has(source.unitId)) {
      invalid(
        `Runtime assembly packaging sources duplicate unit ${source.unitId}.`,
      );
    }
    output.set(source.unitId, source);
  }
  return output;
}

function runtimeAssemblyAuthority() {
  return freeze({
    planningOnly: true as const,
    artifactRead: false as const,
    providerExecution: false as const,
    imageMutation: false as const,
    creativeDecision: false as const,
    packagingExecution: false as const,
    automaticAssembly: false as const,
    targetRepositoryMutation: false as const,
    runtimeActivation: false as const,
    gitCommit: false as const,
    gitPush: false as const,
    deployment: false as const,
    publication: false as const,
    forcePush: false as const,
  });
}

function validateSourceBinding(
  input: unknown,
  index: number,
): ArtProductionRuntimeAssemblySourceBinding {
  const label = `runtimeAssemblyHandoff.sourceBindings[${index}]`;
  const binding = record(input, label);
  exactKeys(binding, label, [
    "unitId",
    "layerId",
    "layerRole",
    "sourceArtifactId",
    "sourceSha256",
    "sourceBytes",
    "width",
    "height",
    "alpha",
    "targetPath",
    "technicalReviewAttemptSha256",
    "approvalRequestSha256",
    "approvalBasisSha256",
    "approvalReceiptArtifactId",
    "approvalReceiptSha256",
  ]);
  const sourceSha256 = sha256Value(
    binding.sourceSha256,
    `${label}.sourceSha256`,
  );
  const approvalReceiptSha256 = sha256Value(
    binding.approvalReceiptSha256,
    `${label}.approvalReceiptSha256`,
  );
  return freeze({
    unitId: idValue(binding.unitId, `${label}.unitId`),
    layerId: idValue(binding.layerId, `${label}.layerId`),
    layerRole: stringValue(binding.layerRole, `${label}.layerRole`, 80) as
      ArtProductionRuntimeAssemblySourceBinding["layerRole"],
    sourceArtifactId: artifactIdValue(
      binding.sourceArtifactId,
      `${label}.sourceArtifactId`,
      sourceSha256,
    ),
    sourceSha256,
    sourceBytes: integerValue(
      binding.sourceBytes,
      `${label}.sourceBytes`,
      1,
      MAXIMUM_SOURCE_BYTES,
    ),
    width: integerValue(binding.width, `${label}.width`, 1, 8192),
    height: integerValue(binding.height, `${label}.height`, 1, 8192),
    alpha: stringValue(binding.alpha, `${label}.alpha`, 40) as
      ArtProductionRuntimeAssemblySourceBinding["alpha"],
    targetPath: stringValue(binding.targetPath, `${label}.targetPath`, 1024),
    technicalReviewAttemptSha256: sha256Value(
      binding.technicalReviewAttemptSha256,
      `${label}.technicalReviewAttemptSha256`,
    ),
    approvalRequestSha256: sha256Value(
      binding.approvalRequestSha256,
      `${label}.approvalRequestSha256`,
    ),
    approvalBasisSha256: sha256Value(
      binding.approvalBasisSha256,
      `${label}.approvalBasisSha256`,
    ),
    approvalReceiptArtifactId: artifactIdValue(
      binding.approvalReceiptArtifactId,
      `${label}.approvalReceiptArtifactId`,
      approvalReceiptSha256,
    ),
    approvalReceiptSha256,
  });
}

function validateSubmittedHandoff(
  plan: CompiledLayeredProductionPlan,
  input: unknown,
): ArtProductionRuntimeAssemblyHandoff {
  const handoff = record(input, "runtimeAssemblyHandoff");
  exactKeys(handoff, "runtimeAssemblyHandoff", [
    "schemaVersion",
    "kind",
    "protocolVersion",
    "plan",
    "loop",
    "packaging",
    "assembly",
    "sourceBindings",
    "totals",
    "authority",
    "handoffSha256",
  ]);
  const submitted = handoff as unknown as ArtProductionRuntimeAssemblyHandoff;
  if (
    submitted.schemaVersion !== "1.0" ||
    submitted.kind !== ART_PRODUCTION_RUNTIME_ASSEMBLY_HANDOFF_KIND ||
    submitted.protocolVersion !== ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION
  ) {
    invalid("Runtime assembly handoff protocol identity is invalid.");
  }

  const planIdentity = record(submitted.plan, "runtimeAssemblyHandoff.plan");
  exactKeys(planIdentity, "runtimeAssemblyHandoff.plan", [
    "planId",
    "planSha256",
  ]);
  idValue(submitted.plan.planId, "runtimeAssemblyHandoff.plan.planId");
  sha256Value(
    submitted.plan.planSha256,
    "runtimeAssemblyHandoff.plan.planSha256",
  );

  const loopIdentity = record(submitted.loop, "runtimeAssemblyHandoff.loop");
  exactKeys(loopIdentity, "runtimeAssemblyHandoff.loop", [
    "loopSha256",
    "profileSha256",
  ]);
  sha256Value(
    submitted.loop.loopSha256,
    "runtimeAssemblyHandoff.loop.loopSha256",
  );
  sha256Value(
    submitted.loop.profileSha256,
    "runtimeAssemblyHandoff.loop.profileSha256",
  );

  const packagingIdentity = record(
    submitted.packaging,
    "runtimeAssemblyHandoff.packaging",
  );
  exactKeys(packagingIdentity, "runtimeAssemblyHandoff.packaging", [
    "packagingSha256",
  ]);
  sha256Value(
    submitted.packaging.packagingSha256,
    "runtimeAssemblyHandoff.packaging.packagingSha256",
  );

  const assemblyIdentity = record(
    submitted.assembly,
    "runtimeAssemblyHandoff.assembly",
  );
  exactKeys(assemblyIdentity, "runtimeAssemblyHandoff.assembly", [
    "assemblyId",
    "requestSha256",
    "manifestSha256",
    "manifest",
  ]);
  idValue(
    submitted.assembly.assemblyId,
    "runtimeAssemblyHandoff.assembly.assemblyId",
  );
  sha256Value(
    submitted.assembly.requestSha256,
    "runtimeAssemblyHandoff.assembly.requestSha256",
  );
  sha256Value(
    submitted.assembly.manifestSha256,
    "runtimeAssemblyHandoff.assembly.manifestSha256",
  );
  verifyLayeredAssemblyManifest(submitted.assembly.manifest, plan);
  if (
    submitted.assembly.manifest.scope !== "runtime-candidate" ||
    submitted.assembly.manifest.readiness.runtimeReady !== true ||
    submitted.assembly.assemblyId !== submitted.assembly.manifest.assemblyId ||
    submitted.assembly.requestSha256 !==
      submitted.assembly.manifest.requestSha256 ||
    submitted.assembly.manifestSha256 !==
      submitted.assembly.manifest.manifestSha256
  ) {
    invalid(
      "Runtime assembly handoff does not contain one exact runtime-ready assembly manifest identity.",
    );
  }

  if (!Array.isArray(submitted.sourceBindings)) {
    invalid("Runtime assembly handoff sourceBindings must be an array.");
  }
  const bindings = submitted.sourceBindings.map((entry, index) =>
    validateSourceBinding(entry, index),
  );
  const bindingIds = bindings.map((binding) => binding.unitId);
  if (new Set(bindingIds).size !== bindingIds.length) {
    invalid("Runtime assembly handoff source bindings must be unique per unit.");
  }
  if (
    bindings.length !== submitted.assembly.manifest.sources.length ||
    !bindings.every(
      (binding, index) =>
        binding.unitId === submitted.assembly.manifest.sources[index]?.unitId,
    )
  ) {
    invalid(
      "Runtime assembly handoff source bindings must exactly follow the assembly manifest source order.",
    );
  }

  const totals = record(submitted.totals, "runtimeAssemblyHandoff.totals");
  exactKeys(totals, "runtimeAssemblyHandoff.totals", [
    "sources",
    "animationSets",
    "placements",
  ]);
  const expectedTotals = {
    sources: submitted.assembly.manifest.sources.length,
    animationSets: submitted.assembly.manifest.animationSets.length,
    placements: submitted.assembly.manifest.layers.flatMap(
      (layer) => layer.placements,
    ).length,
  };
  if (
    submitted.totals.sources !== expectedTotals.sources ||
    submitted.totals.animationSets !== expectedTotals.animationSets ||
    submitted.totals.placements !== expectedTotals.placements
  ) {
    invalid(
      "Runtime assembly handoff totals do not match the retained assembly manifest.",
    );
  }

  const authority = record(
    submitted.authority,
    "runtimeAssemblyHandoff.authority",
  );
  exactKeys(authority, "runtimeAssemblyHandoff.authority", [
    "planningOnly",
    "artifactRead",
    "providerExecution",
    "imageMutation",
    "creativeDecision",
    "packagingExecution",
    "automaticAssembly",
    "targetRepositoryMutation",
    "runtimeActivation",
    "gitCommit",
    "gitPush",
    "deployment",
    "publication",
    "forcePush",
  ]);
  if (
    submitted.authority.planningOnly !== true ||
    Object.entries(submitted.authority).some(
      ([key, value]) => key !== "planningOnly" && value !== false,
    )
  ) {
    invalid(
      "Runtime assembly handoff authority must remain planning-only with every execution capability false.",
    );
  }

  sha256Value(
    submitted.handoffSha256,
    "runtimeAssemblyHandoff.handoffSha256",
  );
  const { handoffSha256, ...withoutHandoffSha256 } = submitted;
  const calculatedHandoffSha256 = sha256(withoutHandoffSha256);
  if (calculatedHandoffSha256 !== handoffSha256) {
    invalid(
      "Runtime assembly handoff SHA-256 does not match its submitted payload.",
      {
        expectedHandoffSha256: calculatedHandoffSha256,
        submittedHandoffSha256: handoffSha256,
      },
    );
  }
  return submitted;
}

export function compileArtProductionRuntimeAssemblyHandoff(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  approvalsInput: readonly ArtProductionHumanApprovalReceipt[] | unknown,
  packagingPlan: ArtProductionPackagingPlan,
  assemblyRequest: unknown,
): ArtProductionRuntimeAssemblyHandoff {
  verifyArtProductionLoop(plan, loop);
  verifyArtProductionPackagingPlan(
    plan,
    loop,
    approvalsInput,
    packagingPlan,
  );
  if (loop.scope !== "full-production") {
    gated("Runtime assembly handoff requires a full-production loop.");
  }

  const request = record(assemblyRequest, "runtimeAssemblyRequest");
  if (request.scope !== "runtime-candidate") {
    gated(
      "Art Production runtime assembly handoff accepts only runtime-candidate assembly requests.",
    );
  }
  const assemblyManifest = compileLayeredAssemblyManifest(
    plan,
    assemblyRequest,
  );
  if (
    assemblyManifest.scope !== "runtime-candidate" ||
    assemblyManifest.readiness.runtimeReady !== true ||
    assemblyManifest.readiness.blockers.length !== 0
  ) {
    gated(
      "Art Production runtime assembly handoff requires one blocker-free runtime-ready assembly manifest.",
    );
  }

  const approvals = approvalMap(plan, loop, approvalsInput);
  const packagingSources = packagingSourceMap(packagingPlan);
  const planUnits = new Map(
    plan.layers
      .flatMap((layer) => layer.units)
      .map((unit) => [unit.id, unit]),
  );

  const sourceBindings = freeze(
    assemblyManifest.sources.map((source) => {
      const packaged = packagingSources.get(source.unitId);
      const receipt = approvals.get(source.unitId);
      const unit = planUnits.get(source.unitId);
      if (!packaged || !receipt || !unit) {
        gated(
          `Runtime assembly source ${source.unitId} is missing exact packaging, approval or plan lineage.`,
        );
      }
      if (
        source.status !== "approved" ||
        source.artifactId !== packaged.artifactId ||
        source.sha256 !== packaged.sha256 ||
        source.bytes !== packaged.bytes ||
        source.width !== packaged.width ||
        source.height !== packaged.height ||
        source.artifactId !== receipt.sourceArtifactId ||
        source.sha256 !== receipt.sourceSha256 ||
        source.bytes !== receipt.sourceBytes
      ) {
        invalid(
          `Runtime assembly source ${source.unitId} is not the exact packaged and named-human-approved source candidate.`,
        );
      }
      if (
        packaged.technicalReviewAttemptSha256 !==
          receipt.technicalReview.attemptSha256 ||
        packaged.approvalRequestSha256 !== receipt.requestSha256 ||
        packaged.approvalBasisSha256 !== receipt.approvalBasisSha256 ||
        packaged.approvalReceiptSha256 !==
          receipt.approvalReceiptSha256
      ) {
        invalid(
          `Runtime assembly source ${source.unitId} does not preserve exact technical-review and approval lineage.`,
        );
      }
      const approvalReceiptArtifactId =
        `artifact_${receipt.approvalReceiptSha256}`;
      if (
        source.approvalReceiptSha256 !==
          receipt.approvalReceiptSha256 ||
        source.approvalReceiptArtifactId !== approvalReceiptArtifactId
      ) {
        invalid(
          `Runtime assembly source ${source.unitId} does not identify the exact candidate-bound human-approval receipt.`,
        );
      }
      return freeze({
        unitId: source.unitId,
        layerId: source.layerId,
        layerRole: source.layerRole,
        sourceArtifactId: source.artifactId,
        sourceSha256: source.sha256,
        sourceBytes: source.bytes,
        width: source.width,
        height: source.height,
        alpha: source.alpha,
        targetPath: packaged.targetPath,
        technicalReviewAttemptSha256:
          packaged.technicalReviewAttemptSha256,
        approvalRequestSha256: packaged.approvalRequestSha256,
        approvalBasisSha256: packaged.approvalBasisSha256,
        approvalReceiptArtifactId,
        approvalReceiptSha256: receipt.approvalReceiptSha256,
      });
    }),
  );

  const partial = {
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_RUNTIME_ASSEMBLY_HANDOFF_KIND,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    plan: freeze({
      planId: plan.planId,
      planSha256: plan.planSha256,
    }),
    loop: freeze({
      loopSha256: loop.loopSha256,
      profileSha256: loop.profileSha256,
    }),
    packaging: freeze({
      packagingSha256: packagingPlan.packagingSha256,
    }),
    assembly: freeze({
      assemblyId: assemblyManifest.assemblyId,
      requestSha256: assemblyManifest.requestSha256,
      manifestSha256: assemblyManifest.manifestSha256,
      manifest: assemblyManifest,
    }),
    sourceBindings,
    totals: freeze({
      sources: sourceBindings.length,
      animationSets: assemblyManifest.animationSets.length,
      placements: assemblyManifest.layers.flatMap(
        (layer) => layer.placements,
      ).length,
    }),
    authority: runtimeAssemblyAuthority(),
  };
  return freeze({
    ...partial,
    handoffSha256: sha256(partial),
  });
}

export function verifyArtProductionRuntimeAssemblyHandoff(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  approvalsInput: readonly ArtProductionHumanApprovalReceipt[] | unknown,
  packagingPlan: ArtProductionPackagingPlan,
  assemblyRequest: unknown,
  handoffInput: unknown,
): true {
  const submitted = validateSubmittedHandoff(plan, handoffInput);
  const expected = compileArtProductionRuntimeAssemblyHandoff(
    plan,
    loop,
    approvalsInput,
    packagingPlan,
    assemblyRequest,
  );
  if (expected.handoffSha256 !== submitted.handoffSha256) {
    invalid(
      "Runtime assembly handoff is not the deterministic compilation of its exact plan, loop, approvals, packaging plan and assembly request.",
      {
        expectedHandoffSha256: expected.handoffSha256,
        submittedHandoffSha256: submitted.handoffSha256,
      },
    );
  }
  return true;
}
