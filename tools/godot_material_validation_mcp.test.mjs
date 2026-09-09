import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./godot_material_validation_mcp.mjs", import.meta.url));

async function call(name, args = {}, { root = "", execution = false, executable = "" } = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      EVAVO_GODOT_MATERIAL_VALIDATION_ALLOWED_ROOTS: root,
      EVAVO_GODOT_MATERIAL_ALLOW_EXECUTION: execution ? "true" : "false",
      EVAVO_GODOT_EXECUTABLE: executable,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })}\n`);
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 0, Buffer.concat(stderr).toString("utf8"));
  return JSON.parse(Buffer.concat(stdout).toString("utf8").trim()).result;
}

async function fixtureProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-godot-native-mcp-"));
  const projectPath = path.join(root, "project");
  await mkdir(path.join(projectPath, "materials"), { recursive: true });
  await writeFile(path.join(projectPath, "project.godot"), "[application]\nconfig/name=\"EVAVO Validation Fixture\"\n", "utf8");
  await writeFile(
    path.join(projectPath, "materials", "brick.tres"),
    "[gd_resource type=\"StandardMaterial3D\" format=3]\n\n[resource]\nroughness = 0.5\n",
    "utf8",
  );
  return { root, projectPath };
}

test("capabilities expose a disabled-by-default environment-only execution boundary", async () => {
  const response = await call("evavo_godot_material_validation_capabilities");
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.executionEnabled, false);
  assert.equal(response.structuredContent.godotExecutableConfigured, false);
  assert.equal(response.structuredContent.executionContract.shell, false);
  assert.equal(response.structuredContent.executionContract.executableComesFromEnvironmentOnly, true);
  assert.equal(response.structuredContent.guarantees.arbitraryExecutableInputAllowed, false);
  assert.ok(response.structuredContent.tools.includes("evavo_validate_godot_material_resource"));
});

test("native validation refuses to run without the execution gate", async () => {
  const response = await call("evavo_validate_godot_material_resource", {
    projectPath: "/tmp/not-used",
    resourcePath: "res://materials/brick.tres",
    confirmLocalExecution: true,
  });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /execution is disabled/);
});

test("native validation requires an operator-configured Godot executable", async () => {
  const { root, projectPath } = await fixtureProject();
  const response = await call("evavo_validate_godot_material_resource", {
    projectPath,
    resourcePath: "res://materials/brick.tres",
    expectedClass: "StandardMaterial3D",
    confirmLocalExecution: true,
  }, { root, execution: true, executable: "" });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /EVAVO_GODOT_EXECUTABLE is not configured/);
});

test("native validation rejects res path traversal before engine launch", async () => {
  const { root, projectPath } = await fixtureProject();
  const response = await call("evavo_validate_godot_material_resource", {
    projectPath,
    resourcePath: "res://../outside.tres",
    confirmLocalExecution: true,
  }, { root, execution: true, executable: "" });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /may not contain empty, dot or parent segments/);
});

test("native validation refuses projects outside configured roots", async () => {
  const allowed = await mkdtemp(path.join(os.tmpdir(), "evavo-godot-native-allowed-"));
  const { projectPath } = await fixtureProject();
  const response = await call("evavo_validate_godot_material_resource", {
    projectPath,
    resourcePath: "res://materials/brick.tres",
    confirmLocalExecution: true,
  }, { root: allowed, execution: true, executable: "" });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /outside configured Godot material validation project roots/);
});
