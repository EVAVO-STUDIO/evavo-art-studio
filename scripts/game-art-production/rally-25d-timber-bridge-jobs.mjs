#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SPEC_SCHEMA = "evavo.rally-timber-bridge-visual-development.v1";
export const SESSION_SCHEMA = "evavo.rally-timber-bridge-provider-job-session.v1";
export const JOB_SCHEMA = "evavo.rally-timber-bridge-provider-job.v1";
export const PROTOCOL_VERSION = "2026-08-15.3";

const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;
const SPEC_KEYS = new Set([
  "schema", "protocolVersion", "assetId", "subjectId", "title", "style",
  "cameraLocks", "jobs", "output", "authority",
]);
const STYLE_KEYS = new Set([
  "projectionFamily", "designEra", "rendering", "structureLanguage",
  "palette", "surfaceLanguage", "forbidden",
]);
const CAMERA_KEYS = new Set([
  "heroYawDegrees", "heroPitchDegrees", "orthographicPitchDegrees",
  "topPlanPitchDegrees", "focalLengthMm", "consistentDeckWidth",
  "consistentSpanLength", "consistentSupportSpacing",
]);
const JOB_KEYS = new Set([
  "id", "role", "view", "phase", "width", "height", "transparent",
  "dependsOn", "include", "exclude",
]);
const OUTPUT_KEYS = new Set([
  "workingRoot", "masterRoot", "format", "oneImagePerJob",
  "retainIndividualSources", "automaticAssembly",
]);
const AUTHORITY_FALSE = [
  "providerExecution", "automaticGenerationAuthorization",
  "automaticCreativeApproval", "imageMutation", "automaticAssembly",
  "targetRepositoryMutation", "gitMutation", "deployment", "publication",
];
const REQUIRED_ROLES = new Set([
  "identity-master", "identity-continuity", "modular-modeling-reference",
  "runtime-shader-reference", "breakable-damage-reference",
]);

function fail(message) {
  throw new Error(`RALLY_TIMBER_BRIDGE_ART_JOBS_INVALID: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !expected.has(key)).sort();
  const missing = [...expected].filter((key) => !Object.hasOwn(value, key)).sort();
  if (unknown.length) fail(`${label} contains unsupported keys: ${unknown.join(", ")}.`);
  if (missing.length) fail(`${label} is missing keys: ${missing.join(", ")}.`);
}

function text(value, label, minimum = 1, maximum = 8000) {
  if (typeof value !== "string" || value.trim() !== value || value.length < minimum || value.length > maximum) {
    fail(`${label} must be a trimmed string with ${minimum}-${maximum} characters.`);
  }
  if ([...value].some((character) => character.charCodeAt(0) < 32)) {
    fail(`${label} contains control characters.`);
  }
  return value;
}

function identifier(value, label) {
  const result = text(value, label, 1, 180);
  if (!ID.test(result)) fail(`${label} must be lowercase kebab-case.`);
  return result;
}

function number(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${label} must be a finite number between ${minimum} and ${maximum}.`);
  }
  return value;
}

function bool(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be boolean.`);
  return value;
}

function stringArray(value, label, minimum = 0, maximum = 64) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${label} must contain ${minimum}-${maximum} strings.`);
  }
  const result = value.map((entry, index) => text(entry, `${label}[${index}]`, 1, 1000));
  if (new Set(result).size !== result.length) fail(`${label} contains duplicates.`);
  return result;
}

function safeRoot(value, label) {
  const root = text(value, label, 3, 500);
  if (root.startsWith("/") || root.includes("\\") || root.split("/").some((part) => ["", ".", ".."].includes(part))) {
    fail(`${label} must be a safe relative POSIX path.`);
  }
  return root;
}

function canonicalSort(value) {
  if (Array.isArray(value)) return value.map(canonicalSort);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalSort(value[key])]));
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalSort(value))}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function validateStyle(style) {
  exactKeys(style, STYLE_KEYS, "style");
  identifier(style.projectionFamily, "style.projectionFamily");
  identifier(style.designEra, "style.designEra");
  identifier(style.rendering, "style.rendering");
  text(style.structureLanguage, "style.structureLanguage", 40, 1400);
  const palette = stringArray(style.palette, "style.palette", 6, 16);
  palette.forEach((colour, index) => {
    if (!/^#[0-9a-fA-F]{6}$/u.test(colour)) fail(`style.palette[${index}] must be a six-digit hex colour.`);
  });
  stringArray(style.surfaceLanguage, "style.surfaceLanguage", 4, 16);
  stringArray(style.forbidden, "style.forbidden", 6, 32);
}

function validateCamera(camera) {
  exactKeys(camera, CAMERA_KEYS, "cameraLocks");
  number(camera.heroYawDegrees, "cameraLocks.heroYawDegrees", -180, 180);
  number(camera.heroPitchDegrees, "cameraLocks.heroPitchDegrees", 0, 89);
  number(camera.orthographicPitchDegrees, "cameraLocks.orthographicPitchDegrees", -5, 5);
  number(camera.topPlanPitchDegrees, "cameraLocks.topPlanPitchDegrees", 85, 95);
  number(camera.focalLengthMm, "cameraLocks.focalLengthMm", 35, 200);
  for (const key of ["consistentDeckWidth", "consistentSpanLength", "consistentSupportSpacing"]) {
    if (!bool(camera[key], `cameraLocks.${key}`)) fail(`cameraLocks.${key} must remain true.`);
  }
}

function validateOutput(output) {
  exactKeys(output, OUTPUT_KEYS, "output");
  safeRoot(output.workingRoot, "output.workingRoot");
  safeRoot(output.masterRoot, "output.masterRoot");
  if (output.format !== "png") fail("output.format must be png.");
  if (output.oneImagePerJob !== true || output.retainIndividualSources !== true || output.automaticAssembly !== false) {
    fail("output must retain one PNG per job and forbid automatic assembly.");
  }
}

function validateAuthority(authority) {
  exactKeys(authority, new Set([...AUTHORITY_FALSE, "namedHumanApprovalRequired"]), "authority");
  for (const key of AUTHORITY_FALSE) {
    if (authority[key] !== false) fail(`authority.${key} must remain false.`);
  }
  if (authority.namedHumanApprovalRequired !== true) fail("authority.namedHumanApprovalRequired must remain true.");
}

function topologicalJobs(jobs) {
  const byId = new Map(jobs.map((job, index) => [job.id, { job, index }]));
  const indegree = new Map(jobs.map((job) => [job.id, job.dependsOn.length]));
  const consumers = new Map(jobs.map((job) => [job.id, []]));
  for (const job of jobs) {
    for (const dependency of job.dependsOn) {
      if (!byId.has(dependency)) fail(`job ${job.id} references unknown dependency ${dependency}.`);
      if (dependency === job.id) fail(`job ${job.id} depends on itself.`);
      consumers.get(dependency).push(job.id);
    }
  }
  const ready = jobs.filter((job) => indegree.get(job.id) === 0).map((job) => job.id);
  ready.sort((a, b) => byId.get(a).index - byId.get(b).index || a.localeCompare(b));
  const ordered = [];
  while (ready.length) {
    const current = ready.shift();
    ordered.push(byId.get(current).job);
    for (const consumer of consumers.get(current)) {
      indegree.set(consumer, indegree.get(consumer) - 1);
      if (indegree.get(consumer) === 0) {
        ready.push(consumer);
        ready.sort((a, b) => byId.get(a).index - byId.get(b).index || a.localeCompare(b));
      }
    }
  }
  if (ordered.length !== jobs.length) fail("job dependency graph contains a cycle.");
  return ordered;
}

export function validateTimberBridgeSpec(input) {
  const source = structuredClone(input);
  exactKeys(source, SPEC_KEYS, "spec");
  if (source.schema !== SPEC_SCHEMA || source.protocolVersion !== PROTOCOL_VERSION) fail("spec identity drifted.");
  identifier(source.assetId, "assetId");
  identifier(source.subjectId, "subjectId");
  text(source.title, "title", 3, 300);
  validateStyle(source.style);
  validateCamera(source.cameraLocks);
  validateOutput(source.output);
  validateAuthority(source.authority);
  if (!Array.isArray(source.jobs) || source.jobs.length !== 10) fail("jobs must contain exactly ten one-image jobs.");
  const ids = new Set();
  const jobs = source.jobs.map((raw, index) => {
    exactKeys(raw, JOB_KEYS, `jobs[${index}]`);
    const jobId = identifier(raw.id, `jobs[${index}].id`);
    if (ids.has(jobId)) fail(`duplicate job id ${jobId}.`);
    ids.add(jobId);
    const role = identifier(raw.role, `jobs[${index}].role`);
    const view = identifier(raw.view, `jobs[${index}].view`);
    const phase = identifier(raw.phase, `jobs[${index}].phase`);
    for (const dimension of ["width", "height"]) {
      if (!Number.isInteger(raw[dimension]) || raw[dimension] < 512 || raw[dimension] > 4096) {
        fail(`jobs[${index}].${dimension} is invalid.`);
      }
    }
    bool(raw.transparent, `jobs[${index}].transparent`);
    const dependsOn = stringArray(raw.dependsOn, `jobs[${index}].dependsOn`).map((entry) => identifier(entry, `jobs[${index}].dependsOn`));
    const include = stringArray(raw.include, `jobs[${index}].include`, 2, 24);
    const exclude = stringArray(raw.exclude, `jobs[${index}].exclude`, 2, 24);
    if (include.some((entry) => /contact\s*sheet|multi[- ]panel|grid of|multiple unrelated/i.test(entry))) {
      fail(`jobs[${index}] requests a forbidden combined layout.`);
    }
    return { ...raw, id: jobId, role, view, phase, dependsOn, include, exclude };
  });
  topologicalJobs(jobs);
  const roles = new Set(jobs.map((job) => job.role));
  for (const role of REQUIRED_ROLES) {
    if (!roles.has(role)) fail(`job role closure is missing ${role}.`);
  }
  if (jobs.filter((job) => job.role === "modular-modeling-reference").length !== 4) {
    fail("bridge requires four modular modeling references.");
  }
  if (jobs.filter((job) => job.role === "breakable-damage-reference").length !== 3) {
    fail("bridge requires three breakable damage references.");
  }
  return source;
}

function prompt(spec, job) {
  return [
    `Create exactly one image for ${spec.title}.`,
    `Asset identity: ${spec.subjectId}; job: ${job.id}; role: ${job.role}; view: ${job.view}.`,
    `Visual target: ${spec.style.designEra}; ${spec.style.rendering}; ${spec.style.structureLanguage}`,
    `Projection: ${spec.style.projectionFamily}. Preserve the exact deck width, span length, support spacing, railing layout, plank rhythm, palette and material identity established by dependencies.`,
    `Include: ${job.include.join("; ")}.`,
    `Avoid: ${[...spec.style.forbidden, ...job.exclude].join("; ")}.`,
    `Output one ${job.width}x${job.height} PNG${job.transparent ? " with true transparent background" : " as one coherent bridge view"}. No labels, no contact sheet, no grid, no unrelated second structure.`,
  ].join("\n");
}

export function compileTimberBridgeSession(input) {
  const spec = validateTimberBridgeSpec(input);
  const specSha256 = sha256(spec);
  const jobs = topologicalJobs(spec.jobs).map((job, sequence) => {
    const body = {
      schema: JOB_SCHEMA,
      protocolVersion: PROTOCOL_VERSION,
      sequence,
      assetId: spec.assetId,
      subjectId: spec.subjectId,
      jobId: job.id,
      phase: job.phase,
      role: job.role,
      view: job.view,
      operation: "generate",
      images: 1,
      candidateCount: 1,
      target: {
        width: job.width,
        height: job.height,
        format: "png",
        transparentBackground: job.transparent,
      },
      dependencies: [...job.dependsOn],
      prompt: prompt(spec, job),
      output: {
        working: `${spec.output.workingRoot}/${job.id}.png`,
        master: `${spec.output.masterRoot}/${job.id}.png`,
      },
      idempotencyKey: sha256({ specSha256, jobId: job.id, dependencies: job.dependsOn }),
      authority: {
        providerExecution: false,
        automaticApproval: false,
        imageMutation: false,
        automaticAssembly: false,
        repositoryMutation: false,
        gitMutation: false,
        deployment: false,
        publication: false,
        namedHumanApprovalRequired: true,
      },
    };
    return { ...body, jobSha256: sha256(body) };
  });
  const body = {
    schema: SESSION_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    sessionId: `${spec.assetId}-visual-development-v1`,
    assetId: spec.assetId,
    subjectId: spec.subjectId,
    specSha256,
    spec,
    jobs,
    totals: {
      jobs: jobs.length,
      images: jobs.length,
      modelingJobs: jobs.filter((job) => job.role === "modular-modeling-reference").length,
      damageJobs: jobs.filter((job) => job.role === "breakable-damage-reference").length,
      transparentJobs: jobs.filter((job) => job.target.transparentBackground).length,
      phases: [...new Set(jobs.map((job) => job.phase))].sort(),
    },
    readiness: {
      status: "provider-jobs-compiled",
      providerExecutionRequired: true,
      namedHumanApprovalRequired: true,
      downstream3DReady: false,
    },
    authority: {
      providerExecution: false,
      automaticGenerationAuthorization: false,
      automaticCreativeApproval: false,
      imageMutation: false,
      automaticAssembly: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      namedHumanApprovalRequired: true,
    },
  };
  return { ...body, sessionSha256: sha256(body) };
}

export function verifyTimberBridgeSession(session) {
  if (!isObject(session)) fail("session must be an object.");
  if (session.schema !== SESSION_SCHEMA || session.protocolVersion !== PROTOCOL_VERSION) fail("session identity drifted.");
  if (typeof session.sessionSha256 !== "string" || !SHA.test(session.sessionSha256)) fail("sessionSha256 is invalid.");
  const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256"));
  if (sha256(body) !== session.sessionSha256) fail("sessionSha256 does not match the submitted payload.");
  const expected = compileTimberBridgeSession(session.spec);
  if (canonicalJson(expected) !== canonicalJson(session)) fail("session is not the deterministic compilation of its retained spec.");
  return true;
}

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2);
  const outputIndex = rest.indexOf("--output");
  const outputPath = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  if (!["compile", "verify"].includes(command) || !inputPath) {
    fail("Usage: rally-25d-timber-bridge-jobs.mjs <compile|verify> <input.json> [--output output.json]");
  }
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result = command === "compile"
    ? compileTimberBridgeSession(input)
    : {
        valid: verifyTimberBridgeSession(input),
        sessionId: input.sessionId,
        sessionSha256: input.sessionSha256,
        jobs: input.totals.jobs,
        images: input.totals.images,
        modelingJobs: input.totals.modelingJobs,
        damageJobs: input.totals.damageJobs,
        oneImagePerJob: input.totals.jobs === input.totals.images,
        providerExecution: false,
      };
  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, rendered, "utf8");
  process.stdout.write(rendered);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
