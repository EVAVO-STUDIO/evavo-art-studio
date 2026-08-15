#!/usr/bin/env node
import process from "node:process";

import {
  loadHmfAtlasV3GameDeliveryAuthorizationCliInput,
  readHmfAtlasV3StableSingleLinkFile,
} from "./heavy-metal-fighting/frame-atlas-v3-game-delivery-authorization-cli.mjs";
import {
  verifyHmfAtlasV3GameDeliveryAuthorization,
} from "./heavy-metal-fighting/frame-atlas-v3-game-delivery-authorization.mjs";

const MAXIMUM_AUTHORIZATION_BYTES = 1024 * 1024;

function usage() {
  return [
    "HEAVY METAL FIGHTING Atlas v3 delivery authorization verifier",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting-frame-atlas-v3-verify-delivery-authorization.mjs --request <delivery-authorization-request.json> --authorization <authorization.json>",
    "",
    "The verifier re-reads the submitted authorization through the same stable single-link file boundary, reloads every request-bound evidence file, and invokes the core recomputing verifier. It performs no repository write, runtime activation, Git mutation, deployment or publication.",
  ].join("\n");
}

function decodeJson(bytes, label) {
  const body = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
    ? bytes.subarray(3)
    : bytes;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function verifyFromFiles(requestPath, authorizationPath) {
  const authorizationBytes = await readHmfAtlasV3StableSingleLinkFile(authorizationPath, {
    label: "--authorization",
    maximumBytes: MAXIMUM_AUTHORIZATION_BYTES,
  });
  const authorization = decodeJson(authorizationBytes, "--authorization");
  const input = await loadHmfAtlasV3GameDeliveryAuthorizationCliInput(requestPath);
  return verifyHmfAtlasV3GameDeliveryAuthorization({ ...input, authorization });
}

async function run(argv = process.argv.slice(2)) {
  if (
    argv.length !== 4
    || argv[0] !== "--request"
    || !argv[1]
    || argv[2] !== "--authorization"
    || !argv[3]
  ) {
    throw new Error(`verify delivery authorization requires exactly --request <request.json> --authorization <authorization.json>.\n\n${usage()}`);
  }
  return verifyFromFiles(argv[1], argv[3]);
}

run().then((result) => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
