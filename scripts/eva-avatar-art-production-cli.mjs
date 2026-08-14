#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  capabilities,
  compileEvaAvatarArtProductionFile,
  compileRepairJob,
  productionStatus,
  reviewClip,
  reviewFrame,
  sealRelease,
  writeProviderAuthorization,
} from './project-art/eva-avatar-art-production.mjs';
function pairs(values){if(values.length%2)throw new Error('arguments must be --name value pairs');const out={};for(let i=0;i<values.length;i+=2){const k=values[i],v=values[i+1];if(!k?.startsWith('--')||v===undefined||out[k])throw new Error('invalid arguments');out[k]=v;}return out;}
function need(v,k){if(!v[k])throw new Error(`missing ${k}`);return v[k];}
function list(v,k){return need(v,k).split(',').map((x)=>x.trim()).filter(Boolean);}
export function runEvaAvatarArtProductionCli(argv=process.argv.slice(2)){
  const command=argv[0]??'capabilities';if(command==='capabilities')return capabilities();const v=pairs(argv.slice(1));
  if(command==='compile')return compileEvaAvatarArtProductionFile({profilePath:need(v,'--profile'),outputPath:need(v,'--output'),...(v['--compiled-at']?{compiledAt:v['--compiled-at']}:{})});
  if(command==='status')return productionStatus({planPath:need(v,'--plan'),receiptRoot:need(v,'--receipt-root')});
  if(command==='authorize')return writeProviderAuthorization({planPath:need(v,'--plan'),outputPath:need(v,'--output'),jobIds:list(v,'--jobs'),actorId:need(v,'--actor-id'),authorizedAt:need(v,'--authorized-at'),expiresAt:need(v,'--expires-at'),evidenceSha256:need(v,'--evidence-sha256'),allowedAdapterIds:list(v,'--allowed-adapters'),reason:need(v,'--reason')});
  if(command==='review-frame')return reviewFrame({planPath:need(v,'--plan'),receiptRoot:need(v,'--receipt-root'),frameId:need(v,'--frame-id'),finishedPath:need(v,'--finished'),finishedSha256:need(v,'--finished-sha256'),actorId:need(v,'--actor-id'),reviewedAt:need(v,'--reviewed-at'),evidenceSha256:need(v,'--evidence-sha256'),outcome:need(v,'--outcome'),gates:JSON.parse(need(v,'--gates')),notes:v['--notes']??''});
  if(command==='repair-job')return compileRepairJob({planPath:need(v,'--plan'),frameReviewPath:need(v,'--frame-review'),receiptRoot:need(v,'--receipt-root'),...(v['--compiled-at']?{compiledAt:v['--compiled-at']}:{})});
  if(command==='review-clip')return reviewClip({planPath:need(v,'--plan'),receiptRoot:need(v,'--receipt-root'),clipId:need(v,'--clip-id'),qaPath:need(v,'--qa'),actorId:need(v,'--actor-id'),reviewedAt:need(v,'--reviewed-at'),evidenceSha256:need(v,'--evidence-sha256'),outcome:need(v,'--outcome'),transitionContinuity:need(v,'--continuity'),loopClosure:need(v,'--loop'),finalTiming:need(v,'--timing'),notes:v['--notes']??''});
  if(command==='seal')return sealRelease({planPath:need(v,'--plan'),receiptRoot:need(v,'--receipt-root'),artApproverId:need(v,'--art-approver-id'),animationApproverId:need(v,'--animation-approver-id'),sealedAt:need(v,'--sealed-at'),artEvidenceSha256:need(v,'--art-evidence-sha256'),animationEvidenceSha256:need(v,'--animation-evidence-sha256'),notes:v['--notes']??''});
  throw new Error(`unknown command: ${command}`);
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);if(direct){try{process.stdout.write(`${JSON.stringify(runEvaAvatarArtProductionCli())}\n`);}catch(error){process.stderr.write(`${JSON.stringify({status:'failed',code:error?.code,error:error?.message??String(error)})}\n`);process.exitCode=2;}}
