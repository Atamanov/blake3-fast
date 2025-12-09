/**
 * BLAKE3 Browser Benchmark
 *
 * Generates a minimal demo-style benchmark page.
 * Uses esbuild to bundle implementations properly.
 */

import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bundle(): Promise<string> {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export { hash as referenceHash } from '../src/reference.ts';
        export { hash as optimizedHash } from '../src/optimized.ts';
        export { hash as simdHash, SIMD_SUPPORTED } from '../src/simd.ts';
        export { hash as fastSimdHash, FAST_SIMD_SUPPORTED } from '../src/simd-fast.ts';
        export { hash as fast4SimdHash, hashFast as ultraSimdHash, hashHyper as hyperSimdHash, FAST_4_SIMD_SUPPORTED } from '../src/simd-4-fast.ts';
      `,
      resolveDir: __dirname,
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    globalName: "BLAKE3",
    write: false,
    target: "es2020",
    platform: "browser",
  });
  return result.outputFiles[0].text;
}

async function main() {
  console.log("Bundling...");
  const js = await bundle();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BLAKE3 Benchmark</title>
  <style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #08080c;
  --fg: #c8c8d0;
  --pink: #f0f;
  --cyan: #0ff;
  --dim: #333;
}

body {
  font: 14px/1.6 'SF Mono', 'Fira Code', 'Consolas', monospace;
  background: var(--bg);
  color: var(--fg);
  min-height: 100vh;
}

canvas { position: fixed; inset: 0; width: 100%; height: 100%; z-index: -1; }

main {
  max-width: 900px;
  margin: 0 auto;
  padding: 3rem 2rem;
}

h1 {
  font-size: 1.5rem;
  font-weight: 400;
  color: var(--pink);
  margin-bottom: 0.25rem;
  text-shadow: 0 0 30px var(--pink);
}

.sub { color: var(--dim); margin-bottom: 2rem; }

.tags {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.tag {
  font-size: 11px;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--dim);
  color: var(--dim);
}

.tag.ok { border-color: var(--cyan); color: var(--cyan); }

button {
  font: inherit;
  background: none;
  border: 1px solid var(--pink);
  color: var(--pink);
  padding: 0.5rem 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

button:hover { background: var(--pink); color: var(--bg); }
button:disabled { opacity: 0.3; cursor: default; background: none; color: var(--pink); }

#out {
  margin-top: 2rem;
  white-space: pre;
  font-size: 13px;
  line-height: 1.8;
}

.h { color: var(--dim); }
.v { color: var(--fg); }
.best { color: var(--cyan); text-shadow: 0 0 10px var(--cyan); }
.x { color: var(--pink); }
  </style>
</head>
<body>
<canvas id="c"></canvas>
<main>
  <h1>BLAKE3 Benchmark</h1>
  <p class="sub">WebAssembly SIMD performance test</p>
  <div class="tags" id="tags"></div>
  <button id="btn" disabled>run</button>
  <pre id="out"></pre>
</main>

<script>
// — background —
const c = document.getElementById('c');
const gl = c.getContext('webgl');
const W = () => c.width = innerWidth;
const H = () => c.height = innerHeight;
addEventListener('resize', () => { W(); H(); gl.viewport(0, 0, c.width, c.height); });
W(); H();
gl.viewport(0, 0, c.width, c.height);

const vs = \`attribute vec2 p; void main() { gl_Position = vec4(p, 0, 1); }\`;
const fs = \`
precision highp float;
uniform float t;
uniform vec2 r;

float grid(vec2 p, float s) {
  vec2 g = abs(fract(p * s) - 0.5);
  return smoothstep(0.02, 0.0, min(g.x, g.y));
}

void main() {
  vec2 uv = gl_FragCoord.xy / r;
  vec2 p = (uv - 0.5) * vec2(r.x/r.y, 1.0);
  
  float g = grid(p + vec2(0, t * 0.1), 8.0) * 0.15;
  g += grid(p + vec2(0, t * 0.05), 2.0) * 0.08;
  
  vec3 col = vec3(1.0, 0.0, 1.0) * g;
  col += vec3(0.03, 0.03, 0.05);
  
  // vignette
  col *= 1.0 - length(uv - 0.5) * 0.8;
  
  gl_FragColor = vec4(col, 1.0);
}
\`;

function sh(src, type) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, sh(vs, gl.VERTEX_SHADER));
gl.attachShader(prog, sh(fs, gl.FRAGMENT_SHADER));
gl.linkProgram(prog);
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
const p = gl.getAttribLocation(prog, 'p');
gl.enableVertexAttribArray(p);
gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

const ut = gl.getUniformLocation(prog, 't');
const ur = gl.getUniformLocation(prog, 'r');

let t0 = performance.now();
(function loop() {
  gl.uniform1f(ut, (performance.now() - t0) / 1000);
  gl.uniform2f(ur, c.width, c.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(loop);
})();
</script>

<script>
${js}

const { referenceHash, optimizedHash, fastSimdHash, fast4SimdHash, ultraSimdHash, hyperSimdHash, SIMD_SUPPORTED, FAST_SIMD_SUPPORTED, FAST_4_SIMD_SUPPORTED } = BLAKE3;

// — init —
const tags = document.getElementById('tags');
const btn = document.getElementById('btn');
const out = document.getElementById('out');

tags.innerHTML = [
  ['Fast', FAST_SIMD_SUPPORTED],
  ['Fast-4', FAST_4_SIMD_SUPPORTED],
  ['Hyper', FAST_4_SIMD_SUPPORTED]
].map(([n, ok]) => \`<span class="tag \${ok ? 'ok' : ''}">\${n}: \${ok ? '✓' : '✗'}</span>\`).join('');

// verify
try {
  const t = hyperSimdHash(new Uint8Array([1,2,3]));
  if (t.length === 32) btn.disabled = false;
} catch(e) { out.textContent = 'error: ' + e.message; }

// — benchmark —
const sizes = [[96,'96B'],[512,'512B'],[1024,'1KB'],[32768,'32KB'],[65536,'64KB'],[262144,'256KB'],[1048576,'1MB']];

function bench(fn, input, ms = 2000) {
  for (let i = 0; i < 5; i++) fn(input);
  const t0 = performance.now();
  let n = 0;
  while (performance.now() - t0 < ms) { fn(input); n++; }
  const dt = performance.now() - t0;
  return (input.length * n / dt) * 1000 / 1048576; // MB/s
}

function fmt(n) { return n.toFixed(1).padStart(7) + ' MB/s'; }

async function run() {
  btn.disabled = true;
  out.textContent = '';
  
  const header = '  size   │  reference │  optimized │    fast    │   fast-4   │   hyper    │  best';
  const sep    = '─────────┼────────────┼────────────┼────────────┼────────────┼────────────┼───────';
  out.innerHTML = '<span class="h">' + header + '</span>\\n<span class="h">' + sep + '</span>\\n';
  
  for (const [size, label] of sizes) {
    out.innerHTML += '<span class="h">' + label.padStart(7) + '  │</span> running...';
    await new Promise(r => setTimeout(r, 10));
    
    const input = new Uint8Array(size);
    for (let i = 0; i < size; i++) input[i] = Math.random() * 256 | 0;
    
    const ref = bench(referenceHash, input);
    const opt = bench(optimizedHash, input);
    const fast = bench(fastSimdHash, input);
    const fast4 = bench(fast4SimdHash, input);
    const hyper = bench(hyperSimdHash, input);
    
    const best = Math.max(ref, opt, fast, fast4, hyper);
    const ratio = (best / ref).toFixed(1) + 'x';
    
    const line = [ref, opt, fast, fast4, hyper].map((v, i) => {
      const s = v.toFixed(0).padStart(6) + ' MB/s';
      return v === best ? '<span class="best">' + s + '</span>' : '<span class="v">' + s + '</span>';
    }).join('<span class="h"> │</span>');
    
    out.innerHTML = out.innerHTML.replace(/running\\.\\.\\..*/, '');
    out.innerHTML += line + '<span class="h"> │</span><span class="x">' + ratio.padStart(6) + '</span>\\n';
  }
  
  out.innerHTML += '<span class="h">' + sep + '</span>';
  btn.disabled = false;
}

btn.onclick = run;
</script>
</body>
</html>`;

  fs.writeFileSync(path.join(__dirname, "browser-bench.html"), html);
  console.log("Generated: benchmarks/browser-bench.html");
}

main().catch(console.error);
