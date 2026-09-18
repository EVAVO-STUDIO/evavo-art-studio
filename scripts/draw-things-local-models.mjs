#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY_SCHEMA = "evavo.draw-things-local-inventory.v1";
const GOVERNANCE_SCHEMA = "evavo.draw-things-model-governance.v1";
const POLICY_SCHEMA = "evavo.draw-things-approved-model-policy.v1";
const INSTALL_SCHEMA = "evavo.draw-things-local-install.v1";
const CATALOG_DRAFT_SCHEMA = "evavo.comfyui-workflow-catalog-draft.v1";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FILE_LIKE = /\.(?:ckpt|safetensors|bin|pt|pth|gguf|onnx|tflite)$/iu;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_FILES = 20_000;
const MAX_MODEL_COMPONENTS = 64;

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function text(value, label, maximum = 4096) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    fail(`${label} must be a canonical non-empty string`);
  }
  return value;
}

function safeId(value, label) {
  const result = text(value, label, 128);
  if (!SAFE_ID.test(result)) fail(`${label} must be a safe identifier`);
  return result;
}

function sha(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be lowercase SHA-256`);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value) {
  return hashBytes(Buffer.from(canonicalJson(value), "utf8"));
}

async function hashFile(file) {
  return await new Promise((resolve, reject) => {
    const digest = createHash("sha256");
    const stream = createReadStream(file, { highWaterMark: 1024 * 1024 });
    stream.on("data", (chunk) => digest.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(digest.digest("hex")));
  });
}

function defaultRuntimeRoot(environment = process.env) {
  const local = environment.LOCALAPPDATA?.trim();
  if (!local) fail("LOCALAPPDATA is required unless explicit paths are supplied");
  return path.join(local, "EVAVO", "AI", "DrawThings");
}

function defaultInstallManifest(environment = process.env) {
  return path.join(defaultRuntimeRoot(environment), "install-manifest.json");
}

function defaultInventoryPath(environment = process.env) {
  return path.join(defaultRuntimeRoot(environment), "inventory.json");
}

function defaultCatalogDraft(environment = process.env) {
  return path.join(defaultRuntimeRoot(environment), "catalog.draft.json");
}

function defaultCatalog(environment = process.env) {
  return path.join(defaultRuntimeRoot(environment), "catalog.json");
}

function defaultGovernanceEvidence(environment = process.env) {
  return path.join(defaultRuntimeRoot(environment), "catalog.governance.json");
}

function defaultGovernancePath(environment = process.env) {
  return path.join(defaultRuntimeRoot(environment), "model-governance.json");
}

function defaultPolicyPath() {
  return path.join(ROOT, "config", "draw-things-approved-model-policy.v1.json");
}

function safeLoopbackBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("Draw Things bridge URL is invalid");
  }
  if (url.protocol !== "http:") fail("local Draw Things bridge must use HTTP");
  if (!LOOPBACK_HOSTS.has(url.hostname)) fail("Draw Things bridge must be loopback-only");
  if (url.username || url.password || url.search || url.hash) {
    fail("Draw Things bridge URL may not contain credentials, query or fragment");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
}

async function jsonFile(file, label) {
  const resolved = path.resolve(file);
  const info = await lstat(resolved);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_JSON_BYTES) {
    fail(`${label} must be a regular bounded JSON file`);
  }
  try {
    return JSON.parse(await readFile(resolved, "utf8"));
  } catch (error) {
    fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function atomicJson(file, value) {
  const output = path.resolve(file);
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = path.join(
    path.dirname(output),
    `.${path.basename(output)}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, output);
}

function validateInstallManifest(value) {
  const install = object(value, "Draw Things install manifest");
  if (install.schema !== INSTALL_SCHEMA) {
    fail(`install manifest must use ${INSTALL_SCHEMA}`);
  }
  if (install.grpcHost !== "127.0.0.1" || Number(install.grpcPort) !== 7859) {
    fail("install manifest does not pin the canonical local Draw Things gRPC endpoint");
  }
  if (install.bridgeHost !== "127.0.0.1" || Number(install.bridgePort) !== 8193) {
    fail("install manifest does not pin the canonical local Draw Things bridge endpoint");
  }
  text(install.modelsRoot, "install.modelsRoot");
  sha(install.comfyMainSha256, "install.comfyMainSha256");
  text(install.bridgeCommit, "install.bridgeCommit", 128);
  text(install.bridgeVersion, "install.bridgeVersion", 128);
  sha(install.bridgeRequirementsSha256, "install.bridgeRequirementsSha256");
  text(install.dockerImageVersion, "install.dockerImageVersion", 128);
  const imageId = text(install.dockerImageId, "install.dockerImageId", 128);
  if (!/^sha256:[a-f0-9]{64}$/u.test(imageId)) {
    fail("install.dockerImageId must be an immutable sha256 image id");
  }
  return install;
}

async function readInstallManifest(file) {
  const bytes = await readFile(path.resolve(file));
  if (!bytes.length || bytes.length > MAX_JSON_BYTES) fail("install manifest is empty or oversized");
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("install manifest is invalid JSON");
  }
  return {
    install: validateInstallManifest(parsed),
    installManifestSha256: hashBytes(bytes),
  };
}

async function boundedJsonResponse(response, label) {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_JSON_BYTES) fail(`${label} exceeded ${MAX_JSON_BYTES} bytes`);
  if (!response.ok) {
    fail(`${label} returned HTTP ${response.status}: ${buffer.toString("utf8").slice(0, 1000)}`);
  }
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    fail(`${label} returned invalid JSON`);
  }
}

export async function fetchDrawThingsFilesInfo(
  baseUrl = "http://127.0.0.1:8193",
  fetchImpl = fetch,
) {
  const safeBase = safeLoopbackBaseUrl(baseUrl);
  const form = new FormData();
  form.set("server", "127.0.0.1");
  form.set("port", "7859");
  form.set("use_tls", "false");
  let response;
  try {
    response = await fetchImpl(`${safeBase}/dt_grpc/files_info`, {
      method: "POST",
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    fail(`Draw Things files_info request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const value = await boundedJsonResponse(response, "Draw Things files_info");
  const record = object(value, "Draw Things files_info");
  if (!Array.isArray(record.models)) fail("Draw Things files_info.models must be an array");
  return record;
}

function normalizedRelative(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) return null;
  const replaced = value.replace(/\\/gu, "/").replace(/^\.\//u, "");
  if (
    path.posix.isAbsolute(replaced) ||
    /^[A-Za-z]:/u.test(replaced) ||
    replaced.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    return null;
  }
  return replaced;
}

function collectFileReferences(value, output = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectFileReferences(entry, output);
    return output;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FILE_LIKE.test(value)) {
      const relative = normalizedRelative(value);
      if (relative) output.add(relative);
    }
    return output;
  }
  for (const entry of Object.values(value)) collectFileReferences(entry, output);
  return output;
}

async function buildFileIndex(rootPath) {
  const root = await realpath(path.resolve(rootPath));
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    fail("Draw Things modelsRoot must be a regular directory");
  }
  const byRelative = new Map();
  const byBase = new Map();
  let count = 0;

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      count += 1;
      if (count > MAX_FILES) fail(`modelsRoot contains more than ${MAX_FILES} entries`);
      const full = path.join(directory, entry.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) fail(`modelsRoot contains symlink ${full}`);
      if (info.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!info.isFile()) continue;
      const relative = path.relative(root, full).split(path.sep).join("/");
      const key = relative.toLowerCase();
      byRelative.set(key, { full, relative, sizeBytes: info.size });
      const base = path.basename(relative).toLowerCase();
      const bucket = byBase.get(base) ?? [];
      bucket.push({ full, relative, sizeBytes: info.size });
      byBase.set(base, bucket);
    }
  }

  await walk(root);
  return { root, byRelative, byBase };
}

function locateComponent(index, requested) {
  const normalized = normalizedRelative(requested);
  if (!normalized) fail(`model component path is unsafe: ${requested}`);
  const exact = index.byRelative.get(normalized.toLowerCase());
  if (exact) return exact;
  const matches = index.byBase.get(path.basename(normalized).toLowerCase()) ?? [];
  if (matches.length === 1) return matches[0];
  if (!matches.length) fail(`model component is absent from modelsRoot: ${requested}`);
  fail(`model component name is ambiguous under modelsRoot: ${requested}`);
}

function modelName(model) {
  const candidate = typeof model.name === "string" ? model.name.trim() : "";
  return candidate || text(model.file, "model.file", 1024);
}

function modelVersion(model) {
  const candidate = typeof model.version === "string" ? model.version.trim() : "";
  return candidate || "unknown";
}

function generatedInventoryId(model, bundleSha256) {
  const base = modelName(model)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96);
  const safe = base && /^[A-Za-z0-9]/u.test(base) ? base : "model";
  return `dt-${safe}-${bundleSha256.slice(0, 12)}`;
}

async function inventoryModel(modelRaw, fileIndex) {
  const model = object(modelRaw, "Draw Things model");
  const file = text(model.file, "model.file", 1024);
  const references = [...collectFileReferences(model)];
  if (!references.includes(file)) references.unshift(file);
  if (!references.length || references.length > MAX_MODEL_COMPONENTS) {
    fail(`model ${file} references an invalid number of physical components`);
  }
  const unique = [...new Set(references)];
  const components = [];
  const seenPhysical = new Set();
  for (const reference of unique) {
    const located = locateComponent(fileIndex, reference);
    if (!located.sizeBytes) fail(`model component is empty: ${located.relative}`);
    if (!seenPhysical.has(located.relative.toLowerCase())) {
      components.push({
        relativePath: located.relative,
        sizeBytes: located.sizeBytes,
        sha256: await hashFile(located.full),
      });
      seenPhysical.add(located.relative.toLowerCase());
    }
    const tensorData = `${located.full}-tensordata`;
    try {
      const tensorInfo = await lstat(tensorData);
      if (tensorInfo.isSymbolicLink() || !tensorInfo.isFile()) {
        fail(`model tensor sidecar is not a regular file: ${located.relative}-tensordata`);
      }
      if (!tensorInfo.size) {
        fail(`model tensor sidecar is empty: ${located.relative}-tensordata`);
      }
      const tensorRelative = `${located.relative}-tensordata`;
      if (!seenPhysical.has(tensorRelative.toLowerCase())) {
        components.push({
          relativePath: tensorRelative,
          sizeBytes: tensorInfo.size,
          sha256: await hashFile(tensorData),
        });
        seenPhysical.add(tensorRelative.toLowerCase());
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        // Monolithic Draw Things checkpoint: no external tensor store is expected.
      } else {
        throw error;
      }
    }
  }
  components.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const metadataSha256 = hashJson(model);
  const bundleSha256 = hashJson({
    metadata: model,
    components,
  });
  return {
    id: generatedInventoryId(model, bundleSha256),
    name: modelName(model),
    file,
    version: modelVersion(model),
    bundleSha256,
    metadataSha256,
    components,
    model: canonical(model),
  };
}

export async function captureDrawThingsInventory(options = {}) {
  const installPath = path.resolve(options.installManifest ?? defaultInstallManifest(options.environment));
  const { install, installManifestSha256 } = await readInstallManifest(installPath);
  const baseUrl = safeLoopbackBaseUrl(
    options.baseUrl ?? `http://${install.bridgeHost}:${install.bridgePort}`,
  );
  const fileInfo = options.filesInfo ?? await fetchDrawThingsFilesInfo(baseUrl, options.fetch ?? fetch);
  const index = await buildFileIndex(install.modelsRoot);
  const models = [];
  for (const raw of fileInfo.models) models.push(await inventoryModel(raw, index));
  models.sort((left, right) =>
    left.name.localeCompare(right.name) ||
    left.file.localeCompare(right.file) ||
    left.bundleSha256.localeCompare(right.bundleSha256),
  );
  const rawCategoryCounts = {};
  for (const [key, value] of Object.entries(fileInfo)) {
    if (Array.isArray(value)) rawCategoryCounts[key] = value.length;
  }
  return {
    schema: INVENTORY_SCHEMA,
    capturedAt: new Date().toISOString(),
    bridgeEndpoint: baseUrl,
    grpcEndpoint: `${install.grpcHost}:${install.grpcPort}`,
    installManifestSha256,
    models,
    rawCategoryCounts,
  };
}

function validateInventory(value) {
  const inventory = object(value, "Draw Things inventory");
  if (inventory.schema !== INVENTORY_SCHEMA) fail(`inventory must use ${INVENTORY_SCHEMA}`);
  sha(inventory.installManifestSha256, "inventory.installManifestSha256");
  if (!Array.isArray(inventory.models) || inventory.models.length > 512) {
    fail("inventory.models must contain at most 512 models");
  }
  return inventory;
}

function generationDefaults(value, label = "generationDefaults") {
  if (value === undefined || value === null) {
    return {
      steps: 20,
      cfg: 4.5,
      samplerName: "DPM++ 2M AYS",
      seedMode: "ScaleAlike",
      clipSkip: 1,
      shift: 1,
      resolutionDependentShift: true,
      speedUp: true,
      teaCache: false,
      teaCacheThreshold: 0.2,
      teaCacheStart: 5,
      teaCacheEnd: 2,
      teaCacheMaxSkipSteps: 3,
    };
  }
  const defaults = object(value, label);
  const integer = (key, minimum, maximum) => {
    const result = defaults[key];
    if (!Number.isInteger(result) || result < minimum || result > maximum) {
      fail(`${label}.${key} must be an integer in [${minimum}, ${maximum}]`);
    }
    return result;
  };
  const number = (key, minimum, maximum) => {
    const result = defaults[key];
    if (typeof result !== "number" || !Number.isFinite(result) || result < minimum || result > maximum) {
      fail(`${label}.${key} must be a number in [${minimum}, ${maximum}]`);
    }
    return result;
  };
  const boolean = (key) => {
    if (typeof defaults[key] !== "boolean") fail(`${label}.${key} must be boolean`);
    return defaults[key];
  };
  return {
    steps: integer("steps", 1, 150),
    cfg: number("cfg", 0, 50),
    samplerName: text(defaults.samplerName, `${label}.samplerName`, 128),
    seedMode: text(defaults.seedMode, `${label}.seedMode`, 64),
    clipSkip: integer("clipSkip", 1, 23),
    shift: number("shift", 0.1, 16),
    resolutionDependentShift: boolean("resolutionDependentShift"),
    speedUp: boolean("speedUp"),
    teaCache: boolean("teaCache"),
    teaCacheThreshold: number("teaCacheThreshold", 0, 1),
    teaCacheStart: integer("teaCacheStart", 0, 1000),
    teaCacheEnd: integer("teaCacheEnd", -151, 150),
    teaCacheMaxSkipSteps: integer("teaCacheMaxSkipSteps", 1, 50),
  };
}

function validateExpectedFiles(value, label) {
  if (!Array.isArray(value) || !value.length || value.length > 32) {
    fail(`${label} must contain 1 to 32 files`);
  }
  const names = new Set();
  return value.map((raw, index) => {
    const file = object(raw, `${label}[${index}]`);
    const name = text(file.name, `${label}[${index}].name`, 256);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u.test(name) || names.has(name)) {
      fail(`${label}[${index}].name is unsafe or duplicated`);
    }
    names.add(name);
    return { name, sha256: sha(file.sha256, `${label}[${index}].sha256`) };
  });
}

function validateApprovedPolicy(value) {
  const policy = object(value, "Draw Things approved model policy");
  if (policy.schema !== POLICY_SCHEMA) fail(`policy must use ${POLICY_SCHEMA}`);
  const policyId = safeId(policy.policyId, "policy.policyId");
  const reviewedBy = text(policy.reviewedBy, "policy.reviewedBy", 256);
  if (!Number.isFinite(Date.parse(policy.reviewedAt))) fail("policy.reviewedAt is invalid");
  const reviewedAt = policy.reviewedAt;
  if (!Array.isArray(policy.models) || !policy.models.length || policy.models.length > 64) {
    fail("policy.models must contain 1 to 64 entries");
  }
  const ids = new Set();
  const models = policy.models.map((raw, index) => {
    const entry = object(raw, `policy.models[${index}]`);
    const id = safeId(entry.id, `policy.models[${index}].id`);
    if (ids.has(id)) fail(`duplicate policy model id ${id}`);
    ids.add(id);
    const license = object(entry.license, `policy.models[${index}].license`);
    for (const field of ["commercialUse", "derivatives", "redistribution"]) {
      if (!new Set(["allowed", "restricted", "unknown", "prohibited"]).has(license[field])) {
        fail(`policy.models[${index}].license.${field} is unsupported`);
      }
    }
    if (!Array.isArray(entry.approvedUses) || !entry.approvedUses.length) {
      fail(`policy.models[${index}].approvedUses must be non-empty`);
    }
    const priority = entry.priority;
    if (!Number.isInteger(priority) || priority < -1000 || priority > 1000) {
      fail(`policy.models[${index}].priority must be an integer in [-1000, 1000]`);
    }
    const resourceClass = entry.resourceClass ?? "baseline";
    if (!new Set(["baseline", "quality", "heavy"]).has(resourceClass)) {
      fail(`policy.models[${index}].resourceClass is unsupported`);
    }
    return {
      id,
      inventoryName: text(entry.inventoryName, `policy.models[${index}].inventoryName`, 512),
      inventoryFile: text(entry.inventoryFile, `policy.models[${index}].inventoryFile`, 1024),
      version: text(entry.version, `policy.models[${index}].version`, 256),
      expectedFiles: validateExpectedFiles(entry.expectedFiles, `policy.models[${index}].expectedFiles`),
      source: canonical(object(entry.source, `policy.models[${index}].source`)),
      license: canonical(license),
      approvedUses: [...new Set(entry.approvedUses.map((use, useIndex) =>
        text(use, `policy.models[${index}].approvedUses[${useIndex}]`, 64),
      ))].sort(),
      generationDefaults: generationDefaults(entry.generationDefaults, `policy.models[${index}].generationDefaults`),
      priority,
      resourceClass,
      ...(typeof entry.notes === "string" && entry.notes.trim() ? { notes: entry.notes.trim() } : {}),
    };
  });
  return { schema: POLICY_SCHEMA, policyId, reviewedBy, reviewedAt, models };
}

function componentMap(model) {
  if (!Array.isArray(model.components) || !model.components.length) {
    fail(`inventory model ${model.id ?? model.file ?? "unknown"} has no physical components`);
  }
  const result = new Map();
  for (const component of model.components) {
    const item = object(component, "inventory model component");
    const relativePath = text(item.relativePath, "inventory component.relativePath", 2048);
    const name = path.posix.basename(relativePath.replace(/\\/gu, "/"));
    if (result.has(name)) fail(`inventory model contains duplicate component basename ${name}`);
    result.set(name, sha(item.sha256, `inventory component ${name}.sha256`));
  }
  return result;
}

export function governanceFromPolicy(inventoryRaw, policyRaw, policySha256) {
  const inventory = validateInventory(inventoryRaw);
  const policy = validateApprovedPolicy(policyRaw);
  const policyDigest = sha(policySha256, "policySha256");
  const models = [];
  for (const policyModel of policy.models) {
    const observed = inventory.models.find(
      (model) =>
        model.name === policyModel.inventoryName &&
        model.file === policyModel.inventoryFile &&
        model.version === policyModel.version,
    );
    if (!observed) continue;
    const components = componentMap(observed);
    const expected = new Map(policyModel.expectedFiles.map((entry) => [entry.name, entry.sha256]));
    for (const [name, expectedSha] of expected) {
      if (components.get(name) !== expectedSha) {
        fail(`policy model ${policyModel.id} expected exact file ${name} with SHA-256 ${expectedSha}, but current inventory differs`);
      }
    }
    const unexpected = [...components.keys()].filter((name) => !expected.has(name));
    if (unexpected.length) {
      fail(`policy model ${policyModel.id} contains unreviewed physical components: ${unexpected.join(", ")}`);
    }
    models.push({
      id: policyModel.id,
      inventoryName: policyModel.inventoryName,
      inventoryFile: policyModel.inventoryFile,
      version: policyModel.version,
      bundleSha256: sha(observed.bundleSha256, `inventory ${policyModel.id}.bundleSha256`),
      expectedFiles: policyModel.expectedFiles,
      source: policyModel.source,
      license: policyModel.license,
      approvedUses: policyModel.approvedUses,
      generationDefaults: policyModel.generationDefaults,
      priority: policyModel.priority,
      resourceClass: policyModel.resourceClass,
      policyId: policy.policyId,
      policySha256: policyDigest,
      reviewedBy: policy.reviewedBy,
      reviewedAt: policy.reviewedAt,
      ...(policyModel.notes ? { notes: policyModel.notes } : {}),
    });
  }
  if (!models.length) {
    fail("no approved policy model matches the exact current Draw Things inventory");
  }
  models.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  return {
    schema: GOVERNANCE_SCHEMA,
    policyId: policy.policyId,
    policySha256: policyDigest,
    reviewedBy: policy.reviewedBy,
    reviewedAt: policy.reviewedAt,
    models,
  };
}

function validateGovernance(value) {
  const governance = object(value, "Draw Things model governance");
  if (governance.schema !== GOVERNANCE_SCHEMA) {
    fail(`governance must use ${GOVERNANCE_SCHEMA}`);
  }
  if (!Array.isArray(governance.models) || governance.models.length > 256) {
    fail("governance.models must contain at most 256 entries");
  }
  const ids = new Set();
  for (const [index, raw] of governance.models.entries()) {
    const entry = object(raw, `governance.models[${index}]`);
    const id = safeId(entry.id, `governance.models[${index}].id`);
    if (ids.has(id)) fail(`duplicate governance model id ${id}`);
    ids.add(id);
    text(entry.inventoryName, `governance.models[${index}].inventoryName`, 512);
    text(entry.inventoryFile, `governance.models[${index}].inventoryFile`, 1024);
    text(entry.version, `governance.models[${index}].version`, 256);
    sha(entry.bundleSha256, `governance.models[${index}].bundleSha256`);
    const license = object(entry.license, `governance.models[${index}].license`);
    for (const field of ["commercialUse", "derivatives", "redistribution"]) {
      if (!new Set(["allowed", "restricted", "unknown", "prohibited"]).has(license[field])) {
        fail(`governance.models[${index}].license.${field} is unsupported`);
      }
    }
    if (!Array.isArray(entry.approvedUses) || !entry.approvedUses.length) {
      fail(`governance.models[${index}].approvedUses must be non-empty`);
    }
    text(entry.reviewedBy, `governance.models[${index}].reviewedBy`, 256);
    const reviewed = Date.parse(entry.reviewedAt);
    if (!Number.isFinite(reviewed)) fail(`governance.models[${index}].reviewedAt is invalid`);
  }
  return governance;
}

function selectGovernedModel(inventory, governance, requestedId) {
  const eligible = governance.models.filter((entry) => {
    if (requestedId && entry.id !== requestedId) return false;
    const inventoryModelEntry = inventory.models.find(
      (model) =>
        model.name === entry.inventoryName &&
        model.file === entry.inventoryFile &&
        model.version === entry.version &&
        model.bundleSha256 === entry.bundleSha256,
    );
    return Boolean(inventoryModelEntry);
  });
  if (!eligible.length) {
    fail(
      requestedId
        ? `governed model ${requestedId} does not exactly match current local inventory`
        : "no governed model exactly matches the current local inventory",
    );
  }
  if (eligible.length !== 1) {
    fail("more than one governed model matches; select one explicitly with --model");
  }
  const governanceEntry = eligible[0];
  if (governanceEntry.license.commercialUse !== "allowed") {
    fail(`model ${governanceEntry.id} is not approved for commercial use`);
  }
  if (governanceEntry.license.derivatives === "prohibited") {
    fail(`model ${governanceEntry.id} prohibits derivative use`);
  }
  const inventoryEntry = inventory.models.find(
    (model) => model.bundleSha256 === governanceEntry.bundleSha256,
  );
  if (!inventoryEntry) fail("governed model disappeared from the current inventory");
  return { governanceEntry, inventoryEntry };
}

function assetKindsForUses(uses) {
  const result = new Set();
  for (const use of uses) {
    if (use === "concept" || use === "illustration" || use === "reference") result.add("illustration");
    if (use === "sprite") {
      result.add("sprite-frame");
      result.add("sprite-layer");
    }
    if (use === "environment") result.add("environment");
    if (use === "effect") result.add("effect");
    if (use === "ui") result.add("ui");
    if (use === "print") result.add("print");
  }
  if (!result.size) fail("governed model has no approved Art Studio output asset kinds");
  return [...result].sort();
}

function samplerInputs(model) {
  return {
    settings: "Basic",
    server: "127.0.0.1",
    port: "7859",
    use_tls: false,
    model: {
      value: canonical(model.model),
      content: `${model.name} (${model.version})`,
    },
    strength: 1,
    seed: 1,
    seed_mode: "ScaleAlike",
    width: 1024,
    height: 1024,
    steps: 20,
    num_frames: 14,
    cfg: 4.5,
    cfg_zero_star: false,
    cfg_zero_star_init_steps: 0,
    speed_up: true,
    guidance_embed: 4.5,
    sampler_name: "DPM++ 2M AYS",
    stochastic_sampling_gamma: 0.3,
    res_dpt_shift: true,
    shift: 1,
    batch_size: 1,
    fps: 5,
    motion_scale: 127,
    guiding_frame_noise: 0.02,
    start_frame_guidance: 1,
    causal_inference: 0,
    causal_inference_pad: 0,
    clip_skip: 1,
    sharpness: 0.6,
    mask_blur: 1.5,
    mask_blur_outset: 0,
    preserve_original: true,
    high_res_fix: false,
    high_res_fix_start_width: 448,
    high_res_fix_start_height: 448,
    high_res_fix_strength: 0.7,
    tiled_decoding: false,
    decoding_tile_width: 640,
    decoding_tile_height: 640,
    decoding_tile_overlap: 128,
    tiled_diffusion: false,
    diffusion_tile_width: 512,
    diffusion_tile_height: 512,
    diffusion_tile_overlap: 64,
    tea_cache: false,
    tea_cache_start: 5,
    tea_cache_end: 2,
    tea_cache_threshold: 0.2,
    tea_cache_max_skip_steps: 3,
    separate_clip_l: false,
    clip_l_text: "",
    separate_open_clip_g: false,
    open_clip_g_text: "",
    color_calibration: "Disabled",
    positive: ["1", 0],
    negative: ["2", 0],
  };
}

export function buildDrawThingsCatalogDraft({
  inventory: inventoryRaw,
  governance: governanceRaw,
  install: installRaw,
  modelId = null,
}) {
  const inventory = validateInventory(inventoryRaw);
  const governance = validateGovernance(governanceRaw);
  const install = validateInstallManifest(installRaw);
  const installHash = hashJson(install);
  // The runtime inventory capture hashes the exact on-disk manifest bytes. The
  // pure compiler cannot reproduce whitespace, so callers must verify this
  // equality before invoking this helper when they have those bytes.
  if (!inventory.installManifestSha256) fail("inventory is missing install manifest identity");
  const { governanceEntry, inventoryEntry } = selectGovernedModel(
    inventory,
    governance,
    modelId,
  );
  const profileId = safeId(
    `dt-${governanceEntry.id}-generate`,
    "generated Draw Things profileId",
  );
  const assetKinds = assetKindsForUses(governanceEntry.approvedUses);
  const continuityPhases = governanceEntry.approvedUses.includes("sprite")
    ? ["direction-master", "identity-master", "independent"]
    : ["independent"];
  const bridgeRuntimeSha256 = hashJson({
    bridgeCommit: install.bridgeCommit,
    bridgeVersion: install.bridgeVersion,
    bridgeRequirementsSha256: install.bridgeRequirementsSha256,
  });
  const grpcRuntimeSha256 = install.dockerImageId.slice("sha256:".length);
  sha(grpcRuntimeSha256, "Draw Things local Docker image id");

  const draft = {
    schemaVersion: CATALOG_DRAFT_SCHEMA,
    catalogId: safeId(`evavo-local-draw-things-${governanceEntry.id}`, "catalogId"),
    catalogVersion: `1.0.0-${inventoryEntry.bundleSha256.slice(0, 12)}`,
    profiles: [
      {
        profileId,
        label: `Draw Things local · ${inventoryEntry.name}`,
        description:
          "Pinned local-only Draw Things text generation through the reviewed EVAVO ComfyUI gRPC bridge. This base profile deliberately does not claim identity/reference/in-between capabilities.",
        version: `1.0.0-${inventoryEntry.bundleSha256.slice(0, 12)}`,
        priority: 170,
        operations: ["generate"],
        assetKinds,
        continuityPhases,
        capabilities: ["generate", "seed", "custom-size", "candidate-count", "cancellation"],
        modelId: governanceEntry.id,
        workflow: {
          "1": {
            class_type: "DrawThingsPositive",
            inputs: { positive: "positive" },
          },
          "2": {
            class_type: "DrawThingsNegative",
            inputs: { negative: "negative" },
          },
          "3": {
            class_type: "DrawThingsSampler",
            inputs: samplerInputs(inventoryEntry),
          },
          "4": {
            class_type: "SaveImage",
            inputs: {
              filename_prefix: "evavo-draw-things",
              images: ["3", 0],
            },
          },
        },
        bindings: {
          positivePrompt: { nodeId: "1", input: "positive" },
          negativePrompt: { nodeId: "2", input: "negative" },
          width: { nodeId: "3", input: "width" },
          height: { nodeId: "3", input: "height" },
          seed: { nodeId: "3", input: "seed" },
          candidateCount: { nodeId: "3", input: "batch_size" },
          filenamePrefix: { nodeId: "4", input: "filename_prefix" },
          referenceImages: [],
        },
        outputNodeIds: ["4"],
        modelInventory: [
          {
            id: governanceEntry.id,
            kind: "draw-things-model-bundle",
            sha256: inventoryEntry.bundleSha256,
          },
        ],
        runtimeInventory: [
          {
            id: "comfyui",
            version: "local-main",
            sha256: install.comfyMainSha256,
          },
          {
            id: "draw-things-comfyui",
            version: install.bridgeVersion,
            sha256: bridgeRuntimeSha256,
          },
          {
            id: "draw-things-grpc-server",
            version: install.dockerImageVersion,
            sha256: grpcRuntimeSha256,
          },
        ],
        limits: {
          maximumCandidates: 4,
          maximumReferenceImages: 0,
          maximumSourceBytes: 67108864,
        },
      },
    ],
  };

  return {
    draft,
    governanceEvidence: {
      schema: "evavo.draw-things-catalog-governance-evidence.v1",
      generatedAt: new Date().toISOString(),
      modelId: governanceEntry.id,
      inventoryId: inventoryEntry.id,
      inventoryName: inventoryEntry.name,
      inventoryFile: inventoryEntry.file,
      modelVersion: inventoryEntry.version,
      bundleSha256: inventoryEntry.bundleSha256,
      source: canonical(governanceEntry.source),
      license: canonical(governanceEntry.license),
      approvedUses: [...governanceEntry.approvedUses].sort(),
      reviewedBy: governanceEntry.reviewedBy,
      reviewedAt: governanceEntry.reviewedAt,
      installManifestSha256: inventory.installManifestSha256,
      installCanonicalSha256: installHash,
      commercialUseApproved: true,
      arbitraryModelSelectionAllowed: false,
      automaticModelDownloadAllowed: false,
    },
  };
}

async function compileCatalog(draft) {
  let module;
  try {
    module = await import("../packages/providers/dist/index.js");
  } catch {
    fail(
      "provider package is not built; run pnpm --filter @evavo/art-providers build before compiling a Draw Things catalog",
    );
  }
  if (typeof module.compileComfyUIWorkflowCatalog !== "function") {
    fail("provider package does not expose compileComfyUIWorkflowCatalog");
  }
  return module.compileComfyUIWorkflowCatalog(draft);
}

function parseArguments(argv) {
  if (!argv.length) fail("usage: draw-things-local-models <inventory|compile> [--name value ...]");
  const command = argv[0];
  if (!new Set(["inventory", "compile"]).has(command)) fail(`unsupported command ${command}`);
  const args = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value == null || value.startsWith("--") || args.has(key)) {
      fail("arguments must be unique --name value pairs");
    }
    args.set(key, value);
  }
  const allowed = new Set([
    "--install-manifest",
    "--base-url",
    "--output",
    "--inventory",
    "--governance",
    "--model",
    "--draft-output",
    "--evidence-output",
  ]);
  for (const key of args.keys()) if (!allowed.has(key)) fail(`unsupported argument ${key}`);
  return { command, args };
}

async function runInventory(args) {
  const installManifest = args.get("--install-manifest") ?? defaultInstallManifest();
  const baseUrl = args.get("--base-url") ?? "http://127.0.0.1:8193";
  const output = args.get("--output") ?? defaultInventoryPath();
  const inventory = await captureDrawThingsInventory({ installManifest, baseUrl });
  await atomicJson(output, inventory);
  return {
    ok: true,
    command: "inventory",
    output: path.resolve(output),
    modelCount: inventory.models.length,
    models: inventory.models.map((model) => ({
      id: model.id,
      name: model.name,
      file: model.file,
      version: model.version,
      bundleSha256: model.bundleSha256,
      componentCount: model.components.length,
    })),
    rawCategoryCounts: inventory.rawCategoryCounts,
    authority: {
      modelDownload: false,
      modelApproval: false,
      catalogCompilation: false,
      generation: false,
    },
  };
}

async function runCompile(args) {
  const installManifestPath = args.get("--install-manifest") ?? defaultInstallManifest();
  const inventoryPath = args.get("--inventory") ?? defaultInventoryPath();
  const governancePath = args.get("--governance");
  if (!governancePath) fail("compile requires --governance <file>");
  const draftOutput = args.get("--draft-output") ?? defaultCatalogDraft();
  const output = args.get("--output") ?? defaultCatalog();
  const evidenceOutput = args.get("--evidence-output") ?? defaultGovernanceEvidence();

  const rawInstallBytes = await readFile(path.resolve(installManifestPath));
  const installManifestSha256 = hashBytes(rawInstallBytes);
  let install;
  try {
    install = validateInstallManifest(JSON.parse(rawInstallBytes.toString("utf8")));
  } catch (error) {
    fail(`install manifest is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const inventory = validateInventory(await jsonFile(inventoryPath, "Draw Things inventory"));
  if (inventory.installManifestSha256 !== installManifestSha256) {
    fail("Draw Things inventory was captured against a different install manifest; recapture inventory first");
  }
  const governance = validateGovernance(
    await jsonFile(governancePath, "Draw Things model governance"),
  );
  const built = buildDrawThingsCatalogDraft({
    inventory,
    governance,
    install,
    modelId: args.get("--model") ?? null,
  });
  const catalog = await compileCatalog(built.draft);
  const evidence = {
    ...built.governanceEvidence,
    catalogId: catalog.catalogId,
    catalogVersion: catalog.catalogVersion,
    catalogSha256: catalog.catalogSha256,
    profileIds: catalog.profiles.map((profile) => profile.profileId),
    profileSha256: Object.fromEntries(
      catalog.profiles.map((profile) => [profile.profileId, profile.profileSha256]),
    ),
  };
  await atomicJson(draftOutput, built.draft);
  await atomicJson(output, catalog);
  await atomicJson(evidenceOutput, evidence);
  return {
    ok: true,
    command: "compile",
    inventory: path.resolve(inventoryPath),
    governance: path.resolve(governancePath),
    draftOutput: path.resolve(draftOutput),
    output: path.resolve(output),
    evidenceOutput: path.resolve(evidenceOutput),
    catalogId: catalog.catalogId,
    catalogSha256: catalog.catalogSha256,
    adapters: catalog.profiles.map((profile) => `draw-things:${profile.profileId}`),
    authority: {
      modelDownload: false,
      generation: false,
      candidateApproval: false,
      publication: false,
    },
  };
}

async function main() {
  const { command, args } = parseArguments(process.argv.slice(2));
  const result = command === "inventory" ? await runInventory(args) : await runCompile(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 2;
  });
}
