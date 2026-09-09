import sharp from "sharp";
import {
  createImageFinishingReviewBatch,
  type ImageFinishingReviewBatchItemInput,
  type ImageFinishingReviewBatchResult,
  type ImageFinishingReviewBatchSpec,
} from "./image-finishing-review-packet.js";

export const IMAGE_FINISHING_BATCH_PROOF_CONTRACT = "evavo.image-finishing-batch-proof.v1" as const;

export interface ImageFinishingBatchProofSpec extends ImageFinishingReviewBatchSpec {
  readonly tileSize?: number;
  readonly columns?: number;
  readonly maximumCards?: number;
}

export interface ImageFinishingBatchProofResult {
  readonly contract: typeof IMAGE_FINISHING_BATCH_PROOF_CONTRACT;
  readonly png: Buffer;
  readonly review: ImageFinishingReviewBatchResult;
  readonly evidence: Readonly<{
    width: number;
    height: number;
    tileSize: number;
    columns: number;
    candidateCount: number;
    displayedCandidateIds: readonly string[];
    omittedCandidateCount: number;
    reviewPriority: readonly string[];
    summary: ImageFinishingReviewBatchResult["summary"];
    referenceCoherence: ImageFinishingReviewBatchResult["referenceCoherence"];
    diagnosticOnly: true;
    sourceMutationAllowed: false;
  }>;
}

type CompositeItem = Readonly<{ input: Buffer; left: number; top: number }>;

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

function truncate(value: string, maximum = 32): string {
  return value.length <= maximum ? value : `${value.slice(0, Math.max(1, maximum - 1))}…`;
}

function checkerSvg(size: number): Buffer {
  const square = Math.max(8, Math.round(size / 12));
  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="${square * 2}" height="${square * 2}" patternUnits="userSpaceOnUse"><rect width="${square * 2}" height="${square * 2}" fill="#ededed"/><rect width="${square}" height="${square}" fill="#d2d2d2"/><rect x="${square}" y="${square}" width="${square}" height="${square}" fill="#d2d2d2"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
}

function labelSvg(width: number, height: number, title: string, detail: string, third: string): Buffer {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111"/><text x="9" y="18" fill="#fff" font-family="sans-serif" font-size="12" font-weight="700">${escapeXml(title)}</text><text x="9" y="36" fill="#ddd" font-family="sans-serif" font-size="10">${escapeXml(detail)}</text><text x="9" y="52" fill="#bbb" font-family="sans-serif" font-size="10">${escapeXml(third)}</text></svg>`);
}

function headerSvg(width: number, height: number, title: string, line1: string, line2: string): Buffer {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5f5f5"/><text x="12" y="20" fill="#111" font-family="sans-serif" font-size="15" font-weight="700">${escapeXml(title)}</text><text x="12" y="39" fill="#444" font-family="sans-serif" font-size="11">${escapeXml(line1)}</text><text x="12" y="56" fill="#666" font-family="sans-serif" font-size="10">${escapeXml(line2)}</text></svg>`);
}

async function renderCard(
  input: ImageFinishingReviewBatchItemInput,
  packet: ImageFinishingReviewBatchResult["items"][number]["packet"],
  tileSize: number,
): Promise<Buffer> {
  const labelHeight = 64;
  const thumbnail = await sharp(input.encoded, { failOn: "error" })
    .ensureAlpha()
    .resize(tileSize, tileSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .png()
    .toBuffer();
  const referenceDistance = packet.referenceConsistency?.distance.composite;
  const artifactBits = [
    packet.technicalReview.generatedDetailRisk.repeatedDetailRisk ? "repeat" : null,
    packet.technicalReview.generatedDetailRisk.detailImbalanceRisk ? "detail" : null,
    packet.technicalReview.artifactSignals.posterizationRisk ? "poster" : null,
    packet.technicalReview.artifactSignals.nearestNeighbourUpscaleRisk ? "resample" : null,
    packet.technicalReview.artifactSignals.ringingRiskRatio > 0.02 ? "ring" : null,
  ].filter(Boolean);
  return sharp({
    create: { width: tileSize, height: tileSize + labelHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([
      { input: checkerSvg(tileSize), left: 0, top: 0 },
      { input: thumbnail, left: 0, top: 0 },
      {
        input: labelSvg(
          tileSize,
          labelHeight,
          truncate(`${packet.priority.toUpperCase()} ${input.id}`),
          truncate(`${packet.disposition} • q ${packet.technicalReview.quality.score}${referenceDistance === undefined ? "" : ` • ref ${referenceDistance.toFixed(3)}`}`),
          truncate(artifactBits.length ? `flags ${artifactBits.join(",")}` : "no artifact-risk flag"),
        ),
        left: 0,
        top: tileSize,
      },
    ])
    .png()
    .toBuffer();
}

/** Create a bounded finishing-artist contact proof ordered by combined review priority. */
export async function createImageFinishingBatchProof(
  inputs: readonly ImageFinishingReviewBatchItemInput[],
  spec: ImageFinishingBatchProofSpec = {},
): Promise<ImageFinishingBatchProofResult> {
  const tileSize = integer(spec.tileSize, 160, 96, 384, "tileSize");
  const columns = integer(spec.columns, 4, 1, 8, "columns");
  const maximumCards = integer(spec.maximumCards, 32, 1, 64, "maximumCards");
  const review = await createImageFinishingReviewBatch(inputs, {
    ...(spec.defaultReviewContext ? { defaultReviewContext: spec.defaultReviewContext } : {}),
    ...(spec.approvedReferences?.length ? { approvedReferences: spec.approvedReferences } : {}),
  });
  const byId = new Map(inputs.map((input) => [input.id, input] as const));
  const packetById = new Map(review.items.map((item) => [item.id, item.packet] as const));
  const displayedCandidateIds = review.reviewPriority.slice(0, maximumCards);
  const cards = await Promise.all(displayedCandidateIds.map((id) => {
    const input = byId.get(id);
    const packet = packetById.get(id);
    if (!input || !packet) throw new Error(`Finishing batch proof could not resolve candidate ${JSON.stringify(id)}.`);
    return renderCard(input, packet, tileSize);
  }));

  const gap = 8;
  const margin = 12;
  const headerHeight = 68;
  const cardHeight = tileSize + 64;
  const rows = Math.max(1, Math.ceil(cards.length / columns));
  const width = margin * 2 + columns * tileSize + Math.max(0, columns - 1) * gap;
  const height = margin + headerHeight + 8 + rows * cardHeight + Math.max(0, rows - 1) * gap + margin;
  const dispositionSummary = Object.entries(review.summary.dispositions)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key}:${count}`)
    .join(" • ");
  const referenceLine = review.referenceCoherence
    ? `references ${review.referenceCount} • coherence ${review.referenceCoherence.state} • max ${review.referenceCoherence.maximumDistance.toFixed(3)}`
    : "no approved reference set supplied";

  const composites: CompositeItem[] = [{
    input: headerSvg(
      width - margin * 2,
      headerHeight,
      "EVAVO Finishing Review Priority",
      `${review.itemCount} candidates • showing ${cards.length} • ${dispositionSummary || "no dispositions"}`,
      `${referenceLine} • diagnostic only • human visual review required`,
    ),
    left: margin,
    top: margin,
  }];
  const top = margin + headerHeight + 8;
  for (let index = 0; index < cards.length; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    composites.push({ input: cards[index]!, left: margin + column * (tileSize + gap), top: top + row * (cardHeight + gap) });
  }

  const png = await sharp({
    create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).composite(composites).png().toBuffer();

  return Object.freeze({
    contract: IMAGE_FINISHING_BATCH_PROOF_CONTRACT,
    png,
    review,
    evidence: Object.freeze({
      width,
      height,
      tileSize,
      columns,
      candidateCount: review.itemCount,
      displayedCandidateIds: Object.freeze(displayedCandidateIds),
      omittedCandidateCount: Math.max(0, review.itemCount - displayedCandidateIds.length),
      reviewPriority: review.reviewPriority,
      summary: review.summary,
      referenceCoherence: review.referenceCoherence,
      diagnosticOnly: true,
      sourceMutationAllowed: false,
    }),
  });
}
