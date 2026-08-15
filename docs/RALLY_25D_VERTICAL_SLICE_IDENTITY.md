# Rally vertical-slice canonical asset identities

`rally-vertical-slice-v1` has one exact, dependency-ordered set of thirteen asset identities. Art Studio validates this closure before compiling any handoff.

The final playable VFX asset is:

```text
crash-debris-production-v1
subject: crash-debris
dependencies:
  falcon-rally-production-v1
```

The older `debris-burst-production-v1` identifier is a retired planning alias. It combined vehicle, timber and road debris intent, while the implemented and reviewed producer is the bounded vehicle Crash Debris system with paint chips, blunt metal shards, sparse body-panel fragments and surface dust. Timber Bridge already has its own breakable groups and timber-debris anchors.

The canonical request validator rejects:

- the retired alias;
- any missing or additional asset;
- sequence, family, subject, phase or priority drift;
- dependency drift;
- changes to playable-required status.

The same identity closure is independently enforced in EVAVO 3D Studio and the Godot runtime admission repository. Particle Studio binds its `rally-crash-debris-burst` preset to the canonical asset and runtime profile.

This alignment changes planning and admission identity only. It does not render art, run Blender, admit a runtime bundle, change physics, mutate downstream repositories, deploy or publish.
