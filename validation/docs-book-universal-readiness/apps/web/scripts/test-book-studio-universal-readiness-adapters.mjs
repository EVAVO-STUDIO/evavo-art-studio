import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(root, "apps/web/scripts/evavo-docs-book-readiness-cli.mjs");
const mcp = path.join(root, "apps/web/scripts/evavo-docs-book-readiness-mcp.mjs");
const project = {
  projectId: "readiness-project",
  programmeId: "readiness-programme",
  projectTitle: "Readiness Project",
};

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
  const instance = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    calls.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body: body ? JSON.parse(body) : undefined,
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: true,
      readyForAutomation: true,
      result: {
        outputKind: "evavo_docs_book_universal_readiness",
        status: "ready_for_automation",
        projectId: "readiness-project",
      },
    }));
  });
  await new Promise((resolve) => instance.listen(0, "127.0.0.1", resolve));
  const address = instance.address();
  return { instance, calls, url: `http://127.0.0.1:${address.port}` };
}

test("CLI posts the exact Book project and preserves no-clobber output", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "book-readiness-cli-"));
  const input = path.join(temp, "project.json");
  const output = path.join(temp, "readiness.json");
  await writeFile(input, JSON.stringify(project));
  const mock = await server();
  try {
    const env = { ...process.env, EVAVO_DOCS_URL: mock.url, EVAVO_DOCS_TOKEN: "payload.signature" };
    const first = await run(process.execPath, [cli, "compile", "--input", input, "--output", output], { env });
    assert.equal(first.code, 0, first.stderr);
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].method, "POST");
    assert.equal(mock.calls[0].url, "/api/v1/book-studio/universal-readiness");
    assert.equal(mock.calls[0].authorization, "Bearer payload.signature");
    assert.deepEqual(mock.calls[0].body, project);
    assert.equal(JSON.parse(await readFile(output, "utf8")).readyForAutomation, true);

    const replay = await run(process.execPath, [cli, "compile", "--input", input, "--output", output], { env });
    assert.notEqual(replay.code, 0);
    assert.match(replay.stderr, /EEXIST|file already exists/i);
  } finally {
    mock.instance.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test("MCP lists one strict readiness tool and forwards the exact Book project", async () => {
  const mock = await server();
  const child = spawn(process.execPath, [mcp], {
    env: { ...process.env, EVAVO_DOCS_URL: mock.url, EVAVO_DOCS_TOKEN: "payload.signature" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const responses = [];
  let buffer = "";
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
  const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "compile_book_universal_readiness", arguments: { project } },
    });
    const deadline = Date.now() + 5_000;
    while (responses.length < 3 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(responses.length, 3);
    assert.equal(responses[0].result.serverInfo.name, "evavo-docs-book-readiness");
    assert.equal(responses[1].result.tools[0].name, "compile_book_universal_readiness");
    assert.equal(responses[1].result.tools[0].inputSchema.additionalProperties, false);
    assert.equal(responses[2].result.structuredContent.readyForAutomation, true);
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].url, "/api/v1/book-studio/universal-readiness");
    assert.equal(mock.calls[0].authorization, "Bearer payload.signature");
    assert.deepEqual(mock.calls[0].body, project);
  } finally {
    child.kill("SIGTERM");
    mock.instance.close();
  }
});
