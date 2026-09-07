import { createHash } from "node:crypto";
import { compareImageSimilarity } from "./image-similarity.js";

export const WORK_MEDIA_DIVERSITY_CONTRACT = "evavo.work-media-diversity.v1_1" as const;

export interface WorkMediaDiversityInput {
  readonly id: string;
  readonly image: Buffer;
  readonly role?: "header" | "tile" | "support" | "other";
  readonly route?: string;
}

export interface WorkMediaDiversitySpec {
  readonly images: readonly WorkMediaDiversityInput[];
  readonly nearDuplicateThreshold?: number;
  readonly reviewSimilarityThreshold?: number;
  readonly maximumImages?: number;
}

export interface WorkMediaDiversityResult {
  readonly contract: typeof WORK_MEDIA_DIVERSITY_CONTRACT;
  readonly evidence: Readonly<{
    imageCount: number;
    nearDuplicateThreshold: number;
    reviewSimilarityThreshold: number;
    similarityModel: "dhash-ahash-rgb-grid-v1";
    images: readonly Readonly<{
      id: string;
      route: string | null;
      role: "header" | "tile" | "support" | "other";
      sha256: string;
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
    duplicatePairs: readonly string[];
    nearDuplicatePairs: readonly string[];
    reviewSimilarityPairs: readonly string[];
    duplicateClusters: readonly (readonly string[])[];
    crossRouteNearDuplicateCount: number;
    distinctnessPass: boolean;
    visualReviewRequired: boolean;
    automaticReplacementAllowed: false;
  }>;
}

const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

function boundedThreshold(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1.`);
  return value;
}

function cleanImage(input: WorkMediaDiversityInput): WorkMediaDiversityInput {
  const id = String(input.id ?? "").trim();
  if (!id || id.length > 180) throw new Error("Every Work media item requires an id containing 1-180 characters.");
  if (!Buffer.isBuffer(input.image) || !input.image.length) throw new Error(`Work media item ${id} has no image bytes.`);
  const route = input.route === undefined ? undefined : String(input.route).trim();
  if (route !== undefined && route !== "" && !/^\/work\/[a-z0-9-]+$/u.test(route)) throw new Error(`Work media item ${id} has an invalid route.`);
  const role = input.role ?? "other";
  if (!new Set(["header", "tile", "support", "other"]).has(role)) throw new Error(`Work media item ${id} has an invalid role.`);
  return Object.freeze({ id, image: input.image, role, route: route || undefined });
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

/**
 * Read-only cross-page media QA. It catches exact/near duplicate imagery and
 * keeps independent shape, tone and color evidence so recolored artwork does not
 * get collapsed into one story merely because its grayscale structure matches.
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
  if (reviewSimilarityThreshold >= nearDuplicateThreshold) throw new Error("reviewSimilarityThreshold must be lower than nearDuplicateThreshold.");

  const pairs = [];
  const duplicatePairs: string[] = [];
  const nearDuplicatePairs: string[] = [];
  const reviewSimilarityPairs: string[] = [];
  const linkedPairs: [string, string][] = [];
  let crossRouteNearDuplicateCount = 0;

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
        leftId: left.id,
        rightId: right.id,
        leftRoute: left.route ?? null,
        rightRoute: right.route ?? null,
        leftRole: left.role ?? "other",
        rightRole: right.role ?? "other",
        exactBinaryMatch: similarity.exactBinaryMatch,
        differenceHashSimilarity: similarity.differenceHashSimilarity,
        averageHashSimilarity: similarity.averageHashSimilarity,
        colorGridSimilarity: similarity.colorGridSimilarity,
        colorGridMeanAbsoluteDifference: similarity.colorGridMeanAbsoluteDifference,
        perceptualSimilarity: similarity.perceptualSimilarity,
        classification,
        crossRoute,
      }));
    }
  }

  const duplicateClusters = clustersFromPairs(images.map((item) => item.id), linkedPairs);
  const distinctnessPass = duplicatePairs.length === 0 && crossRouteNearDuplicateCount === 0;
  return Object.freeze({
    contract: WORK_MEDIA_DIVERSITY_CONTRACT,
    evidence: Object.freeze({
      imageCount: images.length,
      nearDuplicateThreshold,
      reviewSimilarityThreshold,
      similarityModel: "dhash-ahash-rgb-grid-v1",
      images: Object.freeze(images.map((item) => Object.freeze({ id: item.id, route: item.route ?? null, role: item.role ?? "other", sha256: sha256(item.image) }))),
      pairs: Object.freeze(pairs),
      duplicatePairs: Object.freeze(duplicatePairs),
      nearDuplicatePairs: Object.freeze(nearDuplicatePairs),
      reviewSimilarityPairs: Object.freeze(reviewSimilarityPairs),
      duplicateClusters,
      crossRouteNearDuplicateCount,
      distinctnessPass,
      visualReviewRequired: true,
      automaticReplacementAllowed: false,
    }),
  });
}
