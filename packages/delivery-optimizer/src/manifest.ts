import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { isDeliveryProfileId, resolveDeliveryImageProfile } from "./profiles.js";
import {
  DELIVERY_OPTIMIZER_SCHEMA,
  DeliveryOptimizerError,
  type DeliveryBackgroundPolicy,
  type DeliveryBatchManifest,
  type DeliveryBatchManifestItem,
} from "./types.js";

const MAXIMUM_ITEMS = 1_000;
const MAXIMUM_SOURCE_BYTES = 512 * 1024 * 1024;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, label: string, maximum = 2048): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    /[\r\n\0]/u.test(value)
  ) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_TEXT_INVALID",
      `${label} is missing or invalid.`,
    );
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  const candidate = text(value, label, 128);
  if (!IDENTIFIER.test(candidate)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_IDENTIFIER_INVALID",
      `${label} must match ${IDENTIFIER.source}.`,
    );
  }
  return candidate;
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_INTEGER_INVALID",
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function canonicalPath(value: unknown, label: string): string {
  const candidate = text(value, label, 1024);
  if (candidate.includes("\\")) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_PATH_INVALID",
      `${label} must use forward slashes.`,
    );
  }
  const parsed = path.posix.normalize(candidate);
  if (
    parsed !== candidate ||
    parsed === "." ||
    parsed.startsWith("/") ||
    parsed === ".." ||
    parsed.startsWith("../") ||
    parsed.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_PATH_INVALID",
      `${label} is not a canonical repository-relative path.`,
    );
  }
  return candidate;
}

function finiteOption(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_NUMBER_INVALID",
      `${label} must be finite and between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function backgroundPolicy(
  value: unknown,
  label: string,
): DeliveryBackgroundPolicy {
  if (!isRecord(value)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_BACKGROUND_INVALID",
      `${label} must be an object.`,
    );
  }
  if (value.mode === "preserve") return { mode: "preserve" };
  if (value.mode !== "remove-border-matte") {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_BACKGROUND_INVALID",
      `${label}.mode must be preserve or remove-border-matte.`,
    );
  }
  const matteColour = text(
    value.matteColour,
    `${label}.matteColour`,
    7,
  ).toLowerCase();
  if (!/^#[0-9a-f]{6}$/u.test(matteColour)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_BACKGROUND_INVALID",
      `${label}.matteColour must use #RRGGBB.`,
    );
  }
  const connectionDistance = finiteOption(
    value.connectionDistance,
    `${label}.connectionDistance`,
    1,
    441,
  );
  const opaqueSeedDistance = finiteOption(
    value.opaqueSeedDistance,
    `${label}.opaqueSeedDistance`,
    1,
    441,
  );
  const edgeSearchRadius = finiteOption(
    value.edgeSearchRadius,
    `${label}.edgeSearchRadius`,
    1,
    64,
  );
  const bleedRadius = finiteOption(
    value.bleedRadius,
    `${label}.bleedRadius`,
    0,
    32,
  );
  const minimumBorderMatteFraction = finiteOption(
    value.minimumBorderMatteFraction,
    `${label}.minimumBorderMatteFraction`,
    0.05,
    1,
  );
  return {
    mode: "remove-border-matte",
    matteColour,
    ...(connectionDistance === undefined ? {} : { connectionDistance }),
    ...(opaqueSeedDistance === undefined ? {} : { opaqueSeedDistance }),
    ...(edgeSearchRadius === undefined ? {} : { edgeSearchRadius }),
    ...(bleedRadius === undefined ? {} : { bleedRadius }),
    ...(minimumBorderMatteFraction === undefined
      ? {}
      : { minimumBorderMatteFraction }),
  };
}

function manifestItem(value: unknown, index: number): DeliveryBatchManifestItem {
  const label = `items[${index}]`;
  if (!isRecord(value)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_ITEM_INVALID",
      `${label} must be an object.`,
    );
  }
  const profileId = text(value.profileId, `${label}.profileId`, 128);
  if (!isDeliveryProfileId(profileId)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_PROFILE_UNKNOWN",
      `${label}.profileId is not a governed delivery profile: ${profileId}.`,
    );
  }
  const sourceSha256 = text(value.sourceSha256, `${label}.sourceSha256`, 64);
  if (!SHA256.test(sourceSha256)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_SHA256_INVALID",
      `${label}.sourceSha256 must be lowercase SHA-256.`,
    );
  }
  const targetPath = canonicalPath(value.targetPath, `${label}.targetPath`);
  const expectedExtension = `.${resolveDeliveryImageProfile(profileId).outputFormat}`;
  if (path.posix.extname(targetPath).toLowerCase() !== expectedExtension) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_EXTENSION_MISMATCH",
      `${label}.targetPath must end with ${expectedExtension} for ${profileId}.`,
    );
  }
  return {
    id: identifier(value.id, `${label}.id`),
    sourcePath: canonicalPath(value.sourcePath, `${label}.sourcePath`),
    targetPath,
    sourceSha256,
    sourceBytes: integer(
      value.sourceBytes,
      `${label}.sourceBytes`,
      1,
      MAXIMUM_SOURCE_BYTES,
    ),
    profileId,
    background: backgroundPolicy(value.background, `${label}.background`),
  };
}

function project(value: unknown): DeliveryBatchManifest["project"] {
  if (!isRecord(value)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_PROJECT_INVALID",
      "project must be an object.",
    );
  }
  const viewport = value.viewport;
  return {
    id: identifier(value.id, "project.id"),
    title: text(value.title, "project.title", 512),
    ...(value.engine === undefined
      ? {}
      : { engine: text(value.engine, "project.engine", 128) }),
    ...(value.engineVersion === undefined
      ? {}
      : {
          engineVersion: text(
            value.engineVersion,
            "project.engineVersion",
            128,
          ),
        }),
    ...(value.rendering === undefined
      ? {}
      : { rendering: text(value.rendering, "project.rendering", 256) }),
    ...(viewport === undefined
      ? {}
      : {
          viewport: (() => {
            if (!isRecord(viewport)) {
              throw new DeliveryOptimizerError(
                "DELIVERY_MANIFEST_PROJECT_INVALID",
                "project.viewport must be an object.",
              );
            }
            return {
              width: integer(
                viewport.width,
                "project.viewport.width",
                1,
                32768,
              ),
              height: integer(
                viewport.height,
                "project.viewport.height",
                1,
                32768,
              ),
            };
          })(),
        }),
  };
}

export function validateDeliveryBatchManifest(
  value: unknown,
): DeliveryBatchManifest {
  if (!isRecord(value) || value.schema !== DELIVERY_OPTIMIZER_SCHEMA) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_SCHEMA_INVALID",
      `Manifest must use ${DELIVERY_OPTIMIZER_SCHEMA}.`,
    );
  }
  if (!Array.isArray(value.items) || value.items.length < 1) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_ITEMS_REQUIRED",
      "Manifest must contain at least one item.",
    );
  }
  if (value.items.length > MAXIMUM_ITEMS) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_ITEMS_EXCESSIVE",
      `Manifest exceeds ${MAXIMUM_ITEMS} items.`,
    );
  }
  const items = value.items.map(manifestItem);
  const ids = new Set<string>();
  const targets = new Set<string>();
  const foldedTargets = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) {
      throw new DeliveryOptimizerError(
        "DELIVERY_MANIFEST_ID_DUPLICATE",
        `Duplicate manifest item id: ${item.id}.`,
      );
    }
    ids.add(item.id);
    if (targets.has(item.targetPath)) {
      throw new DeliveryOptimizerError(
        "DELIVERY_MANIFEST_TARGET_DUPLICATE",
        `Duplicate target path: ${item.targetPath}.`,
      );
    }
    targets.add(item.targetPath);
    const folded = item.targetPath.normalize("NFC").toLocaleLowerCase("en-US");
    if (foldedTargets.has(folded)) {
      throw new DeliveryOptimizerError(
        "DELIVERY_MANIFEST_TARGET_COLLISION",
        `Case or Unicode target collision: ${item.targetPath}.`,
      );
    }
    foldedTargets.add(folded);
  }
  return {
    schema: DELIVERY_OPTIMIZER_SCHEMA,
    batchId: identifier(value.batchId, "batchId"),
    project: project(value.project),
    items: Object.freeze(items),
  };
}

export function canonicalDeliveryJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalDeliveryJson).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalDeliveryJson(record[key])}`)
    .join(",")}}`;
}

export function deliveryBatchSha256(value: DeliveryBatchManifest): string {
  return createHash("sha256")
    .update(canonicalDeliveryJson(value))
    .digest("hex");
}

export async function readDeliveryBatchManifest(
  manifestPath: string,
): Promise<DeliveryBatchManifest> {
  const bytes = await readFile(path.resolve(manifestPath));
  if (bytes.byteLength < 2 || bytes.byteLength > 4 * 1024 * 1024) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_SIZE_INVALID",
      "Manifest must contain between 2 bytes and 4 MiB.",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new DeliveryOptimizerError(
      "DELIVERY_MANIFEST_JSON_INVALID",
      "Manifest is not valid strict UTF-8 JSON.",
    );
  }
  return validateDeliveryBatchManifest(value);
}
