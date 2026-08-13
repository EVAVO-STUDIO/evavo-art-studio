import path from "node:path";
import {
  LayeredGodotGitPushVerifierError,
  MAXIMUM_VERIFIER_INPUT_BYTES,
  verifierFail,
} from "./protocol.mjs";
import { captureStableFileRead } from "./buffers.mjs";
import { verifyLayeredGodotPushReceipt } from "./runtime.mjs";

async function readJson(filePath, label, readStableRegularFile) {
  const inspected = captureStableFileRead(
    await readStableRegularFile(path.resolve(filePath), label),
    label,
  );
  if (inspected.bytes > MAXIMUM_VERIFIER_INPUT_BYTES) {
    verifierFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  }
  try {
    return JSON.parse(inspected.data.toString("utf8"));
  } catch {
    verifierFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`);
  }
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (command !== "verify") {
    verifierFail(
      "CLI_INVALID",
      "Usage: layered-godot-git-push-verifier.mjs verify --commit-receipt FILE --push-receipt FILE --workspace DIR --repository OWNER/REPO",
    );
  }
  if (rest.length % 2 !== 0) verifierFail("CLI_INVALID", "CLI flags must be --flag value pairs.");
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      verifierFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`);
    }
    if (values.has(flag)) verifierFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`);
    values.set(flag, value);
  }
  const allowed = [
    "--commit-receipt",
    "--push-receipt",
    "--workspace",
    "--repository",
  ];
  for (const key of allowed) if (!values.has(key)) verifierFail("CLI_INVALID", `Missing ${key}.`);
  for (const key of values.keys()) if (!allowed.includes(key)) verifierFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
  return values;
}

export async function runCli(argv = process.argv.slice(2)) {
  try {
    const values = parseCli(argv);
    const filesystem = await import("../layered-godot-workspace-writer/filesystem.mjs");
    const commitReceipt = await readJson(
      values.get("--commit-receipt"),
      "commit receipt",
      filesystem.readStableRegularFile,
    );
    const pushReceipt = await readJson(
      values.get("--push-receipt"),
      "push receipt",
      filesystem.readStableRegularFile,
    );
    console.log(JSON.stringify(await verifyLayeredGodotPushReceipt({
      commitReceipt,
      pushReceipt,
      workspaceRoot: path.resolve(values.get("--workspace")),
      expectedRepository: values.get("--repository"),
    }), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      code: error instanceof LayeredGodotGitPushVerifierError
        ? error.code
        : "LAYERED_GODOT_GIT_PUSH_VERIFIER_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof LayeredGodotGitPushVerifierError && error.details !== undefined
        ? { details: error.details }
        : {}),
    }, null, 2));
    process.exitCode = 1;
  }
}
