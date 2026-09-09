import sharp from "sharp";
import {
  reviewImageReferenceConsistencyBatch,
  type ImageReferenceBatchResult,
  type ImageReferenceCandidateInput,
  type ImageReferenceConsistencySpec,
  type ImageReferenceInput,
} from "./image-reference-consistency.js";

export const IMAGE_REFERENCE_CONSISTENCY_PROOF_CONTRACT = "evavo.image-reference-consistency-proof.v1" as const;

export interface ImageReferenceConsistencyProofSpec extends ImageReferenceConsistencySpec {
  readonly tileSize?: number;
  readonly columns?: number;
  readonly maximumReferenceCards?: number;
  readonly maximumCandidateCards?: number;
}

export interface ImageReferenceConsistencyProofResult {
  readonly contract: typeof IMAGE_REFERENCE_CONSISTENCY_PROOF_CONTRACT;
  readonly png: Buffer;
  readonly evidence: Readonly<{
    width: number;
    height: number;
    columns: number;
    tileSize: number;
    referenceCount: number;
    candidateCount: number;
    displayedReferenceIds: readonly string[];
    displayedCandidateIds: readonly string[];
    omittedReferenceCount: number;
    omittedCandidateCount: number;
    reviewPriority: readonly string[];
    referenceCoherence: ImageReferenceBatchResult["referenceCoherence"];
    diagnosticOnly: true;
    sourceMutationAllowed: false;
  }>;
}

function integer(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} through ${max}.`);
  return value;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function truncate(value: string, maximum = 28): string {
  return value.length <= maximum ? value : `${value.slice(0, Math.max(1, maximum - 1))}…`;
}

function checkerSvg(size: number): Buffer {
  const square = Math.max(8, Math.round(size / 12));
  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="${square * 2}" height="${square * 2}" patternUnits="userSpaceOnUse"><rect width="${square * 2}" height="${square * 2}" fill="#e7e7e7"/><rect width="${square}" height="${square}" fill="#cfcfcf"/><rect x="${square}" y="${square}" width="${square}" height="${square}" fill="#cfcfcf"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
}

function labelSvg(width: number, height: number, primary: string, secondary: string): Buffer {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111"/><text x="10" y="19" fill="#fff" font-family="sans-serif" font-size="13" font-weight="700">${escapeXml(primary)}</text><text x="10" y="37" fill="#ddd" font-family="sans-serif" font-size="11">${escapeXml(secondary)}</text></svg>`);
}

async function card(encoded: Buffer, tileSize: number, primary: string, secondary: string): Promise<Buffer> {
  const labelHeight = 48;
  const thumbnail = await sharp(encoded, { failOn: "error" })
    .ensureAlpha()
    .resize(tileSize, tileSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .png()
    .toBuffer();
  return sharp({
    create: { width: tileSize, height: tileSize + labelHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([
      { input: checkerSvg(tileSize), left: 0, top: 0 },
      { input: thumbnail, left: 0, top: 0 },
      { input: labelSvg(tileSize, labelHeight, primary, secondary), left: 0, top: tileSize },
    ])
    .png()
    .toBuffer();
}

function sectionHeader(width: number, title: string, detail: string): Buffer {
  return Buffer.from(`<svg width="${width}" height="44" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f4f4f4"/><text x="12" y="19" fill="#111" font-family="sans-serif" font-size="14" font-weight="700">${escapeXml(title)}</text><text x="12" y="36" fill="#555" font-family="sans-serif" font-size="11">${escapeXml(detail)}</text></svg>`);
}

function consistencyOnlySpec(spec: ImageReferenceConsistencyProofSpec): ImageReferenceConsistencySpec {
  return {
    ...(spec.sampleSize !== undefined ? { sampleSize: spec.sampleSize } : {}),
    ...(spec.warnDistance !== undefined ? { warnDistance: spec.warnDistance } : {}),
    ...(spec.failDistance !== undefined ? { failDistance: spec.failDistance } : {}),
    ...(spec.referenceUnstableDistance !== undefined ? { referenceUnstableDistance: spec.referenceUnstableDistance } : {}),
    ...(spec.alphaVisibleThreshold !== undefined ? { alphaVisibleThreshold: spec.alphaVisibleThreshold } : {}),
  };
}

/** Create a bounded visual proof that prioritizes the strongest candidate outliers. */
export async function createImageReferenceConsistencyProof(
  candidates: readonly ImageReferenceCandidateInput[],
  references: readonly ImageReferenceInput[],
  spec: ImageReferenceConsistencyProofSpec = {},
): Promise<ImageReferenceConsistencyProofResult> {
  const tileSize = integer(spec.tileSize, 160, 96, 384, "tileSize");
  const columns = integer(spec.columns, 4, 1, 8, "columns");
  const maximumReferenceCards = integer(spec.maximumReferenceCards, 8, 1, 16, "maximumReferenceCards");
  const maximumCandidateCards = integer(spec.maximumCandidateCards, 24, 1, 48, "maximumCandidateCards");
  const batch = await reviewImageReferenceConsistencyBatch(candidates, references, consistencyOnlySpec(spec));
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const displayedReferences = references.slice(0, maximumReferenceCards);
  const displayedCandidateIds = batch.reviewPriority.slice(0, maximumCandidateCards);
  const reviewById = new Map(batch.results.map((item) => [item.id, item.review]));

  const referenceCards = await Promise.all(displayedReferences.map((reference) => card(
    reference.encoded,
    tileSize,
    truncate(`REF ${reference.id}`),
    `approved • set ${batch.referenceCoherence.state}`,
  )));
  const candidateCards = await Promise.all(displayedCandidateIds.map(async (id) => {
    const candidate = candidateById.get(id);
    const review = reviewById.get(id);
    if (!candidate || !review) throw new Error(`Reference proof could not resolve candidate ${JSON.stringify(id)}.`);
    return card(
      candidate.encoded,
      tileSize,
      truncate(`${review.grade.toUpperCase()} ${id}`),
      `distance ${review.distance.composite.toFixed(3)} • ${review.decision}`,
    );
  }));

  const gap = 8;
  const margin = 12;
  const headerHeight = 44;
  const cardHeight = tileSize + 48;
  const canvasWidth = margin * 2 + columns * tileSize + (columns - 1) * gap;
  const rowsFor = (count: number) => Math.max(1, Math.ceil(count / columns));
  const refRows = rowsFor(referenceCards.length);
  const candidateRows = rowsFor(candidateCards.length);
  const canvasHeight = margin
    + headerHeight
    + refRows * cardHeight + Math.max(0, refRows - 1) * gap
    + margin
    + headerHeight
    + candidateRows * cardHeight + Math.max(0, candidateRows - 1) * gap
    + margin;

  const composites: sharp.OverlayOptions[] = [];
  let top = margin;
  composites.push({
    input: sectionHeader(canvasWidth - margin * 2, "Approved references", `${references.length} supplied • ${batch.referenceCoherence.state} set • max pair distance ${batch.referenceCoherence.maximumDistance.toFixed(3)}`),
    left: margin,
    top,
  });
  top += headerHeight;
  for (let index = 0; index < referenceCards.length; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    composites.push({ input: referenceCards[index]!, left: margin + column * (tileSize + gap), top: top + row * (cardHeight + gap) });
  }
  top += refRows * cardHeight + Math.max(0, refRows - 1) * gap + margin;
  composites.push({
    input: sectionHeader(canvasWidth - margin * 2, "Candidate review priority", `${candidates.length} supplied • strongest deterministic visual drift first • semantic review still required`),
    left: margin,
    top,
  });
  top += headerHeight;
  for (let index = 0; index < candidateCards.length; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    composites.push({ input: candidateCards[index]!, left: margin + column * (tileSize + gap), top: top + row * (cardHeight + gap) });
  }

  const png = await sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).composite(composites).png().toBuffer();

  return Object.freeze({
    contract: IMAGE_REFERENCE_CONSISTENCY_PROOF_CONTRACT,
    png,
    evidence: Object.freeze({
      width: canvasWidth,
      height: canvasHeight,
      columns,
      tileSize,
      referenceCount: references.length,
      candidateCount: candidates.length,
      displayedReferenceIds: Object.freeze(displayedReferences.map((reference) => reference.id)),
      displayedCandidateIds: Object.freeze(displayedCandidateIds),
      omittedReferenceCount: Math.max(0, references.length - displayedReferences.length),
      omittedCandidateCount: Math.max(0, candidates.length - displayedCandidateIds.length),
      reviewPriority: batch.reviewPriority,
      referenceCoherence: batch.referenceCoherence,
      diagnosticOnly: true,
      sourceMutationAllowed: false,
    }),
  });
}
