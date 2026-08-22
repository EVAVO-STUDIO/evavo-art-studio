# EVA dense-motion reviewed-frame evidence sealing

This stage follows a successful ten-frame named-human review intake where every frame was genuinely approved. It produces the two per-frame evidence records required by the EVA dense work order:

```text
master.technical-inspection.json
master.creative-approval.json
```

The technical record is deterministic. The creative record does **not** make an approval decision; it seals the lineage of an already-existing externally authored named-human approval.

## Required upstream chain

For every one of the ten frames this stage requires and verifies:

- the exact ten-master program;
- the successful ten-frame mastering campaign receipt;
- the approved ten-frame review-intake plan and receipt;
- the candidate-assurance record with at least two independent passing inspectors;
- the mastering frame receipt;
- the exact persisted named-human frame-review outcome; and
- the final reviewed PNG bytes.

Any repair or rejection in the human review intake blocks this stage.

## Independent technical checks

The final PNG is re-read after human review and checked through two separate deterministic paths:

1. `inspectPngStructure`, which revalidates PNG chunks, CRCs, IDAT decode, scanline reconstruction, exact 1024×1536 canvas, 8-bit RGBA and non-interlaced structure; and
2. `inspectAvatarProviderFramePng`, which independently validates the final frame representation and pixel profile.

The resulting technical evidence additionally requires:

- zero hidden RGB under fully transparent pixels;
- zero visible pixels touching the canvas edge;
- the exact final frame SHA-256 from the mastering receipt and human review outcome;
- prior two-inspector candidate assurance;
- human technical gate pass;
- human hands/anatomy gate pass;
- human face-identity gate pass; and
- human silhouette/registration gate pass.

The stage performs no image mutation.

## Human creative approval lineage

`master.creative-approval.json` may only be compiled from a persisted `final-frame-admitted` review outcome whose reviewer is `actorClass: "human"` and whose original decision was `approve-final-frame`.

It preserves:

- the human reviewer identity;
- review timestamp;
- review decision SHA-256;
- review outcome SHA-256;
- final frame SHA-256;
- all human review gates; and
- all human evidence hashes.

The record explicitly states:

```text
approvalSource: externally-authored-named-human-frame-review-decision
automaticDecisionCreationAllowed: false
```

This is evidence sealing, not AI approval.

## Transactional persistence

All twenty per-frame evidence files are compiled and validated before the first output is published. Persistence uses create-only temporary files and hard-link publication. If publication fails part-way through, outputs linked during that attempt are removed and temporary files are cleaned up.

No existing technical or creative evidence file is overwritten.

## CLI

```powershell
node scripts/run-project-art-eva-dense-motion-reviewed-frame-evidence.mjs `
  --program 'C:\path\to\ten-master-program.json' `
  --mastering-campaign-receipt 'C:\path\to\mastering.campaign.json' `
  --review-intake-plan 'C:\path\to\campaign-plan.json' `
  --review-intake-receipt 'C:\path\to\campaign-execution.json' `
  --workspace-root 'C:\path\to\eva-dense-workspace' `
  --output-root 'C:\path\to\reviewed-frame-evidence-run' `
  --inspected-at '2026-08-22T08:30:00.000Z'
```

The output root must already exist. A successful run writes the twenty semantic per-frame evidence files inside the governed EVA workspace and a self-hashed campaign receipt to the output root.

## Authority boundary

This stage may perform deterministic technical inspection and seal human approval lineage. It may not:

- author a human decision;
- make an automatic creative decision;
- alter an image;
- promote a candidate;
- upload to Cloudinary;
- admit or release a sequence;
- mutate a target repository or Git history;
- publish or deploy; or
- activate Runtime or website media.

Downstream release assembly must still independently verify the immutable Cloudinary master, identity evidence, ten continuity edges including 10→1, browser playback evidence, owner/creative-director/technical-director approvals, and prepared Avatar Runtime release before Runtime receipt assembly can become eligible.
