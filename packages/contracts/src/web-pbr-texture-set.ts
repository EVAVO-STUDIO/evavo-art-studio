export const WEB_PBR_TEXTURE_SET_CONTRACT_VERSION = "evavo_art_web_pbr_texture_set_v1" as const;

export const WEB_PBR_TEXTURE_ROLES = [
  "base-color",
  "normal",
  "roughness",
  "metalness",
  "ao",
  "emissive",
  "opacity",
  "mask",
] as const;

export type WebPbrTextureRole = (typeof WEB_PBR_TEXTURE_ROLES)[number];
export type WebPbrTextureFormat = "image" | "ktx2";
export type WebPbrTextureColorSpace = "srgb" | "linear";

export type WebPbrTextureChannel = Readonly<{
  role: WebPbrTextureRole;
  format: WebPbrTextureFormat;
  colorSpace: WebPbrTextureColorSpace;
  uri: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
}>;

export type WebPbrTextureSet = Readonly<{
  contractVersion: typeof WEB_PBR_TEXTURE_SET_CONTRACT_VERSION;
  textureSetId: string;
  textureSetVersion: number;
  approval: "approved";
  consumer: Readonly<{
    repository: "EVAVO-STUDIO/threejs-experiments";
    materialRecipeIds: readonly string[];
    fallbackTextureSetId: string | null;
    fallbackRetentionRequiredUntilConsumerAdmission: true;
  }>;
  source: Readonly<{
    repository: "EVAVO-STUDIO/evavo-art-studio";
    revision: string;
    sourceSha256: string;
  }>;
  channels: readonly WebPbrTextureChannel[];
  sampling: Readonly<{
    repeat: readonly [number, number];
    anisotropy: number;
  }>;
  rights: Readonly<{
    status: "cleared";
    provenanceNote: string;
  }>;
  review: Readonly<{
    status: "approved";
    checks: readonly Readonly<{
      id: string;
      status: "pass";
      detail?: string;
    }>[];
    previewArtifactSha256: string;
  }>;
  consumerReview: Readonly<{
    materialLabDryWetRequired: true;
    independentVisualApprovalRequired: true;
  }>;
}>;

export type WebPbrTextureSetIssue = Readonly<{
  code: string;
  path: string;
}>;

export type WebPbrTextureSetValidation = Readonly<{
  valid: boolean;
  issues: readonly WebPbrTextureSetIssue[];
}>;

const ID = /^[a-z0-9][a-z0-9-]{1,63}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const roles = new Set<string>(WEB_PBR_TEXTURE_ROLES);
const requiredReviewChecks = Object.freeze([
  "channel-role-colour-space",
  "seam-and-tiling",
  "fixed-lighting-preview",
  "rights-and-provenance",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function issue(code: string, path: string): WebPbrTextureSetIssue {
  return Object.freeze({ code, path });
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string, issues: WebPbrTextureSetIssue[]): void {
  const allowed = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(issue("ART_WEB_PBR_FIELD_UNKNOWN", `${path}.${key}`));
  }
  for (const key of expected) {
    if (!(key in value)) issues.push(issue("ART_WEB_PBR_FIELD_REQUIRED", `${path}.${key}`));
  }
}

function safeUri(value: unknown): value is string {
  return typeof value === "string"
    && value.startsWith("/")
    && !value.startsWith("//")
    && !/[?#\\]/u.test(value)
    && !value.split("/").includes("..");
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateWebPbrTextureSet(document: unknown): WebPbrTextureSetValidation {
  const issues: WebPbrTextureSetIssue[] = [];
  const root = record(document);
  if (!root) return Object.freeze({ valid: false, issues: [issue("ART_WEB_PBR_DOCUMENT_INVALID", "$")] });

  exactKeys(root, [
    "contractVersion",
    "textureSetId",
    "textureSetVersion",
    "approval",
    "consumer",
    "source",
    "channels",
    "sampling",
    "rights",
    "review",
    "consumerReview",
  ], "$", issues);

  if (root.contractVersion !== WEB_PBR_TEXTURE_SET_CONTRACT_VERSION) {
    issues.push(issue("ART_WEB_PBR_CONTRACT_VERSION_UNSUPPORTED", "$.contractVersion"));
  }
  if (typeof root.textureSetId !== "string" || !ID.test(root.textureSetId)) {
    issues.push(issue("ART_WEB_PBR_TEXTURE_SET_ID_INVALID", "$.textureSetId"));
  }
  if (!Number.isInteger(root.textureSetVersion) || (root.textureSetVersion as number) < 1) {
    issues.push(issue("ART_WEB_PBR_TEXTURE_SET_VERSION_INVALID", "$.textureSetVersion"));
  }
  if (root.approval !== "approved") {
    issues.push(issue("ART_WEB_PBR_APPROVAL_REQUIRED", "$.approval"));
  }

  const consumer = record(root.consumer);
  if (!consumer) {
    issues.push(issue("ART_WEB_PBR_CONSUMER_INVALID", "$.consumer"));
  } else {
    exactKeys(consumer, [
      "repository",
      "materialRecipeIds",
      "fallbackTextureSetId",
      "fallbackRetentionRequiredUntilConsumerAdmission",
    ], "$.consumer", issues);
    if (consumer.repository !== "EVAVO-STUDIO/threejs-experiments") {
      issues.push(issue("ART_WEB_PBR_CONSUMER_REPOSITORY_INVALID", "$.consumer.repository"));
    }
    if (
      !Array.isArray(consumer.materialRecipeIds)
      || consumer.materialRecipeIds.length < 1
      || consumer.materialRecipeIds.length > 64
      || new Set(consumer.materialRecipeIds).size !== consumer.materialRecipeIds.length
      || consumer.materialRecipeIds.some((value) => typeof value !== "string" || !ID.test(value))
    ) {
      issues.push(issue("ART_WEB_PBR_MATERIAL_RECIPE_IDS_INVALID", "$.consumer.materialRecipeIds"));
    }
    if (consumer.fallbackTextureSetId !== null && (typeof consumer.fallbackTextureSetId !== "string" || !ID.test(consumer.fallbackTextureSetId))) {
      issues.push(issue("ART_WEB_PBR_FALLBACK_ID_INVALID", "$.consumer.fallbackTextureSetId"));
    }
    if (consumer.fallbackRetentionRequiredUntilConsumerAdmission !== true) {
      issues.push(issue("ART_WEB_PBR_FALLBACK_RETENTION_REQUIRED", "$.consumer.fallbackRetentionRequiredUntilConsumerAdmission"));
    }
  }

  const source = record(root.source);
  if (!source) {
    issues.push(issue("ART_WEB_PBR_SOURCE_INVALID", "$.source"));
  } else {
    exactKeys(source, ["repository", "revision", "sourceSha256"], "$.source", issues);
    if (source.repository !== "EVAVO-STUDIO/evavo-art-studio") {
      issues.push(issue("ART_WEB_PBR_SOURCE_REPOSITORY_INVALID", "$.source.repository"));
    }
    if (typeof source.revision !== "string" || source.revision.length < 7 || source.revision.length > 200) {
      issues.push(issue("ART_WEB_PBR_SOURCE_REVISION_INVALID", "$.source.revision"));
    }
    if (typeof source.sourceSha256 !== "string" || !SHA256.test(source.sourceSha256)) {
      issues.push(issue("ART_WEB_PBR_SOURCE_HASH_INVALID", "$.source.sourceSha256"));
    }
  }

  if (!Array.isArray(root.channels) || root.channels.length < 1 || root.channels.length > 8) {
    issues.push(issue("ART_WEB_PBR_CHANNELS_INVALID", "$.channels"));
  } else {
    const seenRoles = new Set<string>();
    root.channels.forEach((rawChannel, index) => {
      const channel = record(rawChannel);
      const prefix = `$.channels[${index}]`;
      if (!channel) {
        issues.push(issue("ART_WEB_PBR_CHANNEL_INVALID", prefix));
        return;
      }
      exactKeys(channel, ["role", "format", "colorSpace", "uri", "sha256", "bytes", "width", "height"], prefix, issues);
      if (typeof channel.role !== "string" || !roles.has(channel.role)) {
        issues.push(issue("ART_WEB_PBR_CHANNEL_ROLE_INVALID", `${prefix}.role`));
      } else {
        if (seenRoles.has(channel.role)) issues.push(issue("ART_WEB_PBR_CHANNEL_ROLE_DUPLICATE", `${prefix}.role`));
        seenRoles.add(channel.role);
        const expectedColorSpace = channel.role === "base-color" || channel.role === "emissive" ? "srgb" : "linear";
        if (channel.colorSpace !== expectedColorSpace) {
          issues.push(issue("ART_WEB_PBR_CHANNEL_COLOR_SPACE_INVALID", `${prefix}.colorSpace`));
        }
      }
      if (channel.format !== "image" && channel.format !== "ktx2") {
        issues.push(issue("ART_WEB_PBR_CHANNEL_FORMAT_INVALID", `${prefix}.format`));
      }
      if (!safeUri(channel.uri)) issues.push(issue("ART_WEB_PBR_CHANNEL_URI_INVALID", `${prefix}.uri`));
      if (typeof channel.sha256 !== "string" || !SHA256.test(channel.sha256)) {
        issues.push(issue("ART_WEB_PBR_CHANNEL_HASH_INVALID", `${prefix}.sha256`));
      }
      if (!Number.isInteger(channel.bytes) || (channel.bytes as number) < 1 || (channel.bytes as number) > 64 * 1024 * 1024) {
        issues.push(issue("ART_WEB_PBR_CHANNEL_BYTES_INVALID", `${prefix}.bytes`));
      }
      if (!Number.isInteger(channel.width) || (channel.width as number) < 1 || (channel.width as number) > 8192) {
        issues.push(issue("ART_WEB_PBR_CHANNEL_WIDTH_INVALID", `${prefix}.width`));
      }
      if (!Number.isInteger(channel.height) || (channel.height as number) < 1 || (channel.height as number) > 8192) {
        issues.push(issue("ART_WEB_PBR_CHANNEL_HEIGHT_INVALID", `${prefix}.height`));
      }
    });
  }

  const sampling = record(root.sampling);
  if (!sampling) {
    issues.push(issue("ART_WEB_PBR_SAMPLING_INVALID", "$.sampling"));
  } else {
    exactKeys(sampling, ["repeat", "anisotropy"], "$.sampling", issues);
    if (!Array.isArray(sampling.repeat) || sampling.repeat.length !== 2 || !sampling.repeat.every(positiveFinite)) {
      issues.push(issue("ART_WEB_PBR_REPEAT_INVALID", "$.sampling.repeat"));
    }
    if (!Number.isInteger(sampling.anisotropy) || (sampling.anisotropy as number) < 1 || (sampling.anisotropy as number) > 16) {
      issues.push(issue("ART_WEB_PBR_ANISOTROPY_INVALID", "$.sampling.anisotropy"));
    }
  }

  const rights = record(root.rights);
  if (!rights) {
    issues.push(issue("ART_WEB_PBR_RIGHTS_INVALID", "$.rights"));
  } else {
    exactKeys(rights, ["status", "provenanceNote"], "$.rights", issues);
    if (rights.status !== "cleared") issues.push(issue("ART_WEB_PBR_RIGHTS_NOT_CLEARED", "$.rights.status"));
    if (typeof rights.provenanceNote !== "string" || rights.provenanceNote.trim().length < 8 || rights.provenanceNote.length > 2000) {
      issues.push(issue("ART_WEB_PBR_PROVENANCE_NOTE_INVALID", "$.rights.provenanceNote"));
    }
  }

  const review = record(root.review);
  if (!review) {
    issues.push(issue("ART_WEB_PBR_REVIEW_INVALID", "$.review"));
  } else {
    exactKeys(review, ["status", "checks", "previewArtifactSha256"], "$.review", issues);
    if (review.status !== "approved") issues.push(issue("ART_WEB_PBR_REVIEW_APPROVAL_REQUIRED", "$.review.status"));
    if (typeof review.previewArtifactSha256 !== "string" || !SHA256.test(review.previewArtifactSha256)) {
      issues.push(issue("ART_WEB_PBR_PREVIEW_HASH_INVALID", "$.review.previewArtifactSha256"));
    }
    if (!Array.isArray(review.checks) || review.checks.length < requiredReviewChecks.length || review.checks.length > 32) {
      issues.push(issue("ART_WEB_PBR_REVIEW_CHECKS_INVALID", "$.review.checks"));
    } else {
      const ids = new Set<string>();
      review.checks.forEach((rawCheck, index) => {
        const check = record(rawCheck);
        const prefix = `$.review.checks[${index}]`;
        if (!check) {
          issues.push(issue("ART_WEB_PBR_REVIEW_CHECK_INVALID", prefix));
          return;
        }
        exactKeys(check, check.detail === undefined ? ["id", "status"] : ["id", "status", "detail"], prefix, issues);
        if (typeof check.id !== "string" || check.id.length < 1 || check.id.length > 100 || ids.has(check.id)) {
          issues.push(issue("ART_WEB_PBR_REVIEW_CHECK_ID_INVALID", `${prefix}.id`));
        } else {
          ids.add(check.id);
        }
        if (check.status !== "pass") issues.push(issue("ART_WEB_PBR_REVIEW_CHECK_NOT_PASS", `${prefix}.status`));
        if (check.detail !== undefined && (typeof check.detail !== "string" || check.detail.length > 2000)) {
          issues.push(issue("ART_WEB_PBR_REVIEW_CHECK_DETAIL_INVALID", `${prefix}.detail`));
        }
      });
      for (const required of requiredReviewChecks) {
        if (!ids.has(required)) issues.push(issue("ART_WEB_PBR_REQUIRED_REVIEW_CHECK_MISSING", "$.review.checks"));
      }
    }
  }

  const consumerReview = record(root.consumerReview);
  if (!consumerReview) {
    issues.push(issue("ART_WEB_PBR_CONSUMER_REVIEW_INVALID", "$.consumerReview"));
  } else {
    exactKeys(consumerReview, ["materialLabDryWetRequired", "independentVisualApprovalRequired"], "$.consumerReview", issues);
    if (consumerReview.materialLabDryWetRequired !== true) {
      issues.push(issue("ART_WEB_PBR_MATERIAL_LAB_REVIEW_REQUIRED", "$.consumerReview.materialLabDryWetRequired"));
    }
    if (consumerReview.independentVisualApprovalRequired !== true) {
      issues.push(issue("ART_WEB_PBR_INDEPENDENT_REVIEW_REQUIRED", "$.consumerReview.independentVisualApprovalRequired"));
    }
  }

  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function assertWebPbrTextureSet(document: unknown): asserts document is WebPbrTextureSet {
  const result = validateWebPbrTextureSet(document);
  if (!result.valid) {
    throw new Error(`ART_WEB_PBR_TEXTURE_SET_INVALID:${result.issues.map((entry) => entry.code).join(",")}`);
  }
}
