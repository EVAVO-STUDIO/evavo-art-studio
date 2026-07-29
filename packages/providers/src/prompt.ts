import { sha256 } from "@evavo/art-artifacts";

import type {
  NormalizedProviderCandidateRequest,
  ProviderReferenceRole,
} from "./types.js";

export interface CompiledProviderPrompt {
  readonly text: string;
  readonly sha256: string;
}

const ROLE_LABELS: Readonly<Record<ProviderReferenceRole, string>> = {
  "canonical-identity": "canonical identity master",
  "direction-master": "approved direction master",
  "previous-key-pose": "approved previous key pose",
  "next-key-pose": "approved next key pose",
  "base-image": "approved base image",
  mask: "edit mask",
  "pose-control": "pose or skeletal control",
  "edge-control": "edge or line structure control",
  "depth-control": "depth structure control",
  "palette-reference": "approved palette reference",
  "line-reference": "approved line-treatment reference",
  "material-reference": "approved material reference",
  "layer-context": "registered sibling-layer context",
};

function bulletSection(title: string, values: readonly string[]): string[] {
  if (!values.length) return [];
  return [title, ...values.map((value) => `- ${value}`)];
}

function optionalLine(label: string, value: string | undefined): string[] {
  return value ? [`${label}: ${value}`] : [];
}

function referenceSection(request: NormalizedProviderCandidateRequest): string[] {
  if (!request.references.length) return ["REFERENCE CONTRACT", "- No image references supplied."];
  return [
    "REFERENCE CONTRACT",
    ...request.references.map(
      (reference, index) =>
        `- Reference ${index + 1}: ${ROLE_LABELS[reference.role]}; strength ${reference.strength.toFixed(2)}; ${reference.required ? "required" : "optional"}${reference.note ? `; ${reference.note}` : ""}.`,
    ),
    "- Treat reference roles as separate instructions. Do not average identities, poses, palettes or materials together.",
  ];
}

function continuitySection(request: NormalizedProviderCandidateRequest): string[] {
  const common = [
    "CONTINUITY CONTRACT",
    `- Production phase: ${request.continuityPhase}.`,
    "- Preserve every locked identity, proportion, costume, equipment, material and line-language decision from approved references.",
    "- Do not redesign, beautify, modernise, simplify or reinterpret approved identity details.",
    "- Generate only this bounded frame or layer. Do not create a sprite sheet, contact sheet, storyboard, comparison grid or multiple panels.",
  ];
  if (request.continuityPhase === "identity-master") {
    return [
      ...common,
      "- Establish one clean canonical identity master that later directions, poses, layers and repairs can inherit.",
      "- Resolve defining face, body proportions, silhouette, costume construction, equipment scale and handedness deliberately.",
    ];
  }
  if (request.continuityPhase === "direction-master") {
    return [
      ...common,
      "- Rotate or stage the approved canonical identity into the requested direction without changing the design.",
      "- Preserve height, mass, costume construction, equipment scale, handedness and silhouette vocabulary.",
    ];
  }
  if (request.continuityPhase === "key-pose") {
    return [
      ...common,
      "- Author a readable motion extreme or contact pose while keeping the approved identity and direction master intact.",
      "- Prioritise clear weight, balance, silhouette and ground contact over decorative variation.",
    ];
  }
  if (request.continuityPhase === "in-between") {
    return [
      ...common,
      "- Interpolate motion between the approved previous and next key poses; do not invent a third unrelated pose.",
      "- Maintain plausible arcs, spacing, volume and registration with both neighbouring key poses.",
      "- The canonical identity master remains the authority when neighbouring frames disagree.",
    ];
  }
  if (request.continuityPhase === "repair") {
    return [
      ...common,
      "- Change only the explicitly defective region or property. Preserve all approved pixels, identity and composition outside the repair scope.",
      "- Do not use the repair as permission to regenerate or restyle the complete asset.",
    ];
  }
  return [
    ...common,
    "- Although this asset is independent, it must still obey the project style envelope, shot contract and delivery constraints.",
  ];
}

function backgroundSection(request: NormalizedProviderCandidateRequest): string[] {
  if (request.target.transparency === "opaque") {
    return [
      "BACKGROUND AND ALPHA CONTRACT",
      "- Deliver an intentionally opaque candidate. Do not imitate transparency with a checkerboard.",
    ];
  }
  if (request.background.strategy === "native-alpha") {
    return [
      "BACKGROUND AND ALPHA CONTRACT",
      "- Return genuine alpha transparency, not a checkerboard, white matte, black matte or coloured rectangle.",
      "- Keep transparent margins clean and do not crop hair, limbs, equipment, shadows or effect trails.",
    ];
  }
  if (request.background.strategy === "chroma-key") {
    return [
      "BACKGROUND AND ALPHA CONTRACT",
      `- Render against one perfectly flat solid ${request.background.matteColour} chroma matte for deterministic extraction.`,
      "- Do not render a checkerboard, gradient, horizon, vignette, texture, cast shadow on the matte or reflected matte-colour light.",
      "- Keep the complete subject separated cleanly from the matte and inside the canvas with generous safe clearance.",
      "- This is an intermediate extraction candidate; it is not the final transparent asset.",
    ];
  }
  return [
    "BACKGROUND AND ALPHA CONTRACT",
    "- Keep the background simple and extraction-safe. Never imitate transparency with a checkerboard.",
    "- This candidate must still pass deterministic alpha extraction and hostile-matte QA before delivery.",
  ];
}

export function compileProviderCandidatePrompt(
  request: NormalizedProviderCandidateRequest,
): CompiledProviderPrompt {
  const lines = [
    "EVAVO ART STUDIO — GOVERNED CANDIDATE CONTRACT",
    "",
    "OUTPUT STATUS",
    "- Produce intermediate candidate artwork only. Never present it as final, approved, mastered or engine-ready.",
    "- Do not add labels, captions, watermarks, signatures, UI chrome or explanatory text unless the shot itself explicitly requires text.",
    "",
    "WORK ITEM",
    `- Operation: ${request.operation}.`,
    `- Asset: ${request.assetId}.`,
    `- Candidate family: ${request.candidateFamilyId}.`,
    `- Asset kind: ${request.assetKind}.`,
    ...optionalLine("- Frame", request.frameId),
    ...optionalLine("- Layer", request.layerId),
    `- Creative intent: ${request.creativeIntent}`,
    ...(request.negativeIntent
      ? [`- Additional negative intent: ${request.negativeIntent}`]
      : []),
    "",
    ...continuitySection(request),
    "",
    "STYLE ENVELOPE",
    `- Style name: ${request.style.styleName}.`,
    `- Art-direction intent: ${request.style.intent}`,
    ...bulletSection("MUST HAVE", request.style.mustHave),
    ...bulletSection("MUST AVOID", request.style.mustAvoid),
    ...bulletSection("IDENTITY LOCKS", request.style.identityLocks),
    ...bulletSection("PALETTE RULES", request.style.palette),
    ...bulletSection("LINE TREATMENT", request.style.lineTreatment),
    ...bulletSection("MATERIAL RULES", request.style.materials),
    ...bulletSection("CAMERA RULES", request.style.cameraRules),
    ...bulletSection("COMPOSITION RULES", request.style.compositionRules),
    ...bulletSection("ERA AND AUTHENTICITY RULES", request.style.eraRules),
    "",
    "SHOT CONTRACT",
    `- Subject: ${request.shot.subject}`,
    ...optionalLine("- Action", request.shot.action),
    ...optionalLine("- Direction", request.shot.direction),
    ...bulletSection("INCLUDE IN THIS SHOT", request.shot.include),
    ...bulletSection("EXCLUDE FROM THIS SHOT", request.shot.exclude),
    ...bulletSection(
      "KEEP AS SEPARATE ASSETS OR LAYERS — DO NOT BAKE INTO THIS SHOT",
      request.shot.separateAssets,
    ),
    ...bulletSection("FRAMING AND SAFE-BOUND RULES", request.shot.framing),
    "- Include only elements declared for this shot. Do not invent extra props, characters, scenery, effects or costume details.",
    "- Keep the complete intended silhouette inside the canvas. Nothing important may touch or cross the frame edge.",
    "",
    ...referenceSection(request),
    "",
    "TARGET CONTRACT",
    `- Final target canvas: ${request.target.width} × ${request.target.height}.`,
    ...(request.sourceCanvas
      ? [
          `- Provider source canvas: ${request.sourceCanvas.width} × ${request.sourceCanvas.height}; compose for lossless deterministic reduction to the final target.`,
        ]
      : []),
    `- Master format: ${request.target.outputFormat}.`,
    `- Transparency target: ${request.target.transparency}.`,
    `- Quality tier: ${request.quality}.`,
    ...(request.seed === undefined
      ? []
      : [`- Deterministic family seed: ${request.seed}.`]),
    "",
    ...backgroundSection(request),
    "",
    "FINAL SELF-CHECK BEFORE RETURNING THE CANDIDATE",
    "- Same approved identity and design, no unexplained drift.",
    "- Correct direction, pose, layer scope and occlusion.",
    "- No duplicated limbs, broken anatomy, malformed equipment, stray text or AI-like decorative filler.",
    "- No crop, fake transparency, checkerboard or unintended baked background.",
    "- One bounded candidate image only.",
  ];
  const text = `${lines.filter((line, index, values) => {
    if (line !== "") return true;
    return index > 0 && values[index - 1] !== "";
  }).join("\n").trim()}\n`;
  return { text, sha256: sha256(text) };
}
