from __future__ import annotations

import re
from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source block, found {count}")
    path.write_text(source.replace(old, new), encoding="utf-8")


def replace_count(
    path: Path,
    old: str,
    new: str,
    expected: int,
    label: str,
) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != expected:
        raise SystemExit(
            f"{label}: expected exactly {expected} source blocks, found {count}"
        )
    path.write_text(source.replace(old, new), encoding="utf-8")


def replace_regex_once(
    path: Path,
    pattern: str,
    replacement: str,
    label: str,
) -> None:
    source = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, source, count=1)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source block, found {count}")
    path.write_text(updated, encoding="utf-8")


validation = Path("packages/sprite-supervisor/src/validation-core.ts")
replace_once(
    validation,
    '  const pointer = item.pointer === undefined ? "" : text(item.pointer, `${name}.pointer`, undefined, 1_024);\n',
    '''  const pointer =
    item.pointer === undefined || item.pointer === ""
      ? ""
      : text(item.pointer, `${name}.pointer`, undefined, 1_024);
''',
    "root JSON pointer compatibility",
)

finalization = Path("apps/worker/test/candidate-finalization.test.mjs")
replace_once(
    finalization,
    'test("green matte becomes real alpha and remains finalization-ready", async () => {',
    'test("green matte extraction creates real alpha and records bounded adaptive cleanup", async () => {',
    "green matte test title",
)
replace_once(
    finalization,
    '''    assert.equal(result.result.qualityPassed, true);
    const mastered = await fx.artifacts.get(result.outputArtifacts[0]);
    assert.equal(mastered.labels.finalizationReady, "true");
    assert.equal(mastered.labels.backgroundMode, "chroma-key");
    const decoded = await decodeSpriteFrame(
      await fx.artifacts.read(mastered.artifactId),
    );
    assert.equal(decoded.sourceHasAlpha, true);
    assert.ok(
      decoded.data.some((value, index) => index % 4 === 3 && value === 0),
    );
''',
    '''    assert.equal(result.result.qualityPassed, false);
    const mastered = await fx.artifacts.get(result.outputArtifacts[0]);
    assert.equal(mastered.labels.finalizationReady, "false");
    assert.equal(mastered.labels.qualityState, "rejected");
    assert.equal(mastered.labels.backgroundMode, "chroma-key");
    const decoded = await decodeSpriteFrame(
      await fx.artifacts.read(mastered.artifactId),
    );
    assert.equal(decoded.sourceHasAlpha, true);
    assert.ok(
      decoded.data.some((value, index) => index % 4 === 3 && value === 0),
    );
    const evidence = JSON.parse(
      (await fx.artifacts.read(result.outputArtifacts[1])).toString("utf8"),
    );
    assert.equal(evidence.blockingProof.meaningfulAlphaPassed, true);
    assert.equal(evidence.blockingProof.fakeTransparencyPassed, true);
    assert.deepEqual(
      evidence.quality.gates
        .filter((gate) => gate.blocking && gate.status === "fail")
        .map((gate) => gate.id),
      ["transparent-pixel-colour"],
    );
    assert.equal(evidence.promotionEligible, false);
''',
    "green matte adaptive boundary",
)
replace_once(
    finalization,
    'test("black additive proves the black stage and extracts real alpha", async () => {',
    'test("black additive extraction proves the stage and records bounded adaptive cleanup", async () => {',
    "black additive test title",
)
replace_once(
    finalization,
    '''    assert.equal(result.result.qualityPassed, true);
    const mastered = await fx.artifacts.get(result.outputArtifacts[0]);
    const decoded = await decodeSpriteFrame(
      await fx.artifacts.read(mastered.artifactId),
    );
    assert.ok(
      decoded.data.some((value, index) => index % 4 === 3 && value === 0),
    );
    const evidence = JSON.parse(
      (await fx.artifacts.read(result.outputArtifacts[1])).toString("utf8"),
    );
    assert.ok(evidence.background.blackEvidence.blackBorderFraction >= 0.85);
    assert.ok(evidence.background.blackEvidence.nonBlackPixels > 0);
    assert.equal(evidence.blockingProof.meaningfulAlphaPassed, true);
''',
    '''    assert.equal(result.result.qualityPassed, false);
    const mastered = await fx.artifacts.get(result.outputArtifacts[0]);
    assert.equal(mastered.labels.finalizationReady, "false");
    assert.equal(mastered.labels.qualityState, "rejected");
    const decoded = await decodeSpriteFrame(
      await fx.artifacts.read(mastered.artifactId),
    );
    assert.ok(
      decoded.data.some((value, index) => index % 4 === 3 && value === 0),
    );
    const evidence = JSON.parse(
      (await fx.artifacts.read(result.outputArtifacts[1])).toString("utf8"),
    );
    assert.ok(evidence.background.blackEvidence.blackBorderFraction >= 0.85);
    assert.ok(evidence.background.blackEvidence.nonBlackPixels > 0);
    assert.equal(evidence.blockingProof.meaningfulAlphaPassed, true);
    assert.equal(evidence.blockingProof.fakeTransparencyPassed, true);
    assert.deepEqual(
      evidence.quality.gates
        .filter((gate) => gate.blocking && gate.status === "fail")
        .map((gate) => gate.id),
      ["transparent-pixel-colour"],
    );
    assert.equal(evidence.promotionEligible, false);
''',
    "black additive adaptive boundary",
)

mirroring = Path("apps/worker/test/deterministic-mirroring.test.mjs")
replace_regex_once(
    mirroring,
    r'''  const hidden = \(1 \* WIDTH \+ 1\) \* 4;\n  data\[hidden\] = 17;\n  data\[hidden \+ 1\] = 43;\n  data\[hidden \+ 2\] = 91;\n  data\[hidden \+ 3\] = 0;\n''',
    "",
    "clean family release fixture",
)
replace_once(
    mirroring,
    'test("worker mirrors the complete RGBA canvas and emits family-level proof", async () => {',
    '''test("horizontal RGBA mirroring preserves hidden transparent colour exactly", () => {
  const source = Buffer.alloc(WIDTH * HEIGHT * 4);
  const hidden = (1 * WIDTH + 1) * 4;
  source[hidden] = 17;
  source[hidden + 1] = 43;
  source[hidden + 2] = 91;
  source[hidden + 3] = 0;

  const mirrored = mirrorHorizontalRgba(source, WIDTH, HEIGHT);
  const mirroredHidden = (1 * WIDTH + (WIDTH - 2)) * 4;
  assert.deepEqual(
    [...mirrored.subarray(mirroredHidden, mirroredHidden + 4)],
    [17, 43, 91, 0],
  );
  assert.deepEqual(
    mirrorHorizontalRgba(mirrored, WIDTH, HEIGHT),
    source,
  );
});

test("worker mirrors a release-clean RGBA canvas and emits family-level proof", async () => {''',
    "separate byte preservation from family release",
)
replace_once(
    mirroring,
    '''    const mirroredHidden = (1 * WIDTH + (WIDTH - 2)) * 4;
    assert.deepEqual(
      [...targetDecoded.data.subarray(mirroredHidden, mirroredHidden + 4)],
      [17, 43, 91, 0],
    );

''',
    "",
    "remove dirty RGB from family release assertion",
)
replace_once(
    mirroring,
    '''          clipId: "idle",
          frameIndex: 0,
          expectedWidth: WIDTH,
          expectedHeight: HEIGHT,
          pivot: { x: WIDTH / 2, y: HEIGHT - 1 },
          baseline: HEIGHT - 1,
''',
    '''          clipId: "idle",
          frameIndex: 0,
          expectedWidth: WIDTH,
          expectedHeight: HEIGHT,
          pivot: { x: WIDTH / 2, y: 12 },
          baseline: 12,
''',
    "mirror payload ground baseline",
)
replace_count(
    mirroring,
    '''          durationMs: 100,
          pivot: { x: WIDTH / 2, y: HEIGHT - 1 },
          baseline: HEIGHT - 1,
          groundContact: true,
''',
    '''          durationMs: 100,
          pivot: { x: WIDTH / 2, y: 12 },
          baseline: 12,
          groundContact: true,
''',
    2,
    "family frame ground baselines",
)

mastering = Path("apps/worker/test/mastering-worker.test.mjs")
replace_once(
    mastering,
    '    "candidate-alpha-mastering-evidence",\n',
    '    "candidate-finalization-evidence",\n',
    "mastering evidence role",
)
replace_count(
    mastering,
    "proof.extraction",
    "proof.background.extraction",
    3,
    "mastering evidence extraction nesting",
)

supervisor = Path("apps/worker/src/sprite-supervisor-handlers.ts")
replace_once(
    supervisor,
    '''    states[task.id] = {
      ...taskWithFailure,
      status: "repairing",
      repairCycles: taskWithFailure.repairCycles + 1,
    };
''',
    '''    states[task.id] = {
      ...taskWithoutCurrent(taskWithFailure),
      status: "repairing",
      repairCycles: taskWithFailure.repairCycles + 1,
    };
''',
    "clear completed source child while repair is active",
)
