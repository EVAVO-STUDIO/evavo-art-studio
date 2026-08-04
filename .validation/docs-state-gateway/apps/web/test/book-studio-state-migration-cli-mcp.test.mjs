import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runBookStateMigrationCli } from "../scripts/evavo-docs-book-state-migration.mjs";
import { handleBookStateMigrationMcpMessage } from "../scripts/evavo-docs-book-state-migration-mcp.mjs";

const token = "header.payload";

async function startServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function responsePayload(status = "ready_for_cutover_review") {
  return {
    ok: status === "ready_for_cutover_review",
    result: {
      outputKind: "evavo_docs_book_state_migration_bundle_result",
      schemaVersion: 1,
      contract: "evavo_docs_book_state_migration_bundle_v1",
      status,
      bundleId: "bundle-1",
      blockers: status === "ready_for_cutover_review" ? [] : ["state needs review"],
      warnings: [],
      statePersisted: false,
      docsSuiteCanonicalWriterEnabled: false,
      runtimeCutoverApproved: false,
      sourceDeletionApproved: false,
      publicationPerformed: false,
    },
  };
}

test("CLI forwards the exact bundle, preserves 422 review state and refuses output clobber", async (t) => {
  let seen;
  const runtime = await startServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    seen = {
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body: Buffer.concat(chunks).toString("utf8"),
    };
    const body = JSON.stringify(responsePayload("needs_resolution"));
    response.writeHead(422, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    response.end(body);
  });
  t.after(() => closeServer(runtime.server));

  const directory = await mkdtemp(path.join(os.tmpdir(), "book-state-cli-"));
  const inputPath = path.join(directory, "bundle.json");
  const outputPath = path.join(directory, "result.json");
  const bundle = {
    outputKind: "evavo_docs_book_state_migration_bundle_input",
    schemaVersion: 1,
    contract: "evavo_docs_book_state_migration_bundle_v1",
    bundleId: "bundle-1",
  };
  await writeFile(inputPath, JSON.stringify(bundle));

  const result = await runBookStateMigrationCli(
    ["validate", "--input", inputPath, "--output", outputPath],
    { EVAVO_DOCS_URL: runtime.origin, EVAVO_DOCS_TOKEN: token },
  );
  assert.equal(result.httpStatus, 422);
  assert.equal(result.result.status, "needs_resolution");
  assert.equal(seen.method, "POST");
  assert.equal(seen.url, "/api/v1/book-studio/migration/state-bundle");
  assert.equal(seen.authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(seen.body), bundle);
  assert.equal(JSON.parse(await readFile(outputPath, "utf8")).httpStatus, 422);

  await assert.rejects(
    () => runBookStateMigrationCli(
      ["validate", "--input", inputPath, "--output", outputPath],
      { EVAVO_DOCS_URL: runtime.origin, EVAVO_DOCS_TOKEN: token },
    ),
    /EEXIST/,
  );
});

test("MCP exposes one strict validation tool and forwards one exact bundle", async () => {
  const initialized = await handleBookStateMigrationMcpMessage({
    jsonrpc: "2.0",
    id: "state-init-1",
    method: "initialize",
    params: {},
  });
  assert.equal(initialized.serverInfo.name, "evavo-docs-book-state-migration");

  const listed = await handleBookStateMigrationMcpMessage({
    jsonrpc: "2.0",
    id: "state-list-1",
    method: "tools/list",
    params: {},
  });
  assert.equal(listed.tools.length, 1);
  assert.equal(listed.tools[0].name, "validate_book_state_migration_bundle");
  assert.equal(listed.tools[0].inputSchema.additionalProperties, false);

  const bundle = { bundleId: "bundle-1" };
  let seen;
  const called = await handleBookStateMigrationMcpMessage(
    {
      jsonrpc: "2.0",
      id: "state-call-1",
      method: "tools/call",
      params: {
        name: "validate_book_state_migration_bundle",
        arguments: { bundle },
      },
    },
    {
      validate: async (value) => {
        seen = value;
        return { httpStatus: 200, ...responsePayload() };
      },
    },
  );
  assert.deepEqual(seen, bundle);
  assert.equal(called.isError, false);
  assert.equal(called.structuredContent.result.statePersisted, false);

  await assert.rejects(
    () => handleBookStateMigrationMcpMessage(
      {
        jsonrpc: "2.0",
        id: "state-call-2",
        method: "tools/call",
        params: {
          name: "validate_book_state_migration_bundle",
          arguments: { bundle, inventedAuthority: true },
        },
      },
      { validate: async () => ({ httpStatus: 200 }) },
    ),
    /MCP_TOOL_CALL_INVALID/,
  );

  await assert.rejects(
    () => handleBookStateMigrationMcpMessage(
      {
        jsonrpc: "2.0",
        id: "state-call-1",
        method: "tools/call",
        params: {
          name: "validate_book_state_migration_bundle",
          arguments: { bundle },
        },
      },
      { validate: async () => ({ httpStatus: 200 }) },
    ),
    /MCP_REQUEST_ID_DUPLICATE/,
  );
});
