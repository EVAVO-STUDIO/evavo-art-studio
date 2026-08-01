import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { isAudioDeliveryProfileId, resolveAudioDeliveryProfile } from "./profiles.js";
import {
  AUDIO_DELIVERY_SCHEMA,
  AudioDeliveryError,
  type AudioBatchManifest,
  type AudioBatchManifestItem,
  type AudioLoopPolicy,
} from "./types.js";

const MAXIMUM_ITEMS = 2_000;
const MAXIMUM_JSON_BYTES = 4 * 1024 * 1024;
const MAXIMUM_SOURCE_BYTES = 256 * 1024 * 1024;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_OBJECT_REQUIRED",
      `${label} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum = 2048): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    /[\0\r\n]/u.test(value)
  ) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_TEXT_INVALID",
      `${label} is missing or invalid.`,
    );
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  const candidate = text(value, label, 128);
  if (!IDENTIFIER.test(candidate)) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_IDENTIFIER_INVALID",
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
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_INTEGER_INVALID",
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function portable(value: unknown, label: string): string {
  const candidate = text(value, label, 1024);
  if (candidate.includes("\\") || path.posix.isAbsolute(candidate)) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_PATH_INVALID",
      `${label} must use a portable relative path.`,
    );
  }
  const normalized = path.posix.normalize(candidate);
  if (
    normalized !== candidate ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized !== normalized.normalize("NFC")
  ) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_PATH_INVALID",
      `${label} is not canonical NFC.`,
    );
  }
  return candidate;
}

function loopPolicy(value: unknown, label: string): AudioLoopPolicy {
  const record = object(value, label);
  if (typeof record.enabled !== "boolean") {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_LOOP_INVALID",
      `${label}.enabled must be boolean.`,
    );
  }
  if (record.beginSamples === undefined) {
    return Object.freeze({ enabled: record.enabled });
  }
  return Object.freeze({
    enabled: record.enabled,
    beginSamples: integer(
      record.beginSamples,
      `${label}.beginSamples`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
  });
}

function item(value: unknown, index: number): AudioBatchManifestItem {
  const record = object(value, `items[${index}]`);
  const profileId = text(record.profileId, `items[${index}].profileId`, 128);
  if (!isAudioDeliveryProfileId(profileId)) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_PROFILE_UNKNOWN",
      `Unknown audio delivery profile: ${profileId}.`,
    );
  }
  const sourceSha256 = text(record.sourceSha256, `items[${index}].sourceSha256`, 64);
  if (!SHA256.test(sourceSha256)) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_SHA256_INVALID",
      `items[${index}].sourceSha256 must be lowercase SHA-256.`,
    );
  }
  const targetPath = portable(record.targetPath, `items[${index}].targetPath`);
  const extension = `.${resolveAudioDeliveryProfile(profileId).outputFormat}`;
  if (path.posix.extname(targetPath).toLowerCase() !== extension) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_EXTENSION_MISMATCH",
      `${targetPath} must end with ${extension}.`,
    );
  }
  return Object.freeze({
    id: identifier(record.id, `items[${index}].id`),
    sourcePath: portable(record.sourcePath, `items[${index}].sourcePath`),
    targetPath,
    sourceSha256,
    sourceBytes: integer(
      record.sourceBytes,
      `items[${index}].sourceBytes`,
      1,
      MAXIMUM_SOURCE_BYTES,
    ),
    profileId,
    loop: loopPolicy(record.loop, `items[${index}].loop`),
  });
}

export function validateAudioBatchManifest(value: unknown): AudioBatchManifest {
  const record = object(value, "manifest");
  if (record.schema !== AUDIO_DELIVERY_SCHEMA) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_SCHEMA_INVALID",
      `Manifest must use ${AUDIO_DELIVERY_SCHEMA}.`,
    );
  }
  if (!Array.isArray(record.items) || record.items.length < 1) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_ITEMS_REQUIRED",
      "Manifest requires at least one item.",
    );
  }
  if (record.items.length > MAXIMUM_ITEMS) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_ITEMS_EXCESSIVE",
      `Manifest exceeds ${MAXIMUM_ITEMS} items.`,
    );
  }
  const items = record.items.map(item);
  const ids = new Set<string>();
  const targets = new Set<string>();
  for (const current of items) {
    if (ids.has(current.id)) {
      throw new AudioDeliveryError(
        "AUDIO_MANIFEST_ID_DUPLICATE",
        `Duplicate item id: ${current.id}.`,
      );
    }
    ids.add(current.id);
    const folded = current.targetPath
      .normalize("NFC")
      .toLocaleLowerCase("en-US");
    if (targets.has(folded)) {
      throw new AudioDeliveryError(
        "AUDIO_MANIFEST_TARGET_COLLISION",
        `Case or Unicode target collision: ${current.targetPath}.`,
      );
    }
    targets.add(folded);
  }
  const project = object(record.project, "project");
  return Object.freeze({
    schema: AUDIO_DELIVERY_SCHEMA,
    batchId: identifier(record.batchId, "batchId"),
    project: Object.freeze({
      id: identifier(project.id, "project.id"),
      title: text(project.title, "project.title", 512),
      ...(project.engine === undefined
        ? {}
        : { engine: text(project.engine, "project.engine", 128) }),
      ...(project.engineVersion === undefined
        ? {}
        : {
            engineVersion: text(
              project.engineVersion,
              "project.engineVersion",
              128,
            ),
          }),
    }),
    items: Object.freeze(items),
  });
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

export function audioBatchSha256(value: AudioBatchManifest): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function readAudioBatchManifest(filename: string): AudioBatchManifest {
  const bytes = fs.readFileSync(path.resolve(filename));
  if (bytes.byteLength < 2 || bytes.byteLength > MAXIMUM_JSON_BYTES) {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_SIZE_INVALID",
      `Manifest must contain 2 to ${MAXIMUM_JSON_BYTES} bytes.`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AudioDeliveryError(
      "AUDIO_MANIFEST_JSON_INVALID",
      "Manifest is not strict UTF-8 JSON.",
    );
  }
  return validateAudioBatchManifest(value);
}
