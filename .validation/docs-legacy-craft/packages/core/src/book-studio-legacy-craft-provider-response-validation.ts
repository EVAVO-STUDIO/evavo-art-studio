import type {
  EvavoCraftGenomeProviderPacket,
  EvavoCraftGenomeProviderResponse,
  EvavoCraftGenomeProviderResponseAcceptance,
} from "./book-studio-legacy-craft-genome-types";
import {
  CRAFT_SHA256,
  cleanCraftIds,
  sha256CraftText,
  stableCraftJson,
} from "./book-studio-legacy-craft-genome-utils";

const ROOT_KEYS = [
  "outputKind", "schemaVersion", "packetId", "provider", "modelName", "profileFingerprint",
  "targetUnitIds", "candidateText", "appliedDimensionIds", "preservedVoiceAnchorIds",
  "rejectedPatternChecks", "unresolvedRisks", "phraseOverlapScanRequired", "continuation",
].sort();
const CONTINUATION_KEYS = ["complete", "remainingUnitIds", "exactTail"].sort();
const CHECK_KEYS = ["passed", "evidence"].sort();

interface EvavoParsedCraftResponseContract {
  properties?: {
    appliedDimensionIds?: { items?: { enum?: string[] } };
    preservedVoiceAnchorIds?: { items?: { enum?: string[] } };
    rejectedPatternChecks?: { required?: string[] };
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function sameKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function stringArray(value: unknown, maximum: number): string[] | undefined {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== "string" || !item.trim())) return undefined;
  const normalized = value.map((item) => item.trim());
  return new Set(normalized).size === normalized.length ? normalized : undefined;
}

function sameSet(left: string[], right: string[]): boolean {
  const sortedRight = [...right].sort();
  return left.length === right.length && [...left].sort().every((value, index) => value === sortedRight[index]);
}

function validatePacketIntegrity(packet: EvavoCraftGenomeProviderPacket, blockers: string[]): EvavoParsedCraftResponseContract | undefined {
  if (
    packet.outputKind !== "evavo_book_studio_craft_genome_provider_packet"
    || packet.schemaVersion !== 1
    || packet.responseContractFormat !== "json_schema"
    || packet.responseContractStrict !== true
    || packet.responseToolName !== "evavo_book_studio_craft_genome_response"
  ) blockers.push("Craft provider response packet has an unsupported contract identity.");

  if (!CRAFT_SHA256.test(packet.responseContractSha256) || packet.responseContractSha256 !== sha256CraftText(packet.responseContract)) blockers.push("Craft provider response packet contract hash does not match its exact JSON Schema.");
  if (!CRAFT_SHA256.test(packet.packetFingerprint)) blockers.push("Craft provider response packet requires a SHA-256 packet fingerprint.");
  const { packetFingerprint, ...unsignedPacket } = packet;
  if (packetFingerprint !== sha256CraftText(stableCraftJson(unsignedPacket))) blockers.push("Craft provider response packet fingerprint does not match the supplied packet contents.");

  try {
    const parsed = JSON.parse(packet.responseContract) as unknown;
    if (!record(parsed)) {
      blockers.push("Craft provider response packet JSON Schema must be one object.");
      return undefined;
    }
    return parsed as EvavoParsedCraftResponseContract;
  } catch {
    blockers.push("Craft provider response packet JSON Schema is not valid JSON.");
    return undefined;
  }
}

export function validateEvavoCraftGenomeProviderResponse(
  packet: EvavoCraftGenomeProviderPacket,
  value: unknown,
): EvavoCraftGenomeProviderResponseAcceptance {
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  if (!packet.ready || packet.blockers.length) blockers.push("Provider response cannot be accepted against a blocked or unready craft packet.");
  const schema = validatePacketIntegrity(packet, blockers);
  const root = record(value);
  if (!root) blockers.push("Craft provider response must be one JSON object.");
  if (root && !sameKeys(root, ROOT_KEYS)) blockers.push("Craft provider response root keys must exactly match the strict response contract.");

  let normalizedResponse: EvavoCraftGenomeProviderResponse | undefined;
  if (root && schema) {
    if (root.outputKind !== "evavo_book_studio_craft_genome_provider_response" || root.schemaVersion !== 1) blockers.push("Craft provider response output kind or schema version is invalid.");
    if (root.packetId !== packet.packetId || root.provider !== packet.provider || root.modelName !== packet.modelName || root.profileFingerprint !== packet.profileFingerprint) blockers.push("Craft provider response identity does not match the exact packet.");
    const targetUnitIds = stringArray(root.targetUnitIds, 256);
    const appliedDimensionIds = stringArray(root.appliedDimensionIds, 256);
    const preservedVoiceAnchorIds = stringArray(root.preservedVoiceAnchorIds, 256);
    const unresolvedRisks = stringArray(root.unresolvedRisks, 256);
    const candidateText = typeof root.candidateText === "string" ? root.candidateText : "";
    const dimensionIds = schema.properties?.appliedDimensionIds?.items?.enum ?? [];

    if (!targetUnitIds || !sameSet(targetUnitIds, packet.targetUnitIds)) blockers.push("Craft provider response must cover the exact packet target-unit set once each.");
    if (!candidateText.trim() || candidateText.length > 2_000_000) blockers.push("Craft provider response candidate text must be non-empty and within the 2,000,000 character bound.");
    if (!appliedDimensionIds?.length || appliedDimensionIds.some((id) => !dimensionIds.includes(id))) blockers.push("Craft provider response applied dimensions must be a non-empty subset of the packet dimensions.");

    const voiceAnchorIds = schema.properties?.preservedVoiceAnchorIds?.items?.enum ?? [];
    const rejectedPatternIds = schema.properties?.rejectedPatternChecks?.required ?? [];
    if (!preservedVoiceAnchorIds || !sameSet(preservedVoiceAnchorIds, voiceAnchorIds)) blockers.push("Craft provider response must preserve the exact project voice-anchor set.");
    if (!unresolvedRisks) blockers.push("Craft provider response unresolved risks must be a unique bounded string array.");
    else if (unresolvedRisks.length) requiredActions.push(`Resolve or explicitly adjudicate provider risks: ${unresolvedRisks.join(" | ")}.`);
    if (root.phraseOverlapScanRequired !== true) blockers.push("Craft provider response must require phrase-overlap scanning before canonical admission.");

    const checks = record(root.rejectedPatternChecks);
    if (!checks || !sameSet(Object.keys(checks), rejectedPatternIds)) blockers.push("Craft provider response must return exactly one check for every rejected pattern.");
    if (checks) {
      for (const patternId of rejectedPatternIds) {
        const check = record(checks[patternId]);
        if (!check || !sameKeys(check, CHECK_KEYS) || check.passed !== true || typeof check.evidence !== "string" || !check.evidence.trim() || check.evidence.length > 2000) blockers.push(`Rejected-pattern check ${patternId} must pass with concise evidence.`);
      }
    }

    const continuation = record(root.continuation);
    let continuationComplete = false;
    let remainingUnitIds: string[] = [];
    let exactTail = "";
    if (!continuation || !sameKeys(continuation, CONTINUATION_KEYS) || typeof continuation.complete !== "boolean" || typeof continuation.exactTail !== "string" || continuation.exactTail.length > 20_000) blockers.push("Craft provider response continuation state is malformed.");
    else {
      continuationComplete = continuation.complete;
      const parsedRemainingUnitIds = stringArray(continuation.remainingUnitIds, packet.targetUnitIds.length);
      remainingUnitIds = parsedRemainingUnitIds ?? [];
      exactTail = continuation.exactTail;
      if (!parsedRemainingUnitIds || remainingUnitIds.some((id) => !packet.targetUnitIds.includes(id))) blockers.push("Craft provider response remaining units must be a unique subset of target units.");
      if (continuationComplete && (remainingUnitIds.length || exactTail.length)) blockers.push("A complete craft response must not claim remaining units or a partial exact tail.");
      if (!continuationComplete && !remainingUnitIds.length && !exactTail.trim()) blockers.push("An incomplete craft response must preserve remaining units or an exact partial tail.");
      if (!continuationComplete) requiredActions.push("Resume the same persisted craft packet from its exact continuation state; do not canonicalize the partial response.");
    }

    if (!blockers.length && targetUnitIds && appliedDimensionIds && preservedVoiceAnchorIds && unresolvedRisks && checks && continuation) {
      normalizedResponse = {
        outputKind: "evavo_book_studio_craft_genome_provider_response",
        schemaVersion: 1,
        packetId: packet.packetId,
        provider: packet.provider,
        modelName: packet.modelName,
        profileFingerprint: packet.profileFingerprint,
        targetUnitIds,
        candidateText,
        appliedDimensionIds,
        preservedVoiceAnchorIds,
        rejectedPatternChecks: checks as EvavoCraftGenomeProviderResponse["rejectedPatternChecks"],
        unresolvedRisks,
        phraseOverlapScanRequired: true,
        continuation: { complete: continuationComplete, remainingUnitIds, exactTail },
      };
    }
  }

  const uniqueBlockers = cleanCraftIds(blockers);
  const uniqueActions = cleanCraftIds(requiredActions);
  const status: EvavoCraftGenomeProviderResponseAcceptance["status"] = uniqueBlockers.length
    ? "blocked"
    : normalizedResponse?.continuation.complete === false
      ? "continuation_required"
      : uniqueActions.length
        ? "needs_work"
        : "accepted_for_phrase_scan";
  const acceptedForPhraseScan = status === "accepted_for_phrase_scan";
  return {
    outputKind: "evavo_book_studio_craft_genome_provider_response_acceptance",
    schemaVersion: 1,
    status,
    packetId: packet.packetId,
    packetFingerprint: packet.packetFingerprint,
    responseContractSha256: packet.responseContractSha256,
    acceptedForPhraseScan,
    canonicalAdmissionAllowed: false,
    blockers: uniqueBlockers,
    requiredActions: uniqueActions,
    ...(normalizedResponse ? { normalizedResponse } : {}),
    nextAction: acceptedForPhraseScan
      ? "Run the exact candidate through rights-tracked phrase-overlap, manuscript continuity, anti-genericity and canonical commit gates."
      : uniqueBlockers[0] ?? uniqueActions[0] ?? "Preserve last-known-good prose and repair the provider response.",
    boundary: "Strict schema validity and identity matching make a response eligible only for further review. Canonical manuscript admission remains prohibited until phrase-overlap, continuity, anti-genericity, revision and commit evidence all pass.",
  };
}
