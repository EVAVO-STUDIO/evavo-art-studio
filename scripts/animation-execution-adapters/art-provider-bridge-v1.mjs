#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const RESULT_SCHEMA = "evavo.animation-frame-provider-result.v1";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code, String(value));
  return value;
}

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest("hex")}`;
}

function normalizeDigest(value, code) {
  if (typeof value !== "string") fail(code);
  const normalized = value.startsWith("sha256:") ? value : `sha256:${value}`;
  if (!DIGEST.test(normalized)) fail(code, value);
  return normalized;
}

function list(value) {
  return [...new Set(String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean))];
}

function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === "string" && entry.trim())
    .map((entry) => entry.trim());
}

function exactOutputPath(value) {
  if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0")) {
    fail("ANIMATION_PROVIDER_BRIDGE_OUTPUT_PATH_INVALID");
  }
  return resolve(value);
}

async function artifactRoot(environment) {
  const input = environment.EVAVO_ART_ARTIFACT_ROOT;
  if (typeof input !== "string" || !isAbsolute(input) || input.includes("\0")) {
    fail("ANIMATION_PROVIDER_BRIDGE_ARTIFACT_ROOT_INVALID");
  }
  const resolved = resolve(input);
  await mkdir(resolved, { recursive: true });
  const state = await lstat(resolved);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    fail("ANIMATION_PROVIDER_BRIDGE_ARTIFACT_ROOT_INVALID");
  }
  return realpath(resolved);
}

function assertLoopbackProviderEnvironment(environment) {
  if (environment.EVAVO_ART_COMFYUI_ALLOW_REMOTE === "true") {
    fail("ANIMATION_PROVIDER_BRIDGE_REMOTE_COMFYUI_FORBIDDEN");
  }
  const base = environment.EVAVO_ART_COMFYUI_BASE_URL?.trim();
  if (!base) return;
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    fail("ANIMATION_PROVIDER_BRIDGE_COMFYUI_URL_INVALID");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    fail("ANIMATION_PROVIDER_BRIDGE_COMFYUI_NOT_LOOPBACK");
  }
  if (parsed.username || parsed.password) {
    fail("ANIMATION_PROVIDER_BRIDGE_COMFYUI_CREDENTIAL_URL_FORBIDDEN");
  }
}

function referenceRole(value) {
  return {
    "canonical-identity": "canonical-identity",
    "direction-master": "direction-master",
    "dependency-pose": "previous-key-pose",
    "previous-pose": "previous-key-pose",
    "next-pose": "next-key-pose",
  }[value] ?? null;
}

function continuityPhase(workOrder) {
  if (workOrder.mode === "repair") return "repair";
  const generationClass = workOrder.drawing?.generationClass;
  if (generationClass === "identity-master") return "identity-master";
  if (generationClass === "direction-master") return "direction-master";
  if (generationClass === "in-between") return "in-between";
  return "key-pose";
}

function styleInput(workOrder) {
  const style = object(
    workOrder.immutableLocks?.style ?? {},
    "ANIMATION_PROVIDER_BRIDGE_STYLE_LOCK_INVALID",
  );
  return {
    styleName: text(style.styleId ?? style.name, "approved-animation-style"),
    intent: text(style.intent ?? workOrder.promptPackage?.positive, "Preserve the approved authored animation style."),
    mustHave: [
      ...stringList(style.shapeLanguage),
      ...stringList(workOrder.promptPackage?.antiGenericTraits),
    ],
    mustAvoid: [
      ...stringList(style.exclusions),
      ...text(workOrder.promptPackage?.negative, "").split(";").map((entry) => entry.trim()).filter(Boolean),
    ],
    identityLocks: stringList(
      workOrder.immutableLocks?.subject?.silhouetteAnchors,
    ),
    palette: stringList(style.palette),
    lineTreatment: [text(style.lineTreatment, "Preserve the approved line treatment.")],
    materials: stringList(style.materials),
    cameraRules: [JSON.stringify(workOrder.immutableLocks?.camera ?? {})],
    compositionRules: [
      `Preserve pivot ${JSON.stringify(workOrder.expectedOutput?.pivot ?? {})}.`,
      "Return exactly one frame, never a contact sheet, grid or storyboard.",
    ],
    eraRules: stringList(style.eraRules),
  };
}

function shotInput(workOrder) {
  const subject = object(
    workOrder.immutableLocks?.subject ?? {},
    "ANIMATION_PROVIDER_BRIDGE_SUBJECT_LOCK_INVALID",
  );
  const performance = workOrder.immutableLocks?.performance ?? {};
  return {
    subject: text(subject.subjectId ?? subject.identityLockId, "approved-animation-subject"),
    action: text(performance.intent, workOrder.drawing?.poseIntent ?? "authored pose"),
    direction: text(performance.direction, workOrder.drawing?.phase ?? "approved direction"),
    include: [
      ...stringList(subject.silhouetteAnchors),
      ...stringList(subject.costumeAnchors),
      ...stringList(subject.propAnchors),
    ],
    exclude: ["extra characters", "extra limbs", "unrequested props", "readable generated text"],
    separateAssets: [],
    framing: [
      `Canvas ${workOrder.expectedOutput.width}x${workOrder.expectedOutput.height}.`,
      `Ground contact ${workOrder.drawing?.groundContactRequired ? "required" : "not required"}.`,
    ],
  };
}

function providerReferences(workOrder) {
  const result = [];
  for (const entry of Array.isArray(workOrder.references) ? workOrder.references : []) {
    const role = referenceRole(entry.role);
    if (!role || typeof entry.artifactId !== "string") continue;
    result.push({
      artifactId: entry.artifactId,
      role,
      strength: role === "canonical-identity" ? 1 : 0.85,
      required: ["canonical-identity", "direction-master"].includes(role),
      note: `Bound by animation work order ${workOrder.workOrderDigest}.`,
    });
  }
  return result;
}

function providerRequest(input, environment) {
  const workOrder = object(
    input.workOrder,
    "ANIMATION_PROVIDER_BRIDGE_WORK_ORDER_INVALID",
  );
  const allowedAdapterIds = list(environment.EVAVO_ANIMATION_ALLOWED_PROVIDER_ADAPTERS);
  if (!allowedAdapterIds.length) {
    fail("ANIMATION_PROVIDER_BRIDGE_ALLOWED_ADAPTERS_REQUIRED");
  }
  const transparency = workOrder.expectedOutput.meaningfulAlphaRequired
    ? "required"
    : "preferred";
  const request = {
    schemaVersion: "1.0",
    requestId: safeId(
      `${input.productionId}:${workOrder.drawingId}:${workOrder.attempt}`,
      "ANIMATION_PROVIDER_BRIDGE_REQUEST_ID_INVALID",
    ),
    operation: "generate",
    assetKind: "sprite-frame",
    continuityPhase: continuityPhase(workOrder),
    assetId: safeId(
      workOrder.immutableLocks?.subject?.subjectId ?? input.productionId,
      "ANIMATION_PROVIDER_BRIDGE_ASSET_ID_INVALID",
    ),
    candidateFamilyId: safeId(
      `${input.productionId}:${workOrder.drawingId}`,
      "ANIMATION_PROVIDER_BRIDGE_FAMILY_ID_INVALID",
    ),
    frameId: safeId(
      workOrder.drawingId,
      "ANIMATION_PROVIDER_BRIDGE_FRAME_ID_INVALID",
    ),
    creativeIntent: text(
      workOrder.promptPackage?.positive,
      workOrder.drawing?.poseIntent ?? "Produce the approved animation drawing.",
    ),
    negativeIntent: text(
      workOrder.promptPackage?.negative,
      "Do not redesign identity, camera, style, timing or framing.",
    ),
    style: styleInput(workOrder),
    shot: shotInput(workOrder),
    target: {
      width: workOrder.expectedOutput.width,
      height: workOrder.expectedOutput.height,
      transparency,
      outputFormat: "png",
    },
    background: {
      strategy: workOrder.expectedOutput.meaningfulAlphaRequired
        ? "native-alpha"
        : "provider-auto",
    },
    quality: "high",
    candidateCount: 1,
    references: providerReferences(workOrder),
    selection: {
      allowedAdapterIds,
      allowFallback: true,
      requireSeed: false,
    },
    metadata: {
      schema: "evavo.animation-frame-provider-bridge-metadata.v1",
      productionId: input.productionId,
      profileDigest: input.profileDigest,
      ledgerDigest: input.ledgerDigest,
      ledgerRevision: input.ledgerRevision,
      workOrderDigest: workOrder.workOrderDigest,
      drawingId: workOrder.drawingId,
      attempt: workOrder.attempt,
      candidateOnly: true,
    },
  };
  return { request };
}

async function loadArtProviderRuntime() {
  try {
    const [artifacts, providers, worker] = await Promise.all([
      import("../../packages/artifacts/dist/index.js"),
      import("../../packages/providers/dist/index.js"),
      import("../../apps/worker/dist/provider-handlers.js"),
    ]);
    if (
      typeof artifacts.LocalArtifactStore !== "function" ||
      typeof providers.executeProviderCandidateRequest !== "function" ||
      typeof worker.createProviderRegistryFromEnvironment !== "function"
    ) {
      fail("ANIMATION_PROVIDER_BRIDGE_RUNTIME_EXPORT_MISSING");
    }
    return {
      LocalArtifactStore: artifacts.LocalArtifactStore,
      executeProviderCandidateRequest: providers.executeProviderCandidateRequest,
      createProviderRegistryFromEnvironment:
        worker.createProviderRegistryFromEnvironment,
    };
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") return null;
    throw error;
  }
}

function unavailableResult(input, reason) {
  return {
    schema: RESULT_SCHEMA,
    status: "unavailable",
    workOrderDigest: input.workOrder.workOrderDigest,
    drawingId: input.workOrder.drawingId,
    attempt: input.workOrder.attempt,
    reason,
  };
}

export async function executeArtProviderFrame(input, runtime) {
  object(input, "ANIMATION_PROVIDER_BRIDGE_INPUT_INVALID");
  object(runtime, "ANIMATION_PROVIDER_BRIDGE_RUNTIME_INVALID");
  if (input.phase !== "frame-provider") {
    fail("ANIMATION_PROVIDER_BRIDGE_PHASE_INVALID");
  }
  assertLoopbackProviderEnvironment(process.env);
  const outputPath = exactOutputPath(runtime.artifactOutputPath);
  const providerRuntime = await loadArtProviderRuntime();
  if (!providerRuntime) {
    return unavailableResult(
      input,
      "ART_PROVIDER_RUNTIME_BUILD_REQUIRED",
    );
  }
  const root = await artifactRoot(process.env);
  const store = new providerRuntime.LocalArtifactStore({ root });
  const registry = providerRuntime.createProviderRegistryFromEnvironment(
    process.env,
  );
  if (!registry.list().length) {
    return unavailableResult(input, "LOCAL_PROVIDER_ADAPTER_NOT_CONFIGURED");
  }
  const compiled = providerRequest(input, process.env);
  const controller = new AbortController();
  let result;
  try {
    result = await providerRuntime.executeProviderCandidateRequest(
      compiled.request,
      {
        registry,
        artifacts: store,
        signal: controller.signal,
        maximumOutputBytes: 128 * 1024 * 1024,
      },
    );
  } catch (error) {
    const code =
      typeof error?.code === "string" && error.code
        ? error.code
        : "LOCAL_PROVIDER_EXECUTION_FAILED";
    return {
      schema: RESULT_SCHEMA,
      status:
        code === "PROVIDER_ADAPTER_UNAVAILABLE" ? "unavailable" : "failed",
      workOrderDigest: input.workOrder.workOrderDigest,
      drawingId: input.workOrder.drawingId,
      attempt: input.workOrder.attempt,
      reason: code.slice(0, 256),
    };
  }
  if (result.candidateArtifacts.length !== 1) {
    fail("ANIMATION_PROVIDER_BRIDGE_CANDIDATE_COUNT_INVALID");
  }
  const candidateId = result.candidateArtifacts[0];
  const descriptor = await store.get(candidateId);
  if (!descriptor || descriptor.mediaType !== "image/png") {
    fail("ANIMATION_PROVIDER_BRIDGE_PNG_REQUIRED");
  }
  const verification = await store.verify(candidateId);
  if (!verification.descriptorValid || !verification.contentValid) {
    fail("ANIMATION_PROVIDER_BRIDGE_ARTIFACT_VERIFICATION_FAILED");
  }
  const bytes = Buffer.from(await store.read(candidateId));
  await writeFile(outputPath, bytes, { flag: "wx" });
  return {
    schema: RESULT_SCHEMA,
    status: "candidate-produced",
    workOrderDigest: input.workOrder.workOrderDigest,
    drawingId: input.workOrder.drawingId,
    attempt: input.workOrder.attempt,
    providerRequestDigest: normalizeDigest(
      result.requestSha256,
      "ANIMATION_PROVIDER_BRIDGE_REQUEST_DIGEST_INVALID",
    ),
    providerResponseDigest: digest({
      requestId: result.requestId,
      requestSha256: result.requestSha256,
      compiledPromptSha256: result.compiledPromptSha256,
      adapterId: result.adapterId,
      model: result.model,
      candidateArtifacts: result.candidateArtifacts,
      evidenceArtifact: result.evidenceArtifact,
      attempts: result.attempts,
    }),
    modelId: safeId(result.model, "ANIMATION_PROVIDER_BRIDGE_MODEL_ID_INVALID"),
    providerAdapterId: safeId(
      result.adapterId,
      "ANIMATION_PROVIDER_BRIDGE_PROVIDER_ADAPTER_ID_INVALID",
    ),
    providerEvidenceArtifactId: result.evidenceArtifact,
  };
}


async function commandMain() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  if (Buffer.byteLength(text, "utf8") > 16 * 1024 * 1024) {
    fail("ANIMATION_PROVIDER_BRIDGE_COMMAND_INPUT_EXCESSIVE");
  }
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    fail("ANIMATION_PROVIDER_BRIDGE_COMMAND_INPUT_INVALID");
  }
  const input = object(message, "ANIMATION_PROVIDER_BRIDGE_COMMAND_MESSAGE_INVALID");
  const result = await executeArtProviderFrame(input, input.runtime);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  (process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href
    : "") === import.meta.url
) {
  commandMain().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        code:
          error instanceof Error
            ? error.message.split(":", 1)[0]
            : "ANIMATION_PROVIDER_BRIDGE_FAILED",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
