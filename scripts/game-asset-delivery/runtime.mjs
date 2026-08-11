import path from "node:path";

import {
  arrayValue,
  hashObject,
  readJson,
  stable,
  verifyFalseAuthority,
  verifySelfHash,
  writeJsonCreateOnly,
} from "./common.mjs";
import {
  AUTHORITY_KEYS,
  BUNDLE_SCHEMA,
  FALSE_AUTHORITY,
  normalizeItem,
  prepareDeliveryRequest,
  verifyCampaign,
  verifyPreparedRequest,
  verifyStyle,
} from "./request.mjs";
import { inspectItem, verifyApproval, verifySequences } from "./inspection.mjs";

export async function compileDelivery({ requestPath, outputPath }) {
  const requestDocument = await readJson(requestPath, "delivery request");
  const request = verifyPreparedRequest(requestDocument.value);
  const campaignDocument = await readJson(request.campaignPlanPath, "campaign plan");
  const styleDocument = await readJson(request.styleProfilePath, "style profile");
  const campaignSha256 = verifyCampaign(campaignDocument.value);
  const styleSha256 = verifyStyle(styleDocument.value);
  const inspected = [];
  for (const item of request.items) inspected.push(await inspectItem(item, request.allowedSourceRoots));
  verifySequences(inspected);
  const itemBindings = inspected
    .map((item) => ({ assetId: item.assetId, targetPath: item.targetPath, sha256: item.sha256, bytes: item.bytes }))
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
  let approval = null;
  let approvalInput = null;
  if (request.approvalPath) {
    const approvalDocument = await readJson(request.approvalPath, "delivery approval");
    approval = verifyApproval(approvalDocument.value, request, itemBindings, campaignSha256, styleSha256);
    approvalInput = {
      path: approvalDocument.path,
      fileSha256: approvalDocument.sha256,
      bytes: approvalDocument.sizeBytes,
      approvalSha256: approval.approvalSha256,
    };
  }
  const bundle = {
    schema: BUNDLE_SCHEMA,
    status: approval ? "approved" : "review-required",
    projectId: request.projectId,
    gameRepository: request.gameRepository,
    gameHead: request.gameHead,
    request: {
      path: requestDocument.path,
      fileSha256: requestDocument.sha256,
      bytes: requestDocument.sizeBytes,
      requestSha256: request.requestSha256,
    },
    campaignPlan: {
      path: campaignDocument.path,
      fileSha256: campaignDocument.sha256,
      bytes: campaignDocument.sizeBytes,
      planSha256: campaignSha256,
    },
    styleProfile: {
      path: styleDocument.path,
      fileSha256: styleDocument.sha256,
      bytes: styleDocument.sizeBytes,
      profileSha256: styleSha256,
    },
    approval: approvalInput,
    requiredRoles: request.requiredRoles,
    items: Object.freeze(inspected),
    summary: {
      itemCount: inspected.length,
      totalBytes: inspected.reduce((sum, item) => sum + item.bytes, 0),
      sequenceCount: new Set(inspected.filter((item) => item.sequence).map((item) => item.sequence.clipId)).size,
      approved: approval !== null,
      completeRoleCoverage: true,
      exactSourceHashesVerified: true,
    },
    creativeApproval: approval?.creative ?? false,
    historicalApproval: approval?.historical ?? false,
    provenanceApproval: approval?.provenance ?? false,
    nativeCompositionApproval: false,
    publicationAuthority: false,
    authority: { ...FALSE_AUTHORITY },
  };
  bundle.bundleSha256 = hashObject(bundle);
  bundle.runId = bundle.bundleSha256.slice(0, 20);
  await writeJsonCreateOnly(path.resolve(outputPath), bundle, path.dirname(path.resolve(outputPath)));
  return Object.freeze(bundle);
}

export async function validateDelivery({ bundlePath }) {
  const document = await readJson(bundlePath, "delivery bundle");
  const bundle = document.value;
  if (bundle.schema !== BUNDLE_SCHEMA) throw new Error(`bundle.schema must be ${BUNDLE_SCHEMA}.`);
  verifySelfHash(bundle, "bundleSha256");
  verifyFalseAuthority(bundle.authority, AUTHORITY_KEYS, "bundle.authority");
  if (!new Set(["approved", "review-required"]).has(bundle.status)) throw new Error("bundle.status is invalid.");
  if (bundle.publicationAuthority !== false || bundle.nativeCompositionApproval !== false) {
    throw new Error("Delivery bundle may not claim publication or native composition approval.");
  }
  const items = arrayValue(bundle.items, "bundle.items", { minimum: 1, maximum: 10000 });
  const roots = [...new Set(items.map((item) => path.dirname(path.resolve(item.sourcePath))))];
  const normalizedItems = items.map((item, index) => normalizeItem({
    ...item,
    expected: { sha256: item.sha256, bytes: item.bytes, ...(item.inspection?.type === "png" ? {
      width: item.inspection.width,
      height: item.inspection.height,
      hasAlpha: item.inspection.hasAlpha,
    } : {}) },
  }, index));
  const rechecked = [];
  for (const item of normalizedItems) rechecked.push(await inspectItem(item, roots));
  verifySequences(rechecked);
  if (stable(rechecked) !== stable(items)) throw new Error("Delivery bundle item evidence differs from current source bytes.");
  if (bundle.status === "approved") {
    if (!bundle.approval || !bundle.creativeApproval || !bundle.historicalApproval || !bundle.provenanceApproval) {
      throw new Error("Approved delivery bundle lacks exact named approval evidence.");
    }
  } else if (bundle.creativeApproval || bundle.historicalApproval || bundle.provenanceApproval) {
    throw new Error("Review-required delivery bundle falsely claims approval.");
  }
  return Object.freeze({
    schema: "evavo.game-asset-delivery-validation.v2",
    status: "passed",
    bundlePath: document.path,
    bundleFileSha256: document.sha256,
    bundleSha256: bundle.bundleSha256,
    itemCount: items.length,
    deliveryStatus: bundle.status,
    authority: { ...FALSE_AUTHORITY },
  });
}

export async function prepareRequestFile({ draftPath, outputPath }) {
  const draft = await readJson(draftPath, "delivery request draft");
  const prepared = prepareDeliveryRequest(draft.value);
  await writeJsonCreateOnly(path.resolve(outputPath), prepared, path.dirname(path.resolve(outputPath)));
  return prepared;
}
