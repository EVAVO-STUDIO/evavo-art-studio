import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import {
  ProviderError,
  providerRequiredCapabilities,
  type ProviderRegistry,
} from "@evavo/art-providers";
import {
  TARGETED_REPAIR_EXECUTION_CAPABILITIES,
  TargetedRepairError,
  compileTargetedRepairExecutionJob,
  executeTargetedRepairProviderCanvas,
  planTargetedRepair,
  validateTargetedRepairExecutionRequest,
  validateTargetedRepairRequest,
  type TargetedRepairPacket,
} from "@evavo/art-repair";
import {
  CancelledRuntimeError,
  PermanentRuntimeError,
  TransientRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

const PLAN_CAPABILITIES = Object.freeze([
  "repair.plan",
  "artifacts.store",
  "evidence.bundle",
] as const);

function declaredPlanningInputs(
  input: ReturnType<typeof validateTargetedRepairRequest>,
): readonly ArtifactId[] {
  return [
    input.familyEvidenceArtifactId,
    ...(input.maskArtifactId ? [input.maskArtifactId] : []),
    ...input.references.map((reference) => reference.artifactId),
  ];
}

function requireCapabilities(
  required: readonly string[],
  declared: readonly string[],
  kind: string,
): void {
  for (const capability of required) {
    if (!declared.includes(capability)) {
      throw new PermanentRuntimeError(
        "TARGETED_REPAIR_RUNTIME_CAPABILITY_MISSING",
        `${kind} job must require ${capability}.`,
      );
    }
  }
}

function requireInputs(
  required: readonly ArtifactId[],
  declared: readonly ArtifactId[],
  kind: string,
): void {
  const available = new Set(declared);
  const missing = [...new Set(required)].filter(
    (artifactId) => !available.has(artifactId),
  );
  if (missing.length) {
    throw new PermanentRuntimeError(
      "TARGETED_REPAIR_RUNTIME_INPUT_LINEAGE_MISSING",
      `${kind} inputArtifacts is missing: ${missing.join(", ")}`,
    );
  }
}

function repairFailure(error: TargetedRepairError): PermanentRuntimeError {
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

function providerFailure(error: ProviderError): Error {
  if (error.classification === "transient") {
    return new TransientRuntimeError(error.code, error.message, error.details);
  }
  if (error.classification === "cancelled") {
    return new CancelledRuntimeError(error.message);
  }
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

function runtimeFailure(error: unknown): Error {
  if (error instanceof TargetedRepairError) return repairFailure(error);
  if (error instanceof ProviderError) return providerFailure(error);
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return new PermanentRuntimeError(
      (error as { code: string }).code,
      error instanceof Error ? error.message : String(error),
    );
  }
  return error instanceof Error
    ? error
    : new PermanentRuntimeError(
        "TARGETED_REPAIR_RUNTIME_UNEXPECTED",
        String(error),
      );
}

function parsePacket(value: unknown): TargetedRepairPacket {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("providerPlan" in value) ||
    !("disposition" in value)
  ) {
    throw new PermanentRuntimeError(
      "TARGETED_REPAIR_RUNTIME_PACKET_INVALID",
      "Repair packet is missing provider execution fields.",
    );
  }
  return value as TargetedRepairPacket;
}

async function readVerifiedPacket(
  context: Parameters<RuntimeJobHandler>[0],
  packetArtifactId: ArtifactId,
): Promise<TargetedRepairPacket> {
  const [artifact, verification] = await Promise.all([
    context.artifacts.get(packetArtifactId),
    context.artifacts.verify(packetArtifactId),
  ]);
  if (!artifact || !verification.exists) {
    throw new PermanentRuntimeError(
      "TARGETED_REPAIR_RUNTIME_PACKET_NOT_FOUND",
      `Repair packet artifact was not found: ${packetArtifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new PermanentRuntimeError(
      "TARGETED_REPAIR_RUNTIME_PACKET_VERIFICATION_FAILED",
      "Repair packet failed immutable descriptor or content verification.",
    );
  }
  if (
    artifact.mediaType !== "application/json" ||
    artifact.storageClass !== "evidence" ||
    artifact.labels.artifactRole !== "targeted-repair-packet"
  ) {
    throw new PermanentRuntimeError(
      "TARGETED_REPAIR_RUNTIME_PACKET_ROLE_INVALID",
      "Execution input must be a targeted-repair-packet evidence artifact.",
    );
  }
  let packet: TargetedRepairPacket;
  try {
    packet = parsePacket(
      JSON.parse((await context.artifacts.read(packetArtifactId)).toString("utf8")),
    );
  } catch (error: unknown) {
    if (error instanceof PermanentRuntimeError) throw error;
    throw new PermanentRuntimeError(
      "TARGETED_REPAIR_RUNTIME_PACKET_INVALID",
      `Repair packet could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (packet.disposition !== "ready" || !packet.providerPlan) {
    throw new PermanentRuntimeError(
      "TARGETED_REPAIR_RUNTIME_PACKET_NOT_READY",
      "Only a ready repair packet with a provider plan may execute.",
      normalizeJson({
        disposition: packet.disposition,
        blockers: packet.blockers,
      }),
    );
  }
  const packetSources = new Set(artifact.sourceArtifacts);
  const missingClosure = packet.providerPlan.inputArtifacts.filter(
    (artifactId) => !packetSources.has(artifactId),
  );
  if (missingClosure.length) {
    throw new PermanentRuntimeError(
      "TARGETED_REPAIR_RUNTIME_PACKET_CLOSURE_INCOMPLETE",
      `Repair packet descriptor is missing provider dependencies: ${missingClosure.join(", ")}`,
      normalizeJson({
        packetArtifactId,
        missingArtifactIds: missingClosure,
      }),
    );
  }
  return packet;
}

function executionJob(
  packetArtifactId: ArtifactId,
  packet: TargetedRepairPacket,
): JsonValue | null {
  if (packet.disposition !== "ready" || !packet.providerPlan) return null;
  const compiled = compileTargetedRepairExecutionJob({
    schemaVersion: "1.0",
    repairPacketArtifactId: packetArtifactId,
    providerCanvas: {
      restorationSampling: "nearest-center",
      paletteMode: "source",
      alphaMode: "source",
      requireBinaryMask: true,
    },
  }).runtimeJob;
  return normalizeJson({
    ...compiled,
    requiredCapabilityProfile:
      packet.providerPlan.runtimeJob.requiredCapabilityProfile,
  });
}

export function createTargetedRepairHandlers(
  providerRegistry: ProviderRegistry,
): Readonly<Record<string, RuntimeJobHandler>> {
  const plan: RuntimeJobHandler = async (context) => {
    let request;
    try {
      request = validateTargetedRepairRequest(context.job.spec.payload);
    } catch (error: unknown) {
      throw runtimeFailure(error);
    }
    requireCapabilities(
      PLAN_CAPABILITIES,
      context.job.spec.requiredCapabilities,
      "art.repair.plan",
    );
    requireInputs(
      declaredPlanningInputs(request),
      context.job.spec.inputArtifacts,
      "art.repair.plan",
    );
    try {
      const result = await planTargetedRepair(request, {
        artifacts: context.artifacts,
      });
      if (
        result.packet.disposition !== "ready" &&
        result.packet.providerPlan !== undefined
      ) {
        throw new PermanentRuntimeError(
          "TARGETED_REPAIR_BLOCKED_PACKET_HAS_EXECUTION_PLAN",
          "A blocked repair packet may not expose a provider execution plan.",
          {
            packetArtifactId: result.packetArtifactId,
            disposition: result.packet.disposition,
            blockers: result.packet.blockers,
          },
        );
      }
      return {
        outputArtifacts: [result.packetArtifactId] as readonly ArtifactId[],
        result: {
          schemaVersion: "1.0",
          repairId: result.packet.repairId,
          packetArtifactId: result.packetArtifactId,
          disposition: result.packet.disposition,
          impactedFrameIds: result.packet.impactedFrameIds,
          mutableArtifactIds: result.packet.mutableArtifactIds,
          protectedArtifactIds: result.packet.protectedArtifactIds,
          blockers: result.packet.blockers,
          providerPlanReady:
            result.packet.disposition === "ready" &&
            result.packet.providerPlan !== undefined,
          executionJob: executionJob(
            result.packetArtifactId,
            result.packet,
          ),
        },
      };
    } catch (error: unknown) {
      throw runtimeFailure(error);
    }
  };

  const execute: RuntimeJobHandler = async (context) => {
    let request;
    try {
      request = validateTargetedRepairExecutionRequest(
        context.job.spec.payload,
      );
    } catch (error: unknown) {
      throw runtimeFailure(error);
    }
    requireCapabilities(
      TARGETED_REPAIR_EXECUTION_CAPABILITIES,
      context.job.spec.requiredCapabilities,
      "art.repair.execute-provider-canvas",
    );
    requireInputs(
      [request.repairPacketArtifactId],
      context.job.spec.inputArtifacts,
      "art.repair.execute-provider-canvas",
    );
    const packet = await readVerifiedPacket(
      context,
      request.repairPacketArtifactId,
    );
    const providerPlan = packet.providerPlan;
    if (!providerPlan) {
      throw new PermanentRuntimeError(
        "TARGETED_REPAIR_RUNTIME_PACKET_NOT_READY",
        "Verified repair packet is missing its provider plan.",
      );
    }
    const expectedProfile = providerRequiredCapabilities(providerPlan.request);
    const packetProfile = providerPlan.runtimeJob.requiredCapabilityProfile;
    if (
      packetProfile.length !== expectedProfile.length ||
      packetProfile.some((capability, index) =>
        capability !== expectedProfile[index],
      )
    ) {
      throw new PermanentRuntimeError(
        "TARGETED_REPAIR_PACKET_CAPABILITY_PROFILE_MISMATCH",
        "Repair packet provider capability profile does not match its normalized provider request.",
      );
    }
    const declaredProfile = context.job.spec.requiredCapabilityProfile;
    if (
      declaredProfile === undefined ||
      declaredProfile.length !== expectedProfile.length ||
      declaredProfile.some((capability, index) =>
        capability !== expectedProfile[index],
      )
    ) {
      throw new PermanentRuntimeError(
        "TARGETED_REPAIR_RUNTIME_CAPABILITY_PROFILE_MISMATCH",
        "Repair execution job must declare the exact provider capability profile from its verified packet.",
      );
    }
    try {
      const result = await executeTargetedRepairProviderCanvas(request, {
        artifacts: context.artifacts,
        registry: providerRegistry,
        signal: context.signal,
      });
      const outputArtifacts = [
        result.providerCanvasBaseArtifactId,
        result.providerCanvasMaskArtifactId,
        result.providerCanvasManifestArtifactId,
        result.providerEvidenceArtifactId,
        ...result.restoredCandidates.flatMap((candidate) => [
          candidate.providerCandidateArtifactId,
          candidate.restoredCandidateArtifactId,
          candidate.restorationEvidenceArtifactId,
        ]),
        result.executionEvidenceArtifactId,
      ] as readonly ArtifactId[];
      return {
        outputArtifacts,
        result: result as unknown as JsonValue,
      };
    } catch (error: unknown) {
      throw runtimeFailure(error);
    }
  };

  return Object.freeze({
    "art.repair.plan": plan,
    "art.repair.execute-provider-canvas": execute,
  });
}

export function targetedRepairWorkerCapabilities(
  providerRegistry?: ProviderRegistry,
): readonly string[] {
  const capabilities = new Set<string>(PLAN_CAPABILITIES);
  const providerReady = providerRegistry?.list().some(
    (adapter) =>
      adapter.capabilities.includes("inpaint") &&
      adapter.capabilities.includes("mask") &&
      adapter.capabilities.includes("custom-size"),
  );
  if (providerReady) {
    for (const capability of TARGETED_REPAIR_EXECUTION_CAPABILITIES) {
      capabilities.add(capability);
    }
  }
  return [...capabilities].sort();
}
