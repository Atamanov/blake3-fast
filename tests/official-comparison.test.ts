/**
 * Comparison tests against the official blake3 npm package.
 *
 * Validates that our implementation produces identical output for:
 * - Official test vectors
 * - Random inputs of various sizes
 * - Edge cases (empty, single byte, block/chunk boundaries)
 */

import { describe, it, expect } from "vitest";
import * as official from "blake3";
import * as ours from "../src/index.js";
import testVectors from "./test_vectors.json";

// Generate deterministic "random" input (same pattern as test vectors)
function generateInput(length: number): Uint8Array {
  const result = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = i % 251;
  }
  return result;
}

// Generate truly random input
function randomInput(length: number): Uint8Array {
  const result = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = Math.floor(Math.random() * 256);
  }
  return result;
}

describe("Official blake3 comparison", () => {
  describe("Test vectors", () => {
    const cases = (testVectors as any).cases;

    for (const testCase of cases) {
      const { input_len, hash: expectedHash } = testCase;

      it(`${input_len} bytes matches official`, () => {
        const input = generateInput(input_len);

        const officialHash = official.hash(input).toString("hex");
        const ourHash = ours.toHex(ours.hash(input));

        // Both should match expected (first 64 chars = 32 bytes)
        expect(ourHash).toBe(expectedHash.slice(0, 64));
        expect(officialHash).toBe(expectedHash.slice(0, 64));

        // And match each other
        expect(ourHash).toBe(officialHash);
      });
    }
  });

  describe("Random inputs", () => {
    // Test various sizes including edge cases
    const sizes = [
      0, // Empty
      1, // Single byte
      63,
      64, // Block boundary
      65,
      127,
      128, // 2 blocks
      129,
      1023,
      1024, // Chunk boundary
      1025,
      2047,
      2048, // 2 chunks
      2049,
      4095,
      4096, // 4 chunks (hybrid threshold)
      4097,
      8192,
      16384,
      32768,
      65536,
      131072, // 128KB
      262144, // 256KB
      524288, // 512KB
      1048576, // 1MB
    ];

    for (const size of sizes) {
      it(`${size} bytes random data matches official`, () => {
        const input = randomInput(size);

        const officialHash = official.hash(input).toString("hex");
        const ourHash = ours.toHex(ours.hash(input));

        expect(ourHash).toBe(officialHash);
      });
    }
  });

  describe("Large inputs (multi-MB)", () => {
    const largeSizes = [
      { size: 5 * 1024 * 1024, name: "5MB" },
      { size: 10 * 1024 * 1024, name: "10MB" },
      { size: 50 * 1024 * 1024, name: "50MB" },
    ];

    for (const { size, name } of largeSizes) {
      it(`${name} matches official`, () => {
        const input = randomInput(size);

        const officialHash = official.hash(input).toString("hex");
        const ourHash = ours.toHex(ours.hash(input));

        expect(ourHash).toBe(officialHash);
      }, 30000); // 30s timeout for large inputs
    }
  });

  describe("String inputs", () => {
    const strings = [
      "",
      "hello",
      "hello world",
      "The quick brown fox jumps over the lazy dog",
      "a".repeat(1000),
      "b".repeat(10000),
      "🔐".repeat(100), // Unicode
    ];

    for (const str of strings) {
      it(`string "${str.slice(0, 20)}${str.length > 20 ? "..." : ""}" matches official`, () => {
        const officialHash = official.hash(str).toString("hex");
        const ourHash = ours.toHex(ours.hash(str));

        expect(ourHash).toBe(officialHash);
      });
    }
  });

  describe("Streaming comparison", () => {
    it("streaming matches one-shot for large input", () => {
      const input = randomInput(100000);

      // Official streaming
      const officialHasher = official.createHash();
      officialHasher.update(input.subarray(0, 30000));
      officialHasher.update(input.subarray(30000, 70000));
      officialHasher.update(input.subarray(70000));
      const officialHash = officialHasher.digest().toString("hex");

      // Our streaming
      const ourHasher = ours.createHash();
      ourHasher.update(input.subarray(0, 30000));
      ourHasher.update(input.subarray(30000, 70000));
      ourHasher.update(input.subarray(70000));
      const ourHash = ours.toHex(ourHasher.digest());

      expect(ourHash).toBe(officialHash);
    });

    it("many small updates match one-shot", () => {
      const chunks = Array.from({ length: 100 }, () => randomInput(1000));
      const fullInput = new Uint8Array(100000);
      let offset = 0;
      for (const chunk of chunks) {
        fullInput.set(chunk, offset);
        offset += chunk.length;
      }

      // Official
      const officialHasher = official.createHash();
      for (const chunk of chunks) {
        officialHasher.update(chunk);
      }
      const officialHash = officialHasher.digest().toString("hex");

      // Ours
      const ourHasher = ours.createHash();
      for (const chunk of chunks) {
        ourHasher.update(chunk);
      }
      const ourHash = ours.toHex(ourHasher.digest());

      // One-shot
      const officialOneShot = official.hash(fullInput).toString("hex");
      const ourOneShot = ours.toHex(ours.hash(fullInput));

      expect(ourHash).toBe(officialHash);
      expect(ourHash).toBe(officialOneShot);
      expect(ourHash).toBe(ourOneShot);
    });
  });

  describe("Keyed hashing", () => {
    it("keyed hash matches official", () => {
      const key = new Uint8Array(32);
      for (let i = 0; i < 32; i++) key[i] = i;

      const input = generateInput(10000); // Use deterministic input

      const officialHash = official
        .keyedHash(Buffer.from(key), input)
        .toString("hex");
      const ourHash = ours.toHex(ours.keyedHash(key, input));

      expect(ourHash).toBe(officialHash);
    });

    it("keyed hash with string input matches official", () => {
      const key = new Uint8Array(32).fill(42);
      const input = "hello keyed world";

      const officialHash = official
        .keyedHash(Buffer.from(key), input)
        .toString("hex");
      const ourHash = ours.toHex(ours.keyedHash(key, input));

      expect(ourHash).toBe(officialHash);
    });
  });

  describe("Key derivation", () => {
    it("deriveKey matches official", () => {
      const context = "blake3-fast test context";
      const material = generateInput(1000); // Use deterministic input

      const officialKey = official.deriveKey(context, material).toString("hex");
      const ourKey = ours.toHex(ours.deriveKey(context, material));

      expect(ourKey).toBe(officialKey);
    });

    it("deriveKey with string material matches official", () => {
      const context = "my-app-v1";
      const material = "user-password-123";

      const officialKey = official.deriveKey(context, material).toString("hex");
      const ourKey = ours.toHex(ours.deriveKey(context, material));

      expect(ourKey).toBe(officialKey);
    });
  });
});
