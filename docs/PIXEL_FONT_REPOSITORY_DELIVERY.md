# Pixel Font Repository Delivery

Pixel Font Repository Delivery turns an exact Pixel Font Studio build into a correctly named, self-describing installation in another EVAVO repository. It can compile reviewed Universal v3 source/profile pairs, consume an existing Universal build by exact SHA-256, consume a complete Pixel Font Studio v2 family by the exact raw SHA-256 of `pixel-font-family.json`, install or update only files it owns, generate Godot 4.6.2 integration resources, commit the exact planned scope and perform a normal non-forced push.

The font compiler and repository publisher remain separate authorities:

```text
reviewed face master + style profile
→ deterministic Universal build
→ self-hashed repository delivery plan
→ allowlist and exact target-head verification
→ transactional target installation
→ target validation receipt
→ optional single Git commit
→ normal push and exact remote readback
```

## Supported build inputs

### `compile`

Runs the fixed Universal v3 compiler against an authored face and style profile. The compiler path and Python executable are server/workflow-owned rather than caller-selected through MCP.

### `existing`

Consumes an already validated Universal v3 build. The job must bind the exact self-hashed `buildSha256` from `pixel-font-style-build.json`; every retained file is reopened and checked before planning or installation.

### `v2-family`

Consumes a complete Pixel Font Studio v2 family, including Chess Lord-style independent face masters. The job binds the exact raw SHA-256 of `pixel-font-family.json`, selects one `sourceFaceId`, and verifies every `.fnt`, `.png`, atlas JSON, BDF, TTF, review grid and editable master named by that face manifest. The authored native strike is delivered as strike `1`; no resampling or synthetic profile is introduced.

All three font modes feed the same naming, role ownership, Godot setup, transactional installation, receipt and Git-publication path.

## Pixel text and title builds

A delivery job may also contain `titles`. A title can be rendered during planning from one selected font build and a reviewed `evavo.pixel-text-style.v1` style, or it can consume an existing exact Pixel Text Studio build by `buildSha256`.

Rendered title packages can retain individual PNG frames, `title.png`, a horizontal sprite sheet, web CSS/JavaScript, Godot `SpriteFrames`, source style/text evidence and the exact build manifest. All title paths are installed under a deterministic normalized stem, so internal frame references remain valid after delivery. Title roles share the same collision checks as font roles.

For Godot targets the planner rewrites the title style's `godotResourceRoot` to the final `res://` destination before rendering. It then installs a title-role map and generated role catalogue in the same ownership-safe transaction as the font runtime.

## Supported target adapters

### `godot-4.6.2`

Installs the authoritative AngelCode BMFont `.fnt` file and every matching RGBA PNG page, then generates:

- `FontVariation` `.tres` resources;
- a role map;
- a typed GDScript loader;
- installation documentation;
- source/profile evidence when retained;
- BDF and TTF interchange files when the source build provides them.

The generated loader enforces the runtime policy already used by Chess Lord:

```text
nearest filtering
integer sizes/scales
system fallback disabled
subpixel positioning disabled
mipmaps disabled
```

For exact pixel and colour presentation, `.fnt + .png` remains canonical. TTF is a convenience alpha-mask derivative and may be smoothed by a host application. It cannot preserve arbitrary multicolour bitmap layers.

### `generic-assets`

Installs the selected BMFont/PNG runtime, atlas JSON and optional interchange/source evidence without assuming an engine.

### `design-tooling`

Installs selected TTF, BDF, source/profile and review outputs for design or content-production repositories. Runtime output can remain enabled when those tools also preview bitmap fonts.

## Correct naming and setup

Each build entry declares a semantic `targetStem`, display name and unique roles. The target chooses one filename policy:

```text
preserve
pascal
kebab
snake
```

A single-page face becomes:

```text
<stem>.fnt
<stem>.png
```

A multi-page face becomes:

```text
<stem>.fnt
<stem>-page-0.png
<stem>-page-1.png
...
```

The BMFont page declarations are rewritten to those exact names. `smooth=0` and `aa=0` are enforced without resampling or changing the atlas pixels.

Roles are unique across the family so a generated role map cannot silently resolve one role to two faces. Target stems are checked after case normalization to prevent cross-platform filename collisions.

## Ownership-safe updates

Two installation modes are supported:

### `create-only`

Every target path must be absent.

### `replace-owned`

An existing `pixel-font-installation.json` is required to own a replaced file. The current target bytes must still equal the recorded SHA-256 and byte length. An unowned file or an externally edited owned file blocks the update.

Files that belonged to the previous installation but are absent from the new plan are removed only when their current identity still matches the previous manifest. This safely removes old atlas pages or retired faces without deleting user changes.

Installation is transactional. Existing files are backed up to a temporary directory, writes use sibling temporary files and atomic renames, and every changed target is restored if a later source, collision or identity check fails.

## Repository publication

Publishing requires:

- an allowlisted `owner/repository`;
- an allowlisted target branch and destination root;
- a clean target worktree;
- an exact configured GitHub remote;
- local `HEAD`, fetched remote base and requested expected SHA to match;
- a staging scope exactly equal to changed and removed delivery paths;
- `git diff --cached --check`;
- a single commit whose parent is the expected target head;
- a second remote-base check immediately before push;
- a normal push without force or history rewrite;
- exact `ls-remote` readback of the published commit;
- a clean target worktree after publication.

`branch` mode is available to every EVAVO repository covered by the wildcard allowlist. `direct-main` is intentionally available only to exact repository rules whose allowlist explicitly includes it and whose job also sets `allowDirectMain=true`.

The default allowlist is:

```text
config/pixel-font-repository-allowlist.v1.json
```

Adding a new direct-main target therefore requires a reviewed source change rather than a caller-controlled flag.

## CLI

Validate a job:

```powershell
node scripts\pixel-font-repository-delivery.mjs validate-job `
  --job examples\pixel-font-repository-delivery\universal-godot-family.job.json
```

Compile an exact plan:

```powershell
node scripts\pixel-font-repository-delivery.mjs plan `
  --job C:\EVAVO\jobs\my-family.job.json `
  --workspace C:\EVAVO\pixel-font-delivery-plans\my-family `
  --expected-head <40-character-target-sha> `
  --output C:\EVAVO\pixel-font-delivery-plans\my-family\delivery-plan.json
```

Install without Git publication:

```powershell
node scripts\pixel-font-repository-delivery.mjs install `
  --plan C:\EVAVO\pixel-font-delivery-plans\my-family\delivery-plan.json `
  --target-root C:\GitRepos\target-game `
  --allowlist config\pixel-font-repository-allowlist.v1.json `
  --confirm-write
```

Compile, install, commit and normally push in one operation:

```powershell
node scripts\pixel-font-repository-delivery.mjs run `
  --job C:\EVAVO\jobs\my-family.job.json `
  --target-root C:\GitRepos\target-game `
  --allowlist config\pixel-font-repository-allowlist.v1.json `
  --expected-head <40-character-target-sha> `
  --repository EVAVO-STUDIO/target-game `
  --branch main `
  --publish-mode branch `
  --publish-branch agent/pixel-font/my-family `
  --confirm-publish
```


## ChatGPT and Claude MCP

Use the canonical three-server suite:

```text
config/pixel-font-automation-suite.v1.json
config/mcp.pixel-font-automation.windows.example.json
```

The suite registers Universal Pixel Font Studio, Pixel Text Studio and repository delivery together. The delivery MCP is path-only. It never sends font or image bytes through the model context.

Pixel Text Studio rendering remains independently write-gated. A repository delivery job can then consume that exact build or render a reviewed title style from one of the job's font strikes before installation.

Read-only tools expose catalogue, job validation and installation verification. Create-only plan generation and target installation additionally require:

```text
EVAVO_PIXEL_FONT_DELIVERY_MODE=read-write
EVAVO_PIXEL_FONT_DELIVERY_ALLOW_WRITES=true
```

Git commit/push tools are exposed only when the independent publication gate is also enabled:

```text
EVAVO_PIXEL_FONT_DELIVERY_ALLOW_GIT_PUBLISH=true
```

Each write call still requires `confirmWrite=true`; each publication call requires `confirmPublish=true`. The server owns the compiler, Python executable and allowlist path. Callers cannot provide shell commands, executables, remotes or an alternate allowlist.

## GitHub Actions publisher

`.github/workflows/pixel-font-repository-publish.yml` is deliberately manual-only and reusable through `workflow_call`. It does not run on every push, conserving the GitHub Actions allowance.

The workflow requires a fine-grained token with contents write access to the intended target repository. Store it as:

```text
EVAVO_PIXEL_FONT_REPOSITORY_TOKEN
```

or pass the reusable-workflow secret `repository_token`.

The workflow checks out Art Studio and the exact target commit separately, runs the same local compiler/installer/publisher, and retains the machine-readable publication result as an artifact. The allowlist remains authoritative even when a caller supplies workflow inputs.

## Creative boundary

Technical success proves deterministic generation, naming, byte identities, ownership-safe installation, engine setup and Git publication. It does not approve the visual quality of a font or title. Reviewed face masters, reviewed title treatments and native-resolution visual decisions remain required before a production job is authorised for delivery.
