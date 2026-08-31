#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const SOURCE_SCHEMA = "evavo.animation-drawing-inspection-evidence.v1";
const RESULT_SCHEMA = "evavo.animation-drawing-inspection-result.v1";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAXIMUM_EVIDENCE_BYTES = 4 * 1024 * 1024;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function hash(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function contained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function evidenceBody(value) {
  const { evidenceDigest: _evidenceDigest, ...body } = value;
  return body;
}

async function readEvidence(workspaceRoot, drawingId, attempt) {
  if (typeof workspaceRoot !== "string" || !isAbsolute(workspaceRoot)) {
    fail("ANIMATION_DRAWING_INSPECTION_WORKSPACE_INVALID");
  }
  const root = await realpath(resolve(workspaceRoot));
  const path = resolve(
    root,
    "evidence",
    "inbox",
    "drawings",
    `${drawingId}-attempt-${attempt}.json`,
  );
  if (!contained(root, path)) fail("ANIMATION_DRAWING_INSPECTION_PATH_INVALID");
  let state;
  try {
    state = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (!state.isFile() || state.isSymbolicLink() || state.size > MAXIMUM_EVIDENCE_BYTES) {
    fail("ANIMATION_DRAWING_INSPECTION_FILE_INVALID");
  }
  const physical = await realpath(path);
  if (!contained(root, physical)) fail("ANIMATION_DRAWING_INSPECTION_PATH_INVALID");
  let value;
  try {
    value = JSON.parse((await readFile(path, "utf8")));
  } catch {
    fail("ANIMATION_DRAWING_INSPECTION_JSON_INVALID");
  }
  return value;
}

function validateEvidence(value, input) {
  const source = object(value, "ANIMATION_DRAWING_INSPECTION_EVIDENCE_INVALID");
  if (source.schema !== SOURCE_SCHEMA) {
    fail("ANIMATION_DRAWING_INSPECTION_EVIDENCE_SCHEMA_INVALID");
  }
  if (typeof source.evidenceDigest !== "string" || !DIGEST.test(source.evidenceDigest)) {
    fail("ANIMATION_DRAWING_INSPECTION_EVIDENCE_DIGEST_INVALID");
  }
  if (hash(evidenceBody(source)) !== source.evidenceDigest) {
    fail("ANIMATION_DRAWING_INSPECTION_EVIDENCE_DIGEST_MISMATCH");
  }
  if (
    source.productionId !== input.productionId ||
    source.profileDigest !== input.profileDigest ||
    source.ledgerDigest !== input.ledgerDigest ||
    source.workOrderDigest !== input.workOrder.workOrderDigest ||
    source.drawingId !== input.workOrder.drawingId ||
    source.attempt !== input.workOrder.attempt ||
    source.artifactId !== input.candidate.artifactId ||
    source.contentDigest !== input.candidate.contentDigest
  ) {
    fail("ANIMATION_DRAWING_INSPECTION_EVIDENCE_LINEAGE_MISMATCH");
  }
  if (source.reviewerRole !== "art-studio-supervisor") {
    fail("ANIMATION_DRAWING_INSPECTION_REVIEWER_ROLE_INVALID");
  }
  object(source.evidence, "ANIMATION_DRAWING_INSPECTION_PAYLOAD_INVALID");
  return source.evidence;
}

export async function consumeArtDrawingInspectionEvidence(input, runtime) {
  object(input, "ANIMATION_DRAWING_INSPECTION_INPUT_INVALID");
  object(runtime, "ANIMATION_DRAWING_INSPECTION_RUNTIME_INVALID");
  if (input.phase !== "drawing-inspector") {
    fail("ANIMATION_DRAWING_INSPECTION_PHASE_INVALID");
  }
  const source = await readEvidence(
    runtime.workspaceRoot,
    input.workOrder.drawingId,
    input.workOrder.attempt,
  );
  if (!source) {
    return {
      schema: RESULT_SCHEMA,
      status: "unavailable",
      workOrderDigest: input.workOrder.workOrderDigest,
      reason:
        "Exact art-studio-supervisor drawing evidence is not present for this candidate attempt. No visual score was fabricated.",
      evidenceKey: `${input.workOrder.drawingId}:attempt-${input.workOrder.attempt}`,
    };
  }
  const evidence = validateEvidence(source, input);
  return {
    schema: RESULT_SCHEMA,
    status: "inspected",
    workOrderDigest: input.workOrder.workOrderDigest,
    evidence,
  };
}
