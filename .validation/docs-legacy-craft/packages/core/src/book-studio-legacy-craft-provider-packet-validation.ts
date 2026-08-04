import type { EvavoCraftGenomeProviderPacketInput } from "./book-studio-legacy-craft-genome-types";
import { CRAFT_SAFE_ID, CRAFT_SHA256, cleanCraftIds, sha256CraftText, stableCraftJson } from "./book-studio-legacy-craft-genome-utils";

const CRAFT_PROVIDERS = new Set<string>(["chatgpt", "claude", "other_compatible_model"]);

export interface EvavoValidatedCraftProviderPacketInput {
  packetId: string;
  modelName: string;
  objective: string;
  targetUnitIds: string[];
  contextEvidenceIds: string[];
  dimensionIds: string[];
  projectVoiceAnchorIds: string[];
  rejectedPatternIds: string[];
  blockers: string[];
}

export function validateEvavoCraftProviderPacketInput(input: EvavoCraftGenomeProviderPacketInput): EvavoValidatedCraftProviderPacketInput {
  const blockers: string[] = [];
  const packetId = input.packetId.trim();
  const modelName = input.modelName.trim();
  const objective = input.objective.trim();
  const rawTargetUnitIds = input.targetUnitIds.map((value) => value.trim()).filter(Boolean);
  const rawContextEvidenceIds = input.contextEvidenceIds.map((value) => value.trim()).filter(Boolean);
  const targetUnitIds = cleanCraftIds(input.targetUnitIds);
  const contextEvidenceIds = cleanCraftIds(input.contextEvidenceIds);

  if (!CRAFT_SAFE_ID.test(packetId) || !modelName || !objective) blockers.push("Craft genome provider packet requires a safe packet ID and non-empty model and objective identity.");
  if (modelName.length > 256 || objective.length > 20_000) blockers.push("Craft genome provider packet model or objective exceeds its bounded length.");
  if (!CRAFT_PROVIDERS.has(input.provider as string)) blockers.push(`Craft genome provider packet does not support provider ${String(input.provider)}.`);
  if (!targetUnitIds.length || !contextEvidenceIds.length) blockers.push("Craft genome provider packet requires exact target units and context evidence.");
  if (targetUnitIds.length > 256 || contextEvidenceIds.length > 512) blockers.push("Craft genome provider packet exceeds bounded target-unit or context-evidence counts.");
  if (new Set(rawTargetUnitIds).size !== rawTargetUnitIds.length) blockers.push("Craft genome provider packet target unit IDs must be unique after trimming.");
  if (new Set(rawContextEvidenceIds).size !== rawContextEvidenceIds.length) blockers.push("Craft genome provider packet context evidence IDs must be unique after trimming.");
  if (input.profile.status !== "ready" || input.profile.blockers.length) blockers.push("Craft genome provider packet requires a ready, blocker-free profile.");
  if (!CRAFT_SHA256.test(input.profile.profileFingerprint)) blockers.push("Craft genome provider packet requires a SHA-256 profile fingerprint.");

  const dimensionIds = cleanCraftIds(input.profile.dimensions.map((item) => item.dimensionId));
  const projectVoiceAnchorIds = cleanCraftIds(input.profile.projectVoiceAnchorIds);
  const rejectedPatternIds = cleanCraftIds(input.profile.rejectedPatternIds);
  if (dimensionIds.length !== input.profile.dimensions.length) blockers.push("Craft genome provider packet requires unique, non-empty profile dimension IDs.");
  if (projectVoiceAnchorIds.length !== input.profile.projectVoiceAnchorIds.length) blockers.push("Craft genome provider packet requires unique, non-empty project voice anchor IDs.");
  if (rejectedPatternIds.length !== input.profile.rejectedPatternIds.length) blockers.push("Craft genome provider packet requires unique, non-empty rejected pattern IDs.");
  if (!dimensionIds.length || dimensionIds.length > 256 || projectVoiceAnchorIds.length > 256 || rejectedPatternIds.length > 256) blockers.push("Craft genome provider packet requires 1-256 dimensions and no more than 256 voice anchors or rejected patterns.");

  const { profileFingerprint, ...unsignedProfile } = input.profile;
  if (profileFingerprint !== sha256CraftText(stableCraftJson(unsignedProfile))) blockers.push("Craft genome provider packet profile fingerprint does not match the supplied profile contents.");
  if (input.profile.providerBriefContainsNamedSources || input.profile.directImitationPermitted || input.profile.phraseLaunderingPermitted || !input.profile.projectOwnedExpressionRequired) blockers.push("Craft genome provider packet rejects named-source prompting, direct imitation, phrase laundering and non-project-owned expression.");

  return { packetId, modelName, objective, targetUnitIds, contextEvidenceIds, dimensionIds, projectVoiceAnchorIds, rejectedPatternIds, blockers: cleanCraftIds(blockers) };
}
