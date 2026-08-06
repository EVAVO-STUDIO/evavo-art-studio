import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(root, "apps/web/scripts/evavo-docs-book-unattended-authorial-writing-cli.mjs");
const mcp = path.join(root, "apps/web/scripts/evavo-docs-book-unattended-authorial-writing-mcp.mjs");
const endpoint = "/api/v1/book-studio/unattended-production/authorial-writing";
const modernMeta = Object.freeze({
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "adapter-test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": { tools: {} },
});
const request = Object.freeze({
  outputKind: "evavo_docs_book_unattended_authorial_writing_compile_input",
  schemaVersion: 1,
  contract: "evavo_docs_book_unattended_authorial_writing_v1",
  unattendedProductionInput: { outputKind: "fixture" },
  expectedUnattendedResultFingerprint: `sha256:${"a".repeat(64)}`,
  volumeId: "volume-1",
  stageId: "volume-1:writing_candidate",
  revisionCycle: 1,
  dependencyReceipts: [],
  authorialWritingBridgeInput: { outputKind: "fixture" },
  executionRequestedAt: "2026-08-05T08:00:00.000Z",
  executionRequestedBy: "book-production-supervisor",
  authoritativeWritesAllowed: false,
  canonicalManuscriptMutationAllowed: false,
  providerFallbackAllowed: false,
  automaticPublicationAllowed: false,
  runtimeCutoverApproved: false,
  publicationPerformed: false,
});

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function server() {
  const calls = [];
  const instance = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    calls.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body: body ? JSON.parse(body) : undefined,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(req.method === "GET"
      ? { ok: true, contract: "evavo_docs_book_unattended_authorial_writing_v1" }
      : {
          ok: true,
          result: {
            outputKind: "evavo_docs_book_unattended_authorial_writing_coordination",
            status: "ready_for_authoring_result_validation",
            coordinationFingerprint: `sha256:${"b".repeat(64)}`,
          },
        }));
  });
  await new Promise((resolve) => instance.listen(0, "127.0.0.1", resolve));
  const address = instance.address();
  return { instance, calls, url: `http://127.0.0.1:${address.port}` };
}

function spawnMcp(env) {
  const child = spawn(process.execPath, [mcp], { env, stdio: ["pipe", "pipe", "pipe"] });
  const responses = [];
  let buffer = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
      const index = buffer.indexOf("\n");
      if (index < 0) break;
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line) responses.push(JSON.parse(line));
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return {
    child,
    responses,
    stderr: () => stderr,
    send: (value) => child.stdin.write(`${JSON.stringify(value)}\n`),
  };
}

async function waitFor(responses, count) {
  const deadline = Date.now() + 5_000;
  while (responses.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(responses.length, count, JSON.stringify(responses));
}

test("CLI posts the exact bounded execution and preserves no-clobber output", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "book-unattended-authorial-cli-"));
  const input = path.join(temp, "input.json");
  const output = path.join(temp, "result.json");
  await writeFile(input, JSON.stringify(request));
  const mock = await server();
  try {
    const env = { ...process.env, EVAVO_DOCS_URL: mock.url, EVAVO_DOCS_TOKEN: "payload.signature" };
    const first = await run(process.execPath, [cli, "execute", "--input", input, "--output", output], { env });
    assert.equal(first.code, 0, first.stderr);
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].url, endpoint);
    assert.equal(mock.calls[0].authorization, "Bearer payload.signature");
    assert.deepEqual(mock.calls[0].body, request);
    assert.equal(JSON.parse(await readFile(output, "utf8")).ok, true);

    const replay = await run(process.execPath, [cli, "execute", "--input", input, "--output", output], { env });
    assert.notEqual(replay.code, 0);
    assert.match(replay.stderr, /EEXIST|file already exists/i);
  } finally {
    mock.instance.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test("modern MCP is sessionless, advertises server identity in result meta and forwards one exact call", async () => {
  const mock = await server();
  const processHandle = spawnMcp({
    ...process.env,
    EVAVO_DOCS_URL: mock.url,
    EVAVO_DOCS_TOKEN: "payload.signature",
  });
  try {
    processHandle.send({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: modernMeta } });
    processHandle.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: modernMeta } });
    processHandle.send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "coordinate_book_unattended_authorial_writing",
        arguments: { input: request },
        _meta: modernMeta,
      },
    });
    processHandle.send({ jsonrpc: "2.0", id: 4, method: "ping", params: { _meta: modernMeta } });
    await waitFor(processHandle.responses, 4);

    const byId = new Map(processHandle.responses.map((item) => [item.id, item]));
    assert.equal(byId.get(1).result.resultType, "complete");
    assert.ok(byId.get(1).result.supportedVersions.includes("2026-07-28"));
    assert.equal(byId.get(1).result.cacheScope, "private");
    assert.equal(
      byId.get(1).result._meta["io.modelcontextprotocol/serverInfo"].name,
      "evavo-docs-book-unattended-authorial-writing",
    );
    assert.equal(byId.get(2).result.tools[0].inputSchema.additionalProperties, false);
    assert.equal(byId.get(3).result.structuredContent.ok, true);
    assert.equal(byId.get(4).error.code, -32601);
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].url, endpoint);
    assert.deepEqual(mock.calls[0].body, request);
  } finally {
    processHandle.child.kill("SIGTERM");
    mock.instance.close();
  }
});

test("legacy MCP retains initialize compatibility and forwards one exact call", async () => {
  const mock = await server();
  const processHandle = spawnMcp({
    ...process.env,
    EVAVO_DOCS_URL: mock.url,
    EVAVO_DOCS_TOKEN: "payload.signature",
  });
  try {
    processHandle.send({ jsonrpc: "2.0", id: 10, method: "initialize", params: { protocolVersion: "2025-11-25" } });
    processHandle.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    processHandle.send({ jsonrpc: "2.0", id: 11, method: "tools/list", params: {} });
    processHandle.send({
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: {
        name: "coordinate_book_unattended_authorial_writing",
        arguments: { input: request },
      },
    });
    await waitFor(processHandle.responses, 3);

    const byId = new Map(processHandle.responses.map((item) => [item.id, item]));
    assert.equal(byId.get(10).result.protocolVersion, "2025-11-25");
    assert.equal(byId.get(10).result.serverInfo.name, "evavo-docs-book-unattended-authorial-writing");
    assert.equal(byId.get(11).result.tools[0].name, "coordinate_book_unattended_authorial_writing");
    assert.equal(byId.get(12).result.structuredContent.ok, true);
    assert.equal(mock.calls.length, 1);
    assert.deepEqual(mock.calls[0].body, request);
  } finally {
    processHandle.child.kill("SIGTERM");
    mock.instance.close();
  }
});
