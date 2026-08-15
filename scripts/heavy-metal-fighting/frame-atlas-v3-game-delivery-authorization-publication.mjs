import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, link, open, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  compileHmfAtlasV3GameDeliveryAuthorization,
  HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PROTOCOL_VERSION,
  HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA,
  verifyHmfAtlasV3GameDeliveryAuthorization,
} from "./frame-atlas-v3-game-delivery-authorization.mjs";
import {
  loadHmfAtlasV3GameDeliveryAuthorizationCliInput,
  readHmfAtlasV3StableSingleLinkFile,
} from "./frame-atlas-v3-game-delivery-authorization-cli.mjs";
import { freeze, hashValue } from "./frame-body-named-human-approval-common.mjs";

export const HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PUBLICATION_SCHEMA =
  "evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization-publication.v1";
export const HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PUBLICATION_PROTOCOL_VERSION =
  "2026-08-15.1";

const GAME_REPOSITORY = "EVAVO-STUDIO/steel-dominion";
const GIT_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PORTABLE_JSON = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}\.json$/u;
const MAX_AUTHORIZATION_BYTES = 1024 * 1024;

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_ATLAS_V3_DELIVERY_AUTHORIZATION_PUBLICATION_INVALID: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}
function assertChainUnchanged(before, after, label) {
  assert(before.length === after.length, `${label} path changed during publication.`);
  before.forEach((prior, index) => {
    const current = after[index];
    assert(
      prior.path === current.path && sameIdentity(prior.info, current.info),
      `${label} path component changed identity during publication: ${prior.path}`,
    );
  });
}
async function inspectDirectoryChain(directory, label) {
  const resolved = path.resolve(directory);
  const parsed = path.parse(resolved);
  const segments = path.relative(parsed.root, resolved).split(path.sep).filter(Boolean);
  let current = parsed.root;
  const entries = [];
  for (const segment of segments) {
    current = path.join(current, segment);
    const info = await lstat(current, { bigint: true });
    assert(!info.isSymbolicLink(), `${label} may not contain a symbolic link or junction: ${current}`);
    assert(info.isDirectory(), `${label} component must remain a directory: ${current}`);
    entries.push(Object.freeze({ path: current, info }));
  }
  if (segments.length === 0) {
    const info = await lstat(parsed.root, { bigint: true });
    entries.push(Object.freeze({ path: parsed.root, info }));
  }
  return Object.freeze(entries);
}
async function assertDestinationAbsent(outputPath) {
  try {
    await lstat(outputPath, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  fail(`authorization output already exists and will not be replaced: ${outputPath}`);
}
async function fsyncDirectory(directory) {
  if (process.platform === "win32") return;
  const handle = await open(
    directory,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0),
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function unlinkOwned(candidate, expectedIdentity) {
  try {
    const info = await lstat(candidate, { bigint: true });
    if (sameIdentity(info, expectedIdentity)) await unlink(candidate);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
function admitAuthorizationForLocalPublication(value) {
  assert(value && typeof value === "object" && !Array.isArray(value), "authorization must be an object.");
  assert(value.schema === HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA, "authorization schema drifted.");
  assert(
    value.protocolVersion === HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PROTOCOL_VERSION,
    "authorization protocol drifted.",
  );
  assert(value.gameRepository === GAME_REPOSITORY, "authorization repository drifted.");
  assert(typeof value.gameHead === "string" && GIT_SHA.test(value.gameHead), "authorization gameHead must be a Git SHA.");
  assert(
    typeof value.authorizationSha256 === "string" && SHA256.test(value.authorizationSha256),
    "authorizationSha256 must be SHA-256.",
  );
  const body = structuredClone(value);
  delete body.authorizationSha256;
  assert(hashValue(body) === value.authorizationSha256, "authorizationSha256 does not match canonical content.");
  return freeze(structuredClone(value));
}
function authorizationBytes(authorization) {
  const bytes = Buffer.from(`${JSON.stringify(authorization, null, 2)}\n`, "utf8");
  assert(bytes.length >= 1 && bytes.length <= MAX_AUTHORIZATION_BYTES, "authorization exceeds the publication byte bound.");
  return bytes;
}
function publicationReceipt(authorization, outputPath, bytes) {
  const body = {
    schema: HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PUBLICATION_SCHEMA,
    protocolVersion: HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PUBLICATION_PROTOCOL_VERSION,
    projectId: "heavy-metal-fighting",
    publicTitle: "HEAVY METAL FIGHTING",
    gameRepository: GAME_REPOSITORY,
    gameHead: authorization.gameHead,
    authorizationSha256: authorization.authorizationSha256,
    output: {
      path: outputPath,
      bytes: bytes.length,
      sha256: sha256Bytes(bytes),
    },
    checks: {
      selfHashedAuthorizationAdmitted: true,
      createOnlyOutput: true,
      atomicNoReplacePublication: true,
      stableSingleLinkReadback: true,
      exactByteReadback: true,
    },
    authority: {
      localAuthorizationEvidenceWrite: true,
      gameRepositoryMutation: false,
      runtimeActivation: false,
      gitMutation: false,
      deployment: false,
      externalPublication: false,
      forcePush: false,
    },
  };
  return freeze({ ...body, publicationReceiptSha256: hashValue(body) });
}

export async function publishHmfAtlasV3GameDeliveryAuthorizationFile({ authorization, outputPath }) {
  const admitted = admitAuthorizationForLocalPublication(authorization);
  assert(typeof outputPath === "string" && outputPath.trim() === outputPath && outputPath.length > 0, "outputPath must be a non-empty trimmed path.");
  const resolvedOutput = path.resolve(outputPath);
  const filename = path.basename(resolvedOutput);
  assert(PORTABLE_JSON.test(filename), "authorization output must use one portable .json filename.");
  const parent = path.dirname(resolvedOutput);
  const initialParentChain = await inspectDirectoryChain(parent, "authorization output parent");
  await assertDestinationAbsent(resolvedOutput);

  const bytes = authorizationBytes(admitted);
  const stagePath = path.join(
    parent,
    `.${filename}.stage-${process.pid}-${randomUUID()}`,
  );
  let stageIdentity;
  let outputPublished = false;
  try {
    const handle = await open(
      stagePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    try {
      if (typeof handle.chmod === "function") await handle.chmod(0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      stageIdentity = await handle.stat({ bigint: true });
      assert(stageIdentity.isFile() && stageIdentity.nlink === 1n, "authorization stage must be one regular-file link.");
      assert(stageIdentity.size === BigInt(bytes.length), "authorization stage byte count drifted.");
    } finally {
      await handle.close();
    }

    assertChainUnchanged(
      initialParentChain,
      await inspectDirectoryChain(parent, "authorization output parent"),
      "authorization output parent",
    );
    await assertDestinationAbsent(resolvedOutput);
    try {
      await link(stagePath, resolvedOutput);
    } catch (error) {
      if (error?.code === "EEXIST") {
        fail(`authorization output appeared during publication and was preserved: ${resolvedOutput}`);
      }
      throw error;
    }
    outputPublished = true;
    await unlink(stagePath);
    await fsyncDirectory(parent);

    assertChainUnchanged(
      initialParentChain,
      await inspectDirectoryChain(parent, "authorization output parent"),
      "authorization output parent",
    );
    const outputInfo = await lstat(resolvedOutput, { bigint: true });
    assert(
      outputInfo.isFile() && outputInfo.nlink === 1n && sameIdentity(outputInfo, stageIdentity),
      "published authorization file identity drifted.",
    );
    const readback = await readHmfAtlasV3StableSingleLinkFile(resolvedOutput, {
      label: "published delivery authorization",
      maximumBytes: MAX_AUTHORIZATION_BYTES,
    });
    assert(readback.equals(bytes), "published authorization bytes differ from the verified authorization.");
    return publicationReceipt(admitted, resolvedOutput, bytes);
  } catch (error) {
    if (stageIdentity) {
      await unlinkOwned(stagePath, stageIdentity);
      if (outputPublished) await unlinkOwned(resolvedOutput, stageIdentity);
    }
    throw error;
  }
}

export async function compileVerifyAndPublishHmfAtlasV3GameDeliveryAuthorizationFromRequestFile(
  requestPath,
  outputPath,
) {
  const input = await loadHmfAtlasV3GameDeliveryAuthorizationCliInput(requestPath);
  const authorization = compileHmfAtlasV3GameDeliveryAuthorization(input);
  const verified = verifyHmfAtlasV3GameDeliveryAuthorization({ ...input, authorization });
  return publishHmfAtlasV3GameDeliveryAuthorizationFile({ authorization: verified, outputPath });
}
