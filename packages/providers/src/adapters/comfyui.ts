import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import {
  normalizeJson,
  sha256,
  stableStringify,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  PROVIDER_CAPABILITIES,
  PROVIDER_PROTOCOL_VERSION,
  PROVIDER_REFERENCE_CAPABILITY_REQUIREMENTS,
  ProviderError,
  type NormalizedProviderCandidateRequest,
  type ProviderAdapter,
  type ProviderAdapterDescriptor,
  type ProviderAdapterExecutionContext,
  type ProviderAdapterExecutionResult,
  type ProviderAdapterOutput,
  type ProviderAssetKind,
  type ProviderCapability,
  type ProviderContinuityPhase,
  type ProviderOperation,
  type ProviderReferenceRole,
  type ResolvedProviderCandidateRequest,
  type ResolvedProviderReference,
} from "../types.js";

export const COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA =
  "evavo.comfyui-workflow-catalog-draft.v1" as const;
export const COMFYUI_WORKFLOW_CATALOG_SCHEMA =
  "evavo.comfyui-workflow-catalog.v1" as const;
export const COMFYUI_PROVIDER_EVIDENCE_SCHEMA =
  "evavo.comfyui-provider-evidence.v1" as const;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_NODE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const OPERATIONS = new Set<ProviderOperation>(["generate", "edit", "inpaint"]);
const ASSET_KINDS = new Set<ProviderAssetKind>([
  "sprite-frame",
  "sprite-layer",
  "environment",
  "effect",
  "ui",
  "illustration",
  "print",
]);
const CONTINUITY_PHASES = new Set<ProviderContinuityPhase>([
  "identity-master",
  "direction-master",
  "key-pose",
  "in-between",
  "repair",
  "independent",
]);
const REFERENCE_ROLES = new Set<ProviderReferenceRole>([
  "canonical-identity",
  "direction-master",
  "previous-key-pose",
  "next-key-pose",
  "base-image",
  "mask",
  "pose-control",
  "edge-control",
  "depth-control",
  "palette-reference",
  "line-reference",
  "material-reference",
  "layer-context",
]);
const CAPABILITIES = new Set<string>(PROVIDER_CAPABILITIES);
const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_MAXIMUM_JSON_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAXIMUM_OUTPUT_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAXIMUM_UPLOAD_BYTES = 64 * 1024 * 1024;
const DEFAULT_EXECUTION_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 500;

const CATALOG_KEYS = new Set([
  "schemaVersion",
  "catalogId",
  "catalogVersion",
  "profiles",
]);
const PROFILE_KEYS = new Set([
  "profileId",
  "label",
  "description",
  "version",
  "priority",
  "operations",
  "assetKinds",
  "continuityPhases",
  "capabilities",
  "modelId",
  "workflow",
  "bindings",
  "outputNodeIds",
  "modelInventory",
  "runtimeInventory",
  "limits",
]);
const NODE_KEYS = new Set(["class_type", "inputs", "_meta"]);
const INPUT_BINDING_KEYS = new Set(["nodeId", "input"]);
const REFERENCE_BINDING_KEYS = new Set(["role", "nodeId", "input", "strength"]);
const MODEL_INVENTORY_KEYS = new Set(["id", "kind", "sha256"]);
const RUNTIME_INVENTORY_KEYS = new Set(["id", "version", "sha256"]);
const BINDING_KEYS = new Set([
  "positivePrompt",
  "negativePrompt",
  "width",
  "height",
  "seed",
  "candidateCount",
  "filenamePrefix",
  "referenceImages",
]);
const LIMIT_KEYS = new Set([
  "maximumCandidates",
  "maximumReferenceImages",
  "maximumSourceBytes",
]);

interface ComfyUINode {
  readonly class_type: string;
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly _meta?: JsonValue;
}

type ComfyUIWorkflow = Readonly<Record<string, ComfyUINode>>;

export interface ComfyUIInputBinding {
  readonly nodeId: string;
  readonly input: string;
}

export interface ComfyUIReferenceBinding extends ComfyUIInputBinding {
  readonly role: ProviderReferenceRole;
  readonly strength?: ComfyUIInputBinding;
}

export interface ComfyUIWorkflowBindings {
  readonly positivePrompt: ComfyUIInputBinding;
  readonly negativePrompt?: ComfyUIInputBinding;
  readonly width?: ComfyUIInputBinding;
  readonly height?: ComfyUIInputBinding;
  readonly seed?: ComfyUIInputBinding;
  readonly candidateCount?: ComfyUIInputBinding;
  readonly filenamePrefix?: ComfyUIInputBinding;
  readonly referenceImages: readonly ComfyUIReferenceBinding[];
}

export interface ComfyUIModelInventoryEntry {
  readonly id: string;
  readonly kind: string;
  readonly sha256: string;
}

export interface ComfyUIRuntimeInventoryEntry {
  readonly id: string;
  readonly version: string;
  readonly sha256: string;
}

export interface ComfyUIWorkflowProfile {
  readonly profileId: string;
  readonly label: string;
  readonly description: string;
  readonly version: string;
  readonly priority: number;
  readonly operations: readonly ProviderOperation[];
  readonly assetKinds: readonly ProviderAssetKind[];
  readonly continuityPhases: readonly ProviderContinuityPhase[];
  readonly capabilities: readonly ProviderCapability[];
  readonly modelId: string;
  readonly workflow: ComfyUIWorkflow;
  readonly bindings: ComfyUIWorkflowBindings;
  readonly outputNodeIds: readonly string[];
  readonly modelInventory: readonly ComfyUIModelInventoryEntry[];
  readonly runtimeInventory: readonly ComfyUIRuntimeInventoryEntry[];
  readonly limits: Readonly<{
    maximumCandidates: number;
    maximumReferenceImages: number;
    maximumSourceBytes: number;
  }>;
  readonly workflowSha256: string;
  readonly nodeInventory: readonly Readonly<{
    nodeId: string;
    classType: string;
  }>[];
  readonly nodeInventorySha256: string;
  readonly modelInventorySha256: string;
  readonly runtimeInventorySha256: string;
  readonly profileSha256: string;
}

export interface ComfyUIWorkflowCatalog {
  readonly schemaVersion: typeof COMFYUI_WORKFLOW_CATALOG_SCHEMA;
  readonly catalogId: string;
  readonly catalogVersion: string;
  readonly profiles: readonly ComfyUIWorkflowProfile[];
  readonly catalogSha256: string;
}

export interface ComfyUIProviderOptions {
  readonly catalog: ComfyUIWorkflowCatalog;
  readonly baseUrl?: string;
  readonly apiToken?: string;
  readonly fetch?: typeof fetch;
  readonly allowRemote?: boolean;
  readonly dedicatedInstance: true;
  readonly pollIntervalMs?: number;
  readonly executionTimeoutMs?: number;
  readonly maximumJsonBytes?: number;
  readonly maximumOutputBytes?: number;
  readonly maximumUploadBytes?: number;
}

export interface LoadComfyUIProviderOptions
  extends Omit<ComfyUIProviderOptions, "catalog"> {
  readonly catalogPath: string;
  readonly allowedRoot?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(
  code: string,
  message: string,
  classification: "permanent" | "transient" | "incompatible" | "cancelled" =
    "permanent",
  details?: JsonValue,
): never {
  throw new ProviderError(
    code,
    message,
    classification,
    details === undefined ? {} : { details },
  );
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  name: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("COMFYUI_CATALOG_INVALID", `${name} contains unsupported field ${key}.`);
  }
}

function requiredString(
  value: unknown,
  name: string,
  maximum = 32_000,
): string {
  if (typeof value !== "string") {
    fail("COMFYUI_CATALOG_INVALID", `${name} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized !== value || normalized.length > maximum || normalized.includes("\0")) {
    fail(
      "COMFYUI_CATALOG_INVALID",
      `${name} must contain 1 to ${maximum} canonical safe characters.`,
    );
  }
  return normalized;
}

function safeId(value: unknown, name: string): string {
  const normalized = requiredString(value, name, 128);
  if (!SAFE_ID.test(normalized)) {
    fail(
      "COMFYUI_CATALOG_INVALID",
      `${name} must use letters, digits, dots, underscores, colons or hyphens.`,
    );
  }
  return normalized;
}

function safeNodeId(value: unknown, name: string): string {
  const normalized = requiredString(value, name, 128);
  if (!SAFE_NODE_ID.test(normalized)) {
    fail("COMFYUI_CATALOG_INVALID", `${name} is not a safe node id.`);
  }
  return normalized;
}

function shaValue(value: unknown, name: string): string {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    fail("COMFYUI_CATALOG_INVALID", `${name} must be a lowercase SHA-256 hex digest.`);
  }
  return value;
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== "number" ||
    !Number.isInteger(result) ||
    result < minimum ||
    result > maximum
  ) {
    fail(
      "COMFYUI_CATALOG_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function stringArray<T extends string>(
  value: unknown,
  name: string,
  allowed: ReadonlySet<T>,
  maximum = 128,
): readonly T[] {
  if (!Array.isArray(value) || !value.length || value.length > maximum) {
    fail("COMFYUI_CATALOG_INVALID", `${name} must contain 1 to ${maximum} entries.`);
  }
  const result = value.map((entry, index) => {
    if (typeof entry !== "string" || !allowed.has(entry as T)) {
      fail("COMFYUI_CATALOG_INVALID", `${name}[${index}] is unsupported.`);
    }
    return entry as T;
  });
  if (new Set(result).size !== result.length) {
    fail("COMFYUI_CATALOG_INVALID", `${name} contains duplicates.`);
  }
  return Object.freeze([...result].sort());
}

function capabilityArray(value: unknown, name: string): readonly ProviderCapability[] {
  return stringArray(
    value,
    name,
    CAPABILITIES as ReadonlySet<ProviderCapability>,
    PROVIDER_CAPABILITIES.length,
  );
}

function canonicalHash(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}

function freezeJson<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const entry of Object.values(value as Record<string, unknown>)) freezeJson(entry);
  return Object.freeze(value);
}

function workflow(value: unknown, name: string): ComfyUIWorkflow {
  if (!isRecord(value)) fail("COMFYUI_CATALOG_INVALID", `${name} must be an API-format workflow object.`);
  const nodeIds = Object.keys(value).sort();
  if (!nodeIds.length || nodeIds.length > 2_048) {
    fail("COMFYUI_CATALOG_INVALID", `${name} must contain 1 to 2048 nodes.`);
  }
  const result: Record<string, ComfyUINode> = {};
  for (const nodeId of nodeIds) {
    safeNodeId(nodeId, `${name} node id`);
    const raw = value[nodeId];
    if (!isRecord(raw) || !isRecord(raw.inputs)) {
      fail("COMFYUI_CATALOG_INVALID", `${name}.${nodeId} must contain class_type and inputs.`);
    }
    exactKeys(raw, NODE_KEYS, `${name}.${nodeId}`);
    const classType = safeId(raw.class_type, `${name}.${nodeId}.class_type`);
    const inputs = normalizeJson(raw.inputs, `${name}.${nodeId}.inputs`);
    if (!isRecord(inputs)) fail("COMFYUI_CATALOG_INVALID", `${name}.${nodeId}.inputs must be an object.`);
    const node: ComfyUINode = {
      class_type: classType,
      inputs: inputs as Readonly<Record<string, JsonValue>>,
      ...(raw._meta === undefined ? {} : { _meta: normalizeJson(raw._meta) }),
    };
    result[nodeId] = freezeJson(node);
  }
  return freezeJson(result);
}

function binding(
  value: unknown,
  name: string,
  nodes: ComfyUIWorkflow,
  exact = true,
): ComfyUIInputBinding {
  if (!isRecord(value)) fail("COMFYUI_CATALOG_INVALID", `${name} must be a binding object.`);
  if (exact) exactKeys(value, INPUT_BINDING_KEYS, name);
  const nodeId = safeNodeId(value.nodeId, `${name}.nodeId`);
  const input = safeId(value.input, `${name}.input`);
  const node = nodes[nodeId];
  if (!node) fail("COMFYUI_CATALOG_INVALID", `${name} references missing node ${nodeId}.`);
  if (!Object.hasOwn(node.inputs, input)) {
    fail("COMFYUI_CATALOG_INVALID", `${name} references missing input ${nodeId}.${input}.`);
  }
  return Object.freeze({ nodeId, input });
}

function bindings(value: unknown, nodes: ComfyUIWorkflow): ComfyUIWorkflowBindings {
  if (!isRecord(value)) fail("COMFYUI_CATALOG_INVALID", "profile.bindings must be an object.");
  exactKeys(value, BINDING_KEYS, "profile.bindings");
  const positivePrompt = binding(value.positivePrompt, "profile.bindings.positivePrompt", nodes);
  const optional = (key: string): ComfyUIInputBinding | undefined =>
    value[key] === undefined
      ? undefined
      : binding(value[key], `profile.bindings.${key}`, nodes);
  const referenceInput = value.referenceImages ?? [];
  if (!Array.isArray(referenceInput) || referenceInput.length > 16) {
    fail("COMFYUI_CATALOG_INVALID", "profile.bindings.referenceImages must contain at most 16 entries.");
  }
  const referenceImages = referenceInput.map((entry, index) => {
    if (!isRecord(entry)) fail("COMFYUI_CATALOG_INVALID", `referenceImages[${index}] must be an object.`);
    exactKeys(entry, REFERENCE_BINDING_KEYS, `profile.bindings.referenceImages[${index}]`);
    if (typeof entry.role !== "string" || !REFERENCE_ROLES.has(entry.role as ProviderReferenceRole)) {
      fail("COMFYUI_CATALOG_INVALID", `referenceImages[${index}].role is unsupported.`);
    }
    const image = binding(entry, `profile.bindings.referenceImages[${index}]`, nodes, false);
    return Object.freeze({
      role: entry.role as ProviderReferenceRole,
      ...image,
      ...(entry.strength === undefined
        ? {}
        : { strength: binding(entry.strength, `profile.bindings.referenceImages[${index}].strength`, nodes) }),
    });
  });
  if (new Set(referenceImages.map((entry) => entry.role)).size !== referenceImages.length) {
    fail("COMFYUI_CATALOG_INVALID", "profile.bindings.referenceImages contains duplicate roles.");
  }
  const negativePrompt = optional("negativePrompt");
  const width = optional("width");
  const height = optional("height");
  const seed = optional("seed");
  const candidateCount = optional("candidateCount");
  const filenamePrefix = optional("filenamePrefix");
  const result: ComfyUIWorkflowBindings = {
    positivePrompt,
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(seed ? { seed } : {}),
    ...(candidateCount ? { candidateCount } : {}),
    ...(filenamePrefix ? { filenamePrefix } : {}),
    referenceImages: Object.freeze(referenceImages),
  };
  const targets: string[] = [];
  const add = (entry: ComfyUIInputBinding | undefined, label: string): void => {
    if (!entry) return;
    const key = `${entry.nodeId}\0${entry.input}`;
    if (targets.includes(key)) {
      fail("COMFYUI_CATALOG_INVALID", `ComfyUI workflow bindings reuse mutable input ${entry.nodeId}.${entry.input} at ${label}.`);
    }
    targets.push(key);
  };
  add(result.positivePrompt, "positivePrompt");
  add(result.negativePrompt, "negativePrompt");
  add(result.width, "width");
  add(result.height, "height");
  add(result.seed, "seed");
  add(result.candidateCount, "candidateCount");
  add(result.filenamePrefix, "filenamePrefix");
  for (const entry of result.referenceImages) {
    add(entry, `referenceImages.${entry.role}`);
    add(entry.strength, `referenceImages.${entry.role}.strength`);
  }
  return freezeJson(result);
}

function modelInventory(value: unknown): readonly ComfyUIModelInventoryEntry[] {
  if (!Array.isArray(value) || !value.length || value.length > 128) {
    fail("COMFYUI_CATALOG_INVALID", "modelInventory must contain 1 to 128 entries.");
  }
  const result = value.map((entry, index) => {
    if (!isRecord(entry)) fail("COMFYUI_CATALOG_INVALID", `modelInventory[${index}] must be an object.`);
    exactKeys(entry, MODEL_INVENTORY_KEYS, `modelInventory[${index}]`);
    return Object.freeze({
      id: safeId(entry.id, `modelInventory[${index}].id`),
      kind: safeId(entry.kind, `modelInventory[${index}].kind`),
      sha256: shaValue(entry.sha256, `modelInventory[${index}].sha256`),
    });
  }).sort((left, right) => left.id.localeCompare(right.id) || left.kind.localeCompare(right.kind));
  if (new Set(result.map((entry) => `${entry.kind}\0${entry.id}`)).size !== result.length) {
    fail("COMFYUI_CATALOG_INVALID", "modelInventory contains duplicate identities.");
  }
  return Object.freeze(result);
}

function runtimeInventory(value: unknown): readonly ComfyUIRuntimeInventoryEntry[] {
  if (!Array.isArray(value) || !value.length || value.length > 256) {
    fail("COMFYUI_CATALOG_INVALID", "runtimeInventory must contain 1 to 256 entries.");
  }
  const result = value.map((entry, index) => {
    if (!isRecord(entry)) fail("COMFYUI_CATALOG_INVALID", `runtimeInventory[${index}] must be an object.`);
    exactKeys(entry, RUNTIME_INVENTORY_KEYS, `runtimeInventory[${index}]`);
    return Object.freeze({
      id: safeId(entry.id, `runtimeInventory[${index}].id`),
      version: safeId(entry.version, `runtimeInventory[${index}].version`),
      sha256: shaValue(entry.sha256, `runtimeInventory[${index}].sha256`),
    });
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(result.map((entry) => entry.id)).size !== result.length) {
    fail("COMFYUI_CATALOG_INVALID", "runtimeInventory contains duplicate identities.");
  }
  return Object.freeze(result);
}

function limits(value: unknown): ComfyUIWorkflowProfile["limits"] {
  if (value !== undefined && !isRecord(value)) {
    fail("COMFYUI_CATALOG_INVALID", "profile.limits must be an object.");
  }
  const input = (value ?? {}) as Record<string, unknown>;
  exactKeys(input, LIMIT_KEYS, "profile.limits");
  return Object.freeze({
    maximumCandidates: integer(input.maximumCandidates, 8, 1, 64, "limits.maximumCandidates"),
    maximumReferenceImages: integer(input.maximumReferenceImages, 16, 0, 128, "limits.maximumReferenceImages"),
    maximumSourceBytes: integer(input.maximumSourceBytes, 64 * 1024 * 1024, 1_024, 1024 * 1024 * 1024, "limits.maximumSourceBytes"),
  });
}

function profileDraft(value: unknown, index: number): Omit<ComfyUIWorkflowProfile,
  "workflowSha256" | "nodeInventory" | "nodeInventorySha256" | "modelInventorySha256" | "runtimeInventorySha256" | "profileSha256"> {
  if (!isRecord(value)) fail("COMFYUI_CATALOG_INVALID", `profiles[${index}] must be an object.`);
  exactKeys(value, PROFILE_KEYS, `profiles[${index}]`);
  const profileId = safeId(value.profileId, `profiles[${index}].profileId`);
  const flow = workflow(value.workflow, `profiles[${index}].workflow`);
  const profileBindings = bindings(value.bindings, flow);
  const operations = stringArray(value.operations, `profiles[${index}].operations`, OPERATIONS);
  const capabilities = capabilityArray(value.capabilities, `profiles[${index}].capabilities`);
  for (const operation of operations) {
    if (!capabilities.includes(operation)) {
      fail("COMFYUI_CATALOG_INVALID", `${profileId} must declare capability ${operation}.`);
    }
  }
  if (!capabilities.includes("cancellation")) {
    fail("COMFYUI_CATALOG_INVALID", `${profileId} must declare cancellation capability.`);
  }
  const refRoles = new Set(profileBindings.referenceImages.map((entry) => entry.role));
  if (operations.includes("edit") && ![...refRoles].some((role) => role !== "mask")) {
    fail("COMFYUI_CATALOG_INVALID", `${profileId} edit support requires at least one reference-image binding.`);
  }
  if (operations.includes("inpaint") && (!refRoles.has("base-image") || !refRoles.has("mask"))) {
    fail("COMFYUI_CATALOG_INVALID", `${profileId} inpaint support requires base-image and mask bindings.`);
  }
  if (refRoles.size && !capabilities.includes("reference-images")) {
    fail("COMFYUI_CATALOG_INVALID", `${profileId} reference bindings require reference-images capability.`);
  }
  if (refRoles.size > 1 && !capabilities.includes("multiple-reference-images")) {
    fail("COMFYUI_CATALOG_INVALID", `${profileId} multiple reference bindings require multiple-reference-images capability.`);
  }
  if ((profileBindings.width || profileBindings.height) && !capabilities.includes("custom-size")) {
    fail("COMFYUI_CATALOG_INVALID", `${profileId} size bindings require custom-size capability.`);
  }
  if (profileBindings.seed && !capabilities.includes("seed")) {
    fail("COMFYUI_CATALOG_INVALID", `${profileId} seed binding requires seed capability.`);
  }
  if (profileBindings.candidateCount && !capabilities.includes("candidate-count")) {
    fail("COMFYUI_CATALOG_INVALID", `${profileId} candidate-count binding requires candidate-count capability.`);
  }
  for (const role of refRoles) {
    const capability = PROVIDER_REFERENCE_CAPABILITY_REQUIREMENTS[role];
    if (capability && !capabilities.includes(capability)) {
      fail("COMFYUI_CATALOG_INVALID", `${profileId} role ${role} requires capability ${capability}.`);
    }
    if (role === "mask" && !capabilities.includes("mask")) {
      fail("COMFYUI_CATALOG_INVALID", `${profileId} mask binding requires mask capability.`);
    }
  }
  const outputNodeIds = stringArray(
    value.outputNodeIds,
    `profiles[${index}].outputNodeIds`,
    new Set(Object.keys(flow)),
    128,
  );
  const models = modelInventory(value.modelInventory);
  const modelId = safeId(value.modelId, `profiles[${index}].modelId`);
  if (!models.some((entry) => entry.id === modelId)) {
    fail("COMFYUI_CATALOG_INVALID", `${profileId} modelId must appear in modelInventory.`);
  }
  return freezeJson({
    profileId,
    label: requiredString(value.label, `profiles[${index}].label`, 256),
    description: requiredString(value.description, `profiles[${index}].description`, 4_096),
    version: safeId(value.version, `profiles[${index}].version`),
    priority: integer(value.priority, 0, -10_000, 10_000, `profiles[${index}].priority`),
    operations,
    assetKinds: stringArray(value.assetKinds, `profiles[${index}].assetKinds`, ASSET_KINDS),
    continuityPhases: stringArray(value.continuityPhases, `profiles[${index}].continuityPhases`, CONTINUITY_PHASES),
    capabilities,
    modelId,
    workflow: flow,
    bindings: profileBindings,
    outputNodeIds,
    modelInventory: models,
    runtimeInventory: runtimeInventory(value.runtimeInventory),
    limits: limits(value.limits),
  });
}

function profileWithHashes(
  base: ReturnType<typeof profileDraft>,
): ComfyUIWorkflowProfile {
  const nodeInventory = Object.freeze(
    Object.entries(base.workflow)
      .map(([nodeId, node]) => Object.freeze({ nodeId, classType: node.class_type }))
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
  );
  const hashedBase = {
    ...base,
    workflowSha256: canonicalHash(base.workflow),
    nodeInventory,
    nodeInventorySha256: canonicalHash(nodeInventory),
    modelInventorySha256: canonicalHash(base.modelInventory),
    runtimeInventorySha256: canonicalHash(base.runtimeInventory),
  };
  return freezeJson({ ...hashedBase, profileSha256: canonicalHash(hashedBase) });
}

export function compileComfyUIWorkflowCatalog(input: unknown): ComfyUIWorkflowCatalog {
  if (!isRecord(input)) fail("COMFYUI_CATALOG_INVALID", "ComfyUI catalog draft must be an object.");
  exactKeys(input, CATALOG_KEYS, "catalog");
  if (input.schemaVersion !== COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA) {
    fail("COMFYUI_CATALOG_INVALID", `schemaVersion must be ${COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA}.`);
  }
  if (!Array.isArray(input.profiles) || !input.profiles.length || input.profiles.length > 128) {
    fail("COMFYUI_CATALOG_INVALID", "profiles must contain 1 to 128 workflow profiles.");
  }
  const profiles = input.profiles.map(profileDraft).map(profileWithHashes)
    .sort((left, right) => left.profileId.localeCompare(right.profileId));
  if (new Set(profiles.map((entry) => entry.profileId)).size !== profiles.length) {
    fail("COMFYUI_CATALOG_INVALID", "profiles contains duplicate profile ids.");
  }
  const base = {
    schemaVersion: COMFYUI_WORKFLOW_CATALOG_SCHEMA,
    catalogId: safeId(input.catalogId, "catalog.catalogId"),
    catalogVersion: safeId(input.catalogVersion, "catalog.catalogVersion"),
    profiles: Object.freeze(profiles),
  };
  return freezeJson({ ...base, catalogSha256: canonicalHash(base) });
}

function draftFromCatalog(input: ComfyUIWorkflowCatalog): JsonValue {
  return normalizeJson({
    schemaVersion: COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA,
    catalogId: input.catalogId,
    catalogVersion: input.catalogVersion,
    profiles: input.profiles.map((profile) => ({
      profileId: profile.profileId,
      label: profile.label,
      description: profile.description,
      version: profile.version,
      priority: profile.priority,
      operations: profile.operations,
      assetKinds: profile.assetKinds,
      continuityPhases: profile.continuityPhases,
      capabilities: profile.capabilities,
      modelId: profile.modelId,
      workflow: profile.workflow,
      bindings: profile.bindings,
      outputNodeIds: profile.outputNodeIds,
      modelInventory: profile.modelInventory,
      runtimeInventory: profile.runtimeInventory,
      limits: profile.limits,
    })),
  });
}

export function validateComfyUIWorkflowCatalog(input: unknown): ComfyUIWorkflowCatalog {
  if (!isRecord(input) || input.schemaVersion !== COMFYUI_WORKFLOW_CATALOG_SCHEMA) {
    fail("COMFYUI_CATALOG_INVALID", `Compiled catalog must use ${COMFYUI_WORKFLOW_CATALOG_SCHEMA}.`);
  }
  let expected: ComfyUIWorkflowCatalog;
  try {
    expected = compileComfyUIWorkflowCatalog(
      draftFromCatalog(input as unknown as ComfyUIWorkflowCatalog),
    );
  } catch (error: unknown) {
    if (error instanceof ProviderError) throw error;
    fail("COMFYUI_CATALOG_INVALID", "Compiled ComfyUI workflow catalog structure is invalid.");
  }
  if (stableStringify(normalizeJson(input)) !== stableStringify(normalizeJson(expected))) {
    fail("COMFYUI_CATALOG_TAMPERED", "Compiled ComfyUI workflow catalog or one of its hashes was changed.");
  }
  return expected;
}

function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRealFileInsideRoot(filePath: string, allowedRoot: string): string {
  const rootAbsolute = path.resolve(allowedRoot);
  const targetAbsolute = path.resolve(filePath);
  if (!within(rootAbsolute, targetAbsolute)) {
    fail("COMFYUI_CATALOG_PATH_FORBIDDEN", "ComfyUI catalog path is outside the allowed root.");
  }
  try {
    const rootStat = lstatSync(rootAbsolute);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      fail("COMFYUI_CATALOG_PATH_FORBIDDEN", "ComfyUI catalog root must be a real directory.");
    }
    let cursor = rootAbsolute;
    for (const segment of path.relative(rootAbsolute, targetAbsolute).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      if (lstatSync(cursor).isSymbolicLink()) {
        fail("COMFYUI_CATALOG_PATH_FORBIDDEN", "ComfyUI catalog path contains a symbolic-link component.");
      }
    }
    if (!lstatSync(targetAbsolute).isFile()) {
      fail("COMFYUI_CATALOG_PATH_FORBIDDEN", "ComfyUI catalog path must identify a regular file.");
    }
  } catch (error: unknown) {
    if (error instanceof ProviderError) throw error;
    fail("COMFYUI_CATALOG_PATH_FORBIDDEN", "ComfyUI catalog root or file is unavailable.");
  }
  let rootReal: string;
  let targetReal: string;
  try {
    rootReal = realpathSync(rootAbsolute);
    targetReal = realpathSync(targetAbsolute);
  } catch {
    fail("COMFYUI_CATALOG_PATH_FORBIDDEN", "ComfyUI catalog root or file cannot be resolved.");
  }
  if (!within(rootReal, targetReal)) {
    fail("COMFYUI_CATALOG_PATH_FORBIDDEN", "ComfyUI catalog resolves outside the allowed root.");
  }
  return targetReal;
}

export function loadComfyUIWorkflowCatalogFromFile(
  catalogPath: string,
  allowedRoot = path.dirname(path.resolve(catalogPath)),
): ComfyUIWorkflowCatalog {
  const exactPath = assertRealFileInsideRoot(catalogPath, allowedRoot);
  const bytes = readFileSync(exactPath);
  if (!bytes.byteLength || bytes.byteLength > DEFAULT_MAXIMUM_JSON_BYTES) {
    fail("COMFYUI_CATALOG_INVALID", "ComfyUI catalog file exceeds the bounded JSON limit.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("COMFYUI_CATALOG_INVALID", "ComfyUI catalog file is not valid JSON.");
  }
  return validateComfyUIWorkflowCatalog(parsed);
}

function safeBaseUrl(value: string | undefined, allowRemote: boolean): Readonly<{
  value: string;
  remote: boolean;
}> {
  let url: URL;
  try {
    url = new URL(value?.trim() || "http://127.0.0.1:8188");
  } catch {
    fail("COMFYUI_CONFIGURATION_INVALID", "ComfyUI base URL is invalid.");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    fail("COMFYUI_CONFIGURATION_INVALID", "ComfyUI base URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    fail("COMFYUI_CONFIGURATION_INVALID", "ComfyUI base URL may not contain credentials, query parameters or fragments.");
  }
  const remote = !LOOPBACK_HOSTS.has(url.hostname);
  if (remote && !allowRemote) {
    fail("COMFYUI_REMOTE_NOT_AUTHORIZED", "Remote ComfyUI endpoints require explicit allowRemote authority.");
  }
  if (remote && url.protocol !== "https:") {
    fail("COMFYUI_REMOTE_TLS_REQUIRED", "Remote ComfyUI endpoints must use HTTPS.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return Object.freeze({ value: url.toString().replace(/\/$/, ""), remote });
}

function safeApiToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  if (!token) return undefined;
  if (token.length > 4_096 || /[\r\n\0]/u.test(token)) {
    fail("COMFYUI_CONFIGURATION_INVALID", "ComfyUI API token is malformed.");
  }
  return token;
}

function boundedOption(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    fail("COMFYUI_CONFIGURATION_INVALID", `${name} must be between ${minimum} and ${maximum}.`);
  }
  return result;
}

function headers(apiToken: string | undefined, json = false): Headers {
  const result = new Headers({ Accept: json ? "application/json" : "*/*" });
  if (json) result.set("Content-Type", "application/json");
  if (apiToken) result.set("Authorization", `Bearer ${apiToken}`);
  return result;
}

async function boundedBody(response: Response, maximumBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBytes) {
    fail("COMFYUI_RESPONSE_TOO_LARGE", `ComfyUI response exceeds ${maximumBytes} bytes.`, "transient");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("bounded ComfyUI response exceeded");
      fail("COMFYUI_RESPONSE_TOO_LARGE", `ComfyUI response exceeds ${maximumBytes} bytes.`, "transient");
    }
    chunks.push(Buffer.from(next.value));
  }
  return Buffer.concat(chunks);
}

function responseClassification(status: number): "permanent" | "transient" | "incompatible" {
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return "transient";
  if (status === 404 || status === 422) return "incompatible";
  return "permanent";
}

function safeProviderMessage(bytes: Buffer): string {
  return bytes.toString("utf8").replace(/[\r\n\0]+/g, " ").slice(0, 1_000);
}

async function fetchBounded(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  maximumBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, redirect: "error", ...(signal ? { signal } : {}) });
  } catch (error: unknown) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      fail("PROVIDER_EXECUTION_CANCELLED", "ComfyUI provider execution was cancelled.", "cancelled");
    }
    fail(
      "COMFYUI_TRANSPORT_FAILED",
      error instanceof Error ? error.message : "ComfyUI transport failed.",
      "transient",
    );
  }
  const body = await boundedBody(response, maximumBytes);
  if (!response.ok) {
    fail(
      "COMFYUI_HTTP_ERROR",
      `ComfyUI returned HTTP ${response.status}${body.length ? `: ${safeProviderMessage(body)}` : ""}.`,
      responseClassification(response.status),
      { status: response.status },
    );
  }
  return body;
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  maximumBytes: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const body = await fetchBounded(fetchImpl, url, init, maximumBytes, signal);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    fail("COMFYUI_RESPONSE_INVALID", "ComfyUI returned invalid JSON.", "transient");
  }
}

function mutableWorkflow(source: ComfyUIWorkflow): Record<string, { class_type: string; inputs: Record<string, JsonValue>; _meta?: JsonValue }> {
  return JSON.parse(stableStringify(normalizeJson(source))) as Record<string, { class_type: string; inputs: Record<string, JsonValue>; _meta?: JsonValue }>;
}

function setInput(
  flow: ReturnType<typeof mutableWorkflow>,
  target: ComfyUIInputBinding | undefined,
  value: JsonValue,
): void {
  if (!target) return;
  const node = flow[target.nodeId];
  if (!node || !Object.hasOwn(node.inputs, target.input)) {
    fail("COMFYUI_WORKFLOW_BINDING_INVALID", `Compiled workflow lost binding ${target.nodeId}.${target.input}.`);
  }
  node.inputs[target.input] = value;
}

function mediaTypeFromBytes(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) return "image/webp";
  return undefined;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function extensionFor(mediaType: string): string {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}

function verifyReference(reference: ResolvedProviderReference, maximumBytes: number): void {
  if (!IMAGE_MEDIA_TYPES.has(reference.artifact.mediaType)) {
    fail("COMFYUI_REFERENCE_MEDIA_INVALID", `${reference.role} is not a supported raster image.`);
  }
  if (!reference.bytes.byteLength || reference.bytes.byteLength > maximumBytes) {
    fail("COMFYUI_REFERENCE_SIZE_INVALID", `${reference.role} exceeds the upload byte limit.`);
  }
  const actual = sha256(reference.bytes);
  if (
    reference.artifact.sizeBytes !== reference.bytes.byteLength ||
    reference.artifact.contentSha256 !== actual ||
    reference.artifact.contentHash !== `sha256:${actual}`
  ) {
    fail("COMFYUI_REFERENCE_IDENTITY_MISMATCH", `${reference.role} bytes no longer match the immutable artifact identity.`);
  }
  if (mediaTypeFromBytes(reference.bytes) !== reference.artifact.mediaType) {
    fail("COMFYUI_REFERENCE_MEDIA_INVALID", `${reference.role} bytes do not match the artifact media type.`);
  }
}

function safeRelativeSubfolder(value: unknown): string {
  if (value === "" || value === undefined) return "";
  if (typeof value !== "string" || value.includes("\0") || value.includes("\\") || value.startsWith("/") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    fail("COMFYUI_PATH_INVALID", "ComfyUI returned an unsafe subfolder path.");
  }
  return value;
}

function safeFileName(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 255 || value.includes("\0") || value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    fail("COMFYUI_PATH_INVALID", "ComfyUI returned an unsafe file name.");
  }
  return value;
}

function safePromptId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail("COMFYUI_RESPONSE_INVALID", "ComfyUI returned an invalid prompt id.", "transient");
  }
  return value;
}

function imagePath(name: string, subfolder: string): string {
  return subfolder ? `${subfolder}/${name}` : name;
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) fail("PROVIDER_EXECUTION_CANCELLED", "ComfyUI provider execution was cancelled.", "cancelled");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      reject(new ProviderError("PROVIDER_EXECUTION_CANCELLED", "ComfyUI provider execution was cancelled.", "cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    setTimeout(() => signal.removeEventListener("abort", abort), milliseconds + 1);
  });
}

function requiredClasses(profile: ComfyUIWorkflowProfile): readonly string[] {
  return Object.freeze([...new Set(profile.nodeInventory.map((entry) => entry.classType))].sort());
}

function nodeDefinitionEvidence(objectInfo: unknown, classes: readonly string[]): Readonly<{
  runtimeClassTypes: readonly string[];
  runtimeNodeDefinitionsSha256: string;
}> {
  if (!isRecord(objectInfo)) fail("COMFYUI_RUNTIME_INVENTORY_INVALID", "ComfyUI object_info response must be an object.", "incompatible");
  const subset: Record<string, JsonValue> = {};
  for (const classType of classes) {
    const definition = objectInfo[classType];
    if (definition === undefined) {
      fail("COMFYUI_RUNTIME_NODE_MISSING", `ComfyUI runtime does not provide required node class ${classType}.`, "incompatible");
    }
    subset[classType] = normalizeJson(definition);
  }
  return Object.freeze({
    runtimeClassTypes: Object.freeze([...classes]),
    runtimeNodeDefinitionsSha256: canonicalHash(subset),
  });
}

interface UploadedReferenceEvidence {
  readonly artifactId: string;
  readonly contentSha256: string;
  readonly role: ProviderReferenceRole;
  readonly strength: number;
  readonly inputPath: string;
}

interface OutputLocator {
  readonly filename: string;
  readonly subfolder: string;
  readonly type: "output";
  readonly nodeId: string;
}

function outputLocators(history: unknown, promptId: string, profile: ComfyUIWorkflowProfile): readonly OutputLocator[] | undefined {
  if (!isRecord(history)) fail("COMFYUI_HISTORY_INVALID", "ComfyUI history response must be an object.", "transient");
  const entry = history[promptId];
  if (entry === undefined) return undefined;
  if (!isRecord(entry)) fail("COMFYUI_HISTORY_INVALID", "ComfyUI history entry is invalid.", "transient");
  if (isRecord(entry.status) && entry.status.status_str === "error") {
    fail("COMFYUI_EXECUTION_FAILED", "ComfyUI reported workflow execution failure.", "permanent");
  }
  if (!isRecord(entry.outputs)) return undefined;
  const result: OutputLocator[] = [];
  for (const nodeId of profile.outputNodeIds) {
    const node = entry.outputs[nodeId];
    if (!isRecord(node) || !Array.isArray(node.images)) continue;
    for (const image of node.images) {
      if (!isRecord(image)) fail("COMFYUI_OUTPUT_INVALID", "ComfyUI output image entry is invalid.", "transient");
      const type = image.type;
      if (type !== "output") fail("COMFYUI_OUTPUT_INVALID", "ComfyUI output must use output storage type.", "permanent");
      result.push({
        filename: safeFileName(image.filename),
        subfolder: safeRelativeSubfolder(image.subfolder),
        type,
        nodeId,
      });
    }
  }
  const identities = result.map(
    (entry) => `${entry.type}\0${entry.subfolder}\0${entry.filename}`,
  );
  if (new Set(identities).size !== identities.length) {
    fail("COMFYUI_OUTPUT_INVALID", "ComfyUI returned duplicate output locations.", "permanent");
  }
  return Object.freeze(result);
}

class ComfyUIWorkflowProfileAdapter implements ProviderAdapter {
  public readonly descriptor: ProviderAdapterDescriptor;
  readonly #profile: ComfyUIWorkflowProfile;
  readonly #catalog: ComfyUIWorkflowCatalog;
  readonly #baseUrl: string;
  readonly #remote: boolean;
  readonly #apiToken: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #pollIntervalMs: number;
  readonly #executionTimeoutMs: number;
  readonly #maximumJsonBytes: number;
  readonly #maximumOutputBytes: number;
  readonly #maximumUploadBytes: number;

  public constructor(profile: ComfyUIWorkflowProfile, options: ComfyUIProviderOptions, base: ReturnType<typeof safeBaseUrl>) {
    this.#profile = profile;
    this.#catalog = options.catalog;
    this.#baseUrl = base.value;
    this.#remote = base.remote;
    this.#apiToken = safeApiToken(options.apiToken);
    this.#fetch = options.fetch ?? fetch;
    this.#pollIntervalMs = boundedOption(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS, 50, 60_000, "pollIntervalMs");
    this.#executionTimeoutMs = boundedOption(options.executionTimeoutMs, DEFAULT_EXECUTION_TIMEOUT_MS, 1_000, DEFAULT_EXECUTION_TIMEOUT_MS, "executionTimeoutMs");
    this.#maximumJsonBytes = boundedOption(options.maximumJsonBytes, DEFAULT_MAXIMUM_JSON_BYTES, 1_024, 64 * 1024 * 1024, "maximumJsonBytes");
    this.#maximumOutputBytes = boundedOption(options.maximumOutputBytes, DEFAULT_MAXIMUM_OUTPUT_BYTES, 1_024, 512 * 1024 * 1024, "maximumOutputBytes");
    this.#maximumUploadBytes = boundedOption(options.maximumUploadBytes, DEFAULT_MAXIMUM_UPLOAD_BYTES, 1_024, 512 * 1024 * 1024, "maximumUploadBytes");
    this.descriptor = Object.freeze({
      protocolVersion: PROVIDER_PROTOCOL_VERSION,
      id: `comfyui:${profile.profileId}`,
      label: `ComfyUI — ${profile.label}`,
      version: profile.version,
      priority: profile.priority,
      capabilities: profile.capabilities,
      models: Object.freeze([profile.modelId]),
      maximumCandidates: profile.limits.maximumCandidates,
      maximumReferenceImages: profile.limits.maximumReferenceImages,
      maximumSourceBytes: profile.limits.maximumSourceBytes,
      dataPolicy: Object.freeze({
        remote: base.remote,
        retainedByProvider: true,
        usedForTraining: false,
      }),
    });
  }

  async #interrupt(): Promise<void> {
    try {
      await fetchBounded(
        this.#fetch,
        `${this.#baseUrl}/interrupt`,
        { method: "POST", headers: headers(this.#apiToken, true), body: "{}" },
        this.#maximumJsonBytes,
      );
    } catch {
      // Best effort only; the original cancellation or timeout remains authoritative.
    }
  }

  async #upload(reference: ResolvedProviderReference, signal: AbortSignal): Promise<UploadedReferenceEvidence> {
    verifyReference(reference, Math.min(this.#maximumUploadBytes, this.#profile.limits.maximumSourceBytes));
    const extension = extensionFor(reference.artifact.mediaType);
    const name = `${reference.artifact.contentSha256}.${extension}`;
    const form = new FormData();
    form.set("image", new Blob([ownedArrayBuffer(reference.bytes)], { type: reference.artifact.mediaType }), name);
    form.set("overwrite", "false");
    form.set("type", "input");
    const parsed = await fetchJson(
      this.#fetch,
      `${this.#baseUrl}/upload/image`,
      { method: "POST", headers: headers(this.#apiToken), body: form },
      this.#maximumJsonBytes,
      signal,
    );
    if (!isRecord(parsed)) fail("COMFYUI_UPLOAD_INVALID", "ComfyUI upload response must be an object.", "transient");
    const returnedName = safeFileName(parsed.name);
    const subfolder = safeRelativeSubfolder(parsed.subfolder);
    if (parsed.type !== "input" || returnedName !== name || subfolder !== "") {
      fail("COMFYUI_UPLOAD_IDENTITY_MISMATCH", "ComfyUI changed the exact uploaded image identity.", "permanent");
    }
    const query = new URLSearchParams({
      filename: returnedName,
      subfolder,
      type: "input",
    });
    const storedBytes = await fetchBounded(
      this.#fetch,
      `${this.#baseUrl}/view?${query.toString()}`,
      { method: "GET", headers: headers(this.#apiToken) },
      Math.min(this.#maximumUploadBytes, this.#profile.limits.maximumSourceBytes),
      signal,
    );
    if (
      storedBytes.byteLength !== reference.bytes.byteLength ||
      sha256(storedBytes) !== reference.artifact.contentSha256
    ) {
      fail(
        "COMFYUI_UPLOAD_IDENTITY_MISMATCH",
        "ComfyUI stored bytes do not match the exact uploaded image identity.",
        "permanent",
      );
    }
    return Object.freeze({
      artifactId: reference.artifactId,
      contentSha256: reference.artifact.contentSha256,
      role: reference.role,
      strength: reference.strength,
      inputPath: imagePath(returnedName, subfolder),
    });
  }

  public async execute(
    resolved: ResolvedProviderCandidateRequest,
    context: ProviderAdapterExecutionContext,
  ): Promise<ProviderAdapterExecutionResult> {
    const request = resolved.request;
    if (!this.#profile.operations.includes(request.operation) || !this.#profile.assetKinds.includes(request.assetKind) || !this.#profile.continuityPhases.includes(request.continuityPhase)) {
      fail("COMFYUI_PROFILE_INCOMPATIBLE", `ComfyUI profile ${this.#profile.profileId} does not allow this request shape.`, "incompatible");
    }
    if (request.candidateCount > this.#profile.limits.maximumCandidates) {
      fail("COMFYUI_PROFILE_INCOMPATIBLE", "Candidate count exceeds the ComfyUI profile limit.", "incompatible");
    }
    if (resolved.references.length > this.#profile.limits.maximumReferenceImages) {
      fail("COMFYUI_PROFILE_INCOMPATIBLE", "Reference count exceeds the ComfyUI profile limit.", "incompatible");
    }
    if (!this.#profile.bindings.width && request.sourceCanvas !== undefined) {
      fail("COMFYUI_PROFILE_INCOMPATIBLE", "Profile cannot bind a custom source canvas.", "incompatible");
    }
    if (request.candidateCount !== 1 && !this.#profile.bindings.candidateCount) {
      fail("COMFYUI_PROFILE_INCOMPATIBLE", "Profile cannot bind candidate count.", "incompatible");
    }
    if ((request.seed !== undefined || request.selection.requireSeed) && !this.#profile.bindings.seed) {
      fail("COMFYUI_PROFILE_INCOMPATIBLE", "Profile cannot bind a deterministic seed.", "incompatible");
    }
    const bindingByRole = new Map(this.#profile.bindings.referenceImages.map((entry) => [entry.role, entry]));
    for (const reference of resolved.references) {
      if (!bindingByRole.has(reference.role)) {
        fail("COMFYUI_PROFILE_INCOMPATIBLE", `Profile cannot bind reference role ${reference.role}.`, "incompatible");
      }
    }

    const runtimeDefinitions = nodeDefinitionEvidence(
      await fetchJson(
        this.#fetch,
        `${this.#baseUrl}/object_info`,
        { method: "GET", headers: headers(this.#apiToken) },
        this.#maximumJsonBytes,
        context.signal,
      ),
      requiredClasses(this.#profile),
    );
    const flow = mutableWorkflow(this.#profile.workflow);
    setInput(flow, this.#profile.bindings.positivePrompt, resolved.compiledPrompt);
    setInput(flow, this.#profile.bindings.negativePrompt, request.negativeIntent ?? "");
    setInput(flow, this.#profile.bindings.width, request.sourceCanvas?.width ?? request.target.width);
    setInput(flow, this.#profile.bindings.height, request.sourceCanvas?.height ?? request.target.height);
    const effectiveSeed = request.seed ?? Number.parseInt(resolved.requestSha256.slice(0, 8), 16);
    setInput(flow, this.#profile.bindings.seed, effectiveSeed);
    setInput(flow, this.#profile.bindings.candidateCount, request.candidateCount);
    setInput(flow, this.#profile.bindings.filenamePrefix, `evavo/${request.requestId}`);

    const uploaded: UploadedReferenceEvidence[] = [];
    for (const reference of resolved.references) {
      const evidence = await this.#upload(reference, context.signal);
      uploaded.push(evidence);
      const target = bindingByRole.get(reference.role)!;
      setInput(flow, target, evidence.inputPath);
      setInput(flow, target.strength, reference.strength);
    }

    const effectiveWorkflow = normalizeJson(flow);
    const effectiveWorkflowSha256 = canonicalHash(effectiveWorkflow);
    const clientId = `evavo-${randomUUID()}`;
    const submission = normalizeJson({ prompt: effectiveWorkflow, client_id: clientId });
    const promptSubmissionSha256 = canonicalHash(submission);
    let promptId: string | undefined;
    const startedAt = Date.now();
    try {
      const submitted = await fetchJson(
        this.#fetch,
        `${this.#baseUrl}/prompt`,
        { method: "POST", headers: headers(this.#apiToken, true), body: stableStringify(submission) },
        this.#maximumJsonBytes,
        context.signal,
      );
      if (!isRecord(submitted)) fail("COMFYUI_RESPONSE_INVALID", "ComfyUI prompt response must be an object.", "transient");
      if (isRecord(submitted.node_errors) && Object.keys(submitted.node_errors).length) {
        fail("COMFYUI_WORKFLOW_REJECTED", "ComfyUI rejected one or more workflow nodes.", "incompatible");
      }
      promptId = safePromptId(submitted.prompt_id);
      let locators: readonly OutputLocator[] | undefined;
      while (!locators) {
        if (context.signal.aborted) fail("PROVIDER_EXECUTION_CANCELLED", "ComfyUI provider execution was cancelled.", "cancelled");
        if (Date.now() - startedAt > this.#executionTimeoutMs) {
          fail("COMFYUI_EXECUTION_TIMEOUT", "ComfyUI execution exceeded the configured timeout.", "transient");
        }
        const history = await fetchJson(
          this.#fetch,
          `${this.#baseUrl}/history/${encodeURIComponent(promptId)}`,
          { method: "GET", headers: headers(this.#apiToken) },
          this.#maximumJsonBytes,
          context.signal,
        );
        locators = outputLocators(history, promptId, this.#profile);
        if (!locators) await delay(this.#pollIntervalMs, context.signal);
      }
      if (locators.length !== request.candidateCount) {
        fail("COMFYUI_OUTPUT_COUNT_MISMATCH", `ComfyUI returned ${locators.length} outputs; ${request.candidateCount} were required.`, "transient");
      }
      const outputs: ProviderAdapterOutput[] = [];
      let aggregate = 0;
      for (const [index, locator] of locators.entries()) {
        const query = new URLSearchParams({ filename: locator.filename, subfolder: locator.subfolder, type: locator.type });
        const bytes = await fetchBounded(
          this.#fetch,
          `${this.#baseUrl}/view?${query.toString()}`,
          { method: "GET", headers: headers(this.#apiToken) },
          this.#maximumOutputBytes,
          context.signal,
        );
        aggregate += bytes.byteLength;
        if (aggregate > this.#maximumOutputBytes) {
          fail("COMFYUI_OUTPUT_SIZE_INVALID", "Aggregate ComfyUI output exceeds the configured byte limit.", "permanent");
        }
        const mediaType = mediaTypeFromBytes(bytes);
        if (!mediaType) fail("COMFYUI_OUTPUT_MEDIA_INVALID", `ComfyUI output ${index + 1} is not a supported image.`, "permanent");
        const expected = request.target.outputFormat === "jpeg" ? "image/jpeg" : request.target.outputFormat === "webp" ? "image/webp" : "image/png";
        if (mediaType !== expected) {
          fail("COMFYUI_OUTPUT_MEDIA_INVALID", `ComfyUI output ${index + 1} does not match requested ${expected}.`, "permanent");
        }
        outputs.push({
          bytes,
          mediaType,
          fileName: locator.filename,
          metadata: normalizeJson({
            schemaVersion: COMFYUI_PROVIDER_EVIDENCE_SCHEMA,
            promptId,
            nodeId: locator.nodeId,
            subfolder: locator.subfolder,
            outputIndex: index + 1,
            contentSha256: sha256(bytes),
          }),
        });
      }
      return {
        adapterId: this.descriptor.id,
        model: this.#profile.modelId,
        externalId: promptId,
        outputs,
        usage: normalizeJson({ candidates: outputs.length, outputBytes: aggregate }),
        metadata: normalizeJson({
          schemaVersion: COMFYUI_PROVIDER_EVIDENCE_SCHEMA,
          catalogId: this.#catalog.catalogId,
          catalogVersion: this.#catalog.catalogVersion,
          catalogSha256: this.#catalog.catalogSha256,
          profileId: this.#profile.profileId,
          profileVersion: this.#profile.version,
          profileSha256: this.#profile.profileSha256,
          workflowSha256: this.#profile.workflowSha256,
          effectiveWorkflowSha256,
          promptSubmissionSha256,
          nodeInventorySha256: this.#profile.nodeInventorySha256,
          modelInventorySha256: this.#profile.modelInventorySha256,
          runtimeInventorySha256: this.#profile.runtimeInventorySha256,
          runtimeNodeDefinitionsSha256: runtimeDefinitions.runtimeNodeDefinitionsSha256,
          runtimeClassTypes: runtimeDefinitions.runtimeClassTypes,
          modelInventory: this.#profile.modelInventory,
          runtimeInventory: this.#profile.runtimeInventory,
          requestSha256: resolved.requestSha256,
          compiledPromptSha256: resolved.compiledPromptSha256,
          referenceUploads: uploaded,
          dedicatedInstance: true,
          remoteEndpoint: this.#remote,
          rawWorkflowReturned: false,
          credentialsReturned: false,
          candidateApprovalPerformed: false,
          candidatePromotionPerformed: false,
          repositoryMutationPerformed: false,
          publicationPerformed: false,
        }),
      };
    } catch (error: unknown) {
      if (promptId && (context.signal.aborted || (error instanceof ProviderError && ["cancelled", "transient"].includes(error.classification)))) {
        await this.#interrupt();
      }
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        "COMFYUI_ADAPTER_UNEXPECTED_ERROR",
        error instanceof Error ? error.message : String(error),
        context.signal.aborted ? "cancelled" : "permanent",
      );
    }
  }
}

export function createComfyUIProviderAdapters(options: ComfyUIProviderOptions): readonly ProviderAdapter[] {
  if (options.dedicatedInstance !== true) {
    fail("COMFYUI_DEDICATED_INSTANCE_REQUIRED", "ComfyUI provider execution requires a dedicated instance because cancellation uses the instance-wide interrupt endpoint.");
  }
  const catalog = validateComfyUIWorkflowCatalog(options.catalog);
  const base = safeBaseUrl(options.baseUrl, options.allowRemote === true);
  return Object.freeze(catalog.profiles.map((profile) => new ComfyUIWorkflowProfileAdapter(profile, { ...options, catalog }, base)));
}

export function loadComfyUIProviderAdaptersFromCatalogFile(
  options: LoadComfyUIProviderOptions,
): readonly ProviderAdapter[] {
  const catalog = loadComfyUIWorkflowCatalogFromFile(options.catalogPath, options.allowedRoot);
  return createComfyUIProviderAdapters({ ...options, catalog });
}
