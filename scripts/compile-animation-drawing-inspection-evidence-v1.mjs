#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const DRAWING_EVIDENCE_SCHEMA =
  "evavo.animation-drawing-inspection-evidence.v1";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const ARTIFACT_ID = /^artifact_[0-9a-f]{64}$/u;
const SCORE_FIELDS = Object.freeze([
  "identity",
  "style",
  "silhouette",
  "camera",
  "anatomy",
  "palette",
  "motionReadability",
]);
const AUTHORITY = Object.freeze({
  providerExecution: false,
  automaticCreativeApproval: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  publication: false,
});

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

export function animationDrawingEvidenceSha256(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code, String(value));
  return value;
}

function digest(value, code) {
  if (typeof value !== "string" || !DIGEST.test(value)) fail(code, String(value));
  return value;
}

function artifactId(value, code) {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(code, String(value));
  }
  return value;
}

function integer(value, code, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(code, String(value));
  }
  return value;
}

function score(value, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(code, String(value));
  }
  return value;
}

function text(value, code, maximum = 4096) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum
  ) {
    fail(code);
  }
  return value.trim();
}

function timestamp(value, code) {
  if (typeof value !== "string") fail(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(code, String(value));
  }
  return value;
}

function normalizeFinding(value, index) {
  const finding = object(value, `ANIMATION_DRAWING_EVIDENCE_FINDING_INVALID:${index}`);
  return Object.freeze({
    code: safeId(
      finding.code,
      `ANIMATION_DRAWING_EVIDENCE_FINDING_CODE_INVALID:${index}`,
    ),
    severity: ["minor", "major", "blocking"].includes(finding.severity)
      ? finding.severity
      : fail(
          `ANIMATION_DRAWING_EVIDENCE_FINDING_SEVERITY_INVALID:${index}`,
        ),
    message: text(
      finding.message,
      `ANIMATION_DRAWING_EVIDENCE_FINDING_MESSAGE_INVALID:${index}`,
    ),
    remediation: text(
      finding.remediation,
      `ANIMATION_DRAWING_EVIDENCE_FINDING_REMEDIATION_INVALID:${index}`,
    ),
  });
}

function normalizeEvidence(value, lineage) {
  const evidence = object(value, "ANIMATION_DRAWING_EVIDENCE_PAYLOAD_INVALID");
  if (
    evidence.drawingId !== lineage.drawingId ||
    evidence.artifactId !== lineage.artifactId ||
    evidence.contentDigest !== lineage.contentDigest ||
    evidence.attempt !== lineage.attempt
  ) {
    fail("ANIMATION_DRAWING_EVIDENCE_PAYLOAD_LINEAGE_MISMATCH");
  }
  const scores = object(
    evidence.scores,
    "ANIMATION_DRAWING_EVIDENCE_SCORES_INVALID",
  );
  const normalizedScores = {};
  for (const field of SCORE_FIELDS) {
    normalizedScores[field] = score(
      scores[field],
      `ANIMATION_DRAWING_EVIDENCE_SCORE_INVALID:${field}`,
    );
  }
  if (typeof evidence.meaningfulAlpha !== "boolean") {
    fail("ANIMATION_DRAWING_EVIDENCE_ALPHA_INVALID");
  }
  return Object.freeze({
    drawingId: lineage.drawingId,
    artifactId: lineage.artifactId,
    contentDigest: lineage.contentDigest,
    attempt: lineage.attempt,
    width: integer(evidence.width, "ANIMATION_DRAWING_EVIDENCE_WIDTH_INVALID", 1, 8192),
    height: integer(evidence.height, "ANIMATION_DRAWING_EVIDENCE_HEIGHT_INVALID", 1, 8192),
    meaningfulAlpha: evidence.meaningfulAlpha,
    unsafeEdgeContactPixels: integer(
      evidence.unsafeEdgeContactPixels,
      "ANIMATION_DRAWING_EVIDENCE_EDGE_CONTACT_INVALID",
      0,
      evidence.width * evidence.height,
    ),
    scores: Object.freeze(normalizedScores),
    findings: Object.freeze(
      (Array.isArray(evidence.findings) ? evidence.findings : fail(
        "ANIMATION_DRAWING_EVIDENCE_FINDINGS_INVALID",
      )).map(normalizeFinding),
    ),
  });
}

function evidenceBody(value) {
  const { evidenceDigest: _evidenceDigest, ...body } = value;
  return body;
}

export function compileAnimationDrawingInspectionEvidence(
  input,
  now = new Date(),
) {
  const value = object(input, "ANIMATION_DRAWING_EVIDENCE_INPUT_INVALID");
  const lineage = {
    productionId: safeId(
      value.productionId,
      "ANIMATION_DRAWING_EVIDENCE_PRODUCTION_ID_INVALID",
    ),
    profileDigest: digest(
      value.profileDigest,
      "ANIMATION_DRAWING_EVIDENCE_PROFILE_DIGEST_INVALID",
    ),
    ledgerDigest: digest(
      value.ledgerDigest,
      "ANIMATION_DRAWING_EVIDENCE_LEDGER_DIGEST_INVALID",
    ),
    workOrderDigest: digest(
      value.workOrderDigest,
      "ANIMATION_DRAWING_EVIDENCE_WORK_ORDER_DIGEST_INVALID",
    ),
    drawingId: safeId(
      value.drawingId,
      "ANIMATION_DRAWING_EVIDENCE_DRAWING_ID_INVALID",
    ),
    attempt: integer(
      value.attempt,
      "ANIMATION_DRAWING_EVIDENCE_ATTEMPT_INVALID",
      1,
      100,
    ),
    artifactId: artifactId(
      value.artifactId,
      "ANIMATION_DRAWING_EVIDENCE_ARTIFACT_ID_INVALID",
    ),
    contentDigest: digest(
      value.contentDigest,
      "ANIMATION_DRAWING_EVIDENCE_CONTENT_DIGEST_INVALID",
    ),
  };
  const reviewedAt = value.reviewedAt === undefined
    ? now.toISOString()
    : timestamp(value.reviewedAt, "ANIMATION_DRAWING_EVIDENCE_REVIEWED_AT_INVALID");
  const body = {
    schema: DRAWING_EVIDENCE_SCHEMA,
    ...lineage,
    reviewerRole: "art-studio-supervisor",
    reviewerId: safeId(
      value.reviewerId,
      "ANIMATION_DRAWING_EVIDENCE_REVIEWER_ID_INVALID",
    ),
    reviewedAt,
    evidence: normalizeEvidence(value.evidence, lineage),
    authority: AUTHORITY,
  };
  return Object.freeze({
    ...body,
    evidenceDigest: animationDrawingEvidenceSha256(body),
  });
}

export function assertAnimationDrawingInspectionEvidenceIntegrity(value) {
  const record = object(value, "ANIMATION_DRAWING_EVIDENCE_INVALID");
  if (record.schema !== DRAWING_EVIDENCE_SCHEMA) {
    fail("ANIMATION_DRAWING_EVIDENCE_SCHEMA_INVALID");
  }
  digest(
    record.evidenceDigest,
    "ANIMATION_DRAWING_EVIDENCE_DIGEST_INVALID",
  );
  const expected = compileAnimationDrawingInspectionEvidence(
    record,
    new Date(timestamp(record.reviewedAt, "ANIMATION_DRAWING_EVIDENCE_TIME_INVALID")),
  );
  if (JSON.stringify(expected) !== JSON.stringify(record)) {
    fail("ANIMATION_DRAWING_EVIDENCE_INTEGRITY_MISMATCH");
  }
  return true;
}

function contained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function realDirectory(input) {
  if (typeof input !== "string" || !isAbsolute(input) || input.includes("\0")) {
    fail("ANIMATION_DRAWING_EVIDENCE_WORKSPACE_INVALID");
  }
  const root = await realpath(resolve(input));
  const state = await lstat(root);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    fail("ANIMATION_DRAWING_EVIDENCE_WORKSPACE_INVALID");
  }
  return root;
}

export async function writeAnimationDrawingInspectionEvidence(input) {
  const value = object(input, "ANIMATION_DRAWING_EVIDENCE_WRITE_INPUT_INVALID");
  const root = await realDirectory(value.workspaceRoot);
  const record = compileAnimationDrawingInspectionEvidence(value);
  const output = resolve(
    root,
    "evidence",
    "inbox",
    "drawings",
    `${record.drawingId}-attempt-${record.attempt}.json`,
  );
  if (!contained(root, output)) fail("ANIMATION_DRAWING_EVIDENCE_OUTPUT_INVALID");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return Object.freeze({
    status: "written",
    drawingId: record.drawingId,
    attempt: record.attempt,
    evidenceDigest: record.evidenceDigest,
    outputRelativePath: relative(root, output).split("\\").join("/"),
    authority: AUTHORITY,
  });
}

async function cli() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!command || !inputPath || !["compile", "verify", "write"].includes(command)) {
    fail(
      "ANIMATION_DRAWING_EVIDENCE_USAGE",
      "node scripts/compile-animation-drawing-inspection-evidence-v1.mjs <compile|verify|write> <input.json> [output.json]",
    );
  }
  const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const result = command === "compile"
    ? compileAnimationDrawingInspectionEvidence(input)
    : command === "verify"
      ? (assertAnimationDrawingInspectionEvidenceIntegrity(input), {
          status: "verified",
          evidenceDigest: input.evidenceDigest,
          authority: AUTHORITY,
        })
      : await writeAnimationDrawingInspectionEvidence(input);
  const body = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) {
    await writeFile(resolve(outputPath), body, { encoding: "utf8", flag: "wx" });
  } else process.stdout.write(body);
}

if (
  (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "") ===
  import.meta.url
) {
  cli().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        authority: AUTHORITY,
      })}\n`,
    );
    process.exitCode = 1;
  });
}
