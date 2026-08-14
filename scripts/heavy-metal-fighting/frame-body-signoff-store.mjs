import {
  ensureMasteringDirectory,
  removeOwnedMasteringOutput,
  writeMasteringExactOrReuse,
  writeMasteringReceiptChain,
} from "./frame-body-selected-candidate-mastering-io.mjs";

export async function ensureMasterSignoffDirectory(root, relativeDirectory) {
  return ensureMasteringDirectory(root, relativeDirectory);
}

export async function writeMasterSignoffExactOrReuse(
  filePath,
  bytes,
  expectedSha256,
  label,
) {
  return writeMasteringExactOrReuse(filePath, bytes, expectedSha256, label);
}

export async function removeOwnedMasterSignoffOutput(filePath, expectedIdentity) {
  return removeOwnedMasteringOutput(filePath, expectedIdentity);
}

export async function writeMasterSignoffReceiptChain(
  filePath,
  previousReceipts,
  receipt,
) {
  return writeMasteringReceiptChain(filePath, previousReceipts, receipt);
}
