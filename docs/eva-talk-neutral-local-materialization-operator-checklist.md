# EVA talk-neutral local queue operator checklist

## Before initialisation

- [ ] Work in `EVAVO-STUDIO/evavo-art-studio` on a clean local checkout.
- [ ] Confirm Node.js `22.14.0` and pnpm `10.13.1`.
- [ ] Confirm the queue root is on the intended local filesystem and is empty.
- [ ] Confirm the campaign file is the repository-owned v2 campaign.
- [ ] Confirm no provider credential, paid API key or hosted worker is needed.
- [ ] Confirm this run creates candidates only and grants no approval or Runtime authority.

## Initialise and inspect

- [ ] Run `init` once.
- [ ] Confirm `pending=8`, `claimed=0`, `completed=0`, `failed=0`.
- [ ] Confirm every pending directory contains only `packet.json`.
- [ ] Confirm every packet declares ten unique candidate IDs and output filenames.
- [ ] Preserve `campaign.json` and `queue-manifest.json` unchanged.

## Claim handling

- [ ] Use one stable lowercase worker ID.
- [ ] Use a lease between 60 and 3600 seconds.
- [ ] Record the returned claim ID and claim directory.
- [ ] Write only inside that claim directory.
- [ ] Do not alter `packet.json` or `claim.json`.
- [ ] Send a heartbeat before expiry when work continues.
- [ ] Do not assume an expired claim was requeued; inspect status.

## Candidate output

- [ ] Produce one image per declared slot, never a contact sheet or sprite sheet.
- [ ] Use the exact declared filename.
- [ ] Keep the camera, crop, scale and floor position locked.
- [ ] Preserve EVA's face, hair silhouette, costume, proportions and anatomy.
- [ ] Use native alpha when genuinely available.
- [ ] Never bake a checkerboard, scene, gradient, floor or shadow into transparent space.
- [ ] Keep output at exactly 1024 × 1536 RGBA PNG.
- [ ] Ensure all ten files are genuinely distinct bodies rather than duplicate copies.
- [ ] Do not add extra files inside `outputs`.

## Prepare and complete

- [ ] Run `prepare` while the claim lease is valid.
- [ ] Resolve every PNG, count, CRC, scanline, profile, byte or hash rejection; never weaken checks.
- [ ] Confirm `output-manifest.json` binds ten unique SHA-256 bodies.
- [ ] Run `complete` with the same worker ID.
- [ ] Confirm the claim moved atomically to `completed/<claim-id>`.
- [ ] Confirm `completion.json` states `candidateApprovalGranted=false`.
- [ ] Confirm no publication, Runtime, website, deployment or Git authority was introduced.

## Failure and recovery

- [ ] Use `fail` for a bounded, honest worker failure.
- [ ] Use an uppercase machine-readable failure code.
- [ ] Do not call a failed or partial batch complete.
- [ ] Use `recover-orphans` only for a claim directory containing only `packet.json`.
- [ ] Use `requeue-expired` only after inspecting the reported blocked claims.
- [ ] Never automatically requeue a claim containing heartbeat, output, manifest or progress evidence.
- [ ] Preserve requeue, completion and failure receipts.

## Review after materialisation

- [ ] Open every full-resolution candidate, not only a contact sheet.
- [ ] Reject identity, face, hands, fingers, anatomy, clothing or silhouette drift.
- [ ] Review alpha over black, white, grey, green and magenta solid plates.
- [ ] Reject halos, matte spill, hidden RGB contamination and painted transparency.
- [ ] Compare neighbouring candidates for camera and pose continuity.
- [ ] Select and order the later 36-frame performance separately.
- [ ] Do not count interpolation as authored frame evidence.
- [ ] Require independent creative and technical approval before downstream admission.

## Repository validation before main

- [ ] Run the focused checker and both queue test files.
- [ ] Run a real CLI initialise, claim, heartbeat, fail and status exercise in a temporary directory.
- [ ] Run `git diff --check`.
- [ ] Run complete local `pnpm check`.
- [ ] Confirm validation left no generated files in the repository.
- [ ] Re-fetch latest `main` immediately before landing.
- [ ] Merge without force push or history rewrite.
