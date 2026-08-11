#!/usr/bin/env node
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export * from './raw-art-folder/lib.mjs';
export * from './raw-art-folder/scan.mjs';
export * from './raw-art-folder/plan.mjs';
export * from './raw-art-folder/session.mjs';
import { writeJsonCreateOnly } from './raw-art-folder/lib.mjs';
import { scanRawArtFolder } from './raw-art-folder/scan.mjs';
import { compileRawArtSessionPlan } from './raw-art-folder/plan.mjs';
import { materializeRawArtSession,verifyRawArtSession } from './raw-art-folder/session.mjs';
function args(argv){const [command,...rest]=argv,out={command};for(let i=0;i<rest.length;i+=2){const key=rest[i];if(!key?.startsWith('--'))throw new Error(`Invalid argument ${key}.`);out[key.slice(2)]=rest[i+1]}return out}
export async function main(argv=process.argv.slice(2)){const a=args(argv);if(a.command==='scan'){const value=await scanRawArtFolder({rawArtRoot:a['raw-art-root'],generatedAt:a['generated-at'],maximumFiles:a['maximum-files'],maximumBytes:a['maximum-bytes']});await writeJsonCreateOnly(a.output,value);return{status:'written',outputPath:path.resolve(a.output),inventorySha256:value.inventorySha256,totals:value.totals}}if(a.command==='plan'){const value=await compileRawArtSessionPlan({inventoryPath:a.inventory,decisionsPath:a.decisions,compiledAt:a['compiled-at']});await writeJsonCreateOnly(a.output,value);return{status:'planned',outputPath:path.resolve(a.output),planSha256:value.planSha256,operationCount:value.operations.length}}if(a.command==='materialize')return materializeRawArtSession({planPath:a.plan});if(a.command==='verify')return verifyRawArtSession({sessionRoot:a['session-root']});throw new Error('Command must be scan, plan, materialize or verify.')}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);if(invoked)main().then(v=>process.stdout.write(`${JSON.stringify(v)}\n`)).catch(e=>{process.stderr.write(`${e.code??'RAW_ART_FOLDER_ERROR'}: ${e.message}\n`);process.exitCode=1});
