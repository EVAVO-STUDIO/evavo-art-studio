# Approved Visual Continuity to 3D Adapter

Art Studio now compiles a release-approved visual continuity handoff into the exact multi-view schema consumed by the live EVAVO 3D Studio receiver.

The adapter does not generate a model and does not execute the receiver. It proves that the approved image bytes, approval receipts, continuity rules and 3D production intent can be represented in the receiver's governed contract.

## Receiver

The output schema is:

```text
evavo.art.asset-fabricator-reference-handoff.v1
```

The downstream receiver is:

```text
evavo-3d-art-reference-brief
```

The durable worker task is:

```text
creative-media-3d-art-reference-brief
```

The receiver independently validates the handoff again before it compiles a production brief. Art Studio must not claim receiver execution merely because it created the handoff.

## Required source views

Every asset requires separate approved sources for:

- front;
- back;
- left;
- right;
- three-quarter.

Vehicle, architecture, environment-piece, environment-kit and terrain assets also require top view. Additional view types supported by the underlying handoff include bottom, perspective, detail, concept and orthographic.

Each view assignment binds:

- one visual-continuity work-item ID;
- one local image path;
- its exact view and role;
- rights classification;
- notes;
- the approved source SHA-256 from the handoff.

A work item or canonical view may not be reused within one adapter request. The local file bytes must exactly match the approved continuity source. A visually similar export with different bytes is rejected.

## Approval and continuity verification

Before adapting, Art Studio verifies:

- approved-handoff schema and protocol version;
- `targetStudio: 3d-studio`;
- deterministic handoff SHA-256;
- `approved-for-receiver-validation` release status;
- the declared adapter, receiver and worker route;
- one approval receipt for every source;
- each approval receipt's deterministic SHA-256;
- approved decision;
- exact work item, context, artifact and candidate binding;
- false mutation, automatic-approval and publication authorities.

The 3D art direction is built from the approved continuity style, exact selected colour tokens, prohibited generic and modern traits, continuity locks and additional request-specific avoid rules. The request supplies only the genuinely 3D-specific decisions: asset class, silhouette statement, topology, materials, rigging, delivery, dimensions and anchors.

## Adapter request

The request contract is:

```text
evavo_art_visual_continuity_3d_reference_adapter_request_v1
```

Required top-level fields are:

```text
contractVersion
approvedHandoffPath
approvedHandoffFileSha256
assetId
subjectId
assetClass
references
paletteTokenIds
threeDArtDirection
geometryIntent
materialIntent
riggingIntent
deliveryIntent
dimensionsMetres
anchors
provenance
```

`approvedHandoffFileSha256` binds the exact JSON file bytes. The approved handoff also contains and verifies its own semantic `handoffSha256`.

The adapter request JSON itself becomes the receiver handoff's `sourceProgram`. Its path, byte length, SHA-256 and contract version are recorded. The receiver can therefore identify the exact adapter request used to compile the package.

## CLI

Compile an exact handoff:

```powershell
node scripts/game-art-production/visual-continuity-3d-reference-adapter.mjs `
  compile C:\path\adapter-request.json
```

Verify an existing handoff by deterministic replay:

```powershell
node scripts/game-art-production/visual-continuity-3d-reference-adapter.mjs `
  verify C:\path\adapter-request.json C:\path\receiver-handoff.json
```

Print capabilities:

```powershell
node scripts/game-art-production/visual-continuity-3d-reference-adapter.mjs capabilities
```

The CLI returns JSON to stdout. The guarded MCP surface provides create-only file output.

## MCP

Connect the dedicated configuration:

```text
.mcp.visual-continuity-3d-reference-adapter-v1.json
```

Tools:

```text
evavo_visual_continuity_3d_adapter_capabilities
evavo_compile_visual_continuity_3d_handoff
evavo_verify_visual_continuity_3d_handoff
```

The server operator controls readable and writable roots with:

```text
EVAVO_VISUAL_CONTINUITY_3D_ALLOWED_ROOTS
```

Optional output writes require:

```text
EVAVO_VISUAL_CONTINUITY_3D_ALLOW_WRITES=true
```

When an output path is supplied, the MCP server creates one JSON file with no-overwrite, create-only and rollback-safe semantics. It never accepts a caller-supplied executable, shell arguments, provider credentials or receiver command.

## Validation

The root `pnpm asset-fabricator:check` gate now checks the original multi-view handoff contracts together with the continuity adapter. It includes syntax validation, byte-bound source tests, approval tamper rejection, required-view rejection, deterministic replay and guarded MCP contract tests.

Receiver execution and cross-repository runtime validation remain separate. The generated handoff should be passed to EVAVO 3D Studio only after this gate and the full repository `pnpm check` pass locally.
