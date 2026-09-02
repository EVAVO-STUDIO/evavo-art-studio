#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateLocalGenerationCampaign } from "./run-local-generation-campaign.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAXIMUM_RESPONSE_BYTES = 16 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--") || values.has(key)) {
      fail("arguments must be unique --name value pairs");
    }
    values.set(key, value);
  }
  for (const key of values.keys()) {
    if (!["--manifest", "--base-url", "--catalog"].includes(key)) fail(`unsupported argument ${key}`);
  }
  return values;
}

function required(values, key) {
  const value = values.get(key)?.trim();
  if (!value) fail(`${key} is required`);
  return value;
}

async function readJson(filePath, label) {
  const bytes = await readFile(path.resolve(filePath));
  if (!bytes.length || bytes.length > MAXIMUM_RESPONSE_BYTES) fail(`${label} exceeds bounded JSON size`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

function requiredCapabilities(scene) {
  const capabilities = new Set(["generate", "cancellation", "seed", "custom-size"]);
  if (scene.candidateCount > 1) capabilities.add("candidate-count");
  return [...capabilities].sort();
}

function routeScene(catalog, scene) {
  const required = requiredCapabilities(scene);
  const profiles = catalog.profiles
    .filter((profile) => {
      const adapterId = `comfyui:${profile.profileId}`;
      if (scene.adapterId && adapterId !== scene.adapterId) return false;
      return (
        profile.operations.includes("generate") &&
        profile.assetKinds.includes(scene.assetKind) &&
        profile.continuityPhases.includes(scene.continuityPhase) &&
        required.every((capability) => profile.capabilities.includes(capability)) &&
        profile.limits.maximumCandidates >= scene.candidateCount
      );
    })
    .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0));
  if (!profiles.length) {
    fail(
      `no reviewed local ComfyUI profile can execute scene ${scene.id} (${scene.assetKind}/${scene.continuityPhase}; ${required.join(",")})`,
    );
  }
  return profiles[0];
}

async function boundedJson(url) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) fail(`ComfyUI returned HTTP ${response.status} for ${new URL(url).pathname}`);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAXIMUM_RESPONSE_BYTES) {
    fail(`ComfyUI response exceeds ${MAXIMUM_RESPONSE_BYTES} bytes`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAXIMUM_RESPONSE_BYTES) fail(`ComfyUI response exceeds ${MAXIMUM_RESPONSE_BYTES} bytes`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`ComfyUI returned invalid JSON for ${new URL(url).pathname}`);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function choiceList(definition, inputName) {
  if (!isRecord(definition?.input)) return null;
  const descriptors = [definition.input.required, definition.input.optional]
    .filter(isRecord)
    .map((group) => group[inputName])
    .filter((entry) => entry !== undefined);
  for (const descriptor of descriptors) {
    if (!Array.isArray(descriptor) || !Array.isArray(descriptor[0])) continue;
    const choices = descriptor[0].filter((entry) => typeof entry === "string");
    if (choices.length) return choices;
  }
  return null;
}

function runtimeProfileEvidence(profile, objectInfo) {
  const classTypes = [...new Set(profile.nodeInventory.map((entry) => entry.classType))].sort();
  const missingClasses = classTypes.filter((classType) => !isRecord(objectInfo[classType]));
  const modelSelections = [];
  for (const [nodeId, node] of Object.entries(profile.workflow)) {
    const definition = objectInfo[node.class_type];
    if (!isRecord(definition)) continue;
    for (const [inputName, configured] of Object.entries(node.inputs)) {
      if (typeof configured !== "string") continue;
      const choices = choiceList(definition, inputName);
      if (!choices) continue;
      const available = choices.includes(configured);
      modelSelections.push({
        nodeId,
        classType: node.class_type,
        inputName,
        configured,
        available,
        choiceCount: choices.length,
      });
    }
  }
  const missingSelections = modelSelections.filter((entry) => !entry.available);
  return {
    profileId: profile.profileId,
    adapterId: `comfyui:${profile.profileId}`,
    modelId: profile.modelId,
    profileSha256: profile.profileSha256,
    workflowSha256: profile.workflowSha256,
    nodeInventorySha256: profile.nodeInventorySha256,
    modelInventorySha256: profile.modelInventorySha256,
    runtimeInventorySha256: profile.runtimeInventorySha256,
    requiredClassTypes: classTypes,
    missingClassTypes: missingClasses,
    modelSelections,
    missingModelSelections: missingSelections,
    ready: missingClasses.length === 0 && missingSelections.length === 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(required(args, "--manifest"));
  const manifest = await readJson(manifestPath, "local generation manifest");
  if (args.get("--base-url")) {
    manifest.provider = { ...(manifest.provider ?? {}), baseUrl: args.get("--base-url") };
  }
  if (args.get("--catalog")) {
    manifest.provider = { ...(manifest.provider ?? {}), catalogPath: args.get("--catalog") };
  }
  const campaign = validateLocalGenerationCampaign(manifest, process.env);

  const providerModulePath = path.join(ROOT, "packages", "providers", "dist", "index.js");
  const providers = await import(providerModulePath);
  if (typeof providers.loadComfyUIWorkflowCatalogFromFile !== "function") {
    fail("built Art Studio provider package does not export loadComfyUIWorkflowCatalogFromFile");
  }
  const catalog = providers.loadComfyUIWorkflowCatalogFromFile(
    campaign.provider.catalogPath,
    path.dirname(campaign.provider.catalogPath),
  );

  const systemStats = await boundedJson(`${campaign.provider.baseUrl}/system_stats`);
  const objectInfo = await boundedJson(`${campaign.provider.baseUrl}/object_info`);
  if (!isRecord(objectInfo)) fail("ComfyUI object_info response is not an object");

  const routeProfiles = campaign.scenes.map((scene) => ({ sceneId: scene.id, profile: routeScene(catalog, scene) }));
  const profileMap = new Map();
  for (const { profile } of routeProfiles) profileMap.set(profile.profileId, profile);
  const runtimeProfiles = [...profileMap.values()].map((profile) => runtimeProfileEvidence(profile, objectInfo));
  const notReady = runtimeProfiles.filter((profile) => !profile.ready);

  const receipt = {
    schemaVersion: 1,
    kind: "evavo-local-generation-doctor-v1",
    ok: notReady.length === 0,
    campaignId: campaign.campaignId,
    manifestPath,
    sceneCount: campaign.scenes.length,
    catalog: {
      path: campaign.provider.catalogPath,
      schemaVersion: catalog.schemaVersion,
      catalogId: catalog.catalogId,
      catalogVersion: catalog.catalogVersion,
      catalogSha256: catalog.catalogSha256,
      profileCount: catalog.profiles.length,
      validatedWithProviderPackage: true,
    },
    provider: {
      baseUrl: campaign.provider.baseUrl,
      localOnly: true,
      fallbackAllowed: false,
      systemStatsReachable: isRecord(systemStats),
      objectInfoReachable: true,
    },
    routes: routeProfiles.map(({ sceneId, profile }) => ({
      sceneId,
      adapterId: `comfyui:${profile.profileId}`,
      modelId: profile.modelId,
      profileSha256: profile.profileSha256,
    })),
    runtimeProfiles,
    allRequiredNodeClassesAvailable: runtimeProfiles.every((profile) => profile.missingClassTypes.length === 0),
    allConfiguredRuntimeChoicesAvailable: runtimeProfiles.every((profile) => profile.missingModelSelections.length === 0),
    physicalCheckpointHashVerifiedDirectly: false,
    physicalCheckpointHashNote:
      "The catalog's model inventory hashes are tamper-validated. ComfyUI runtime choice availability and subsequent real workflow execution prove loadability; the catalog format does not currently bind model identities to host filesystem paths for direct checkpoint hashing.",
    arbitraryWorkflowSubmission: false,
    hostedFallback: false,
  };

  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (!receipt.ok) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
