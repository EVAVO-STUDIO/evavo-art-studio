import type {
  EvavoCraftGenomeProviderExecutionMode,
  EvavoCraftGenomeProviderPacket,
  EvavoCraftGenomeProviderPacketInput,
} from "./book-studio-legacy-craft-genome-types";
import { cleanCraftIds, sha256CraftText, stableCraftJson } from "./book-studio-legacy-craft-genome-utils";
import { validateEvavoCraftProviderPacketInput } from "./book-studio-legacy-craft-provider-packet-validation";
import { createEvavoCraftProviderResponseContract } from "./book-studio-legacy-craft-provider-response-contract";

function executionMode(provider: EvavoCraftGenomeProviderPacketInput["provider"]): EvavoCraftGenomeProviderExecutionMode {
  if (provider === "chatgpt") return "strict_json_schema";
  if (provider === "claude") return "forced_single_tool";
  return "adapter_json_schema";
}

export function createEvavoCraftGenomeProviderPacket(input: EvavoCraftGenomeProviderPacketInput): EvavoCraftGenomeProviderPacket {
  const validated = validateEvavoCraftProviderPacketInput(input);
  const providerExecutionMode = executionMode(input.provider);
  const responseToolName = "evavo_book_studio_craft_genome_response" as const;
  const providerRule = input.provider === "claude"
    ? `Force exactly one call to tool ${responseToolName} using the supplied JSON Schema. Do not return free text before or after the tool call.`
    : input.provider === "chatgpt"
      ? "Use strict JSON Schema structured output and return only one schema-valid object. Do not add markdown, preamble or commentary."
      : "Use the adapter's strongest native structured-output or forced-tool mechanism and return only one object matching the exact supplied JSON Schema.";

  const systemInstruction = [
    providerRule,
    input.profile.providerInstruction,
    "Do not mention private influence sources, guess their identities or explain the prose as a blend of creators.",
    "Do not copy or reconstruct distinctive phrasing, scenes, characters, plots, trade dress or recognisable surface mannerisms from any comparison source.",
    "Generate materially different approaches when requested; reject all candidates when none is strong enough; preserve last-known-good prose and exact continuation evidence.",
    "A schema-valid response is still only a candidate. It must pass deterministic identity validation, unresolved-risk review and phrase-overlap scanning before canonical manuscript admission.",
  ].join("\n\n");

  const taskInstruction = [
    `Objective: ${validated.objective}`,
    `Target units: ${validated.targetUnitIds.join(", ")}`,
    `Context evidence: ${validated.contextEvidenceIds.join(", ")}`,
    `Craft profile: ${input.profile.profileId} v${input.profile.profileVersion}`,
    `Craft fingerprint: ${input.profile.profileFingerprint}`,
    `Required dimensions available: ${validated.dimensionIds.join(", ")}`,
    `Required project voice anchors: ${validated.projectVoiceAnchorIds.join(", ") || "none"}`,
    `Rejected patterns requiring explicit checks: ${validated.rejectedPatternIds.join(", ") || "none"}`,
    "Return original candidate text, applied dimensions, exact preserved voice anchors, one evidence-backed pass/fail check for every rejected pattern, unresolved risks and exact continuation state.",
  ].join("\n");

  const { responseContract, responseContractSha256 } = createEvavoCraftProviderResponseContract({
    packetId: validated.packetId,
    provider: input.provider,
    modelName: validated.modelName,
    profileFingerprint: input.profile.profileFingerprint,
    targetUnitIds: validated.targetUnitIds,
    dimensionIds: validated.dimensionIds,
    projectVoiceAnchorIds: validated.projectVoiceAnchorIds,
    rejectedPatternIds: validated.rejectedPatternIds,
  });

  const blockers = cleanCraftIds(validated.blockers);
  const unsigned = {
    outputKind: "evavo_book_studio_craft_genome_provider_packet" as const,
    schemaVersion: 1 as const,
    packetId: validated.packetId,
    provider: input.provider,
    modelName: validated.modelName,
    objective: validated.objective,
    targetUnitIds: validated.targetUnitIds,
    contextEvidenceIds: validated.contextEvidenceIds,
    profileId: input.profile.profileId,
    profileVersion: input.profile.profileVersion,
    profileFingerprint: input.profile.profileFingerprint,
    providerExecutionMode,
    responseToolName,
    systemInstruction,
    taskInstruction,
    responseContractFormat: "json_schema" as const,
    responseContractStrict: true as const,
    responseContract,
    responseContractSha256,
    blockers,
    ready: blockers.length === 0,
    boundary: "The packet is provider-neutral and capability-extensible: ChatGPT uses strict JSON Schema, Claude uses a forced single tool, and compatible models may use adapter-native schema enforcement. All providers receive the same de-identified craft and evidence contract without named-author imitation, phrase laundering or automatic canonical admission.",
  };
  return { ...unsigned, packetFingerprint: sha256CraftText(stableCraftJson(unsigned)) };
}

export const EVAVO_CRAFT_GENOME_PROVIDER_BOUNDARY = [
  "Treat a craft genome as a de-identified, evidence-bound constraint system rather than a named-author style request.",
  "Use only general production mechanisms and project-owned voice anchors. Never infer or disclose private source identities, reuse distinctive phrases, reconstruct recognisable surface mannerisms, or claim that mixing sources guarantees originality or legal clearance.",
  "Keep provider adapters flexible: ChatGPT, Claude and other compatible models may use their strongest native structured-output or tool-use mechanisms while preserving the same exact profile fingerprint, evidence scope, strict schema and rejection gates.",
].join(" ");
