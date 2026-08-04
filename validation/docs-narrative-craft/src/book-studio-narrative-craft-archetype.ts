import { BOOK_NARRATIVE_ARCHETYPES } from "./book-studio-narrative-craft-knowledge";
import type { BookNarrativeArchetypeId, BookNarrativeCompositeDimensionV1, BookNarrativeCraftPolicyV1, BookNarrativeNormalizedArchetypeWeightV1 } from "./book-studio-narrative-craft-types";
import { duplicateReviewCraftValues, rejectReviewCraftUnknown, reviewCraftArray, reviewCraftEnum, reviewCraftFinite, reviewCraftRecord, roundReviewCraft, uniqueReviewCraft } from "./book-studio-review-craft-shared";

const ARCHETYPE_IDS = new Set<BookNarrativeArchetypeId>(BOOK_NARRATIVE_ARCHETYPES.map((item) => item.archetypeId));
const ARCHETYPE_WEIGHT_KEYS = new Set(["archetypeId", "requestedWeight"]);

export function parseArchetypeMix(value: unknown, policy: Required<BookNarrativeCraftPolicyV1>, blockers: string[]): { normalizedArchetypes: BookNarrativeNormalizedArchetypeWeightV1[]; compositeDimensions: BookNarrativeCompositeDimensionV1[]; minimumDistanceFromArchetype: number } {
  const records = reviewCraftArray(value, "archetypeMix", blockers, policy.minimumCompositeArchetypes, policy.maximumCompositeArchetypes);
  const parsed = records.map((item, index) => {
    const source = reviewCraftRecord(item, `archetypeMix ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, ARCHETYPE_WEIGHT_KEYS, `archetypeMix ${index + 1}`, blockers);
    return { archetypeId: reviewCraftEnum(source.archetypeId, ARCHETYPE_IDS, `archetypeMix ${index + 1} archetypeId`, blockers, "intimate_social_realism"), requestedWeight: reviewCraftFinite(source.requestedWeight, `archetypeMix ${index + 1} requestedWeight`, blockers, Number.MIN_VALUE, 1_000) };
  }).sort((left, right) => left.archetypeId.localeCompare(right.archetypeId));
  const duplicates = duplicateReviewCraftValues(parsed.map((item) => item.archetypeId));
  if (duplicates.length) blockers.push(`Archetype IDs are duplicated: ${duplicates.join(", ")}.`);
  const total = parsed.reduce((sum, item) => sum + item.requestedWeight, 0);
  if (!(total > 0)) blockers.push("Archetype mix requires a positive total weight.");
  const normalizedArchetypes = parsed.map((item) => ({ archetypeId: item.archetypeId, normalizedWeight: roundReviewCraft(total > 0 ? item.requestedWeight / total : 0) }));
  for (const item of normalizedArchetypes) if (item.normalizedWeight > policy.maximumDominantArchetypeWeight) blockers.push(`Archetype ${item.archetypeId} dominates at ${item.normalizedWeight}; maximum is ${policy.maximumDominantArchetypeWeight}.`);
  const selected = normalizedArchetypes.map((item) => ({ weight: item.normalizedWeight, archetype: BOOK_NARRATIVE_ARCHETYPES.find((candidate) => candidate.archetypeId === item.archetypeId) })).filter((item): item is { weight: number; archetype: (typeof BOOK_NARRATIVE_ARCHETYPES)[number] } => item.archetype !== undefined);
  const dimensionIds = uniqueReviewCraft(selected.flatMap((item) => item.archetype.dimensionValues.map((dimension) => dimension.dimensionId))).sort();
  const compositeDimensions = dimensionIds.map((dimensionId) => ({ dimensionId, value: roundReviewCraft(selected.reduce((sum, item) => { const dimension = item.archetype.dimensionValues.find((candidate) => candidate.dimensionId === dimensionId); return sum + (dimension?.value ?? 0) * item.weight; }, 0)), sourceArchetypeIds: selected.filter((item) => item.archetype.dimensionValues.some((dimension) => dimension.dimensionId === dimensionId)).map((item) => item.archetype.archetypeId).sort() }));
  const compositeVector = new Map(compositeDimensions.map((item) => [item.dimensionId, item.value]));
  const distances = selected.map((item) => vectorDistance(compositeVector, new Map(item.archetype.dimensionValues.map((dimension) => [dimension.dimensionId, dimension.value])), dimensionIds));
  const minimumDistanceFromArchetype = roundReviewCraft(distances.length ? Math.min(...distances) : 0);
  if (minimumDistanceFromArchetype < 0.05) blockers.push(`Composite narrative profile remains too close to one archetype (${minimumDistanceFromArchetype}); minimum is 0.05.`);
  return { normalizedArchetypes, compositeDimensions, minimumDistanceFromArchetype };
}

function vectorDistance(left: Map<string, number>, right: Map<string, number>, dimensions: string[]): number {
  if (!dimensions.length) return 0;
  const sum = dimensions.reduce((total, dimension) => total + ((left.get(dimension) ?? 0) - (right.get(dimension) ?? 0)) ** 2, 0);
  return Math.sqrt(sum / dimensions.length);
}
