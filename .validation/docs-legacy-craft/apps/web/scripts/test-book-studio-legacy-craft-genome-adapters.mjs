import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(root, "apps/web/scripts/evavo-docs-book-legacy-craft-genome-cli.mjs");
const mcp = path.join(root, "apps/web/scripts/evavo-docs-book-legacy-craft-genome-mcp.mjs");
const sourceCommit = "b".repeat(40);
const payload = {
  operation: "compile_profile",
  compileInput: {
    programmeId: "programme:test",
    profileId: "craft:test:1",
    profileVersion: 1,
    influences: [],
    projectVoiceAnchorIds: [],
    narrativeConstraintIds: [],
    acceptedPatternIds: [],
    rejectedPatternIds: [],
  },
};

const expectedTools = [
  "compile_legacy_book_craft_profile",
  "create_legacy_book_craft_provider_packet",
  "validate_legacy_book_craft_provider_response",
  "scan_legacy_book_craft_phrase_overlap",
];

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

async function server(options = {}) {
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
    const status = options.status ?? 200;
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(status >= 400
      ? { ok: false, error: "mock rejection", code: "MOCK_REJECTION" }
      : {
          ok: true,
          result: {
            outputKind: "evavo_docs_book_legacy_craft_genome_result",
            status: "completed",
            operation: calls.at(-1)?.body?.payload?.operation,
            providerCalled: false,
            canonicalManuscriptMutationPerformed: false,
            automaticCanonicalAdmissionAllowed: false,
            publicationPerformed: false,
          },
        }));
  });
  await new Promise((resolve) => instance.listen(0, "127.0.0.1", resolve));
  const address = instance.address();
  return {
    instance,
    calls,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => instance.close(resolve)),
  };
}

function assertEnvelope(call, requestedBy) {
  assert.equal(call.method, "POST");
  assert.equal(call.url, "/api/v1/book-studio/legacy-craft-genome");
  assert.equal(call.authorization, "Bearer payload.signature");
  assert.equal(call.body.outputKind, "evavo_docs_book_legacy_craft_genome_request");
  assert.equal(call.body.contract, "evavo_docs_book_legacy_craft_genome_v1");
  assert.equal(call.body.authorityMode, "compatibility_migration");
  assert.equal(call.body.sourceRepository, "EVAVO-STUDIO/Website");
  assert.equal(call.body.sourceCommit, sourceCommit);
  assert.equal(call.body.requestedBy, requestedBy);
  assert.deepEqual(call.body.payload, payload);
  assert.equal(call.body.authoritativeWritesAllowed, false);
  assert.equal(call.body.providerCallAllowed, false);
  assert.equal(call.body.canonicalManuscriptMutationAllowed, false);
  assert.equal(call.body.automaticCanonicalAdmissionAllowed, false);
  assert.equal(call.body.runtimeCutoverApproved, false);
  assert.equal(call.body.publicationPerformed, false);
  assert.match(call.body.requestId, /^legacy-craft:/);
  assert.equal(Number.isNaN(Date.parse(call.body.requestedAt)), false);
}

test("CLI reserves no-clobber output before one exact compatibility request", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "book-legacy-craft-cli-"));
  const input = path.join(temp, "input.json");
  const output = path.join(temp, "result.json");
  await writeFile(input, JSON.stringify(payload));
  const mock = await server();
  try {
    const env = {
      ...process.env,
      EVAVO_DOCS_URL: mock.url,
      EVAVO_DOCS_TOKEN: "payload.signature",
      EVAVO_WEBSITE_COMMIT_SHA: sourceCommit,
    };
    const first = await run(process.execPath, [cli, "compile-profile", "--input", input, "--output", output], { env });
    assert.equal(first.code, 0, first.stderr);
    assert.equal(mock.calls.length, 1);
    assertEnvelope(mock.calls[0], "EVAVO Docs Suite legacy craft-genome CLI");
    assert.equal(JSON.parse(await readFile(output, "utf8")).result.status, "completed");

    const replay = await run(process.execPath, [cli, "compile-profile", "--input", input, "--output", output], { env });
    assert.notEqual(replay.code, 0);
    assert.match(replay.stderr, /EEXIST|file already exists/i);
    assert.equal(mock.calls.length, 1, "No-clobber replay must fail before transport.");
  } finally {
    await mock.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI does not retry a rejected compatibility request", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "book-legacy-craft-cli-reject-"));
  const input = path.join(temp, "input.json");
  await writeFile(input, JSON.stringify(payload));
  const mock = await server({ status: 503 });
  try {
    const result = await run(process.execPath, [cli, "compile-profile", "--input", input], {
      env: {
        ...process.env,
        EVAVO_DOCS_URL: mock.url,
        EVAVO_DOCS_TOKEN: "payload.signature",
        EVAVO_WEBSITE_COMMIT_SHA: sourceCommit,
      },
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /mock rejection/i);
    assert.equal(mock.calls.length, 1);
  } finally {
    await mock.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test("MCP lists strict tools and forwards one exact compatibility envelope", async () => {
  const mock = await server();
  const child = spawn(process.execPath, [mcp], {
    env: {
      ...process.env,
      EVAVO_DOCS_URL: mock.url,
      EVAVO_DOCS_TOKEN: "payload.signature",
      EVAVO_WEBSITE_COMMIT_SHA: sourceCommit,
    },
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
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "compile_legacy_book_craft_profile", arguments: { payload } } });
    const deadline = Date.now() + 5_000;
    while (responses.length < 3 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(responses.length, 3);
    assert.equal(responses[0].result.serverInfo.name, "evavo-docs-book-legacy-craft-genome");
    assert.deepEqual(responses[1].result.tools.map((item) => item.name), expectedTools);
    for (const item of responses[1].result.tools) {
      assert.equal(item.inputSchema.additionalProperties, false);
      assert.deepEqual(item.inputSchema.required, ["payload"]);
    }
    assert.equal(responses[2].result.structuredContent.result.status, "completed");
    assert.equal(mock.calls.length, 1);
    assertEnvelope(mock.calls[0], "EVAVO Docs Suite legacy craft-genome MCP");
  } finally {
    child.kill("SIGTERM");
    await mock.close();
  }
});

test("MCP rejects extra arguments and duplicate request identities without transport", async () => {
  const mock = await server();
  const child = spawn(process.execPath, [mcp], {
    env: {
      ...process.env,
      EVAVO_DOCS_URL: mock.url,
      EVAVO_DOCS_TOKEN: "payload.signature",
      EVAVO_WEBSITE_COMMIT_SHA: sourceCommit,
    },
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
    send({ jsonrpc: "2.0", id: "init", method: "initialize", params: { protocolVersion: "2025-11-25" } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: "bad", method: "tools/call", params: { name: "compile_legacy_book_craft_profile", arguments: { payload, extra: true } } });
    send({ jsonrpc: "2.0", id: "bad", method: "tools/list", params: {} });
    const deadline = Date.now() + 5_000;
    while (responses.length < 3 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(responses.length, 3);
    assert.equal(responses[1].result.isError, true);
    assert.match(responses[1].result.structuredContent.error, /exactly one payload object/i);
    assert.equal(responses[2].error.code, -32600);
    assert.equal(mock.calls.length, 0);
  } finally {
    child.kill("SIGTERM");
    await mock.close();
  }
});
