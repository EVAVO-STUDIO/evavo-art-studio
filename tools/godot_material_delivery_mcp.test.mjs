import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./godot_material_delivery_mcp.mjs", import.meta.url));

async function call(name, args = {}, { root, writes = false } = {}) {
  const child = spawn(process.execPath, [serverPath], {
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

test("advertises planning plus create-only TRES materialization", async () => {
  const response = await call("evavo_godot_material_delivery_capabilities");
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.godotTarget, "4.6.x");
  assert.equal(response.structuredContent.createOnlyProjectWrites, true);
  assert.equal(response.structuredContent.writesEnabled, false);
  assert.ok(response.structuredContent.tools.includes("evavo_write_godot_material_resource"));
  assert.equal(response.structuredContent.resourceFormat.deprecatedLoadStepsEmitted, false);
});

test("plans a ready StandardMaterial3D recipe without project writes", async () => {
  const response = await call("evavo_plan_godot_material_delivery", {
    materialId: "brick",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://brick/albedo.png" },
      { id: "normal", kind: "normal-tangent", resourcePath: "res://brick/normal.png" },
      { id: "roughness", kind: "roughness", resourcePath: "res://brick/roughness.png" },
      { id: "metallic", kind: "metallic", resourcePath: "res://brick/metallic.png" },
    ],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.plan.decision, "ready");
  assert.equal(response.structuredContent.plan.materialClass, "StandardMaterial3D");
  assert.equal(response.structuredContent.projectModified, false);
  assert.ok(response.structuredContent.plan.bindings.some((item) => item.property === "metallic" && item.value === 1));
});

test("writes only a ready material with explicit admission and create-only paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-godot-material-direct-"));
  const outputPath = path.join(root, "brick.tres");
  const args = {
    materialId: "brick",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://brick/albedo.png" },
      { id: "normal", kind: "normal-tangent", resourcePath: "res://brick/normal.png" },
    ],
    outputPath,
    confirmLocalWrite: true,
  };

  const denied = await call("evavo_write_godot_material_resource", args, { root, writes: false });
  assert.equal(denied.isError, true);
  assert.match(denied.structuredContent.message, /writes are disabled/);

  const written = await call("evavo_write_godot_material_resource", args, { root, writes: true });
  assert.equal(written.isError, false);
  assert.equal(written.structuredContent.approvalState, "unapproved");
  const text = await readFile(outputPath, "utf8");
  assert.match(text, /^\[gd_resource type="StandardMaterial3D" format=3\]/);
  assert.doesNotMatch(text, /load_steps=/);

  const repeated = await call("evavo_write_godot_material_resource", args, { root, writes: true });
  assert.equal(repeated.isError, true);
  assert.match(repeated.structuredContent.message, /Create-only Godot material target already exists/);
});

test("routes unsupported standalone opacity and DirectX normals to preprocessing", async () => {
  const response = await call("evavo_plan_godot_material_delivery", {
    materialId: "leaf",
    normalConvention: "directx",
    transparencyMode: "alpha-scissor",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://leaf/albedo.png" },
      { id: "normal", kind: "normal-tangent", resourcePath: "res://leaf/normal_dx.png" },
      { id: "opacity", kind: "opacity", resourcePath: "res://leaf/opacity.png" },
    ],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.plan.decision, "needs-preprocess");
  assert.deepEqual(response.structuredContent.plan.unboundMaps.map((item) => item.kind).sort(), ["normal-tangent", "opacity"]);
  assert.equal(response.structuredContent.plan.bindings.some((item) => item.property === "normal_texture"), false);
});

test("refuses materialization while preprocessing is unresolved", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-godot-material-preprocess-"));
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

test("rejects packed ORM plus separate ORM authority", async () => {
  const response = await call("evavo_plan_godot_material_delivery", {
    materialId: "bad",
    textures: [
      { id: "orm", kind: "orm-packed", resourcePath: "res://bad/orm.png" },
      { id: "rough", kind: "roughness", resourcePath: "res://bad/rough.png" },
    ],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.plan.decision, "reject");
  assert.ok(response.structuredContent.plan.blockers.includes("packed-orm-and-separate-orm-maps-are-both-authoritative"));
});
