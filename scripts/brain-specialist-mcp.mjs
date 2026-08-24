#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const AUTHORITY = "EVAVO-STUDIO/evavo-art-studio";
const SERVER = "evavo-art-studio";
const TOOL = "art_studio_readiness";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROTOCOLS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"];
const SENSITIVE = /(?:OPENAI|ANTHROPIC|GITHUB|GH_TOKEN|AWS|AZURE|GOOGLE|GCP|SLACK|STRIPE|VERCEL|CLOUDFLARE|HF_TOKEN|HUGGINGFACE|TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)/iu;
for (const key of Object.keys(process.env)) if (SENSITIVE.test(key)) delete process.env[key];

const canonical = value => JSON.stringify(value, (_k, child) => child && typeof child === "object" && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a],[b]) => a.localeCompare(b))) : child);
const sha256 = value => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
async function load(path) { const text = await readFile(resolve(ROOT, path), "utf8"); return { value: JSON.parse(text), sha256: sha256(text), path }; }
async function status() {
  const client = await load("config/local-ai-client-v1.json");
  const execution = await load("config/local-ai-execution-v1.json");
  if (client.value.studio !== "art-studio" || execution.value.studio !== "art-studio") throw new Error("Art Studio local-AI identity drifted");
  const policy = execution.value.policy ?? {};
  if (policy.privacyMode !== "strict-local" || policy.remoteFallbackAllowed !== false || policy.modelPullDuringExecutionAllowed !== false || policy.providerNativeNetworkAllowed !== false) throw new Error("Art Studio strict-local execution policy drifted");
  const body = { contractVersion: "evavo_art_studio_brain_specialist_status_v1", authority: AUTHORITY, studio: "art-studio", workloads: Object.keys(execution.value.workloads ?? {}).sort(), clientContractSha256: client.sha256, executionContractSha256: execution.sha256, modelAuthority: execution.value.authorities?.models, executionAuthority: execution.value.authorities?.execution, physicalReceiptRequired: Object.values(execution.value.workloads ?? {}).every(value => value?.physicalReceiptRequired === true), strictLocal: true, readinessOnly: true, generationPerformed: false, creativeApprovalPerformed: false, publicationPerformed: false, completionAuthority: false, completionEvidenceEligible: false };
  const receiptSha256 = sha256(body);
  return { ...body, receiptId: `art-studio:${receiptSha256}`, receiptSha256 };
}
const tools = [{ name: TOOL, title: "Inspect Art Studio readiness", description: "Verify Art Studio strict-local AI execution contracts and workload ownership without generating media, mutating files, approving creative work or publishing.", inputSchema: { type: "object", additionalProperties: false, properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }];
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
async function handle(message) { const id = message?.id ?? null; const params = message?.params && typeof message.params === "object" ? { ...message.params } : {}; delete params._meta; if (message?.method === "server/discover") return ok(id, { supportedVersions: PROTOCOLS, serverInfo: { name: SERVER, version: "1.0.0" }, capabilities: { tools: { listChanged: false } } }); if (message?.method === "initialize") return ok(id, { protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS.at(-1), serverInfo: { name: SERVER, version: "1.0.0" }, capabilities: { tools: { listChanged: false } } }); if (message?.method === "notifications/initialized") return undefined; if (message?.method === "tools/list") return ok(id, { tools }); if (message?.method === "tools/call") { if (params.name !== TOOL) return ok(id, { structuredContent: { ok: false, error: "unknown Art Studio tool" }, isError: true }); if (params.arguments && Object.keys(params.arguments).length) return ok(id, { structuredContent: { ok: false, error: "Art Studio readiness accepts no arguments" }, isError: true }); try { const output = await status(); return ok(id, { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output, isError: false }); } catch (cause) { return ok(id, { structuredContent: { ok: false, completionAuthority: false, completionEvidenceEligible: false, error: cause instanceof Error ? cause.message : String(cause) }, isError: true }); } } if (message?.id === undefined) return undefined; return err(id, -32601, `method not found: ${String(message?.method)}`); }
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) { if (!line.trim()) continue; let response; try { if (line.length > 1_000_000) throw new Error("request too large"); response = await handle(JSON.parse(line)); } catch (cause) { response = err(null, -32700, cause instanceof Error ? cause.message : String(cause)); } if (response !== undefined) process.stdout.write(`${JSON.stringify(response)}\n`); }
