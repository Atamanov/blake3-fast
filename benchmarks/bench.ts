/**
 * BLAKE3 Performance Test
 *
 * See how the different versions stack up against each other.
 * We compare:
 * - Reference: The slow but readable version.
 * - Optimized: Pure JS with all the tricks.
 * - SIMD: Parallel chunk processing via WASM.
 * - Fast SIMD: The fastest version, using parallel G function.
 *
 * We use the same test sizes as the Fleek Network case study.
 *
 * Run it with: npx tsx benchmarks/bench.ts
 */

import { hash as referenceHash } from "../src/reference.js";
import { hash as optimizedHash } from "../src/optimized.js";
import { hash as simdHash, SIMD_SUPPORTED } from "../src/simd.js";
import { hash as fastSimdHash, FAST_SIMD_SUPPORTED } from "../src/simd-fast.js";
import {
  hash as fast4SimdHash,
  hashFast as ultraSimdHash,
  hashHyper as hyperSimdHash,
  FAST_4_SIMD_SUPPORTED,
} from "../src/simd-4-fast.js";
import { hash as autoHash } from "../src/index.js";

// Benchmark configuration
// V8 needs ~100 iterations for TurboFan to fully optimize WASM
const WARMUP_ITERATIONS = 100;
const BENCHMARK_DURATION_MS = 2000; // 2 seconds per benchmark

// Test sizes from Fleek Network case study
const BENCH_SIZES: [string, number][] = [
  ["96B", 96],
  ["512B", 512],
  ["1KB", 1024],
  ["32KB", 32 * 1024],
  ["64KB", 64 * 1024],
  ["256KB", 256 * 1024],
  ["1MB", 1024 * 1024],
];

/**
 * Generate random test data
 */
function generateInput(size: number): Uint8Array {
  const input = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    input[i] = (Math.random() * 256) | 0;
  }
  return input;
}

/**
 * Runs the hash function in a loop to see how fast it goes.
 * Returns: { opsPerSec, avgTimeMs, throughputMBps }
 */
function benchmark(
  fn: (input: Uint8Array) => Uint8Array,
  input: Uint8Array
): { opsPerSec: number; avgTimeMs: number; throughputMBps: number } {
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    fn(input);
  }

  // Benchmark
  const start = performance.now();
  let iterations = 0;

  while (performance.now() - start < BENCHMARK_DURATION_MS) {
    fn(input);
    iterations++;
  }

  const elapsed = performance.now() - start;
  const opsPerSec = (iterations / elapsed) * 1000;
  const avgTimeMs = elapsed / iterations;
  const throughputMBps = (input.length * opsPerSec) / (1024 * 1024);

  return { opsPerSec, avgTimeMs, throughputMBps };
}

/**
 * Format number with commas
 */
function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Format throughput
 */
function formatThroughput(mbps: number): string {
  if (mbps >= 1024) {
    return `${formatNumber(mbps / 1024)} GB/s`;
  }
  return `${formatNumber(mbps)} MB/s`;
}

/**
 * Run all benchmarks
 */
async function runBenchmarks() {
  console.log(
    "═══════════════════════════════════════════════════════════════════════"
  );
  console.log("                    BLAKE3 JavaScript Performance Benchmarks");
  console.log(
    "═══════════════════════════════════════════════════════════════════════"
  );
  console.log();
  console.log(
    `SIMD Support: ${SIMD_SUPPORTED ? "✓ Available" : "✗ Not available"}`
  );
  console.log(
    `Fast SIMD Support: ${FAST_SIMD_SUPPORTED ? "✓ Available" : "✗ Not available"}`
  );
  console.log(
    `Fast-4 SIMD Support: ${FAST_4_SIMD_SUPPORTED ? "✓ Available" : "✗ Not available"}`
  );
  console.log(`Benchmark Duration: ${BENCHMARK_DURATION_MS}ms per test`);
  console.log();

  // Prepare test inputs
  const inputs = new Map<string, Uint8Array>();
  for (const [name, size] of BENCH_SIZES) {
    inputs.set(name, generateInput(size));
  }

  // Results storage
  type Results = {
    [size: string]: {
      ref: number;
      opt: number;
      fastSimd: number;
      fast4Simd: number;
      ultraSimd: number;
      hyperSimd: number;
      auto: number;
    };
  };
  const throughputs: Results = {};

  console.log("Running benchmarks...\n");

  for (const [sizeName, size] of BENCH_SIZES) {
    const input = inputs.get(sizeName)!;

    console.log(`─── ${sizeName} ─────────────────────────────────────`);

    // Reference implementation
    process.stdout.write("  Reference:  ");
    const refResult = benchmark(referenceHash, input);
    console.log(
      `${formatNumber(refResult.opsPerSec)} ops/s  │  ${formatThroughput(refResult.throughputMBps)}`
    );

    // Optimized implementation
    process.stdout.write("  Optimized:  ");
    const optResult = benchmark(optimizedHash, input);
    const optSpeedup = optResult.opsPerSec / refResult.opsPerSec;
    console.log(
      `${formatNumber(optResult.opsPerSec)} ops/s  │  ${formatThroughput(optResult.throughputMBps)}  │  ${formatNumber(optSpeedup)}x vs ref`
    );

    // SIMD implementation (parallel chunks)
    process.stdout.write("  SIMD:       ");
    const simdResult = benchmark(simdHash, input);
    const simdSpeedup = simdResult.opsPerSec / refResult.opsPerSec;
    const simdVsOpt = simdResult.opsPerSec / optResult.opsPerSec;
    console.log(
      `${formatNumber(simdResult.opsPerSec)} ops/s  │  ${formatThroughput(simdResult.throughputMBps)}  │  ${formatNumber(simdSpeedup)}x vs ref, ${formatNumber(simdVsOpt)}x vs opt`
    );

    // Fast SIMD implementation (chunk-level)
    process.stdout.write("  Fast SIMD:  ");
    const fastSimdResult = benchmark(fastSimdHash, input);
    const fastSimdSpeedup = fastSimdResult.opsPerSec / refResult.opsPerSec;
    const fastSimdVsOpt = fastSimdResult.opsPerSec / optResult.opsPerSec;
    console.log(
      `${formatNumber(fastSimdResult.opsPerSec)} ops/s  │  ${formatThroughput(fastSimdResult.throughputMBps)}  │  ${formatNumber(fastSimdSpeedup)}x vs ref, ${formatNumber(fastSimdVsOpt)}x vs opt`
    );

    // Fast-4 SIMD implementation (4-chunk parallel)
    process.stdout.write("  Fast-4:     ");
    const fast4SimdResult = benchmark(fast4SimdHash, input);
    const fast4SimdSpeedup = fast4SimdResult.opsPerSec / refResult.opsPerSec;
    const fast4SimdVsOpt = fast4SimdResult.opsPerSec / optResult.opsPerSec;
    console.log(
      `${formatNumber(fast4SimdResult.opsPerSec)} ops/s  │  ${formatThroughput(fast4SimdResult.throughputMBps)}  │  ${formatNumber(fast4SimdSpeedup)}x vs ref, ${formatNumber(fast4SimdVsOpt)}x vs opt`
    );

    // Ultra SIMD implementation (optimized allocations)
    process.stdout.write("  Ultra:      ");
    const ultraSimdResult = benchmark(ultraSimdHash, input);
    const ultraSimdSpeedup = ultraSimdResult.opsPerSec / refResult.opsPerSec;
    const ultraSimdVsOpt = ultraSimdResult.opsPerSec / optResult.opsPerSec;
    console.log(
      `${formatNumber(ultraSimdResult.opsPerSec)} ops/s  │  ${formatThroughput(ultraSimdResult.throughputMBps)}  │  ${formatNumber(ultraSimdSpeedup)}x vs ref, ${formatNumber(ultraSimdVsOpt)}x vs opt`
    );

    // Hyper SIMD implementation (8-chunk batches)
    process.stdout.write("  Hyper:      ");
    const hyperSimdResult = benchmark(hyperSimdHash, input);
    const hyperSimdSpeedup = hyperSimdResult.opsPerSec / refResult.opsPerSec;
    const hyperSimdVsOpt = hyperSimdResult.opsPerSec / optResult.opsPerSec;
    console.log(
      `${formatNumber(hyperSimdResult.opsPerSec)} ops/s  │  ${formatThroughput(hyperSimdResult.throughputMBps)}  │  ${formatNumber(hyperSimdSpeedup)}x vs ref, ${formatNumber(hyperSimdVsOpt)}x vs opt`
    );

    // Auto (hybrid: Fast SIMD for small, Hyper for large)
    process.stdout.write("  Auto:       ");
    const autoResult = benchmark(autoHash, input);
    const autoSpeedup = autoResult.opsPerSec / refResult.opsPerSec;
    const autoVsOpt = autoResult.opsPerSec / optResult.opsPerSec;
    console.log(
      `${formatNumber(autoResult.opsPerSec)} ops/s  │  ${formatThroughput(autoResult.throughputMBps)}  │  ${formatNumber(autoSpeedup)}x vs ref, ${formatNumber(autoVsOpt)}x vs opt`
    );

    console.log();

    throughputs[sizeName] = {
      ref: refResult.throughputMBps,
      opt: optResult.throughputMBps,
      fastSimd: fastSimdResult.throughputMBps,
      fast4Simd: fast4SimdResult.throughputMBps,
      ultraSimd: ultraSimdResult.throughputMBps,
      hyperSimd: hyperSimdResult.throughputMBps,
      auto: autoResult.throughputMBps,
    };
  }

  // Summary table
  console.log(
    "══════════════════════════════════════════════════════════════════════════════════════════"
  );
  console.log("                                  Summary (Throughput MB/s)");
  console.log(
    "══════════════════════════════════════════════════════════════════════════════════════════"
  );
  console.log();
  console.log(
    "Size       │ Reference    │ Fast SIMD    │ Hyper        │ Auto         │ Best/Ref"
  );
  console.log(
    "───────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────"
  );

  for (const [sizeName] of BENCH_SIZES) {
    const t = throughputs[sizeName];
    const best = Math.max(t.fastSimd, t.hyperSimd, t.auto);
    const bestRatio = best / t.ref;

    console.log(
      `${sizeName.padEnd(10)} │ ` +
        `${formatThroughput(t.ref).padEnd(12)} │ ` +
        `${formatThroughput(t.fastSimd).padEnd(12)} │ ` +
        `${formatThroughput(t.hyperSimd).padEnd(12)} │ ` +
        `${formatThroughput(t.auto).padEnd(12)} │ ` +
        `${formatNumber(bestRatio)}x`
    );
  }

  console.log();
  console.log(
    "══════════════════════════════════════════════════════════════════════════════════════════"
  );

  // Calculate average speedups
  const smallSizes = ["96B", "512B", "1KB"];
  const largeSizes = ["32KB", "64KB", "256KB", "1MB"];

  let avgAutoSmall = 0,
    avgAutoLarge = 0;
  for (const size of smallSizes) {
    avgAutoSmall += throughputs[size].auto / throughputs[size].ref;
  }
  for (const size of largeSizes) {
    avgAutoLarge += throughputs[size].auto / throughputs[size].ref;
  }
  avgAutoSmall /= smallSizes.length;
  avgAutoLarge /= largeSizes.length;

  console.log();
  console.log(`Auto (hybrid) performance:`);
  console.log(
    `  Small inputs (<4KB):  ${formatNumber(avgAutoSmall)}x vs reference`
  );
  console.log(
    `  Large inputs (>=32KB): ${formatNumber(avgAutoLarge)}x vs reference`
  );
  console.log();
}

// Run benchmarks
runBenchmarks().catch(console.error);
