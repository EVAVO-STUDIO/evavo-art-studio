#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CANVAS, EVA_DENSE_MOTION_FAMILY_ID, EVA_DENSE_MOTION_PENDING_ORDINALS, RAW_FRAMES } from "./eva-dense-motion-work-order-data.mjs";

export const EVA_DENSE_MOTION_SOURCE_PREFLIGHT_SCHEMA = "evavo.project-art-eva-dense-motion-source-preflight.v1";
const PNG_SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);
const SAFE_COLOR_TYPES = new Set([2,4,6]);

export function gitBlobSha1(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8")).update(bytes).digest("hex");
}
export function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
export function inspectPngHeader(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33) throw new Error("EVA_DENSE_SOURCE_PNG_TOO_SHORT");
  if (!bytes.subarray(0,8).equals(PNG_SIGNATURE)) throw new Error("EVA_DENSE_SOURCE_PNG_SIGNATURE_INVALID");
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii",12,16) !== "IHDR") throw new Error("EVA_DENSE_SOURCE_PNG_IHDR_INVALID");
  const width=bytes.readUInt32BE(16), height=bytes.readUInt32BE(20), bitDepth=bytes[24], colorType=bytes[25], compressionMethod=bytes[26], filterMethod=bytes[27], interlaceMethod=bytes[28];
  if (width!==CANVAS.width || height!==CANVAS.height || bitDepth!==8 || !SAFE_COLOR_TYPES.has(colorType) || compressionMethod!==0 || filterMethod!==0 || ![0,1].includes(interlaceMethod)) throw new Error("EVA_DENSE_SOURCE_PNG_ENCODING_INVALID");
  return Object.freeze({width,height,bitDepth,colorType,alphaChannelDeclared:colorType===4||colorType===6,compressionMethod,filterMethod,interlaceMethod});
}
export function sourceRelativePath(label) { return `assets/eva-female/ChatGPT Image Aug 9, 2026, ${label}.png`; }
export function pendingSourceFrames() {
  const pending=new Set(EVA_DENSE_MOTION_PENDING_ORDINALS);
  return RAW_FRAMES.filter(([ordinal])=>pending.has(ordinal)).map(([ordinal,label,sourceGitBlobSha1])=>Object.freeze({ordinal,label,frameId:`${EVA_DENSE_MOTION_FAMILY_ID}-frame-${String(ordinal).padStart(2,"0")}`,relativePath:sourceRelativePath(label),sourceGitBlobSha1}));
}
async function assertContainedRegularFile(runtimeRootReal,filePath) {
  const metadata=await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink!==1) throw new Error("EVA_DENSE_SOURCE_FILE_UNSAFE");
  const fileReal=await realpath(filePath); const relative=path.relative(runtimeRootReal,fileReal);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("EVA_DENSE_SOURCE_PATH_ESCAPE");
}
export async function preflightEvaDenseMotionSources({runtimeRoot,frames=pendingSourceFrames()}={}) {
  if (typeof runtimeRoot!=="string" || runtimeRoot.trim().length===0) throw new Error("EVA_DENSE_SOURCE_RUNTIME_ROOT_REQUIRED");
  const runtimeRootAbsolute=path.resolve(runtimeRoot); const rootMeta=await lstat(runtimeRootAbsolute);
  if (!rootMeta.isDirectory() || rootMeta.isSymbolicLink()) throw new Error("EVA_DENSE_SOURCE_RUNTIME_ROOT_UNSAFE");
  const runtimeRootReal=await realpath(runtimeRootAbsolute);
  if (!Array.isArray(frames) || frames.length!==EVA_DENSE_MOTION_PENDING_ORDINALS.length) throw new Error("EVA_DENSE_SOURCE_PENDING_SET_INVALID");
  const expected=[...EVA_DENSE_MOTION_PENDING_ORDINALS];
  if (JSON.stringify(frames.map(f=>f.ordinal))!==JSON.stringify(expected)) throw new Error("EVA_DENSE_SOURCE_PENDING_ORDER_INVALID");
  const results=[];
  for (const frame of frames) {
    const sourcePath=path.resolve(runtimeRootAbsolute,frame.relativePath); await assertContainedRegularFile(runtimeRootReal,sourcePath);
    const bytes=await readFile(sourcePath); const actualGitBlobSha1=gitBlobSha1(bytes);
    if (actualGitBlobSha1!==frame.sourceGitBlobSha1) throw new Error(`EVA_DENSE_SOURCE_GIT_BLOB_MISMATCH:${frame.ordinal}`);
    results.push(Object.freeze({ordinal:frame.ordinal,frameId:frame.frameId,relativePath:frame.relativePath,bytes:bytes.length,gitBlobSha1:actualGitBlobSha1,sha256:sha256(bytes),...inspectPngHeader(bytes)}));
  }
  return Object.freeze({schema:EVA_DENSE_MOTION_SOURCE_PREFLIGHT_SCHEMA,ok:true,familyId:EVA_DENSE_MOTION_FAMILY_ID,runtimeRepository:"EVAVO-STUDIO/evavo-avatar-runtime",sourceMutation:false,providerExecution:false,candidateApproval:false,candidatePromotion:false,publication:false,runtimeActivation:false,pendingFrameCount:results.length,pendingOrdinals:expected,exactSourceIdentityVerified:true,exactCanvasVerified:true,sourceFrames:Object.freeze(results)});
}
function parseArguments(argv){const options={runtimeRoot:null};for(let i=0;i<argv.length;i+=1){const arg=argv[i];if(arg==="--help")return{help:true};if(arg!=="--runtime-root")throw new Error(`Unknown argument: ${arg}`);const value=argv[i+1];if(!value)throw new Error("--runtime-root requires a value");options.runtimeRoot=value;i+=1;}return options;}
const isCli=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));
if(isCli){try{const options=parseArguments(process.argv.slice(2));if(options.help)console.log("Usage: node scripts/project-art/eva-dense-motion-source-preflight.mjs --runtime-root <path-to-evavo-avatar-runtime>");else console.log(JSON.stringify(await preflightEvaDenseMotionSources(options)));}catch(error){console.error(`[eva-dense-motion-source-preflight] ERROR ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;}}
