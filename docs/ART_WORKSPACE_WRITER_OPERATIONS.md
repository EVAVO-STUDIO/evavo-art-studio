# Art Workspace Writer operations

## EVAVO Storage

The writer can archive one exact workspace file through the existing `evavo-storage-operator` CLI. The MCP caller supplies only:

- workspace file;
- vault;
- logical storage path;
- title;
- stable idempotency key; and
- `put` or resumable `upload` mode.

The executable and fixed leading arguments come only from server-side `EVAVO_STORAGE_OPERATOR_COMMAND_JSON`. The writer uses `shell: false`, bounded output, a timeout and a narrowed environment. Provider credentials are not projected into the child process.

Example configuration:

```powershell
$env:EVAVO_STORAGE_OPERATOR_COMMAND_JSON = @(
  "pwsh",
  "-NoProfile",
  "-File",
  "C:\GitRepos\evavo-storage\evavo-storage-operator.ps1"
) | ConvertTo-Json -Compress
```

Example request:

```json
{
  "workspaceRoot": "C:\\GitRepos\\evavo-avatar-runtime",
  "source": "assets/eva-female/working/idle/eva_idle_001.png",
  "vault": "art-source",
  "logicalPath": "Avatar Runtime/EVA Female/v1/working/eva_idle_001.png",
  "title": "EVA Female idle frame 001",
  "idempotencyKey": "eva-female-idle-001-storage-v1",
  "mode": "put"
}
```

## Sprite sheets, atlases and animation sequences

The writer organises and stages individual lossless frames. Existing Art Studio capabilities then provide the production chain:

1. preview and classify source frames;
2. repair fingers, hands, alpha, crop, edge or colour defects through explicit provider or deterministic workbench plans;
3. preserve approved neighbouring key poses for in-between generation;
4. validate shared canvas, framing, pivot, baseline, timing and loop endpoints;
5. assemble or slice sprite sheets;
6. build deterministic no-rotation atlases;
7. generate Godot SpriteFrames descriptors and importers;
8. archive source masters and receipts to EVAVO Storage; and
9. hand reviewed repository changes to Development Studio or an owner for Git publication.

The writer does not claim that generative in-between frames are correct merely because they were produced. Identity, camera, wardrobe, anatomy, hands, alpha, continuity and loop quality remain explicit review gates.

## Configuration

```text
EVAVO_ART_ALLOWED_ROOTS=C:\GitRepos
EVAVO_ART_IMPORT_ROOTS=C:\Users\Greg\Downloads;C:\EVAVO-Attachments

EVAVO_ART_ALLOW_WRITES=false
EVAVO_ART_WORKSPACE_MAX_FILE_BYTES=2147483648
EVAVO_ART_WORKSPACE_MAX_BASE64_BYTES=16777216

EVAVO_ART_ALLOW_STORAGE_WRITES=false
EVAVO_STORAGE_OPERATOR_COMMAND_JSON=
EVAVO_ART_STORAGE_TIMEOUT_MS=1800000
EVAVO_ART_STORAGE_OUTPUT_LIMIT_BYTES=1048576
```

Writes fail closed unless explicitly enabled. Storage writes require both write switches.

## Start the callable surfaces

CLI:

```powershell
pnpm workspace-writer -- capabilities
pnpm workspace-writer -- preview --input .\preview.json
pnpm workspace-writer -- intake --input .\intake.json
pnpm workspace-writer -- plan --input .\operations.json --output .\plan.json
pnpm workspace-writer -- apply --input .\plan.json
pnpm workspace-writer -- archive --input .\storage.json
```

Dedicated MCP server:

```powershell
pnpm dev:mcp:workspace-writer
```

Tools:

```text
art_workspace_writer_capabilities
art_workspace_preview_image
art_workspace_intake_files
art_workspace_compile_file_plan
art_workspace_apply_file_plan
art_workspace_archive_to_evavo_storage
```

## Authority and safety

- No arbitrary shell.
- No caller-selected executable or environment.
- No Git arguments, commit, push, force push or branch mutation.
- No provider credentials in MCP results or storage subprocesses.
- No repository code or deployment-control mutation.
- No irreversible agent-facing deletion.
- No automatic candidate approval or promotion.
- No automatic publication.

The boundary is deliberately powerful for art files and deliberately narrow everywhere else.
