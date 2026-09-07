import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./local_path_policy.mjs";

export const REFERENCE_COLOUR_RESTORATION_BRIDGE_CONTRACT =
  "evavo.reference-colour-restoration-bridge.v1";
export const REFERENCE_COLOUR_RESTORATION_PROVIDER_ID =
  "evavo-image-enhancement-studio:reference-colourization-v1";
export const TRUSTED_REFERENCE_PROVENANCE = Object.freeze([
  "user-provided-original",
  "user-owned-original",
  "camera-original",
  "first-party-archive",
  "verified-archive",
  "known-colour-photo",
]);

const TRUSTED_REFERENCE_PROVENANCE_SET = new Set(TRUSTED_REFERENCE_PROVENANCE);
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const EXECUTION_ENV = "EVAVO_REFERENCE_COLOUR_RESTORATION_ALLOW_EXECUTION";
const ENHANCER_ROOT_ENV = "EVAVO_REFERENCE_COLOUR_RESTORATION_ENHANCER_ROOT";
const PYTHON_ENV = "EVAVO_REFERENCE_COLOUR_RESTORATION_PYTHON";
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;
const PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function safePrefix(value) {
  const prefix = typeof value === "string" && value.trim() ? value.trim() : "portrait-colour";
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error("prefix must contain 1 to 80 safe filename characters and no path separators.");
  }
  return prefix;
}

function normalizeFaceBox(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const entries = Array.isArray(value)
    ? value.map(Number)
    : String(value).split(",").map((entry) => Number(entry.trim()));
  if (
    entries.length !== 4 ||
    entries.some((entry) => !Number.isFinite(entry) || entry < 0 || entry > 1)
  ) {
    throw new Error(`${label} must be four normalized values L,T,R,B between 0 and 1.`);
  }
  const [left, top, right, bottom] = entries;
  if (!(left < right && top < bottom)) {
    throw new Error(`${label} must satisfy left < right and top < bottom.`);
  }
  return entries.map((entry) => Number(entry.toFixed(6))).join(",");
}

async function regularFileBinding(filePath, label) {
  const resolved = await assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output: false,
    label,
  });
  const info = await lstat(resolved);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`${label} must resolve to a regular non-symlink file.`);
  }
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`${label} is empty.`);
  return Object.freeze({
    path: resolved,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.length,
  });
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveEnhancerRoot() {
  const configured = String(process.env[ENHANCER_ROOT_ENV] ?? "").trim();
  const root = path.resolve(
    configured || path.resolve(process.cwd(), "..", "evavo-image-enhancement-studio"),
  );
  const pyproject = path.join(root, "pyproject.toml");
  const frontend = path.join(
    root,
    "src",
    "evavo_image_enhancement_studio",
    "cli_contract_frontend.py",
  );
  for (const required of [pyproject, frontend]) {
    const info = await lstat(required).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink()) {
      throw new Error(
        `Image Enhancement Studio is not ready at ${root}; missing regular file ${required}.`,
      );
    }
  }
  return root;
}

async function resolvePython(enhancerRoot) {
  const configured = String(process.env[PYTHON_ENV] ?? "").trim();
  const candidates = configured
    ? [configured]
    : process.platform === "win32"
      ? [
          path.join(enhancerRoot, ".venv", "Scripts", "python.exe"),
          process.env.EVAVO_LOCAL_COMPUTE_ROOT
            ? path.join(process.env.EVAVO_LOCAL_COMPUTE_ROOT, ".venv", "Scripts", "python.exe")
            : "",
          "python",
        ]
      : [path.join(enhancerRoot, ".venv", "bin", "python"), "python3", "python"];

  for (const candidate of candidates.filter(Boolean)) {
    if (path.isAbsolute(candidate) || candidate.includes(path.sep)) {
      if (await pathExists(candidate)) return Object.freeze({ command: candidate, prefixArgs: [] });
      continue;
    }
    return Object.freeze({ command: candidate, prefixArgs: [] });
  }
  throw new Error(
    `No Python runtime is configured. Set ${PYTHON_ENV} to the Python 3.12+ executable used by Image Enhancement Studio.`,
  );
}

function appendBounded(current, chunk, label) {
  const next = current + chunk;
  if (Buffer.byteLength(next, "utf8") > MAX_PROCESS_OUTPUT_BYTES) {
    throw new Error(`${label} exceeded ${MAX_PROCESS_OUTPUT_BYTES} bytes.`);
  }
  return next;
}

async function runProcess(command, args, {
  cwd,
  env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  acceptedExitCodes = [0],
} = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      settled = true;
      reject(new Error(`Reference-colour restoration process exceeded ${timeoutMs} ms.`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      try { stdout = appendBounded(stdout, chunk, "stdout"); }
      catch (error) { settled = true; child.kill(); clearTimeout(timer); reject(error); }
    });
    child.stderr.on("data", (chunk) => {
      if (settled) return;
      try { stderr = appendBounded(stderr, chunk, "stderr"); }
      catch (error) { settled = true; child.kill(); clearTimeout(timer); reject(error); }
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!acceptedExitCodes.includes(code)) {
        reject(new Error(
          `Reference-colour restoration process failed with code ${code ?? "null"}${signal ? ` signal ${signal}` : ""}: ${stderr.trim() || stdout.trim()}`,
        ));
        return;
      }
      resolve(Object.freeze({ code, stdout, stderr }));
    });
  });
}

function pythonEnvironment(enhancerRoot) {
  const sourceRoot = path.join(enhancerRoot, "src");
  return {
    ...process.env,
    PYTHONPATH: [sourceRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

async function runtimeContext() {
  const enhancerRoot = await resolveEnhancerRoot();
  const python = await resolvePython(enhancerRoot);
  return Object.freeze({
    enhancerRoot,
    python,
    env: pythonEnvironment(enhancerRoot),
  });
}

async function verifyRuntime(context) {
  const args = [
    ...context.python.prefixArgs,
    "-c",
    [
      "import json,sys",
      "import PIL",
      "import evavo_image_enhancement_studio.cli_contract_frontend",
      "print(json.dumps({'python':sys.version.split()[0],'pillow':PIL.__version__,'enhancerImport':True}))",
    ].join(";"),
  ];
  const result = await runProcess(context.python.command, args, {
    cwd: context.enhancerRoot,
    env: context.env,
    timeoutMs: 30_000,
  });
  return JSON.parse(result.stdout.trim());
}

function fixedFrontendArgs(context, commandArgs) {
  return [
    ...context.python.prefixArgs,
    "-m",
    "evavo_image_enhancement_studio.cli_contract_frontend",
    ...commandArgs,
  ];
}

async function runFrontend(context, commandArgs, options = {}) {
  const result = await runProcess(
    context.python.command,
    fixedFrontendArgs(context, commandArgs),
    {
      cwd: context.enhancerRoot,
      env: context.env,
      ...options,
    },
  );
  const text = result.stdout.trim();
  if (!text) throw new Error(`Enhancement Studio returned no JSON for ${commandArgs[0]}.`);
  try {
    return Object.freeze({ exitCode: result.code, payload: JSON.parse(text), stderr: result.stderr });
  } catch {
    throw new Error(`Enhancement Studio returned invalid JSON for ${commandArgs[0]}: ${text.slice(0, 1000)}`);
  }
}

function authorizationArgs(request) {
  return [
    "--reference-provenance",
    request.referenceProvenance,
    "--confirm-real-reference",
    "--confirm-human-reference-match",
  ];
}

function geometryArgs(request) {
  const result = [];
  if (request.sourceFaceBox) result.push("--source-face-box", request.sourceFaceBox);
  if (request.referenceFaceBox) result.push("--reference-face-box", request.referenceFaceBox);
  if (request.requireDetectedFace) result.push("--require-detected-face");
  return result;
}

async function prepareRequest(args, { execution = false } = {}) {
  if (args.confirmRealReference !== true) {
    throw new Error("confirmRealReference=true is required; colour evidence must come from a real photograph.");
  }
  if (args.subjectMatchConfirmedByHuman !== true) {
    throw new Error("subjectMatchConfirmedByHuman=true is required before colour transfer.");
  }
  const provenance = String(args.referenceProvenance ?? "").trim().toLowerCase();
  if (!TRUSTED_REFERENCE_PROVENANCE_SET.has(provenance)) {
    throw new Error(`referenceProvenance must be one of: ${TRUSTED_REFERENCE_PROVENANCE.join(", ")}.`);
  }
  const [source, reference] = await Promise.all([
    regularFileBinding(args.sourcePath, "reference-colour source"),
    regularFileBinding(args.referencePath, "reference-colour photograph"),
  ]);
  if (identity(source.path) === identity(reference.path)) {
    throw new Error("The monochrome source and real colour reference must be distinct files.");
  }
  if (typeof args.outputDir !== "string" || !args.outputDir.trim()) {
    throw new Error("outputDir is required for a create-only review set.");
  }
  const outputDir = await assertAllowedLocalPath(args.outputDir, {
    envName: ALLOWED_ROOTS_ENV,
    output: true,
    label: "reference-colour restoration output",
  });
  if (execution && await pathExists(outputDir)) {
    throw new Error("outputDir must not already exist; restoration review sets are create-only.");
  }
  return Object.freeze({
    source,
    reference,
    outputDir,
    prefix: safePrefix(args.prefix),
    referenceProvenance: provenance,
    sourceFaceBox: normalizeFaceBox(args.sourceFaceBox, "sourceFaceBox"),
    referenceFaceBox: normalizeFaceBox(args.referenceFaceBox, "referenceFaceBox"),
    requireDetectedFace: args.requireDetectedFace === true,
    confirmRealReference: true,
    subjectMatchConfirmedByHuman: true,
  });
}

function planArgs(request) {
  return [
    "reference-colorize-plan",
    request.source.path,
    request.reference.path,
    ...authorizationArgs(request),
    ...geometryArgs(request),
  ];
}

function variantArgs(request) {
  const result = [
    "reference-colorize-variants",
    request.source.path,
    request.reference.path,
    request.outputDir,
    ...authorizationArgs(request),
    "--prefix",
    request.prefix,
  ];
  if (request.sourceFaceBox) result.push("--source-face-box", request.sourceFaceBox);
  if (request.referenceFaceBox) result.push("--reference-face-box", request.referenceFaceBox);
  if (request.requireDetectedFace) result.push("--require-detected-face");
  return result;
}

function qaArgs(sourcePath, candidatePath, sourceFaceBox) {
  return [
    "reference-colorize-qa",
    sourcePath,
    candidatePath,
    "--source-face-box",
    sourceFaceBox,
  ];
}

function manifestFor(request, plan, variant) {
  return Object.freeze({
    contract: "evavo.enhancement-art-review.v1",
    source_path: request.source.path,
    source_sha256: request.source.sha256,
    source_width: plan.width,
    source_height: plan.height,
    candidate_path: variant.outputPath,
    candidate_sha256: variant.outputSha256,
    candidate_width: plan.width,
    candidate_height: plan.height,
    enhancement_profile: "reference-assisted-portrait-colourization-v1",
    art_studio_review_profile: "photo",
    intended_role: "photo",
    learned_candidate: false,
    mandatory_art_studio_tools: [
      "evavo_review_existing_image_quality",
      "evavo_review_existing_image_edit",
      "evavo_create_existing_image_inspection_proof",
    ],
    mandatory_visual_checks: [
      "Compare facial geometry, expression, hairline, crop and texture against the monochrome source at 100% and 400% zoom.",
      "Inspect skin, lips, beard and hair for patchy chroma, halos, clipping or synthetic-looking saturation.",
      "Confirm the source luminance remains authoritative and that background and clothing were not silently recoloured.",
      "Compare all technically admitted variants side by side; do not let QA or an agent automatically select the aesthetic winner.",
    ],
    approval_state: "unapproved",
    source_immutable: true,
    candidate_is_review_only: true,
    art_studio_visual_review_required: true,
    page_context_review_required: false,
    publication_allowed: false,
    cloud_overwrite_allowed: false,
    automatic_creative_approval: false,
    automatic_release_approval: false,
  });
}

export function referenceColourRestorationBridgeCapabilities() {
  return Object.freeze({
    contract: REFERENCE_COLOUR_RESTORATION_BRIDGE_CONTRACT,
    providerId: REFERENCE_COLOUR_RESTORATION_PROVIDER_ID,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    trustedReferenceProvenance: TRUSTED_REFERENCE_PROVENANCE,
    sourceMutationAllowed: false,
    generativeFallbackAllowed: false,
    learnedRepaintAllowed: false,
    inventedColourAllowed: false,
    outputPolicy: "create-only-review-set",
    candidatePresets: ["conservative", "balanced", "rich"],
    technicalQaMayReject: true,
    technicalQaMaySelectWinner: false,
    humanFinalSelectionRequired: true,
    artStudioReviewManifestEmittedPerCandidate: true,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
  });
}

export async function inspectReferenceColourRestorationReadiness() {
  const context = await runtimeContext();
  const runtime = await verifyRuntime(context);
  return Object.freeze({
    ok: true,
    contract: REFERENCE_COLOUR_RESTORATION_BRIDGE_CONTRACT,
    providerId: REFERENCE_COLOUR_RESTORATION_PROVIDER_ID,
    enhancerRoot: context.enhancerRoot,
    pythonCommand: context.python.command,
    runtime,
    executionEnabled: process.env[EXECUTION_ENV] === "true",
    sourceMutationAllowed: false,
    generativeFallbackAllowed: false,
  });
}

export async function planReferenceColourRestorationReviewSet(args = {}) {
  const request = await prepareRequest(args, { execution: false });
  const context = await runtimeContext();
  const runtime = await verifyRuntime(context);
  const planned = await runFrontend(context, planArgs(request));
  return Object.freeze({
    ok: true,
    contract: REFERENCE_COLOUR_RESTORATION_BRIDGE_CONTRACT,
    providerId: REFERENCE_COLOUR_RESTORATION_PROVIDER_ID,
    sourceBinding: request.source,
    colourReferenceBinding: Object.freeze({
      ...request.reference,
      provenance: request.referenceProvenance,
      referenceIsRealPhotograph: true,
      subjectMatchConfirmedByHuman: true,
    }),
    outputDir: request.outputDir,
    prefix: request.prefix,
    runtime,
    providerPlan: planned.payload,
    executionPerformed: false,
    writesPerformed: false,
    sourceMutationAllowed: false,
    generativeFallbackAllowed: false,
    automaticWinnerSelectionAllowed: false,
    humanFinalSelectionRequired: true,
  });
}

export async function executeReferenceColourRestorationReviewSet(args = {}) {
  if (process.env[EXECUTION_ENV] !== "true") {
    throw new Error(`Reference-colour restoration execution is disabled. Set ${EXECUTION_ENV}=true.`);
  }
  if (args.confirmLocalWrite !== true) {
    throw new Error("confirmLocalWrite=true is required for this exact create-only review-set execution.");
  }
  const request = await prepareRequest(args, { execution: true });
  const context = await runtimeContext();
  const runtime = await verifyRuntime(context);
  const planned = await runFrontend(context, planArgs(request));
  const plan = planned.payload;
  if (!Number.isInteger(plan.width) || !Number.isInteger(plan.height)) {
    throw new Error("Enhancement Studio plan did not report canonical source dimensions.");
  }
  const sourceFaceBox = Array.isArray(plan.sourceFaceBox)
    ? plan.sourceFaceBox.map((entry) => Number(entry).toFixed(6)).join(",")
    : request.sourceFaceBox;
  if (!sourceFaceBox) throw new Error("Enhancement Studio plan did not resolve a source face box.");

  await mkdir(request.outputDir, { recursive: false });
  const variantResult = await runFrontend(context, variantArgs(request));
  const variantSet = variantResult.payload;
  if (!Array.isArray(variantSet.variants) || variantSet.variants.length !== 3) {
    throw new Error("Enhancement Studio must return exactly three bounded portrait-colour variants.");
  }

  const reviewedVariants = [];
  for (const variant of variantSet.variants) {
    if (
      !variant ||
      typeof variant !== "object" ||
      typeof variant.id !== "string" ||
      typeof variant.outputPath !== "string" ||
      !/^[a-f0-9]{64}$/u.test(String(variant.outputSha256 ?? ""))
    ) {
      throw new Error("Enhancement Studio returned a malformed colourization variant receipt.");
    }
    const candidate = await regularFileBinding(variant.outputPath, `reference-colour candidate ${variant.id}`);
    if (candidate.sha256 !== variant.outputSha256) {
      throw new Error(`Candidate ${variant.id} bytes do not match Enhancement Studio SHA-256.`);
    }
    const qa = await runFrontend(
      context,
      qaArgs(request.source.path, candidate.path, sourceFaceBox),
      { acceptedExitCodes: [0, 3] },
    );
    const qaPayload = qa.payload;
    const technicalPass = qaPayload.technical_pass === true || qaPayload.technicalPass === true;
    const qaPath = path.join(request.outputDir, `${request.prefix}-${variant.id}.technical-qa.json`);
    const manifestPath = path.join(request.outputDir, `${request.prefix}-${variant.id}.art-review.json`);
    const manifest = manifestFor(request, plan, variant);
    await writeFile(qaPath, `${JSON.stringify(qaPayload, null, 2)}\n`, { flag: "wx" });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    reviewedVariants.push(Object.freeze({
      id: variant.id,
      candidateBinding: candidate,
      technicalPass,
      technicalQaPath: qaPath,
      artStudioReviewManifestPath: manifestPath,
      providerReceipt: variant.receipt,
    }));
  }

  const bridgeReceiptPath = path.join(request.outputDir, `${request.prefix}.bridge-receipt.json`);
  const receipt = Object.freeze({
    ok: true,
    contract: REFERENCE_COLOUR_RESTORATION_BRIDGE_CONTRACT,
    providerId: REFERENCE_COLOUR_RESTORATION_PROVIDER_ID,
    sourceBinding: request.source,
    colourReferenceBinding: Object.freeze({
      ...request.reference,
      provenance: request.referenceProvenance,
      referenceIsRealPhotograph: true,
      subjectMatchConfirmedByHuman: true,
    }),
    outputDir: request.outputDir,
    prefix: request.prefix,
    runtime,
    providerPlan: plan,
    providerVariantSetContract: variantSet.contractVersion,
    variants: reviewedVariants,
    allCandidatesTechnicalPass: reviewedVariants.every((entry) => entry.technicalPass),
    executionPerformed: true,
    writesPerformed: true,
    sourceMutationAllowed: false,
    sourceMutated: false,
    generativeExecutionUsed: false,
    generativeFallbackAllowed: false,
    learnedRepaintUsed: false,
    inventedColourAllowed: false,
    automaticWinnerSelected: false,
    automaticCreativeApprovalGranted: false,
    humanFinalSelectionRequired: true,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
  });
  await writeFile(bridgeReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return Object.freeze({ ...receipt, bridgeReceiptPath });
}
