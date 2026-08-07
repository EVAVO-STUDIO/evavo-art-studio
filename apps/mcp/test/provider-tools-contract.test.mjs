import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes provider protocol and deterministic runtime-job compilation", async () => {
  const tools = await read("src/provider-tools.ts");
  const index = await read("src/index.ts");
  for (const token of [
    "provider_candidate_protocol",
    "validate_provider_candidate_request",
    "compile_provider_candidate_request",
    "providerRequestSha256",
    "providerRequiredCapabilities",
    "requiredAdapterCapabilities",
    "requiredCapabilityProfile",
    "compiledPromptSha256",
    "art.candidate.${request.operation}",
    "provider.reference-lock",
    "provider.candidate-store",
    "submit-runtime-job",
    "registerProviderTools(server)",
  ]) {
    assert.ok(`${tools}\n${index}`.includes(token), `missing MCP provider contract: ${token}`);
  }
  for (const forbidden of [
    "OPENAI_API_KEY",
    "fetch(",
    "executeProviderCandidateRequest",
    "provider.generate(",
    "child_process",
  ]) {
    assert.ok(!tools.includes(forbidden), `MCP contract must not execute providers: ${forbidden}`);
  }
});
