import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import {
  MECHANICAL_CONTRACT_PROTOCOL_VERSION,
  MECHANICAL_CONTRACT_SCHEMA,
  REQUIRED_FRAME_IDS,
  assert,
  canonicalJson,
  deepFreeze,
  fail,
  sha256,
} from "./mechanical-contract/common.mjs";
import { normalizeMechanicalContract } from "./mechanical-contract/normalize.mjs";

export {
  MECHANICAL_CONTRACT_PROTOCOL_VERSION,
  MECHANICAL_CONTRACT_SCHEMA,
  REQUIRED_FRAME_IDS,
  canonicalJson,
  normalizeMechanicalContract,
  sha256,
};

export const MECHANICAL_CONTRACT_BUNDLE_SCHEMA = "evavo.mechanical-sprite-contract-bundle.v1";

async function readStableJson(filePath, label) {
  const before = await lstat(filePath);
  assert(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular non-symlink file.`);
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  assert(
    before.dev === after.dev
      && before.ino === after.ino
      && before.size === after.size
      && before.mtimeMs === after.mtimeMs,
    `${label} changed while it was being read.`,
  );
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function componentPath(bundlePath, relativePath, label) {
  assert(typeof relativePath === "string" && relativePath.trim(), `${label} must be a non-empty relative path.`);
  assert(!relativePath.includes("\\"), `${label} must use POSIX forward slashes.`);
  assert(!path.posix.isAbsolute(relativePath), `${label} must be relative.`);
  const normalized = path.posix.normalize(relativePath);
  assert(normalized === relativePath && !normalized.startsWith("../") && normalized !== ".", `${label} may not escape the bundle directory.`);
  return path.resolve(path.dirname(bundlePath), ...relativePath.split("/"));
}

async function loadBundledContract(bundlePath, bundle) {
  assert(bundle.protocolVersion === MECHANICAL_CONTRACT_PROTOCOL_VERSION, `bundle.protocolVersion must equal ${MECHANICAL_CONTRACT_PROTOCOL_VERSION}.`);
  assert(bundle.contractSchema === MECHANICAL_CONTRACT_SCHEMA, `bundle.contractSchema must equal ${MECHANICAL_CONTRACT_SCHEMA}.`);
  const components = bundle.components;
  assert(components && typeof components === "object" && !Array.isArray(components), "bundle.components must be an object.");
  assert(Array.isArray(components.frames) && components.frames.length === REQUIRED_FRAME_IDS.length, `bundle.components.frames must contain exactly ${REQUIRED_FRAME_IDS.length} entries.`);
  const [base, topology, styleProof, ...frames] = await Promise.all([
    readStableJson(componentPath(bundlePath, components.base, "bundle.components.base"), "mechanical contract base"),
    readStableJson(componentPath(bundlePath, components.topology, "bundle.components.topology"), "mechanical contract topology"),
    readStableJson(componentPath(bundlePath, components.styleProof, "bundle.components.styleProof"), "mechanical contract style proof"),
    ...components.frames.map((entry, index) => readStableJson(
      componentPath(bundlePath, entry, `bundle.components.frames[${index}]`),
      `mechanical contract Frame ${index}`,
    )),
  ]);
  return normalizeMechanicalContract({
    ...base,
    frames,
    clipBindings: topology.clipBindings,
    styleProof: styleProof.styleProof,
  });
}

export async function loadMechanicalContractFile(filePath) {
  const parsed = await readStableJson(filePath, "mechanical contract");
  if (parsed?.schema === MECHANICAL_CONTRACT_BUNDLE_SCHEMA) return loadBundledContract(filePath, parsed);
  return normalizeMechanicalContract(parsed);
}

export function mechanicalContractSummary(contractInput) {
  const contract = contractInput?.contractSha256 ? contractInput : normalizeMechanicalContract(contractInput);
  return deepFreeze({
    schema: "evavo.mechanical-sprite-contract-summary.v1",
    project: contract.project,
    contractSha256: contract.contractSha256,
    inventory: contract.inventory,
    atlas: contract.atlas,
    plannedAtlasV2: contract.plannedAtlasV2,
    clipBindings: contract.clipBindings,
    frames: contract.frames.map((frame) => deepFreeze({
      id: frame.id,
      code: frame.code,
      epithet: frame.epithet,
      pilot: frame.pilot,
      crewRequirement: frame.crewRequirement,
      targetHeightMeters: frame.targetHeightMeters,
      core: frame.core,
      motionIdentity: frame.motionIdentity,
      landmarks: frame.landmarks.length,
      hardpoints: frame.hardpoints.length,
      asymmetry: frame.asymmetry.length,
      mirrorMode: frame.mirrorPolicy.mode,
    })),
    styleProof: contract.styleProof,
    authority: contract.authority,
  });
}
