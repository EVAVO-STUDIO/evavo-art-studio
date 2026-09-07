import { createHash } from "node:crypto";
import { compareImageSimilarity } from "./image-similarity.js";

export const WORK_MEDIA_DIVERSITY_CONTRACT = "evavo.work-media-diversity.v1_2" as const;

export type WorkMediaRole = "header" | "tile" | "support" | "other";
export type WorkMediaStorySubject =
  | "product-ui" | "person-at-device" | "abstract-technology" | "physical-workplace" | "retail-shopfront"
  | "data-visualization" | "device-mockup" | "team-collaboration" | "infrastructure" | "document-workflow" | "other";
export type WorkMediaStorySetting =
  | "browser-ui" | "desktop-device" | "mobile-device" | "office" | "retail" | "studio" | "outdoors" | "abstract" | "industrial" | "mixed" | "other";
export type WorkMediaStoryActivity =
  | "browsing" | "analysing" | "designing" | "collaborating" | "operating" | "purchasing" | "communicating" | "presenting" | "monitoring" | "none" | "other";
export type WorkMediaStoryComposition =
  | "centered-device" | "angled-device" | "split-screen" | "full-bleed-ui" | "person-with-screen" | "close-up-object"
  | "environment-wide" | "diagrammatic" | "collage" | "abstract-field" | "other";
export type WorkMediaStorySpecificity = "specific" | "mixed" | "generic";

export interface WorkMediaStoryDescriptor {
  readonly subject: WorkMediaStorySubject;
  readonly setting: WorkMediaStorySetting;
  readonly activity: WorkMediaStoryActivity;
  readonly composition: WorkMediaStoryComposition;
  readonly specificity: WorkMediaStorySpecificity;
  readonly motifTokens?: readonly string[];
  readonly genericStockOrAiFiller: boolean;
}

export interface WorkMediaDiversityInput {
  readonly id: string;
  readonly image: Buffer;
  readonly role?: WorkMediaRole;
  readonly route?: string;
  readonly story?: WorkMediaStoryDescriptor;
}

export interface WorkMediaDiversitySpec {
  readonly images: readonly WorkMediaDiversityInput[];
  readonly nearDuplicateThreshold?: number;
  readonly reviewSimilarityThreshold?: number;
  readonly storyCollisionThreshold?: number;
  readonly storyReviewThreshold?: number;
  readonly requireStoryReview?: boolean;
  readonly maximumImages?: number;
}

export interface WorkMediaDiversityResult {
  readonly contract: typeof WORK_MEDIA_DIVERSITY_CONTRACT;
  readonly evidence: Readonly<{
    imageCount: number;
    nearDuplicateThreshold: number;
    reviewSimilarityThreshold: number;
    storyCollisionThreshold: number;
    storyReviewThreshold: number;
    similarityModel: "dhash-ahash-rgb-grid-v1";
    storySimilarityModel: "work-story-archetype-v1";
    images: readonly Readonly<{
      id: string;
      route: string | null;
      role: WorkMediaRole;
      sha256: string;
      story: WorkMediaStoryDescriptor | null;
    }>[];
    pairs: readonly Readonly<{
      leftId: string;
      rightId: string;
      leftRoute: string | null;
      rightRoute: string | null;
      leftRole: string;
      rightRole: string;
      exactBinaryMatch: boolean;
      differenceHashSimilarity: number;
      averageHashSimilarity: number;
      colorGridSimilarity: number;
      colorGridMeanAbsoluteDifference: number;
      perceptualSimilarity: number;
      classification: "duplicate" | "near-duplicate" | "review-similarity" | "distinct";
      crossRoute: boolean;
    }>[];
    storyPairs: readonly Readonly<{
      leftId: string;
      rightId: string;
      leftRoute: string | null;
      rightRoute: string | null;
      crossRoute: boolean;
      archetypeMatchCount: number;
      motifJaccardSimilarity: number;
      storySimilarity: number;
      classification: "story-duplicate" | "story-collision" | "story-review" | "story-distinct" | "story-unreviewed";
    }>[];
    duplicatePairs: readonly string[];
    nearDuplicatePairs: readonly string[];
    reviewSimilarityPairs: readonly string[];
    duplicateClusters: readonly (readonly string[])[];
    crossRouteDuplicateCount: number;
    crossRouteNearDuplicateCount: number;
    storyCollisionPairs: readonly string[];
    storyReviewPairs: readonly string[];
    genericOrFillerItems: readonly string[];
    missingStoryReviewIds: readonly string[];
    crossRouteStoryCollisionCount: number;
    perceptualDistinctnessPass: boolean;
    storyReviewRequired: boolean;
    storyReviewComplete: boolean;
    storyDistinctnessPass: boolean;
    semanticStoryReviewPassed: boolean;
    distinctnessPass: boolean;
    visualReviewRequired: boolean;
    automaticReplacementAllowed: false;
  }>;
}

const SUBJECTS = new Set<WorkMediaStorySubject>(["product-ui", "person-at-device", "abstract-technology", "physical-workplace", "retail-shopfront", "data-visualization", "device-mockup", "team-collaboration", "infrastructure", "document-workflow", "other"]);
const SETTINGS = new Set<WorkMediaStorySetting>(["browser-ui", "desktop-device", "mobile-device", "office", "retail", "studio", "outdoors", "abstract", "industrial", "mixed", "other"]);
const ACTIVITIES = new Set<WorkMediaStoryActivity>(["browsing", "analysing", "designing", "collaborating", "operating", "purchasing", "communicating", "presenting", "monitoring", "none", "other"]);
const COMPOSITIONS = new Set<WorkMediaStoryComposition>(["centered-device", "angled-device", "split-screen", "full-bleed-ui", "person-with-screen", "close-up-object", "environment-wide", "diagrammatic", "collage", "abstract-field", "other"]);
const SPECIFICITY = new Set<WorkMediaStorySpecificity>(["specific", "mixed", "generic"]);
const ROLES = new Set<WorkMediaRole>(["header", "tile", "support", "other"]);
const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

function boundedThreshold(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1.`);
  return value;
}

function cleanMotifTokens(value: readonly string[] | undefined, id: string): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 12) throw new Error(`Work media item ${id} motifTokens must contain at most 12 tokens.`);
  const tokens = value.map((token) => String(token).trim().toLowerCase());
  for (const token of tokens) if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(token)) throw new Error(`Work media item ${id} contains an invalid motif token.`);
  return Object.freeze([...new Set(tokens)].sort());
}

function cleanStory(value: WorkMediaStoryDescriptor | undefined, id: string): WorkMediaStoryDescriptor | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error(`Work media item ${id} story must be an object.`);
  if (!SUBJECTS.has(value.subject)) throw new Error(`Work media item ${id} has an invalid story subject.`);
  if (!SETTINGS.has(value.setting)) throw new Error(`Work media item ${id} has an invalid story setting.`);
  if (!ACTIVITIES.has(value.activity)) throw new Error(`Work media item ${id} has an invalid story activity.`);
  if (!COMPOSITIONS.has(value.composition)) throw new Error(`Work media item ${id} has an invalid story composition.`);
  if (!SPECIFICITY.has(value.specificity)) throw new Error(`Work media item ${id} has an invalid story specificity.`);
  if (typeof value.genericStockOrAiFiller !== "boolean") throw new Error(`Work media item ${id} story genericStockOrAiFiller must be boolean.`);
  return Object.freeze({
    subject: value.subject,
    setting: value.setting,
    activity: value.activity,
    composition: value.composition,
    specificity: value.specificity,
    motifTokens: cleanMotifTokens(value.motifTokens, id),
    genericStockOrAiFiller: value.genericStockOrAiFiller,
  });
}

function cleanImage(input: WorkMediaDiversityInput): WorkMediaDiversityInput {
  const id = String(input.id ?? "").trim();
  if (!id || id.length > 180) throw new Error("Every Work media item requires an id containing 1-180 characters.");
  if (!Buffer.isBuffer(input.image) || !input.image.length) throw new Error(`Work media item ${id} has no image bytes.`);
  const route = input.route === undefined ? undefined : String(input.route).trim();
  if (route !== undefined && route !== "" && !/^\/work\/[a-z0-9-]+$/u.test(route)) throw new Error(`Work media item ${id} has an invalid route.`);
  const role = input.role ?? "other";
  if (!ROLES.has(role)) throw new Error(`Work media item ${id} has an invalid role.`);
  return Object.freeze({ id, image: input.image, role, route: route || undefined, story: cleanStory(input.story, id) });
}

function clustersFromPairs(ids: readonly string[], linkedPairs: readonly [string, string][]): readonly (readonly string[])[] {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    let current = parent.get(id)!;
    while (current !== parent.get(current)) current = parent.get(current)!;
    let node = id;
    while (parent.get(node) !== current) {
      const next = parent.get(node)!;
      parent.set(node, current);
      node = next;
    }
    return current;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const [a, b] of linkedPairs) union(a, b);
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const group = groups.get(root) ?? [];
    group.push(id);
    groups.set(root, group);
  }
  return Object.freeze([...groups.values()].filter((group) => group.length > 1).map((group) => Object.freeze(group.sort())));
}

function motifJaccard(left: WorkMediaStoryDescriptor, right: WorkMediaStoryDescriptor): number {
  const a = new Set(left.motifTokens ?? []);
  const b = new Set(right.motifTokens ?? []);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / union.size;
}

function storyPair(left: WorkMediaDiversityInput, right: WorkMediaDiversityInput, collisionThreshold: number, reviewThreshold: number) {
  const crossRoute = Boolean(left.route && right.route && left.route !== right.route);
  if (!left.story || !right.story) return Object.freeze({
    leftId: left.id, rightId: right.id, leftRoute: left.route ?? null, rightRoute: right.route ?? null, crossRoute,
    archetypeMatchCount: 0, motifJaccardSimilarity: 0, storySimilarity: 0, classification: "story-unreviewed" as const,
  });
  const matches = [
    left.story.subject === right.story.subject,
    left.story.setting === right.story.setting,
    left.story.activity === right.story.activity,
    left.story.composition === right.story.composition,
  ];
  const archetypeMatchCount = matches.filter(Boolean).length;
  const motifSimilarity = motifJaccard(left.story, right.story);
  const storySimilarity = (
    Number(matches[0]) * 0.30 + Number(matches[1]) * 0.20 + Number(matches[2]) * 0.20 + Number(matches[3]) * 0.20 + motifSimilarity * 0.10
  );
  let classification: "story-duplicate" | "story-collision" | "story-review" | "story-distinct" = "story-distinct";
  if (crossRoute && archetypeMatchCount === 4) classification = "story-duplicate";
  else if (crossRoute && archetypeMatchCount >= 3 && storySimilarity >= collisionThreshold) classification = "story-collision";
  else if (storySimilarity >= reviewThreshold) classification = "story-review";
  return Object.freeze({
    leftId: left.id, rightId: right.id, leftRoute: left.route ?? null, rightRoute: right.route ?? null, crossRoute,
    archetypeMatchCount, motifJaccardSimilarity: motifSimilarity, storySimilarity, classification,
  });
}

/**
 * Read-only cross-page Work media QA. Pixel similarity catches duplicate artwork;
 * structured visual-story descriptors catch repeated generic storytelling even
 * when the actual pixels are different (for example another person-at-laptop
 * hero with the same composition and setting).
 */
export async function reviewWorkMediaDiversity(spec: WorkMediaDiversitySpec): Promise<WorkMediaDiversityResult> {
  const maximumImages = spec.maximumImages ?? 48;
  if (!Number.isInteger(maximumImages) || maximumImages < 2 || maximumImages > 96) throw new Error("maximumImages must be an integer from 2 through 96.");
  if (!Array.isArray(spec.images) || spec.images.length < 2) throw new Error("At least two Work media images are required.");
  if (spec.images.length > maximumImages) throw new Error(`Work media image count exceeds maximumImages (${maximumImages}).`);
  const images = spec.images.map(cleanImage);
  if (new Set(images.map((item) => item.id)).size !== images.length) throw new Error("Work media ids must be unique.");

  const nearDuplicateThreshold = boundedThreshold(spec.nearDuplicateThreshold, 0.92, "nearDuplicateThreshold");
  const reviewSimilarityThreshold = boundedThreshold(spec.reviewSimilarityThreshold, 0.84, "reviewSimilarityThreshold");
  const storyCollisionThreshold = boundedThreshold(spec.storyCollisionThreshold, 0.78, "storyCollisionThreshold");
  const storyReviewThreshold = boundedThreshold(spec.storyReviewThreshold, 0.58, "storyReviewThreshold");
  if (reviewSimilarityThreshold >= nearDuplicateThreshold) throw new Error("reviewSimilarityThreshold must be lower than nearDuplicateThreshold.");
  if (storyReviewThreshold >= storyCollisionThreshold) throw new Error("storyReviewThreshold must be lower than storyCollisionThreshold.");
  const storyReviewRequired = spec.requireStoryReview === true;

  const pairs = [];
  const storyPairs = [];
  const duplicatePairs: string[] = [];
  const nearDuplicatePairs: string[] = [];
  const reviewSimilarityPairs: string[] = [];
  const storyCollisionPairs: string[] = [];
  const storyReviewPairs: string[] = [];
  const linkedPairs: [string, string][] = [];
  let crossRouteDuplicateCount = 0;
  let crossRouteNearDuplicateCount = 0;
  let crossRouteStoryCollisionCount = 0;

  for (let leftIndex = 0; leftIndex < images.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < images.length; rightIndex += 1) {
      const left = images[leftIndex]!;
      const right = images[rightIndex]!;
      const similarity = await compareImageSimilarity(left.image, right.image, { nearDuplicateThreshold });
      const crossRoute = Boolean(left.route && right.route && left.route !== right.route);
      const pairId = `${left.id}::${right.id}`;
      let classification: "duplicate" | "near-duplicate" | "review-similarity" | "distinct" = "distinct";
      if (similarity.exactBinaryMatch) {
        classification = "duplicate";
        duplicatePairs.push(pairId);
        linkedPairs.push([left.id, right.id]);
        if (crossRoute) crossRouteDuplicateCount += 1;
      } else if (similarity.perceptualSimilarity >= nearDuplicateThreshold) {
        classification = "near-duplicate";
        nearDuplicatePairs.push(pairId);
        linkedPairs.push([left.id, right.id]);
        if (crossRoute) crossRouteNearDuplicateCount += 1;
      } else if (similarity.perceptualSimilarity >= reviewSimilarityThreshold) {
        classification = "review-similarity";
        reviewSimilarityPairs.push(pairId);
      }
      pairs.push(Object.freeze({
        leftId: left.id, rightId: right.id, leftRoute: left.route ?? null, rightRoute: right.route ?? null,
        leftRole: left.role ?? "other", rightRole: right.role ?? "other", exactBinaryMatch: similarity.exactBinaryMatch,
        differenceHashSimilarity: similarity.differenceHashSimilarity, averageHashSimilarity: similarity.averageHashSimilarity,
        colorGridSimilarity: similarity.colorGridSimilarity, colorGridMeanAbsoluteDifference: similarity.colorGridMeanAbsoluteDifference,
        perceptualSimilarity: similarity.perceptualSimilarity, classification, crossRoute,
      }));

      const semantic = storyPair(left, right, storyCollisionThreshold, storyReviewThreshold);
      storyPairs.push(semantic);
      if (semantic.classification === "story-duplicate" || semantic.classification === "story-collision") {
        storyCollisionPairs.push(pairId);
        if (semantic.crossRoute) crossRouteStoryCollisionCount += 1;
      } else if (semantic.classification === "story-review") storyReviewPairs.push(pairId);
    }
  }

  const missingStoryReviewIds = images.filter((item) => !item.story).map((item) => item.id);
  const genericOrFillerItems = images.filter((item) => item.story && (item.story.genericStockOrAiFiller || item.story.specificity === "generic")).map((item) => item.id);
  const storyReviewComplete = missingStoryReviewIds.length === 0;
  const perceptualDistinctnessPass = crossRouteDuplicateCount === 0 && crossRouteNearDuplicateCount === 0;
  const semanticStoryReviewPassed = storyReviewComplete && crossRouteStoryCollisionCount === 0 && genericOrFillerItems.length === 0;
  const storyDistinctnessPass = storyReviewComplete ? semanticStoryReviewPassed : !storyReviewRequired;
  const duplicateClusters = clustersFromPairs(images.map((item) => item.id), linkedPairs);

  return Object.freeze({
    contract: WORK_MEDIA_DIVERSITY_CONTRACT,
    evidence: Object.freeze({
      imageCount: images.length,
      nearDuplicateThreshold,
      reviewSimilarityThreshold,
      storyCollisionThreshold,
      storyReviewThreshold,
      similarityModel: "dhash-ahash-rgb-grid-v1",
      storySimilarityModel: "work-story-archetype-v1",
      images: Object.freeze(images.map((item) => Object.freeze({ id: item.id, route: item.route ?? null, role: item.role ?? "other", sha256: sha256(item.image), story: item.story ?? null }))),
      pairs: Object.freeze(pairs),
      storyPairs: Object.freeze(storyPairs),
      duplicatePairs: Object.freeze(duplicatePairs),
      nearDuplicatePairs: Object.freeze(nearDuplicatePairs),
      reviewSimilarityPairs: Object.freeze(reviewSimilarityPairs),
      duplicateClusters,
      crossRouteDuplicateCount,
      crossRouteNearDuplicateCount,
      storyCollisionPairs: Object.freeze(storyCollisionPairs),
      storyReviewPairs: Object.freeze(storyReviewPairs),
      genericOrFillerItems: Object.freeze(genericOrFillerItems),
      missingStoryReviewIds: Object.freeze(missingStoryReviewIds),
      crossRouteStoryCollisionCount,
      perceptualDistinctnessPass,
      storyReviewRequired,
      storyReviewComplete,
      storyDistinctnessPass,
      semanticStoryReviewPassed,
      distinctnessPass: perceptualDistinctnessPass && storyDistinctnessPass,
      visualReviewRequired: true,
      automaticReplacementAllowed: false,
    }),
  });
}
