import { createHash } from "node:crypto";

import {
  ASEPRITE_INTERCHANGE_PLAN_KIND,
  ASEPRITE_INTERCHANGE_PLAN_VERSION,
  compileAsepriteInterchangePlan,
  type AsepriteInterchangePlan,
} from "./aseprite-interchange.js";

export const ASEPRITE_INTERCHANGE_RECEIPT_VERSION = "2026-08-25.2" as const;
export const ASEPRITE_INTERCHANGE_RECEIPT_KIND =
  "evavo.aseprite-interchange.receipt" as const;

export interface AsepriteInterchangeOutputEvidence {
  readonly executable: Readonly<{
    path: string;
    version: string;
    sha256: string;
  }>;
  readonly sourceSha256: string;
  readonly sheet: Readonly<{
    path: string;
    bytes: Uint8Array;
  }>;
  readonly data: Readonly<{
    path: string;
    bytes: Uint8Array;
  }>;
  readonly exitCode: number;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
}

export interface AsepriteInterchangeReceipt {
  readonly kind: typeof ASEPRITE_INTERCHANGE_RECEIPT_KIND;
  readonly version: typeof ASEPRITE_INTERCHANGE_RECEIPT_VERSION;
  readonly planSha256: string;
  readonly sourceSha256: string;
  readonly executable: AsepriteInterchangePlan["executable"];
  readonly outputs: Readonly<{
    sheet: Readonly<{ path: string; sha256: string; bytes: number }>;
    data: Readonly<{ path: string; sha256: string; bytes: number }>;
  }>;
  readonly frames: readonly Readonly<{
    filename: string;
    durationMs: number;
  }>[];
  readonly frameTags: readonly Readonly<{
    name: string;
    from: number;
    to: number;
    direction?: string;
  }>[];
  readonly slices: readonly Readonly<{
    name: string;
  }>[];
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly receiptSha256: string;
  readonly authority: Readonly<{
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

const SHA256 = /^[a-f0-9]{64}$/;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function fail(message: string): never {
  throw new Error(`Aseprite interchange result invalid: ${message}`);
}

function sha(value: unknown, field: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${field} must be 64 lowercase hexadecimal characters.`);
  }
  return value;
}

function text(value: unknown, field: string, maximum = 2048): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    fail(`${field} must be a non-empty safe string.`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    fail(`${field} must be a positive integer.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail(`${field} must be a non-negative integer.`);
  }
  return value;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function exactBytes(value: unknown, field: string, maximum: number): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength < 1) {
    fail(`${field} must be non-empty bytes.`);
  }
  if (value.byteLength > maximum) fail(`${field} exceeds the bounded byte limit.`);
  return value;
}

function bytesSha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalPlan(plan: AsepriteInterchangePlan): AsepriteInterchangePlan {
  if (
    !plan ||
    typeof plan !== "object" ||
    plan.kind !== ASEPRITE_INTERCHANGE_PLAN_KIND ||
    plan.version !== ASEPRITE_INTERCHANGE_PLAN_VERSION
  ) {
    fail("plan kind/version is unsupported.");
  }
  const args = plan.arguments;
  const tagIndex = args.indexOf("--tag");
  const sourceIndex = args.indexOf(plan.source.path);
  const rebuilt = compileAsepriteInterchangePlan({
    executable: plan.executable,
    sourcePath: plan.source.path,
    sourceSha256: plan.source.sha256,
    sheetPath: plan.outputs.sheetPath,
    dataPath: plan.outputs.dataPath,
    sheetType: args[args.indexOf("--sheet-type") + 1] as
      | "horizontal"
      | "vertical"
      | "rows"
      | "columns"
      | "packed",
    ...(tagIndex >= 0 && tagIndex + 1 < sourceIndex
      ? { tag: args[tagIndex + 1] }
      : {}),
    borderPadding: Number(args[args.indexOf("--border-padding") + 1]),
    shapePadding: Number(args[args.indexOf("--shape-padding") + 1]),
    innerPadding: Number(args[args.indexOf("--inner-padding") + 1]),
    trim: args.includes("--trim"),
    extrude: args.includes("--extrude"),
    mergeDuplicates: args.includes("--merge-duplicates"),
  });
  if (stable(rebuilt) !== stable(plan)) {
    fail("plan is not canonical or was mutated after compilation.");
  }
  return rebuilt;
}

function parseFrames(value: unknown): readonly { filename: string; durationMs: number }[] {
  if (!Array.isArray(value) || value.length < 1) {
    fail("data.json.frames must be a non-empty array for json-array export.");
  }
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const frame = object(raw, `data.json.frames[${index}]`);
    const filename = text(frame.filename, `data.json.frames[${index}].filename`, 1024);
    if (seen.has(filename)) fail(`duplicate frame filename ${filename}.`);
    seen.add(filename);
    const durationMs = positiveInteger(
      frame.duration,
      `data.json.frames[${index}].duration`,
    );
    return { filename, durationMs };
  });
}

function parseTags(value: unknown): readonly {
  name: string;
  from: number;
  to: number;
  direction?: string;
}[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("data.json.meta.frameTags must be an array.");
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const tag = object(raw, `data.json.meta.frameTags[${index}]`);
    const name = text(tag.name, `data.json.meta.frameTags[${index}].name`, 256);
    if (seen.has(name)) fail(`duplicate frame tag ${name}.`);
    seen.add(name);
    const from = nonNegativeInteger(tag.from, `data.json.meta.frameTags[${index}].from`);
    const to = nonNegativeInteger(tag.to, `data.json.meta.frameTags[${index}].to`);
    if (from > to) fail(`frame tag ${name} has an invalid range.`);
    const direction =
      tag.direction === undefined
        ? undefined
        : text(tag.direction, `data.json.meta.frameTags[${index}].direction`, 64);
    return { name, from, to, ...(direction ? { direction } : {}) };
  });
}

function parseSlices(value: unknown): readonly { name: string }[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("data.json.meta.slices must be an array.");
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const slice = object(raw, `data.json.meta.slices[${index}]`);
    const name = text(slice.name, `data.json.meta.slices[${index}].name`, 256);
    if (seen.has(name)) fail(`duplicate slice ${name}.`);
    seen.add(name);
    return { name };
  });
}

export function compileAsepriteInterchangeReceipt(
  submittedPlan: AsepriteInterchangePlan,
  evidence: AsepriteInterchangeOutputEvidence,
): AsepriteInterchangeReceipt {
  const plan = canonicalPlan(submittedPlan);
  if (!evidence || typeof evidence !== "object") fail("evidence must be an object.");
  if (evidence.exitCode !== 0) fail("Aseprite process did not exit successfully.");
  if (
    evidence.executable.path !== plan.executable.path ||
    evidence.executable.version !== plan.executable.version ||
    sha(evidence.executable.sha256, "evidence.executable.sha256") !==
      plan.executable.sha256
  ) {
    fail("observed executable identity differs from the planned executable.");
  }
  if (sha(evidence.sourceSha256, "evidence.sourceSha256") !== plan.source.sha256) {
    fail("observed source bytes differ from the planned source identity.");
  }
  if (evidence.sheet.path !== plan.outputs.sheetPath) {
    fail("sheet output path differs from the plan.");
  }
  if (evidence.data.path !== plan.outputs.dataPath) {
    fail("data output path differs from the plan.");
  }

  const sheetBytes = exactBytes(
    evidence.sheet.bytes,
    "evidence.sheet.bytes",
    512 * 1024 * 1024,
  );
  if (sheetBytes.byteLength < PNG_SIGNATURE.length) {
    fail("sheet output is too short to be a PNG.");
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (sheetBytes[index] !== PNG_SIGNATURE[index]) {
      fail("sheet output does not have a PNG signature.");
    }
  }
  const dataBytes = exactBytes(
    evidence.data.bytes,
    "evidence.data.bytes",
    64 * 1024 * 1024,
  );
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(dataBytes));
  } catch (error: unknown) {
    fail(
      `data output is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const dataObject = object(json, "data.json");
  const frames = parseFrames(dataObject.frames);
  const meta = object(dataObject.meta, "data.json.meta");
  const frameTags = parseTags(meta.frameTags);
  const slices = parseSlices(meta.slices);

  const plannedTagIndex = plan.arguments.indexOf("--tag");
  if (plannedTagIndex >= 0) {
    const plannedTag = plan.arguments[plannedTagIndex + 1]!;
    if (!frameTags.some((tag) => tag.name === plannedTag)) {
      fail(`planned tag ${plannedTag} is absent from exported metadata.`);
    }
  }

  const body = {
    kind: ASEPRITE_INTERCHANGE_RECEIPT_KIND,
    version: ASEPRITE_INTERCHANGE_RECEIPT_VERSION,
    planSha256: plan.planSha256,
    sourceSha256: plan.source.sha256,
    executable: plan.executable,
    outputs: {
      sheet: {
        path: plan.outputs.sheetPath,
        sha256: bytesSha256(sheetBytes),
        bytes: sheetBytes.byteLength,
      },
      data: {
        path: plan.outputs.dataPath,
        sha256: bytesSha256(dataBytes),
        bytes: dataBytes.byteLength,
      },
    },
    frames,
    frameTags,
    slices,
    stdoutSha256: sha(evidence.stdoutSha256, "evidence.stdoutSha256"),
    stderrSha256: sha(evidence.stderrSha256, "evidence.stderrSha256"),
    authority: {
      creativeApproval: false as const,
      artifactPromotion: false as const,
      repositoryMutation: false as const,
      publication: false as const,
    },
  };
  return { ...body, receiptSha256: digest(body) };
}
