import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runBookStateImportCli,
} from "../scripts/evavo-docs-book-state-import.mjs";
import {
  handleBookStateImportMcpMessage,
} from "../scripts/evavo-docs-book-state-import-mcp.mjs";

const token = "header.payload";

async function startServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}
async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function responsePayload(operation) {
  return {
    ok: true,
    operation,
    result: {
      disposition: "written",
      receipt: operation === "import"
        ? {
            outputKind: "evavo_docs_book_state_shadow_import_receipt",
            status: "committed",
            statePersisted: true,
            canonicalWriterEnabled: false,
            runtimeCutoverApproved: false,
            publicationPerformed: false,
          }
        : {
            outputKind:
              "evavo_docs_book_state_shadow_rollback_rehearsal_receipt",
            status: "rehearsal_passed",
            stateChanged: false,
            canonicalWriterEnabled: false,
            runtimeCutoverApproved: false,
            publicationPerformed: false,
          },
    },
  };
}

test("CLI forwards one exact import and refuses output clobber", async (t) => {
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
    const body = JSON.stringify(responsePayload("import"));
    response.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    response.end(body);
  });
  t.after(() => closeServer(runtime.server));

  const directory = await mkdtemp(path.join(os.tmpdir(), "book-state-import-cli-"));
  const inputPath = path.join(directory, "request.json");
  const outputPath = path.join(directory, "receipt.json");
  const request = { importId: "shadow-import-1" };
  await writeFile(inputPath, JSON.stringify(request));

  const result = await runBookStateImportCli(
    ["import", "--input", inputPath, "--output", outputPath],
    { EVAVO_DOCS_URL: runtime.origin, EVAVO_DOCS_TOKEN: token },
  );
  assert.equal(result.operation, "import");
  assert.equal(seen.method, "POST");
  assert.equal(seen.url, "/api/v1/book-studio/migration/state-import");
  assert.equal(seen.authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(seen.body), { operation: "import", request });
  assert.equal(
    JSON.parse(await readFile(outputPath, "utf8")).result.receipt.statePersisted,
    true,
  );

  await assert.rejects(
    () => runBookStateImportCli(
      ["import", "--input", inputPath, "--output", outputPath],
      { EVAVO_DOCS_URL: runtime.origin, EVAVO_DOCS_TOKEN: token },
    ),
    /EEXIST/,
  );
});

test("CLI maps rollback command to the exact non-mutating operation", async (t) => {
  let seen;
  const runtime = await startServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    seen = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const body = JSON.stringify(responsePayload("rehearse_rollback"));
    response.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    response.end(body);
  });
  t.after(() => closeServer(runtime.server));
  const directory = await mkdtemp(path.join(os.tmpdir(), "book-state-rollback-cli-"));
  const inputPath = path.join(directory, "request.json");
  await writeFile(inputPath, JSON.stringify({ rehearsalId: "rehearsal-1" }));
  const result = await runBookStateImportCli(
    ["rehearse-rollback", "--input", inputPath],
    { EVAVO_DOCS_URL: runtime.origin, EVAVO_DOCS_TOKEN: token },
  );
  assert.equal(seen.operation, "rehearse_rollback");
  assert.equal(result.result.receipt.stateChanged, false);
});

test("MCP exposes strict import and rollback tools", async () => {
  const initialized = await handleBookStateImportMcpMessage({
    jsonrpc: "2.0",
    id: "shadow-init-1",
    method: "initialize",
    params: {},
  });
  assert.equal(initialized.serverInfo.name, "evavo-docs-book-state-import");

  const listed = await handleBookStateImportMcpMessage({
    jsonrpc: "2.0",
    id: "shadow-list-1",
    method: "tools/list",
    params: {},
  });
  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    ["import_book_state_shadow", "rehearse_book_state_rollback"],
  );
  assert.equal(
    listed.tools.every((tool) => tool.inputSchema.additionalProperties === false),
    true,
  );

  let seen;
  const called = await handleBookStateImportMcpMessage(
    {
      jsonrpc: "2.0",
      id: "shadow-call-1",
      method: "tools/call",
      params: {
        name: "import_book_state_shadow",
        arguments: { request: { importId: "shadow-import-1" } },
      },
    },
    {
      invoke: async (operation, request) => {
        seen = { operation, request };
        return responsePayload(operation);
      },
    },
  );
  assert.deepEqual(seen, {
    operation: "import",
    request: { importId: "shadow-import-1" },
  });
  assert.equal(called.isError, false);

  await assert.rejects(
    () => handleBookStateImportMcpMessage(
      {
        jsonrpc: "2.0",
        id: "shadow-call-2",
        method: "tools/call",
        params: {
          name: "import_book_state_shadow",
          arguments: {
            request: { importId: "shadow-import-1" },
            inventedAuthority: true,
          },
        },
      },
      { invoke: async () => ({}) },
    ),
    /MCP_TOOL_CALL_INVALID/,
  );

  await assert.rejects(
    () => handleBookStateImportMcpMessage(
      {
        jsonrpc: "2.0",
        id: "shadow-call-1",
        method: "tools/call",
        params: {
          name: "import_book_state_shadow",
          arguments: { request: { importId: "shadow-import-1" } },
        },
      },
      { invoke: async () => ({}) },
    ),
    /MCP_REQUEST_ID_DUPLICATE/,
  );
});
