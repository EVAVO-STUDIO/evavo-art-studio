#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  compilePlanFile,
  deliveryCatalog,
  installPlan,
  normalizeJob,
  publishPlan,
  verifyInstalled,
} from "./pixel-font-repository-delivery/compiler.mjs";
import { parseArgs, readJson } from "./pixel-font-repository-delivery/common.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCompiler = path.join(repositoryRoot, "tools", "pixel_font_universal.py");
const defaultTextCompiler = path.join(repositoryRoot, "tools", "pixel_text_studio.py");

const usage = `EVAVO Pixel Font Repository Delivery

  catalog
  validate-job --job <job.json>
  plan --job <job.json> --workspace <empty-or-existing-workspace> --expected-head <sha> --output <plan.json> [--python <python>] [--compiler <pixel_font_universal.py>] [--text-compiler <pixel_text_studio.py>]
  install --plan <plan.json> --target-root <repo> --allowlist <allowlist.json> --confirm-write
  verify --receipt <receipt.json> --target-root <repo>
  publish --plan <plan.json> --target-root <repo> --allowlist <allowlist.json> --confirm-publish
  run --job <job.json> --target-root <repo> --allowlist <allowlist.json> --expected-head <sha> --confirm-publish [--repository <owner/repo>] [--branch <base>] [--publish-mode <branch|direct-main>] [--publish-branch <name>] [--python <python>] [--compiler <pixel_font_universal.py>] [--text-compiler <pixel_text_studio.py>]
`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || ["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage);
    return;
  }
  const args = parseArgs(rest);
  if (command === "catalog") {
    process.stdout.write(`${JSON.stringify(deliveryCatalog(), null, 2)}\n`);
    return;
  }
  if (command === "validate-job") {
    if (!args.job) throw new Error("--job is required.");
    const file = await readJson(args.job, "pixel-font repository job");
    const job = normalizeJob(file.value, { baseDirectory: path.dirname(file.path) });
    process.stdout.write(`${JSON.stringify({ status: "passed", jobId: job.jobId, familyId: job.family.familyId, repository: job.target.repository, jobSha256: job.jobSha256 }, null, 2)}\n`);
    return;
  }
  if (command === "plan") {
    if (!args.job || !args.workspace || !args["expected-head"] || !args.output) throw new Error("--job, --workspace, --expected-head and --output are required.");
    const result = await compilePlanFile({
      jobPath: args.job,
      workspaceRoot: args.workspace,
      expectedHead: args["expected-head"],
      outputPath: args.output,
      python: args.python ?? (process.platform === "win32" ? "python" : "python3"),
      compilerPath: args.compiler ?? defaultCompiler,
      textCompilerPath: args["text-compiler"] ?? defaultTextCompiler,
    });
    process.stdout.write(`${JSON.stringify({ status: "planned", planPath: result.planPath, planSha256: result.plan.planSha256, runId: result.plan.runId, actionCount: result.plan.actions.length }, null, 2)}\n`);
    return;
  }
  if (command === "install") {
    if (!args.plan || !args["target-root"] || !args.allowlist || args["confirm-write"] !== true) throw new Error("--plan, --target-root, --allowlist and --confirm-write are required.");
    const result = await installPlan({ planPath: args.plan, targetRoot: args["target-root"], allowlistPath: args.allowlist });
    process.stdout.write(`${JSON.stringify({ status: "installed", receiptPath: result.receiptPath, receiptSha256: result.receipt.receiptSha256, installedFileCount: result.receipt.installed.length }, null, 2)}\n`);
    return;
  }
  if (command === "verify") {
    if (!args.receipt || !args["target-root"]) throw new Error("--receipt and --target-root are required.");
    process.stdout.write(`${JSON.stringify(await verifyInstalled({ receiptPath: args.receipt, targetRoot: args["target-root"] }), null, 2)}\n`);
    return;
  }
  if (command === "publish") {
    if (!args.plan || !args["target-root"] || !args.allowlist || args["confirm-publish"] !== true) throw new Error("--plan, --target-root, --allowlist and --confirm-publish are required.");
    process.stdout.write(`${JSON.stringify(await publishPlan({ planPath: args.plan, targetRoot: args["target-root"], allowlistPath: args.allowlist, confirmPublish: true }), null, 2)}\n`);
    return;
  }
  if (command === "run") {
    if (!args.job || !args["target-root"] || !args.allowlist || !args["expected-head"] || args["confirm-publish"] !== true) {
      throw new Error("--job, --target-root, --allowlist, --expected-head and --confirm-publish are required.");
    }
    const temporary = await mkdtemp(path.join(os.tmpdir(), "evavo-pixel-font-delivery-run-"));
    try {
      const planPath = path.join(temporary, "delivery-plan.json");
      const plan = await compilePlanFile({
        jobPath: args.job,
        workspaceRoot: temporary,
        expectedHead: args["expected-head"],
        outputPath: planPath,
        python: args.python ?? (process.platform === "win32" ? "python" : "python3"),
        compilerPath: args.compiler ?? defaultCompiler,
        textCompilerPath: args["text-compiler"] ?? defaultTextCompiler,
        repositoryOverride: args.repository,
        branchOverride: args.branch,
        publishModeOverride: args["publish-mode"],
        publishBranchOverride: args["publish-branch"],
      });
      const publication = await publishPlan({ planPath: plan.planPath, targetRoot: args["target-root"], allowlistPath: args.allowlist, confirmPublish: true });
      process.stdout.write(`${JSON.stringify({ status: publication.status, planSha256: plan.plan.planSha256, publication }, null, 2)}\n`);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
    return;
  }
  throw new Error(`Unknown command ${command}.\n\n${usage}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 2;
});
