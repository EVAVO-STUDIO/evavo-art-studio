import {
  ensureMasteringDirectory,
  removeOwnedMasteringOutput,
  writeMasteringExactOrReuse,
  writeMasteringReceiptChain,
} from "./frame-body-selected-candidate-mastering-io.mjs";

export const ensureApprovalDirectory = ensureMasteringDirectory;
export const removeOwnedApprovalOutput = removeOwnedMasteringOutput;

export async function writeApprovalExactOrReuse(filePath, bytes, expectedSha256, label) {
  return writeMasteringExactOrReuse(filePath, bytes, expectedSha256, label);
}

export async function writeApprovalReceiptChain(filePath, previousReceipts, receipt) {
  return writeMasteringReceiptChain(filePath, previousReceipts, receipt);
}
