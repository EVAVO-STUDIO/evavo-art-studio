import {
  ensureApprovalDirectory,
  removeOwnedApprovalOutput,
  writeApprovalExactOrReuse,
  writeApprovalReceiptChain,
} from "./frame-body-named-human-approval-io.mjs";

export const ensureDeliveryReadinessDirectory = ensureApprovalDirectory;
export const removeOwnedDeliveryReadinessOutput = removeOwnedApprovalOutput;

export async function writeDeliveryReadinessExactOrReuse(
  filePath,
  bytes,
  expectedSha256,
  label,
) {
  return writeApprovalExactOrReuse(filePath, bytes, expectedSha256, label);
}

export async function writeDeliveryReadinessReceiptChain(
  filePath,
  previousReceipts,
  receipt,
) {
  return writeApprovalReceiptChain(filePath, previousReceipts, receipt);
}
