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

function validateArtifactId(value: string): asserts value is ArtifactId {
  if (!/^artifact_[a-f0-9]{64}$/.test(value)) {
    throw new ArtifactStoreError(
      "ARTIFACT_ID_INVALID",
      "Artifact ID must use artifact_<sha256> format.",
    );
  }
}

function validateContentHash(value: string): asserts value is ContentHash {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
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
  const result: Record<string, string> = {};
  for (const key of Object.keys(value ?? {}).sort()) {
    const normalizedKey = safeSegment(key, `labels.${key}`);
    const normalizedValue = value![key]!.trim();
    if (!normalizedValue || normalizedValue.length > 512 || normalizedValue.includes("\0")) {
      throw new ArtifactStoreError(
        "ARTIFACT_LABEL_INVALID",
        `Artifact label ${normalizedKey} must contain 1 to 512 characters.`,
      );
    }
    result[normalizedKey] = normalizedValue;
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

function parseDescriptor(value: unknown): StoredArtifact {
  if (!value || typeof value !== "object") {
    throw new ArtifactStoreError(
      "ARTIFACT_DESCRIPTOR_INVALID",
      "Artifact descriptor must be a JSON object.",
    );
  }
  const descriptor = value as Partial<StoredArtifact>;
  if (
    descriptor.schemaVersion !== "1.0" ||
    descriptor.protocolVersion !== ARTIFACT_PROTOCOL_VERSION ||
    typeof descriptor.artifactId !== "string" ||
    typeof descriptor.contentHash !== "string" ||
    typeof descriptor.contentSha256 !== "string" ||
    typeof descriptor.descriptorSha256 !== "string" ||
    typeof descriptor.sizeBytes !== "number" ||
    typeof descriptor.mediaType !== "string" ||
    typeof descriptor.storageClass !== "string" ||
    !Array.isArray(descriptor.sourceArtifacts) ||
    !descriptor.labels ||
    typeof descriptor.objectRelativePath !== "string" ||
    typeof descriptor.descriptorRelativePath !== "string"
  ) {
    throw new ArtifactStoreError(
      "ARTIFACT_DESCRIPTOR_INVALID",
      "Artifact descriptor is missing required fields.",
    );
  }
  validateArtifactId(descriptor.artifactId);
  validateContentHash(descriptor.contentHash);
  return descriptor as StoredArtifact;
}

function parseReference(value: unknown): ArtifactReference {
  if (!value || typeof value !== "object") {
    throw new ArtifactStoreError(
      "ARTIFACT_REFERENCE_INVALID",
      "Artifact reference must be a JSON object.",
    );
  }
  const reference = value as Partial<ArtifactReference>;
  if (
    reference.schemaVersion !== "1.0" ||
    typeof reference.namespace !== "string" ||
    typeof reference.name !== "string" ||
    typeof reference.generation !== "number" ||
    typeof reference.artifactId !== "string" ||
    typeof reference.contentHash !== "string" ||
    typeof reference.updatedAt !== "string"
  ) {
    throw new ArtifactStoreError(
      "ARTIFACT_REFERENCE_INVALID",
      "Artifact reference is missing required fields.",
    );
  }
  validateArtifactId(reference.artifactId);
  validateContentHash(reference.contentHash);
  return reference as ArtifactReference;
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
    const descriptor: StoredArtifact = {
      ...(body as unknown as Omit<ArtifactDescriptor, "artifactId" | "descriptorSha256">),
      artifactId: id,
      descriptorSha256,
      objectRelativePath: relativePortable(objectRelativePath),
      descriptorRelativePath: relativePortable(descriptorPathRelative),
    };

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
        const existing = parseDescriptor(
          JSON.parse(await readFile(descriptorPath, "utf8")) as unknown,
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
      return parseDescriptor(
        JSON.parse(await readFile(descriptorPath, "utf8")) as unknown,
      );
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
    const bytes = await readFile(path.join(await this.root(), descriptor.objectRelativePath));
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
    const descriptor = await this.get(id);
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
    const objectPath = path.join(await this.root(), descriptor.objectRelativePath);
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
    const root = await this.root();
    const relativePath = referenceRelativePath(normalizedNamespace, normalizedName);
    const referencePath = path.join(root, relativePath);

    return this.#lock(`reference:${normalizedNamespace}/${normalizedName}`, async () => {
      let previous: ArtifactReference | null = null;
      try {
        previous = parseReference(
          JSON.parse(await readFile(referencePath, "utf8")) as unknown,
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
      const reference: ArtifactReference = {
        schemaVersion: "1.0",
        namespace: normalizedNamespace,
        name: normalizedName,
        generation: (previous?.generation ?? 0) + 1,
        artifactId: descriptor.artifactId,
        contentHash: descriptor.contentHash,
        ...(previous ? { previousArtifactId: previous.artifactId } : {}),
        updatedAt: (options.now ?? new Date()).toISOString(),
        ...(options.actor?.trim() ? { actor: options.actor.trim() } : {}),
      };
      await mkdir(path.dirname(referencePath), { recursive: true });
      await atomicWriteFile(referencePath, `${JSON.stringify(reference, null, 2)}\n`);
      return reference;
    });
  }

  public async resolveReference(
    namespace: string,
    name: string,
  ): Promise<ArtifactReference | null> {
    const referencePath = path.join(
      await this.root(),
      referenceRelativePath(namespace, name),
    );
    try {
      return parseReference(
        JSON.parse(await readFile(referencePath, "utf8")) as unknown,
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
    const directory = path.join(root, "refs", ...safeNamespace(namespace));
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error: unknown) {
      if (errorCode(error) === "ENOENT") return [];
      throw error;
    }
    const references: ArtifactReference[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      references.push(
        parseReference(
          JSON.parse(await readFile(path.join(directory, entry.name), "utf8")) as unknown,
        ),
      );
    }
    return references.sort((left, right) => left.name.localeCompare(right.name));
  }
}
