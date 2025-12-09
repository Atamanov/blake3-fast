# blake3-fast

**1.6 GB/s** BLAKE3 in pure TypeScript. No native bindings, no `node-gyp`, no Python.

Just drop it in and hash. Works in Node.js, browsers, Deno, Bun—anywhere JavaScript runs.

## Why?

The official `blake3` package uses native bindings. That means:
- Build failures on CI
- Platform-specific headaches
- Pain when deploying to serverless

This library generates WebAssembly SIMD bytecode at runtime. Same interface, zero dependencies, actually fast.

## Install

```bash
npm install blake3-fast
```

## Quick Start

```typescript
import { hash, createHash } from 'blake3-fast';

// One-shot
const digest = hash("hello world");

// Streaming
const hasher = createHash();
hasher.update(chunk1);
hasher.update(chunk2);
const result = hasher.digest();

// Keyed hash (MAC)
const mac = keyedHash(key32bytes, message);

// Key derivation
const derived = deriveKey("my-app-v1", password);
```

## Benchmarks

Measured on Apple M4 Max, Node.js v22:

| Input Size | Throughput | vs Reference |
|------------|------------|--------------|
| 96 B | 224 MB/s | 5× |
| 512 B | 426 MB/s | 7× |
| 1 KB | 465 MB/s | 8× |
| 32 KB | **1.20 GB/s** | 24× |
| 64 KB | **1.20 GB/s** | 23× |
| 256 KB | **1.6 GB/s** | 26× |
| 1 MB | **1.6 GB/s** | 26× |

Fast for small inputs, faster for large ones. Run `npm run bench` to test on your machine.

## How It Works

The library automatically picks the best strategy based on input size:

- **Small inputs** → SIMD-accelerated compression (~450 MB/s)
- **Large inputs** → 4-way parallel chunks (~1.6 GB/s)

For large data, we process 4 independent chunks simultaneously. BLAKE3's Merkle tree makes chunks independent—we interleave them across the four lanes of each 128-bit SIMD register. One `i32x4.add` = four additions.

No `.wasm` files to load. The bytecode is generated programmatically at startup (~1ms).

## API

Drop-in compatible with the official `blake3` package:

```typescript
// Hashing
hash(input: string | Uint8Array, options?: { length?: number }): Uint8Array
createHash(): Hash

// Keyed hashing (MAC)
keyedHash(key: Uint8Array, input: string | Uint8Array): Uint8Array
createKeyed(key: Uint8Array): Hash

// Key derivation
deriveKey(context: string, material: string | Uint8Array): Uint8Array

// Utilities
toHex(bytes: Uint8Array): string
fromHex(hex: string): Uint8Array
```

## Browser Usage

Works out of the box with any bundler (Vite, esbuild, webpack, etc.):

```html
<script type="module">
  import { hash, toHex } from 'blake3-fast';
  
  const digest = hash(new TextEncoder().encode("hello"));
  console.log(toHex(digest));
</script>
```

## Building from Source

```bash
git clone https://github.com/Atamanov/blake3-fast.git
cd blake3-fast
npm install
npm run build    # Compile TypeScript -> dist/
npm test         # Run test suite
npm run bench    # Performance benchmarks
```

## License

MIT © [Alexander Atamanov](https://github.com/Atamanov) 2025
