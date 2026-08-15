#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SPEC_SCHEMA = "evavo.rally-glass-burst-visual-development.v1";
export const SESSION_SCHEMA = "evavo.rally-glass-burst-provider-job-session.v1";
export const JOB_SCHEMA = "evavo.rally-glass-burst-provider-job.v1";
export const PROTOCOL_VERSION = "2026-08-15.8";

const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;
const AUTHORITY_FALSE = [
  "providerExecution",
  "automaticGenerationAuthorization",
  "automaticCreativeApproval",
  "imageMutation",
  "automaticAssembly",
  "targetRepositoryMutation",
  "gitMutation",
  "deployment",
  "publication",
];
const REQUIRED_ROLES = new Set([
  "effect-shape-master",
  "effect-response-reference",
  "particle-sprite-reference",
  "decay-reference",
]);
const SPEC_KEYS = new Set([
  "schema", "protocolVersion", "assetId", "subjectId", "title", "style",
  "continuity", "jobs", "output", "authority",
]);
const STYLE_KEYS = new Set([
  "projectionFamily", "designEra", "rendering", "effectLanguage",
  "palette", "surfaceLanguage", "forbidden",
]);
const CONTINUITY_KEYS = new Set([
  "impactOriginReadable", "laminatedAndTemperedDistinct", "gravityReadable",
  "windResponseReadable", "consistentFragmentScale", "roadBackgroundExcluded",
]);
const JOB_KEYS = new Set([
  "id", "role", "phase", "width", "height", "transparent",
  "dependsOn", "include", "exclude",
]);
const OUTPUT_KEYS = new Set([
  "workingRoot", "masterRoot", "format", "oneImagePerJob",
  "retainIndividualSources", "automaticAssembly",
]);

function fail(message) {
  throw new Error(`RALLY_GLASS_BURST_ART_JOBS_INVALID: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value);
  const missing = [...expected].filter((key) => !Object.hasOwn(value, key)).sort();
  const unknown = actual.filter((key) => !expected.has(key)).sort();
  if (missing.length) fail(`${label} is missing keys: ${missing.join(", ")}.`);
  if (unknown.length) fail(`${label} contains unsupported keys: ${unknown.join(", ")}.`);
}

function text(value, label, minimum = 1, maximum = 8000) {
  if (
    typeof value !== "string" || value.trim() !== value ||
    value.length < minimum || value.length > maximum
  ) {
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

function strings(value, label, minimum = 0, maximum = 64) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${label} must contain ${minimum}-${maximum} strings.`);
  }
  const result = value.map((entry, index) => text(entry, `${label}[${index}]`, 1, 1200));
  if (new Set(result).size !== result.length) fail(`${label} contains duplicates.`);
  return result;
}

function safeRoot(value, label) {
  const result = text(value, label, 3, 500);
  if (
    result.startsWith("/") || result.includes("\\") ||
    result.split("/").some((part) => ["", ".", ".."].includes(part))
  ) {
    fail(`${label} must be a safe relative POSIX path.`);
  }
  return result;
}

function canonicalSort(value) {
  if (Array.isArray(value)) return value.map(canonicalSort);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalSort(value[key])]),
  );
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
  text(style.effectLanguage, "style.effectLanguage", 60, 1800);
  const palette = strings(style.palette, "style.palette", 6, 16);
  for (const [index, colour] of palette.entries()) {
    if (!/^#[0-9a-fA-F]{6}$/u.test(colour)) {
      fail(`style.palette[${index}] must be a six-digit hex colour.`);
    }
  }
  strings(style.surfaceLanguage, "style.surfaceLanguage", 4, 20);
  strings(style.forbidden, "style.forbidden", 10, 36);
}

function validateContinuity(value) {
  exactKeys(value, CONTINUITY_KEYS, "continuity");
  for (const key of CONTINUITY_KEYS) {
    if (value[key] !== true) fail(`continuity.${key} must remain true.`);
  }
}

function validateOutput(value) {
  exactKeys(value, OUTPUT_KEYS, "output");
  safeRoot(value.workingRoot, "output.workingRoot");
  safeRoot(value.masterRoot, "output.masterRoot");
  if (value.format !== "png") fail("output.format must be png.");
  if (
    value.oneImagePerJob !== true || value.retainIndividualSources !== true ||
    value.automaticAssembly !== false
  ) {
    fail("output must retain one image per job and forbid automatic assembly.");
  }
}

function validateAuthority(value) {
  exactKeys(value, new Set([...AUTHORITY_FALSE, "namedHumanApprovalRequired"]), "authority");
  for (const key of AUTHORITY_FALSE) {
    if (value[key] !== false) fail(`authority.${key} must remain false.`);
  }
  if (value.namedHumanApprovalRequired !== true) {
    fail("authority.namedHumanApprovalRequired must remain true.");
  }
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
  const order = (left, right) => byId.get(left).index - byId.get(right).index || left.localeCompare(right);
  ready.sort(order);
  const result = [];
  while (ready.length) {
    const current = ready.shift();
    result.push(byId.get(current).job);
    for (const consumer of consumers.get(current)) {
      indegree.set(consumer, indegree.get(consumer) - 1);
      if (indegree.get(consumer) === 0) {
        ready.push(consumer);
        ready.sort(order);
      }
    }
  }
  if (result.length !== jobs.length) fail("job dependency graph contains a cycle.");
  return result;
}

export function validateGlassBurstSpec(input) {
  const source = structuredClone(input);
  exactKeys(source, SPEC_KEYS, "spec");
  if (source.schema !== SPEC_SCHEMA || source.protocolVersion !== PROTOCOL_VERSION) {
    fail("spec identity drifted.");
  }
  identifier(source.assetId, "assetId");
  identifier(source.subjectId, "subjectId");
  text(source.title, "title", 3, 300);
  validateStyle(source.style);
  validateContinuity(source.continuity);
  validateOutput(source.output);
  validateAuthority(source.authority);
  if (!Array.isArray(source.jobs) || source.jobs.length !== 12) {
    fail("jobs must contain exactly twelve Glass Burst jobs.");
  }
  const ids = new Set();
  source.jobs = source.jobs.map((raw, index) => {
    exactKeys(raw, JOB_KEYS, `jobs[${index}]`);
    const id = identifier(raw.id, `jobs[${index}].id`);
    if (ids.has(id)) fail(`duplicate job id ${id}.`);
    ids.add(id);
    const role = identifier(raw.role, `jobs[${index}].role`);
    const phase = identifier(raw.phase, `jobs[${index}].phase`);
    if (raw.width !== 2048 || raw.height !== 2048 || raw.transparent !== true) {
      fail(`jobs[${index}] must be one transparent 2048 x 2048 image.`);
    }
    const dependsOn = strings(raw.dependsOn, `jobs[${index}].dependsOn`).map((entry) => identifier(entry, `jobs[${index}].dependsOn`));
    const include = strings(raw.include, `jobs[${index}].include`, 3, 24);
    const exclude = strings(raw.exclude, `jobs[${index}].exclude`, 3, 24);
    if (include.some((entry) => /contact\s*sheet|multi[- ]panel|grid of|multiple unrelated/iu.test(entry))) {
      fail(`jobs[${index}] requests a forbidden combined layout.`);
    }
    return { ...raw, id, role, phase, dependsOn, include, exclude };
  });
  topologicalJobs(source.jobs);
  const roles = new Set(source.jobs.map((job) => job.role));
  for (const role of REQUIRED_ROLES) {
    if (!roles.has(role)) fail(`role closure is missing ${role}.`);
  }
  if (source.jobs.filter((job) => job.role === "effect-response-reference").length !== 6) {
    fail("Glass Burst requires exactly six response jobs.");
  }
  if (source.jobs.filter((job) => job.role === "particle-sprite-reference").length !== 4) {
    fail("Glass Burst requires exactly four sprite jobs.");
  }
  return source;
}

function prompt(spec, job) {
  return [
    `Create exactly one image for ${spec.title}.`,
    `Asset identity: ${spec.subjectId}; job: ${job.id}; role: ${job.role}; phase: ${job.phase}.`,
    `Visual target: ${spec.style.designEra}; ${spec.style.rendering}; ${spec.style.effectLanguage}`,
    "Preserve the impact origin, pale glass palette, laminated-versus-tempered distinction, fragment scale and gravity language established by dependencies.",
    `Include: ${job.include.join("; ")}.`,
    `Avoid: ${[...spec.style.forbidden, ...job.exclude].join("; ")}.`,
    `Output one ${job.width}x${job.height} PNG with true transparent background. No labels, no contact sheet, no grid, no unrelated second impact.`,
  ].join("\n");
}

export function compileGlassBurstProviderSession(input) {
  const spec = validateGlassBurstSpec(input);
  const specSha256 = sha256(spec);
  const jobs = topologicalJobs(spec.jobs).map((job, sequence) => {
    const body = {
      schema: JOB_SCHEMA,
      protocolVersion: PROTOCOL_VERSION,
      sequence,
      assetId: spec.assetId,
      subjectId: spec.subjectId,
      jobId: job.id,
      role: job.role,
      phase: job.phase,
      operation: "generate",
      images: 1,
      candidateCount: 1,
      target: {
        width: job.width,
        height: job.height,
        format: "png",
        transparentBackground: true,
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
      responseJobs: jobs.filter((job) => job.role === "effect-response-reference").length,
      spriteJobs: jobs.filter((job) => job.role === "particle-sprite-reference").length,
      phases: [...new Set(jobs.map((job) => job.phase))].sort(),
    },
    readiness: {
      status: "provider-jobs-compiled",
      providerExecutionRequired: true,
      namedHumanApprovalRequired: true,
      downstream3DReady: false,
    },
    authority: structuredClone(spec.authority),
  };
  return { ...body, sessionSha256: sha256(body) };
}

export function verifyGlassBurstProviderSession(session) {
  if (!isObject(session) || session.schema !== SESSION_SCHEMA || session.protocolVersion !== PROTOCOL_VERSION) {
    fail("session identity drifted.");
  }
  if (typeof session.sessionSha256 !== "string" || !SHA.test(session.sessionSha256)) {
    fail("sessionSha256 is invalid.");
  }
  const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256"));
  if (sha256(body) !== session.sessionSha256) fail("sessionSha256 does not match the payload.");
  const expected = compileGlassBurstProviderSession(session.spec);
  if (canonicalJson(expected) !== canonicalJson(session)) {
    fail("session is not the deterministic compilation of its retained spec.");
  }
  return true;
}

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2);
  const outputIndex = rest.indexOf("--output");
  const outputPath = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  if (!["compile", "verify"].includes(command) || !inputPath) {
    fail("Usage: rally-25d-glass-burst-jobs.mjs <compile|verify> <input.json> [--output output.json]");
  }
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result = command === "compile"
    ? compileGlassBurstProviderSession(input)
    : {
        valid: verifyGlassBurstProviderSession(input),
        sessionId: input.sessionId,
        sessionSha256: input.sessionSha256,
        jobs: input.totals.jobs,
        images: input.totals.images,
        responseJobs: input.totals.responseJobs,
        spriteJobs: input.totals.spriteJobs,
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
