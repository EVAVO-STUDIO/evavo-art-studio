import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  ArtDirectionError,
  compileArtProductionLoop,
  compileArtProductionPackagingPlan,
  compileArtProductionRuntimeAssemblyHandoff,
  compileArtProductionSourceAdmissionReceipt,
  compileNextArtProductionBatch,
  evaluateArtProductionAttempt,
  verifyArtProductionSourceAdmissionReceipt,
} from "../dist/index.js";
import {
  approvedPlan,
  attempt,
  canonicalSha256,
  humanApprovals,
  profile,
} from "./art-production-fixtures.mjs";
import {
  addCompleteRuntimeAnimations,
  productionRequest,
  runtimeAssemblyRequest,
} from "./layered-assembly-fixtures.mjs";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.allocUnsafe(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, data])),
    8 + data.length,
  );
  return output;
}

function sourcePng(unit, seed, options = {}) {
  const width = options.width ?? unit.dimensions.width;
  const height = options.height ?? unit.dimensions.height;
  const colorType = options.colorType ?? 6;
  const pixels = Buffer.alloc(width * height * 4);
  const red = (47 + seed * 29) & 0xff;
  const green = (89 + seed * 31) & 0xff;
  const blue = (131 + seed * 37) & 0xff;

  if (unit.alpha === "opaque") {
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = 255;
    }
  } else if (unit.alpha === "transparent") {
    pixels[0] = red;
    pixels[1] = green;
    pixels[2] = blue;
    pixels[3] = 255;
    if (options.unsafeTransparentRgb && pixels.length >= 8) {
      pixels[4] = 1;
    }
  } else {
    pixels[0] = red;
    pixels[1] = green;
    pixels[2] = blue;
    pixels[3] = 128;
    if (pixels.length >= 8) {
      pixels[4] = blue;
      pixels[5] = red;
      pixels[6] = green;
      pixels[7] = 255;
    }
    if (options.unsafeTransparentRgb && pixels.length >= 12) {
      pixels[8] = 1;
    }
  }

  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row += 1) {
    const scanlineOffset = row * (width * 4 + 1);
    scanlines[scanlineOffset] = 0;
    pixels.copy(
      scanlines,
      scanlineOffset + 1,
      row * width * 4,
      (row + 1) * width * 4,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function corruptFirstIdatCrc(bytes) {
  const output = Buffer.from(bytes);
  let offset = PNG_SIGNATURE.length;
  while (offset < output.length) {
    const length = output.readUInt32BE(offset);
    const type = output.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") {
      output[offset + 8 + length] ^= 1;
      return output;
    }
    offset += 12 + length;
  }
  throw new Error("fixture PNG has no IDAT");
}

const byteDigest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

function compileFixture(options = {}) {
  const plan = approvedPlan(
    addCompleteRuntimeAnimations(productionRequest()),
  );
  const assemblyRequest = runtimeAssemblyRequest(plan);
  const selectedUnitIds = new Set(
    assemblyRequest.sources.map((source) => source.unitId),
  );
  const units = plan.layers.flatMap((layer) => layer.units);
  const sourceBytesByUnit = new Map();
  let selectedIndex = 0;
  for (const unit of units) {
    if (!selectedUnitIds.has(unit.id)) continue;
    let bytes = sourcePng(unit, selectedIndex + (options.seed ?? 0));
    if (options.transformSource) {
      bytes = options.transformSource(unit, bytes, selectedIndex);
    }
    sourceBytesByUnit.set(unit.id, Buffer.from(bytes));
    selectedIndex += 1;
  }

  let loop = compileArtProductionLoop(plan, profile());
  while (loop.totals.reviewPassed < loop.totals.units) {
    const batch = compileNextArtProductionBatch(plan, loop);
    assert.equal(batch.status, "jobs-ready");
    assert.ok(batch.jobs.length > 0);
    for (const job of batch.jobs) {
      const bytes = sourceBytesByUnit.get(job.unitId);
      loop = evaluateArtProductionAttempt(
        plan,
        loop,
        attempt(
          loop,
          plan,
          job.unitId,
          bytes
            ? {
                candidateSha256: byteDigest(bytes),
                candidateBytes: bytes.length,
              }
            : {},
        ),
      );
    }
  }

  const approvals = humanApprovals(plan, loop);
  const packagingPlan = compileArtProductionPackagingPlan(
    plan,
    loop,
    approvals,
  );
  const approvalByUnit = new Map(
    approvals.map((approval) => [approval.unitId, approval]),
  );
  const packagedByUnit = new Map(
    packagingPlan.individualSources.map((source) => [source.unitId, source]),
  );
  for (const source of assemblyRequest.sources) {
    const approval = approvalByUnit.get(source.unitId);
    const packaged = packagedByUnit.get(source.unitId);
    assert.ok(approval, `missing approval ${source.unitId}`);
    assert.ok(packaged, `missing package source ${source.unitId}`);
    source.artifactId = packaged.artifactId;
    source.sha256 = packaged.sha256;
    source.bytes = packaged.bytes;
    source.width = packaged.width;
    source.height = packaged.height;
    source.approvalReceiptSha256 = approval.approvalReceiptSha256;
    source.approvalReceiptArtifactId =
      `artifact_${approval.approvalReceiptSha256}`;
  }

  const handoff = compileArtProductionRuntimeAssemblyHandoff(
    plan,
    loop,
    approvals,
    packagingPlan,
    assemblyRequest,
  );
  const sources = handoff.sourceBindings.map((binding) => {
    const bytes = sourceBytesByUnit.get(binding.unitId);
    assert.ok(bytes, `missing PNG bytes ${binding.unitId}`);
    return { unitId: binding.unitId, bytes };
  });
  return {
    plan,
    loop,
    approvals,
    packagingPlan,
    assemblyRequest,
    handoff,
    sources,
  };
}

function rehashReceipt(receipt) {
  const { receiptSha256: _discarded, ...payload } = receipt;
  receipt.receiptSha256 = canonicalSha256(payload);
  return receipt;
}

function isAdmissionInvalid(error) {
  return (
    error instanceof ArtDirectionError &&
    error.code === "ART_PRODUCTION_SOURCE_ADMISSION_INVALID"
  );
}

const canonical = compileFixture();
const canonicalReceipt = compileArtProductionSourceAdmissionReceipt(
  canonical.plan,
  canonical.loop,
  canonical.approvals,
  canonical.packagingPlan,
  canonical.assemblyRequest,
  canonical.handoff,
  canonical.sources,
);

test("admits exact caller-supplied PNG bytes against the governed runtime handoff", () => {
  assert.equal(canonicalReceipt.protocolVersion, "2026-08-14.4");
  assert.equal(
    canonicalReceipt.kind,
    "evavo.art-production.source-admission.receipt",
  );
  assert.equal(
    canonicalReceipt.admissions.length,
    canonical.handoff.sourceBindings.length,
  );
  assert.equal(canonicalReceipt.authority.callerSuppliedByteRead, true);
  assert.equal(canonicalReceipt.authority.autonomousArtifactFetch, false);
  assert.equal(canonicalReceipt.authority.artifactWrite, false);
  assert.ok(
    canonicalReceipt.admissions.every(
      (entry) =>
        entry.png.format === "png" &&
        entry.png.bitDepth === 8 &&
        entry.png.colorType === 6 &&
        entry.png.interlaceMethod === 0 &&
        entry.png.visiblePixels > 0 &&
        entry.png.unsafeTransparentPixels === 0,
    ),
  );
  assert.equal(
    verifyArtProductionSourceAdmissionReceipt(
      canonical.plan,
      canonical.loop,
      canonical.approvals,
      canonical.packagingPlan,
      canonical.assemblyRequest,
      canonical.handoff,
      canonical.sources,
      canonicalReceipt,
    ),
    true,
  );
});

test("rejects caller bytes that no longer match the approved content address", () => {
  const sources = canonical.sources.map((entry) => ({
    unitId: entry.unitId,
    bytes: Buffer.from(entry.bytes),
  }));
  sources[0].bytes[sources[0].bytes.length - 1] ^= 1;
  assert.throws(
    () =>
      compileArtProductionSourceAdmissionReceipt(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        canonical.packagingPlan,
        canonical.assemblyRequest,
        canonical.handoff,
        sources,
      ),
    (error) =>
      isAdmissionInvalid(error) && /content address/u.test(error.message),
  );
});

test("rejects a content-addressed PNG with a corrupted chunk CRC", () => {
  const malformed = compileFixture({
    transformSource: (unit, bytes, index) =>
      index === 0 ? corruptFirstIdatCrc(bytes) : bytes,
  });
  assert.throws(
    () =>
      compileArtProductionSourceAdmissionReceipt(
        malformed.plan,
        malformed.loop,
        malformed.approvals,
        malformed.packagingPlan,
        malformed.assemblyRequest,
        malformed.handoff,
        malformed.sources,
      ),
    (error) => isAdmissionInvalid(error) && /invalid CRC/u.test(error.message),
  );
});

test("rejects a content-addressed PNG whose IHDR dimensions drift from the handoff", () => {
  const malformed = compileFixture({
    transformSource: (unit, bytes, index) =>
      index === 0
        ? sourcePng(unit, 900, { width: unit.dimensions.width + 1 })
        : bytes,
  });
  assert.throws(
    () =>
      compileArtProductionSourceAdmissionReceipt(
        malformed.plan,
        malformed.loop,
        malformed.approvals,
        malformed.packagingPlan,
        malformed.assemblyRequest,
        malformed.handoff,
        malformed.sources,
      ),
    (error) =>
      isAdmissionInvalid(error) && /dimensions do not match/u.test(error.message),
  );
});

test("rejects unsafe transparent RGB even when byte identity and metadata agree", () => {
  const malformed = compileFixture({
    transformSource: (unit, bytes, index) =>
      index === 4
        ? sourcePng(unit, 901, { unsafeTransparentRgb: true })
        : bytes,
  });
  assert.throws(
    () =>
      compileArtProductionSourceAdmissionReceipt(
        malformed.plan,
        malformed.loop,
        malformed.approvals,
        malformed.packagingPlan,
        malformed.assemblyRequest,
        malformed.handoff,
        malformed.sources,
      ),
    (error) =>
      isAdmissionInvalid(error) && /unsafe transparent RGB/u.test(error.message),
  );
});

test("rejects incomplete or duplicate source-byte coverage", () => {
  assert.throws(
    () =>
      compileArtProductionSourceAdmissionReceipt(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        canonical.packagingPlan,
        canonical.assemblyRequest,
        canonical.handoff,
        canonical.sources.slice(1),
      ),
    /exactly one caller-supplied PNG byte payload/u,
  );
  const duplicated = canonical.sources.map((entry) => ({ ...entry }));
  duplicated[duplicated.length - 1] = duplicated[0];
  assert.throws(
    () =>
      compileArtProductionSourceAdmissionReceipt(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        canonical.packagingPlan,
        canonical.assemblyRequest,
        canonical.handoff,
        duplicated,
      ),
    (error) => isAdmissionInvalid(error) && /duplicates unit/u.test(error.message),
  );
});

test("rejects retained-hash admission receipt payload mutation", () => {
  const forged = structuredClone(canonicalReceipt);
  forged.handoff.assemblyId = `${forged.handoff.assemblyId}-forged`;
  assert.equal(forged.receiptSha256, canonicalReceipt.receiptSha256);
  assert.throws(
    () =>
      verifyArtProductionSourceAdmissionReceipt(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        canonical.packagingPlan,
        canonical.assemblyRequest,
        canonical.handoff,
        canonical.sources,
        forged,
      ),
    (error) =>
      isAdmissionInvalid(error) && /submitted payload/u.test(error.message),
  );
});

test("rejects attacker-rehashed artifact-write authority escalation", () => {
  const forged = structuredClone(canonicalReceipt);
  forged.authority.artifactWrite = true;
  rehashReceipt(forged);
  assert.throws(
    () =>
      verifyArtProductionSourceAdmissionReceipt(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        canonical.packagingPlan,
        canonical.assemblyRequest,
        canonical.handoff,
        canonical.sources,
        forged,
      ),
    (error) =>
      isAdmissionInvalid(error) && /authority is invalid or escalated/u.test(error.message),
  );
});

test("rejects a valid source admission receipt replayed against another exact handoff", () => {
  const other = compileFixture({ seed: 1000 });
  assert.throws(
    () =>
      verifyArtProductionSourceAdmissionReceipt(
        other.plan,
        other.loop,
        other.approvals,
        other.packagingPlan,
        other.assemblyRequest,
        other.handoff,
        other.sources,
        canonicalReceipt,
      ),
    (error) =>
      isAdmissionInvalid(error) && /deterministic inspection/u.test(error.message),
  );
});
