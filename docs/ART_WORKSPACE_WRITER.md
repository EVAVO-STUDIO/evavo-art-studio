# Callable Art Workspace Writer

EVAVO Art Studio now has a dedicated, callable filesystem boundary for ChatGPT, Claude and trusted local operators. It complements the existing universal image workbench, provider adapters, repair tools, alpha mastering, sprite QA, sequence QA, atlas production and Godot delivery tools.

The writer is intentionally not an unrestricted shell or Git client. It gives agents the exact art-file operations needed for professional production while retaining stale detection, no-overwrite semantics, reversible destructive work and evidence for every mutation.

## Responsibilities

The complete production split is:

```text
ChatGPT or Claude attachment / generated image / local image
                              |
                              v
EVAVO Art Studio callable workspace writer
  - bounded intake
  - image preview
  - exact organisation
  - rename and move
  - replace with retained previous bytes
  - reversible trash and restore
                              |
                              v
EVAVO Art Studio universal image workbench
  - inspect and compare
  - crop, pad, resize and align
  - transparent-background mastering
  - edge decontamination and hidden-RGB rebuild
  - provider edit, inpaint, recreation and variation plans
  - sprite-sheet slicing and assembly
  - sequence review, timing and continuity QA
  - atlas and Godot package creation
                              |
                 +------------+-------------+
                 |                          |
                 v                          v
EVAVO Storage                     Development Studio / owner
  - immutable source archive       - validation
  - large-file transfer            - deliberate Git commit
  - versions and recovery          - push / PR / publication
```

Art Studio owns image understanding and art production. EVAVO Storage owns durable large-file and source-archive history. Development Studio or an explicit owner workflow owns repository publication. The writer does not collapse those authorities.

## ChatGPT and Claude attachment intake

The dedicated MCP server accepts either:

- a mounted attachment or generated-image path below `EVAVO_ART_IMPORT_ROOTS`; or
- bounded strict base64 for small images or art metadata.

Every intake:

- resolves the workspace below `EVAVO_ART_ALLOWED_ROOTS`;
- rejects symlinks and path traversal;
- sanitises portable filenames;
- limits source count and byte size;
- computes SHA-256 before publication;
- probes real media signatures and rejects false extensions;
- writes into a create-only `.art-studio/intake/<project>/<intake-id>` directory;
- records format, MIME type, dimensions and alpha-channel evidence where available;
- is idempotent for the same exact request;
- performs no provider call, Git operation, deployment or publication.

Example:

```json
{
  "workspaceRoot": "C:\\GitRepos\\evavo-avatar-runtime",
  "projectId": "eva-female",
  "idempotencyKey": "eva-female-chat-intake-20260809-001",
  "sources": [
    {
      "kind": "path",
      "path": "C:\\EVAVO-Attachments\\eva-frame-001.png",
      "name": "eva-frame-001.png"
    }
  ]
}
```

Run it through the CLI:

```powershell
pnpm workspace-writer -- intake `
  --input .\examples\art-workspace-intake.json `
  --output .\art-workspace-intake.receipt.json
```

Or call the MCP tool:

```text
art_workspace_intake_files
```

## Preview and review

`art_workspace_preview_image` reads one bounded image from the workspace and returns:

- exact path;
- SHA-256;
- byte count;
- media format and MIME type;
- dimensions and alpha observation when available; and
- real MCP image content.

It does not create a derivative or change the file. After preview, existing Art Studio tools can inspect frame transparency, crop, edge halos, hidden RGB, duplicate identity, sequence continuity, sprite-sheet cells and animation timing.

## Exact file organisation

Organisation is two-stage:

1. `art_workspace_compile_file_plan` observes exact source and target state and returns a fingerprinted plan without writing.
2. `art_workspace_apply_file_plan` revalidates that plan and performs only the admitted operations.

Supported operations are:

```text
copy
move / rename
replace with an exact reversible backup
reversible trash
exact restore from the generated trash path
```

Target parent folders are created safely when needed, so a batch can copy immutable intake originals and organise working frames into an organised tree such as:

```text
assets/eva-female/
  source/
  working/
    idle/
    blink/
    talk-neutral-in/
    talk-neutral-loop/
    talk-neutral-out/
    talk-sad/
    talk-laugh/
    talk-stern/
    wave/
    sleep/
    dance/
    repair-required/
  approved/
  exports/
```

The writer prevents:

- traversal outside the workspace;
- `.git` access;
- mutation of package, CI, TypeScript, deployment or secret-control files;
- symlink traversal;
- silent overwrite;
- applying a plan after a source or target changed;
- duplicate mutating operations for the same source;
- multiple operations targeting the same path;
- physical purge.

Replace retains the previous target below `.art-studio/trash/<plan-id>/replaced/`. Trash moves the original bytes below `.art-studio/trash/<plan-id>/removed/`. Restore accepts only one exact generated trash path.

A private journal is created before mutation. Successful work emits a create-only receipt. A failed or interrupted operation leaves evidence requiring review rather than silently guessing.

Example plan request:

```json
{
  "workspaceRoot": "C:\\GitRepos\\evavo-avatar-runtime",
  "idempotencyKey": "organise-eva-idle-001",
  "operations": [
    {
      "type": "copy",
      "source": ".art-studio/intake/eva-female/intake_example/001-eva-frame-001.png",
      "target": "assets/eva-female/working/idle/eva_idle_001.png"
    },
    {
      "type": "trash",
      "source": "assets/eva-female/working/repair-required/eva_bad_hands_004.png"
    }
  ]
}
```

## Storage, setup and operating examples

The EVAVO Storage handoff, environment settings, MCP/CLI examples and operating boundary continue in [Art Workspace Writer operations](ART_WORKSPACE_WRITER_OPERATIONS.md).
