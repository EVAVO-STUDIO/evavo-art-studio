#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { brotliDecompressSync as d } from "node:zlib";
const parts=await Promise.all([
  readFile(new URL("./animation_execution_supervisor_v1_internal.payload.001.txt",import.meta.url),"utf8"),
  readFile(new URL("./animation_execution_supervisor_v1_internal.payload.002.txt",import.meta.url),"utf8"),
  readFile(new URL("./animation_execution_supervisor_v1_internal.payload.003.txt",import.meta.url),"utf8"),
  readFile(new URL("./animation_execution_supervisor_v1_internal.payload.004.txt",import.meta.url),"utf8"),
]);
const s=d(Buffer.from(parts.join(""),"base64")).toString("utf8");
const m=await import(`data:text/javascript;base64,${Buffer.from(s).toString("base64")}`);
export const {ANIMATION_EXECUTION_SUPERVISOR_PROTOCOL_VERSION,ANIMATION_EXECUTION_REQUEST_SCHEMA,ANIMATION_EXECUTION_ADAPTER_CATALOGUE_SCHEMA,ANIMATION_EXECUTION_STATE_SCHEMA,ANIMATION_EXECUTION_EVENT_SCHEMA,ANIMATION_EXECUTION_CYCLE_SCHEMA,ANIMATION_EXECUTION_ADAPTER_INPUT_SCHEMA,ANIMATION_FRAME_PROVIDER_RESULT_SCHEMA,ANIMATION_DRAWING_INSPECTION_RESULT_SCHEMA,ANIMATION_SEQUENCE_REVIEW_EVIDENCE_SCHEMA,ANIMATION_EXECUTION_STAGED_BATCH_SCHEMA,ANIMATION_EXECUTION_REVIEW_PACKET_SCHEMA,animationExecutionSupervisorAuthority,animationExecutionSha256,sealAnimationExecutionAdapterCatalogue,assertAnimationExecutionAdapterCatalogueIntegrity,sealAnimationExecutionRequest,assertAnimationExecutionRequestIntegrity,inspectAnimationCandidatePng,initializeAnimationExecutionWorkspace,planAnimationExecutionCycle,compileAnimationExecutionReviewPacket,runAnimationExecutionCycle,installAnimationSequenceCreativeApproval,getAnimationExecutionStatus,verifyAnimationExecutionWorkspace,describeAnimationExecutionSupervisor}=m;
