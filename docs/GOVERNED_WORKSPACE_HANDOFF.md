# Governed workspace handoff

Art Studio can compile an approved delivery selection into the Development Studio governed workspace job format.

The delivery document uses `evavo.art-studio.delivery.v1` and identifies exact source, staging and destination paths. Optional processors must be repository-owned Python or PowerShell scripts.

```json
{
  "schema": "evavo.art-studio.delivery.v1",
  "runId": "brass-captain-sprite-001",
  "workspaceRoot": "C:/GitRepos/Brass_Brine",
  "evidenceRoot": "C:/EVAVO-Evidence/Brass_Brine/art-delivery",
  "items": [
    {
      "source": "RAW_ART/characters/captain.png",
      "staged": "art-production/staging/captain/source.png",
      "destination": "art-production/delivery/captain/mastered.png",
      "processor": {
        "type": "python",
        "script": "tools/master_character_sprite.py",
        "args": ["--input", "art-production/staging/captain/source.png", "--output", "art-production/staging/captain/mastered.png"]
      }
    }
  ],
  "cleanup": [
    "art-production/staging/captain/source.png"
  ]
}
```

Compile it without executing anything:

```powershell
node scripts/build-governed-workspace-job.mjs `
  C:\jobs\brass-captain-delivery.json `
  C:\jobs\brass-captain-workspace-job.json
```

The generated job is then dry-run and applied by Development Studio's `governed-workspace-executor.mjs`.

The compiler refuses absolute paths, parent-directory traversal and replacement of an existing output manifest. It contains no subprocess, filesystem mutation, Git or publication authority. All actual work remains in the governed executor, which provides rollback copies and receipts.
