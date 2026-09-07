const COLOUR_RESTORATION_PATTERN = /\b(?:colou?r(?:ise|ize|ised|ized|ising|izing|isation|ization)|(?:restore|recover|reconstruct|recreate|bring\s+back|add|apply)\s+(?:the\s+|original\s+|real\s+|authentic\s+)?colou?r|colou?r\s+(?:restore|restoration|recovery|reconstruction))\b/i;
const EXPLICIT_NO_COLOUR_PATTERN = /\b(?:(?:do\s+not|don't|dont|never)\s+(?:add|apply|restore|recover|reconstruct|colou?r(?:ise|ize))\s+(?:any\s+|the\s+)?colou?r|without\s+(?:adding\s+|restoring\s+)?colou?r|keep\s+(?:it\s+)?(?:black\s*(?:and|&)\s*white|b\s*&\s*w|monochrome|gr[ae]yscale))\b/i;
const CLEANUP_PATTERN = /\b(?:clean\s*up|cleanup|halo|fringe|matte\s+contamination|edge\s+cleanup|remove\s+(?:a\s+)?(?:white\s+)?outline|transparent\s+background|alpha\s+cleanup)\b/i;
const UPSCALE_PATTERN = /\b(?:upscale|upscaling|super\s*resolution|increase\s+(?:the\s+)?resolution|higher[-\s]?resolution|enlarge\s+(?:this|the)\s+(?:image|photo|picture))\b/i;
const RESTORATION_PATTERN = /\b(?:restore|restoration|repair|retouch|retouching|scratch(?:es)?|dust|crease(?:s)?|tear(?:s|ing)?|damage(?:d)?|faded|fading|old\s+photo|spot\s+repair|healing|defect\s+repair)\b/i;
const GENERATIVE_PATTERN = /\b(?:create|generate|draw|illustrate|render|design|invent|make)\b[^.!?\n]{0,80}\b(?:image|picture|photo|portrait|artwork|illustration|scene|character)\b/i;
const EXISTING_IMAGE_PATTERN = /\b(?:this|the|my|existing|original|source|reference|old)\s+(?:image|photo|photograph|picture|portrait|asset|png|jpg|jpeg|webp)\b|\b(?:b\s*&\s*w|black\s*(?:and|&)\s*white|monochrome|gr[ae]yscale)\b/i;
const GRAYSCALE_PATTERN = /\b(?:b\s*&\s*w|black\s*(?:and|&)\s*white|monochrome|gr[ae]yscale)\b/i;

export const TRUSTED_COLOUR_REFERENCE_PROVENANCE = Object.freeze([
  'user-provided-original',
  'user-owned-original',
  'camera-original',
  'first-party-archive',
  'verified-archive',
  'known-colour-photo',
]);

const trustedColourReferenceProvenance = new Set(TRUSTED_COLOUR_REFERENCE_PROVENANCE);

function normalizePrompt(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[‐‑–—]/g, '-').trim()
    : '';
}

function normalizePath(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedIdentity(value) {
  return normalizePath(value).replace(/\\/g, '/').toLowerCase();
}

function normalizeBinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const path = normalizePath(value.path);
  if (!path) return null;
  return Object.freeze({
    path,
    ...(typeof value.sha256 === 'string' && value.sha256.trim() ? { sha256: value.sha256.trim().toLowerCase() } : {}),
    ...(typeof value.provenance === 'string' && value.provenance.trim() ? { provenance: value.provenance.trim().toLowerCase() } : {}),
    ...(typeof value.referenceIsRealPhotograph === 'boolean' ? { referenceIsRealPhotograph: value.referenceIsRealPhotograph } : {}),
    ...(typeof value.subjectMatchConfirmedByHuman === 'boolean' ? { subjectMatchConfirmedByHuman: value.subjectMatchConfirmedByHuman } : {}),
  });
}

function shaMalformed(binding) {
  return Boolean(binding?.sha256 && !/^[a-f0-9]{64}$/.test(binding.sha256));
}

export function classifyExistingImageRequest(prompt, { sourcePresent = false } = {}) {
  const normalizedPrompt = normalizePrompt(prompt);
  const noColour = EXPLICIT_NO_COLOUR_PATTERN.test(normalizedPrompt);
  const signals = Object.freeze({
    colourRestoration: !noColour && COLOUR_RESTORATION_PATTERN.test(normalizedPrompt),
    explicitNoColour: noColour,
    cleanup: CLEANUP_PATTERN.test(normalizedPrompt),
    upscale: UPSCALE_PATTERN.test(normalizedPrompt),
    restoration: RESTORATION_PATTERN.test(normalizedPrompt),
    generative: GENERATIVE_PATTERN.test(normalizedPrompt),
    grayscale: GRAYSCALE_PATTERN.test(normalizedPrompt),
    existingImage: Boolean(sourcePresent) || EXISTING_IMAGE_PATTERN.test(normalizedPrompt),
  });

  let intent = 'unknown';
  if (signals.colourRestoration) intent = 'colour-restoration';
  else if (signals.cleanup) intent = 'cleanup';
  else if (signals.upscale) intent = 'upscale';
  else if (signals.restoration) intent = 'restoration';
  else if (signals.generative) intent = 'generative';

  return Object.freeze({
    intent,
    normalizedPrompt,
    signals,
    existingImageWorkflow: intent !== 'generative' && (signals.existingImage || sourcePresent),
  });
}

function basePlan(classification, source, colourReference) {
  return {
    contract: 'evavo.existing-image-restoration-intake.v1',
    intent: classification.intent,
    classification: classification.signals,
    sourceBinding: source,
    colourReferenceBinding: colourReference,
    preserveSource: true,
    sourceMutationAllowed: false,
    allowGenerativeFallback: false,
    automaticCreativeApprovalAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    humanFinalSelectionRequired: true,
    qaMayRejectCandidates: true,
    qaMaySelectWinner: false,
    candidatePromotionAllowed: false,
    executionAllowed: false,
  };
}

function blocked(base, reasonCode, nextAction, route = 'existing-image-restoration-intake') {
  return Object.freeze({
    ...base,
    route,
    status: 'blocked',
    reasonCode,
    providerExecutionEligible: false,
    nextAction,
  });
}

export function planExistingImageRestorationIntake(request = {}, runtime = {}) {
  const prompt = normalizePrompt(request.prompt);
  if (!prompt) {
    const classification = classifyExistingImageRequest('');
    return blocked(basePlan(classification, null, null), 'missing_prompt', 'Provide the exact image-edit request before routing.');
  }

  const source = normalizeBinding(request.source);
  const colourReference = normalizeBinding(request.colourReference);
  const classification = classifyExistingImageRequest(prompt, { sourcePresent: Boolean(source) });
  const base = basePlan(classification, source, colourReference);

  if (classification.intent === 'generative') {
    return Object.freeze({
      ...base,
      route: 'generative-art-workflow',
      status: 'route-elsewhere',
      reasonCode: 'direct_generative_request',
      providerExecutionEligible: false,
      nextAction: 'Route to the governed generative-art workflow. Do not treat generation as a fallback for an existing-image edit.',
    });
  }

  if (!source) {
    return blocked(base, 'missing_source_asset', 'Bind the genuine existing source image. Do not synthesize a replacement source.');
  }
  if (shaMalformed(source)) {
    return blocked(base, 'malformed_source_binding', 'Rebind the source with a valid SHA-256 digest or omit the digest until it can be verified.');
  }

  if (classification.intent === 'colour-restoration') {
    if (!colourReference) {
      return blocked(base, 'missing_real_colour_reference', 'Bind a real colour photograph/reference for this subject. Do not infer or invent colours.', 'existing-image-reference-colour-restoration');
    }
    if (shaMalformed(colourReference)) {
      return blocked(base, 'malformed_colour_reference_binding', 'Rebind the colour reference with a valid SHA-256 digest or omit the digest until it can be verified.', 'existing-image-reference-colour-restoration');
    }
    if (normalizedIdentity(source.path) === normalizedIdentity(colourReference.path)) {
      return blocked(base, 'colour_reference_must_be_distinct', 'Bind a distinct real colour reference image rather than reusing the monochrome source.', 'existing-image-reference-colour-restoration');
    }
    if (colourReference.referenceIsRealPhotograph !== true) {
      return blocked(base, 'real_photograph_reference_not_confirmed', 'Confirm that the colour reference is a real photograph, not generated, illustrated, recoloured or synthetic.', 'existing-image-reference-colour-restoration');
    }
    if (!trustedColourReferenceProvenance.has(colourReference.provenance ?? '')) {
      return blocked(base, 'unverified_colour_reference', `Use one of the trusted provenance values: ${TRUSTED_COLOUR_REFERENCE_PROVENANCE.join(', ')}.`, 'existing-image-reference-colour-restoration');
    }
    if (colourReference.subjectMatchConfirmedByHuman !== true) {
      return blocked(base, 'subject_match_not_confirmed', 'A human must confirm that the real colour reference depicts the same subject before colour transfer can be planned.', 'existing-image-reference-colour-restoration');
    }

    const providerId = typeof runtime.referenceColourRestorationProviderId === 'string'
      ? runtime.referenceColourRestorationProviderId.trim()
      : '';
    if (!providerId) {
      return Object.freeze({
        ...base,
        route: 'existing-image-reference-colour-restoration',
        status: 'provider-unavailable',
        reasonCode: 'reference_colour_provider_unavailable',
        providerExecutionEligible: false,
        providerId: null,
        nextAction: 'Configure a bounded reference-driven colour-restoration provider. Do not substitute text-to-image, guessed colourisation or a generative fallback.',
      });
    }

    return Object.freeze({
      ...base,
      route: 'existing-image-reference-colour-restoration',
      status: 'ready-for-provider',
      reasonCode: 'requirements_satisfied',
      providerExecutionEligible: true,
      providerId,
      nextAction: 'Create a source-bound provider job that can only derive colour from the admitted real reference, then return candidates for technical QA and human final selection.',
    });
  }

  if (classification.intent === 'cleanup' || classification.intent === 'restoration') {
    return Object.freeze({
      ...base,
      route: 'existing-image-finishing-plan',
      status: 'ready-for-review-planning',
      reasonCode: 'source_bound_existing_image_edit',
      providerExecutionEligible: false,
      nextTool: 'evavo_plan_existing_image_finishing',
      nextAction: 'Run source-bound defect inspection/review, then create the smallest preservation-first finishing plan. Any repair remains proposal-only until reviewed.',
    });
  }

  if (classification.intent === 'upscale') {
    return Object.freeze({
      ...base,
      route: 'existing-image-upscale-candidate-assurance',
      status: 'candidate-required',
      reasonCode: 'upscale_provider_not_owned_by_intake',
      providerExecutionEligible: false,
      nextTool: 'evavo_compare_existing_image_edit',
      nextAction: 'Obtain an upscale candidate only from an explicitly configured provider, then compare it against the immutable source before any approval. This router will not invent an upscale provider.',
    });
  }

  return Object.freeze({
    ...base,
    route: 'existing-image-manual-review',
    status: 'needs-review',
    reasonCode: 'existing_image_intent_not_confidently_classified',
    providerExecutionEligible: false,
    nextAction: 'Review the request manually and choose a bounded existing-image operation. Do not fall back to generation.',
  });
}
