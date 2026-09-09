import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./godot_material_delivery_mcp.mjs", import.meta.url));

async function call(name, args = {}) {
  const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "pipe"] });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })}\n`);
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 0, Buffer.concat(stderr).toString("utf8"));
  return JSON.parse(Buffer.concat(stdout).toString("utf8").trim()).result;
}

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
