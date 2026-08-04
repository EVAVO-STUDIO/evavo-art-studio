import type {
  EvavoCraftGenomeCompileInput,
  EvavoCraftGenomeDimension,
  EvavoCraftGenomePolicy,
  EvavoCraftGenomeProfile,
  EvavoNormalizedCraftInfluence,
} from "./book-studio-legacy-craft-genome-types";
import {
  CRAFT_SAFE_ID,
  CRAFT_SHA256,
  cleanCraftIds,
  craftInfluenceVector,
  craftMechanismValue,
  craftVectorDistance,
  expectedCraftRightsBasis,
  roundCraftNumber,
  sha256CraftText,
  stableCraftJson,
  textLeaksExactPrivateLabel,
  textLeaksPrivateLabel,
  unique,
} from "./book-studio-legacy-craft-genome-utils";

const DEFAULT_POLICY: Required<EvavoCraftGenomePolicy> = {
  minimumInfluences: 2,
  maximumInfluences: 12,
  maximumDominantWeight: 0.6,
  minimumInfluenceDiversity: 0.08,
  minimumProfileDistanceFromInfluence: 0.03,
  maximumSynthesisDepth: 8,
  requireProjectVoiceAnchors: true,
  minimumProjectVoiceAnchors: 3,
};

function validatePolicy(policy: Required<EvavoCraftGenomePolicy>, blockers: string[]): void {
  if (!Number.isInteger(policy.minimumInfluences) || policy.minimumInfluences < 2 || policy.minimumInfluences > 12) blockers.push("Craft genome minimumInfluences must be an integer from 2 to 12.");
  if (!Number.isInteger(policy.maximumInfluences) || policy.maximumInfluences < policy.minimumInfluences || policy.maximumInfluences > 24) blockers.push("Craft genome maximumInfluences must be an integer from minimumInfluences to 24.");
  if (!(policy.maximumDominantWeight >= 0.25 && policy.maximumDominantWeight <= 0.8)) blockers.push("Craft genome maximumDominantWeight must be from 0.25 to 0.8.");
  if (!(policy.minimumInfluenceDiversity >= 0 && policy.minimumInfluenceDiversity <= 0.5)) blockers.push("Craft genome minimumInfluenceDiversity must be from 0 to 0.5.");
  if (!(policy.minimumProfileDistanceFromInfluence >= 0 && policy.minimumProfileDistanceFromInfluence <= 0.5)) blockers.push("Craft genome minimumProfileDistanceFromInfluence must be from 0 to 0.5.");
  if (!Number.isInteger(policy.maximumSynthesisDepth) || policy.maximumSynthesisDepth < 1 || policy.maximumSynthesisDepth > 16) blockers.push("Craft genome maximumSynthesisDepth must be an integer from 1 to 16.");
  if (!Number.isInteger(policy.minimumProjectVoiceAnchors) || policy.minimumProjectVoiceAnchors < 0 || policy.minimumProjectVoiceAnchors > 32) blockers.push("Craft genome minimumProjectVoiceAnchors must be an integer from 0 to 32.");
}

export function compileEvavoCraftGenome(input: EvavoCraftGenomeCompileInput): EvavoCraftGenomeProfile {
  const policy: Required<EvavoCraftGenomePolicy> = { ...DEFAULT_POLICY, ...input.policy };
  const blockers: string[] = [];
  const warnings: string[] = [];
  validatePolicy(policy, blockers);

  if (!input.programmeId.trim() || !input.profileId.trim() || !Number.isInteger(input.profileVersion) || input.profileVersion < 1) blockers.push("Craft genome requires stable programme, profile and positive profile-version identity.");
  if (input.influences.length < policy.minimumInfluences || input.influences.length > policy.maximumInfluences) blockers.push(`Craft genome requires ${policy.minimumInfluences}-${policy.maximumInfluences} influences.`);
  if (new Set(input.influences.map((item) => item.influenceId)).size !== input.influences.length) blockers.push("Craft influence IDs must be unique.");

  const validFingerprints = input.influences.map((item) => item.provenance.sourceFingerprint).filter((value) => CRAFT_SHA256.test(value));
  if (new Set(validFingerprints).size !== validFingerprints.length) blockers.push("Craft influences must not repeat the same source fingerprint under multiple identities.");
  if (policy.requireProjectVoiceAnchors && cleanCraftIds(input.projectVoiceAnchorIds).length < policy.minimumProjectVoiceAnchors) blockers.push(`Craft genome requires at least ${policy.minimumProjectVoiceAnchors} project-owned voice anchors.`);
  if (!cleanCraftIds(input.narrativeConstraintIds).length) blockers.push("Craft genome requires at least one narrative constraint.");

  const accepted = cleanCraftIds(input.acceptedPatternIds);
  const rejected = cleanCraftIds(input.rejectedPatternIds);
  const patternOverlap = accepted.filter((id) => rejected.includes(id));
  if (patternOverlap.length) blockers.push(`Patterns cannot be both accepted and rejected: ${patternOverlap.join(", ")}.`);

  const privateLabels = input.influences.map((item) => item.provenance.privateLabel).filter(Boolean);
  const influences = [...input.influences].sort((left, right) => left.influenceId.localeCompare(right.influenceId));
  const positiveWeights = new Map<string, number>();
  let totalWeight = 0;

  for (const influence of influences) {
    const provenance = influence.provenance;
    const positiveWeight = Number.isFinite(influence.requestedWeight) && influence.requestedWeight > 0 ? influence.requestedWeight : 0;
    positiveWeights.set(influence.influenceId, positiveWeight);
    totalWeight += positiveWeight;

    if (!(Number.isFinite(influence.requestedWeight) && influence.requestedWeight > 0)) blockers.push(`Craft influence ${influence.influenceId || "<unknown>"} requires a finite positive requestedWeight.`);
    if (!CRAFT_SAFE_ID.test(influence.influenceId)) blockers.push(`Craft influence ID is invalid: ${influence.influenceId || "<empty>"}.`);
    if (!provenance.sourceId.trim() || !provenance.privateLabel.trim() || !CRAFT_SHA256.test(provenance.sourceFingerprint) || !cleanCraftIds(provenance.rightsEvidenceIds).length) blockers.push(`Craft influence ${influence.influenceId || "<unknown>"} requires source identity, private label, SHA-256 fingerprint and rights evidence.`);
    if (provenance.rightsBasis !== expectedCraftRightsBasis(provenance.sourceKind)) blockers.push(`Craft influence ${influence.influenceId} has rights basis inconsistent with source kind ${provenance.sourceKind}.`);
    if (provenance.sourceKind === "restricted_reference" && provenance.providerContextAllowed) blockers.push(`Restricted reference ${influence.influenceId} cannot enter provider context.`);

    if (provenance.sourceKind === "synthesized_profile") {
      if (!provenance.parentProfileId?.trim() || !provenance.parentProfileFingerprint || !CRAFT_SHA256.test(provenance.parentProfileFingerprint)) blockers.push(`Synthesized influence ${influence.influenceId} requires parent profile identity and fingerprint.`);
      if (!Number.isInteger(provenance.parentSynthesisDepth) || (provenance.parentSynthesisDepth ?? 0) < 1) blockers.push(`Synthesized influence ${influence.influenceId} requires a positive parent synthesis depth.`);
      if (provenance.parentProfileId === input.profileId) blockers.push(`Craft profile ${input.profileId} cannot include itself as an ancestor.`);
    }

    if (!influence.mechanisms.length) blockers.push(`Craft influence ${influence.influenceId} requires observed mechanisms.`);
    const mechanismIds = influence.mechanisms.map((item) => item.mechanismId);
    if (new Set(mechanismIds).size !== mechanismIds.length) blockers.push(`Craft influence ${influence.influenceId} has duplicate mechanism IDs.`);

    for (const mechanism of influence.mechanisms) {
      const valuesValid = [mechanism.polarity, mechanism.strength, mechanism.confidence].every(Number.isFinite)
        && mechanism.polarity >= -1 && mechanism.polarity <= 1
        && mechanism.strength >= 0 && mechanism.strength <= 1
        && mechanism.confidence >= 0 && mechanism.confidence <= 1;
      if (!CRAFT_SAFE_ID.test(mechanism.mechanismId) || !CRAFT_SAFE_ID.test(mechanism.dimensionId) || mechanism.description.trim().length < 12 || mechanism.description.length > 600 || !cleanCraftIds(mechanism.evidenceIds).length) blockers.push(`Craft mechanism ${mechanism.mechanismId || "<unknown>"} requires safe IDs, a 12-600 character abstract description and evidence.`);
      if (!valuesValid) blockers.push(`Craft mechanism ${mechanism.mechanismId} has out-of-range polarity, strength or confidence.`);
      if (/\b(?:in the style of|write like|sound like|imitate|mimic)\b/i.test(mechanism.description)) blockers.push(`Craft mechanism ${mechanism.mechanismId} requests direct imitation instead of an abstract production mechanism.`);
      if (textLeaksPrivateLabel(`${mechanism.dimensionId} ${mechanism.description}`, privateLabels)) blockers.push(`Craft mechanism ${mechanism.mechanismId} leaks private source identity into the production layer.`);
      if (mechanism.surfaceSpecificity !== "general") warnings.push(`Withheld ${mechanism.mechanismId} from provider production because it is ${mechanism.surfaceSpecificity}.`);
      if (mechanism.surfaceSpecificity !== "general" && !provenance.phraseComparisonAllowed) blockers.push(`Craft mechanism ${mechanism.mechanismId} is surface-specific but its source is not authorised for comparison.`);
      if (provenance.sourceKind === "restricted_reference" && mechanism.surfaceSpecificity !== "general") warnings.push(`Restricted reference mechanism ${mechanism.mechanismId} remains analysis-only.`);
    }
    if (!influence.mechanisms.some((item) => item.surfaceSpecificity === "general")) blockers.push(`Craft influence ${influence.influenceId} has no general production mechanism after surface-specific material is withheld.`);
  }

  if (!(totalWeight > 0)) blockers.push("Craft influence weights must contain a positive total.");
  const weights = new Map(influences.map((influence) => [influence.influenceId, totalWeight > 0 ? (positiveWeights.get(influence.influenceId) ?? 0) / totalWeight : 0]));
  for (const [influenceId, weight] of weights) if (weight > policy.maximumDominantWeight) blockers.push(`Craft influence ${influenceId} dominates at ${roundCraftNumber(weight, 4)}; maximum is ${policy.maximumDominantWeight}.`);

  const vectors = new Map(influences.map((influence) => [influence.influenceId, craftInfluenceVector(influence)]));
  const dimensionIds = cleanCraftIds(influences.flatMap((influence) => influence.mechanisms.filter((item) => item.surfaceSpecificity === "general").map((item) => item.dimensionId)));
  if (dimensionIds.length < 2) blockers.push("Craft genome requires at least two distinct general production dimensions.");

  const pairwiseDistances: number[] = [];
  for (let left = 0; left < influences.length; left += 1) {
    for (let right = left + 1; right < influences.length; right += 1) pairwiseDistances.push(craftVectorDistance(vectors.get(influences[left]!.influenceId) ?? new Map(), vectors.get(influences[right]!.influenceId) ?? new Map(), dimensionIds));
  }
  const pairwiseInfluenceDiversity = pairwiseDistances.length ? roundCraftNumber(Math.min(...pairwiseDistances)) : 0;
  if (pairwiseInfluenceDiversity < policy.minimumInfluenceDiversity) blockers.push(`Craft influences are not materially distinct enough (${pairwiseInfluenceDiversity}); minimum diversity is ${policy.minimumInfluenceDiversity}.`);

  const dimensions: EvavoCraftGenomeDimension[] = dimensionIds.map((dimensionId) => {
    const observations = influences.flatMap((influence) => influence.mechanisms.filter((item) => item.surfaceSpecificity === "general" && item.dimensionId === dimensionId).map((mechanism) => ({ influence, mechanism })));
    const grouped = new Map<string, typeof observations>();
    for (const observation of observations) grouped.set(observation.influence.influenceId, [...(grouped.get(observation.influence.influenceId) ?? []), observation]);
    const summaries = Array.from(grouped, ([influenceId, items]) => ({
      influenceId,
      value: items.reduce((sum, item) => sum + craftMechanismValue(item.mechanism), 0) / items.length,
      confidence: items.reduce((sum, item) => sum + item.mechanism.confidence, 0) / items.length,
    }));
    const participatingWeight = summaries.reduce((sum, item) => sum + (weights.get(item.influenceId) ?? 0), 0);
    const value = summaries.reduce((sum, item) => sum + item.value * (weights.get(item.influenceId) ?? 0), 0);
    const confidence = summaries.reduce((sum, item) => sum + item.confidence * (weights.get(item.influenceId) ?? 0), 0);
    return {
      dimensionId,
      value: roundCraftNumber(Math.max(-1, Math.min(1, participatingWeight > 0 ? value / participatingWeight : 0))),
      confidence: roundCraftNumber(Math.max(0, Math.min(1, participatingWeight > 0 ? confidence / participatingWeight : 0))),
      mechanismCount: observations.length,
      productionDirections: unique(observations.map((item) => item.mechanism.description.trim())).sort(),
      sourceInfluenceIds: cleanCraftIds(observations.map((item) => item.influence.influenceId)),
    };
  });

  const profileVector = new Map(dimensions.map((dimension) => [dimension.dimensionId, dimension.value]));
  const influenceDistances = influences.map((influence) => ({ influenceId: influence.influenceId, distance: craftVectorDistance(profileVector, vectors.get(influence.influenceId) ?? new Map(), dimensionIds) }));
  for (const item of influenceDistances) if (item.distance < policy.minimumProfileDistanceFromInfluence) blockers.push(`Craft profile remains too close to influence ${item.influenceId} (${item.distance}); minimum distance is ${policy.minimumProfileDistanceFromInfluence}.`);

  const synthesisDepth = Math.max(0, ...influences.map((influence) => influence.provenance.sourceKind === "synthesized_profile" ? (influence.provenance.parentSynthesisDepth ?? 0) : 0)) + 1;
  if (synthesisDepth > policy.maximumSynthesisDepth) blockers.push(`Craft genome synthesis depth ${synthesisDepth} exceeds maximum ${policy.maximumSynthesisDepth}.`);
  const rawAncestry = influences.flatMap((influence) => [...(influence.provenance.ancestryProfileFingerprints ?? []), ...(influence.provenance.parentProfileFingerprint ? [influence.provenance.parentProfileFingerprint] : [])]).filter(Boolean);
  if (cleanCraftIds(rawAncestry).length !== rawAncestry.length) warnings.push("Duplicate craft-profile ancestry was collapsed; verify that the intended merge graph does not contain a cycle.");

  const normalizedInfluences: EvavoNormalizedCraftInfluence[] = influences.map((influence) => ({
    influenceId: influence.influenceId,
    normalizedWeight: roundCraftNumber(weights.get(influence.influenceId) ?? 0),
    sourceKind: influence.provenance.sourceKind,
    rightsBasis: influence.provenance.rightsBasis,
    sourceFingerprint: influence.provenance.sourceFingerprint,
    productionMechanismIds: cleanCraftIds(influence.mechanisms.filter((item) => item.surfaceSpecificity === "general").map((item) => item.mechanismId)),
    withheldMechanismIds: cleanCraftIds(influence.mechanisms.filter((item) => item.surfaceSpecificity !== "general").map((item) => item.mechanismId)),
    ancestryProfileFingerprints: cleanCraftIds([...(influence.provenance.ancestryProfileFingerprints ?? []), ...(influence.provenance.parentProfileFingerprint ? [influence.provenance.parentProfileFingerprint] : [])]),
    synthesisDepth: influence.provenance.sourceKind === "synthesized_profile" ? (influence.provenance.parentSynthesisDepth ?? 0) : 0,
  }));

  const providerInstruction = [
    `ORIGINAL CRAFT GENOME: ${input.profileId} v${input.profileVersion}`,
    "Use only the de-identified production mechanisms below. Do not infer, name, imitate, mimic or reconstruct any source creator or work.",
    "The profile is a constraint system, not a house-style template. Scene purpose, viewpoint, character perception, material circumstance, causality and project-owned voice evidence remain authoritative.",
    ...dimensions.map((dimension) => `- ${dimension.dimensionId} (${dimension.value >= 0 ? "+" : ""}${dimension.value}, confidence ${dimension.confidence}): ${dimension.productionDirections.join(" | ")}`),
    `Project-owned voice anchors: ${cleanCraftIds(input.projectVoiceAnchorIds).join(", ") || "none"}.`,
    `Narrative constraints: ${cleanCraftIds(input.narrativeConstraintIds).join(", ")}.`,
    `Accepted project patterns: ${accepted.join(", ") || "none"}.`,
    `Rejected model-default patterns: ${rejected.join(", ") || "none"}.`,
    "Create new expression. Never reuse distinctive phrases, scenes, characters, settings, plot sequences or recognisable surface mannerisms from reference material.",
    "Before acceptance, run withheld phrase-overlap comparison, whole-passage coherence review, surrounding-voice comparison and a genuinely independent review when the workflow assigns one.",
  ].join("\n");
  if (textLeaksExactPrivateLabel(providerInstruction, privateLabels)) blockers.push("Craft genome provider instruction leaked private source identity.");

  const unsigned = {
    outputKind: "evavo_book_studio_craft_genome_profile" as const,
    schemaVersion: 1 as const,
    status: (blockers.length ? "blocked" : "ready") as EvavoCraftGenomeProfile["status"],
    programmeId: input.programmeId.trim(),
    profileId: input.profileId.trim(),
    profileVersion: input.profileVersion,
    synthesisDepth,
    normalizedInfluences,
    dimensions,
    influenceDistances,
    pairwiseInfluenceDiversity,
    projectVoiceAnchorIds: cleanCraftIds(input.projectVoiceAnchorIds),
    narrativeConstraintIds: cleanCraftIds(input.narrativeConstraintIds),
    acceptedPatternIds: accepted,
    rejectedPatternIds: rejected,
    providerInstruction,
    providerBriefContainsNamedSources: false as const,
    directImitationPermitted: false as const,
    phraseLaunderingPermitted: false as const,
    projectOwnedExpressionRequired: true as const,
    blockers: cleanCraftIds(blockers),
    warnings: cleanCraftIds(warnings),
    nextAction: blockers.length
      ? "Repair rights, provenance, dominance, diversity, identity or production-mechanism blockers before any provider call."
      : "Bind this exact fingerprint to bounded authoring packets, preserve private provenance outside provider context, scan every candidate against withheld references and update the profile only from reviewed evidence.",
    boundary: "A multi-source craft genome can improve original writing, but combining influences does not itself establish legal clearance or originality. Only de-identified general mechanisms and project-owned anchors enter provider instructions; direct imitation, phrase laundering and source-identity prompting remain prohibited.",
  };
  return { ...unsigned, profileFingerprint: sha256CraftText(stableCraftJson(unsigned)) };
}
