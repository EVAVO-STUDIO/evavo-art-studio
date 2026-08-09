import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ORIGINS,
  PROJECT_ART_INTAKE_PLAN_SCHEMA,
  PROJECT_ART_INTAKE_REQUEST_SCHEMA,
  SHA256,
} from "./intake-contract.mjs";
import {
  absolutePath,
  detectMediaType,
  normalizeStorage,
  secureRegularFile,
  withoutUndefined,
} from "./intake-files.mjs";
import {
  canonicalJson,
  fail,
  isObject,
  normalizeTags,
  normalizeTimestamp,
  optionalString,
  portableRelative,
  requiredString,
  safeFileName,
  safeId,
  sha256,
  sha256File,
} from "./intake-contract.mjs";

export {
  PROJECT_ART_INTAKE_PLAN_SCHEMA,
  PROJECT_ART_INTAKE_RECEIPT_SCHEMA,
  PROJECT_ART_INTAKE_REQUEST_SCHEMA,
  STORAGE_ART_INGEST_REQUEST_SCHEMA,
  canonicalJson,
  sha256,
} from "./intake-contract.mjs";
export { validatePlanHash } from "./intake-files.mjs";

export async function compileProjectArtIntake(
  requestInput,
  { compiledAt = new Date().toISOString() } = {},
) {
  if (!isObject(requestInput) || requestInput.schema !== PROJECT_ART_INTAKE_REQUEST_SCHEMA) {
    fail(`Request must use ${PROJECT_ART_INTAKE_REQUEST_SCHEMA}.`);
  }
  const sessionId = safeId(requestInput.sessionId, "sessionId");
  const projectId = safeId(requestInput.projectId, "projectId");
  const createdBy = requiredString(requestInput.createdBy, "createdBy", 256);
  const normalizedCompiledAt = normalizeTimestamp(compiledAt, "compiledAt");
  if (
    !Array.isArray(requestInput.allowedSourceRoots) ||
    requestInput.allowedSourceRoots.length < 1 ||
    requestInput.allowedSourceRoots.length > 32
  ) {
    fail("allowedSourceRoots must contain 1 to 32 absolute directories.");
  }
  const lexicalRoots = [
    ...new Set(
      requestInput.allowedSourceRoots.map((entry, index) =>
        absolutePath(entry, `allowedSourceRoots[${index}]`),
      ),
    ),
  ];
  const allowedRoots = [];
  for (const [index, root] of lexicalRoots.entries()) {
    const info = await lstat(root).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink()) {
      fail(`allowedSourceRoots[${index}] must be an existing non-symbolic directory.`);
    }
    allowedRoots.push(await realpath(root));
  }
  allowedRoots.sort((left, right) => left.localeCompare(right));

  if (
    !Array.isArray(requestInput.sources) ||
    requestInput.sources.length < 1 ||
    requestInput.sources.length > 1_000
  ) {
    fail("sources must contain 1 to 1000 entries.");
  }
  const seenIds = new Set();
  const seenWorkingPaths = new Set();
  const sources = [];
  for (const [index, input] of requestInput.sources.entries()) {
    const label = `sources[${index}]`;
    if (!isObject(input)) fail(`${label} must be an object.`);
    const id = safeId(input.id, `${label}.id`);
    if (seenIds.has(id)) fail(`Duplicate source id: ${id}.`);
    seenIds.add(id);
    const origin = requiredString(input.origin, `${label}.origin`, 64);
    if (!ORIGINS.has(origin)) fail(`${label}.origin is not supported.`);
    const sourcePath = absolutePath(input.sourcePath, `${label}.sourcePath`);
    const verified = await secureRegularFile(
      sourcePath,
      allowedRoots,
      `${label}.sourcePath`,
    );
    const fileName = safeFileName(
      input.fileName ?? path.basename(sourcePath),
      `${label}.fileName`,
    );
    const logicalPath = portableRelative(
      input.logicalPath ?? `Unassigned/${id}/${fileName}`,
      `${label}.logicalPath`,
    );
    if (seenWorkingPaths.has(logicalPath)) {
      fail(`Duplicate logicalPath: ${logicalPath}.`);
    }
    seenWorkingPaths.add(logicalPath);
    const role = optionalString(input.role, `${label}.role`, 256);
    const note = optionalString(input.note, `${label}.note`, 4_096);
    const tags = normalizeTags(input.tags, `${label}.tags`);
    const expectedSha256 = optionalString(
      input.expectedSha256,
      `${label}.expectedSha256`,
      64,
    );
    if (expectedSha256 !== undefined && !SHA256.test(expectedSha256)) {
      fail(`${label}.expectedSha256 must be lowercase SHA-256.`);
    }
    const contentSha256 = await sha256File(verified.resolved);
    if (expectedSha256 !== undefined && expectedSha256 !== contentSha256) {
      fail(`${label} source SHA-256 differs from expectedSha256.`);
    }
    if (
      input.expectedBytes !== undefined &&
      (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes < 1)
    ) {
      fail(`${label}.expectedBytes must be a positive safe integer.`);
    }
    if (input.expectedBytes !== undefined && input.expectedBytes !== verified.size) {
      fail(`${label} source byte count differs from expectedBytes.`);
    }
    const sourceRelativePath = `sources/${id}/${fileName}`;
    const workingRelativePath = `working/${logicalPath}`;
    sources.push({
      id,
      origin,
      sourcePath: verified.resolved,
      allowedRoot: verified.allowedRoot,
      fileName,
      logicalPath,
      sourceRelativePath,
      workingRelativePath,
      mediaType: detectMediaType(fileName),
      contentSha256,
      sizeBytes: verified.size,
      ...(role === undefined ? {} : { role }),
      ...(note === undefined ? {} : { note }),
      tags,
    });
  }
  sources.sort((left, right) => left.id.localeCompare(right.id));
  const storage = normalizeStorage(requestInput.storage, projectId);
  const body = withoutUndefined({
    schema: PROJECT_ART_INTAKE_PLAN_SCHEMA,
    requestSchema: PROJECT_ART_INTAKE_REQUEST_SCHEMA,
    sessionId,
    projectId,
    createdBy,
    compiledAt: normalizedCompiledAt,
    allowedSourceRoots: allowedRoots,
    sources,
    storage,
    layout: {
      originalsRoot: "sources",
      workingRoot: "working",
      manifestsRoot: "manifests",
      reviewRoot: "review",
      receiptPath: "manifests/intake-receipt.json",
      storageHandoffPath: "manifests/storage-handoff.json",
    },
    limits: {
      maximumSources: 1_000,
      maximumSourceBytes: 2 * 1024 * 1024 * 1024,
      maximumTotalBytes: 16 * 1024 * 1024 * 1024,
    },
    authority: {
      sourceRead: true,
      workspaceWrite: true,
      sourceMutation: false,
      sourceDeletion: false,
      storageWrite: false,
      repositoryMutation: false,
      providerExecution: false,
      candidateApproval: false,
      candidatePromotion: false,
      deployment: false,
      publication: false,
      forcePush: false,
    },
    createOnlyOutput: true,
    atomicPublication: true,
    bytesFlowThroughMcp: false,
  });
  const totalBytes = sources.reduce((sum, source) => sum + source.sizeBytes, 0);
  if (sources.some((source) => source.sizeBytes > body.limits.maximumSourceBytes)) {
    fail("At least one source exceeds the intake per-file byte limit.");
  }
  if (totalBytes > body.limits.maximumTotalBytes) {
    fail("The intake batch exceeds the total byte limit.");
  }
  const planSha256 = sha256(canonicalJson(body));
  return Object.freeze({ ...body, planSha256 });
}

export async function compileProjectArtIntakeFile(
  requestPath,
  outputPath,
  options = {},
) {
  const input = JSON.parse(await readFile(path.resolve(requestPath), "utf8"));
  const plan = await compileProjectArtIntake(input, options);
  await writeFile(path.resolve(outputPath), `${JSON.stringify(plan, null, 2)}\n`, {
    flag: "wx",
  });
  return plan;
}
