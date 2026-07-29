export const ARTIFACT_PROTOCOL_VERSION = "2026-07-29.1" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;

export type ArtifactStorageClass =
  | "source"
  | "master"
  | "intermediate"
  | "preview"
  | "evidence"
  | "manifest"
  | "runtime";

export type ContentHash = `sha256:${string}`;
export type ArtifactId = `artifact_${string}`;

export interface ArtifactDescriptorInput {
  readonly mediaType: string;
  readonly storageClass: ArtifactStorageClass;
  readonly fileName?: string;
  readonly sourceArtifacts?: readonly ArtifactId[];
  readonly labels?: Readonly<Record<string, string>>;
  readonly metadata?: JsonValue;
}

export interface ArtifactDescriptor {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof ARTIFACT_PROTOCOL_VERSION;
  readonly artifactId: ArtifactId;
  readonly descriptorSha256: string;
  readonly contentHash: ContentHash;
  readonly contentSha256: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
  readonly storageClass: ArtifactStorageClass;
  readonly fileName?: string;
  readonly sourceArtifacts: readonly ArtifactId[];
  readonly labels: Readonly<Record<string, string>>;
  readonly metadata?: JsonValue;
}

export interface StoredArtifact extends ArtifactDescriptor {
  readonly objectRelativePath: string;
  readonly descriptorRelativePath: string;
}

export interface ArtifactVerification {
  readonly artifactId: ArtifactId;
  readonly exists: boolean;
  readonly descriptorValid: boolean;
  readonly contentValid: boolean;
  readonly expectedContentSha256: string;
  readonly actualContentSha256?: string;
  readonly expectedSizeBytes: number;
  readonly actualSizeBytes?: number;
}

export interface ArtifactReference {
  readonly schemaVersion: "1.0";
  readonly namespace: string;
  readonly name: string;
  readonly generation: number;
  readonly artifactId: ArtifactId;
  readonly contentHash: ContentHash;
  readonly previousArtifactId?: ArtifactId;
  readonly updatedAt: string;
  readonly actor?: string;
}

export interface UpdateArtifactReferenceOptions {
  readonly expectedGeneration?: number;
  readonly expectedArtifactId?: ArtifactId;
  readonly actor?: string;
  readonly now?: Date;
}

export interface LocalArtifactStoreOptions {
  readonly root: string;
  readonly lockTimeoutMs?: number;
  readonly staleLockMs?: number;
}

export interface ArtifactStore {
  put(
    content: Uint8Array | string,
    descriptor: ArtifactDescriptorInput,
  ): Promise<StoredArtifact>;
  get(artifactId: ArtifactId): Promise<StoredArtifact | null>;
  read(artifactId: ArtifactId): Promise<Buffer>;
  verify(artifactId: ArtifactId): Promise<ArtifactVerification>;
  updateReference(
    namespace: string,
    name: string,
    artifactId: ArtifactId,
    options?: UpdateArtifactReferenceOptions,
  ): Promise<ArtifactReference>;
  resolveReference(
    namespace: string,
    name: string,
  ): Promise<ArtifactReference | null>;
  listReferences(namespace: string): Promise<readonly ArtifactReference[]>;
}

export class ArtifactStoreError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ArtifactStoreError";
    this.code = code;
  }
}
