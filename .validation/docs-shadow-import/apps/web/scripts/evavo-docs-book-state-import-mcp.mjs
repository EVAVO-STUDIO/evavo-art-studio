import readline from "node:readline";
import { pathToFileURL } from "node:url";

import {
  resolveDocsSuiteApiConfiguration,
} from "./docs-suite-api-client.mjs";

const ENDPOINT = "/api/v1/book-studio/migration/state-import";
const MAXIMUM_REQUEST_BYTES = 4_200_000;
const MAXIMUM_RESPONSE_BYTES = 4_000_000;
const TIMEOUT_MS = 300_000;
const seenRequestIds = new Set();

async function readBoundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("BOOK_STATE_SHADOW_IMPORT_RESPONSE_EMPTY");
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAXIMUM_RESPONSE_BYTES) {
      throw new Error("BOOK_STATE_SHADOW_IMPORT_RESPONSE_TOO_LARGE");
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
    throw new Error("BOOK_STATE_SHADOW_IMPORT_RESPONSE_JSON_INVALID");
  }
}

async function invoke(operation, request, environment = process.env, fetchImpl = fetch) {
  const source = JSON.stringify({ operation, request });
  if (!source.length || Buffer.byteLength(source, "utf8") > MAXIMUM_REQUEST_BYTES) {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_INPUT_TOO_LARGE");
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
    if (!response.ok) {
      const code = payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : `BOOK_STATE_SHADOW_IMPORT_HTTP_${response.status}`;
      throw new Error(code);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("BOOK_STATE_SHADOW_IMPORT_AMBIGUOUS_TIMEOUT_NO_AUTOMATIC_RETRY");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleBookStateImportMcpMessage(message, dependencies = {}) {
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
        name: "evavo-docs-book-state-import",
        version: "1.0.0",
      },
    };
  }
  if (message.method === "notifications/initialized") return undefined;
  if (message.method === "tools/list") {
    return {
      tools: [
        {
          name: "import_book_state_shadow",
          description:
            "Revalidate and atomically persist one exact Website Book Studio bundle as non-authoritative Docs Suite shadow state.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: { request: { type: "object" } },
            required: ["request"],
          },
        },
        {
          name: "rehearse_book_state_rollback",
          description:
            "Verify the exact previous shadow snapshot needed for rollback without changing current state.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: { request: { type: "object" } },
            required: ["request"],
          },
        },
      ],
    };
  }
  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments;
    if (
      (name !== "import_book_state_shadow" &&
        name !== "rehearse_book_state_rollback") ||
      !args ||
      typeof args !== "object" ||
      Array.isArray(args) ||
      Object.keys(args).some((key) => key !== "request") ||
      !args.request ||
      typeof args.request !== "object" ||
      Array.isArray(args.request)
    ) throw new Error("MCP_TOOL_CALL_INVALID");
    const operation = name === "import_book_state_shadow"
      ? "import"
      : "rehearse_rollback";
    const execute = dependencies.invoke ?? invoke;
    const result = await execute(
      operation,
      args.request,
      dependencies.environment,
      dependencies.fetchImpl,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
      isError: false,
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
    handleBookStateImportMcpMessage(message)
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
