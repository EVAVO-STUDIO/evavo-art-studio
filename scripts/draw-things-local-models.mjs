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

async function jsonFileWithSha(file, label) {
  const resolved = path.resolve(file);
  const info = await lstat(resolved);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_JSON_BYTES) {
    fail(`${label} must be a regular bounded JSON file`);
  }
  const bytes = await readFile(resolved);
  try {
    return {
      path: resolved,
      value: JSON.parse(bytes.toString("utf8")),
      sha256: hashBytes(bytes),
    };
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
  if (!Array.isArray(record.controlNets)) fail("Draw Things files_info.controlNets must be an array");
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
  const controls = [];
  for (const raw of fileInfo.controlNets) controls.push(await inventoryModel(raw, index));
  controls.sort((left, right) =>
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
    controls,
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
  if (!Array.isArray(inventory.controls) || inventory.controls.length > 512) {
    fail("inventory.controls must contain at most 512 controls");
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
  const rawControls = policy.controls ?? [];
  if (!Array.isArray(rawControls) || rawControls.length > 64) {
    fail("policy.controls must contain at most 64 entries");
  }
  const controls = rawControls.map((raw, index) => {
    const entry = object(raw, `policy.controls[${index}]`);
    const id = safeId(entry.id, `policy.controls[${index}].id`);
    if (ids.has(id)) fail(`duplicate policy asset id ${id}`);
    ids.add(id);
    const license = object(entry.license, `policy.controls[${index}].license`);
    for (const field of ["commercialUse", "derivatives", "redistribution"]) {
      if (!new Set(["allowed", "restricted", "unknown", "prohibited"]).has(license[field])) {
        fail(`policy.controls[${index}].license.${field} is unsupported`);
      }
    }
    if (!Array.isArray(entry.approvedRoles) || !entry.approvedRoles.length) {
      fail(`policy.controls[${index}].approvedRoles must be non-empty`);
    }
    const approvedRoles = [...new Set(entry.approvedRoles.map((role, roleIndex) =>
      text(role, `policy.controls[${index}].approvedRoles[${roleIndex}]`, 64),
    ))].sort();
    const allowedRoles = new Set([
      "pose-control",
      "edge-control",
      "depth-control",
      "palette-reference",
      "line-reference",
      "material-reference",
    ]);
    if (approvedRoles.some((role) => !allowedRoles.has(role))) {
      fail(`policy.controls[${index}].approvedRoles contains unsupported roles`);
    }
    if (!Array.isArray(entry.compatibleModelIds) || !entry.compatibleModelIds.length) {
      fail(`policy.controls[${index}].compatibleModelIds must be non-empty`);
    }
    const compatibleModelIds = [...new Set(entry.compatibleModelIds.map((modelId, modelIndex) =>
      safeId(modelId, `policy.controls[${index}].compatibleModelIds[${modelIndex}]`),
    ))].sort();
    const minimumVramGb = entry.minimumVramGb;
    if (typeof minimumVramGb !== "number" || !Number.isFinite(minimumVramGb) || minimumVramGb < 0 || minimumVramGb > 64) {
      fail(`policy.controls[${index}].minimumVramGb must be a finite number in [0, 64]`);
    }
    const priority = entry.priority;
    if (!Number.isInteger(priority) || priority < -1000 || priority > 1000) {
      fail(`policy.controls[${index}].priority must be an integer in [-1000, 1000]`);
    }
    return {
      id,
      inventoryName: text(entry.inventoryName, `policy.controls[${index}].inventoryName`, 512),
      inventoryFile: text(entry.inventoryFile, `policy.controls[${index}].inventoryFile`, 1024),
      version: text(entry.version, `policy.controls[${index}].version`, 256),
      expectedFiles: validateExpectedFiles(entry.expectedFiles, `policy.controls[${index}].expectedFiles`),
      source: canonical(object(entry.source, `policy.controls[${index}].source`)),
      license: canonical(license),
      approvedRoles,
      compatibleModelIds,
      minimumVramGb,
      priority,
      ...(typeof entry.notes === "string" && entry.notes.trim() ? { notes: entry.notes.trim() } : {}),
    };
  });
  return { schema: POLICY_SCHEMA, policyId, reviewedBy, reviewedAt, models, controls };
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

  const controls = [];
  for (const policyControl of policy.controls) {
    const observed = inventory.controls.find(
      (control) =>
        control.name === policyControl.inventoryName &&
        control.file === policyControl.inventoryFile &&
        control.version === policyControl.version,
    );
    if (!observed) continue;
    const components = componentMap(observed);
    const expected = new Map(policyControl.expectedFiles.map((entry) => [entry.name, entry.sha256]));
    for (const [name, expectedSha] of expected) {
      if (components.get(name) !== expectedSha) {
        fail(`policy control ${policyControl.id} expected exact file ${name} with SHA-256 ${expectedSha}, but current inventory differs`);
      }
    }
    const unexpected = [...components.keys()].filter((name) => !expected.has(name));
    if (unexpected.length) {
      fail(`policy control ${policyControl.id} contains unreviewed physical components: ${unexpected.join(", ")}`);
    }
    if (policyControl.license.commercialUse !== "allowed") {
      fail(`control ${policyControl.id} is not approved for commercial use`);
    }
    if (policyControl.license.derivatives === "prohibited") {
      fail(`control ${policyControl.id} prohibits derivative use`);
    }
    controls.push({
      id: policyControl.id,
      inventoryName: policyControl.inventoryName,
      inventoryFile: policyControl.inventoryFile,
      version: policyControl.version,
      bundleSha256: sha(observed.bundleSha256, `inventory control ${policyControl.id}.bundleSha256`),
      expectedFiles: policyControl.expectedFiles,
      source: policyControl.source,
      license: policyControl.license,
      approvedRoles: policyControl.approvedRoles,
      compatibleModelIds: policyControl.compatibleModelIds,
      minimumVramGb: policyControl.minimumVramGb,
      priority: policyControl.priority,
      policyId: policy.policyId,
      policySha256: policyDigest,
      reviewedBy: policy.reviewedBy,
      reviewedAt: policy.reviewedAt,
      ...(policyControl.notes ? { notes: policyControl.notes } : {}),
    });
  }
  controls.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  return {
    schema: GOVERNANCE_SCHEMA,
    policyId: policy.policyId,
    policySha256: policyDigest,
    reviewedBy: policy.reviewedBy,
    reviewedAt: policy.reviewedAt,
    models,
    controls,
  };
}

function validateGovernance(value) {
  const governance = object(value, "Draw Things model governance");
  if (governance.schema !== GOVERNANCE_SCHEMA) {
    fail(`governance must use ${GOVERNANCE_SCHEMA}`);
  }
  if (!Array.isArray(governance.models) || !governance.models.length || governance.models.length > 256) {
    fail("governance.models must contain 1 to 256 entries");
  }
  if (governance.policyId !== undefined) safeId(governance.policyId, "governance.policyId");
  if (governance.policySha256 !== undefined) sha(governance.policySha256, "governance.policySha256");
  if (governance.reviewedBy !== undefined) text(governance.reviewedBy, "governance.reviewedBy", 256);
  if (governance.reviewedAt !== undefined && !Number.isFinite(Date.parse(governance.reviewedAt))) {
    fail("governance.reviewedAt is invalid");
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
    if (entry.expectedFiles !== undefined) {
      validateExpectedFiles(entry.expectedFiles, `governance.models[${index}].expectedFiles`);
    }
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
    generationDefaults(entry.generationDefaults, `governance.models[${index}].generationDefaults`);
    if (entry.priority !== undefined && (!Number.isInteger(entry.priority) || entry.priority < -1000 || entry.priority > 1000)) {
      fail(`governance.models[${index}].priority must be an integer in [-1000, 1000]`);
    }
    if (entry.resourceClass !== undefined && !new Set(["baseline", "quality", "heavy"]).has(entry.resourceClass)) {
      fail(`governance.models[${index}].resourceClass is unsupported`);
    }
    if (entry.policyId !== undefined) safeId(entry.policyId, `governance.models[${index}].policyId`);
    if (entry.policySha256 !== undefined) sha(entry.policySha256, `governance.models[${index}].policySha256`);
  }
  const controls = governance.controls ?? [];
  if (!Array.isArray(controls) || controls.length > 256) {
    fail("governance.controls must contain at most 256 entries");
  }
  for (const [index, raw] of controls.entries()) {
    const entry = object(raw, `governance.controls[${index}]`);
    const id = safeId(entry.id, `governance.controls[${index}].id`);
    if (ids.has(id)) fail(`duplicate governance asset id ${id}`);
    ids.add(id);
    text(entry.inventoryName, `governance.controls[${index}].inventoryName`, 512);
    text(entry.inventoryFile, `governance.controls[${index}].inventoryFile`, 1024);
    text(entry.version, `governance.controls[${index}].version`, 256);
    sha(entry.bundleSha256, `governance.controls[${index}].bundleSha256`);
    validateExpectedFiles(entry.expectedFiles, `governance.controls[${index}].expectedFiles`);
    const license = object(entry.license, `governance.controls[${index}].license`);
    if (license.commercialUse !== "allowed") {
      fail(`governance control ${id} is not commercially approved`);
    }
    if (license.derivatives === "prohibited") {
      fail(`governance control ${id} prohibits derivative use`);
    }
    if (!Array.isArray(entry.approvedRoles) || !entry.approvedRoles.length) {
      fail(`governance.controls[${index}].approvedRoles must be non-empty`);
    }
    if (!Array.isArray(entry.compatibleModelIds) || !entry.compatibleModelIds.length) {
      fail(`governance.controls[${index}].compatibleModelIds must be non-empty`);
    }
    entry.compatibleModelIds.forEach((modelId, modelIndex) =>
      safeId(modelId, `governance.controls[${index}].compatibleModelIds[${modelIndex}]`),
    );
    if (
      typeof entry.minimumVramGb !== "number" ||
      !Number.isFinite(entry.minimumVramGb) ||
      entry.minimumVramGb < 0 ||
      entry.minimumVramGb > 64
    ) {
      fail(`governance.controls[${index}].minimumVramGb must be in [0, 64]`);
    }
    if (!Number.isInteger(entry.priority) || entry.priority < -1000 || entry.priority > 1000) {
      fail(`governance.controls[${index}].priority must be an integer in [-1000, 1000]`);
    }
    text(entry.reviewedBy, `governance.controls[${index}].reviewedBy`, 256);
    if (!Number.isFinite(Date.parse(entry.reviewedAt))) {
      fail(`governance.controls[${index}].reviewedAt is invalid`);
    }
  }
  return governance;
}

function selectGovernedModels(inventory, governance, requestedId) {
  const pairs = [];
  for (const governanceEntry of governance.models) {
    if (requestedId && governanceEntry.id !== requestedId) continue;
    const inventoryEntry = inventory.models.find(
      (model) =>
        model.name === governanceEntry.inventoryName &&
        model.file === governanceEntry.inventoryFile &&
        model.version === governanceEntry.version &&
        model.bundleSha256 === governanceEntry.bundleSha256,
    );
    if (!inventoryEntry) continue;
    if (governanceEntry.license.commercialUse !== "allowed") {
      fail(`model ${governanceEntry.id} is not approved for commercial use`);
    }
    if (governanceEntry.license.derivatives === "prohibited") {
      fail(`model ${governanceEntry.id} prohibits derivative use`);
    }
    pairs.push({ governanceEntry, inventoryEntry });
  }
  if (!pairs.length) {
    fail(
      requestedId
        ? `governed model ${requestedId} does not exactly match current local inventory`
        : "no governed model exactly matches current local inventory",
    );
  }
  pairs.sort(
    (left, right) =>
      Number(right.governanceEntry.priority ?? 170) -
        Number(left.governanceEntry.priority ?? 170) ||
      left.governanceEntry.id.localeCompare(right.governanceEntry.id),
  );
  return pairs;
}

function selectPoseControl(inventory, governance, modelId) {
  const candidates = [];
  for (const governanceEntry of governance.controls ?? []) {
    if (!governanceEntry.approvedRoles.includes("pose-control")) continue;
    if (!governanceEntry.compatibleModelIds.includes(modelId)) continue;
    const inventoryEntry = inventory.controls.find(
      (control) =>
        control.name === governanceEntry.inventoryName &&
        control.file === governanceEntry.inventoryFile &&
        control.version === governanceEntry.version &&
        control.bundleSha256 === governanceEntry.bundleSha256,
    );
    if (!inventoryEntry) continue;
    candidates.push({ governanceEntry, inventoryEntry });
  }
  candidates.sort(
    (left, right) =>
      Number(right.governanceEntry.priority ?? 0) -
        Number(left.governanceEntry.priority ?? 0) ||
      left.governanceEntry.id.localeCompare(right.governanceEntry.id),
  );
  return candidates[0] ?? null;
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

function samplerInputs(model, configuredDefaults = undefined) {
  const defaults = generationDefaults(configuredDefaults);
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
    seed_mode: defaults.seedMode,
    width: 1024,
    height: 1024,
    steps: defaults.steps,
    num_frames: 14,
    cfg: defaults.cfg,
    cfg_zero_star: false,
    cfg_zero_star_init_steps: 0,
    speed_up: defaults.speedUp,
    guidance_embed: 4.5,
    sampler_name: defaults.samplerName,
    stochastic_sampling_gamma: 0.3,
    res_dpt_shift: defaults.resolutionDependentShift,
    shift: defaults.shift,
    batch_size: 1,
    fps: 5,
    motion_scale: 127,
    guiding_frame_noise: 0.02,
    start_frame_guidance: 1,
    causal_inference: 0,
    causal_inference_pad: 0,
    clip_skip: defaults.clipSkip,
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
    tea_cache: defaults.teaCache,
    tea_cache_start: defaults.teaCacheStart,
    tea_cache_end: defaults.teaCacheEnd,
    tea_cache_threshold: defaults.teaCacheThreshold,
    tea_cache_max_skip_steps: defaults.teaCacheMaxSkipSteps,
    separate_clip_l: false,
    clip_l_text: "",
    separate_open_clip_g: false,
    open_clip_g_text: "",
    color_calibration: "Disabled",
    positive: ["1", 0],
    negative: ["2", 0],
  };
}

function drawThingsProfile(pair, install, bridgeRuntimeSha256, grpcRuntimeSha256) {
  const { governanceEntry, inventoryEntry } = pair;
  const profileId = safeId(
    `dt-${governanceEntry.id}-generate`,
    "generated Draw Things profileId",
  );
  const assetKinds = assetKindsForUses(governanceEntry.approvedUses);
  const continuityPhases = governanceEntry.approvedUses.includes("sprite")
    ? ["direction-master", "identity-master", "independent"]
    : ["independent"];
  const defaults = generationDefaults(governanceEntry.generationDefaults);
  return {
    profileId,
    label: `Draw Things local · ${inventoryEntry.name}`,
    description:
      `Pinned local-only Draw Things text generation through the reviewed EVAVO ComfyUI gRPC bridge. Resource class ${governanceEntry.resourceClass ?? "baseline"}. This base profile deliberately does not claim identity/reference/in-between capabilities.`,
    version: `1.0.0-${inventoryEntry.bundleSha256.slice(0, 12)}`,
    priority: Number(governanceEntry.priority ?? 170),
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
        inputs: samplerInputs(inventoryEntry, defaults),
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
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function drawThingsModifier(pair) {
  const raw = pair?.inventoryEntry?.model?.modifier;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function supportsKontextReferences(pair) {
  return new Set(["kontext", "kontext_kv"]).has(drawThingsModifier(pair));
}

function profileSuffixId(base, suffix) {
  return safeId(
    `${base.profileId}-${suffix}`,
    `generated Draw Things ${suffix} profileId`,
  );
}

function addCanonicalIdentityReference(base, pair) {
  const profile = cloneJson(base);
  profile.profileId = profileSuffixId(base, "identity-ref");
  profile.label = `${base.label} · canonical identity reference`;
  profile.description =
    `${base.description} Adds one reviewed canonical image input. ` +
    (supportsKontextReferences(pair)
      ? "The Kontext model consumes the base image as a reference image; sampler strength remains fixed so EVAVO reference-strength semantics are not inverted."
      : "The fallback model uses fixed-strength img2img conditioning; this profile does not claim multi-reference temporal consistency.");
  profile.version = `${base.version}-identity-ref`;
  profile.priority = Number(base.priority) - 1;
  profile.continuityPhases = [
    "direction-master",
    "key-pose",
    "repair",
    "independent",
  ];
  profile.capabilities = [
    ...new Set([
      ...base.capabilities,
      "reference-images",
      "identity-reference",
    ]),
  ];
  profile.workflow["5"] = {
    class_type: "LoadImage",
    inputs: { image: "evavo-canonical-identity-placeholder.png" },
  };
  profile.workflow["3"].inputs.image = ["5", 0];
  profile.workflow["3"].inputs.strength = supportsKontextReferences(pair)
    ? 1
    : 0.55;
  profile.bindings.referenceImages = [
    {
      role: "canonical-identity",
      nodeId: "5",
      input: "image",
    },
  ];
  profile.limits.maximumReferenceImages = 1;
  return profile;
}

function drawThingsHintsNode(entries) {
  const inputs = {
    type: "(None selected)",
    weight: 1,
    type_2: "(None selected)",
    weight_2: 1,
    type_3: "(None selected)",
    weight_3: 1,
    type_4: "(None selected)",
    weight_4: 1,
  };
  entries.forEach((entry, index) => {
    const suffix = index === 0 ? "" : `_${index + 1}`;
    inputs[`type${suffix}`] = "Shuffle (Moodboard)";
    inputs[`weight${suffix}`] = entry.weight;
    inputs[`image${suffix}`] = [entry.nodeId, 0];
  });
  return {
    class_type: "DrawThingsHints",
    inputs,
  };
}

function addDirectionReferenceProfile(base, pair) {
  if (!supportsKontextReferences(pair)) return null;
  const profile = cloneJson(addCanonicalIdentityReference(base, pair));
  profile.profileId = profileSuffixId(base, "direction-ref");
  profile.label = `${base.label} · identity + direction references`;
  profile.description =
    `${base.description} Uses the canonical identity as the Kontext base reference and one direction master as a Draw Things shuffle reference. This exact graph advertises direction-reference capability but no temporal-reference capability.`;
  profile.version = `${base.version}-direction-ref`;
  profile.priority = Number(base.priority) - 2;
  profile.continuityPhases = ["key-pose", "repair", "independent"];
  profile.capabilities = [
    ...new Set([
      ...base.capabilities,
      "reference-images",
      "multiple-reference-images",
      "identity-reference",
      "direction-reference",
    ]),
  ];
  profile.workflow["6"] = {
    class_type: "LoadImage",
    inputs: { image: "evavo-direction-master-placeholder.png" },
  };
  profile.workflow["8"] = drawThingsHintsNode([
    { nodeId: "6", weight: 0.85 },
  ]);
  profile.workflow["3"].inputs.hints = ["8", 0];
  profile.bindings.referenceImages = [
    {
      role: "canonical-identity",
      nodeId: "5",
      input: "image",
    },
    {
      role: "direction-master",
      nodeId: "6",
      input: "image",
    },
  ];
  profile.limits.maximumReferenceImages = 2;
  return profile;
}

function addTemporalReferenceProfile(base, pair) {
  if (!supportsKontextReferences(pair)) return null;
  const profile = cloneJson(addCanonicalIdentityReference(base, pair));
  profile.profileId = profileSuffixId(base, "temporal-ref");
  profile.label = `${base.label} · identity + temporal key references`;
  profile.description =
    `${base.description} Uses the canonical identity as the Kontext base reference and previous/next key poses as Draw Things shuffle references. This graph is the reviewed local in-between/repair route.`;
  profile.version = `${base.version}-temporal-ref`;
  profile.priority = Number(base.priority) - 3;
  profile.continuityPhases = ["key-pose", "in-between", "repair"];
  profile.capabilities = [
    ...new Set([
      ...base.capabilities,
      "reference-images",
      "multiple-reference-images",
      "identity-reference",
      "temporal-reference",
    ]),
  ];
  profile.workflow["6"] = {
    class_type: "LoadImage",
    inputs: { image: "evavo-previous-key-pose-placeholder.png" },
  };
  profile.workflow["7"] = {
    class_type: "LoadImage",
    inputs: { image: "evavo-next-key-pose-placeholder.png" },
  };
  profile.workflow["8"] = drawThingsHintsNode([
    { nodeId: "6", weight: 0.8 },
    { nodeId: "7", weight: 0.8 },
  ]);
  profile.workflow["3"].inputs.hints = ["8", 0];
  profile.bindings.referenceImages = [
    {
      role: "canonical-identity",
      nodeId: "5",
      input: "image",
    },
    {
      role: "previous-key-pose",
      nodeId: "6",
      input: "image",
    },
    {
      role: "next-key-pose",
      nodeId: "7",
      input: "image",
    },
  ];
  profile.limits.maximumReferenceImages = 3;
  return profile;
}

function addEditProfile(base, pair) {
  const profile = cloneJson(base);
  profile.profileId = profileSuffixId(base, "edit");
  profile.label = `${base.label} · local image edit`;
  profile.description =
    `${base.description} Uses one exact base image for local repair/edit work. ` +
    (supportsKontextReferences(pair)
      ? "The Kontext model receives the source image at full reference strength."
      : "The fallback img2img route uses a conservative fixed denoise strength for selective repair.");
  profile.version = `${base.version}-edit`;
  profile.priority = Number(base.priority) - 4;
  profile.operations = ["edit"];
  profile.continuityPhases = ["key-pose", "repair", "independent"];
  profile.capabilities = [
    ...new Set([
      ...base.capabilities.filter((capability) => capability !== "generate"),
      "edit",
      "reference-images",
    ]),
  ];
  profile.workflow["5"] = {
    class_type: "LoadImage",
    inputs: { image: "evavo-base-image-placeholder.png" },
  };
  profile.workflow["3"].inputs.image = ["5", 0];
  profile.workflow["3"].inputs.strength = supportsKontextReferences(pair)
    ? 1
    : 0.35;
  profile.bindings.referenceImages = [
    {
      role: "base-image",
      nodeId: "5",
      input: "image",
    },
  ];
  profile.limits.maximumReferenceImages = 1;
  return profile;
}

function supportsNativeInpaint(pair) {
  return drawThingsModifier(pair) === "inpainting";
}

function addInpaintProfile(base, pair) {
  if (!supportsNativeInpaint(pair)) return null;
  const profile = cloneJson(base);
  profile.profileId = profileSuffixId(base, "inpaint");
  profile.label = `${base.label} · local masked inpaint`;
  profile.description =
    `${base.description} Uses a true Draw Things inpainting model with an exact base image and exact mask. This profile is emitted only when the local model inventory declares modifier=inpainting.`;
  profile.version = `${base.version}-inpaint`;
  profile.priority = Number(base.priority) - 5;
  profile.operations = ["inpaint"];
  profile.continuityPhases = ["repair", "independent"];
  profile.capabilities = [
    ...new Set([
      ...base.capabilities.filter((capability) => capability !== "generate"),
      "inpaint",
      "reference-images",
      "multiple-reference-images",
      "mask",
    ]),
  ];
  profile.workflow["5"] = {
    class_type: "LoadImage",
    inputs: { image: "evavo-inpaint-base-placeholder.png" },
  };
  profile.workflow["6"] = {
    class_type: "LoadImageMask",
    inputs: {
      image: "evavo-inpaint-mask-placeholder.png",
      channel: "red",
    },
  };
  profile.workflow["3"].inputs.image = ["5", 0];
  profile.workflow["3"].inputs.mask = ["6", 0];
  profile.workflow["3"].inputs.strength = 1;
  profile.bindings.referenceImages = [
    {
      role: "base-image",
      nodeId: "5",
      input: "image",
    },
    {
      role: "mask",
      nodeId: "6",
      input: "image",
    },
  ];
  profile.limits.maximumReferenceImages = 2;
  return profile;
}

function addPoseControlProfile(base, pair, controlPair) {
  if (!controlPair) return null;
  const profile = cloneJson(addCanonicalIdentityReference(base, pair));
  const { governanceEntry: controlGovernance, inventoryEntry: controlInventory } =
    controlPair;
  profile.profileId = profileSuffixId(base, "pose-ref");
  profile.label = `${base.label} · identity + structural pose control`;
  profile.description =
    `${base.description} Uses the canonical identity as the base image and the separately governed ${controlInventory.name} asset through DrawThingsControlNet with Pose mode. This structural profile advertises pose-control only because the exact control asset is installed and policy-approved.`;
  profile.version = `${base.version}-pose-ref`;
  profile.priority = Number(base.priority) - 2;
  profile.continuityPhases = ["key-pose", "repair", "independent"];
  profile.capabilities = [
    ...new Set([
      ...base.capabilities,
      "reference-images",
      "multiple-reference-images",
      "identity-reference",
      "pose-control",
    ]),
  ];
  profile.workflow["6"] = {
    class_type: "LoadImage",
    inputs: { image: "evavo-pose-control-placeholder.png" },
  };
  profile.workflow["7"] = {
    class_type: "DrawThingsControlNet",
    inputs: {
      control_name: {
        value: canonical(controlInventory.model),
        content: `${controlInventory.name} (${controlInventory.version})`,
      },
      control_input_type: "Pose",
      control_mode: "Balanced",
      control_weight: 1,
      control_start: 0,
      control_end: 1,
      global_average_pooling:
        controlInventory.model?.global_average_pooling === true,
      down_sampling_rate: 1,
      target_blocks: "All",
      invert_image: false,
      image: ["6", 0],
    },
  };
  profile.workflow["3"].inputs.control_net = ["7", 0];
  profile.bindings.referenceImages = [
    {
      role: "canonical-identity",
      nodeId: "5",
      input: "image",
    },
    {
      role: "pose-control",
      nodeId: "6",
      input: "image",
    },
  ];
  profile.modelInventory.push({
    id: controlGovernance.id,
    kind: "draw-things-control-bundle",
    sha256: controlInventory.bundleSha256,
  });
  profile.limits.maximumReferenceImages = 2;
  return profile;
}

function drawThingsProfilesForPair(
  pair,
  install,
  bridgeRuntimeSha256,
  grpcRuntimeSha256,
  poseControl,
) {
  const base = drawThingsProfile(
    pair,
    install,
    bridgeRuntimeSha256,
    grpcRuntimeSha256,
  );
  const profiles = [
    base,
    addCanonicalIdentityReference(base, pair),
    addEditProfile(base, pair),
  ];
  const direction = addDirectionReferenceProfile(base, pair);
  const temporal = addTemporalReferenceProfile(base, pair);
  const inpaint = addInpaintProfile(base, pair);
  const pose = addPoseControlProfile(base, pair, poseControl);
  if (direction) profiles.push(direction);
  if (temporal) profiles.push(temporal);
  if (pose) profiles.push(pose);
  if (inpaint) profiles.push(inpaint);
  return profiles;
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
  if (!inventory.installManifestSha256) fail("inventory is missing install manifest identity");
  const selected = selectGovernedModels(inventory, governance, modelId);
  const bridgeRuntimeSha256 = hashJson({
    bridgeCommit: install.bridgeCommit,
    bridgeVersion: install.bridgeVersion,
    bridgeRequirementsSha256: install.bridgeRequirementsSha256,
  });
  const grpcRuntimeSha256 = install.dockerImageId.slice("sha256:".length);
  sha(grpcRuntimeSha256, "Draw Things local Docker image id");
  const poseControlByModelId = new Map(
    selected.map((pair) => [
      pair.governanceEntry.id,
      selectPoseControl(inventory, governance, pair.governanceEntry.id),
    ]),
  );
  const profiles = selected.flatMap((pair) =>
    drawThingsProfilesForPair(
      pair,
      install,
      bridgeRuntimeSha256,
      grpcRuntimeSha256,
      poseControlByModelId.get(pair.governanceEntry.id) ?? null,
    ),
  );
  const versionFingerprint = hashJson(
    selected.map(({ governanceEntry, inventoryEntry }) => ({
      id: governanceEntry.id,
      bundleSha256: inventoryEntry.bundleSha256,
      priority: Number(governanceEntry.priority ?? 170),
      generationDefaults: generationDefaults(governanceEntry.generationDefaults),
    })),
  );
  const draft = {
    schemaVersion: CATALOG_DRAFT_SCHEMA,
    catalogId: "evavo-local-draw-things",
    catalogVersion: `1.0.0-${versionFingerprint.slice(0, 12)}`,
    profiles,
  };
  const modelEvidence = selected.map(({ governanceEntry, inventoryEntry }) => ({
    modelId: governanceEntry.id,
    inventoryId: inventoryEntry.id,
    inventoryName: inventoryEntry.name,
    inventoryFile: inventoryEntry.file,
    modelVersion: inventoryEntry.version,
    bundleSha256: inventoryEntry.bundleSha256,
    source: canonical(governanceEntry.source),
    license: canonical(governanceEntry.license),
    approvedUses: [...governanceEntry.approvedUses].sort(),
    generationDefaults: generationDefaults(governanceEntry.generationDefaults),
    priority: Number(governanceEntry.priority ?? 170),
    resourceClass: governanceEntry.resourceClass ?? "baseline",
    reviewedBy: governanceEntry.reviewedBy,
    reviewedAt: governanceEntry.reviewedAt,
  }));
  const controlEvidence = (governance.controls ?? [])
    .map((governanceEntry) => {
      const inventoryEntry = inventory.controls.find(
        (control) =>
          control.name === governanceEntry.inventoryName &&
          control.file === governanceEntry.inventoryFile &&
          control.version === governanceEntry.version &&
          control.bundleSha256 === governanceEntry.bundleSha256,
      );
      if (!inventoryEntry) return null;
      return {
        controlId: governanceEntry.id,
        inventoryId: inventoryEntry.id,
        inventoryName: inventoryEntry.name,
        inventoryFile: inventoryEntry.file,
        controlVersion: inventoryEntry.version,
        bundleSha256: inventoryEntry.bundleSha256,
        approvedRoles: [...governanceEntry.approvedRoles].sort(),
        compatibleModelIds: [...governanceEntry.compatibleModelIds].sort(),
        minimumVramGb: governanceEntry.minimumVramGb,
        priority: governanceEntry.priority,
        source: canonical(governanceEntry.source),
        license: canonical(governanceEntry.license),
        reviewedBy: governanceEntry.reviewedBy,
        reviewedAt: governanceEntry.reviewedAt,
      };
    })
    .filter(Boolean);
  const baseMinimumVram = (modelId) => {
    const model = modelEvidence.find((entry) => entry.modelId === modelId);
    if (!model) return 0;
    return model.resourceClass === "heavy"
      ? 10
      : model.resourceClass === "quality"
        ? 8
        : 0;
  };
  const profileEvidence = profiles.map((profile) => {
    const poseControl = poseControlByModelId.get(profile.modelId) ?? null;
    const usesPoseControl =
      profile.capabilities.includes("pose-control") && poseControl !== null;
    return {
      profileId: profile.profileId,
      modelId: profile.modelId,
      minimumVramGb: usesPoseControl
        ? Math.max(
            baseMinimumVram(profile.modelId),
            Number(poseControl.governanceEntry.minimumVramGb),
          )
        : baseMinimumVram(profile.modelId),
      controlIds: usesPoseControl
        ? [poseControl.governanceEntry.id]
        : [],
    };
  });
  return {
    draft,
    governanceEvidence: {
      schema: "evavo.draw-things-catalog-governance-evidence.v1",
      generatedAt: new Date().toISOString(),
      policyId: governance.policyId ?? null,
      policySha256: governance.policySha256 ?? null,
      models: modelEvidence,
      controls: controlEvidence,
      profiles: profileEvidence,
      ...(modelEvidence.length === 1 ? modelEvidence[0] : {}),
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
  if (!argv.length) {
    fail("usage: draw-things-local-models <inventory|govern|compile> [--name value ...]");
  }
  const command = argv[0];
  if (!new Set(["inventory", "govern", "compile"]).has(command)) {
    fail(`unsupported command ${command}`);
  }
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
    "--governance-output",
    "--policy",
    "--model",
    "--draft-output",
    "--evidence-output",
  ]);
  for (const key of args.keys()) {
    if (!allowed.has(key)) fail(`unsupported argument ${key}`);
  }
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

async function deriveGovernance(inventory, policyPath) {
  const policyDocument = await jsonFileWithSha(
    policyPath ?? defaultPolicyPath(),
    "Draw Things approved model policy",
  );
  const governance = governanceFromPolicy(
    inventory,
    policyDocument.value,
    policyDocument.sha256,
  );
  return {
    governance,
    policyPath: policyDocument.path,
    policySha256: policyDocument.sha256,
  };
}

async function runGovern(args) {
  const inventoryPath = args.get("--inventory") ?? defaultInventoryPath();
  const output = args.get("--output") ?? defaultGovernancePath();
  const inventory = validateInventory(
    await jsonFile(inventoryPath, "Draw Things inventory"),
  );
  const derived = await deriveGovernance(inventory, args.get("--policy"));
  await atomicJson(output, derived.governance);
  return {
    ok: true,
    command: "govern",
    inventory: path.resolve(inventoryPath),
    policy: derived.policyPath,
    policySha256: derived.policySha256,
    output: path.resolve(output),
    approvedModelCount: derived.governance.models.length,
    approvedModels: derived.governance.models.map((model) => ({
      id: model.id,
      bundleSha256: model.bundleSha256,
      priority: model.priority,
      resourceClass: model.resourceClass,
    })),
    authority: {
      modelDownload: false,
      modelPolicyMutation: false,
      generation: false,
      candidateApproval: false,
    },
  };
}

async function runCompile(args) {
  const installManifestPath =
    args.get("--install-manifest") ?? defaultInstallManifest();
  const inventoryPath = args.get("--inventory") ?? defaultInventoryPath();
  const governancePath = args.get("--governance");
  if (governancePath && args.get("--policy")) {
    fail("--governance and --policy are mutually exclusive");
  }
  const governanceOutput =
    args.get("--governance-output") ?? defaultGovernancePath();
  const draftOutput = args.get("--draft-output") ?? defaultCatalogDraft();
  const output = args.get("--output") ?? defaultCatalog();
  const evidenceOutput =
    args.get("--evidence-output") ?? defaultGovernanceEvidence();

  const rawInstallBytes = await readFile(path.resolve(installManifestPath));
  const installManifestSha256 = hashBytes(rawInstallBytes);
  let install;
  try {
    install = validateInstallManifest(
      JSON.parse(rawInstallBytes.toString("utf8")),
    );
  } catch (error) {
    fail(
      `install manifest is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const inventory = validateInventory(
    await jsonFile(inventoryPath, "Draw Things inventory"),
  );
  if (inventory.installManifestSha256 !== installManifestSha256) {
    fail(
      "Draw Things inventory was captured against a different install manifest; recapture inventory first",
    );
  }

  let governance;
  let governanceSource;
  let policySource = null;
  if (governancePath) {
    governance = validateGovernance(
      await jsonFile(governancePath, "Draw Things model governance"),
    );
    governanceSource = path.resolve(governancePath);
  } else {
    const derived = await deriveGovernance(inventory, args.get("--policy"));
    governance = validateGovernance(derived.governance);
    await atomicJson(governanceOutput, governance);
    governanceSource = path.resolve(governanceOutput);
    policySource = {
      path: derived.policyPath,
      sha256: derived.policySha256,
    };
  }

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
      catalog.profiles.map((profile) => [
        profile.profileId,
        profile.profileSha256,
      ]),
    ),
  };
  await atomicJson(draftOutput, built.draft);
  await atomicJson(output, catalog);
  await atomicJson(evidenceOutput, evidence);
  return {
    ok: true,
    command: "compile",
    inventory: path.resolve(inventoryPath),
    governance: governanceSource,
    policy: policySource,
    draftOutput: path.resolve(draftOutput),
    output: path.resolve(output),
    evidenceOutput: path.resolve(evidenceOutput),
    catalogId: catalog.catalogId,
    catalogSha256: catalog.catalogSha256,
    adapters: catalog.profiles.map(
      (profile) => `draw-things:${profile.profileId}`,
    ),
    authority: {
      modelDownload: false,
      modelPolicyMutation: false,
      generation: false,
      candidateApproval: false,
      publication: false,
    },
  };
}

async function main() {
  const { command, args } = parseArguments(process.argv.slice(2));
  const result =
    command === "inventory"
      ? await runInventory(args)
      : command === "govern"
        ? await runGovern(args)
        : await runCompile(args);
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
