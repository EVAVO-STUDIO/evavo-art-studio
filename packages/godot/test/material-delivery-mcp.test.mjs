import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageDir, "../..");
const serverPath = path.resolve(repoRoot, "tools/godot_material_delivery_mcp.mjs");

async function call(name, args = {}, { root, writes = false } = {}) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...(root ? { EVAVO_GODOT_MATERIAL_ALLOWED_ROOTS: root } : {}),
      EVAVO_GODOT_MATERIAL_ALLOW_WRITES: writes ? "true" : "false",
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

test("package build exposes planning and guarded create-only materialization", async () => {
  const capabilities = await call("evavo_godot_material_delivery_capabilities");
  assert.equal(capabilities.isError, false);
  assert.equal(capabilities.structuredContent.createOnlyProjectWrites, true);
  assert.equal(capabilities.structuredContent.writesEnabled, false);
  assert.ok(capabilities.structuredContent.tools.includes("evavo_plan_godot_material_delivery"));
  assert.ok(capabilities.structuredContent.tools.includes("evavo_write_godot_material_resource"));

  const response = await call("evavo_plan_godot_material_delivery", {
    materialId: "orm-wall",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://wall/albedo.png" },
      { id: "orm", kind: "orm-packed", resourcePath: "res://wall/orm.png" },
      { id: "normal", kind: "normal-tangent", resourcePath: "res://wall/normal.png" },
    ],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.plan.materialClass, "ORMMaterial3D");
  assert.equal(response.structuredContent.plan.decision, "ready");
  assert.equal(response.structuredContent.projectModified, false);
});

test("writes a new current-format TRES and receipt only with explicit admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-godot-material-"));
  const outputPath = path.join(root, "brick.tres");
  const args = {
    materialId: "brick",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://brick/albedo.png" },
      { id: "normal", kind: "normal-tangent", resourcePath: "res://brick/normal.png" },
      { id: "roughness", kind: "roughness", resourcePath: "res://brick/roughness.png" },
    ],
    outputPath,
    confirmLocalWrite: true,
  };

  const denied = await call("evavo_write_godot_material_resource", args, { root, writes: false });
  assert.equal(denied.isError, true);
  assert.match(denied.structuredContent.message, /writes are disabled/);

  const response = await call("evavo_write_godot_material_resource", args, { root, writes: true });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.projectModified, true);
  assert.equal(response.structuredContent.approvalState, "unapproved");
  const text = await readFile(outputPath, "utf8");
  assert.match(text, /^\[gd_resource type="StandardMaterial3D" format=3\]/);
  assert.doesNotMatch(text, /load_steps=/);
  assert.match(text, /normal_texture = ExtResource/);

  const receipt = JSON.parse(await readFile(`${outputPath}.receipt.json`, "utf8"));
  assert.equal(receipt.operation, "evavo-write-godot-material-resource");
  assert.equal(receipt.plan.decision, "ready");

  const repeated = await call("evavo_write_godot_material_resource", args, { root, writes: true });
  assert.equal(repeated.isError, true);
  assert.match(repeated.structuredContent.message, /Create-only Godot material target already exists/);
});

test("refuses to write a material that still needs preprocessing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-godot-material-blocked-"));
  const response = await call("evavo_write_godot_material_resource", {
    materialId: "leaf",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://leaf/albedo.png" },
      { id: "opacity", kind: "opacity", resourcePath: "res://leaf/opacity.png" },
    ],
    outputPath: path.join(root, "leaf.tres"),
    confirmLocalWrite: true,
  }, { root, writes: true });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /plan is needs-preprocess/);
});
