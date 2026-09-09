export const UV_LAYOUT_REVIEW_CONTRACT = "evavo.uv-layout-review.v2" as const;

export type UvLayoutGrade = "pass" | "warn" | "fail";
export type UvPolicy = "ignore" | "warn" | "reject";
export type UvOrientationConvention = "majority" | "positive" | "negative";

export interface UvPoint {
  readonly u: number;
  readonly v: number;
}

export interface Position3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface UvTriangle {
  readonly id: string;
  readonly uv: readonly [UvPoint, UvPoint, UvPoint];
  readonly position?: readonly [Position3, Position3, Position3];
  /** Triangles with the same non-empty group may intentionally share UV space. */
  readonly overlapGroup?: string;
}

export interface UvLayoutReviewSpec {
  readonly allowTiledCoordinates?: boolean;
  readonly overlapPolicy?: UvPolicy;
  readonly mirroredPolicy?: UvPolicy;
  /** Majority avoids treating a globally flipped UV convention as accidental mirroring. */
  readonly orientationConvention?: UvOrientationConvention;
  readonly uvAreaEpsilon?: number;
  readonly uvEqualityTolerance?: number;
  readonly textureWidth?: number;
  readonly textureHeight?: number;
  readonly maximumTexelDensityRatio?: number;
  readonly minimumAtlasBoundaryPaddingTexels?: number;
  readonly minimumIslandPaddingTexels?: number;
}

export interface UvOverlapPair {
  readonly a: string;
  readonly b: string;
  readonly allowedByGroup: boolean;
}

export interface UvIslandEvidence {
  readonly id: string;
  readonly triangleIds: readonly string[];
  readonly overlapGroup: string | null;
  readonly bounds: Readonly<{ minU: number; minV: number; maxU: number; maxV: number }>;
  readonly boundaryPaddingTexels: number | null;
}

export interface UvIslandSpacingEvidence {
  readonly eligiblePairCount: number;
  readonly minimumPaddingTexels: number | null;
  readonly closestPair: Readonly<{ a: string; b: string; paddingTexels: number }> | null;
  readonly requiredMinimumPaddingTexels: number;
}

export interface UvTexelDensityEvidence {
  readonly sampleCount: number;
  readonly medianTexelsPerWorldUnit: number;
  readonly minimumTexelsPerWorldUnit: number;
  readonly maximumTexelsPerWorldUnit: number;
  readonly maximumAllowedRatio: number;
  readonly outlierTriangleIds: readonly string[];
}

export interface UvLayoutReviewEvidence {
  readonly contract: typeof UV_LAYOUT_REVIEW_CONTRACT;
  readonly grade: UvLayoutGrade;
  readonly triangleCount: number;
  readonly islandCount: number;
  readonly orientation: Readonly<{
    convention: UvOrientationConvention;
    referenceSign: "positive" | "negative";
    positiveTriangleCount: number;
    negativeTriangleCount: number;
    minorityRatio: number;
  }>;
  readonly degenerateUvTriangleIds: readonly string[];
  readonly degenerateWorldTriangleIds: readonly string[];
  readonly outsideUnitSquareTriangleIds: readonly string[];
  readonly mirroredTriangleIds: readonly string[];
  readonly overlapPairs: readonly UvOverlapPair[];
  readonly islands: readonly UvIslandEvidence[];
  readonly islandSpacing: UvIslandSpacingEvidence | null;
  readonly texelDensity: UvTexelDensityEvidence | null;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly visualChecks: readonly string[];
}

type Bounds = { minU: number; minV: number; maxU: number; maxV: number };
type OrientationSign = 1 | -1;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function positive(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than 0.`);
  return value;
}

function nonNegative(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`);
  return value;
}

function policy(value: UvPolicy | undefined, fallback: UvPolicy, label: string): UvPolicy {
  const resolved = value ?? fallback;
  if (resolved !== "ignore" && resolved !== "warn" && resolved !== "reject") throw new Error(`${label} must be ignore, warn or reject.`);
  return resolved;
}

function orientationConvention(value: UvOrientationConvention | undefined): UvOrientationConvention {
  const resolved = value ?? "majority";
  if (resolved !== "majority" && resolved !== "positive" && resolved !== "negative") {
    throw new Error("orientationConvention must be majority, positive or negative.");
  }
  return resolved;
}

function signedUvArea(uv: readonly [UvPoint, UvPoint, UvPoint]): number {
  const [a, b, c] = uv;
  return ((b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u)) / 2;
}

function worldArea(position: readonly [Position3, Position3, Position3]): number {
  const [a, b, c] = position;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
}

function boundsOf(uv: readonly [UvPoint, UvPoint, UvPoint]): Bounds {
  return {
    minU: Math.min(uv[0].u, uv[1].u, uv[2].u),
    minV: Math.min(uv[0].v, uv[1].v, uv[2].v),
    maxU: Math.max(uv[0].u, uv[1].u, uv[2].u),
    maxV: Math.max(uv[0].v, uv[1].v, uv[2].v),
  };
}

function boundsOverlap(a: Bounds, b: Bounds, tolerance: number): boolean {
  return !(a.maxU < b.minU - tolerance || b.maxU < a.minU - tolerance || a.maxV < b.minV - tolerance || b.maxV < a.minV - tolerance);
}

function boundsDistancePixels(a: Bounds, b: Bounds, width: number, height: number): number {
  const du = Math.max(0, b.minU - a.maxU, a.minU - b.maxU) * width;
  const dv = Math.max(0, b.minV - a.maxV, a.minV - b.maxV) * height;
  return Math.sqrt(du * du + dv * dv);
}

function orient(a: UvPoint, b: UvPoint, c: UvPoint): number {
  return (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);
}

function samePoint(a: UvPoint, b: UvPoint, tolerance: number): boolean {
  return Math.abs(a.u - b.u) <= tolerance && Math.abs(a.v - b.v) <= tolerance;
}

function pointInTriangleStrict(point: UvPoint, uv: readonly [UvPoint, UvPoint, UvPoint], tolerance: number): boolean {
  const s1 = orient(uv[0], uv[1], point);
  const s2 = orient(uv[1], uv[2], point);
  const s3 = orient(uv[2], uv[0], point);
  return (s1 > tolerance && s2 > tolerance && s3 > tolerance) || (s1 < -tolerance && s2 < -tolerance && s3 < -tolerance);
}

function properSegmentIntersection(a: UvPoint, b: UvPoint, c: UvPoint, d: UvPoint, tolerance: number): boolean {
  if (samePoint(a, c, tolerance) || samePoint(a, d, tolerance) || samePoint(b, c, tolerance) || samePoint(b, d, tolerance)) return false;
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return ((o1 > tolerance && o2 < -tolerance) || (o1 < -tolerance && o2 > tolerance))
    && ((o3 > tolerance && o4 < -tolerance) || (o3 < -tolerance && o4 > tolerance));
}

function centroid(uv: readonly [UvPoint, UvPoint, UvPoint]): UvPoint {
  return { u: (uv[0].u + uv[1].u + uv[2].u) / 3, v: (uv[0].v + uv[1].v + uv[2].v) / 3 };
}

function trianglesOverlap(a: readonly [UvPoint, UvPoint, UvPoint], b: readonly [UvPoint, UvPoint, UvPoint], tolerance: number): boolean {
  if (pointInTriangleStrict(centroid(a), b, tolerance) || pointInTriangleStrict(centroid(b), a, tolerance)) return true;
  for (let ai = 0; ai < 3; ai += 1) {
    for (let bi = 0; bi < 3; bi += 1) {
      if (properSegmentIntersection(a[ai]!, a[(ai + 1) % 3]!, b[bi]!, b[(bi + 1) % 3]!, tolerance)) return true;
    }
  }
  return false;
}

function pointKey(point: UvPoint, tolerance: number): string {
  const scale = 1 / tolerance;
  return `${Math.round(point.u * scale)},${Math.round(point.v * scale)}`;
}

function edgeKey(a: UvPoint, b: UvPoint, tolerance: number): string {
  const left = pointKey(a, tolerance);
  const right = pointKey(b, tolerance);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function pixelPoint(point: UvPoint, width: number, height: number): UvPoint {
  return { u: point.u * width, v: point.v * height };
}

function pointSegmentDistance(point: UvPoint, a: UvPoint, b: UvPoint): number {
  const dx = b.u - a.u;
  const dy = b.v - a.v;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.u - a.u, point.v - a.v);
  const t = Math.max(0, Math.min(1, ((point.u - a.u) * dx + (point.v - a.v) * dy) / lengthSq));
  return Math.hypot(point.u - (a.u + t * dx), point.v - (a.v + t * dy));
}

function segmentDistance(a: UvPoint, b: UvPoint, c: UvPoint, d: UvPoint): number {
  if (properSegmentIntersection(a, b, c, d, 1e-9)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

function triangleDistancePixels(
  a: readonly [UvPoint, UvPoint, UvPoint],
  b: readonly [UvPoint, UvPoint, UvPoint],
  width: number,
  height: number,
  tolerance: number,
): number {
  if (trianglesOverlap(a, b, tolerance)) return 0;
  const pa = a.map((point) => pixelPoint(point, width, height)) as [UvPoint, UvPoint, UvPoint];
  const pb = b.map((point) => pixelPoint(point, width, height)) as [UvPoint, UvPoint, UvPoint];
  let minimum = Number.POSITIVE_INFINITY;
  for (let ai = 0; ai < 3; ai += 1) {
    for (let bi = 0; bi < 3; bi += 1) {
      minimum = Math.min(minimum, segmentDistance(pa[ai]!, pa[(ai + 1) % 3]!, pb[bi]!, pb[(bi + 1) % 3]!));
    }
  }
  return minimum;
}

class UnionFind {
  readonly parent: number[];
  readonly rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.rank = Array.from({ length: size }, () => 0);
  }

  find(value: number): number {
    const parent = this.parent[value]!;
    if (parent !== value) this.parent[value] = this.find(parent);
    return this.parent[value]!;
  }

  union(a: number, b: number): void {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return;
    if (this.rank[rootA]! < this.rank[rootB]!) [rootA, rootB] = [rootB, rootA];
    this.parent[rootB] = rootA;
    if (this.rank[rootA] === this.rank[rootB]) this.rank[rootA] = this.rank[rootA]! + 1;
  }
}

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function addPolicyFinding(blockers: string[], warnings: string[], selected: UvPolicy, message: string): void {
  if (selected === "reject") blockers.push(message);
  else if (selected === "warn") warnings.push(message);
}

function commonOverlapGroup(members: readonly number[], triangles: readonly UvTriangle[]): string | null {
  const first = triangles[members[0]!]!.overlapGroup;
  if (!first) return null;
  return members.every((member) => triangles[member]!.overlapGroup === first) ? first : null;
}

/** Deterministic UV topology, spacing and density review from extracted mesh triangles. */
export function reviewUvLayout(triangles: readonly UvTriangle[], spec: UvLayoutReviewSpec = {}): UvLayoutReviewEvidence {
  if (!Array.isArray(triangles) || triangles.length < 1 || triangles.length > 5000) throw new Error("UV layout review requires 1 through 5000 triangles.");
  const uvAreaEpsilon = positive(spec.uvAreaEpsilon, 1e-10, "uvAreaEpsilon");
  const uvEqualityTolerance = positive(spec.uvEqualityTolerance, 1e-7, "uvEqualityTolerance");
  const overlapPolicy = policy(spec.overlapPolicy, "reject", "overlapPolicy");
  const mirroredPolicy = policy(spec.mirroredPolicy, "warn", "mirroredPolicy");
  const convention = orientationConvention(spec.orientationConvention);
  const maximumTexelDensityRatio = positive(spec.maximumTexelDensityRatio, 2, "maximumTexelDensityRatio");
  if (maximumTexelDensityRatio < 1) throw new Error("maximumTexelDensityRatio must be at least 1.");
  const minimumAtlasBoundaryPaddingTexels = nonNegative(spec.minimumAtlasBoundaryPaddingTexels, 0, "minimumAtlasBoundaryPaddingTexels");
  const minimumIslandPaddingTexels = nonNegative(spec.minimumIslandPaddingTexels, 0, "minimumIslandPaddingTexels");

  const hasTextureWidth = spec.textureWidth !== undefined;
  const hasTextureHeight = spec.textureHeight !== undefined;
  if (hasTextureWidth !== hasTextureHeight) throw new Error("textureWidth and textureHeight must be provided together.");
  const textureWidth = spec.textureWidth === undefined ? null : positive(spec.textureWidth, 1, "textureWidth");
  const textureHeight = spec.textureHeight === undefined ? null : positive(spec.textureHeight, 1, "textureHeight");

  const ids = new Set<string>();
  const signedAreas: number[] = [];
  const absoluteAreas: number[] = [];
  const bounds: Bounds[] = [];
  const degenerateUvTriangleIds: string[] = [];
  const degenerateWorldTriangleIds: string[] = [];
  const outsideUnitSquareTriangleIds: string[] = [];

  for (const [index, triangle] of triangles.entries()) {
    if (!triangle || typeof triangle.id !== "string" || !triangle.id.trim()) throw new Error(`triangles[${index}].id must be a non-empty string.`);
    if (!Array.isArray(triangle.uv) || triangle.uv.length !== 3) throw new Error(`triangles[${index}].uv must contain exactly three points.`);
    if (ids.has(triangle.id)) throw new Error(`Duplicate UV triangle id ${JSON.stringify(triangle.id)}.`);
    ids.add(triangle.id);
    for (const [vertexIndex, point] of triangle.uv.entries()) {
      finite(point.u, `triangles[${index}].uv[${vertexIndex}].u`);
      finite(point.v, `triangles[${index}].uv[${vertexIndex}].v`);
    }
    if (triangle.position) {
      if (!Array.isArray(triangle.position) || triangle.position.length !== 3) throw new Error(`triangles[${index}].position must contain exactly three points.`);
      for (const [vertexIndex, point] of triangle.position.entries()) {
        finite(point.x, `triangles[${index}].position[${vertexIndex}].x`);
        finite(point.y, `triangles[${index}].position[${vertexIndex}].y`);
        finite(point.z, `triangles[${index}].position[${vertexIndex}].z`);
      }
    }
    const signedArea = signedUvArea(triangle.uv);
    const absoluteArea = Math.abs(signedArea);
    signedAreas.push(signedArea);
    absoluteAreas.push(absoluteArea);
    bounds.push(boundsOf(triangle.uv));
    if (absoluteArea <= uvAreaEpsilon) degenerateUvTriangleIds.push(triangle.id);
    if (!spec.allowTiledCoordinates && triangle.uv.some((point) => point.u < -uvEqualityTolerance || point.v < -uvEqualityTolerance || point.u > 1 + uvEqualityTolerance || point.v > 1 + uvEqualityTolerance)) {
      outsideUnitSquareTriangleIds.push(triangle.id);
    }
    if (triangle.position && worldArea(triangle.position) <= 1e-12) degenerateWorldTriangleIds.push(triangle.id);
  }

  const positiveTriangleCount = signedAreas.filter((area, index) => absoluteAreas[index]! > uvAreaEpsilon && area > 0).length;
  const negativeTriangleCount = signedAreas.filter((area, index) => absoluteAreas[index]! > uvAreaEpsilon && area < 0).length;
  const referenceSign: OrientationSign = convention === "positive" ? 1 : convention === "negative" ? -1 : negativeTriangleCount > positiveTriangleCount ? -1 : 1;
  const orientedCount = positiveTriangleCount + negativeTriangleCount;
  const minorityCount = referenceSign === 1 ? negativeTriangleCount : positiveTriangleCount;
  const mirroredTriangleIds = triangles
    .filter((_triangle, index) => absoluteAreas[index]! > uvAreaEpsilon && Math.sign(signedAreas[index]!) !== referenceSign)
    .map((triangle) => triangle.id);

  const edgeOwners = new Map<string, number[]>();
  const islandUnion = new UnionFind(triangles.length);
  for (let index = 0; index < triangles.length; index += 1) {
    const uv = triangles[index]!.uv;
    for (let edge = 0; edge < 3; edge += 1) {
      const key = edgeKey(uv[edge]!, uv[(edge + 1) % 3]!, uvEqualityTolerance);
      const owners = edgeOwners.get(key);
      if (owners) {
        for (const owner of owners) islandUnion.union(index, owner);
        owners.push(index);
      } else edgeOwners.set(key, [index]);
    }
  }

  const islandMembers = new Map<number, number[]>();
  for (let index = 0; index < triangles.length; index += 1) {
    const root = islandUnion.find(index);
    const members = islandMembers.get(root);
    if (members) members.push(index);
    else islandMembers.set(root, [index]);
  }

  const islandMemberList = [...islandMembers.values()];
  const islandEvidence: UvIslandEvidence[] = islandMemberList.map((members, islandIndex) => {
    const islandBounds = members.reduce<Bounds>((accumulator, member) => {
      const current = bounds[member]!;
      return {
        minU: Math.min(accumulator.minU, current.minU),
        minV: Math.min(accumulator.minV, current.minV),
        maxU: Math.max(accumulator.maxU, current.maxU),
        maxV: Math.max(accumulator.maxV, current.maxV),
      };
    }, { minU: Number.POSITIVE_INFINITY, minV: Number.POSITIVE_INFINITY, maxU: Number.NEGATIVE_INFINITY, maxV: Number.NEGATIVE_INFINITY });
    const boundaryPaddingTexels = textureWidth !== null && textureHeight !== null
      ? Math.min(islandBounds.minU * textureWidth, (1 - islandBounds.maxU) * textureWidth, islandBounds.minV * textureHeight, (1 - islandBounds.maxV) * textureHeight)
      : null;
    return Object.freeze({
      id: `island-${String(islandIndex + 1).padStart(3, "0")}`,
      triangleIds: Object.freeze(members.map((member) => triangles[member]!.id)),
      overlapGroup: commonOverlapGroup(members, triangles),
      bounds: Object.freeze(islandBounds),
      boundaryPaddingTexels,
    });
  });

  const overlapPairs: UvOverlapPair[] = [];
  for (let left = 0; left < triangles.length; left += 1) {
    if (absoluteAreas[left]! <= uvAreaEpsilon) continue;
    for (let right = left + 1; right < triangles.length; right += 1) {
      if (absoluteAreas[right]! <= uvAreaEpsilon || !boundsOverlap(bounds[left]!, bounds[right]!, uvEqualityTolerance)) continue;
      const a = triangles[left]!;
      const b = triangles[right]!;
      if (!trianglesOverlap(a.uv, b.uv, uvEqualityTolerance)) continue;
      overlapPairs.push(Object.freeze({
        a: a.id,
        b: b.id,
        allowedByGroup: Boolean(a.overlapGroup && b.overlapGroup && a.overlapGroup === b.overlapGroup),
      }));
    }
  }

  let islandSpacing: UvIslandSpacingEvidence | null = null;
  if (textureWidth !== null && textureHeight !== null && islandMemberList.length > 1) {
    let eligiblePairCount = 0;
    let minimumPaddingTexels = Number.POSITIVE_INFINITY;
    let closestPair: { a: string; b: string; paddingTexels: number } | null = null;
    for (let left = 0; left < islandMemberList.length; left += 1) {
      for (let right = left + 1; right < islandMemberList.length; right += 1) {
        const leftEvidence = islandEvidence[left]!;
        const rightEvidence = islandEvidence[right]!;
        if (leftEvidence.overlapGroup && leftEvidence.overlapGroup === rightEvidence.overlapGroup) continue;
        eligiblePairCount += 1;
        const lowerBound = boundsDistancePixels(leftEvidence.bounds, rightEvidence.bounds, textureWidth, textureHeight);
        if (lowerBound >= minimumPaddingTexels) continue;
        let pairMinimum = Number.POSITIVE_INFINITY;
        for (const aIndex of islandMemberList[left]!) {
          for (const bIndex of islandMemberList[right]!) {
            const triangleLowerBound = boundsDistancePixels(bounds[aIndex]!, bounds[bIndex]!, textureWidth, textureHeight);
            if (triangleLowerBound >= pairMinimum) continue;
            pairMinimum = Math.min(pairMinimum, triangleDistancePixels(triangles[aIndex]!.uv, triangles[bIndex]!.uv, textureWidth, textureHeight, uvEqualityTolerance));
          }
        }
        if (pairMinimum < minimumPaddingTexels) {
          minimumPaddingTexels = pairMinimum;
          closestPair = { a: leftEvidence.id, b: rightEvidence.id, paddingTexels: pairMinimum };
        }
      }
    }
    islandSpacing = Object.freeze({
      eligiblePairCount,
      minimumPaddingTexels: Number.isFinite(minimumPaddingTexels) ? minimumPaddingTexels : null,
      closestPair: closestPair ? Object.freeze(closestPair) : null,
      requiredMinimumPaddingTexels: minimumIslandPaddingTexels,
    });
  }

  let texelDensity: UvTexelDensityEvidence | null = null;
  if (textureWidth !== null && textureHeight !== null) {
    const samples: { id: string; value: number }[] = [];
    for (let index = 0; index < triangles.length; index += 1) {
      const triangle = triangles[index]!;
      if (!triangle.position || absoluteAreas[index]! <= uvAreaEpsilon) continue;
      const area3d = worldArea(triangle.position);
      if (area3d <= 1e-12) continue;
      samples.push({ id: triangle.id, value: Math.sqrt((absoluteAreas[index]! * textureWidth * textureHeight) / area3d) });
    }
    if (samples.length) {
      const densityMedian = median(samples.map((sample) => sample.value));
      const lower = densityMedian / maximumTexelDensityRatio;
      const upper = densityMedian * maximumTexelDensityRatio;
      texelDensity = Object.freeze({
        sampleCount: samples.length,
        medianTexelsPerWorldUnit: densityMedian,
        minimumTexelsPerWorldUnit: Math.min(...samples.map((sample) => sample.value)),
        maximumTexelsPerWorldUnit: Math.max(...samples.map((sample) => sample.value)),
        maximumAllowedRatio: maximumTexelDensityRatio,
        outlierTriangleIds: Object.freeze(samples.filter((sample) => sample.value < lower || sample.value > upper).map((sample) => sample.id)),
      });
    }
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (degenerateUvTriangleIds.length) blockers.push(`degenerate-uv-triangles:${degenerateUvTriangleIds.length}`);
  if (degenerateWorldTriangleIds.length) warnings.push(`degenerate-world-triangles:${degenerateWorldTriangleIds.length}`);
  if (outsideUnitSquareTriangleIds.length) blockers.push(`uv-coordinates-outside-unit-square:${outsideUnitSquareTriangleIds.length}`);
  const forbiddenOverlaps = overlapPairs.filter((pair) => !pair.allowedByGroup);
  if (forbiddenOverlaps.length) addPolicyFinding(blockers, warnings, overlapPolicy, `unapproved-uv-overlaps:${forbiddenOverlaps.length}`);
  if (mirroredTriangleIds.length) addPolicyFinding(blockers, warnings, mirroredPolicy, `mirrored-uv-triangles:${mirroredTriangleIds.length}`);
  if (texelDensity?.outlierTriangleIds.length) warnings.push(`texel-density-outliers:${texelDensity.outlierTriangleIds.length}`);
  if (minimumAtlasBoundaryPaddingTexels > 0 && textureWidth !== null && textureHeight !== null) {
    const tooClose = islandEvidence.filter((island) => island.boundaryPaddingTexels !== null && island.boundaryPaddingTexels < minimumAtlasBoundaryPaddingTexels);
    if (tooClose.length) blockers.push(`atlas-boundary-padding-below-${minimumAtlasBoundaryPaddingTexels}px:${tooClose.length}`);
  }
  if (minimumIslandPaddingTexels > 0 && islandSpacing?.minimumPaddingTexels !== null && islandSpacing.minimumPaddingTexels < minimumIslandPaddingTexels) {
    const pair = islandSpacing.closestPair;
    blockers.push(`inter-island-padding-below-${minimumIslandPaddingTexels}px:${pair?.a ?? "unknown"}:${pair?.b ?? "unknown"}:${islandSpacing.minimumPaddingTexels.toFixed(3)}px`);
  }

  const grade: UvLayoutGrade = blockers.length ? "fail" : warnings.length ? "warn" : "pass";
  return Object.freeze({
    contract: UV_LAYOUT_REVIEW_CONTRACT,
    grade,
    triangleCount: triangles.length,
    islandCount: islandEvidence.length,
    orientation: Object.freeze({
      convention,
      referenceSign: referenceSign === 1 ? "positive" as const : "negative" as const,
      positiveTriangleCount,
      negativeTriangleCount,
      minorityRatio: orientedCount ? minorityCount / orientedCount : 0,
    }),
    degenerateUvTriangleIds: Object.freeze(degenerateUvTriangleIds),
    degenerateWorldTriangleIds: Object.freeze(degenerateWorldTriangleIds),
    outsideUnitSquareTriangleIds: Object.freeze(outsideUnitSquareTriangleIds),
    mirroredTriangleIds: Object.freeze(mirroredTriangleIds),
    overlapPairs: Object.freeze(overlapPairs),
    islands: Object.freeze(islandEvidence),
    islandSpacing,
    texelDensity,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    visualChecks: Object.freeze([
      "Inspect UV seams on the final mesh under representative lighting, especially where tangent-space normals cross island boundaries.",
      "Check texel density on representative geometry; equal numeric density can still look inconsistent across materials with different authored detail scale.",
      "Verify deliberate mirrored/stacked islands use an explicit overlapGroup so accidental overlaps remain visible.",
      "For atlases and mipmapped assets, verify both measured inter-island spacing and real exported bleed/padding at lower mip levels.",
    ]),
  });
}
