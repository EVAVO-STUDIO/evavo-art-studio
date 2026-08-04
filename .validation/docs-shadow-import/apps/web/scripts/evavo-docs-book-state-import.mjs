import { constants as fsConstants } from "node:fs";
import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  resolveDocsSuiteApiConfiguration,
} from "./docs-suite-api-client.mjs";

const ENDPOINT = "/api/v1/book-studio/migration/state-import";
const MAXIMUM_INPUT_BYTES = 4_200_000;
const MAXIMUM_RESPONSE_BYTES = 4_000_000;
const TIMEOUT_MS = 300_000;

function usage() {
  return [
    "Usage:",
    "  node apps/web/scripts/evavo-docs-book-state-import.mjs capabilities",
    "  node apps/web/scripts/evavo-docs-book-state-import.mjs import --input request.json [--output receipt.json]",
    "  node apps/web/scripts/evavo-docs-book-state-import.mjs rehearse-rollback --input request.json [--output receipt.json]",
    "",
    "Environment:",
    "  EVAVO_DOCS_URL    Docs Suite origin. HTTPS is required outside loopback development.",
    "  EVAVO_DOCS_TOKEN  Short-lived documents:write automation grant.",
    "",
    "Import writes shadow state only. Rollback rehearsal verifies the previous snapshot without changing state.",
  ].join("\n");
}

function parse(argv) {
  const [command, ...rest] = argv;
  const flags = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const entry = rest[index];
    if (!entry?.startsWith("--")) throw new Error(`Unexpected argument: ${entry ?? ""}`);
    const key = entry.slice(2);
    if (!key || flags.has(key)) throw new Error(`Duplicate or invalid option: ${entry}`);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Option ${entry} requires a value.`);
    flags.set(key, value);
    index += 1;
  }
  return { command, flags };
}

async function readInput(filePath) {
  const bytes = await readFile(path.resolve(filePath));
  if (!bytes.byteLength || bytes.byteLength > MAXIMUM_INPUT_BYTES) {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_INPUT_SIZE_INVALID");
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_INPUT_JSON_INVALID");
  }
}

async function readBoundedJson(response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAXIMUM_RESPONSE_BYTES) {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_RESPONSE_TOO_LARGE");
  }
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

async function callImport(method, body, environment, fetchImpl) {
  const configuration = resolveDocsSuiteApiConfiguration(environment);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL(ENDPOINT, configuration.baseUrl), {
      method,
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${configuration.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

async function writeNoClobber(filePath, payload) {
  const output = path.resolve(filePath);
  const handle = await open(
    output,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function runBookStateImportCli(
  argv = process.argv.slice(2),
  environment = process.env,
  fetchImpl = fetch,
) {
  const { command, flags } = parse(argv);
  if (!command || ["help", "--help", "-h"].includes(command)) {
    process.stdout.write(`${usage()}\n`);
    return undefined;
  }
  if (command === "capabilities") {
    if (flags.size) throw new Error("capabilities does not accept options.");
    const result = await callImport("GET", undefined, environment, fetchImpl);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  const operation = command === "import"
    ? "import"
    : command === "rehearse-rollback"
      ? "rehearse_rollback"
      : undefined;
  if (!operation) throw new Error(`Unknown command: ${command}`);
  for (const key of flags.keys()) {
    if (key !== "input" && key !== "output") {
      throw new Error(`Unsupported option --${key}.`);
    }
  }
  const inputPath = flags.get("input");
  if (!inputPath) throw new Error("--input is required.");
  const request = await readInput(inputPath);
  const result = await callImport(
    "POST",
    { operation, request },
    environment,
    fetchImpl,
  );
  const outputPath = flags.get("output");
  if (outputPath) await writeNoClobber(outputPath, result);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const directEntry = process.argv[1];
if (directEntry && import.meta.url === pathToFileURL(directEntry).href) {
  runBookStateImportCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
