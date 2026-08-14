#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SPEC_SCHEMA = "evavo.rally-guardrail-visual-development.v1";
export const SESSION_SCHEMA = "evavo.rally-guardrail-provider-job-session.v1";
export const JOB_SCHEMA = "evavo.rally-guardrail-provider-job.v1";
export const PROTOCOL_VERSION = "2026-08-15.5";

const VARIANTS = new Set(["straight", "curve-left", "curve-right", "end-cap"]);
const JOB_VARIANTS = new Set([...VARIANTS, "shared-construction", "shared-curves"]);
const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;
const SPEC_KEYS = new Set(["schema", "protocolVersion", "assetId", "subjectId", "title", "variants", "style", "cameraLocks", "jobs", "output", "authority"]);
const STYLE_KEYS = new Set(["projectionFamily", "designEra", "rendering", "propLanguage", "palette", "surfaceLanguage", "forbidden"]);
const CAMERA_KEYS = new Set(["heroYawDegrees", "heroPitchDegrees", "orthographicPitchDegrees", "topPlanPitchDegrees", "focalLengthMm", "consistentBeamHeight", "consistentPostSpacing", "consistentModuleLength", "consistentEndConnections"]);
const JOB_KEYS = new Set(["id", "role", "variant", "view", "phase", "width", "height", "transparent", "dependsOn", "include", "exclude"]);
const OUTPUT_KEYS = new Set(["workingRoot", "masterRoot", "format", "oneImagePerJob", "retainIndividualSources", "automaticAssembly"]);
const AUTHORITY_FALSE = ["providerExecution", "automaticGenerationAuthorization", "automaticCreativeApproval", "imageMutation", "automaticAssembly", "targetRepositoryMutation", "gitMutation", "deployment", "publication"];
const REQUIRED_ROLES = new Set(["identity-master", "variant-identity", "modular-modeling-reference", "runtime-shader-reference", "breakable-damage-reference"]);

function fail(message) { throw new Error(`RALLY_GUARDRAIL_ART_JOBS_INVALID: ${message}`); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys, label) {
  if (!isObject(value)) fail(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !keys.has(key)).sort();
  const missing = [...keys].filter((key) => !Object.hasOwn(value, key)).sort();
  if (unknown.length) fail(`${label} contains unsupported keys: ${unknown.join(", ")}.`);
  if (missing.length) fail(`${label} is missing keys: ${missing.join(", ")}.`);
}
function text(value, label, min = 1, max = 8000) {
  if (typeof value !== "string" || value.trim() !== value || value.length < min || value.length > max) fail(`${label} must be a trimmed string with ${min}-${max} characters.`);
  if ([...value].some((character) => character.charCodeAt(0) < 32)) fail(`${label} contains control characters.`);
  return value;
}
function id(value, label) { const result = text(value, label, 1, 180); if (!ID.test(result)) fail(`${label} must be lowercase kebab-case.`); return result; }
function finite(value, label, min, max) { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(`${label} must be a finite number between ${min} and ${max}.`); return value; }
function bool(value, label) { if (typeof value !== "boolean") fail(`${label} must be boolean.`); return value; }
function strings(value, label, min = 0, max = 64) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label} must contain ${min}-${max} strings.`);
  const result = value.map((entry, index) => text(entry, `${label}[${index}]`, 1, 1200));
  if (new Set(result).size !== result.length) fail(`${label} contains duplicates.`);
  return result;
}
function safeRoot(value, label) {
  const root = text(value, label, 3, 500);
  if (root.startsWith("/") || root.includes("\\") || root.split("/").some((part) => ["", ".", ".."].includes(part))) fail(`${label} must be a safe relative POSIX path.`);
  return root;
}
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
export function canonicalJson(value) { return `${JSON.stringify(sortValue(value))}\n`; }
export function sha256(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

function validateAuthority(value) {
  exact(value, new Set([...AUTHORITY_FALSE, "namedHumanApprovalRequired"]), "authority");
  for (const key of AUTHORITY_FALSE) if (value[key] !== false) fail(`authority.${key} must remain false.`);
  if (value.namedHumanApprovalRequired !== true) fail("authority.namedHumanApprovalRequired must remain true.");
}

function topological(jobs) {
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
  const order = (a, b) => byId.get(a).index - byId.get(b).index || a.localeCompare(b);
  ready.sort(order);
  const ordered = [];
  while (ready.length) {
    const current = ready.shift();
    ordered.push(byId.get(current).job);
    for (const consumer of consumers.get(current)) {
      indegree.set(consumer, indegree.get(consumer) - 1);
      if (indegree.get(consumer) === 0) { ready.push(consumer); ready.sort(order); }
    }
  }
  if (ordered.length !== jobs.length) fail("job dependency graph contains a cycle.");
  return ordered;
}

export function validateGuardrailSpec(input) {
  const source = structuredClone(input);
  exact(source, SPEC_KEYS, "spec");
  if (source.schema !== SPEC_SCHEMA || source.protocolVersion !== PROTOCOL_VERSION) fail("spec identity drifted.");
  id(source.assetId, "assetId"); id(source.subjectId, "subjectId"); text(source.title, "title", 3, 300);
  if (!Array.isArray(source.variants) || source.variants.length !== 4 || new Set(source.variants).size !== 4 || source.variants.some((variant) => !VARIANTS.has(variant))) fail("variants must equal the four governed guardrail modules.");

  exact(source.style, STYLE_KEYS, "style");
  id(source.style.projectionFamily, "style.projectionFamily"); id(source.style.designEra, "style.designEra"); id(source.style.rendering, "style.rendering");
  text(source.style.propLanguage, "style.propLanguage", 40, 1600);
  const palette = strings(source.style.palette, "style.palette", 6, 16);
  for (const [index, colour] of palette.entries()) if (!/^#[0-9a-fA-F]{6}$/u.test(colour)) fail(`style.palette[${index}] must be a six-digit hex colour.`);
  strings(source.style.surfaceLanguage, "style.surfaceLanguage", 5, 20); strings(source.style.forbidden, "style.forbidden", 8, 32);

  exact(source.cameraLocks, CAMERA_KEYS, "cameraLocks");
  finite(source.cameraLocks.heroYawDegrees, "cameraLocks.heroYawDegrees", -180, 180);
  finite(source.cameraLocks.heroPitchDegrees, "cameraLocks.heroPitchDegrees", 0, 89);
  finite(source.cameraLocks.orthographicPitchDegrees, "cameraLocks.orthographicPitchDegrees", -89, 89);
  finite(source.cameraLocks.topPlanPitchDegrees, "cameraLocks.topPlanPitchDegrees", 89, 90);
  finite(source.cameraLocks.focalLengthMm, "cameraLocks.focalLengthMm", 20, 200);
  for (const key of ["consistentBeamHeight", "consistentPostSpacing", "consistentModuleLength", "consistentEndConnections"]) {
    if (bool(source.cameraLocks[key], `cameraLocks.${key}`) !== true) fail(`cameraLocks.${key} must remain true.`);
  }

  exact(source.output, OUTPUT_KEYS, "output");
  safeRoot(source.output.workingRoot, "output.workingRoot"); safeRoot(source.output.masterRoot, "output.masterRoot");
  if (source.output.format !== "png" || source.output.oneImagePerJob !== true || source.output.retainIndividualSources !== true || source.output.automaticAssembly !== false) fail("output contract drifted.");
  validateAuthority(source.authority);

  if (!Array.isArray(source.jobs) || source.jobs.length !== 12) fail("jobs must contain exactly twelve one-image jobs.");
  const ids = new Set();
  const jobs = source.jobs.map((raw, index) => {
    exact(raw, JOB_KEYS, `jobs[${index}]`);
    const jobId = id(raw.id, `jobs[${index}].id`); if (ids.has(jobId)) fail(`duplicate job id ${jobId}.`); ids.add(jobId);
    const role = id(raw.role, `jobs[${index}].role`); if (!REQUIRED_ROLES.has(role)) fail(`jobs[${index}].role is unsupported.`);
    const variant = id(raw.variant, `jobs[${index}].variant`); if (!JOB_VARIANTS.has(variant)) fail(`jobs[${index}].variant is unsupported.`);
    const view = id(raw.view, `jobs[${index}].view`); const phase = id(raw.phase, `jobs[${index}].phase`);
    if (!Number.isInteger(raw.width) || raw.width !== 2048 || !Number.isInteger(raw.height) || raw.height !== 2048) fail(`jobs[${index}] must be 2048x2048.`);
    bool(raw.transparent, `jobs[${index}].transparent`);
    const dependsOn = strings(raw.dependsOn, `jobs[${index}].dependsOn`).map((entry) => id(entry, `jobs[${index}].dependsOn`));
    const include = strings(raw.include, `jobs[${index}].include`, 3, 24); const exclude = strings(raw.exclude, `jobs[${index}].exclude`, 3, 24);
    if (include.some((entry) => /contact\s*sheet|multi[- ]panel|grid of|multiple alternatives/i.test(entry))) fail(`jobs[${index}] requests a forbidden combined layout.`);
    return { ...raw, id: jobId, role, variant, view, phase, dependsOn, include, exclude };
  });
  topological(jobs);
  const roles = new Set(jobs.map((job) => job.role)); for (const role of REQUIRED_ROLES) if (!roles.has(role)) fail(`job role closure is missing ${role}.`);
  if (jobs.filter((job) => job.role === "identity-master").length !== 1) fail("guardrail requires exactly one identity master.");
  if (jobs.filter((job) => job.role === "variant-identity").length !== 3) fail("guardrail requires exactly three variant identity references.");
  if (jobs.filter((job) => job.role === "modular-modeling-reference").length !== 4) fail("guardrail requires exactly four modeling references.");
  if (jobs.filter((job) => job.role === "breakable-damage-reference").length !== 3) fail("guardrail requires exactly three damage references.");
  for (const variant of VARIANTS) if (!jobs.some((job) => job.variant === variant)) fail(`guardrail jobs do not cover ${variant}.`);
  return source;
}

function prompt(spec, job) {
  return [
    `Create exactly one image for ${spec.title}.`,
    `Asset identity: ${spec.subjectId}; variant: ${job.variant}; job: ${job.id}; role: ${job.role}; view: ${job.view}.`,
    `Visual target: ${spec.style.designEra}; ${spec.style.rendering}; ${spec.style.propLanguage}`,
    `Projection: ${spec.style.projectionFamily}. Hero camera ${spec.cameraLocks.heroYawDegrees} degrees yaw and ${spec.cameraLocks.heroPitchDegrees} degrees pitch; preserve beam height, post spacing, module length, end connections, palette and construction identity established by dependencies.`,
    `Include: ${job.include.join("; ")}.`,
    `Avoid: ${[...spec.style.forbidden, ...job.exclude].join("; ")}.`,
    `Output one ${job.width}x${job.height} PNG${job.transparent ? " with true transparent background" : " as one coherent material reference"}. No labels, contact sheet, grid, duplicate complete module or unrelated prop family.`,
  ].join("\n");
}

export function compileGuardrailSession(input) {
  const spec = validateGuardrailSpec(input); const specSha256 = sha256(spec); const ordered = topological(spec.jobs);
  const jobs = ordered.map((job, sequence) => {
    const body = {
      schema: JOB_SCHEMA, protocolVersion: PROTOCOL_VERSION, sequence, assetId: spec.assetId, subjectId: spec.subjectId,
      jobId: job.id, phase: job.phase, role: job.role, variant: job.variant, view: job.view, operation: "generate", images: 1, candidateCount: 1,
      target: { width: job.width, height: job.height, format: "png", transparentBackground: job.transparent },
      dependencies: [...job.dependsOn], prompt: prompt(spec, job),
      output: { working: `${spec.output.workingRoot}/${job.id}.png`, master: `${spec.output.masterRoot}/${job.id}.png` },
      idempotencyKey: sha256({ specSha256, jobId: job.id, dependencies: job.dependsOn }),
      authority: { providerExecution: false, automaticApproval: false, imageMutation: false, automaticAssembly: false, repositoryMutation: false, gitMutation: false, deployment: false, publication: false, namedHumanApprovalRequired: true },
    };
    return { ...body, jobSha256: sha256(body) };
  });
  const body = {
    schema: SESSION_SCHEMA, protocolVersion: PROTOCOL_VERSION, sessionId: `${spec.assetId}-visual-development-v1`,
    assetId: spec.assetId, subjectId: spec.subjectId, specSha256, spec, jobs,
    totals: {
      jobs: jobs.length, images: jobs.length, variants: spec.variants.length,
      modelingJobs: jobs.filter((job) => job.role === "modular-modeling-reference").length,
      damageJobs: jobs.filter((job) => job.role === "breakable-damage-reference").length,
      transparentJobs: jobs.filter((job) => job.target.transparentBackground).length,
    },
    readiness: { status: "provider-jobs-compiled", providerExecutionRequired: true, namedHumanApprovalRequired: true, downstream3DReady: false },
    authority: structuredClone(spec.authority),
  };
  return { ...body, sessionSha256: sha256(body) };
}

export function verifyGuardrailSession(session) {
  if (!isObject(session) || session.schema !== SESSION_SCHEMA || session.protocolVersion !== PROTOCOL_VERSION) fail("session identity drifted.");
  if (typeof session.sessionSha256 !== "string" || !SHA.test(session.sessionSha256)) fail("sessionSha256 is invalid.");
  const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256"));
  if (sha256(body) !== session.sessionSha256) fail("sessionSha256 does not match the submitted payload.");
  const expected = compileGuardrailSession(session.spec);
  if (canonicalJson(expected) !== canonicalJson(session)) fail("session is not the deterministic compilation of its retained spec.");
  return true;
}

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2); const outputIndex = rest.indexOf("--output"); const outputPath = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  if (!["compile", "verify"].includes(command) || !inputPath) fail("Usage: rally-25d-guardrail-jobs.mjs <compile|verify> <input.json> [--output output.json]");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result = command === "compile" ? compileGuardrailSession(input) : {
    valid: verifyGuardrailSession(input), sessionId: input.sessionId, sessionSha256: input.sessionSha256,
    jobs: input.totals.jobs, images: input.totals.images, variants: input.totals.variants,
    modelingJobs: input.totals.modelingJobs, damageJobs: input.totals.damageJobs,
    oneImagePerJob: input.totals.images === input.totals.jobs, providerExecution: false,
  };
  const rendered = `${JSON.stringify(result, null, 2)}\n`; if (outputPath) await writeFile(outputPath, rendered, "utf8"); process.stdout.write(rendered);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
