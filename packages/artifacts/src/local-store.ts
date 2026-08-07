import {
  mkdir,
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";

import { atomicWriteFile } from "./atomic.js";
import {
  artifactId as createArtifactId,
  contentHash as createContentHash,
  normalizeJson,
  sha256,
  stableStringify,
} from "./hash.js";
import { withFileLock } from "./lock.js";
import {
  contentObjectRelativePath,
  descriptorRelativePath,
  ensureArtifactRoot,
  referenceRelativePath,
  relativePortable,
  safeNamespace,
  safeSegment,
} from "./path.js";
import {
  ARTIFACT_PROTOCOL_VERSION,
  ArtifactStoreError,
  type ArtifactDescriptor,
  type ArtifactDescriptorInput,
  type ArtifactId,
  type ArtifactReference,
  type ArtifactStore,
  type ArtifactVerification,
  type ContentHash,
  type JsonValue,
  type LocalArtifactStoreOptions,
  type StoredArtifact,
  type UpdateArtifactReferenceOptions,
} from "./types.js";

const STORAGE_CLASSES = new Set([
  "source",
  "master",
  "intermediate",
  "preview",
  "evidence",
  "manifest",
  "runtime",
]);
const SHA256_HEX = /^[a-f0-9]{64}$/;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/;
const DESCRIPTOR_KEYS = new Set([
  "schemaVersion",
  "protocolVersion",
  "artifactId",
  "descriptorSha256",
  "contentHash",
  "contentSha256",
  "sizeBytes",
  "mediaType",
  "storageClass",
  "fileName",
  "sourceArtifacts",
  "labels",
  "metadata",
  "objectRelativePath",
  "descriptorRelativePath",
]);
const REFERENCE_KEYS = new Set([
  "schemaVersion",
  "namespace",
  "name",
  "generation",
  "artifactId",
  "contentHash",
  "previousArtifactId",
  "updatedAt",
  "actor",
]);

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidDescriptor(message: string): never {
  throw new ArtifactStoreError("ARTIFACT_DESCRIPTOR_INVALID", message);
}

function invalidReference(message: string): never {
  throw new ArtifactStoreError("ARTIFACT_REFERENCE_INVALID", message);
}

function freezeArtifactValue<T>(
  value: T,
  seen = new WeakSet<object>(),
): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const entry of Object.values(value as Record<string, unknown>)) {
    freezeArtifactValue(entry, seen);
  }
  return Object.freeze(value) as T;
}

function validateArtifactId(value: string): asserts value is ArtifactId {
  if (!ARTIFACT_ID.test(value)) {
    throw new ArtifactStoreError(
      "ARTIFACT_ID_INVALID",
      "Artifact ID must use artifact_<sha256> format.",
    );
  }
}

function validateContentHash(value: string): asserts value is ContentHash {
  if (!CONTENT_HASH.test(value)) {
    throw new ArtifactStoreError(
      "ARTIFACT_HASH_INVALID",
      "Content hash must use sha256:<hex> format.",
    );
  }
}

function normalizeMediaType(value: string): string {
  const mediaType = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mediaType)) {
    throw new ArtifactStoreError(
      "ARTIFACT_MEDIA_TYPE_INVALID",
      "Artifact mediaType must be a valid type/subtype value.",
    );
  }
  return mediaType;
}

function normalizeFileName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const fileName = value.trim();
  if (
    !fileName ||
    fileName.length > 255 ||
    fileName.includes("\0") ||
    path.basename(fileName) !== fileName ||
    fileName === "." ||
    fileName === ".."
  ) {
    throw new ArtifactStoreError(
      "ARTIFACT_FILE_NAME_INVALID",
      "Artifact fileName must be one safe display file name.",
    );
  }
  return fileName;
}

function normalizeLabels(
  value: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  const result = Object.create(null) as Record<string, string>;
  for (const key of Object.keys(value ?? {}).sort()) {
    const normalizedKey = safeSegment(key, `labels.${key}`);
    const normalizedValue = value![key]!.trim();
    if (!normalizedValue || normalizedValue.length > 512 || normalizedValue.includes("\0")) {
      throw new ArtifactStoreError(
        "ARTIFACT_LABEL_INVALID",
        `Artifact label ${normalizedKey} must contain 1 to 512 characters.`,
      );
    }
    Object.defineProperty(result, normalizedKey, {
      value: normalizedValue,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function normalizeSources(value: readonly ArtifactId[] | undefined): readonly ArtifactId[] {
  const result = [...new Set(value ?? [])].sort();
  result.forEach(validateArtifactId);
  return result;
}

function descriptorBody(
  contentHash: ContentHash,
  sizeBytes: number,
  input: ArtifactDescriptorInput,
): JsonValue {
  if (!STORAGE_CLASSES.has(input.storageClass)) {
    throw new ArtifactStoreError(
      "ARTIFACT_STORAGE_CLASS_INVALID",
      `Unsupported artifact storage class: ${input.storageClass}`,
    );
  }
  const body: Record<string, JsonValue> = {
    schemaVersion: "1.0",
    protocolVersion: ARTIFACT_PROTOCOL_VERSION,
    contentHash,
    contentSha256: contentHash.slice("sha256:".length),
    sizeBytes,
    mediaType: normalizeMediaType(input.mediaType),
    storageClass: input.storageClass,
    sourceArtifacts: normalizeSources(input.sourceArtifacts),
    labels: normalizeJson(normalizeLabels(input.labels)),
  };
  const fileName = normalizeFileName(input.fileName);
  if (fileName !== undefined) body.fileName = fileName;
  if (input.metadata !== undefined) body.metadata = normalizeJson(input.metadata);
  return body;
}

function storedArtifactId(value: unknown): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    invalidDescriptor("Artifact descriptor artifactId is invalid.");
  }
  return value as ArtifactId;
}

function storedContentHash(value: unknown): ContentHash {
  if (typeof value !== "string" || !CONTENT_HASH.test(value)) {
    invalidDescriptor("Artifact descriptor contentHash is invalid.");
  }
  return value as ContentHash;
}

function storedSources(value: unknown): readonly ArtifactId[] {
  if (!Array.isArray(value)) {
    invalidDescriptor("Artifact descriptor sourceArtifacts must be an array.");
  }
  const source = value as readonly unknown[];
  if (source.some((entry) => typeof entry !== "string" || !ARTIFACT_ID.test(entry))) {
    invalidDescriptor("Artifact descriptor sourceArtifacts contain an invalid artifact ID.");
  }
  const normalized = normalizeSources(source as readonly ArtifactId[]);
  if (
    normalized.length !== source.length ||
    normalized.some((entry, index) => entry !== source[index])
  ) {
    invalidDescriptor(
      "Artifact descriptor sourceArtifacts must be sorted and unique.",
    );
  }
  return normalized;
}

function storedLabels(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    invalidDescriptor("Artifact descriptor labels must be an object.");
  }
  if (Object.values(value).some((entry) => typeof entry !== "string")) {
    invalidDescriptor("Artifact descriptor labels must contain only strings.");
  }
  let normalized: Readonly<Record<string, string>>;
  try {
    normalized = normalizeLabels(value as Readonly<Record<string, string>>);
  } catch {
    invalidDescriptor("Artifact descriptor labels are invalid.");
  }
  if (
    stableStringify(normalizeJson(value)) !==
    stableStringify(normalizeJson(normalized))
  ) {
    invalidDescriptor("Artifact descriptor labels are not canonical.");
  }
  return normalized;
}

function storedMediaType(value: unknown): string {
  if (typeof value !== "string") {
    invalidDescriptor("Artifact descriptor mediaType is invalid.");
  }
  let normalized: string;
  try {
    normalized = normalizeMediaType(value);
  } catch {
    invalidDescriptor("Artifact descriptor mediaType is invalid.");
  }
  if (normalized !== value) {
    invalidDescriptor("Artifact descriptor mediaType is not canonical.");
  }
  return normalized;
}

function storedFileName(value: unknown): string {
  if (typeof value !== "string") {
    invalidDescriptor("Artifact descriptor fileName is invalid.");
  }
  let normalized: string | undefined;
  try {
    normalized = normalizeFileName(value);
  } catch {
    invalidDescriptor("Artifact descriptor fileName is invalid.");
  }
  if (normalized !== value) {
    invalidDescriptor("Artifact descriptor fileName is not canonical.");
  }
  return normalized;
}

function parseDescriptor(
  value: unknown,
  expectedId?: ArtifactId,
): StoredArtifact {
  if (!isRecord(value)) {
    invalidDescriptor("Artifact descriptor must be a JSON object.");
  }
  for (const key of Object.keys(value)) {
    if (!DESCRIPTOR_KEYS.has(key)) {
      invalidDescriptor(`Artifact descriptor contains unsupported field ${key}.`);
    }
  }
  if (
    value.schemaVersion !== "1.0" ||
    value.protocolVersion !== ARTIFACT_PROTOCOL_VERSION
  ) {
    invalidDescriptor("Artifact descriptor schema or protocol version is invalid.");
  }

  const artifactId = storedArtifactId(value.artifactId);
  const contentHash = storedContentHash(value.contentHash);
  if (
    typeof value.contentSha256 !== "string" ||
    !SHA256_HEX.test(value.contentSha256) ||
    value.contentSha256 !== contentHash.slice("sha256:".length)
  ) {
    invalidDescriptor("Artifact descriptor contentSha256 is inconsistent.");
  }
  if (
    typeof value.descriptorSha256 !== "string" ||
    !SHA256_HEX.test(value.descriptorSha256)
  ) {
    invalidDescriptor("Artifact descriptor descriptorSha256 is invalid.");
  }
  if (
    typeof value.sizeBytes !== "number" ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 0
  ) {
    invalidDescriptor("Artifact descriptor sizeBytes is invalid.");
  }
  const mediaType = storedMediaType(value.mediaType);
  if (
    typeof value.storageClass !== "string" ||
    !STORAGE_CLASSES.has(value.storageClass)
  ) {
    invalidDescriptor("Artifact descriptor storageClass is invalid.");
  }
  const sourceArtifacts = storedSources(value.sourceArtifacts);
  const labels = storedLabels(value.labels);
  const fileName = Object.hasOwn(value, "fileName")
    ? storedFileName(value.fileName)
    : undefined;

  let metadata: JsonValue | undefined;
  if (Object.hasOwn(value, "metadata")) {
    try {
      metadata = normalizeJson(value.metadata);
    } catch {
      invalidDescriptor("Artifact descriptor metadata is invalid.");
    }
  }

  const body: Record<string, JsonValue> = {
    schemaVersion: "1.0",
    protocolVersion: ARTIFACT_PROTOCOL_VERSION,
    contentHash,
    contentSha256: value.contentSha256,
    sizeBytes: value.sizeBytes,
    mediaType,
    storageClass: value.storageClass,
    sourceArtifacts,
    labels: normalizeJson(labels),
  };
  if (fileName !== undefined) body.fileName = fileName;
  if (metadata !== undefined) body.metadata = metadata;

  const canonicalBody = stableStringify(body);
  const expectedArtifactId = createArtifactId(body);
  const expectedDescriptorSha256 = sha256(canonicalBody);
  const expectedObjectRelativePath = relativePortable(
    contentObjectRelativePath(contentHash),
  );
  const expectedDescriptorRelativePath = relativePortable(
    descriptorRelativePath(expectedArtifactId),
  );

  if (artifactId !== expectedArtifactId) {
    invalidDescriptor("Artifact descriptor artifactId does not match its body.");
  }
  if (expectedId !== undefined && artifactId !== expectedId) {
    invalidDescriptor("Artifact descriptor identity does not match its file path.");
  }
  if (value.descriptorSha256 !== expectedDescriptorSha256) {
    invalidDescriptor("Artifact descriptor digest does not match its body.");
  }
  if (
    value.objectRelativePath !== expectedObjectRelativePath ||
    value.descriptorRelativePath !== expectedDescriptorRelativePath
  ) {
    invalidDescriptor("Artifact descriptor contains a non-canonical storage path.");
  }

  const descriptor: StoredArtifact = {
    ...(body as unknown as Omit<
      ArtifactDescriptor,
      "artifactId" | "descriptorSha256"
    >),
    artifactId,
    descriptorSha256: expectedDescriptorSha256,
    objectRelativePath: expectedObjectRelativePath,
    descriptorRelativePath: expectedDescriptorRelativePath,
  };
  return freezeArtifactValue(descriptor);
}

function parseDescriptorText(
  value: string,
  expectedId: ArtifactId,
): StoredArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    invalidDescriptor("Artifact descriptor is not valid JSON.");
  }
  return parseDescriptor(parsed, expectedId);
}

function referenceArtifactId(value: unknown, field: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    invalidReference(`Artifact reference ${field} is invalid.`);
  }
  return value as ArtifactId;
}

function referenceContentHash(value: unknown): ContentHash {
  if (typeof value !== "string" || !CONTENT_HASH.test(value)) {
    invalidReference("Artifact reference contentHash is invalid.");
  }
  return value as ContentHash;
}

function referenceNamespace(value: unknown): string {
  if (typeof value !== "string") {
    invalidReference("Artifact reference namespace is invalid.");
  }
  let normalized: string;
  try {
    normalized = safeNamespace(value).join("/");
  } catch {
    invalidReference("Artifact reference namespace is invalid.");
  }
  if (normalized !== value) {
    invalidReference("Artifact reference namespace is not canonical.");
  }
  return normalized;
}

function referenceName(value: unknown): string {
  if (typeof value !== "string") {
    invalidReference("Artifact reference name is invalid.");
  }
  let normalized: string;
  try {
    normalized = safeSegment(value, "name");
  } catch {
    invalidReference("Artifact reference name is invalid.");
  }
  if (normalized !== value) {
    invalidReference("Artifact reference name is not canonical.");
  }
  return normalized;
}

function referenceTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    invalidReference("Artifact reference updatedAt is invalid.");
  }
  const timestamp = new Date(value);
  if (
    !Number.isFinite(timestamp.getTime()) ||
    timestamp.toISOString() !== value
  ) {
    invalidReference("Artifact reference updatedAt is not canonical ISO-8601.");
  }
  return value;
}

function referenceActor(value: unknown): string {
  if (typeof value !== "string") {
    invalidReference("Artifact reference actor is invalid.");
  }
  const actor = value.trim();
  if (
    !actor ||
    actor !== value ||
    actor.length > 512 ||
    actor.includes("\0")
  ) {
    invalidReference("Artifact reference actor is not canonical.");
  }
  return actor;
}

function optionReferenceActor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    invalidReference("Artifact reference actor is invalid.");
  }
  const actor = value.trim();
  if (!actor) return undefined;
  if (actor.length > 512 || actor.includes("\0")) {
    invalidReference("Artifact reference actor is invalid.");
  }
  return actor;
}

function optionReferenceTimestamp(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalidReference("Artifact reference update time is invalid.");
  }
  return value.toISOString();
}

function serializeReference(reference: ArtifactReference): string {
  return `${JSON.stringify(reference, null, 2)}\n`;
}

function parseReference(
  value: unknown,
  expectedNamespace: string,
  expectedName: string,
): ArtifactReference {
  if (!isRecord(value)) {
    invalidReference("Artifact reference must be a JSON object.");
  }
  for (const key of Object.keys(value)) {
    if (!REFERENCE_KEYS.has(key)) {
      invalidReference(`Artifact reference contains unsupported field ${key}.`);
    }
  }
  if (value.schemaVersion !== "1.0") {
    invalidReference("Artifact reference schema version is invalid.");
  }

  const namespace = referenceNamespace(value.namespace);
  const name = referenceName(value.name);
  if (namespace !== expectedNamespace || name !== expectedName) {
    invalidReference("Artifact reference identity does not match its file path.");
  }
  if (
    typeof value.generation !== "number" ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1
  ) {
    invalidReference("Artifact reference generation is invalid.");
  }
  const generation = value.generation;
  const artifactId = referenceArtifactId(value.artifactId, "artifactId");
  const contentHash = referenceContentHash(value.contentHash);
  const hasPrevious = Object.hasOwn(value, "previousArtifactId");
  const previousArtifactId = hasPrevious
    ? referenceArtifactId(value.previousArtifactId, "previousArtifactId")
    : undefined;
  if ((generation === 1 && hasPrevious) || (generation > 1 && !hasPrevious)) {
    invalidReference(
      "Artifact reference generation and previousArtifactId are inconsistent.",
    );
  }
  const updatedAt = referenceTimestamp(value.updatedAt);
  const actor = Object.hasOwn(value, "actor")
    ? referenceActor(value.actor)
    : undefined;

  return freezeArtifactValue<ArtifactReference>({
    schemaVersion: "1.0",
    namespace,
    name,
    generation,
    artifactId,
    contentHash,
    ...(previousArtifactId !== undefined ? { previousArtifactId } : {}),
    updatedAt,
    ...(actor !== undefined ? { actor } : {}),
  });
}

function parseReferenceText(
  value: string,
  expectedNamespace: string,
  expectedName: string,
): ArtifactReference {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    invalidReference("Artifact reference is not valid JSON.");
  }
  const reference = parseReference(parsed, expectedNamespace, expectedName);
  if (serializeReference(reference) !== value) {
    invalidReference("Artifact reference bytes are not canonical.");
  }
  return reference;
}

export class LocalArtifactStore implements ArtifactStore {
  readonly #rootPromise: Promise<string>;
  readonly #lockTimeoutMs: number;
  readonly #staleLockMs: number;

  public constructor(options: LocalArtifactStoreOptions) {
    this.#rootPromise = ensureArtifactRoot(options.root);
    this.#lockTimeoutMs = options.lockTimeoutMs ?? 15_000;
    this.#staleLockMs = options.staleLockMs ?? 120_000;
  }

  public async root(): Promise<string> {
    return this.#rootPromise;
  }

  async #lock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    return withFileLock(await this.root(), key, operation, {
      timeoutMs: this.#lockTimeoutMs,
      staleAfterMs: this.#staleLockMs,
    });
  }

  async #referenceTarget(
    reference: ArtifactReference,
    field: "artifactId" | "previousArtifactId",
  ): Promise<StoredArtifact> {
    const id = field === "artifactId"
      ? reference.artifactId
      : reference.previousArtifactId;
    if (id === undefined) {
      invalidReference(`Artifact reference ${field} is missing.`);
    }
    let descriptor: StoredArtifact | null;
    try {
      descriptor = await this.get(id);
    } catch (error: unknown) {
      if (
        error instanceof ArtifactStoreError &&
        error.code === "ARTIFACT_DESCRIPTOR_INVALID"
      ) {
        invalidReference(`Artifact reference ${field} descriptor is invalid.`);
      }
      throw error;
    }
    if (!descriptor) {
      invalidReference(`Artifact reference ${field} target was not found.`);
    }
    return descriptor;
  }

  async #readReference(
    referencePath: string,
    expectedNamespace: string,
    expectedName: string,
  ): Promise<ArtifactReference> {
    const reference = parseReferenceText(
      await readFile(referencePath, "utf8"),
      expectedNamespace,
      expectedName,
    );
    const descriptor = await this.#referenceTarget(reference, "artifactId");
    if (descriptor.contentHash !== reference.contentHash) {
      invalidReference(
        "Artifact reference contentHash does not match its target descriptor.",
      );
    }
    if (
      reference.previousArtifactId !== undefined &&
      reference.previousArtifactId !== reference.artifactId
    ) {
      await this.#referenceTarget(reference, "previousArtifactId");
    }
    return reference;
  }

  public async put(
    content: Uint8Array | string,
    input: ArtifactDescriptorInput,
  ): Promise<StoredArtifact> {
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    const hash = createContentHash(bytes);
    const body = descriptorBody(hash, bytes.byteLength, input);
    const canonicalBody = stableStringify(body);
    const descriptorSha256 = sha256(canonicalBody);
    const id = createArtifactId(body);
    const objectRelativePath = contentObjectRelativePath(hash);
    const descriptorPathRelative = descriptorRelativePath(id);
    const root = await this.root();
    const objectPath = path.join(root, objectRelativePath);
    const descriptorPath = path.join(root, descriptorPathRelative);
    const descriptor = freezeArtifactValue<StoredArtifact>({
      ...(body as unknown as Omit<ArtifactDescriptor, "artifactId" | "descriptorSha256">),
      artifactId: id,
      descriptorSha256,
      objectRelativePath: relativePortable(objectRelativePath),
      descriptorRelativePath: relativePortable(descriptorPathRelative),
    });

    await this.#lock(`object:${hash}`, async () => {
      if (await fileExists(objectPath)) {
        const existing = await readFile(objectPath);
        if (sha256(existing) !== hash.slice("sha256:".length)) {
          throw new ArtifactStoreError(
            "ARTIFACT_OBJECT_HASH_CONFLICT",
            `Existing object bytes do not match ${hash}.`,
          );
        }
        return;
      }
      await atomicWriteFile(objectPath, bytes);
    });

    await this.#lock(`descriptor:${id}`, async () => {
      const serialized = `${JSON.stringify(descriptor, null, 2)}\n`;
      if (await fileExists(descriptorPath)) {
        const existing = parseDescriptorText(
          await readFile(descriptorPath, "utf8"),
          id,
        );
        if (stableStringify(normalizeJson(existing)) !== stableStringify(normalizeJson(descriptor))) {
          throw new ArtifactStoreError(
            "ARTIFACT_DESCRIPTOR_CONFLICT",
            `Artifact descriptor ${id} already exists with different data.`,
          );
        }
        return;
      }
      await atomicWriteFile(descriptorPath, serialized);
    });

    return descriptor;
  }

  public async get(id: ArtifactId): Promise<StoredArtifact | null> {
    validateArtifactId(id);
    const descriptorPath = path.join(await this.root(), descriptorRelativePath(id));
    try {
      return parseDescriptorText(await readFile(descriptorPath, "utf8"), id);
    } catch (error: unknown) {
      if (errorCode(error) === "ENOENT") return null;
      throw error;
    }
  }

  public async read(id: ArtifactId): Promise<Buffer> {
    const descriptor = await this.get(id);
    if (!descriptor) {
      throw new ArtifactStoreError(
        "ARTIFACT_NOT_FOUND",
        `Artifact ${id} was not found.`,
      );
    }
    const bytes = await readFile(
      path.join(await this.root(), contentObjectRelativePath(descriptor.contentHash)),
    );
    if (
      bytes.byteLength !== descriptor.sizeBytes ||
      sha256(bytes) !== descriptor.contentSha256
    ) {
      throw new ArtifactStoreError(
        "ARTIFACT_CONTENT_CORRUPT",
        `Artifact ${id} does not match its immutable descriptor.`,
      );
    }
    return bytes;
  }

  public async verify(id: ArtifactId): Promise<ArtifactVerification> {
    let descriptor: StoredArtifact | null;
    try {
      descriptor = await this.get(id);
    } catch (error: unknown) {
      if (
        error instanceof ArtifactStoreError &&
        error.code === "ARTIFACT_DESCRIPTOR_INVALID"
      ) {
        return {
          artifactId: id,
          exists: true,
          descriptorValid: false,
          contentValid: false,
          expectedContentSha256: "",
          expectedSizeBytes: 0,
        };
      }
      throw error;
    }
    if (!descriptor) {
      return {
        artifactId: id,
        exists: false,
        descriptorValid: false,
        contentValid: false,
        expectedContentSha256: "",
        expectedSizeBytes: 0,
      };
    }
    const objectPath = path.join(
      await this.root(),
      contentObjectRelativePath(descriptor.contentHash),
    );
    try {
      const bytes = await readFile(objectPath);
      const actualContentSha256 = sha256(bytes);
      return {
        artifactId: id,
        exists: true,
        descriptorValid: true,
        contentValid:
          actualContentSha256 === descriptor.contentSha256 &&
          bytes.byteLength === descriptor.sizeBytes,
        expectedContentSha256: descriptor.contentSha256,
        actualContentSha256,
        expectedSizeBytes: descriptor.sizeBytes,
        actualSizeBytes: bytes.byteLength,
      };
    } catch (error: unknown) {
      if (errorCode(error) !== "ENOENT") throw error;
      return {
        artifactId: id,
        exists: true,
        descriptorValid: true,
        contentValid: false,
        expectedContentSha256: descriptor.contentSha256,
        expectedSizeBytes: descriptor.sizeBytes,
      };
    }
  }

  public async updateReference(
    namespace: string,
    name: string,
    id: ArtifactId,
    options: UpdateArtifactReferenceOptions = {},
  ): Promise<ArtifactReference> {
    validateArtifactId(id);
    const descriptor = await this.get(id);
    if (!descriptor) {
      throw new ArtifactStoreError(
        "ARTIFACT_NOT_FOUND",
        `Artifact ${id} was not found.`,
      );
    }
    const normalizedNamespace = safeNamespace(namespace).join("/");
    const normalizedName = safeSegment(name, "name");
    const actor = optionReferenceActor(options.actor);
    const updatedAt = optionReferenceTimestamp(options.now ?? new Date());
    const root = await this.root();
    const relativePath = referenceRelativePath(normalizedNamespace, normalizedName);
    const referencePath = path.join(root, relativePath);

    return this.#lock(`reference:${normalizedNamespace}/${normalizedName}`, async () => {
      let previous: ArtifactReference | null = null;
      try {
        previous = await this.#readReference(
          referencePath,
          normalizedNamespace,
          normalizedName,
        );
      } catch (error: unknown) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      if (
        options.expectedGeneration !== undefined &&
        options.expectedGeneration !== (previous?.generation ?? 0)
      ) {
        throw new ArtifactStoreError(
          "ARTIFACT_REFERENCE_CONFLICT",
          `Reference generation changed for ${normalizedNamespace}/${normalizedName}.`,
        );
      }
      if (
        options.expectedArtifactId !== undefined &&
        options.expectedArtifactId !== previous?.artifactId
      ) {
        throw new ArtifactStoreError(
          "ARTIFACT_REFERENCE_CONFLICT",
          `Reference artifact changed for ${normalizedNamespace}/${normalizedName}.`,
        );
      }
      const reference = freezeArtifactValue<ArtifactReference>({
        schemaVersion: "1.0",
        namespace: normalizedNamespace,
        name: normalizedName,
        generation: (previous?.generation ?? 0) + 1,
        artifactId: descriptor.artifactId,
        contentHash: descriptor.contentHash,
        ...(previous ? { previousArtifactId: previous.artifactId } : {}),
        updatedAt,
        ...(actor !== undefined ? { actor } : {}),
      });
      await mkdir(path.dirname(referencePath), { recursive: true });
      await atomicWriteFile(referencePath, serializeReference(reference));
      return reference;
    });
  }

  public async resolveReference(
    namespace: string,
    name: string,
  ): Promise<ArtifactReference | null> {
    const normalizedNamespace = safeNamespace(namespace).join("/");
    const normalizedName = safeSegment(name, "name");
    const referencePath = path.join(
      await this.root(),
      referenceRelativePath(normalizedNamespace, normalizedName),
    );
    try {
      return await this.#readReference(
        referencePath,
        normalizedNamespace,
        normalizedName,
      );
    } catch (error: unknown) {
      if (errorCode(error) === "ENOENT") return null;
      throw error;
    }
  }

  public async listReferences(
    namespace: string,
  ): Promise<readonly ArtifactReference[]> {
    const root = await this.root();
    const normalizedNamespace = safeNamespace(namespace).join("/");
    const directory = path.join(root, "refs", ...safeNamespace(normalizedNamespace));
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error: unknown) {
      if (errorCode(error) === "ENOENT") return Object.freeze([]);
      throw error;
    }
    const references: ArtifactReference[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const expectedName = entry.name.slice(0, -".json".length);
      let normalizedName: string;
      try {
        normalizedName = safeSegment(expectedName, "name");
      } catch {
        invalidReference("Artifact reference file name is invalid.");
      }
      if (normalizedName !== expectedName) {
        invalidReference("Artifact reference file name is not canonical.");
      }
      references.push(
        await this.#readReference(
          path.join(directory, entry.name),
          normalizedNamespace,
          normalizedName,
        ),
      );
    }
    return Object.freeze(
      references.sort((left, right) => left.name.localeCompare(right.name)),
    );
  }
}
