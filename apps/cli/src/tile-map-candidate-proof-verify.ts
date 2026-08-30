import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type JsonObject = Record<string, unknown>;

export type TileMapCandidateProofVerification = {
  status: "valid";
  manifest: string;
  proof_fingerprint: string;
  source_map_fingerprint: string;
  family_boards: number;
  candidates: number;
  aggregate_artifact_digest: string;
  source_files: Array<{
    role: string;
    path: string;
    sha256: string;
  }>;
  artifacts: Array<{
    file: string;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
  }>;
};

export async function verifyTileMapCandidateProof(
  manifestPath: string,
): Promise<TileMapCandidateProofVerification> {
  const resolvedManifest = path.resolve(manifestPath);
  const manifestBytes = await readFile(resolvedManifest);
  const manifest = parseObject(manifestBytes.toString("utf8"), resolvedManifest);
  if (manifest.schema_version !== 1) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_SCHEMA",
      "candidate proof manifest schema_version must be 1",
    );
  }
  const proofFingerprint = sha256Hex(
    manifest.proof_fingerprint,
    "proof_fingerprint",
  );
  const { proof_fingerprint: _fingerprint, ...body } = manifest;
  if (sha256(Buffer.from(canonical(body), "utf8")) !== proofFingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_FINGERPRINT",
      "candidate proof manifest self fingerprint is invalid",
    );
  }

  const outputRoot = absolutePath(manifest.output_root, "output_root");
  if (path.resolve(outputRoot, "candidate-proof.manifest.json") !== resolvedManifest) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_PATH",
      "candidate proof manifest must be the declared output-root manifest",
    );
  }
  const sourceFiles = await Promise.all([
    verifySource(
      "source-package",
      manifest.source_package_path,
      manifest.source_package_sha256,
    ),
    verifySource(
      "candidate-review",
      manifest.source_review_path,
      manifest.source_review_sha256,
    ),
    verifySource(
      "technical-qa",
      manifest.source_technical_qa_path,
      manifest.source_technical_qa_sha256,
    ),
  ]);
  const sourcePackage = parseObject(
    (await readFile(sourceFiles[0]!.path)).toString("utf8"),
    sourceFiles[0]!.path,
  );
  const review = parseObject(
    (await readFile(sourceFiles[1]!.path)).toString("utf8"),
    sourceFiles[1]!.path,
  );
  const qa = parseObject(
    (await readFile(sourceFiles[2]!.path)).toString("utf8"),
    sourceFiles[2]!.path,
  );
  if (
    sourcePackage.package_fingerprint !== manifest.source_package_fingerprint ||
    review.review_fingerprint !== manifest.source_review_fingerprint ||
    qa.qa_fingerprint !== manifest.source_technical_qa_fingerprint ||
    sourcePackage.source_map_fingerprint !== manifest.source_map_fingerprint ||
    review.source_map_fingerprint !== manifest.source_map_fingerprint ||
    qa.source_map_fingerprint !== manifest.source_map_fingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_DRIFT",
      "retained source fingerprints differ from proof manifest",
    );
  }
  const { qa_fingerprint: _qaFingerprint, ...qaBody } = qa;
  if (
    sha256(Buffer.from(canonical(qaBody), "utf8")) !==
    sha256Hex(qa.qa_fingerprint, "technical QA fingerprint")
  ) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_QA",
      "retained technical QA self fingerprint is invalid",
    );
  }

  const artifacts = [];
  const expectedFiles = new Set(["candidate-proof.manifest.json"]);
  const seenArtifactFiles = new Set<string>();
  const seenCandidates = new Set<string>();
  let candidateCount = 0;
  for (const [index, value] of array(manifest.artifacts, "artifacts").entries()) {
    const artifact = object(value, `artifacts[${index}]`);
    const file = portableRelative(text(artifact.file, `artifacts[${index}].file`));
    if (file.includes("/")) {
      throw failure(
        "EVAVO_TILE_MAP_PROOF_VERIFY_PATH",
        `proof board must be directly inside output root: ${file}`,
      );
    }
    if (seenArtifactFiles.has(file)) {
      throw failure(
        "EVAVO_TILE_MAP_PROOF_VERIFY_DUPLICATE",
        `duplicate proof board: ${file}`,
      );
    }
    seenArtifactFiles.add(file);
    expectedFiles.add(file);
    const absolute = path.resolve(outputRoot, file);
    assertInside(outputRoot, absolute, `proof board ${file}`);
    const bytes = await readFile(absolute);
    const digest = sha256(bytes);
    if (digest !== sha256Hex(artifact.sha256, `${file}.sha256`)) {
      throw failure(
        "EVAVO_TILE_MAP_PROOF_VERIFY_HASH",
        `proof board hash changed: ${file}`,
      );
    }
    const expectedBytes = nonNegativeInteger(artifact.bytes, `${file}.bytes`);
    if (bytes.length !== expectedBytes) {
      throw failure(
        "EVAVO_TILE_MAP_PROOF_VERIFY_SIZE",
        `proof board byte length changed: ${file}`,
      );
    }
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    const width = positiveInteger(artifact.width, `${file}.width`);
    const height = positiveInteger(artifact.height, `${file}.height`);
    if (metadata.format !== "png" || metadata.width !== width || metadata.height !== height) {
      throw failure(
        "EVAVO_TILE_MAP_PROOF_VERIFY_GEOMETRY",
        `proof board PNG geometry changed: ${file}`,
      );
    }
    for (const [candidateIndex, candidateValue] of array(
      artifact.candidates,
      `${file}.candidates`,
    ).entries()) {
      const candidate = object(
        candidateValue,
        `${file}.candidates[${candidateIndex}]`,
      );
      const id = text(
        candidate.candidate_id,
        `${file}.candidates[${candidateIndex}].candidate_id`,
      );
      if (seenCandidates.has(id)) {
        throw failure(
          "EVAVO_TILE_MAP_PROOF_VERIFY_DUPLICATE",
          `candidate appears on multiple proof boards: ${id}`,
        );
      }
      seenCandidates.add(id);
      candidateCount += 1;
    }
    artifacts.push({ file, sha256: digest, bytes: bytes.length, width, height });
  }
  if (artifacts.length === 0) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_EMPTY",
      "candidate proof manifest contains no family boards",
    );
  }

  const directoryEntries = await readdir(outputRoot, { withFileTypes: true });
  for (const entry of directoryEntries) {
    if (!entry.isFile() || !expectedFiles.has(entry.name)) {
      throw failure(
        "EVAVO_TILE_MAP_PROOF_VERIFY_UNRECEIPTED",
        `proof output root contains unreceipted entry: ${entry.name}`,
      );
    }
  }
  if (directoryEntries.length !== expectedFiles.size) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_SET",
      "proof output file set differs from the manifest",
    );
  }

  artifacts.sort((a, b) => a.file.localeCompare(b.file));
  const aggregate = createHash("sha256");
  for (const artifact of artifacts) {
    aggregate.update(artifact.file, "utf8");
    aggregate.update("\0");
    aggregate.update(String(artifact.bytes), "ascii");
    aggregate.update("\0");
    aggregate.update(artifact.sha256, "ascii");
    aggregate.update("\n");
  }

  return {
    status: "valid",
    manifest: resolvedManifest,
    proof_fingerprint: proofFingerprint,
    source_map_fingerprint: sha256Hex(
      manifest.source_map_fingerprint,
      "source_map_fingerprint",
    ),
    family_boards: artifacts.length,
    candidates: candidateCount,
    aggregate_artifact_digest: aggregate.digest("hex"),
    source_files: sourceFiles,
    artifacts,
  };
}

async function verifySource(
  role: string,
  value: unknown,
  expectedHash: unknown,
): Promise<{ role: string; path: string; sha256: string }> {
  const sourcePath = absolutePath(value, `${role} path`);
  const bytes = await readFile(sourcePath);
  const digest = sha256(bytes);
  if (digest !== sha256Hex(expectedHash, `${role} SHA-256`)) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_SOURCE",
      `${role} bytes changed after proof generation`,
    );
  }
  return { role, path: sourcePath, sha256: digest };
}

function absolutePath(value: unknown, label: string): string {
  const result = text(value, label);
  const resolved = path.resolve(result);
  if (resolved !== result) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_PATH",
      `${label} must be absolute and normalized`,
    );
  }
  return resolved;
}

function portableRelative(value: string): string {
  if (value.includes("\\") || path.posix.isAbsolute(value)) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_PATH",
      `proof file must be forward-slash relative: ${value}`,
    );
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("//")
  ) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_PATH",
      `unsafe proof file path: ${value}`,
    );
  }
  return normalized;
}

function assertInside(root: string, candidate: string, label: string): void {
  const relative = path.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_PATH",
      `${label} escapes output root`,
    );
  }
}

function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_JSON",
      `invalid JSON in ${label}`,
    );
  }
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_TYPE",
      `${label} must be object`,
    );
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_TYPE",
      `${label} must be array`,
    );
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_TYPE",
      `${label} must be non-empty string`,
    );
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_TYPE",
      `${label} must be positive integer`,
    );
  }
  return value as number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_TYPE",
      `${label} must be non-negative integer`,
    );
  }
  return value as number;
}

function sha256Hex(value: unknown, label: string): string {
  const result = text(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure(
      "EVAVO_TILE_MAP_PROOF_VERIFY_HASH",
      `${label} must be SHA-256`,
    );
  }
  return result;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as JsonObject).sort(([a], [b]) =>
    a.localeCompare(b),
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
