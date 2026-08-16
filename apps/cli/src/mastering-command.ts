import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  applyAlphaGuidance,
  atomicWriteFile,
  createTransparencyProofSheet,
  recoverBackgroundAlpha,
  suppressChromaSpill,
  type BackgroundAlphaRecoveryOptions,
} from "@evavo/art-media";
import {
  analyseDecodedSpriteFrame,
  decodeSpriteFrame,
} from "@evavo/art-quality";

export interface MasteringCommandValues {
  readonly input?: string;
  readonly output?: string;
  readonly evidence?: string;
  readonly expectations?: string;
  readonly matte?: string;
  readonly "protect-mask"?: string;
  readonly "remove-mask"?: string;
  readonly proof?: string;
  readonly "connection-distance"?: string;
  readonly "opaque-seed-distance"?: string;
  readonly "edge-search-radius"?: string;
  readonly "bleed-radius"?: string;
  readonly "minimum-border-matte-fraction"?: string;
  readonly "maximum-composite-channel-error"?: string;
  readonly "checker-connection-distance"?: string;
  readonly "checker-foreground-seed-distance"?: string;
  readonly "checker-minimum-border-fraction"?: string;
  readonly "checker-maximum-composite-channel-error"?: string;
  readonly "suppress-chroma-spill"?: boolean;
}

export type MasteringCommandResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown; exitCode?: number }>;

function required(value: string | undefined, option: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${option} is required.`);
  return normalized;
}

function optionalNumber(
  value: string | undefined,
  option: string,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${option} must be a finite number.`);
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function jsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8")) as unknown;
}

async function canonicalPathIdentity(filePath: string): Promise<string> {
  const normalize = (value: string) =>
    process.platform === "win32" ? value.toLowerCase() : value;
  try {
    return normalize(await realpath(filePath));
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      try {
        const parent = await realpath(path.dirname(filePath));
        return normalize(path.join(parent, path.basename(filePath)));
      } catch (parentError: unknown) {
        if (
          parentError &&
          typeof parentError === "object" &&
          "code" in parentError &&
          parentError.code === "ENOENT"
        ) {
          return normalize(filePath);
        }
        throw parentError;
      }
    }
    throw error;
  }
}

function recoveryOptions(
  values: MasteringCommandValues,
  matteColour: string | undefined,
): BackgroundAlphaRecoveryOptions {
  const connectionDistance = optionalNumber(
    values["connection-distance"],
    "--connection-distance",
  );
  const opaqueSeedDistance = optionalNumber(
    values["opaque-seed-distance"],
    "--opaque-seed-distance",
  );
  const edgeSearchRadius = optionalNumber(
    values["edge-search-radius"],
    "--edge-search-radius",
  );
  const bleedRadius = optionalNumber(values["bleed-radius"], "--bleed-radius");
  const minimumBorderMatteFraction = optionalNumber(
    values["minimum-border-matte-fraction"],
    "--minimum-border-matte-fraction",
  );
  const maximumCompositeChannelError = optionalNumber(
    values["maximum-composite-channel-error"],
    "--maximum-composite-channel-error",
  );
  const checkerConnectionDistance = optionalNumber(
    values["checker-connection-distance"],
    "--checker-connection-distance",
  );
  const checkerForegroundSeedDistance = optionalNumber(
    values["checker-foreground-seed-distance"],
    "--checker-foreground-seed-distance",
  );
  const checkerMinimumBorderFraction = optionalNumber(
    values["checker-minimum-border-fraction"],
    "--checker-minimum-border-fraction",
  );
  const checkerMaximumCompositeChannelError = optionalNumber(
    values["checker-maximum-composite-channel-error"],
    "--checker-maximum-composite-channel-error",
  );
  return {
    ...(matteColour === undefined ? {} : { matteColour }),
    ...(connectionDistance === undefined ? {} : { connectionDistance }),
    ...(opaqueSeedDistance === undefined ? {} : { opaqueSeedDistance }),
    ...(edgeSearchRadius === undefined ? {} : { edgeSearchRadius }),
    ...(bleedRadius === undefined ? {} : { bleedRadius }),
    ...(minimumBorderMatteFraction === undefined
      ? {}
      : { minimumBorderMatteFraction }),
    ...(maximumCompositeChannelError === undefined
      ? {}
      : { maximumCompositeChannelError }),
    ...(checkerConnectionDistance === undefined
      ? {}
      : { checkerConnectionDistance }),
    ...(checkerForegroundSeedDistance === undefined
      ? {}
      : { checkerForegroundSeedDistance }),
    ...(checkerMinimumBorderFraction === undefined
      ? {}
      : { checkerMinimumBorderFraction }),
    ...(checkerMaximumCompositeChannelError === undefined
      ? {}
      : { checkerMaximumCompositeChannelError }),
  };
}

export async function handleMasteringCommand(
  command: string,
  values: MasteringCommandValues,
): Promise<MasteringCommandResult> {
  if (command !== "master-alpha" && command !== "inspect-alpha") {
    return { handled: false };
  }
  const inputPath = path.resolve(required(values.input, "--input"));
  const matteColour = values.matte?.trim() || undefined;
  if (command === "inspect-alpha") {
    const inspection = await recoverBackgroundAlpha(
      await readFile(inputPath),
      recoveryOptions(values, matteColour),
    );
    return {
      handled: true,
      value: {
        schemaVersion: "1.0",
        command,
        inputPath,
        recoveryStrategy: inspection.evidence.strategy,
        recommendedNextStep:
          inspection.evidence.strategy === "native-alpha-preserved"
            ? "Run decoded sprite quality, then transparency admission before sheet or atlas work."
            : "Run master-alpha on a separate working copy, review the solid proof, then require transparency admission.",
        writesPerformed: false,
        evidence: inspection.evidence,
      },
    };
  }
  const outputPath = path.resolve(required(values.output, "--output"));
  const evidencePath = path.resolve(
    values.evidence?.trim() || `${outputPath}.evidence.json`,
  );
  const proofPath = values.proof?.trim() ? path.resolve(values.proof) : undefined;
  const protectMaskPath = values["protect-mask"]?.trim()
    ? path.resolve(values["protect-mask"]!)
    : undefined;
  const removeMaskPath = values["remove-mask"]?.trim()
    ? path.resolve(values["remove-mask"]!)
    : undefined;
  const protectedPaths = [
    outputPath,
    evidencePath,
    ...(proofPath ? [proofPath] : []),
  ];
  const sourcePaths = [
    inputPath,
    ...(protectMaskPath ? [protectMaskPath] : []),
    ...(removeMaskPath ? [removeMaskPath] : []),
  ];
  const [protectedPathIdentities, sourcePathIdentities] = await Promise.all([
    Promise.all(protectedPaths.map(canonicalPathIdentity)),
    Promise.all(sourcePaths.map(canonicalPathIdentity)),
  ]);
  if (
    protectedPathIdentities.some((candidate) =>
      sourcePathIdentities.includes(candidate),
    )
  ) {
    throw new Error(
      "Alpha mastering is non-destructive: output, evidence and proof paths must differ from the input and artist masks.",
    );
  }
  if (
    new Set(protectedPathIdentities).size !== protectedPathIdentities.length
  ) {
    throw new Error("--output, --evidence and --proof must use distinct paths.");
  }
  const suppliedExpectations = values.expectations
    ? await jsonFile(values.expectations)
    : {};
  if (!isRecord(suppliedExpectations)) {
    throw new Error("--expectations must contain a JSON object.");
  }

  const sourceBytes = await readFile(inputPath);
  const extraction = await recoverBackgroundAlpha(
    sourceBytes,
    recoveryOptions(values, matteColour),
  );
  const protectMask = protectMaskPath
    ? await readFile(protectMaskPath)
    : undefined;
  const removeMask = removeMaskPath
    ? await readFile(removeMaskPath)
    : undefined;
  const guidanceBleedRadius = optionalNumber(values["bleed-radius"], "--bleed-radius");
  const guidance =
    protectMask || removeMask
      ? await applyAlphaGuidance(extraction.png, sourceBytes, {
          ...(protectMask ? { protectMask } : {}),
          ...(removeMask ? { removeMask } : {}),
          ...(guidanceBleedRadius === undefined
            ? {}
            : { bleedRadius: guidanceBleedRadius }),
        })
      : null;
  const spillSuppression = values["suppress-chroma-spill"]
    ? await suppressChromaSpill(guidance?.png ?? extraction.png, {
        matteColour:
          extraction.evidence.matte?.hex ??
          extraction.evidence.classification.inferredMatte?.hex ??
          required(matteColour, "--matte"),
        allowInferredMatte:
          extraction.evidence.strategy === "inferred-high-chroma-key",
      })
    : null;
  const masteredPng = spillSuppression?.png ?? guidance?.png ?? extraction.png;
  const proof = proofPath
    ? await createTransparencyProofSheet(masteredPng)
    : null;
  const decoded = await decodeSpriteFrame(masteredPng);
  const existingMattes = Array.isArray(suppliedExpectations.knownMatteColours)
    ? suppliedExpectations.knownMatteColours
    : [];
  const checkerMattes = extraction.evidence.classification.checkerboard.detected
    ? extraction.evidence.classification.checkerboard.colours.map(
        (colour) =>
          `#${[colour.r, colour.g, colour.b]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`,
      )
    : [];
  const knownMatteColours = [
    ...(extraction.evidence.matte?.hex
      ? [extraction.evidence.matte.hex]
      : matteColour
        ? [matteColour]
        : []),
    ...(extraction.evidence.classification.inferredMatte?.hex
      ? [extraction.evidence.classification.inferredMatte.hex]
      : []),
    ...checkerMattes,
    ...existingMattes,
  ];
  const quality = analyseDecodedSpriteFrame(decoded, {
    ...suppliedExpectations,
    frameId:
      typeof suppliedExpectations.frameId === "string"
        ? suppliedExpectations.frameId
        : path.basename(outputPath),
    transparency: "alpha-required",
    expectedWidth:
      typeof suppliedExpectations.expectedWidth === "number"
        ? suppliedExpectations.expectedWidth
        : decoded.width,
    expectedHeight:
      typeof suppliedExpectations.expectedHeight === "number"
        ? suppliedExpectations.expectedHeight
        : decoded.height,
    expectedFormat: "png",
    safePadding:
      typeof suppliedExpectations.safePadding === "number"
        ? suppliedExpectations.safePadding
        : 1,
    ...(knownMatteColours.length ? { knownMatteColours } : {}),
  });
  const evidence = {
    schemaVersion: "2.0",
    command: "master-alpha",
    inputPath,
    outputPath,
    evidencePath,
    approvalState: "unapproved",
    promotionEligible: quality.passed,
    extraction: extraction.evidence,
    guidance: guidance?.evidence ?? null,
    spillSuppression: spillSuppression?.evidence ?? null,
    transparencyProof: proof
      ? { path: proofPath, evidence: proof.evidence }
      : null,
    quality,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(evidencePath), { recursive: true });
  if (proofPath) await mkdir(path.dirname(proofPath), { recursive: true });
  await atomicWriteFile(outputPath, masteredPng);
  if (proofPath && proof) await atomicWriteFile(proofPath, proof.png);
  await atomicWriteFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  return {
    handled: true,
    value: {
      schemaVersion: "2.0",
      outputPath,
      evidencePath,
      outputSha256:
        spillSuppression?.evidence.outputSha256 ??
        guidance?.evidence.outputSha256 ??
        extraction.evidence.outputSha256,
      recoveryStrategy: extraction.evidence.strategy,
      chromaSpillSuppressed: spillSuppression !== null,
      artistGuidanceApplied: guidance !== null,
      proofPath: proofPath ?? null,
      qualityPassed: quality.passed,
      promotionEligible: quality.passed,
      approvalState: "unapproved",
    },
    ...(quality.passed ? {} : { exitCode: 3 }),
  };
}
