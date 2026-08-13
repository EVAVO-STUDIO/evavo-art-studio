import {
  ARTIFACT_ID,
  SHA256,
  assert,
  safeReadRegular,
  stableStringify,
  sha256,
} from "./provider-candidate-admission-common.mjs";

const ARTIFACT_PROTOCOL_VERSION = "2026-07-29.1";
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
const STORAGE_CLASSES = new Set([
  "source",
  "master",
  "intermediate",
  "preview",
  "evidence",
  "manifest",
  "runtime",
]);

function descriptorRelativePath(artifactId) {
  const hex = artifactId.slice("artifact_".length);
  return `descriptors/sha256/${hex.slice(0, 2)}/${hex.slice(2, 4)}/${artifactId}.json`;
}
function objectRelativePath(contentSha256) {
  return `objects/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}`;
}
function descriptorBody(descriptor) {
  const body = {
    schemaVersion: descriptor.schemaVersion,
    protocolVersion: descriptor.protocolVersion,
    contentHash: descriptor.contentHash,
    contentSha256: descriptor.contentSha256,
    sizeBytes: descriptor.sizeBytes,
    mediaType: descriptor.mediaType,
    storageClass: descriptor.storageClass,
    sourceArtifacts: descriptor.sourceArtifacts,
    labels: descriptor.labels,
  };
  if (Object.hasOwn(descriptor, "fileName")) body.fileName = descriptor.fileName;
  if (Object.hasOwn(descriptor, "metadata")) body.metadata = descriptor.metadata;
  return body;
}
function validateDescriptor(descriptor, artifactId, label) {
  assert(
    descriptor && typeof descriptor === "object" && !Array.isArray(descriptor),
    `${label} descriptor must be an object.`,
  );
  for (const key of Object.keys(descriptor)) {
    assert(
      DESCRIPTOR_KEYS.has(key),
      `${label} descriptor contains unsupported field ${key}.`,
    );
  }
  assert(
    descriptor.schemaVersion === "1.0" &&
      descriptor.protocolVersion === ARTIFACT_PROTOCOL_VERSION,
    `${label} descriptor schema or protocol drifted.`,
  );
  assert(
    descriptor.artifactId === artifactId && ARTIFACT_ID.test(artifactId),
    `${label} descriptor identity drifted.`,
  );
  assert(
    SHA256.test(String(descriptor.contentSha256 ?? "")) &&
      descriptor.contentHash === `sha256:${descriptor.contentSha256}`,
    `${label} descriptor content hash is invalid.`,
  );
  assert(
    Number.isSafeInteger(descriptor.sizeBytes) && descriptor.sizeBytes > 0,
    `${label} descriptor size is invalid.`,
  );
  assert(
    typeof descriptor.mediaType === "string" &&
      descriptor.mediaType === descriptor.mediaType.trim().toLowerCase(),
    `${label} descriptor media type is invalid.`,
  );
  assert(
    STORAGE_CLASSES.has(descriptor.storageClass),
    `${label} descriptor storage class is invalid.`,
  );
  assert(
    Array.isArray(descriptor.sourceArtifacts) &&
      descriptor.sourceArtifacts.every((id) => ARTIFACT_ID.test(String(id))),
    `${label} source artifacts are invalid.`,
  );
  assert(
    new Set(descriptor.sourceArtifacts).size === descriptor.sourceArtifacts.length &&
      [...descriptor.sourceArtifacts].sort().join("|") ===
        descriptor.sourceArtifacts.join("|"),
    `${label} source artifacts must be sorted and unique.`,
  );
  assert(
    descriptor.labels &&
      typeof descriptor.labels === "object" &&
      !Array.isArray(descriptor.labels) &&
      Object.entries(descriptor.labels).every(
        ([key, value]) =>
          key.trim() === key &&
          key.length > 0 &&
          typeof value === "string" &&
          value.trim() === value &&
          value.length > 0,
      ),
    `${label} labels are invalid.`,
  );
  const digest = sha256(stableStringify(descriptorBody(descriptor)));
  assert(
    descriptor.descriptorSha256 === digest && artifactId === `artifact_${digest}`,
    `${label} descriptor digest or artifact identity drifted.`,
  );
  assert(
    descriptor.objectRelativePath === objectRelativePath(descriptor.contentSha256) &&
      descriptor.descriptorRelativePath === descriptorRelativePath(artifactId),
    `${label} descriptor storage path drifted.`,
  );
  return descriptor;
}

export async function readAdmissionArtifact(root, artifactId, label) {
  assert(ARTIFACT_ID.test(String(artifactId ?? "")), `${label} artifact id is invalid.`);
  const descriptorBytes = await safeReadRegular(
    root,
    descriptorRelativePath(artifactId),
    `${label} descriptor`,
  );
  let descriptor;
  try {
    descriptor = JSON.parse(descriptorBytes.toString("utf8"));
  } catch {
    assert(false, `${label} descriptor is not valid JSON.`);
  }
  validateDescriptor(descriptor, artifactId, label);
  const bytes = await safeReadRegular(
    root,
    descriptor.objectRelativePath,
    `${label} object`,
  );
  assert(
    bytes.byteLength === descriptor.sizeBytes &&
      sha256(bytes) === descriptor.contentSha256,
    `${label} object bytes do not match their descriptor.`,
  );
  return { descriptor, bytes };
}
