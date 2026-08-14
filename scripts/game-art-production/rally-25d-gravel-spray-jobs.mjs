#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SPEC_SCHEMA = "evavo.rally-gravel-spray-visual-development.v1";
export const SESSION_SCHEMA = "evavo.rally-gravel-spray-provider-job-session.v1";
export const JOB_SCHEMA = "evavo.rally-gravel-spray-provider-job.v1";
export const PROTOCOL_VERSION = "2026-08-15.6";

const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;
const SPEC_KEYS = new Set([
  "schema", "protocolVersion", "assetId", "subjectId", "title", "style",
  "continuity", "jobs", "output", "authority",
]);
const STYLE_KEYS = new Set([
  "projectionFamily", "designEra", "rendering", "effectLanguage",
  "palette", "surfaceLanguage", "forbidden",
]);
const CONTINUITY_KEYS = new Set([
  "wheelContactOrigin", "travelDirection", "gravityReadable",
  "windResponseReadable", "consistentStoneScale", "consistentDustTemperature",
]);
const JOB_KEYS = new Set([
  "id", "role", "phase", "width", "height", "transparent",
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
  "effect-shape-master",
  "effect-response-reference",
  "particle-sprite-reference",
  "impact-reference",
]);

function fail(message) {
  throw new Error(`RALLY_GRAVEL_SPRAY_ART_JOBS_INVALID: ${message}`);
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
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < minimum ||
    value.length > maximum
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

function stringArray(value, label, minimum = 0, maximum = 64) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${label} must contain ${minimum}-${maximum} strings.`);
  }
  const result = value.map((entry, index) =>
    text(entry, `${label}[${index}]`, 1, 1000)
  );
  if (new Set(result).size !== result.length) fail(`${label} contains duplicates.`);
  return result;
}

function safeRelativeRoot(value, label) {
  const root = text(value, label, 3, 500);
  if (
    root.startsWith("/") ||
    root.includes("\\") ||
    root.split("/").some((part) => ["", ".", ".."].includes(part))
  ) {
    fail(`${label} must be a safe relative POSIX path.`);
  }
  return root;
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
  text(style.effectLanguage, "style.effectLanguage", 40, 1600);
  const palette = stringArray(style.palette, "style.palette", 6, 16);
  for (const [index, colour] of palette.entries()) {
    if (!/^#[0-9a-fA-F]{6}$/u.test(colour)) {
      fail(`style.palette[${index}] must be a six-digit hex colour.`);
    }
  }
  stringArray(style.surfaceLanguage, "style.surfaceLanguage", 4, 16);
  stringArray(style.forbidden, "style.forbidden", 8, 32);
}

function validateContinuity(continuity) {
  exactKeys(continuity, CONTINUITY_KEYS, "continuity");
  if (
    continuity.wheelContactOrigin !== true ||
    continuity.gravityReadable !== true ||
    continuity.windResponseReadable !== true ||
    continuity.consistentStoneScale !== true ||
    continuity.consistentDustTemperature !== true
  ) {
    fail("continuity booleans must remain true.");
  }
  if (continuity.travelDirection !== "vehicle-rearward") {
    fail("continuity.travelDirection must be vehicle-rearward.");
  }
}

function validateOutput(output) {
  exactKeys(output, OUTPUT_KEYS, "output");
  safeRelativeRoot(output.workingRoot, "output.workingRoot");
  safeRelativeRoot(output.masterRoot, "output.masterRoot");
  if (output.format !== "png") fail("output.format must be png.");
  if (
    output.oneImagePerJob !== true ||
    output.retainIndividualSources !== true ||
    output.automaticAssembly !== false
  ) {
    fail("output must retain one PNG per job and forbid automatic assembly.");
  }
}

function validateAuthority(authority) {
  exactKeys(
    authority,
    new Set([...AUTHORITY_FALSE, "namedHumanApprovalRequired"]),
    "authority",
  );
  for (const key of AUTHORITY_FALSE) {
    if (authority[key] !== false) fail(`authority.${key} must remain false.`);
  }
  if (authority.namedHumanApprovalRequired !== true) {
    fail("authority.namedHumanApprovalRequired must remain true.");
  }
}

function topologicalJobs(jobs) {
  const byId = new Map(jobs.map((job, index) => [job.id, { job, index }]));
  const indegree = new Map(jobs.map((job) => [job.id, job.dependsOn.length]));
  const consumers = new Map(jobs.map((job) => [job.id, []]));
  for (const job of jobs) {
    for (const dependency of job.dependsOn) {
      if (!byId.has(dependency)) {
        fail(`job ${job.id} references unknown dependency ${dependency}.`);
      }
      if (dependency === job.id) fail(`job ${job.id} depends on itself.`);
      consumers.get(dependency).push(job.id);
    }
  }
  const ready = jobs
    .filter((job) => indegree.get(job.id) === 0)
    .map((job) => job.id);
  ready.sort(
    (left, right) =>
      byId.get(left).index - byId.get(right).index || left.localeCompare(right),
  );
  const ordered = [];
  while (ready.length) {
    const current = ready.shift();
    ordered.push(byId.get(current).job);
    for (const consumer of consumers.get(current)) {
      indegree.set(consumer, indegree.get(consumer) - 1);
      if (indegree.get(consumer) === 0) {
        ready.push(consumer);
        ready.sort(
          (left, right) =>
            byId.get(left).index - byId.get(right).index ||
            left.localeCompare(right),
        );
      }
    }
  }
  if (ordered.length !== jobs.length) fail("job dependency graph contains a cycle.");
  return ordered;
}

export function validateGravelSpraySpec(input) {
  const source = structuredClone(input);
  exactKeys(source, SPEC_KEYS, "spec");
  if (
    source.schema !== SPEC_SCHEMA ||
    source.protocolVersion !== PROTOCOL_VERSION
  ) {
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
    fail("jobs must contain exactly twelve one-image gravel-spray jobs.");
  }
  const ids = new Set();
  const jobs = source.jobs.map((raw, index) => {
    exactKeys(raw, JOB_KEYS, `jobs[${index}]`);
    const jobId = identifier(raw.id, `jobs[${index}].id`);
    if (ids.has(jobId)) fail(`duplicate job id ${jobId}.`);
    ids.add(jobId);
    const role = identifier(raw.role, `jobs[${index}].role`);
    const phase = identifier(raw.phase, `jobs[${index}].phase`);
    for (const dimension of ["width", "height"]) {
      if (!Number.isInteger(raw[dimension]) || raw[dimension] !== 2048) {
        fail(`jobs[${index}].${dimension} must equal 2048.`);
      }
    }
    if (raw.transparent !== true) {
      fail(`jobs[${index}] must request true transparency.`);
    }
    const dependsOn = stringArray(
      raw.dependsOn,
      `jobs[${index}].dependsOn`,
    ).map((entry) => identifier(entry, `jobs[${index}].dependsOn`));
    const include = stringArray(raw.include, `jobs[${index}].include`, 4, 24);
    const exclude = stringArray(raw.exclude, `jobs[${index}].exclude`, 4, 24);
    if (
      include.some((entry) =>
        /contact\s*sheet|multi[- ]panel|grid of|multiple unrelated/i.test(entry)
      )
    ) {
      fail(`jobs[${index}] requests a forbidden combined layout.`);
    }
    return { ...raw, id: jobId, role, phase, dependsOn, include, exclude };
  });
  topologicalJobs(jobs);
  const roles = new Set(jobs.map((job) => job.role));
  for (const role of REQUIRED_ROLES) {
    if (!roles.has(role)) fail(`job role closure is missing ${role}.`);
  }
  if (jobs.filter((job) => job.role === "effect-response-reference").length !== 5) {
    fail("gravel spray requires exactly five response-reference jobs.");
  }
  if (jobs.filter((job) => job.role === "particle-sprite-reference").length !== 4) {
    fail("gravel spray requires exactly four particle-sprite jobs.");
  }
  if (jobs.filter((job) => job.role === "impact-reference").length !== 2) {
    fail("gravel spray requires exactly two impact/decay jobs.");
  }
  return source;
}

function compilePrompt(spec, job) {
  return [
    `Create exactly one image for ${spec.title}.`,
    `Asset identity: ${spec.subjectId}; job: ${job.id}; role: ${job.role}; phase: ${job.phase}.`,
    `Visual target: ${spec.style.designEra}; ${spec.style.rendering}; ${spec.style.effectLanguage}`,
    `Preserve wheel-contact origin, rearward travel, readable gravity, wind response, stone scale, dust temperature and transparent-edge quality established by dependencies.`,
    `Include: ${job.include.join("; ")}.`,
    `Avoid: ${[...spec.style.forbidden, ...job.exclude].join("; ")}.`,
    `Output one 2048x2048 PNG with true transparent background. No labels, no contact sheet, no grid, no unrelated second effect.`,
  ].join("\n");
}

export function compileGravelSpraySession(input) {
  const spec = validateGravelSpraySpec(input);
  const specSha256 = sha256(spec);
  const ordered = topologicalJobs(spec.jobs);
  const jobs = ordered.map((job, sequence) => {
    const body = {
      schema: JOB_SCHEMA,
      protocolVersion: PROTOCOL_VERSION,
      sequence,
      assetId: spec.assetId,
      subjectId: spec.subjectId,
      jobId: job.id,
      phase: job.phase,
      role: job.role,
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
      prompt: compilePrompt(spec, job),
      output: {
        working: `${spec.output.workingRoot}/${job.id}.png`,
        master: `${spec.output.masterRoot}/${job.id}.png`,
      },
      idempotencyKey: sha256({
        specSha256,
        jobId: job.id,
        dependencies: job.dependsOn,
      }),
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
      responseJobs: jobs.filter(
        (job) => job.role === "effect-response-reference",
      ).length,
      spriteJobs: jobs.filter(
        (job) => job.role === "particle-sprite-reference",
      ).length,
      impactJobs: jobs.filter(
        (job) => job.role === "impact-reference",
      ).length,
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

export function verifyGravelSpraySession(session) {
  if (!isObject(session)) fail("session must be an object.");
  if (
    session.schema !== SESSION_SCHEMA ||
    session.protocolVersion !== PROTOCOL_VERSION
  ) {
    fail("session identity drifted.");
  }
  if (
    typeof session.sessionSha256 !== "string" ||
    !SHA.test(session.sessionSha256)
  ) {
    fail("sessionSha256 is invalid.");
  }
  const withoutHash = Object.fromEntries(
    Object.entries(session).filter(([key]) => key !== "sessionSha256"),
  );
  if (sha256(withoutHash) !== session.sessionSha256) {
    fail("sessionSha256 does not match the submitted payload.");
  }
  const expected = compileGravelSpraySession(session.spec);
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
    fail(
      "Usage: rally-25d-gravel-spray-jobs.mjs <compile|verify> <input.json> [--output output.json]",
    );
  }
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result =
    command === "compile"
      ? compileGravelSpraySession(input)
      : {
          valid: verifyGravelSpraySession(input),
          sessionId: input.sessionId,
          sessionSha256: input.sessionSha256,
          jobs: input.totals.jobs,
          images: input.totals.images,
          responseJobs: input.totals.responseJobs,
          spriteJobs: input.totals.spriteJobs,
          impactJobs: input.totals.impactJobs,
          oneImagePerJob: input.totals.images === input.totals.jobs,
          providerExecution: false,
        };
  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, rendered, "utf8");
  process.stdout.write(rendered);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
