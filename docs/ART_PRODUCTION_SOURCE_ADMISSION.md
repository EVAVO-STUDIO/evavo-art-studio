# Art Production Source PNG Admission

The Art Production Source PNG Admission boundary is the read-only byte-verification step after an approval-bound runtime assembly handoff and before any sheet, atlas, scene or repository writer is allowed to consume source art.

The runtime assembly handoff proves metadata lineage. It intentionally does not fetch or inspect artifact bytes. Source admission closes that remaining gap by requiring the caller to supply the exact PNG bytes for every source binding in the handoff.

## Position in the governed flow

```text
review-passed candidate
  -> named-human approval receipt
  -> deterministic packaging plan
  -> approval-bound runtime assembly handoff
  -> exact caller-supplied PNG byte admission
  -> separate packaging or runtime assembly execution
```

The admission receipt is evidence only. It does not write, alter, pack, promote or activate any image.

## Compilation API

```ts
compileArtProductionSourceAdmissionReceipt(
  plan,
  loop,
  approvals,
  packagingPlan,
  assemblyRequest,
  runtimeAssemblyHandoff,
  sources,
)
```

Each source input contains exactly:

```ts
{
  unitId: string;
  bytes: Uint8Array;
}
```

The function first re-verifies the exact runtime assembly handoff against its plan, loop, approval receipts, packaging plan and assembly request. It then captures the caller-supplied byte arrays, requires one source per handoff binding, and inspects every PNG.

It does not autonomously fetch an artifact from storage. Artifact-store access remains a separate governed adapter concern.

## Content-address verification

For each handoff source, admission requires exact agreement for:

- byte count;
- SHA-256;
- `artifact_<sha256>` identity;
- unit ID;
- native width and height;
- alpha policy;
- target path;
- accepted technical-review attempt;
- approval request, approval basis and approval receipt identities.

A changed byte therefore fails before PNG semantics are trusted, even when the file name, dimensions and outer metadata remain unchanged.

## PNG structural verification

The validator independently checks:

- the exact eight-byte PNG signature;
- complete bounded chunk framing;
- alphabetic four-byte chunk types;
- one leading 13-byte `IHDR`;
- at least one contiguous `IDAT` sequence;
- one terminal zero-length `IEND`;
- no data after `IEND`;
- CRC-32 for every chunk;
- rejection of unsupported critical chunks;
- rejection of APNG animation chunks;
- exact handoff dimensions;
- eight-bit RGBA colour type 6;
- standard compression and filtering methods;
- non-interlaced encoding;
- bounded compressed and decoded sizes.

The complete IDAT stream is inflated, and PNG filters `0`, `1`, `2`, `3` and `4` are independently reversed into the exact decoded RGBA buffer.

## Decoded pixel evidence

Each admission retains:

```text
decodedRgbaSha256
opaquePixels
translucentPixels
transparentPixels
visiblePixels
unsafeTransparentPixels
```

The decoded RGBA identity is independent of PNG container compression and chunk layout. It can therefore distinguish two PNG containers that decode to different source pixels even when their metadata claims are otherwise similar.

Every admitted source must contain visible pixels. Fully transparent pixels must contain zero RGB values so hidden matte colours cannot leak into later processing.

Alpha policy is enforced from the handoff:

- `opaque` requires every pixel to have alpha 255;
- `transparent` requires a transparent background and binary alpha with no translucent edge pixels;
- `mixed` requires at least one non-opaque pixel and permits intentional translucency.

## Receipt identity

Every source admission has its own `admissionSha256`. The complete receipt has a separate `receiptSha256` and binds:

- plan and loop identities;
- profile identity;
- packaging identity;
- assembly request and manifest identities;
- exact runtime handoff identity;
- every source and approval-lineage identity;
- structural PNG evidence;
- decoded RGBA evidence;
- aggregate source and pixel totals;
- the closed read-only authority boundary.

## Verification API

```ts
verifyArtProductionSourceAdmissionReceipt(
  plan,
  loop,
  approvals,
  packagingPlan,
  assemblyRequest,
  runtimeAssemblyHandoff,
  sources,
  receipt,
)
```

Verification performs two independent checks.

1. It validates every submitted receipt field, nested admission hash, aggregate total, authority flag and the complete submitted receipt hash.
2. It re-verifies the runtime handoff, re-inspects the exact supplied PNG bytes, recompiles the canonical receipt and requires the receipt identities to match.

This separates two attacker cases:

- retained-hash mutation fails because the submitted receipt no longer matches its claimed identity;
- attacker-rehashed mutation fails because the new object is not the deterministic inspection of the exact governed handoff and bytes.

A receipt from another handoff or another byte set cannot be replayed.

## Authority boundary

The source admission receipt states:

```text
callerSuppliedByteRead: true
autonomousArtifactFetch: false
artifactWrite: false
providerExecution: false
imageMutation: false
creativeDecision: false
packagingExecution: false
automaticAssembly: false
targetRepositoryMutation: false
runtimeActivation: false
gitCommit: false
gitPush: false
deployment: false
publication: false
forcePush: false
```

The one positive capability is bounded read-only inspection of bytes explicitly supplied to the API call. It does not grant storage browsing, provider access, source mutation, assembly execution or publication authority.

## MCP boundary

Binary source admission is deliberately not registered as an Art Studio MCP tool. The existing MCP surface remains planning-only and cannot fetch artifact bytes or execute image work.

Callers that need source-byte admission use the direct `@evavo/art-direction` package API and must obtain the bytes through a separately authorised artifact adapter.

## Adversarial coverage

The focused tests prove that the boundary:

- admits exact content-addressed PNG bytes;
- rejects changed bytes;
- rejects malformed chunk CRCs even when the malformed file's new hash is accepted upstream as metadata;
- rejects IHDR dimension drift;
- rejects unsafe transparent RGB;
- rejects missing or duplicate source coverage;
- rejects retained-hash receipt mutation;
- rejects attacker-rehashed artifact-write authority escalation;
- rejects replay of a valid receipt against another exact handoff and byte set.
