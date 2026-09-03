# Local Generation Reference Packs

Reference packs add reviewed image-conditioning workflows to the generic local Art Studio batch system without hardcoding any custom-node implementation, model family or project subject into the batch runner.

## Truth boundary

The V2/V1 artifact-reference bridge is already capable of passing real `artifact_<sha256>` inputs to provider requests. A run is **artifact-conditioned** only when the selected reviewed ComfyUI profile also advertises and binds the required reference roles.

A reference pack is therefore a provider/workflow commissioning artifact, not a prompt template.

## Pack contract

`evavo.local-generation-reference-pack.v1` declares:

- a safe pack identity and version;
- the suffix for the generated reviewed profile;
- provider capabilities such as `reference-images`, `identity-reference`, `pose-control` or `temporal-reference`;
- `maximumReferenceImages`;
- required ComfyUI node classes;
- additive workflow nodes;
- explicit input rewires on existing nodes;
- exact `bindings.referenceImages` roles, node inputs and optional strength inputs;
- hashed model inventory additions;
- hashed runtime inventory additions.

The compiler never executes arbitrary code and never downloads models or custom nodes.

## Compilation

A pack is compiled against an explicit reviewed base profile:

```text
node scripts/compile-comfyui-reference-catalog.mjs \
  --input <compiled-catalog.json> \
  --pack <reviewed-pack.json> \
  --base-profile <reviewed-base-profile-id> \
  --output <candidate-reference-catalog.json>
```

The command performs:

1. compiled catalog → reviewed draft decompilation;
2. declarative reference-pack application;
3. normal ComfyUI catalog compilation and integrity hashing;
4. verification that the generated profile has reference bindings, capabilities and valid limits.

Use `--replace-input true` only after physical commissioning succeeds. Replacement preserves a timestamped backup.

## Physical commissioning preflight

A successfully compiled catalog is not proof that the workstation can run the workflow.

Use:

```text
node scripts/preflight-comfyui-reference-profile.mjs \
  --catalog <candidate-reference-catalog.json> \
  --profile <generated-profile-id> \
  --base-url http://127.0.0.1:<owned-port> \
  --model-inventory <physical-model-inventory.json>
```

The preflight:

- refuses non-loopback endpoints;
- queries live `/object_info`;
- requires every compiled workflow node class to exist in the live ComfyUI runtime;
- re-validates reference binding roles and `maximumReferenceImages`;
- reads each declared physical model file;
- rejects symlinks, empty files and missing files;
- recalculates SHA-256 and requires an exact match with the reviewed profile inventory.

The physical inventory uses `evavo.local-generation-physical-model-inventory.v1` and maps reviewed model IDs to exact local files plus expected SHA-256 digests.

## Commissioning sequence

The governed sequence is:

1. review/pin the custom-node or core-node implementation;
2. review/pin every required model file;
3. record exact source/runtime/model SHA-256 values;
4. author a reference pack using only declarative workflow changes;
5. compile a candidate catalog;
6. start an isolated local ComfyUI service;
7. run the live node/model preflight;
8. run a small non-production reference smoke through the provider adapter;
9. only then promote the catalog with a backup;
10. retain the profile/workflow/catalog hashes in the commissioning receipt.

## Capability examples

The pack format is deliberately implementation-neutral. A reviewed pack may represent identity reference, pose/depth/edge ControlNet, palette/material references, temporal key-pose references, or another local image-conditioning implementation.

For example, an IP-Adapter implementation can be represented by its pinned node classes, workflow additions, model/runtime inventories and `canonical-identity` binding. A ControlNet implementation can use `pose-control`, `edge-control` or `depth-control` roles. The generic batch runner does not know or care which implementation produced those bindings.

## Fail-closed rules

Do not promote a pack when:

- a required node class is missing from `/object_info`;
- a model/runtime hash is unknown or differs;
- the pack attempts to overwrite an existing workflow node;
- a binding targets a missing node/input;
- `maximumReferenceImages` is smaller than the declared bindings;
- required provider capabilities are absent;
- the reference workflow has not actually been smoke-tested locally.

Never describe prompt similarity as artifact conditioning, and never describe a compiled-but-uncommissioned pack as executable.
