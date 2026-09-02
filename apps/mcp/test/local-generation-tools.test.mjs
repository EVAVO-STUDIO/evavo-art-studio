import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const MCP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRYPOINT = path.join(MCP_ROOT, "dist", "index.js");
const REQUIRED_LOCAL_GENERATION_TOOLS = Object.freeze([
  "local_generation_campaign_capabilities",
  "local_generation_doctor",
  "run_local_generation_campaign",
  "run_shipped_local_generation_campaign",
  "run_lorna_strip_poker_acceptance",
  "list_local_generation_outputs",
  "get_local_generation_image",
]);

async function listTools() {
  const child = spawn(process.execPath, [ENTRYPOINT], {
    cwd: MCP_ROOT,
    env: {
      ...process.env,
      EVAVO_ART_ALLOW_WRITES: "true",
      EVAVO_ART_LOCAL_GENERATION_MCP_ALLOW_EXECUTION: "true",
      EVAVO_LOCAL_COMPUTE_ROOT:
        process.platform === "win32"
          ? "C:\\GitRepos\\evavo-local-compute"
          : path.join(MCP_ROOT, ".test-local-compute"),
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const requests = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "art-studio-local-generation-test", version: "1.0.0" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ];

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
  child.stdin.end();

  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Art Studio MCP tools/list test timed out."));
    }, 15_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  assert.equal(exitCode, 0, stderr || stdout);
  assert.equal(stderr.trim(), "", stderr);
  const responses = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const initialized = responses.find((response) => response.id === 1);
  const listed = responses.find((response) => response.id === 2);
  assert.equal(initialized?.result?.serverInfo?.name, "evavo-art-studio");
  assert.ok(Array.isArray(listed?.result?.tools));
  return listed.result.tools.map((tool) => tool.name);
}

test("built Art Studio MCP exposes complete local generation surface", async () => {
  const tools = await listTools();
  assert.equal(new Set(tools).size, tools.length, "MCP tool names must remain unique");
  for (const required of REQUIRED_LOCAL_GENERATION_TOOLS) {
    assert.ok(tools.includes(required), `missing local-generation MCP tool: ${required}`);
  }
});
