#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const STUDIO='art-studio';
const REPOSITORY='EVAVO-STUDIO/evavo-art-studio';
const CANONICAL_OPS=new Set(['produce-environment-art','produce-game-art','produce-game-ui']);
const REVIEW_ONLY_OPS=new Set(['produce-environment-key-art','produce-game-concept-art']);
const ALLOWED=new Set([...CANONICAL_OPS,...REVIEW_ONLY_OPS]);
const MAX_BYTES=128*1024*1024;
const hashBytes=b=>`sha256:${createHash('sha256').update(b).digest('hex')}`;
const canonicalize=v=>Array.isArray(v)?v.map(canonicalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalize(v[k])])):v;
const hashJson=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonicalize(v)),'utf8').digest('hex')}`;
function usage(){return 'Usage: node tools/game_production_artifact_manifest_cli.mjs <receipt.json> <artifact-root> <files.json> [--output manifest.json]';}
function safePath(value){if(typeof value!=='string'||!value)throw new Error('files[].path must be a non-empty string.');if(value.includes('\\')||isAbsolute(value)||value.startsWith('/')||value.includes('//'))throw new Error(`Unsafe artifact path: ${value}`);if(value.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error(`Unsafe artifact path: ${value}`);return value;}
function validateReceipt(r){if(r?.kind!=='creative-production-receipt'||r?.schemaVersion!=='1.0.0'||r?.status!=='completed-reviewed')throw new Error('Expected completed-reviewed creative-production-receipt v1.0.0.');if(r.studio!==STUDIO||r.repository!==REPOSITORY||!ALLOWED.has(r.operation))throw new Error('Receipt does not describe an allowed Art Studio reviewed revision.');for(const k of ['packetId','sourceDigest'])if(typeof r[k]!=='string'||!r[k])throw new Error(`receipt.${k} is required.`);if(typeof r.artifactRevision?.id!=='string'||typeof r.artifactRevision?.digest!=='string')throw new Error('receipt.artifactRevision id/digest are required.');}

async function main(){
  const args=process.argv.slice(2);if(!args.length||args.includes('--help')||args.includes('-h')){console.log(usage());return;}
  const [receiptPath,rootPath,specPath]=args;let output=null;for(let i=3;i<args.length;i++){if(args[i]==='--output')output=args[++i];else throw new Error(`Unknown argument: ${args[i]}`);}if(!receiptPath||!rootPath||!specPath)throw new Error('receipt, artifact root and files spec are required.');
  const receipt=JSON.parse(await readFile(receiptPath,'utf8'));validateReceipt(receipt);const specs=JSON.parse(await readFile(specPath,'utf8'));if(!Array.isArray(specs)||!specs.length)throw new Error('files.json must be a non-empty array.');if(specs.length>1000)throw new Error('At most 1000 files are supported.');
  const root=await realpath(resolve(rootPath));const files=[];const seen=new Set();
  for(const [index,spec] of specs.entries()){
    const path=safePath(spec?.path);if(seen.has(path))throw new Error(`Duplicate artifact path: ${path}`);seen.add(path);if(typeof spec?.role!=='string'||!spec.role)throw new Error(`files[${index}].role is required.`);if(typeof spec?.mediaType!=='string'||!spec.mediaType.includes('/'))throw new Error(`files[${index}].mediaType is required.`);
    const classification=spec?.classification??(REVIEW_ONLY_OPS.has(receipt.operation)?'review':'canonical');if(!['canonical','review'].includes(classification))throw new Error(`files[${index}].classification must be canonical or review.`);if(REVIEW_ONLY_OPS.has(receipt.operation)&&classification!=='review')throw new Error(`${receipt.operation} files are review-only and cannot be canonical runtime assets.`);
    const actual=await realpath(resolve(root,path));const rel=relative(root,actual);if(rel.startsWith('..')||isAbsolute(rel))throw new Error(`Artifact path escapes root: ${path}`);const info=await stat(actual);if(!info.isFile())throw new Error(`Artifact is not a regular file: ${path}`);if(info.size>MAX_BYTES)throw new Error(`Artifact exceeds ${MAX_BYTES} bytes: ${path}`);const bytes=await readFile(actual);const canonical=classification==='canonical';
    files.push({path,role:spec.role,mediaType:spec.mediaType,digest:hashBytes(bytes),byteLength:bytes.byteLength,canonicalRuntimeAsset:canonical,reviewOnly:!canonical});
  }
  files.sort((a,b)=>a.path.localeCompare(b.path)||a.role.localeCompare(b.role));if(CANONICAL_OPS.has(receipt.operation)&&!files.some(f=>f.canonicalRuntimeAsset))throw new Error(`${receipt.operation} requires at least one canonical runtime art file.`);
  const payload={kind:'creative-production-artifact-manifest',schemaVersion:'1.0.0',status:'revision-files-bound',packetId:receipt.packetId,sourceDigest:receipt.sourceDigest,studio:receipt.studio,repository:receipt.repository,operation:receipt.operation,artifactRevision:receipt.artifactRevision,files,authority:{importsIntoConsumer:false,executesProduction:false,mutatesConsumerRepository:false,publishes:false},limitations:['Concept and key-art operations are review-only and cannot become runtime assets by manifest metadata alone.','Runtime Art/UI operations require at least one canonical file, while optional review files remain non-canonical.','Consumers must independently re-hash actual file bytes before import; SHA-256 integrity does not authenticate the publisher.']};
  const manifest={...payload,manifestDigest:hashJson(payload)};const text=`${JSON.stringify(manifest,null,2)}\n`;if(output)await writeFile(output,text,'utf8');else process.stdout.write(text);
}
main().catch(error=>{console.error(error.message);console.error(usage());process.exitCode=1;});
