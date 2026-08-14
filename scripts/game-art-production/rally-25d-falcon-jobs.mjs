#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SPEC_SCHEMA = "evavo.rally-falcon-visual-development.v1";
export const SESSION_SCHEMA = "evavo.rally-falcon-provider-job-session.v1";
export const PROTOCOL_VERSION = "2026-08-15.1";
const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/u;
const SPEC_KEYS = new Set([
  "schema", "protocolVersion", "assetId", "subjectId", "title", "style",
  "cameraLocks", "jobs", "output", "authority",
]);
const JOB_KEYS = new Set([
  "id", "role", "view", "phase", "width", "height", "transparent",
  "dependsOn", "include", "exclude",
]);
const AUTHORITY_FALSE = [
  "providerExecution", "automaticGenerationAuthorization",
  "automaticCreativeApproval", "imageMutation", "automaticAssembly",
  "targetRepositoryMutation", "gitMutation", "deployment", "publication",
];

function fail(message) {
  throw new Error(`RALLY_FALCON_ART_JOBS_INVALID: ${message}`);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
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
  if ([...value].some((character) => character.charCodeAt(0) < 32)) fail(`${label} contains control characters.`);
  return value;
}

function id(value, label) {
  const result = text(value, label, 1, 160);
  if (!ID.test(result)) fail(`${label} must be lowercase kebab-case.`);
  return result;
}

function stringArray(value, label, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > 64) fail(`${label} must contain ${minimum}-64 strings.`);
  const result = value.map((entry, index) => text(entry, `${label}[${index}]`, 1, 800));
  if (new Set(result).size !== result.length) fail(`${label} contains duplicates.`);
  return result;
}

function canonicalSort(value) {
  if (Array.isArray(value)) return value.map(canonicalSort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalSort(value[key])]));
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalSort(value))}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function validateAuthority(authority) {
  exactKeys(authority, new Set([...AUTHORITY_FALSE, "namedHumanApprovalRequired"]), "authority");
  for (const key of AUTHORITY_FALSE) if (authority[key] !== false) fail(`authority.${key} must remain false.`);
  if (authority.namedHumanApprovalRequired !== true) fail("authority.namedHumanApprovalRequired must remain true.");
}

function validateOutput(output) {
  exactKeys(output, new Set([
    "workingRoot", "masterRoot", "format", "oneImagePerJob",
    "retainIndividualSources", "automaticAssembly",
  ]), "output");
  for (const key of ["workingRoot", "masterRoot"]) {
    const root = text(output[key], `output.${key}`, 3, 500);
    if (root.startsWith("/") || root.includes("\\") || root.split("/").some((part) => ["", ".", ".."].includes(part))) {
      fail(`output.${key} must be a safe relative POSIX path.`);
    }
  }
  if (output.format !== "png") fail("output.format must be png.");
  if (output.oneImagePerJob !== true || output.retainIndividualSources !== true || output.automaticAssembly !== false) {
    fail("output must preserve one-image individual sources and forbid automatic assembly.");
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
  ready.sort((left, right) => byId.get(left).index - byId.get(right).index || left.localeCompare(right));
  const ordered = [];
  while (ready.length) {
    const current = ready.shift();
    ordered.push(byId.get(current).job);
    for (const consumer of consumers.get(current)) {
      indegree.set(consumer, indegree.get(consumer) - 1);
      if (indegree.get(consumer) === 0) {
        ready.push(consumer);
        ready.sort((left, right) => byId.get(left).index - byId.get(right).index || left.localeCompare(right));
      }
    }
  }
  if (ordered.length !== jobs.length) fail("job dependency graph contains a cycle.");
  return ordered;
}

export function validateFalconVisualDevelopmentSpec(input) {
  const source = structuredClone(input);
  exactKeys(source, SPEC_KEYS, "spec");
  if (source.schema !== SPEC_SCHEMA || source.protocolVersion !== PROTOCOL_VERSION) fail("spec identity drifted.");
  id(source.assetId, "assetId");
  id(source.subjectId, "subjectId");
  text(source.title, "title", 3, 300);
  if (!source.style || typeof source.style !== "object" || Array.isArray(source.style)) fail("style must be an object.");
  if (!source.cameraLocks || typeof source.cameraLocks !== "object" || Array.isArray(source.cameraLocks)) fail("cameraLocks must be an object.");
  validateOutput(source.output);
  validateAuthority(source.authority);
  if (!Array.isArray(source.jobs) || source.jobs.length < 8 || source.jobs.length > 32) fail("jobs must contain 8-32 one-image jobs.");
  const ids = new Set();
  const jobs = source.jobs.map((raw, index) => {
    exactKeys(raw, JOB_KEYS, `jobs[${index}]`);
    const jobId = id(raw.id, `jobs[${index}].id`);
    if (ids.has(jobId)) fail(`duplicate job id ${jobId}.`);
    ids.add(jobId);
    const role = id(raw.role, `jobs[${index}].role`);
    const view = id(raw.view, `jobs[${index}].view`);
    const phase = id(raw.phase, `jobs[${index}].phase`);
    for (const dimension of ["width", "height"]) {
      if (!Number.isInteger(raw[dimension]) || raw[dimension] < 512 || raw[dimension] > 4096) fail(`jobs[${index}].${dimension} is invalid.`);
    }
    if (typeof raw.transparent !== "boolean") fail(`jobs[${index}].transparent must be boolean.`);
    const dependsOn = stringArray(raw.dependsOn, `jobs[${index}].dependsOn`).map((entry) => id(entry, `jobs[${index}].dependsOn`));
    const include = stringArray(raw.include, `jobs[${index}].include`, 2);
    const exclude = stringArray(raw.exclude, `jobs[${index}].exclude`, 2);
    const forbiddenLayout = [...include, ...exclude].some((entry) => /contact\s*sheet|multi[- ]panel|grid of|multiple cars/i.test(entry));
    if (forbiddenLayout && !exclude.some((entry) => /contact\s*sheet|multi[- ]panel|multiple cars/i.test(entry))) {
      fail(`jobs[${index}] requests a forbidden combined layout.`);
    }
    return { ...raw, id: jobId, role, view, phase, dependsOn, include, exclude };
  });
  topologicalJobs(jobs);
  return source;
}

function compilePrompt(spec, job) {
  return [
    `Create exactly one image for ${spec.title}.`,
    `Asset identity: ${spec.subjectId}; job: ${job.id}; role: ${job.role}; view: ${job.view}.`,
    `Visual target: ${spec.style.designEra}; ${spec.style.rendering}; ${spec.style.silhouette}`,
    `Projection: ${spec.style.projectionFamily}. Preserve the exact wheelbase, track width, body proportions, livery and panel identity established by dependencies.`,
    `Include: ${job.include.join("; ")}.`,
    `Avoid: ${[...spec.style.forbidden, ...job.exclude].join("; ")}.`,
    `Output one ${job.width}x${job.height} PNG${job.transparent ? " with true transparent background" : " on the governed neutral-matte ground"}. No labels, no contact sheet, no grid, no second vehicle.`,
  ].join("\n");
}

export function compileFalconProviderJobSession(input) {
  const spec = validateFalconVisualDevelopmentSpec(input);
  const specSha256 = sha256(spec);
  const ordered = topologicalJobs(spec.jobs);
  const jobs = ordered.map((job, sequence) => {
    const body = {
      schema: "evavo.rally-falcon-provider-job.v1",
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
      prompt: compilePrompt(spec, job),
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

export function verifyFalconProviderJobSession(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) fail("session must be an object.");
  if (session.schema !== SESSION_SCHEMA || session.protocolVersion !== PROTOCOL_VERSION) fail("session identity drifted.");
  const submitted = session.sessionSha256;
  if (typeof submitted !== "string" || !/^[0-9a-f]{64}$/u.test(submitted)) fail("sessionSha256 is invalid.");
  const withoutHash = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256"));
  if (sha256(withoutHash) !== submitted) fail("sessionSha256 does not match the submitted payload.");
  const expected = compileFalconProviderJobSession(session.spec);
  if (canonicalJson(expected) !== canonicalJson(session)) fail("session is not the deterministic compilation of its retained spec.");
  return true;
}

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2);
  const outputIndex = rest.indexOf("--output");
  const outputPath = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  if (!["compile", "verify"].includes(command) || !inputPath) {
    fail("Usage: rally-25d-falcon-jobs.mjs <compile|verify> <input.json> [--output output.json]");
  }
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result = command === "compile"
    ? compileFalconProviderJobSession(input)
    : {
        valid: verifyFalconProviderJobSession(input),
        sessionId: input.sessionId,
        sessionSha256: input.sessionSha256,
        jobs: input.totals.jobs,
        oneImagePerJob: input.totals.images === input.totals.jobs,
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
