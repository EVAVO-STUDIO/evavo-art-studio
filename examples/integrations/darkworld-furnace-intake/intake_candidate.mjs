#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

function value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

const candidate = value("--candidate");
const jobId = value("--job");
const workspaceRoot = value("--workspace");
const outputRoot = value("--output-root") ?? path.join(process.cwd(), ".art-studio", "darkworld-furnace");
const createdBy = value("--created-by") ?? "darkworld-production-agent";
const pythonCommand = value("--python") ?? (process.platform === "win32" ? "python" : "python3");

if (!candidate || !jobId || !workspaceRoot) {
  throw new Error("usage: node intake_candidate.mjs --candidate <absolute-file> --job <job-id> --workspace <absolute-source-root> [--output-root <dir>] [--created-by <id>] [--python <python-executable>]");
}

const allowed = new Map([
  ["env-background", "environment/background.png"],
  ["env-mid-structure", "environment/mid_structure.png"],
  ["env-gameplay-skin", "environment/gameplay_skin.png"],
  ["env-foreground", "environment/foreground.png"],
  ["env-glow", "environment/glow.png"],
]);
if (!allowed.has(jobId)) throw new Error(`unsupported Darkworld Furnace Art Studio job: ${jobId}`);

const candidatePath = path.resolve(candidate);
const sourceRoot = path.resolve(workspaceRoot);
const batchRoot = path.resolve(outputRoot, jobId);
const requestPath = path.join(batchRoot, "intake-request.json");
const planPath = path.join(batchRoot, "intake-plan.json");
const workspacePath = path.join(batchRoot, "workspace");
await mkdir(batchRoot, { recursive: true });

const request = {
  schema: "evavo.project-art-intake-request.v1",
  sessionId: `darkworld-furnace-${jobId}`,
  projectId: "darkworld-furnace-intake",
  createdBy,
  allowedSourceRoots: [sourceRoot],
  sources: [{
    id: jobId,
    sourcePath: candidatePath,
    origin: "chat-generated",
    logicalPath: allowed.get(jobId),
    role: "environment-plate-candidate",
    note: "Candidate for the Darkworld Furnace Intake first finished asset batch. Runtime admission remains with the Darkworld repository.",
    tags: ["darkworld", "furnace-intake", jobId],
  }],
  storage: {
    enabled: true,
    vaultId: "art",
    logicalPrefix: "Projects/Darkworld/FurnaceIntake",
    tags: ["darkworld", "furnace-intake", "environment"],
  },
};
await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { flag: "wx" });

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["scripts/compile-project-art-intake.mjs", "--request", requestPath, "--output", planPath]);
run(pythonCommand, ["tools/run_project_art_intake.py", "--plan", planPath, "--output-root", workspacePath]);

console.log(JSON.stringify({
  status: "passed",
  jobId,
  candidate: candidatePath,
  intakeRequest: requestPath,
  intakePlan: planPath,
  workspace: workspacePath,
  pythonCommand,
  runtimeAdmissionAuthority: "EVAVO-STUDIO/godot-462-darkworld-cinematic-platformer",
}, null, 2));
