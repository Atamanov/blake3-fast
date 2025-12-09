/**
 * Official BLAKE3 Test Vectors
 *
 * We use these to make sure our code matches the spec exactly.
 * Source: https://github.com/BLAKE3-team/BLAKE3/blob/master/test_vectors/test_vectors.json
 *
 * The input generation is simple: just repeat bytes 0-250 for whatever length we need.
 */

import { describe, it, expect } from "vitest";
import {
  hash,
  toHex,
  fromHex,
  createHash,
  createHasher,
  keyedHash,
  deriveKey,
  KEY_LEN,
} from "../src/index.js";
import { hash as referenceHash } from "../src/reference.js";
import { hash as optimizedHash } from "../src/optimized.js";
import { hash as simdHash } from "../src/simd.js";
import { hash as fastSimdHash, FAST_SIMD_SUPPORTED } from "../src/simd-fast.js";
import {
  hash as fast4SimdHash,
  hashFast as ultraSimdHash,
  hashHyper as hyperSimdHash,
  FAST_4_SIMD_SUPPORTED,
} from "../src/simd-4-fast.js";
import testVectors from "./test_vectors.json";

/**
 * Generate test input by repeating bytes 0-250 (251 distinct values)
 * This matches the official BLAKE3 test vector input generation
 */
function generateInput(length: number): Uint8Array {
  const result = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = i % 251;
  }
  return result;
}

/**
 * Extract first 32 bytes (64 hex chars) from extended hash output
 */
function getHash32(extendedHash: string): string {
  return extendedHash.slice(0, 64);
}

// Official test cases from test_vectors.json
const cases = testVectors.cases;

describe("BLAKE3 Official Test Vectors", () => {
  // Test empty input (canonical)
  it("should hash empty input correctly", () => {
    const result = hash(new Uint8Array(0));
    const expected = getHash32(cases[0].hash);
    expect(toHex(result)).toBe(expected);
  });

  // Test all official vector cases
  for (const testCase of cases) {
    const { input_len, hash: expectedHash } = testCase;
    const expected32 = getHash32(expectedHash);

    it(`should hash ${input_len} bytes correctly`, () => {
      const input = generateInput(input_len);
      const result = hash(input);
      expect(toHex(result)).toBe(expected32);
    });
  }
});

describe("BLAKE3 Implementation Consistency", () => {
  // All implementations should produce identical output
  const testSizes = [
    0, 1, 63, 64, 65, 127, 128, 129, 1023, 1024, 1025, 2048, 4096, 8192,
  ];

  for (const size of testSizes) {
    it(`reference == optimized for ${size} bytes`, () => {
      const input = generateInput(size);
      const ref = referenceHash(input);
      const opt = optimizedHash(input);
      expect(toHex(opt)).toBe(toHex(ref));
    });

    it(`reference == simd for ${size} bytes`, () => {
      const input = generateInput(size);
      const ref = referenceHash(input);
      const simd = simdHash(input);
      expect(toHex(simd)).toBe(toHex(ref));
    });

    if (FAST_SIMD_SUPPORTED) {
      it(`reference == fast-simd for ${size} bytes`, () => {
        const input = generateInput(size);
        const ref = referenceHash(input);
        const fast = fastSimdHash(input);
        expect(toHex(fast)).toBe(toHex(ref));
      });
    }

    if (FAST_4_SIMD_SUPPORTED) {
      it(`reference == fast-4-simd for ${size} bytes`, () => {
        const input = generateInput(size);
        const ref = referenceHash(input);
        const fast4 = fast4SimdHash(input);
        expect(toHex(fast4)).toBe(toHex(ref));
      });

      it(`reference == ultra-simd for ${size} bytes`, () => {
        const input = generateInput(size);
        const ref = referenceHash(input);
        const ultra = ultraSimdHash(input);
        expect(toHex(ultra)).toBe(toHex(ref));
      });

      it(`reference == hyper-simd for ${size} bytes`, () => {
        const input = generateInput(size);
        const ref = referenceHash(input);
        const hyper = hyperSimdHash(input);
        expect(toHex(hyper)).toBe(toHex(ref));
      });
    }
  }
});

describe("BLAKE3 Streaming Hasher", () => {
  it("should match one-shot hash for small input", () => {
    const input = generateInput(100);
    const oneShot = hash(input);

    const hasher = createHash();
    hasher.update(input);
    const streamed = hasher.digest();

    expect(toHex(streamed)).toBe(toHex(oneShot));
  });

  it("should match one-shot hash with chunked updates", () => {
    const input = generateInput(8192);
    const oneShot = hash(input);

    const hasher = createHash();
    // Update in various chunk sizes
    hasher.update(input.subarray(0, 100));
    hasher.update(input.subarray(100, 1000));
    hasher.update(input.subarray(1000, 2500));
    hasher.update(input.subarray(2500));
    const streamed = hasher.digest();

    expect(toHex(streamed)).toBe(toHex(oneShot));
  });

  it("should support reset", () => {
    const input1 = generateInput(100);
    const input2 = generateInput(200);

    const hasher = createHash();
    hasher.update(input1);
    hasher.reset();
    hasher.update(input2);
    const result = hasher.digest();

    expect(toHex(result)).toBe(toHex(hash(input2)));
  });

  it("finalize() should be alias for digest()", () => {
    const input = generateInput(100);
    const hasher1 = createHash();
    hasher1.update(input);
    const result1 = hasher1.finalize();

    const hasher2 = createHash();
    hasher2.update(input);
    const result2 = hasher2.digest();

    expect(toHex(result1)).toBe(toHex(result2));
  });

  it("createHasher should be alias for createHash", () => {
    const input = generateInput(100);
    const hasher1 = createHash();
    hasher1.update(input);
    const result1 = hasher1.digest();

    const hasher2 = createHasher();
    hasher2.update(input);
    const result2 = hasher2.digest();

    expect(toHex(result1)).toBe(toHex(result2));
  });

  // Test streaming against official vectors
  for (const testCase of cases) {
    const { input_len, hash: expectedHash } = testCase;
    const expected32 = getHash32(expectedHash);

    it(`streaming should hash ${input_len} bytes correctly`, () => {
      const input = generateInput(input_len);
      const hasher = createHash();

      // Feed input in random-ish chunks to test streaming
      let pos = 0;
      const chunkSizes = [17, 64, 100, 1024, 333];
      let chunkIdx = 0;
      while (pos < input.length) {
        const chunkSize = Math.min(
          chunkSizes[chunkIdx % chunkSizes.length],
          input.length - pos
        );
        hasher.update(input.subarray(pos, pos + chunkSize));
        pos += chunkSize;
        chunkIdx++;
      }

      const result = hasher.digest();
      expect(toHex(result)).toBe(expected32);
    });
  }
});

describe("BLAKE3 Variable Output Length", () => {
  it("should produce 64-byte output", () => {
    const input = generateInput(100);
    const result = hash(input, 64);
    expect(result.length).toBe(64);
  });

  it("should produce 16-byte output", () => {
    const input = generateInput(100);
    const result = hash(input, 16);
    expect(result.length).toBe(16);
    // First 16 bytes should match first 16 of 32-byte hash
    expect(toHex(result)).toBe(toHex(hash(input, 32)).slice(0, 32));
  });

  it("should produce consistent prefixes", () => {
    const input = generateInput(1000);
    const h32 = hash(input, 32);
    const h64 = hash(input, 64);
    const h128 = hash(input, 128);

    expect(toHex(h32)).toBe(toHex(h64).slice(0, 64));
    expect(toHex(h64)).toBe(toHex(h128).slice(0, 128));
  });
});

describe("BLAKE3 Edge Cases", () => {
  it("should handle single byte", () => {
    const result = hash(new Uint8Array([0]));
    expect(result.length).toBe(32);
    // Check against official vector for 1 byte
    expect(toHex(result)).toBe(getHash32(cases[1].hash));
  });

  it("should handle all zeros", () => {
    const input = new Uint8Array(1024);
    const result = hash(input);
    expect(result.length).toBe(32);
  });

  it("should handle all 0xFF", () => {
    const input = new Uint8Array(1024).fill(0xff);
    const result = hash(input);
    expect(result.length).toBe(32);
  });

  it("should handle exact chunk boundary", () => {
    const input = generateInput(1024);
    const result = hash(input);
    expect(result.length).toBe(32);
    // Find the 1024-byte case and verify
    const case1024 = cases.find((c) => c.input_len === 1024);
    if (case1024) {
      expect(toHex(result)).toBe(getHash32(case1024.hash));
    }
  });

  it("should handle multiple chunk boundaries", () => {
    const input = generateInput(4096);
    const result = hash(input);
    expect(result.length).toBe(32);
    // Find the 4096-byte case and verify
    const case4096 = cases.find((c) => c.input_len === 4096);
    if (case4096) {
      expect(toHex(result)).toBe(getHash32(case4096.hash));
    }
  });
});

describe("BLAKE3 API Compatibility", () => {
  it("should accept string input", () => {
    const strResult = hash("hello");
    const bytesResult = hash(new TextEncoder().encode("hello"));
    expect(toHex(strResult)).toBe(toHex(bytesResult));
  });

  it("should accept outputLength as number", () => {
    const result = hash("test", 64);
    expect(result.length).toBe(64);
  });

  it("should accept outputLength as options object", () => {
    const result = hash("test", { outputLength: 64 });
    expect(result.length).toBe(64);
  });

  it("toHex and fromHex should be inverses", () => {
    const original = hash("test");
    const hex = toHex(original);
    const recovered = fromHex(hex);
    expect(toHex(recovered)).toBe(hex);
  });

  it("should support string input in streaming hasher", () => {
    const hasher = createHash();
    hasher.update("hello");
    hasher.update(" ");
    hasher.update("world");
    const streamed = hasher.digest();
    const oneShot = hash("hello world");
    expect(toHex(streamed)).toBe(toHex(oneShot));
  });
});

describe("BLAKE3 Keyed Hash", () => {
  it("should produce different output than regular hash", () => {
    const key = new Uint8Array(KEY_LEN);
    key.fill(0x42);
    const input = generateInput(100);

    const keyedResult = keyedHash(key, input);
    const regularResult = hash(input);

    expect(toHex(keyedResult)).not.toBe(toHex(regularResult));
  });

  it("should produce consistent output", () => {
    const key = new Uint8Array(KEY_LEN);
    key.fill(0x42);
    const input = generateInput(100);

    const result1 = keyedHash(key, input);
    const result2 = keyedHash(key, input);

    expect(toHex(result1)).toBe(toHex(result2));
  });

  it("should reject invalid key length", () => {
    const badKey = new Uint8Array(16);
    const input = generateInput(100);
    expect(() => keyedHash(badKey, input)).toThrow();
  });

  it("should accept string input", () => {
    const key = new Uint8Array(KEY_LEN);
    key.fill(0x42);
    const strResult = keyedHash(key, "hello");
    const bytesResult = keyedHash(key, new TextEncoder().encode("hello"));
    expect(toHex(strResult)).toBe(toHex(bytesResult));
  });
});

describe("BLAKE3 Key Derivation", () => {
  it("should produce consistent output", () => {
    const context = "my-app v1 encryption";
    const material = "user secret key material";

    const key1 = deriveKey(context, material);
    const key2 = deriveKey(context, material);

    expect(toHex(key1)).toBe(toHex(key2));
  });

  it("should produce different output for different contexts", () => {
    const material = "same material";

    const key1 = deriveKey("context A", material);
    const key2 = deriveKey("context B", material);

    expect(toHex(key1)).not.toBe(toHex(key2));
  });

  it("should support custom output length", () => {
    const key = deriveKey("context", "material", { outputLength: 64 });
    expect(key.length).toBe(64);
  });
});

describe("BLAKE3 Browser Compatibility", () => {
  it("should work without Node.js Buffer", () => {
    // All our code uses Uint8Array, not Buffer
    const result = hash(new Uint8Array([1, 2, 3, 4, 5]));
    expect(result instanceof Uint8Array).toBe(true);
  });

  it("should work with TextEncoder", () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode("hello");
    const result = hash(bytes);
    expect(result.length).toBe(32);
  });

  it("should handle ArrayBuffer views correctly", () => {
    const buffer = new ArrayBuffer(100);
    const view = new Uint8Array(buffer, 10, 50);
    for (let i = 0; i < 50; i++) {
      view[i] = i % 251;
    }
    const result = hash(view);
    expect(result.length).toBe(32);
  });
});
