import {
  compileHmfFrameAtlasV3DeliveryPlan as compileHmfFrameAtlasV3DeliveryPlanCore,
} from "./frame-atlas-v3-delivery-core.mjs";
import {
  snapshotHmfFrameAtlasV3CompileRequest,
  snapshotHmfFrameAtlasV3FileRequest,
} from "./frame-atlas-v3-delivery-admission.mjs";
import {
  publishHmfFrameAtlasV3DeliveryPlanFile,
  verifyHmfFrameAtlasV3DeliveryPlanForPublication,
} from "./frame-atlas-v3-delivery-publication.mjs";

export {
  HMF_FRAME_ATLAS_V3_DELIVERY_CONTRACT_SCHEMA,
  HMF_FRAME_ATLAS_V3_LAYOUT_SCHEMA,
  HMF_FRAME_ATLAS_V3_PLAN_SCHEMA,
  HMF_FRAME_ATLAS_V3_PROTOCOL_VERSION,
  buildHmfFrameAtlasV3Layout,
  validateHmfFrameAtlasV3MasterRoot,
  verifyHmfFrameAtlasV3Delivery,
} from "./frame-atlas-v3-delivery-core.mjs";
export {
  HMF_FRAME_ATLAS_V3_COMPILE_REQUEST_FIELDS,
  snapshotHmfFrameAtlasV3CompileRequest,
  snapshotHmfFrameAtlasV3FileRequest,
} from "./frame-atlas-v3-delivery-admission.mjs";
export {
  HMF_FRAME_ATLAS_V3_PLAN_PUBLICATION_SCHEMA,
  publishHmfFrameAtlasV3DeliveryPlanFile,
  verifyHmfFrameAtlasV3DeliveryPlanForPublication,
} from "./frame-atlas-v3-delivery-publication.mjs";

export async function compileHmfFrameAtlasV3DeliveryPlan(input = {}) {
  const captured = snapshotHmfFrameAtlasV3CompileRequest(input);
  return compileHmfFrameAtlasV3DeliveryPlanCore(captured);
}

export async function compileHmfFrameAtlasV3DeliveryPlanFile(input, outputPath) {
  const captured = snapshotHmfFrameAtlasV3FileRequest(input, outputPath);
  const plan = await compileHmfFrameAtlasV3DeliveryPlanCore(captured.input);
  await publishHmfFrameAtlasV3DeliveryPlanFile(plan, captured.outputPath);
  return plan;
}
