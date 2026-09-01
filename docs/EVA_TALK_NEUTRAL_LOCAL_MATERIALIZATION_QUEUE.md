# EVA talk-neutral local materialization queue

## Purpose

This queue prepares one governed local-first candidate campaign for EVA's `talk-neutral` body performance. It converts the existing 36-frame animation-suite target into eight immutable worker packets of ten candidate images each, producing 80 review candidates without pretending those candidates are approved animation frames.

The queue is orchestration only. It does not call an image provider, include provider credentials, grant paid execution, approve art, assign semantic frame order, publish media, activate Avatar Runtime, update the website, deploy, commit, push or force-push.

## Campaign shape

- Character: `eva-female`
- Clip: `talk-neutral`
- Candidate batches: `8`
- Candidate images per batch: `10`
- Candidate total: `80`
- Later semantic selection target: `36` frames
- Required candidate canvas: `1024 × 1536`
- Candidate file profile: PNG, 8-bit RGBA, non-interlaced

Each packet contains ten exact candidate IDs and ten exact relative output paths. Packet contents are canonical and SHA-256 bound. Queue packets carry no source image bytes, no secrets and no provider authorisation.

## Filesystem layout

```text
<queue-root>/
  campaign.json
  queue-manifest.json
  pending/
    eva-talk-neutral-batch-01/
      packet.json
  claimed/
    eva-talk-neutral-batch-01--<token>/
      packet.json
      claim.json
      heartbeats/
      outputs/
      output-manifest.json
  completed/
    <claim-id>/
      packet.json
      claim.json
      outputs/
      output-manifest.json
      completion.json
  failed/
    <claim-id>/
      packet.json
      claim.json
      failure.json
  receipts/
    requeue/
      <claim-id>.json
```

Every lifecycle move stays on the same filesystem and uses an atomic directory rename. A worker may write only inside its claimed directory.

## Initialise

```powershell
node scripts/eva-talk-neutral-local-materialization-queue.mjs init `
  --queue-root C:\EVAVO\queues\eva-talk-neutral-v2 `
  --campaign config\eva-talk-neutral-local-materialization-campaign-v1.json
```

Initialisation is create-only and fails if the root contains unrelated files. Re-running against the same campaign verifies the stored campaign, manifest and packet set rather than silently rebuilding them.

## Claim one packet

```powershell
node scripts/eva-talk-neutral-local-materialization-queue.mjs claim `
  --queue-root C:\EVAVO\queues\eva-talk-neutral-v2 `
  --worker-id eva-worker-01 `
  --lease-seconds 300
```

The queue atomically renames one pending job into a unique claim directory and writes a worker-bound claim receipt. Lease duration is bounded from 60 to 3600 seconds.

A crash between the directory rename and claim receipt leaves a packet-only orphan. The queue can recover that exact condition without inferring worker success:

```powershell
node scripts/eva-talk-neutral-local-materialization-queue.mjs recover-orphans `
  --queue-root C:\EVAVO\queues\eva-talk-neutral-v2
```

## Heartbeat

```powershell
node scripts/eva-talk-neutral-local-materialization-queue.mjs heartbeat `
  --queue-root C:\EVAVO\queues\eva-talk-neutral-v2 `
  --claim-id eva-talk-neutral-batch-01--0123456789abcdef `
  --worker-id eva-worker-01 `
  --lease-seconds 300
```

Heartbeats are create-only, sequential and hash chained. A heartbeat must arrive before the current lease expires and must extend the existing expiry. Heartbeat evidence prevents automatic expired-claim requeue because it proves the worker interacted with the claim.

## Worker output contract

The worker writes exactly the ten packet-declared files under the claim's `outputs` directory. No extra files are allowed there.

Before completion, the queue validates every output:

1. exact expected filename and file count;
2. ordinary non-symlink single-link file;
3. bounded byte length;
4. PNG signature;
5. complete chunk structure;
6. every chunk CRC;
7. exact IHDR profile: 1024 × 1536, 8-bit RGBA, non-interlaced;
8. IDAT inflate;
9. exact decoded scanline length;
10. legal PNG row filters;
11. SHA-256 body identity; and
12. uniqueness across all ten candidate bodies.

The queue then writes `output-manifest.json`, binding the claim, packet, worker, exact bytes and exact SHA-256 of all ten PNG files. Preparing the manifest does not approve the images or assign animation order.

```powershell
node scripts/eva-talk-neutral-local-materialization-queue.mjs prepare `
  --queue-root C:\EVAVO\queues\eva-talk-neutral-v2 `
  --claim-id eva-talk-neutral-batch-01--0123456789abcdef `
  --worker-id eva-worker-01
```

## Complete or fail

Completion re-verifies the current outputs, writes a deterministic completion receipt and atomically moves the claim to `completed`.

```powershell
node scripts/eva-talk-neutral-local-materialization-queue.mjs complete `
  --queue-root C:\EVAVO\queues\eva-talk-neutral-v2 `
  --claim-id eva-talk-neutral-batch-01--0123456789abcdef `
  --worker-id eva-worker-01
```

A worker can instead record one bounded failure receipt. Failure does not authorise retry, provider execution or candidate approval.

```powershell
node scripts/eva-talk-neutral-local-materialization-queue.mjs fail `
  --queue-root C:\EVAVO\queues\eva-talk-neutral-v2 `
  --claim-id eva-talk-neutral-batch-01--0123456789abcdef `
  --worker-id eva-worker-01 `
  --failure-code LOCAL_RENDER_FAILED `
  --failure-message "The local renderer stopped before all ten files were complete."
```

## Expired claims

An expired claim is requeued only when the directory contains exactly `packet.json` and `claim.json`. Any heartbeat, output, manifest, progress note or other worker evidence blocks automatic requeue and requires explicit review.

```powershell
node scripts/eva-talk-neutral-local-materialization-queue.mjs requeue-expired `
  --queue-root C:\EVAVO\queues\eva-talk-neutral-v2
```

The queue writes a create-only requeue receipt before removing the stale claim directory. Requeue never treats partial work as success.

## Status

```powershell
node scripts/eva-talk-neutral-local-materialization-queue.mjs status `
  --queue-root C:\EVAVO\queues\eva-talk-neutral-v2
```

Status reports pending, claimed, completed, failed and packet-only orphan counts. It also reports lease expiry, heartbeat count and whether worker evidence is present. Status is read-only.

## Focused validation

Run the focused local contract suite from the repository root:

```powershell
node --check scripts/project-art/eva-talk-neutral-local-queue-common.mjs
node --check scripts/project-art/eva-talk-neutral-local-queue-png.mjs
node --check scripts/project-art/eva-talk-neutral-local-queue-campaign.mjs
node --check scripts/project-art/eva-talk-neutral-local-queue-init.mjs
node --check scripts/project-art/eva-talk-neutral-local-queue-claims.mjs
node --check scripts/project-art/eva-talk-neutral-local-queue-completion.mjs
node --check scripts/project-art/eva-talk-neutral-local-materialization-queue.mjs
node --check scripts/eva-talk-neutral-local-materialization-queue.mjs
node scripts/check-eva-talk-neutral-local-materialization-queue.mjs
node --test scripts/test-eva-talk-neutral-local-materialization-queue.mjs
node --test scripts/test-eva-talk-neutral-local-materialization-queue-cli.mjs
node --test scripts/test-eva-talk-neutral-local-materialization-workstation-validation.mjs
```

## Exact-head Windows workstation gate

The authoritative landing gate must run under `pwsh` on Windows with Node.js `22.14.0` and pnpm `10.13.1`. Fetch `origin/main` before running the gate, then bind both the pull-request head and the fetched mainline SHA:

```powershell
git fetch --prune origin main
$ExpectedHeadSha = (git rev-parse HEAD).Trim()
$ExpectedMainSha = (git rev-parse refs/remotes/origin/main).Trim()

pwsh -NoLogo -NoProfile -File scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1 `
  -ExpectedHeadSha $ExpectedHeadSha `
  -ExpectedMainSha $ExpectedMainSha
```

The gate itself performs no network request. It refuses a dirty worktree, a non-Windows host, an unexpected repository origin, a toolchain version mismatch, a mismatched `HEAD`, a stale or mismatched `origin/main`, or a head that does not contain expected main as an ancestor.

It also requires the exact declared 19-file pull-request change set, runs `git diff --check <main>..<head>`, syntax-checks the complete queue surface, runs the static contract checker and focused tests, performs a real local CLI lifecycle exercise, runs the repository-authoritative `pnpm check`, repeats the range diff check, and proves validation left the refs and worktree unchanged.

Standard output contains the final compressed JSON receipt only. Native validation diagnostics are written to standard error. A successful receipt binds `headSha`, `mainSha`, the exact changed-file inventory, toolchain versions and closed authority.

The gate does not call a provider, use GitHub Actions, use Vercel, create candidates, approve art, publish, activate Runtime, deploy, commit or push.

## Downstream boundary

Completed queue outputs remain unapproved candidates. A separate stage must still perform:

- full-resolution visual review;
- identity, anatomy, hands, face, hair and costume inspection;
- alpha mastering and hostile-background edge proofs;
- adjacent-frame continuity review;
- semantic frame ordering;
- final-to-first loop closure where required;
- 24–30 fps authored performance assembly;
- transparent video or admitted atlas mastering;
- Runtime receipt creation; and
- phone, tablet and desktop website review.

Ten source poses or an interpolated 24 fps container are not evidence of 24 authored drawings per second.
