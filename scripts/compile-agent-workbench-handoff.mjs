#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value) => typeof value === "string" ? value.trim() : "";
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw new Error(message); };

function parse(argv) {
  const options = { snapshot: null, routeType: null, routeId: null, to: null, objective: null, reason: null, output: null, compact: false, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--snapshot") options.snapshot = argv[++index] ?? null;
    else if (token === "--route-type") options.routeType = argv[++index] ?? null;
    else if (token === "--route-id") options.routeId = argv[++index] ?? null;
    else if (token === "--to") options.to = argv[++index] ?? null;
    else if (token === "--objective") options.objective = argv[++index] ?? null;
    else if (token === "--reason") options.reason = argv[++index] ?? null;
    else if (token === "--output") options.output = argv[++index] ?? null;
    else if (token === "--compact") options.compact = true;
    else if (token === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${token}`);
  }
  return options;
}

function readSnapshot(filePath) {
  const resolved = path.resolve(filePath);
  const bytes = fs.readFileSync(resolved);
  const value = JSON.parse(bytes.toString("utf8"));
  if (value?.contract !== "evavo_agent_workbench_snapshot_v1") fail("Input is not an EVAVO Agent Workbench snapshot v1.");
  if (!text(value.repository) || !text(value.authority) || !text(value.generatedAt)) fail("Snapshot identity is incomplete.");
  return { resolved, bytes, sha256: digest(bytes), value };
}

function routeCollection(snapshot, type) {
  const matches = record(snapshot.matches) ?? {};
  if (type === "capability") return matches.capabilities;
  if (type === "script") return matches.scripts;
  if (type === "tool") return matches.tools;
  if (type === "estate-capability") return matches.estateCapabilities;
  return null;
}

function routeIdentity(route, type) {
  return type === "script" ? text(route.name) : text(route.id);
}

export function compileHandoff({ snapshotRead, routeType, routeId, to, objective, reason }) {
  if (!["capability", "script", "tool", "estate-capability"].includes(routeType)) fail("--route-type must be capability, script, tool or estate-capability.");
  const collection = routeCollection(snapshotRead.value, routeType);
  if (!Array.isArray(collection)) fail(`Snapshot has no ${routeType} route collection.`);
  const route = collection.find((item) => record(item) && routeIdentity(item, routeType) === routeId);
  if (!route) fail(`Route not found in snapshot: ${routeType}:${routeId}`);
  if (!text(to) || !text(objective) || !text(reason)) fail("--to, --objective and --reason are required.");
  return Object.freeze({
    contract: "evavo_agent_workbench_handoff_v1",
    createdAt: new Date().toISOString(),
    from: Object.freeze({ repository: snapshotRead.value.repository, authority: snapshotRead.value.authority }),
    to: text(to),
    objective: text(objective),
    reason: text(reason),
    snapshot: Object.freeze({ contract: snapshotRead.value.contract, sha256: snapshotRead.sha256, repository: snapshotRead.value.repository, generatedAt: snapshotRead.value.generatedAt }),
    route: Object.freeze({ type: routeType, id: routeIdentity(route, routeType), sha256: digest(Buffer.from(JSON.stringify(route), "utf8")), evidence: route }),
    authority: Object.freeze({ executionGranted: false, mutationGranted: false, publicationGranted: false, financialGranted: false, requiresDownstreamAdmission: true })
  });
}

function selfTest() {
  const route = { id: "art.alpha", relevance: 2 };
  const value = { contract: "evavo_agent_workbench_snapshot_v1", generatedAt: new Date(0).toISOString(), repository: "EVAVO-STUDIO/test", authority: "test", matches: { capabilities: [route], scripts: [], tools: [], estateCapabilities: [] } };
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  const handoff = compileHandoff({ snapshotRead: { value, bytes, sha256: digest(bytes) }, routeType: "capability", routeId: "art.alpha", to: "EVAVO-STUDIO/art", objective: "repair alpha", reason: "canonical route" });
  if (handoff.route.id !== "art.alpha" || handoff.authority.executionGranted !== false) fail("handoff self-test failed");
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_handoff_self_test_v1", status: "passed", assertions: 2 }, null, 2)}\n`);
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.selfTest) return selfTest();
  if (!options.snapshot || !options.routeType || !options.routeId) fail("--snapshot, --route-type and --route-id are required.");
  const snapshotRead = readSnapshot(options.snapshot);
  const handoff = compileHandoff({ snapshotRead, routeType: options.routeType, routeId: options.routeId, to: options.to, objective: options.objective ?? snapshotRead.value.objective, reason: options.reason });
  const output = `${JSON.stringify(handoff, null, options.compact ? 0 : 2)}\n`;
  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, { flag: "wx" });
    process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_handoff_write_v1", status: "created", path: outputPath, sha256: digest(Buffer.from(output, "utf8")) }, null, 2)}\n`);
  } else process.stdout.write(output);
}

try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
