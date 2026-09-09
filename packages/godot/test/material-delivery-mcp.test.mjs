import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.resolve(packageDir, "../../tools/godot_material_delivery_mcp.mjs");

async function call(name, args = {}) {
  const child = spawn(process.execPath, [serverPath], { cwd: path.resolve(packageDir, "../.."), stdio: ["pipe", "pipe", "pipe"] });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })}\n`);
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 0, Buffer.concat(stderr).toString("utf8"));
  return JSON.parse(Buffer.concat(stdout).toString("utf8").trim()).result;
}

test("package build exposes the read-only Godot material delivery MCP", async () => {
  const capabilities = await call("evavo_godot_material_delivery_capabilities");
  assert.equal(capabilities.isError, false);
  assert.equal(capabilities.structuredContent.projectWritesAllowed, false);
  assert.ok(capabilities.structuredContent.tools.includes("evavo_plan_godot_material_delivery"));

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
