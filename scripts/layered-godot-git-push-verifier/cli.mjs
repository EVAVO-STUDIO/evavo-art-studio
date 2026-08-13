import path from "node:path";
import {
  LayeredGodotGitPushVerifierError,
  MAXIMUM_VERIFIER_INPUT_BYTES,
  verifierFail,
} from "./protocol.mjs";
import { captureStableFileRead } from "./buffers.mjs";
import { createDeliveryEvidenceBundle } from "./delivery-evidence.mjs";
import { validateDeliveryEvidenceBundle } from "./delivery-evidence-contract.mjs";
import { publishDeliveryEvidenceBundle } from "./delivery-evidence-publication.mjs";
import { verifyLayeredGodotPushReceipt } from "./runtime.mjs";

const COMMAND_FLAGS = Object.freeze({
  verify: [
    "--commit-receipt",
    "--push-receipt",
    "--workspace",
    "--repository",
  ],
  bundle: [
    "--commit-receipt",
    "--push-receipt",
    "--verification-receipt",
    "--workspace",
    "--repository",
    "--output",
  ],
  "validate-bundle": [
    "--bundle",
    "--workspace",
    "--repository",
  ],
});

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
  const allowed = Object.hasOwn(COMMAND_FLAGS, command) ? COMMAND_FLAGS[command] : null;
  if (!allowed) {
    verifierFail(
      "CLI_INVALID",
      "Usage: layered-godot-git-push-verifier.mjs <verify|bundle|validate-bundle> with exact command flags.",
    );
  }
  if (rest.length % 2 !== 0) {
    verifierFail("CLI_INVALID", "CLI flags must be --flag value pairs.");
  }
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
  for (const key of allowed) {
    if (!values.has(key)) verifierFail("CLI_INVALID", `Missing ${key}.`);
  }
  for (const key of values.keys()) {
    if (!allowed.includes(key)) verifierFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
  }
  return Object.freeze({ command, values });
}

export async function runCli(argv = process.argv.slice(2)) {
  try {
    const { command, values } = parseCli(argv);
    const filesystem = await import("../layered-godot-workspace-writer/filesystem.mjs");
    const repository = values.get("--repository");
    const workspaceRoot = path.resolve(values.get("--workspace"));

    if (command === "validate-bundle") {
      const bundle = await readJson(
        values.get("--bundle"),
        "delivery evidence bundle",
        filesystem.readStableRegularFile,
      );
      console.log(JSON.stringify(
        validateDeliveryEvidenceBundle(bundle, repository, workspaceRoot),
        null,
        2,
      ));
      return;
    }

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

    if (command === "verify") {
      console.log(JSON.stringify(await verifyLayeredGodotPushReceipt({
        commitReceipt,
        pushReceipt,
        workspaceRoot,
        expectedRepository: repository,
      }), null, 2));
      return;
    }

    const verificationReceipt = await readJson(
      values.get("--verification-receipt"),
      "verification receipt",
      filesystem.readStableRegularFile,
    );
    const bundle = createDeliveryEvidenceBundle({
      commitReceipt,
      pushReceipt,
      verificationReceipt,
      workspaceRoot,
      expectedRepository: repository,
    });
    const publicationReceipt = await publishDeliveryEvidenceBundle({
      bundle,
      workspaceRoot,
      expectedRepository: repository,
      outputPath: path.resolve(values.get("--output")),
    });
    console.log(JSON.stringify(publicationReceipt, null, 2));
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
