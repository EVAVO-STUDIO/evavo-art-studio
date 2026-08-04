import readline from "node:readline";
import { pathToFileURL } from "node:url";

import {
  resolveDocsSuiteApiConfiguration,
} from "./docs-suite-api-client.mjs";

const ENDPOINT = "/api/v1/book-studio/migration/state-bundle";
const MAXIMUM_REQUEST_BYTES = 4_000_000;
const MAXIMUM_RESPONSE_BYTES = 4_000_000;
const TIMEOUT_MS = 120_000;
const seenRequestIds = new Set();

async function readBoundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("BOOK_STATE_MIGRATION_RESPONSE_EMPTY");
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAXIMUM_RESPONSE_BYTES) {
      throw new Error("BOOK_STATE_MIGRATION_RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("BOOK_STATE_MIGRATION_RESPONSE_JSON_INVALID");
  }
}

async function validateBundle(bundle, environment = process.env, fetchImpl = fetch) {
  const source = JSON.stringify(bundle);
  if (!source.length || Buffer.byteLength(source, "utf8") > MAXIMUM_REQUEST_BYTES) {
    throw new Error("BOOK_STATE_MIGRATION_INPUT_TOO_LARGE");
  }
  const configuration = resolveDocsSuiteApiConfiguration(environment);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL(ENDPOINT, configuration.baseUrl), {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${configuration.token}`,
        "content-type": "application/json",
      },
      body: source,
    });
    const payload = await readBoundedJson(response);
    if (![200, 400, 422].includes(response.status)) {
      throw new Error(`BOOK_STATE_MIGRATION_HTTP_${response.status}`);
    }
    return { httpStatus: response.status, ...payload };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("BOOK_STATE_MIGRATION_AMBIGUOUS_TIMEOUT_NO_RETRY");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleBookStateMigrationMcpMessage(
  message,
  dependencies = {},
) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
    throw new Error("MCP_REQUEST_INVALID");
  }
  if (message.id !== undefined) {
    const identity = JSON.stringify(message.id);
    if (seenRequestIds.has(identity)) throw new Error("MCP_REQUEST_ID_DUPLICATE");
    seenRequestIds.add(identity);
    if (seenRequestIds.size > 10_000) seenRequestIds.clear();
  }
  if (message.method === "initialize") {
    return {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: {
        name: "evavo-docs-book-state-migration",
        version: "1.0.0",
      },
    };
  }
  if (message.method === "notifications/initialized") return undefined;
  if (message.method === "tools/list") {
    return {
      tools: [
        {
          name: "validate_book_state_migration_bundle",
          description:
            "Revalidate one exact Website Book Studio state bundle through current Docs Suite operations and approved Book Artwork Use rules. The tool performs no authoritative state write, manuscript mutation, cutover, source deletion or publication.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              bundle: { type: "object" },
            },
            required: ["bundle"],
          },
        },
      ],
    };
  }
  if (message.method === "tools/call") {
    if (
      message.params?.name !== "validate_book_state_migration_bundle" ||
      !message.params.arguments ||
      typeof message.params.arguments !== "object" ||
      Array.isArray(message.params.arguments) ||
      Object.keys(message.params.arguments).some((key) => key !== "bundle") ||
      !message.params.arguments.bundle ||
      typeof message.params.arguments.bundle !== "object" ||
      Array.isArray(message.params.arguments.bundle)
    ) {
      throw new Error("MCP_TOOL_CALL_INVALID");
    }
    const execute = dependencies.validate ?? validateBundle;
    const result = await execute(
      message.params.arguments.bundle,
      dependencies.environment,
      dependencies.fetchImpl,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
      isError: result.httpStatus !== 200,
    };
  }
  throw new Error("MCP_METHOD_UNSUPPORTED");
}

function writeReply(id, result, error) {
  const payload = error
    ? {
        jsonrpc: "2.0",
        id: id ?? null,
        error: {
          code: -32000,
          message: error instanceof Error
            ? error.message
            : "MCP request failed.",
        },
      }
    : { jsonrpc: "2.0", id: id ?? null, result };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const directEntry = process.argv[1];
if (directEntry && import.meta.url === pathToFileURL(directEntry).href) {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      writeReply(null, undefined, new Error("MCP_JSON_INVALID"));
      return;
    }
    handleBookStateMigrationMcpMessage(message)
      .then((result) => {
        if (message.id !== undefined && result !== undefined) {
          writeReply(message.id, result);
        }
      })
      .catch((error) => {
        if (message.id !== undefined) writeReply(message.id, undefined, error);
      });
  });
}
