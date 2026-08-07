import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactStoreError,
  artifactId,
  normalizeJson,
  stableStringify,
} from "../dist/index.js";

function metadataError(error) {
  return (
    error instanceof ArtifactStoreError &&
    error.code === "ARTIFACT_METADATA_INVALID"
  );
}

test("canonical JSON snapshots accessors once and preserves special keys safely", () => {
  let objectReads = 0;
  let nestedReads = 0;
  let arrayReads = 0;

  const nested = {};
  Object.defineProperty(nested, "stable", {
    enumerable: true,
    get() {
      nestedReads += 1;
      if (nestedReads > 1) {
        throw new Error("nested accessor was read more than once");
      }
      return "value";
    },
  });

  const array = [];
  Object.defineProperty(array, 0, {
    enumerable: true,
    configurable: true,
    get() {
      arrayReads += 1;
      if (arrayReads > 1) {
        throw new Error("array entry was read more than once");
      }
      return "first";
    },
  });
  array.length = 1;

  const source = {};
  Object.defineProperty(source, "payload", {
    enumerable: true,
    get() {
      objectReads += 1;
      if (objectReads > 1) {
        throw new Error("object accessor was read more than once");
      }
      return nested;
    },
  });
  Object.defineProperty(source, "items", {
    enumerable: true,
    value: array,
  });
  Object.defineProperty(source, "__proto__", {
    enumerable: true,
    value: { polluted: false },
  });
  Object.defineProperty(source, "constructor", {
    enumerable: true,
    value: "retained",
  });

  const normalized = normalizeJson(source);

  assert.equal(objectReads, 1);
  assert.equal(nestedReads, 1);
  assert.equal(arrayReads, 1);
  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
  assert.equal(Object.hasOwn(normalized, "__proto__"), true);
  assert.equal(Object.hasOwn(normalized, "constructor"), true);
  assert.deepEqual(normalized["__proto__"], { polluted: false });
  assert.equal(normalized.constructor, "retained");
  assert.deepEqual(normalized.payload, { stable: "value" });
  assert.deepEqual(normalized.items, ["first"]);
  assert.equal({}.polluted, undefined);

  const canonical = stableStringify(normalized);
  assert.equal(
    canonical,
    '{"__proto__":{"polluted":false},"constructor":"retained","items":["first"],"payload":{"stable":"value"}}',
  );

  const reordered = {};
  Object.defineProperty(reordered, "constructor", {
    enumerable: true,
    value: "retained",
  });
  Object.defineProperty(reordered, "payload", {
    enumerable: true,
    value: { stable: "value" },
  });
  Object.defineProperty(reordered, "__proto__", {
    enumerable: true,
    value: { polluted: false },
  });
  Object.defineProperty(reordered, "items", {
    enumerable: true,
    value: ["first"],
  });

  assert.equal(
    artifactId(normalizeJson(reordered)),
    artifactId(normalized),
  );
});

test("canonical JSON allows shared acyclic values and rejects unsafe structures", () => {
  const shared = { value: 7 };
  const normalized = normalizeJson({ left: shared, right: shared });
  assert.deepEqual(normalized, {
    left: { value: 7 },
    right: { value: 7 },
  });
  assert.notEqual(normalized.left, normalized.right);

  const circular = { name: "cycle" };
  circular.self = circular;
  assert.throws(
    () => normalizeJson(circular),
    (error) => metadataError(error) && /circular JSON reference/.test(error.message),
  );

  const sparse = [];
  sparse.length = 1;
  assert.throws(
    () => normalizeJson(sparse),
    (error) => metadataError(error) && /undefined or sparse/.test(error.message),
  );

  assert.throws(
    () => normalizeJson([undefined]),
    (error) => metadataError(error) && /undefined or sparse/.test(error.message),
  );

  const throwingValue = {};
  Object.defineProperty(throwingValue, "secret", {
    enumerable: true,
    get() {
      throw new Error("must not escape the canonicalization boundary");
    },
  });
  assert.throws(
    () => normalizeJson(throwingValue),
    (error) =>
      metadataError(error) &&
      /\$\.secret could not be read safely/.test(error.message) &&
      !/must not escape/.test(error.message),
  );

  const throwingKeys = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("hostile ownKeys trap");
      },
    },
  );
  assert.throws(
    () => normalizeJson(throwingKeys),
    (error) =>
      metadataError(error) &&
      /object keys could not be read safely/.test(error.message) &&
      !/hostile ownKeys/.test(error.message),
  );
});
