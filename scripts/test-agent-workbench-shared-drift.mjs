#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectSharedWorkbenchDrift } from "./agent-workbench-shared-drift.mjs";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-wbdrift-"));
const sharedPaths = ["WORKBENCH_FIRST.md", "scripts/shared.mjs", "schemas/shared.json"];

function makeRepo(name, repository, marker = "same") {
  const root = path.join(workspace, name);
  fs.mkdirSync(path.join(root, ".evavo"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.v1.json"), JSON.stringify({ contractVersion: "evavo_agent_workbench_config_v1", repository, authority: name }));
  fs.writeFileSync(path.join(root, "WORKBENCH_FIRST.md"), "# shared\n");
  fs.writeFileSync(path.join(root, "scripts", "shared.mjs"), `export const marker = ${JSON.stringify(marker)};\n`);
  fs.writeFileSync(path.join(root, "schemas", "shared.json"), "{}\n");
  return root;
}

const brain = makeRepo("brain", "EVAVO-STUDIO/the-brain");
const dev = makeRepo("dev", "EVAVO-STUDIO/evavo-development-studio");
const art = makeRepo("art", "EVAVO-STUDIO/evavo-art-studio");

let result = inspectSharedWorkbenchDrift(brain, { workspaceRoot: workspace, sharedPaths });
if (result.status !== "aligned" || result.comparedRepositoryCount !== 2 || result.mismatchCount !== 0) throw new Error("aligned workspace was not reported aligned");
if (result.policy.providerQueriesPerformed !== false || result.policy.mutationPerformed !== false || result.policy.unavailableDoesNotProveAlignment !== true) throw new Error("shared drift truth boundary mismatch");
if (!result.comparedRepositories.includes("EVAVO-STUDIO/evavo-development-studio") || !result.comparedRepositories.includes("EVAVO-STUDIO/evavo-art-studio")) throw new Error("sibling repository identities were not retained");

fs.writeFileSync(path.join(art, "scripts", "shared.mjs"), "export const marker = \"drift\";\n");
result = inspectSharedWorkbenchDrift(brain, { workspaceRoot: workspace, sharedPaths });
if (result.status !== "drifted" || result.mismatchCount !== 1) throw new Error("byte drift was not detected");
if (result.mismatches[0]?.repository !== "EVAVO-STUDIO/evavo-art-studio" || result.mismatches[0]?.path !== "scripts/shared.mjs" || result.mismatches[0]?.state !== "mismatched") throw new Error("drift evidence was not precise");

fs.rmSync(path.join(dev, "schemas", "shared.json"));
result = inspectSharedWorkbenchDrift(brain, { workspaceRoot: workspace, sharedPaths });
if (result.status !== "drifted" || !result.mismatches.some((item) => item.repository === "EVAVO-STUDIO/evavo-development-studio" && item.path === "schemas/shared.json" && item.state === "missing")) throw new Error("missing shared file was not detected");

const isolatedWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-wbdrift-isolated-"));
const isolated = path.join(isolatedWorkspace, "brain");
fs.cpSync(brain, isolated, { recursive: true });
result = inspectSharedWorkbenchDrift(isolated, { workspaceRoot: isolatedWorkspace, sharedPaths });
if (result.status !== "unavailable" || result.comparedRepositoryCount !== 0 || result.policy.unavailableDoesNotProveAlignment !== true) throw new Error("unavailable sibling evidence was misreported");

fs.rmSync(workspace, { recursive: true, force: true });
fs.rmSync(isolatedWorkspace, { recursive: true, force: true });
console.log(JSON.stringify({ contract: "evavo_agent_workbench_shared_drift_test_v1", status: "passed", assertions: 7 }, null, 2));
