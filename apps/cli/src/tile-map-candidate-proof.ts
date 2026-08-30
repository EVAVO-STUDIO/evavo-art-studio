import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type JsonObject = Record<string, unknown>;

type ProofCandidate = Readonly<{
  candidateId: string;
  taskId: string;
  family: string;
  relativePath: string;
  sha256: string;
  bytes: Buffer;
  width: number;
  height: number;
  technicallyClear: boolean;
}>;

type ProofFile = Readonly<{
  visual_family: string;
  file: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  candidates: readonly JsonObject[];
}>;

export type TileMapCandidateProofReceipt = Readonly<{
  schema_version: 1;
  source_review_path: string;
  source_review_sha256: string;
  source_review_fingerprint: string;
  source_candidate_qa_path: string;
  source_candidate_qa_sha256: string;
  source_candidate_qa_fingerprint: string;
  source_provider_batch_fingerprint: string;
  source_execution_sha256: string;
  source_map_fingerprint: string;
  map_id: string;
  projection: string;
  proof_files: readonly ProofFile[];
  aggregate_proof_digest: string;
  authority: Readonly<{
    visual_review_evidence: true;
    automated_technical_qa: false;
    structural_review_decision: false;
    visual_review_decision: false;
    creative_approval: false;
    candidate_promotion: false;
  }>;
  status: "review-proof-only";
  receipt_fingerprint: string;
}>;

export async function renderTileMapCandidateProofs(
  reviewPath: string,
  qaPath: string,
  outputRoot: string,
): Promise<TileMapCandidateProofReceipt> {
  const [reviewBytes, qaBytes] = await Promise.all([
    readFile(reviewPath),
    readFile(qaPath),
  ]);
  const review = parseObject(reviewBytes.toString("utf8"), reviewPath);
  const qa = parseObject(qaBytes.toString("utf8"), qaPath);
  if (review.schema_version !== 1 || review.status !== "awaiting-review") {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_REVIEW",
      "candidate review must be schema v1 and awaiting-review",
    );
  }
  if (qa.schema_version !== 1 || (qa.status !== "passed" && qa.status !== "blocked")) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_QA",
      "candidate QA must be schema v1 with passed or blocked status",
    );
  }
  const reviewFingerprint = sha256Hex(review.review_fingerprint, "review_fingerprint");
  const qaFingerprint = sha256Hex(qa.qa_fingerprint, "qa_fingerprint");
  if (hashWithout(qa, "qa_fingerprint") !== qaFingerprint) {
    throw failure("EVAVO_TILE_MAP_PROOF_QA", "candidate QA self fingerprint is invalid");
  }
  if (qa.source_review_fingerprint !== reviewFingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_DRIFT",
      "candidate QA does not target the exact candidate review",
    );
  }
  for (const key of [
    "source_package_fingerprint",
    "source_provider_batch_fingerprint",
    "source_execution_sha256",
    "source_map_fingerprint",
    "map_id",
    "projection",
  ] as const) {
    if (qa[key] !== review[key]) {
      throw failure(
        "EVAVO_TILE_MAP_PROOF_DRIFT",
        `${key} differs between review and candidate QA`,
      );
    }
  }

  const output = path.resolve(outputRoot);
  await assertNewOrEmptyDirectory(output);
  const candidateRoot = absolutePath(review.candidate_root, "review.candidate_root");
  const qaRows = new Map<string, JsonObject>();
  for (const [index, item] of array(qa.candidates, "qa.candidates").entries()) {
    const row = object(item, `qa.candidates[${index}]`);
    const id = text(row.candidate_id, `qa.candidates[${index}].candidate_id`);
    if (qaRows.has(id)) {
      throw failure("EVAVO_TILE_MAP_PROOF_DUPLICATE", `duplicate QA candidate ${id}`);
    }
    qaRows.set(id, row);
  }

  const candidates: ProofCandidate[] = [];
  const seen = new Set<string>();
  for (const [index, item] of array(review.candidates, "review.candidates").entries()) {
    const row = object(item, `review.candidates[${index}]`);
    const candidateId = text(row.candidate_id, `review.candidates[${index}].candidate_id`);
    if (seen.has(candidateId)) {
      throw failure(
        "EVAVO_TILE_MAP_PROOF_DUPLICATE",
        `duplicate review candidate ${candidateId}`,
      );
    }
    seen.add(candidateId);
    const qaRow = qaRows.get(candidateId);
    if (!qaRow) {
      throw failure("EVAVO_TILE_MAP_PROOF_SET", `candidate QA is missing ${candidateId}`);
    }
    const taskId = text(row.task_id, `${candidateId}.task_id`);
    const family = text(row.visual_family, `${candidateId}.visual_family`);
    if (qaRow.task_id !== taskId || qaRow.visual_family !== family) {
      throw failure(
        "EVAVO_TILE_MAP_PROOF_DRIFT",
        `${candidateId} task/family differs between review and QA`,
      );
    }
    const relativePath = portableRelative(text(row.path, `${candidateId}.path`));
    const absoluteCandidate = resolveInside(candidateRoot, relativePath, `${candidateId}.path`);
    const bytes = await readFile(absoluteCandidate);
    const digest = sha256Hex(row.sha256, `${candidateId}.sha256`);
    if (sha256(bytes) !== digest || bytes.length !== positiveInteger(row.bytes, `${candidateId}.bytes`)) {
      throw failure(
        "EVAVO_TILE_MAP_PROOF_HASH",
        `${candidateId} candidate bytes changed after review/QA`,
      );
    }
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) {
      throw failure("EVAVO_TILE_MAP_PROOF_FORMAT", `${candidateId} must be readable PNG`);
    }
    candidates.push({
      candidateId,
      taskId,
      family,
      relativePath,
      sha256: digest,
      bytes,
      width: metadata.width,
      height: metadata.height,
      technicallyClear: qaRow.technically_clear === true,
    });
  }
  if (candidates.length !== qaRows.size) {
    throw failure("EVAVO_TILE_MAP_PROOF_SET", "review and QA candidate sets differ");
  }

  const grouped = new Map<string, ProofCandidate[]>();
  for (const candidate of candidates) {
    const rows = grouped.get(candidate.family) ?? [];
    rows.push(candidate);
    grouped.set(candidate.family, rows);
  }
  const proofFiles: ProofFile[] = [];
  for (const [family, rows] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    rows.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
    proofFiles.push(await renderFamilyProof(output, family, rows));
  }

  const aggregate = createHash("sha256");
  for (const proof of proofFiles) {
    aggregate.update(proof.file, "utf8");
    aggregate.update("\0");
    aggregate.update(proof.sha256, "ascii");
    aggregate.update("\n");
  }
  const base = {
    schema_version: 1 as const,
    source_review_path: path.resolve(reviewPath),
    source_review_sha256: sha256(reviewBytes),
    source_review_fingerprint: reviewFingerprint,
    source_candidate_qa_path: path.resolve(qaPath),
    source_candidate_qa_sha256: sha256(qaBytes),
    source_candidate_qa_fingerprint: qaFingerprint,
    source_provider_batch_fingerprint: sha256Hex(
      review.source_provider_batch_fingerprint,
      "source_provider_batch_fingerprint",
    ),
    source_execution_sha256: sha256Hex(
      review.source_execution_sha256,
      "source_execution_sha256",
    ),
    source_map_fingerprint: sha256Hex(
      review.source_map_fingerprint,
      "source_map_fingerprint",
    ),
    map_id: text(review.map_id, "map_id"),
    projection: text(review.projection, "projection"),
    proof_files: proofFiles,
    aggregate_proof_digest: aggregate.digest("hex"),
    authority: {
      visual_review_evidence: true as const,
      automated_technical_qa: false as const,
      structural_review_decision: false as const,
      visual_review_decision: false as const,
      creative_approval: false as const,
      candidate_promotion: false as const,
    },
    status: "review-proof-only" as const,
  };
  const receipt = {
    ...base,
    receipt_fingerprint: sha256(Buffer.from(canonical(base), "utf8")),
  };
  await writeFile(
    path.join(output, "candidate-proof.receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return receipt;
}

async function renderFamilyProof(
  outputRoot: string,
  family: string,
  candidates: readonly ProofCandidate[],
): Promise<ProofFile> {
  const columns = Math.min(4, candidates.length);
  const rows = Math.ceil(candidates.length / columns);
  const maximumWidth = Math.max(...candidates.map((candidate) => candidate.width));
  const maximumHeight = Math.max(...candidates.map((candidate) => candidate.height));
  const zoom = Math.max(1, Math.min(8, Math.floor(192 / Math.max(maximumWidth, maximumHeight))));
  const zoomWidth = maximumWidth * zoom;
  const zoomHeight = maximumHeight * zoom;
  const cellWidth = Math.max(224, zoomWidth + 32);
  const cellHeight = Math.max(160, zoomHeight + maximumHeight + 52);
  const canvasWidth = columns * cellWidth;
  const canvasHeight = rows * cellHeight;
  const checker = checkerboard(canvasWidth, canvasHeight, 8);
  const composites: sharp.OverlayOptions[] = [];
  const placements: JsonObject[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const originX = column * cellWidth;
    const originY = row * cellHeight;
    const enlarged = await sharp(candidate.bytes)
      .resize(candidate.width * zoom, candidate.height * zoom, {
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toBuffer();
    const zoomX = originX + Math.floor((cellWidth - candidate.width * zoom) / 2);
    const zoomY = originY + 16;
    const nativeX = originX + Math.floor((cellWidth - candidate.width) / 2);
    const nativeY = originY + cellHeight - candidate.height - 16;
    composites.push({ input: enlarged, left: zoomX, top: zoomY });
    composites.push({ input: candidate.bytes, left: nativeX, top: nativeY });
    composites.push({
      input: Buffer.from(
        `<svg width="${cellWidth}" height="6"><rect width="${cellWidth}" height="6" fill="${candidate.technicallyClear ? "#d9d9d9" : "#303030"}"/></svg>`,
      ),
      left: originX,
      top: originY,
    });
    placements.push({
      candidate_id: candidate.candidateId,
      task_id: candidate.taskId,
      path: candidate.relativePath,
      sha256: candidate.sha256,
      technically_clear: candidate.technicallyClear,
      cell: { x: originX, y: originY, width: cellWidth, height: cellHeight },
      magnified: {
        x: zoomX,
        y: zoomY,
        width: candidate.width * zoom,
        height: candidate.height * zoom,
        nearest_neighbour_scale: zoom,
      },
      native: {
        x: nativeX,
        y: nativeY,
        width: candidate.width,
        height: candidate.height,
      },
    });
  }

  const fileName = `${safeSlug(family)}.candidate-proof.png`;
  const filePath = path.join(outputRoot, fileName);
  const image = await sharp(checker, {
    raw: { width: canvasWidth, height: canvasHeight, channels: 4 },
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  await writeFile(filePath, image, { flag: "wx" });
  return {
    visual_family: family,
    file: fileName,
    sha256: sha256(image),
    bytes: image.length,
    width: canvasWidth,
    height: canvasHeight,
    columns,
    rows,
    candidates: placements,
  };
}

function checkerboard(width: number, height: number, cell: number): Buffer {
  const result = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 224 : 192;
      result[offset] = value;
      result[offset + 1] = value;
      result[offset + 2] = value;
      result[offset + 3] = 255;
    }
  }
  return result;
}

async function assertNewOrEmptyDirectory(directory: string): Promise<void> {
  const state = await lstat(directory).catch(() => null);
  if (state) {
    if (!state.isDirectory() || state.isSymbolicLink()) {
      throw failure("EVAVO_TILE_MAP_PROOF_PATH", "proof output must be a real directory");
    }
    if ((await readdir(directory)).length !== 0) {
      throw failure("EVAVO_TILE_MAP_PROOF_PATH", "proof output directory must be new or empty");
    }
  } else {
    await mkdir(directory, { recursive: true });
  }
}

function safeSlug(value: string): string {
  const readable = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "family";
  return `${readable.slice(0, 72)}-${sha256(Buffer.from(value, "utf8")).slice(0, 10)}`;
}
function hashWithout(value: JsonObject, key: string): string {
  const clone = { ...value };
  delete clone[key];
  return sha256(Buffer.from(canonical(clone), "utf8"));
}
function portableRelative(value: string): string {
  if (value.includes("\\") || path.posix.isAbsolute(value)) {
    throw failure("EVAVO_TILE_MAP_PROOF_PATH", `path must be forward-slash relative: ${value}`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw failure("EVAVO_TILE_MAP_PROOF_PATH", `unsafe relative path: ${value}`);
  }
  return normalized;
}
function absolutePath(value: unknown, label: string): string {
  const input = text(value, label);
  const resolved = path.resolve(input);
  if (resolved !== input) {
    throw failure("EVAVO_TILE_MAP_PROOF_PATH", `${label} must be absolute and normalized`);
  }
  return resolved;
}
function resolveInside(root: string, relative: string, label: string): string {
  const candidate = path.resolve(root, ...relative.split("/"));
  const relation = path.relative(root, candidate);
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw failure("EVAVO_TILE_MAP_PROOF_PATH", `${label} escapes candidate root`);
  }
  return candidate;
}
function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure("EVAVO_TILE_MAP_PROOF_JSON", `invalid JSON in ${label}`);
  }
}
function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_PROOF_TYPE", `${label} must be object`);
  }
  return value as JsonObject;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_PROOF_TYPE", `${label} must be array`);
  }
  return value;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure("EVAVO_TILE_MAP_PROOF_TYPE", `${label} must be non-empty string`);
  }
  return value;
}
function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw failure("EVAVO_TILE_MAP_PROOF_TYPE", `${label} must be positive integer`);
  }
  return value as number;
}
function sha256Hex(value: unknown, label: string): string {
  const result = text(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure("EVAVO_TILE_MAP_PROOF_HASH", `${label} must be SHA-256`);
  }
  return result;
}
function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as JsonObject).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}
function failure(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
