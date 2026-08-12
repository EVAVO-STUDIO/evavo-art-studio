#!/usr/bin/env node
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import {
  assertAllowed,
  assertPlanPathsAllowed,
  compilePlanFile,
  deliveryCatalog,
  installPlan,
  normalizeAllowlist,
  normalizeJob,
  publishPlan,
  verifyInstalled,
  verifyPlan,
} from "./pixel-font-repository-delivery/compiler.mjs";
import {
  canonicalFile,
  pathInside,
  readJson,
} from "./pixel-font-repository-delivery/common.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SERVER_NAME = "evavo-pixel-font-repository-delivery";
export const SERVER_VERSION = "1.1.0";

export const TOOLS = Object.freeze({
  catalog: "evavo_pixel_font_delivery_catalog",
  validateJob: "evavo_pixel_font_validate_repository_job",
  plan: "evavo_pixel_font_plan_repository_delivery",
  install: "evavo_pixel_font_install_repository_delivery",
  verify: "evavo_pixel_font_verify_repository_installation",
  publish: "evavo_pixel_font_publish_repository_delivery",
  run: "evavo_pixel_font_run_repository_delivery",
});

function flag(value, label, fallback = false) {
  if (value === undefined || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${label} must be true or false.`);
}

function roots(value, label) {
  const result = String(value ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
  if (!result.length) throw new Error(`${label} must contain at least one root.`);
  return Object.freeze([...new Set(result)]);
}

export function policy(environment = process.env) {
  const mode = String(environment.EVAVO_PIXEL_FONT_DELIVERY_MODE ?? "read-only")
    .trim()
    .toLowerCase();
  if (!new Set(["read-only", "read-write"]).has(mode)) {
    throw new Error("EVAVO_PIXEL_FONT_DELIVERY_MODE must be read-only or read-write.");
  }
  const writesEnabled = mode === "read-write"
    && flag(
      environment.EVAVO_PIXEL_FONT_DELIVERY_ALLOW_WRITES,
      "EVAVO_PIXEL_FONT_DELIVERY_ALLOW_WRITES",
    );
  if (mode === "read-write" && !writesEnabled) {
    throw new Error("read-write mode also requires EVAVO_PIXEL_FONT_DELIVERY_ALLOW_WRITES=true.");
  }
  const gitPublishEnabled = writesEnabled
    && flag(
      environment.EVAVO_PIXEL_FONT_DELIVERY_ALLOW_GIT_PUBLISH,
      "EVAVO_PIXEL_FONT_DELIVERY_ALLOW_GIT_PUBLISH",
    );
  const sourceRoots = roots(
    environment.EVAVO_PIXEL_FONT_DELIVERY_SOURCE_ROOTS,
    "EVAVO_PIXEL_FONT_DELIVERY_SOURCE_ROOTS",
  );
  const targetRoots = roots(
    environment.EVAVO_PIXEL_FONT_DELIVERY_TARGET_ROOTS,
    "EVAVO_PIXEL_FONT_DELIVERY_TARGET_ROOTS",
  );
  const allowlistPath = path.resolve(
    String(environment.EVAVO_PIXEL_FONT_DELIVERY_ALLOWLIST ?? ""),
  );
  if (!String(environment.EVAVO_PIXEL_FONT_DELIVERY_ALLOWLIST ?? "").trim()) {
    throw new Error("EVAVO_PIXEL_FONT_DELIVERY_ALLOWLIST is required.");
  }
  const compilerPath = path.resolve(
    String(environment.EVAVO_PIXEL_FONT_DELIVERY_COMPILER ?? ""),
  );
  if (!String(environment.EVAVO_PIXEL_FONT_DELIVERY_COMPILER ?? "").trim()) {
    throw new Error("EVAVO_PIXEL_FONT_DELIVERY_COMPILER is required.");
  }
  const textCompilerPath = path.resolve(
    String(environment.EVAVO_PIXEL_FONT_DELIVERY_TEXT_COMPILER ?? path.join(repositoryRoot, "tools", "pixel_text_studio.py")),
  );
  const python = String(
    environment.EVAVO_PIXEL_FONT_DELIVERY_PYTHON
      ?? (process.platform === "win32" ? "python" : "python3"),
  ).trim();
  if (!/^[A-Za-z0-9._:/\\ -]{1,512}$/u.test(python)) {
    throw new Error("EVAVO_PIXEL_FONT_DELIVERY_PYTHON is invalid.");
  }
  const timeoutMs = Number(
    environment.EVAVO_PIXEL_FONT_DELIVERY_TIMEOUT_MS ?? 900_000,
  );
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 3_600_000) {
    throw new Error("EVAVO_PIXEL_FONT_DELIVERY_TIMEOUT_MS must be 10000..3600000.");
  }
  return Object.freeze({
    mode,
    writesEnabled,
    gitPublishEnabled,
    sourceRoots,
    targetRoots,
    allowlistPath,
    compilerPath,
    textCompilerPath,
    python,
    timeoutMs,
  });
}

async function allowedPath(value, allowedRoots, label, { future = false, file = false } = {}) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  const requested = path.resolve(value);
  let observed;
  try {
    const metadata = await lstat(requested);
    if (metadata.isSymbolicLink()) throw new Error(`${label} must not be a symlink.`);
    if (file && !metadata.isFile()) throw new Error(`${label} must be a file.`);
    if (!file && !metadata.isDirectory()) throw new Error(`${label} must be a directory.`);
    observed = await realpath(requested);
    if (observed !== requested) throw new Error(`${label} must be canonical.`);
  } catch (error) {
    if (!future || error?.code !== "ENOENT") throw error;
    const parent = await realpath(path.dirname(requested));
    observed = path.join(parent, path.basename(requested));
  }
  if (!allowedRoots.some((root) => pathInside(observed, root))) {
    throw new Error(`${label} is outside the configured roots.`);
  }
  return requested;
}

async function fixedAllowlist(current) {
  const allowlistPath = await allowedPath(
    current.allowlistPath,
    current.sourceRoots,
    "Configured delivery allowlist",
    { file: true },
  );
  const file = await readJson(allowlistPath, "pixel-font repository allowlist");
  return Object.freeze({ path: allowlistPath, value: normalizeAllowlist(file.value) });
}

const pathSchema = Object.freeze({ type: "string", minLength: 1, maxLength: 8192 });
const shaSchema = Object.freeze({ type: "string", pattern: "^[0-9a-f]{40}$" });
const confirmation = Object.freeze({ type: "boolean", const: true });

function objectSchema(properties, required = []) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
  };
}

export function toolDefinitions(current = policy()) {
  const tools = [
    {
      name: TOOLS.catalog,
      description: "Inspect repository-delivery adapters, formats, safety policy and publication modes.",
      inputSchema: objectSchema({}),
    },
    {
      name: TOOLS.validateJob,
      description: "Validate one path-only pixel-font repository automation job without compiling or mutating a target.",
      inputSchema: objectSchema({ jobPath: pathSchema }, ["jobPath"]),
    },
    {
      name: TOOLS.verify,
      description: "Verify every installed target file against an exact self-hashed delivery receipt.",
      inputSchema: objectSchema(
        { receiptPath: pathSchema, targetRoot: pathSchema },
        ["receiptPath", "targetRoot"],
      ),
    },
  ];
  if (current.writesEnabled) {
    tools.push(
      {
        name: TOOLS.plan,
        description: "Compile a create-only path-bound delivery plan from reviewed font builds or exact source/profile definitions.",
        inputSchema: objectSchema(
          {
            jobPath: pathSchema,
            workspaceRoot: pathSchema,
            planPath: pathSchema,
            expectedHead: shaSchema,
            repository: { type: "string", pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" },
            branch: { type: "string", minLength: 1, maxLength: 240 },
            publishMode: { enum: ["install-only", "branch", "direct-main"] },
            publishBranch: { type: "string", minLength: 1, maxLength: 240 },
            confirmWrite: confirmation,
          },
          ["jobPath", "workspaceRoot", "planPath", "expectedHead", "confirmWrite"],
        ),
      },
      {
        name: TOOLS.install,
        description: "Atomically install an exact delivery plan into an allowlisted target checkout without Git publication.",
        inputSchema: objectSchema(
          { planPath: pathSchema, targetRoot: pathSchema, confirmWrite: confirmation },
          ["planPath", "targetRoot", "confirmWrite"],
        ),
      },
    );
  }
  if (current.gitPublishEnabled) {
    tools.push(
      {
        name: TOOLS.publish,
        description: "Install, commit and normally push an exact plan after clean-checkout, remote, HEAD and allowlist verification. Force push is unavailable.",
        inputSchema: objectSchema(
          { planPath: pathSchema, targetRoot: pathSchema, confirmPublish: confirmation },
          ["planPath", "targetRoot", "confirmPublish"],
        ),
      },
      {
        name: TOOLS.run,
        description: "Compile, install, commit and normally push a complete repository-delivery job in one bounded operation.",
        inputSchema: objectSchema(
          {
            jobPath: pathSchema,
            workspaceRoot: pathSchema,
            planPath: pathSchema,
            targetRoot: pathSchema,
            expectedHead: shaSchema,
            repository: { type: "string", pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" },
            branch: { type: "string", minLength: 1, maxLength: 240 },
            publishMode: { enum: ["branch", "direct-main"] },
            publishBranch: { type: "string", minLength: 1, maxLength: 240 },
            confirmPublish: confirmation,
          },
          [
            "jobPath",
            "workspaceRoot",
            "planPath",
            "targetRoot",
            "expectedHead",
            "confirmPublish",
          ],
        ),
      },
    );
  }
  return Object.freeze(tools);
}

async function validateJobBeforePlanning(jobPath, input, current) {
  const file = await readJson(jobPath, "pixel-font repository job");
  const normalized = normalizeJob(file.value, { baseDirectory: path.dirname(file.path) });
  const candidate = structuredClone(normalized);
  delete candidate.jobSha256;
  if (input.repository) candidate.target.repository = input.repository;
  if (input.branch) candidate.target.branch = input.branch;
  if (input.publishMode) candidate.publish.mode = input.publishMode;
  if (input.publishBranch) candidate.publish.branchName = input.publishBranch;
  const job = normalizeJob(candidate);
  for (const build of job.builds) {
    if (build.mode === "compile") {
      await allowedPath(build.facePath, current.sourceRoots, `${build.buildId}.facePath`, { file: true });
      await allowedPath(build.profilePath, current.sourceRoots, `${build.buildId}.profilePath`, { file: true });
    } else {
      await allowedPath(build.buildRoot, current.sourceRoots, `${build.buildId}.buildRoot`);
    }
  }
  for (const title of job.titles) {
    if (title.mode === "render") {
      await allowedPath(title.stylePath, current.sourceRoots, `${title.titleId}.stylePath`, { file: true });
    } else {
      await allowedPath(title.buildRoot, current.sourceRoots, `${title.titleId}.buildRoot`);
    }
  }
  const allowlist = await fixedAllowlist(current);
  const rule = assertAllowed(job, allowlist.value);
  return Object.freeze({ job, allowlist, rule });
}

async function validatePlanAgainstAllowlist(planPath, current) {
  const planFile = await readJson(planPath, "pixel-font repository delivery plan");
  const { plan, job } = verifyPlan(planFile.value);
  const allowlist = await fixedAllowlist(current);
  const rule = assertAllowed(job, allowlist.value);
  assertPlanPathsAllowed(plan, rule);
  return Object.freeze({ plan, job, allowlist });
}

export async function callTool(name, input = {}, context = {}) {
  const current = context.policy ?? policy();
  if (!toolDefinitions(current).some((tool) => tool.name === name)) {
    throw new Error(`Unknown or prohibited pixel-font delivery tool ${name}.`);
  }
  if (name === TOOLS.catalog) {
    return Object.freeze({
      ...deliveryCatalog(),
      server: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        mode: current.mode,
        writesEnabled: current.writesEnabled,
        gitPublishEnabled: current.gitPublishEnabled,
      },
      authority: {
        bytesFlowThroughMcp: false,
        arbitraryShell: false,
        callerSelectedExecutable: false,
        callerSelectedAllowlist: false,
        creativeApproval: false,
        forcePush: false,
      },
    });
  }
  if (name === TOOLS.validateJob) {
    const jobPath = await allowedPath(input.jobPath, current.sourceRoots, "jobPath", {
      file: true,
    });
    const file = await readJson(jobPath, "pixel-font repository job");
    const job = normalizeJob(file.value, { baseDirectory: path.dirname(file.path) });
    const allowlist = await fixedAllowlist(current);
    assertAllowed(job, allowlist.value);
    return Object.freeze({
      schema: "evavo.pixel-font-repository-job-validation.v1",
      status: "passed",
      jobId: job.jobId,
      familyId: job.family.familyId,
      repository: job.target.repository,
      publishMode: job.publish.mode,
      jobSha256: job.jobSha256,
    });
  }
  if (name === TOOLS.verify) {
    const receiptPath = await allowedPath(
      input.receiptPath,
      current.targetRoots,
      "receiptPath",
      { file: true },
    );
    const targetRoot = await allowedPath(
      input.targetRoot,
      current.targetRoots,
      "targetRoot",
    );
    return verifyInstalled({ receiptPath, targetRoot });
  }
  if (name === TOOLS.plan) {
    if (!current.writesEnabled || input.confirmWrite !== true) {
      throw new Error("Delivery planning requires the write gate and confirmWrite=true.");
    }
    const jobPath = await allowedPath(input.jobPath, current.sourceRoots, "jobPath", {
      file: true,
    });
    const workspaceRoot = await allowedPath(
      input.workspaceRoot,
      current.sourceRoots,
      "workspaceRoot",
    );
    const planPath = await allowedPath(
      input.planPath,
      current.sourceRoots,
      "planPath",
      { future: true, file: true },
    );
    const validated = await validateJobBeforePlanning(jobPath, input, current);
    const result = await compilePlanFile({
      jobPath,
      workspaceRoot,
      outputPath: planPath,
      expectedHead: input.expectedHead,
      python: current.python,
      compilerPath: await allowedPath(
        current.compilerPath,
        current.sourceRoots,
        "Configured universal compiler",
        { file: true },
      ),
      textCompilerPath: validated.job.titles.some((title) => title.mode === "render")
        ? await allowedPath(
          current.textCompilerPath,
          current.sourceRoots,
          "Configured Pixel Text Studio compiler",
          { file: true },
        )
        : null,
      repositoryOverride: input.repository,
      branchOverride: input.branch,
      publishModeOverride: input.publishMode,
      publishBranchOverride: input.publishBranch,
    });
    await validatePlanAgainstAllowlist(result.planPath, current);
    return Object.freeze({
      schema: "evavo.pixel-font-repository-plan-summary.v1",
      status: "planned",
      planPath: result.planPath,
      planSha256: result.plan.planSha256,
      runId: result.plan.runId,
      actionCount: result.plan.actions.length,
      repository: result.plan.job.target.repository,
      publishMode: result.plan.job.publish.mode,
    });
  }
  if (name === TOOLS.install) {
    if (!current.writesEnabled || input.confirmWrite !== true) {
      throw new Error("Delivery installation requires the write gate and confirmWrite=true.");
    }
    const planPath = await allowedPath(input.planPath, current.sourceRoots, "planPath", {
      file: true,
    });
    await validatePlanAgainstAllowlist(planPath, current);
    const targetRoot = await allowedPath(
      input.targetRoot,
      current.targetRoots,
      "targetRoot",
    );
    return installPlan({
      planPath,
      targetRoot,
      allowlistPath: current.allowlistPath,
    });
  }
  if (name === TOOLS.publish) {
    if (!current.gitPublishEnabled || input.confirmPublish !== true) {
      throw new Error("Git publication requires the publication gate and confirmPublish=true.");
    }
    const planPath = await allowedPath(input.planPath, current.sourceRoots, "planPath", {
      file: true,
    });
    await validatePlanAgainstAllowlist(planPath, current);
    const targetRoot = await allowedPath(
      input.targetRoot,
      current.targetRoots,
      "targetRoot",
    );
    return publishPlan({
      planPath,
      targetRoot,
      allowlistPath: current.allowlistPath,
      confirmPublish: true,
    });
  }
  if (name === TOOLS.run) {
    if (!current.gitPublishEnabled || input.confirmPublish !== true) {
      throw new Error("Complete repository delivery requires the publication gate and confirmPublish=true.");
    }
    const jobPath = await allowedPath(input.jobPath, current.sourceRoots, "jobPath", {
      file: true,
    });
    const workspaceRoot = await allowedPath(
      input.workspaceRoot,
      current.sourceRoots,
      "workspaceRoot",
    );
    const planPath = await allowedPath(
      input.planPath,
      current.sourceRoots,
      "planPath",
      { future: true, file: true },
    );
    const targetRoot = await allowedPath(
      input.targetRoot,
      current.targetRoots,
      "targetRoot",
    );
    const validated = await validateJobBeforePlanning(jobPath, input, current);
    const plan = await compilePlanFile({
      jobPath,
      workspaceRoot,
      outputPath: planPath,
      expectedHead: input.expectedHead,
      python: current.python,
      compilerPath: await allowedPath(
        current.compilerPath,
        current.sourceRoots,
        "Configured universal compiler",
        { file: true },
      ),
      textCompilerPath: validated.job.titles.some((title) => title.mode === "render")
        ? await allowedPath(
          current.textCompilerPath,
          current.sourceRoots,
          "Configured Pixel Text Studio compiler",
          { file: true },
        )
        : null,
      repositoryOverride: input.repository,
      branchOverride: input.branch,
      publishModeOverride: input.publishMode,
      publishBranchOverride: input.publishBranch,
    });
    await validatePlanAgainstAllowlist(plan.planPath, current);
    return publishPlan({
      planPath: plan.planPath,
      targetRoot,
      allowlistPath: current.allowlistPath,
      confirmPublish: true,
    });
  }
  throw new Error(`Unknown pixel-font delivery tool ${name}.`);
}

const response = (id, result) => ({ jsonrpc: "2.0", id: id ?? null, result });
const content = (value) => [{ type: "text", text: JSON.stringify(value, null, 2) }];

export async function handleRequest(request, context = {}) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    throw new Error("Invalid JSON-RPC request.");
  }
  const current = context.policy ?? policy();
  if (request.method === "initialize") {
    return response(request.id, {
      protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: "Path-only EVAVO pixel-font repository delivery. Builds, installation and Git publication are independently gated. Publication requires an allowlisted repository, clean exact checkout, exact remote HEAD, a normal non-forced push and exact remote readback.",
    });
  }
  if (request.method === "ping") return response(request.id, {});
  if (request.method === "notifications/initialized") return null;
  if (request.method === "tools/list") {
    return response(request.id, { tools: toolDefinitions(current) });
  }
  if (request.method === "tools/call") {
    try {
      const result = await callTool(
        request.params?.name,
        request.params?.arguments ?? {},
        { policy: current },
      );
      return response(request.id, { content: content(result), isError: false });
    } catch (error) {
      return response(request.id, {
        content: content({ error: error instanceof Error ? error.message : String(error) }),
        isError: true,
      });
    }
  }
  throw new Error(`Unsupported MCP method ${request.method}.`);
}

export async function startServer(options = {}) {
  const current = options.policy ?? policy(options.environment);
  await canonicalFile(current.allowlistPath, "Configured delivery allowlist");
  await canonicalFile(current.compilerPath, "Configured universal compiler");
  await canonicalFile(current.textCompilerPath, "Configured Pixel Text Studio compiler");
  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(request, { policy: current });
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: request?.id ?? null,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error),
          },
        })}\n`,
      );
    }
  }
}

const invoked = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  startServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
