#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const distributionRoot = path.dirname(fileURLToPath(import.meta.url));
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-creative-asset-sealed-test-"));
const environment = (runtimeRoot) => ({
  ...process.env,
  EVAVO_CREATIVE_ASSET_RUNTIME_ROOT: runtimeRoot
});

function runNode(script, args = [], options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: options.encoding ?? "utf8",
    input: options.input,
    env: options.env ?? process.env,
    shell: false,
    windowsHide: true,
    timeout: options.timeout ?? 30_000,
    maxBuffer: 32 * 1024 * 1024
  });
}

function assertSucceeded(result, label) {
  assert.equal(result.signal, null, `${label} terminated by ${result.signal}`);
  assert.equal(
    result.status,
    0,
    `${label} failed: ${String(result.stderr || result.stdout || "no diagnostic").slice(0, 4_000)}`
  );
}

function frame(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "ascii"),
    payload
  ]);
}

function parseFrames(buffer) {
  const responses = [];
  let remaining = Buffer.from(buffer);
  while (remaining.length) {
    const headerEnd = remaining.indexOf("\r\n\r\n");
    assert.notEqual(headerEnd, -1, "MCP response header terminator is missing");
    const header = remaining.subarray(0, headerEnd).toString("ascii");
    const match = /(?:^|\r\n)Content-Length:\s*(\d+)(?:\r\n|$)/i.exec(header);
    assert.ok(match, "MCP response Content-Length header is missing");
    const length = Number(match[1]);
    const start = headerEnd + 4;
    const end = start + length;
    assert.ok(end <= remaining.length, "MCP response body is truncated");
    responses.push(JSON.parse(remaining.subarray(start, end).toString("utf8")));
    remaining = remaining.subarray(end);
  }
  return responses;
}

try {
  const runtimeBase = path.join(temporaryRoot, "runtime");
  const verification = runNode(path.join(distributionRoot, "verify.mjs"), [], {
    env: environment(runtimeBase)
  });
  assertSucceeded(verification, "sealed runtime verification");
  const verificationReport = JSON.parse(verification.stdout);
  assert.equal(verificationReport.status, "verified");
  assert.equal(verificationReport.repositoryMutationAuthority, false);
  assert.equal(verificationReport.developmentStudioSealedPublicationAuthority, true);
  assert.equal(verificationReport.sealedExecutionPackageRequired, true);
  assert.equal(verificationReport.rawMainlineApplyAuthority, false);
  assert.equal(verificationReport.exactShaProviderConfirmationRequired, true);
  assert.equal(verificationReport.repositoryReliabilityProfileRequired, true);
  assert.equal(verificationReport.directMainlinePublisherAuthority, false);
  assert.equal(verificationReport.storageMutationAuthority, false);
  assert.equal(verificationReport.githubMcpMutationAuthority, false);
  assert.equal(verificationReport.forcePushAvailable, false);

  const capabilities = runNode(
    path.join(distributionRoot, "cli.mjs"),
    ["capabilities"],
    { env: environment(runtimeBase) }
  );
  assertSucceeded(capabilities, "sealed CLI capability probe");
  const capabilityReport = JSON.parse(capabilities.stdout);
  assert.equal(capabilityReport.artStudioGitCommit, false);
  assert.equal(capabilityReport.artStudioGitPush, false);
  assert.equal(capabilityReport.githubMcpMutationAuthority, false);
  assert.equal(capabilityReport.sealedExecutionPackageRequired, true);
  assert.equal(capabilityReport.rawMainlineApplyAuthority, false);
  assert.equal(capabilityReport.exactShaProviderConfirmationRequired, true);
  assert.equal(capabilityReport.repositoryReliabilityProfileRequired, true);
  assert.equal(capabilityReport.directMainlinePublisherAuthority, false);
  assert.equal(capabilityReport.forcePushAvailable, false);

  const requests = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "sealed-distribution-test", version: "1.0.0" }
      }
    },
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "creative_asset_capabilities", arguments: {} }
    }
  ];
  const mcp = runNode(path.join(distributionRoot, "mcp.mjs"), [], {
    env: environment(runtimeBase),
    input: Buffer.concat(requests.map(frame)),
    encoding: null
  });
  assert.equal(mcp.signal, null, `MCP probe terminated by ${mcp.signal}`);
  assert.equal(mcp.status, 0, `MCP probe failed: ${Buffer.from(mcp.stderr || []).toString("utf8")}`);
  const responses = parseFrames(mcp.stdout);
  assert.equal(responses.length, 3);
  assert.equal(responses[0].result.serverInfo.version, "0.4.1");
  assert.ok(
    responses[1].result.tools.some((tool) => tool.name === "creative_asset_capabilities"),
    "MCP capability tool is absent"
  );
  const mcpCapabilities = JSON.parse(responses[2].result.content[0].text);
  assert.equal(mcpCapabilities.artStudioGitCommit, false);
  assert.equal(mcpCapabilities.artStudioGitPush, false);
  assert.equal(mcpCapabilities.sealedExecutionPackageRequired, true);
  assert.equal(mcpCapabilities.rawMainlineApplyAuthority, false);
  assert.equal(mcpCapabilities.exactShaProviderConfirmationRequired, true);
  assert.equal(mcpCapabilities.repositoryReliabilityProfileRequired, true);
  assert.equal(mcpCapabilities.directMainlinePublisherAuthority, false);
  assert.equal(mcpCapabilities.forcePushAvailable, false);

  const alteredDistribution = path.join(temporaryRoot, "altered-distribution");
  fs.cpSync(distributionRoot, alteredDistribution, { recursive: true, errorOnExist: true });
  const partPath = path.join(alteredDistribution, "runtime.part-000.base64");
  const part = fs.readFileSync(partPath, "utf8");
  fs.writeFileSync(partPath, `${part[0] === "A" ? "B" : "A"}${part.slice(1)}`, "utf8");
  const partTamper = runNode(path.join(alteredDistribution, "verify.mjs"), [], {
    env: environment(path.join(temporaryRoot, "altered-part-runtime"))
  });
  assert.notEqual(partTamper.status, 0, "altered runtime part was accepted");
  assert.match(String(partTamper.stderr), /part runtime\.part-000\.base64 SHA-256 verification failed/u);

  fs.appendFileSync(path.join(verificationReport.runtimeRoot, "src", "cli.mjs"), "\n// test tamper\n");
  const runtimeTamper = runNode(path.join(distributionRoot, "verify.mjs"), [], {
    env: environment(runtimeBase)
  });
  assert.notEqual(runtimeTamper.status, 0, "altered installed runtime was accepted");
  assert.match(String(runtimeTamper.stderr), /descriptor verification failed for src\/cli\.mjs/u);

  console.log(
    JSON.stringify(
      {
        contract: "evavo.creative-asset-publisher-sealed-distribution-test.v1",
        status: "passed",
        package: verificationReport.package,
        bundleSha256: verificationReport.bundleSha256,
        archiveSha256: verificationReport.archiveSha256,
        runtimeFileCount: verificationReport.fileCount,
        mcpToolCount: responses[1].result.tools.length,
        checks: [
          "canonical USTAR directory extraction",
          "runtime inventory and checksum verification",
          "CLI authority boundaries",
          "MCP initialize, tools/list and capabilities",
          "part tamper rejection",
          "installed runtime tamper rejection"
        ]
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
