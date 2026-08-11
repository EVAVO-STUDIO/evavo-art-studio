import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export const INVENTORY_SCHEMA='evavo.raw-art-folder-inventory.v1',DECISIONS_SCHEMA='evavo.raw-art-folder-decisions.v1',PLAN_SCHEMA='evavo.raw-art-folder-session-plan.v1',MANIFEST_SCHEMA='evavo.raw-art-folder-session-manifest.v1';
export const SCHEMAS=Object.freeze({inventory:INVENTORY_SCHEMA,decisions:DECISIONS_SCHEMA,plan:PLAN_SCHEMA,manifest:MANIFEST_SCHEMA});
export const ACTIONS=Object.freeze(['retain','ignore','working-copy','reference','master-source','sequence-frame','atlas-frame','quarantine-copy']);
export const ACTION_SET=new Set(ACTIONS);
const CONTROL=/[\u0000-\u001f\u007f]/u,HASH=/^[a-f0-9]{64}$/u,ID=/^[a-z0-9][a-z0-9._-]{0,127}$/u;
export class RawArtFolderError extends Error{constructor(code,message,details){super(message);this.name='RawArtFolderError';this.code=code;this.details=details}}
export const fail=(code,message,details)=>{throw new RawArtFolderError(code,message,details)};
function canonical(value){if(value===null||['boolean','string'].includes(typeof value))return JSON.stringify(value);if(typeof value==='number'){if(!Number.isFinite(value))fail('RAW_ART_JSON_NUMBER_INVALID','Non-finite JSON number.');return JSON.stringify(value)}if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;fail('RAW_ART_JSON_VALUE_INVALID',`Cannot encode ${typeof value}.`)}
export const stableJson=value=>`${canonical(value)}\n`;
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function selfHash(value,key){const copy={...value};delete copy[key];return sha256(Buffer.from(canonical(copy),'utf8'))}
export function verifySelfHash(value,key,code){if(!value||typeof value!=='object'||Array.isArray(value)||!HASH.test(String(value[key]??''))||selfHash(value,key)!==value[key])fail(code,`${key} differs.`);return value}
export function integer(value,label,min,max){const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)fail('RAW_ART_INTEGER_INVALID',`${label} must be ${min}..${max}.`);return n}
export function text(value,label,max=4096){if(typeof value!=='string')fail('RAW_ART_TEXT_INVALID',`${label} must be a string.`);const v=value.normalize('NFC').trim();if(!v||v.length>max||CONTROL.test(v))fail('RAW_ART_TEXT_INVALID',`${label} is invalid.`);return v}
export function timestamp(value,label){const v=text(value,label,64),d=new Date(v);if(!Number.isFinite(d.valueOf())||d.toISOString()!==v)fail('RAW_ART_TIMESTAMP_INVALID',`${label} must be canonical UTC.`);return v}
export function id(value,label){const v=text(value,label,128);if(!ID.test(v))fail('RAW_ART_ID_INVALID',`${label} is invalid.`);return v}
export function relative(value,label){const v=text(value,label,32768).replaceAll('\\','/'),n=path.posix.normalize(v);if(path.posix.isAbsolute(v)||n==='.'||n==='..'||n.startsWith('../')||n.includes('/../')||n.endsWith('/..'))fail('RAW_ART_PATH_ESCAPE',`${label} escapes its root.`);return n}
export function inside(root,candidate){const r=path.relative(root,candidate);return r===''||(r!=='..'&&!r.startsWith(`..${path.sep}`)&&!path.isAbsolute(r))}
export async function directory(value,label){const requested=path.resolve(text(value,label,32768));let s;try{s=await lstat(requested)}catch(e){fail('RAW_ART_ROOT_UNAVAILABLE',`${label} is unavailable: ${e.message}.`)}if(!s.isDirectory()||s.isSymbolicLink())fail('RAW_ART_ROOT_INVALID',`${label} must be a regular non-symbolic directory.`);const real=await realpath(requested);if(path.normalize(real)!==path.normalize(requested))fail('RAW_ART_ROOT_NONCANONICAL',`${label} must be canonical.`);return real}
export async function writeCreateOnly(target,bytes){await mkdir(path.dirname(target),{recursive:true});const h=await open(target,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);try{await h.writeFile(bytes);await h.sync()}finally{await h.close()}}
export const writeJsonCreateOnly=(target,value)=>writeCreateOnly(path.resolve(target),Buffer.from(stableJson(value),'utf8'));
const identity=s=>({dev:Number(s.dev),ino:Number(s.ino),size:Number(s.size),mtimeMs:Number(s.mtimeMs),ctimeMs:Number(s.ctimeMs),nlink:Number(s.nlink)});
const same=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);
export async function hashFile(filePath){const h=await open(filePath,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const digest=createHash('sha256');let bytes=0;try{const b=Buffer.allocUnsafe(1024*1024);for(;;){const {bytesRead}=await h.read(b,0,b.length,null);if(!bytesRead)break;digest.update(b.subarray(0,bytesRead));bytes+=bytesRead}}finally{await h.close()}return{sha256:digest.digest('hex'),bytes}}
export async function stableFile(filePath,label){const beforeState=await lstat(filePath);if(!beforeState.isFile()||beforeState.isSymbolicLink())fail('RAW_ART_FILE_INVALID',`${label} must be a regular file.`);const real=await realpath(filePath);if(path.normalize(real)!==path.normalize(filePath))fail('RAW_ART_FILE_NONCANONICAL',`${label} must be canonical.`);const before=identity(beforeState),digest=await hashFile(filePath),after=identity(await lstat(filePath));if(!same(before,after)||digest.bytes!==before.size)fail('RAW_ART_FILE_CHANGED',`${label} changed during inspection.`);return Object.freeze({path:real,identity:before,...digest})}
export async function readJson(filePath,label,max=64*1024*1024){const stable=await stableFile(path.resolve(filePath),label);if(stable.bytes>max)fail('RAW_ART_JSON_TOO_LARGE',`${label} is too large.`);let value;try{value=JSON.parse((await readFile(stable.path,'utf8')).replace(/^\uFEFF/u,''))}catch(e){fail('RAW_ART_JSON_INVALID',`${label} is invalid JSON: ${e.message}.`)}return{value,stable}}
export function exactIdentity(actual,expected,code='RAW_ART_SOURCE_DRIFT'){if(actual.sha256!==expected.sha256||actual.bytes!==expected.bytes)fail(code,`File identity differs for ${expected.relativePath??expected.targetPath}.`)}
export const authority=Object.freeze({creativeApproval:false,historicalApproval:false,providerExecution:false,runtimeSubmission:false,candidatePromotion:false,sourceMutation:false,sourceDeletion:false,storageWrite:false,repositoryMutation:false,gitCommit:false,gitPush:false,publication:false,deployment:false,forcePush:false});
