import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(root, "scripts/evavo-docs-book-cli.mjs");
const mcpPath = path.join(root, "scripts/evavo-docs-book-mcp.mjs");
const token = "bookart.docs";

async function startServer() {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({
      method: request.method,
      path: request.url,
      authorization: request.headers.authorization,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    const source = JSON.stringify({
      ok: true,
      result: {
        outputKind: "evavo_docs_book_art_plan_translation_coordination",
        schemaVersion: 1,
        contract: "evavo_docs_book_art_plan_translation_v1",
        status: "ready_for_shadow_comparison",
        artStudioCalled: true,
        providerCallPerformed: false,
        runtimeJobSubmitted: false,
        artifactBytesWritten: false,
        authoritativeBookWritesPerformed: false,
        selectionPerformed: false,
        promotionPerformed: false,
        bookUseBindingCreated: false,
        runtimeCutoverApproved: false,
        publicationPerformed: false,
        blockers: [],
        warnings: [],
      },
    });
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(source),
    });
    response.end(source);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    server,
    requests,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function stop(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  );
}

function runNode(script, args, environment) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("Art translation CLI forwards one exact request and refuses output clobber", async (t) => {
  const runtime = await startServer();
  t.after(() => stop(runtime.server));
  const directory = await mkdtemp(path.join(os.tmpdir(), "docs-book-art-cli-"));
  const inputPath = path.join(directory, "request.json");
  const outputPath = path.join(directory, "result.json");
  const request = {
    outputKind: "evavo_legacy_website_book_art_plan_translation_input",
    schemaVersion: 1,
    brief: { exact: true },
    legacyPlan: { retained: true },
    candidateId: "candidate-1",
  };
  await writeFile(inputPath, JSON.stringify(request), "utf8");
  const environment = {
    EVAVO_DOCS_URL: runtime.origin,
    EVAVO_DOCS_TOKEN: token,
  };
  const first = await runNode(
    cliPath,
    ["art-plan-translate", "--input", inputPath, "--output", outputPath],
    environment,
  );
  assert.equal(first.code, 0, first.stderr);
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.requests[0].path, "/api/v1/book-studio/art-plan-translation");
  assert.equal(runtime.requests[0].authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(runtime.requests[0].body), request);
  assert.equal(
    JSON.parse(await readFile(outputPath, "utf8")).result.status,
    "ready_for_shadow_comparison",
  );
  const second = await runNode(
    cliPath,
    ["art-plan-translate", "--input", inputPath, "--output", outputPath],
    environment,
  );
  assert.notEqual(second.code, 0);
  assert.match(second.stderr, /EEXIST|exist/i);
});

test("MCP exposes and forwards the exact Art translation tool", async (t) => {
  const runtime = await startServer();
  t.after(() => stop(runtime.server));
  const child = spawn(process.execPath, [mcpPath], {
    cwd: root,
    env: {
      ...process.env,
      EVAVO_DOCS_URL: runtime.origin,
      EVAVO_DOCS_TOKEN: token,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => { if (!child.killed) child.kill(); });
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const queue = [];
  const waiting = [];
  lines.on("line", (line) => {
    const value = JSON.parse(line);
    const waiter = waiting.shift();
    if (waiter) waiter(value);
    else queue.push(value);
  });
  const next = () => queue.length
    ? Promise.resolve(queue.shift())
    : new Promise((resolve) => waiting.push(resolve));
  const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);

  send({
    jsonrpc: "2.0",
    id: "init-art-1",
    method: "initialize",
    params: { protocolVersion: "2025-06-18" },
  });
  assert.equal((await next()).result.serverInfo.name, "evavo-docs-book-studio");
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  send({ jsonrpc: "2.0", id: "list-art-1", method: "tools/list", params: {} });
  const listed = await next();
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    "run_book_studio_operation",
    "run_book_writing_candidate",
    "translate_legacy_book_art_plan",
  ]);
  assert.equal(listed.result.tools[2].inputSchema.additionalProperties, false);

  const request = {
    outputKind: "evavo_legacy_website_book_illustration_plan_translation_input",
    schemaVersion: 1,
    brief: { exact: true },
    legacyPlan: { retained: true },
    candidateId: "candidate-illustration-1",
  };
  send({
    jsonrpc: "2.0",
    id: "call-art-1",
    method: "tools/call",
    params: {
      name: "translate_legacy_book_art_plan",
      arguments: { request },
    },
  });
  const called = await next();
  assert.equal(called.result.isError, false);
  assert.equal(
    called.result.structuredContent.result.status,
    "ready_for_shadow_comparison",
  );
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.requests[0].path, "/api/v1/book-studio/art-plan-translation");
  assert.deepEqual(JSON.parse(runtime.requests[0].body), request);

  send({
    jsonrpc: "2.0",
    id: "call-art-1",
    method: "tools/call",
    params: {
      name: "translate_legacy_book_art_plan",
      arguments: { request },
    },
  });
  const duplicate = await next();
  assert.equal(duplicate.error.code, -32600);
  assert.match(duplicate.error.message, /already been used/i);
});
