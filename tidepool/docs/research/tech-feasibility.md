# Tidepool: web technology feasibility

Researched 2026-10-09. Support data comes from the caniuse dataset at release 1.0.30001815 (committed 2026-10-07, https://github.com/Fyrd/caniuse/tree/main/features-json) and MDN browser-compat-data `main` (committed 2026-10-09, https://github.com/mdn/browser-compat-data). Lines marked **Assessment** are my inference from the cited facts, not something a source states. Lines marked `UNCONFIRMED` have no source I could verify.

---

## 1. Threads and shared memory

**Short answer.** `SharedArrayBuffer` and WASM threads need a secure context plus two response headers on the document. Cloudflare Pages, Netlify, and Vercel can set them. GitHub Pages cannot. The service-worker workaround still exists but is unmaintained and has open failure reports. Every current browser supports shared memory when isolated, except Android WebView. Design the simulation so that it runs correctly on one worker with no shared memory, and treat threads as an optional speed-up.

**Requirements**

- A document is cross-origin isolated when it is served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`). Check at run time with `self.crossOriginIsolated`. https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated
- Shared memory also requires a secure context (HTTPS or localhost). https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- Under `require-corp`, every cross-origin subresource loaded without CORS must send `Cross-Origin-Resource-Policy: cross-origin`. https://web.dev/articles/coop-coep
- `COEP: credentialless` removes that requirement. Chrome 96 and Firefox 119 support it. Safari and Firefox for Android do not. https://github.com/mdn/browser-compat-data/blob/main/http/headers/Cross-Origin-Embedder-Policy.json
- The WebKit bug "Implement COEP:credentialless" is still open (status NEW, last changed 2026-09-07). https://bugs.webkit.org/show_bug.cgi?id=230550
- COEP also requires every embedded iframe to opt in. https://developer.chrome.com/blog/document-isolation-policy
- Chrome 137 shipped `Document-Isolation-Policy` on desktop as a per-document alternative. It still needs a response header, and the post lists Android as a later launch. https://developer.chrome.com/blog/document-isolation-policy

**Static hosts**

| Host | Custom headers | How | Source |
|---|---|---|---|
| Cloudflare Pages | Yes | `_headers` file in the build output, up to 100 rules, applied to static asset responses | https://developers.cloudflare.com/pages/configuration/headers/ |
| Netlify | Yes | `_headers` file or `[[headers]]` in `netlify.toml`, for files Netlify serves from its own store | https://docs.netlify.com/manage/routing/headers/ |
| Vercel | Yes | `headers` array in `vercel.json` (doc last updated 2026-08-14) | https://vercel.com/docs/project-configuration/vercel-json |
| GitHub Pages | No | Only staff reply (2023-07-10): "No ETA". Users were still asking on 2026-08-15 | https://github.com/orgs/community/discussions/13309 |

Cloudflare Pages and Netlify `_headers` form:

```
/tidepool/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

**`coi-serviceworker`**

- It registers a service worker that adds the two headers to responses, then reloads the page once on first visit. It must be a separate file served from your own origin and cannot be bundled. https://github.com/gzuidhof/coi-serviceworker
- The last commit is dated 2023-12-09. The repository is not archived. https://api.github.com/repos/gzuidhof/coi-serviceworker
- Reported failures in the GitHub Pages discussion: a continuous reload loop in Chrome and `navigator.serviceWorker is undefined` in Firefox (2024-07), a break in Firefox with v0.1.7 (2025-08), and a conflict with any service worker the app already has (2022-10). https://github.com/orgs/community/discussions/13309
- Because Safari has no `credentialless`, the script must fall back to `require-corp` there (its `coepDegrade` option), so every cross-origin asset still needs CORP or CORS. https://github.com/gzuidhof/coi-serviceworker
- **Assessment:** drawbacks are the forced first-visit reload, no effect where service workers are unavailable, one more service worker to keep compatible with any offline cache, and no maintenance for almost three years. Usable as a last resort, not as the design basis.

**Mobile support and limits**

- `SharedArrayBuffer` with isolation: iOS Safari 15.2+, Chrome for Android, Firefox for Android, Samsung Internet 15+. Global coverage 96.21%. https://caniuse.com/sharedarraybuffer
- WASM threads and atomics: Chrome 74, Chrome for Android 88, Firefox 79, Safari 15.2. Android WebView: not supported. https://github.com/mdn/browser-compat-data/blob/main/webassembly/threads-and-atomics.json
- Shared `WebAssembly.Memory` is also unsupported in Android WebView. https://github.com/mdn/browser-compat-data/blob/main/webassembly/api/Memory.json
- **Assessment:** a portfolio link opened inside an Android app's in-app WebView will not get threads even when the headers are correct.
- A WebKit bug reports `WebAssembly.Memory` with `shared: true` failing with "Out of memory" at about 196 MB initial and 2 GB maximum from iOS 16.4. Status NEW, last changed 2024-05-09. https://bugs.webkit.org/show_bug.cgi?id=255103
- **Assessment:** on iOS, declare a small maximum for shared memory (tens of MB) and never rely on growth.

**Fallback without isolation**

- A transferred `ArrayBuffer` moves between threads with no copy. The sender's buffer is detached and unusable afterwards. https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
- MDN's own example branches on `crossOriginIsolated`: `SharedArrayBuffer` when true, plain `ArrayBuffer` when false. https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated
- `OffscreenCanvas` with WebGL works in workers in Chrome 69+, Firefox 105+, Safari 17+ (Safari 16.2 to 16.6 is 2D only). Global coverage 95.52%. https://caniuse.com/offscreencanvas
- **Assessment:** two workable fallbacks. (a) Simulation worker fills a render buffer and transfers it each frame; the main thread returns the previous buffer (two buffers ping-pong). (b) Run simulation and renderer in the same worker on an `OffscreenCanvas`, so nothing crosses a thread.

**Implication for the plan.** Single simulation worker with transferable buffers is the baseline and must hit the frame budget alone. Host on Cloudflare Pages (or Netlify/Vercel), scope the isolation headers to the game's path, and link to the game instead of embedding it in an iframe.

---

## 2. WebGPU versus WebGL2

**Short answer.** WebGPU reaches about 83 to 86% of users and is missing on Firefox for Android, Firefox on Linux and Intel Macs, older iOS, and part of Android. WebGL2 reaches about 96 to 98%. A public page still needs WebGL2. For one instanced draw of about 10k sprites plus bloom, I found no measured benefit from WebGPU. Its concrete advantage is compute shaders.

**Availability**

| Browser | WebGPU status | Source |
|---|---|---|
| Chrome/Edge desktop | 113 on Windows, macOS, ChromeOS. Linux from 144 on Intel Gen12+, NVIDIA on Wayland from 147, others behind a flag | https://github.com/gpuweb/gpuweb/wiki/Implementation-Status |
| Chrome for Android | 121, Android 12+ on ARM, Qualcomm, Intel GPUs. Imagination GPUs from 139 on Android 16+. Samsung Xclipse and others: TBD | https://github.com/gpuweb/gpuweb/wiki/Implementation-Status |
| Safari macOS/iOS/iPadOS | 26, only on OS version 26 or later | https://github.com/gpuweb/gpuweb/wiki/Implementation-Status |
| Firefox desktop | Windows from 141, Apple-silicon macOS from 145/147. No Intel Mac, no Linux | https://github.com/mdn/browser-compat-data/blob/main/api/GPU.json |
| Firefox for Android | Not supported (flag only) | https://github.com/mdn/browser-compat-data/blob/main/api/GPU.json |
| Samsung Internet | 24+ | https://caniuse.com/webgpu |

- caniuse global coverage: WebGPU 85.72% full plus 3.05% partial. WebGL2 96.44%. https://caniuse.com/webgpu and https://caniuse.com/webgl2
- Web3D Survey (live device reports, no sample date shown): a working WebGPU adapter on 83.26% of reports. Android 73.6%, iOS 85.43%, Linux 17.82%. https://web3dsurvey.com/webgpu
- Web3D Survey WebGL2: 97.75% overall, Android 99.16%, iOS 97.89%. https://web3dsurvey.com/webgl2

**What WebGPU buys**

- WebGPU has first-class compute pipelines. MDN states WebGL "does not handle general-purpose GPU (GPGPU) computations very well". https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- WebGL2 already draws all instances in a single call with `vertexAttribDivisor` and `drawArraysInstanced`. https://webgl2fundamentals.org/webgl/lessons/webgl-instanced-drawing.html
- PixiJS v8 documentation marks `WebGLRenderer` "Recommended" and `WebGPURenderer` "Experimental", and advises WebGL for production because of browser inconsistencies. It claims WebGPU is "more performant" without numbers. https://pixijs.com/8.x/guides/components/renderers
- **Assessment:** WebGPU's CPU-side savings scale with draw-call count. Tidepool's frame is a handful of instanced draws plus a few full-screen passes, so the saving is close to zero. WebGPU matters only if the neural nets or physics move to GPU compute, and that path would exclude 14 to 27% of users without a CPU path.

**Implication for the plan.** Write the renderer for WebGL2 only. Keep the simulation on the CPU. Do not plan a WebGPU renderer for the first release.

---

## 3. WASM capabilities

**Short answer.** Fixed-width SIMD is safe to require. Threads work everywhere except Android WebView but need isolation. memory64 and relaxed SIMD are not shipped in Safari, so do not use them. The Rust toolchain is `wasm-bindgen` (actively released under a new organisation) plus `wasm-opt`; `wasm-pack` survived the 2025 organisation shutdown. Rust threads on the web still need a pinned nightly. Share data with the renderer through typed-array views over WASM memory.

**Feature support**

| Feature | Chrome | Firefox | Safari (incl. iOS) | Source |
|---|---|---|---|---|
| Fixed-width SIMD | 91 | 89 | 16.4 | https://github.com/mdn/browser-compat-data/blob/main/webassembly/fixed-width-SIMD.json |
| Threads and atomics | 74 (Android 88) | 79 | 15.2 | https://github.com/mdn/browser-compat-data/blob/main/webassembly/threads-and-atomics.json |
| memory64 | 133 | 134 | Preview only | https://github.com/mdn/browser-compat-data/blob/main/webassembly/memory64.json |
| Relaxed SIMD | 114 | 146 | Preview only | https://github.com/mdn/browser-compat-data/blob/main/webassembly/relaxed-SIMD.json |
| `Memory.toResizableBuffer` | 144 | 145 | 26.2 | https://github.com/mdn/browser-compat-data/blob/main/webassembly/api/Memory.json |

- WASM SIMD global coverage 95.69%. https://caniuse.com/wasm-simd
- The SIMD instruction set includes `i16x8.q15mulr_sat_s` and `i32x4.dot_i16x8_s`, which are the building blocks for fixed-point dot products. https://github.com/WebAssembly/simd/blob/main/proposals/simd/SIMD.md

**Rust toolchain**

- The `rustwasm` GitHub organisation was sunset. The announcement (2025-07-21) said `wasm-bindgen` would move to a new organisation with new maintainers and other repositories would be archived unless existing maintainers took them. https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org
- `wasm-bindgen` now lives at `wasm-bindgen/wasm-bindgen`. Latest release 0.2.129 on 2026-09-25, last push 2026-10-09. https://github.com/wasm-bindgen/wasm-bindgen/releases
- `wasm-pack` now resolves to `wasm-bindgen/wasm-pack`. Latest release v0.15.0 on 2026-05-15, last push 2026-08-12. https://github.com/wasm-bindgen/wasm-pack/releases
- Binaryen (`wasm-opt`) latest release `version_133` on 2026-09-21. https://github.com/WebAssembly/binaryen/releases
- Trunk's latest tagged release is v0.21.14 from 2025-05-08, although the repository had a push on 2026-10-06. https://github.com/trunk-rs/trunk/releases
- Threads: `wasm-bindgen-rayon` states that WASM thread support in Rust is "still only available in nightly". It needs `-C target-feature=+atomics,+bulk-memory` and `-Z build-std=panic_abort,std`, and it recommends a pinned nightly (tested with `nightly-2025-11-15`). Last push 2025-11-21. https://github.com/RReverser/wasm-bindgen-rayon
- **Assessment:** maintenance risk is now low for `wasm-bindgen` and `wasm-pack`. The risk sits in the threaded build: nightly compiler, rebuilt standard library, and a helper crate with one maintainer. A single-threaded build uses stable Rust.

**JS/WASM boundary**

- After engine work in 2018, Firefox measured JS-to-WASM calls as faster than non-inlined JS-to-JS calls, and WASM-to-JS as almost as fast as JS-to-JS (about 450 ms per 100 million calls). Calls to non-math built-ins such as DOM methods still route through JS glue. https://hacks.mozilla.org/2018/10/calls-between-javascript-and-webassembly-are-finally-fast-%f0%9f%8e%89/
- `js_sys::Float32Array::view` returns a typed array over WASM linear memory without copying. It is `unsafe` because any later allocation that grows memory can invalidate the view. https://docs.rs/js-sys/latest/js_sys/struct.Float32Array.html
- WebGL2 `bufferSubData` accepts `[AllowShared] ArrayBufferView` with a source offset and length, so a view over WASM memory (shared or not) uploads directly. https://registry.khronos.org/webgl/specs/latest/2.0/webgl2.idl
- WebGPU `queue.writeBuffer` accepts `AllowSharedBufferSource`. https://gpuweb.github.io/gpuweb/webgpu.idl
- **Assessment:** the pattern is one call per frame into WASM, which writes a packed instance buffer at a fixed address; JS wraps that address in a `Float32Array` and hands it to `bufferSubData`. That is one copy, CPU to GPU, which no API avoids. Pre-size WASM memory so it never grows during play, or re-create the view after each call.

**Implication for the plan.** Require WASM SIMD, 32-bit memory, no relaxed SIMD. Build with stable Rust, `wasm-bindgen` CLI, and `wasm-opt`. Keep the JS/WASM interface to a few coarse calls and raw memory views. Treat a threaded build as a separate, later artefact.

---

## 4. Many small irregular neural nets, fast

**Short answer.** Two layouts are proven. SharpNEAT stores each network as parallel connection arrays (source index, target index, weight) sorted by source and loops over connections. TensorNEAT pads every network to a fixed maximum and evaluates the whole population as one tensor on a GPU. For 10 to 100 neurons and thousands of individuals on a CPU, the SharpNEAT layout packed into one population-wide arena is the fit. I found no published throughput figures for browser-scale artificial-life engines.

**What existing systems do**

- SharpNEAT's cyclic network: "Connections are ordered by source node index, thus all memory reads are sequential, but the memory writes to node pre-activation variables are non-sequential." It then applies the activation function over all nodes and runs a fixed number of cycles per activation. https://github.com/colgreen/sharpneat/blob/main/src/SharpNeat/NeuralNets/NeuralNetCyclic.cs
- SharpNEAT's vectorised variant gathers source signals with a scalar loop, multiplies by weights with `Vector<T>`, then scatters with a scalar loop. SIMD covers only the multiply. https://github.com/colgreen/sharpneat/blob/main/src/SharpNeat/NeuralNets/Vectorized/NeuralNetCyclic.cs
- TensorNEAT sets "predefined maximum limits for the number of nodes and connections" and pads each network's tensors with NaN so the population is one batched tensor. Its benchmark used `max_nodes: 50`, `max_conns: 100`, populations from 50 to 10,000, feedforward networks, on RTX 4090, RTX 3090, RTX 2080 Ti, and an EPYC 7543 CPU. It reports up to 500x over NEAT-Python. https://arxiv.org/html/2404.01817v1
- PyTorch-NEAT builds dense weight matrices per genome (`dense_from_coo`) and batches across environments for one genome, not across genomes. https://github.com/uber-research/PyTorch-NEAT/blob/master/pytorch_neat/recurrent_net.py
- ALIEN runs "entirely on the graphics card", simulates "millions of particles in real time", and "every cell runs a small neural network". It needs an NVIDIA RTX 20-series or newer, or AMD RDNA2 or newer. https://github.com/chrxh/alien
- biosim4's default configuration: population 3000, `maxNumberNeurons = 5`, `genomeMaxLength = 300`, 128x128 grid, 4 threads. No throughput figure is given. https://github.com/davidrmiller/biosim4/blob/main/biosim4.ini
- The Bibites devlogs describe performance work as spreading vision and pheromone computation across time and give no population or neuron numbers. https://thebibites.itch.io/the-bibites/devlog/495186/the-bibites-051-performance-usability-and-performances

**Assessment: layout for Tidepool**

- Size of the problem, from the brief's upper bounds: 5,000 creatures x 300 connections = 1.5 million multiply-adds per tick. At 1,000 ticks per second of time-skip that is 1.5 billion per second on one core. This is arithmetic, not a measurement; the separate benchmark must confirm it.
- One arena for the whole population: `conn_src: u16[]`, `conn_dst: u16[]`, `conn_w: f32[]` (or `i16`), with per-creature `(offset, count)`. Neuron state in a second arena, double-buffered (read previous, write next) so evaluation order cannot affect the result.
- Sort each creature's connections by destination, not source. Then each neuron's input sum is a contiguous run (this is CSR by row), the write is sequential, and reads land in that creature's 100-neuron state block, which fits in L1 either way. SharpNEAT sorts by source and accepts scattered writes; for nets this small the difference is likely minor. Measure both.
- Capacity caps per creature (for example 128 neurons, 512 connections) make slots fixed-size and removal O(1) at the cost of memory: 5,000 x 512 x 8 bytes = 20 MB. Size classes (for example 64/128/256/512 connections) cut that and give the bucketing by size the brief asks about. Reallocate a creature only at birth, since topology is fixed for life.
- SIMD across connections inside one net needs gather and scatter, which WASM SIMD lacks, so expect the result SharpNEAT got: only the multiply vectorises. SIMD across creatures needs identical topology, which the design rules out. Plan for scalar inner loops and get speed from layout.
- Fixed-point (`i16` weights, `i32` accumulators) halves memory traffic and is bit-exact everywhere. `f32` with only add, multiply, and a table or polynomial activation is also bit-exact in WASM (section 8). Choose on the benchmark.
- GPU batch evaluation is proven only with padding to a maximum on desktop-class GPUs (TensorNEAT, ALIEN). In the browser it would require WebGPU compute (section 2), and time-skip would add GPU read-backs. Not justified at this scale.
- Stagger brain updates (each creature thinks every Nth tick, offset by its id) as The Bibites does for vision. This divides the cost by N and stays deterministic if the schedule depends only on tick and id.

**Implication for the plan.** Flat arena with per-creature offset/count and size classes, destination-sorted connections, double-buffered activations, scalar loop. Make "connections evaluated per second on a mid-range phone" the first benchmark number.

---

## 5. Rendering thousands of procedurally varied creatures

**Short answer.** Draw every body part as one instanced quad with a signed-distance shape in the fragment shader: one draw call, a few bytes per part, sharp at any zoom, and per-individual variation is free. Its cost is fragment work and overdraw at close zoom on phones. Baking each genome to an atlas cell is cheaper per pixel but costs tens of MB and blurs when zoomed in. Use a level-of-detail switch: SDF parts when close, one dot per creature when far.

**Facts the choice rests on**

- WebGL2 instancing draws all instances in one call; per-instance attributes advance once per instance. https://webgl2fundamentals.org/webgl/lessons/webgl-instanced-drawing.html
- Exact 2D distance functions exist for circle, rounded box, segment, uneven capsule, ellipse, quadratic Bezier and more; `sdShape(p) - r` rounds a shape and `abs(sdShape(p)) - r` makes an outline. https://iquilezles.org/articles/distfunctions2d/
- `MAX_TEXTURE_SIZE` is at least 4096 on 100% of surveyed WebGL2 devices and at least 8192 on 75% of Android reports. https://web3dsurvey.com/webgl2/parameters/MAX_TEXTURE_SIZE
- `MAX_ARRAY_TEXTURE_LAYERS` is at least 256 on 100% of surveyed devices. https://web3dsurvey.com/webgl2/parameters/MAX_ARRAY_TEXTURE_LAYERS
- `EXT_color_buffer_float` makes `RGBA16F`, `R11F_G11F_B10F` and 32-bit float formats renderable in WebGL2. https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float
- `EXT_color_buffer_float` is present on 99.95% of surveyed WebGL2 devices (Android 99.86%, iOS 100%). https://web3dsurvey.com/webgl2/extensions/EXT_color_buffer_float
- `EXT_float_blend` (blending into 32-bit float targets) is present on only 51.13% of iOS reports. https://web3dsurvey.com/webgl2/extensions/EXT_float_blend
- Bloom from the Call of Duty: Advanced Warfare method: no brightness threshold, a progressive downsample chain with a 13-tap filter, then progressive upsample with a 3x3 tent filter and additive blending, about 5 mips in `R11F_G11F_B10F`. The article estimates an order of magnitude fewer lookups than one large kernel. https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom
- Caustics from one tiling texture: sample twice at different scale and scroll speed, combine with `min`, optionally offset the three colour channels. https://www.alanzucconi.com/2019/09/13/believable-caustics-reflections/

**Assessment: trade-offs**

| Technique | Draw calls | Memory | Close zoom | Whole-world zoom | Per-individual variation |
|---|---|---|---|---|---|
| Instanced SDF quads, one per part | 1 | 5,000 creatures x 8 parts x 32 B = 1.3 MB of instance data | Sharp at any scale | Wasteful: many parts cover under one pixel | Free; shape parameters are instance attributes |
| Bake genome to atlas cell at birth | 1 | 4096x4096 RGBA8 = 64 MB holds 4,096 cells of 64x64 | Blurry above cell resolution | Cheapest: one textured quad per creature | Free after a bake per birth; births per frame must be capped |
| Instanced meshes per part type | 1 per part type | Small | Sharp, hard edges, needs MSAA | Good | Limited to affine deformation of shared meshes |
| Skeletal animation | 1 or more | Bone data per creature | Good | Overkill | Costly rig per body plan |

- Wobble: do it in the shader. Displace quad corners or the SDF sample point with `sin(time * freq + phase)` where phase and frequency are instance attributes driven by the creature's speed. No per-frame CPU work and no skeleton.
- Level of detail: above a screen-size threshold draw parts as SDF quads; below it draw one small quad per creature with its dominant colour. This bounds fragment cost at both extremes.
- Translucency: premultiplied-alpha blending with no depth buffer, drawn in a stable order (by creature id or by depth layer) so nothing flickers. Sorting 5,000 keys per frame is cheap.
- Depth fog: give each instance a depth value and `mix()` its colour toward the water colour in the fragment shader. No extra pass.
- Caustics: one full-screen pass or a term in the background shader using the two-sample `min` method above. Two to six texture reads per pixel.
- Bloom on phones: render the scene to `RGBA16F` or `R11F_G11F_B10F` at reduced resolution, run 4 to 5 downsample and upsample steps starting at half resolution. Use 16-bit or 11-bit float targets, not 32-bit, because half of iOS devices cannot blend into 32-bit float. Provide an LDR fallback (RGBA8 with a threshold) and a quality switch that drops bloom entirely.
- Cap device pixel ratio (for example at 2) on phones. Fill rate, not instance count, is the limit on mobile GPUs. `UNCONFIRMED`: I did not fetch a vendor source for this in this session; it is standard guidance for tile-based mobile GPUs.

**Implication for the plan.** One instance buffer written by the simulation core, one SDF part shader, a two-level LOD, and a post chain of caustics plus a 5-mip bloom on half-float targets with a switch to turn it off. Skip atlas baking unless profiling on a phone shows fragment cost is the bottleneck.

---

## 6. Persistence

**Short answer.** Use the Origin Private File System from the simulation worker for the save file, with IndexedDB as the fallback. Both count against the same origin quota, which is far larger than a multi-megabyte save. The real risk is eviction: Safari deletes script-written storage after seven days of browser use without a visit to the site. Offer file export and import. Ship the starter world as a pre-compressed file and decode it as a stream.

**Storage APIs**

- OPFS is available in workers and on the main thread. `createSyncAccessHandle()` gives synchronous read and write and works only inside a worker. https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- `FileSystemSyncAccessHandle`: Chrome 102 (Android 109), Firefox 111, Safari 15.2. https://github.com/mdn/browser-compat-data/blob/main/api/FileSystemSyncAccessHandle.json
- The asynchronous `createWritable()` reached Safari only in version 26 (Chrome 86, Firefox 111). On older Safari the worker sync handle is the only way to write an OPFS file. https://github.com/mdn/browser-compat-data/blob/main/api/FileSystemFileHandle.json
- IndexedDB is available in workers and stores anything the structured clone algorithm supports, including blobs. https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- The user-visible File System Access API (save to a real file) is Chromium desktop only. https://caniuse.com/native-filesystem-api

**Quotas and eviction** (MDN page last modified 2026-01-05)

- Chrome: an origin can store up to 60% of total disk size. Firefox: the smaller of 10% of disk or 10 GiB in best-effort mode. Safari: about 60% of disk per origin in browser apps, 15% in apps that embed web content. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- The quota covers IndexedDB, Cache API, and OPFS together. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Under storage pressure browsers evict whole origins in least-recently-used order. Persistent origins are exempt. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Safari, with tracking prevention on, deletes an origin's script-created data if it has had no user interaction in the last seven days of browser use. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- The WebKit announcement lists IndexedDB, LocalStorage, and service worker registrations and cache as covered, and exempts web apps added to the home screen. https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- `navigator.storage.persist()`: Firefox prompts the user. Safari and Chromium decide silently from interaction history. WebKit grants it "based on heuristics like whether the website is opened as a Home Screen Web App". https://webkit.org/blog/14403/updates-to-storage-policy/
- `persist()` is available in Chrome 55, Firefox 57, Safari 15.2; `estimate()` in Safari from 17. https://github.com/mdn/browser-compat-data/blob/main/api/StorageManager.json

**Shipping a pre-evolved world**

- Cloudflare Pages caps a single asset at 25 MiB and a free site at 20,000 files. https://developers.cloudflare.com/pages/platform/limits/
- GitHub Pages caps a published site at 1 GB with a soft 100 GB per month bandwidth limit. https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- Cloudflare compresses responses by content type. The list includes `application/wasm` and JavaScript types and does not include `application/octet-stream`. https://developers.cloudflare.com/speed/optimization/content/compression/
- `DecompressionStream('gzip')`: Chrome 80, Firefox 113, Safari 16.4. The `brotli` format is in Firefox 147 and Safari 18.4 but not Chrome. `zstd` is not shipped anywhere by default. https://github.com/mdn/browser-compat-data/blob/main/api/DecompressionStream.json
- **Assessment:** a raw `.bin` snapshot will not be compressed by the host. Gzip it at build time and decode with `fetch(url).then(r => r.body.pipeThrough(new DecompressionStream('gzip')))`, feeding chunks to the loader in the worker. This behaves the same on every host.
- **Assessment:** size budget. From the brief's upper bounds, 5,000 creatures x (300 connections x 8 B + 100 neurons x 8 B) is about 16 MB of brain data before bodies and terrain. A shipped snapshot should target a few hundred creatures or quantised weights so it lands under about 2 MB compressed. Measure once the format exists.

**Implication for the plan.** One versioned binary save format used for the OPFS save, the IndexedDB fallback, the exported file, and the shipped snapshot. Save from the worker. Call `persist()` after the first user save. Add export and import in the first release because iOS saves are not durable for occasional visitors.

---

## 7. Audio

**Short answer.** Audio must be started from a tap. `AudioWorklet` is supported in every current browser. On iPhone the silent switch mutes Web Audio unless the page sets the audio session type to `playback`. Keep the voice count small and fixed, and aggregate simulation events before they reach the audio graph.

**Facts**

- An `AudioContext` created before a user gesture starts in the `suspended` state; call `resume()` from a gesture handler. https://developer.chrome.com/blog/autoplay/
- Firefox blocks Web Audio until the page has sticky activation (`media.autoplay.block-webaudio` defaults to true). Page last modified 2026-09-10. https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- `AudioWorklet`: Chrome 66, Firefox 76, Safari 14.1, mirrored on mobile. https://github.com/mdn/browser-compat-data/blob/main/api/AudioWorklet.json
- `process()` runs synchronously on the audio rendering thread once per block. Blocks are currently 128 frames, and code must read the actual array length because the size may change. https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process
- An uncaught exception in `process()` makes the node output silence for the rest of its life. https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process
- iOS: Web Audio is muted when the ringer switch is on silent because the default session type is `ambient`. A WebKit engineer's stated fix is `navigator.audioSession.type = "playback"`, available since iOS 17. https://bugs.webkit.org/show_bug.cgi?id=237322
- The Audio Session API exists only in Safari (16.4+ in compat data). Feature-detect it. https://github.com/mdn/browser-compat-data/blob/main/api/AudioSession.json
- Node costs: HRTF `PannerNode` and `ConvolverNode` are "very expensive". `BiquadFilterNode` is "relatively cheap". Equal-power panner and `StereoPannerNode` are cheap. `GainNode` is near free at a fixed gain. https://padenot.github.io/web-audio-perf/
- Each `AudioParam` automation call inserts an event; engines other than Gecko scan the event list linearly, so long lists become costly. Setting `.value` directly takes the fast path. https://padenot.github.io/web-audio-perf/
- Output latency ranges from a few ms on macOS and iOS to 12.5 to 150 ms on Android devices. https://padenot.github.io/web-audio-perf/
- Posting a `SharedArrayBuffer` to another thread requires cross-origin isolation, so a lock-free ring buffer between the simulation and an `AudioWorklet` depends on section 1. https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated

**Assessment: pitfalls with many event-driven voices**

- Creating an oscillator, gain, and envelope per simulation event produces thousands of short-lived nodes and automation events per second and garbage on the main thread. Use a fixed pool (8 to 16 voices) or one `AudioWorklet` synthesiser with a fixed voice array.
- Reduce events in the simulation worker to a small per-frame summary (counts and average position per event type), post that at most once per frame, and let the audio side decide what to play.
- Skip audio output during time-skip.
- No allocation inside `process()`. Preallocate all buffers.
- Do not use HRTF panning or convolution reverb on phones. Use `StereoPannerNode` and a feedback-delay reverb.
- Handle `visibilitychange` and context `statechange` to suspend and resume, since mobile browsers interrupt audio when the tab is backgrounded.

**Implication for the plan.** A "tap to begin" gate that creates and resumes the context and sets the iOS session type. One summary message per frame from the simulation. A fixed voice pool built from native nodes first; move to an `AudioWorklet` synthesiser only if the native graph is too limiting.

---

## 8. Deterministic floating point

**Short answer.** Yes in WASM, with conditions. No in JavaScript if any transcendental `Math` function is used. WASM arithmetic is specified exactly except for NaN bit patterns, and Rust on `wasm32-unknown-unknown` compiles its own `sin`, `exp`, and `tanh` into the module, so those match everywhere too. Avoid threads in the deterministic path, avoid relaxed SIMD, never let NaN bits reach state, and fix iteration order.

**Facts**

- The WebAssembly design document lists the only sources of nondeterminism: NaN bit patterns and NaN sign, shared-memory thread interleaving, relaxed SIMD, resource exhaustion, and host-supplied values. https://github.com/WebAssembly/design/blob/main/Nondeterminism.md
- Relaxed SIMD "introduces non-deterministic instructions"; its `madd` may or may not fuse. Baseline WASM has no fused multiply-add instruction. https://github.com/WebAssembly/relaxed-simd/blob/main/proposals/relaxed-simd/Overview.md
- ECMAScript specifies `Math.sin`, `Math.cos`, `Math.exp`, `Math.pow` and similar as returning "an implementation-approximated Number value". It recommends fdlibm but does not require it. https://tc39.es/ecma262/multipage/numbers-and-dates.html
- ECMAScript specifies `Math.sqrt` and `Math.fround` exactly (IEEE 754 square root; round to binary32 with ties to even). https://tc39.es/ecma262/multipage/numbers-and-dates.html
- Rust guarantees `+ - * /` round per IEEE 754 and that `sqrt` and `mul_add` are exactly rounded. It documents `sin`, `powf` and other transcendentals as having precision that "varies by platform, Rust version". It does not guarantee NaN bit patterns. https://doc.rust-lang.org/std/primitive.f32.html
- For WASM without a known target OS, Rust's `compiler-builtins` supplies `sinf`, `cosf`, `expf`, `powf`, `tanhf` from the pure-Rust `libm` crate. https://github.com/rust-lang/compiler-builtins/blob/main/compiler-builtins/src/math/mod.rs
- Rapier documents its WASM build as "fully cross-platform deterministic" given the same version, the same initial state, and the same insertion order, and warns that inputs computed with `Math.sin` or `Math.cos` in JS may differ across platforms. It verifies by hashing a world snapshot. https://rapier.rs/docs/user_guides/javascript/determinism

**Assessment**

- A given `.wasm` binary gives identical results across browsers and devices if it is single-threaded, uses no relaxed SIMD, and takes every input (seed, tick count, player actions) from recorded data. The transcendental functions are ordinary WASM code inside the module, so they inherit the guarantee. A different compiler version or `libm` version can change results, so determinism is per build. Stamp saves with a build id.
- Fixed-width SIMD is deterministic apart from NaN bits. Sanitise or forbid NaN: clamp neuron outputs, and never hash or serialise raw float bits that could be NaN.
- In TypeScript, bit-exact results are possible only by restricting to `+ - * /`, `Math.sqrt`, `Math.fround`, `Math.abs`, `Math.floor` and integer operations, and writing your own `tanh` and `sin` from those. JS has no fused multiply-add, so there is no contraction risk.
- Multithreading breaks determinism unless work is partitioned so that results do not depend on scheduling (fixed chunks, no shared accumulators, results merged in index order).
- Iteration order matters as much as arithmetic. Entity storage must be index-ordered and identical after load. Use one seeded integer PRNG stored in the save. Never read `Math.random` or the clock in the simulation.
- What people do in practice: (a) WASM plus a bundled math library (Rapier). (b) Fixed-point integers for anything that feeds back into state. (c) Save full state, not inputs, so exact replay is not needed for load; a per-N-ticks state hash detects divergence in tests.

**Implication for the plan.** Saving the whole world means determinism is not required for save and load. It is still needed for reproducible bugs, seeded shared worlds, and the benchmark. If the core is Rust/WASM, it comes almost free: single-threaded reference path, no relaxed SIMD, seeded PRNG, a state-hash test run in CI across Chromium, Firefox, and WebKit. If the core is TypeScript, add a hand-written activation function and ban transcendental `Math` calls in the simulation by lint rule.

---

## Recommendations

| Area | Default |
|---|---|
| Hosting | Cloudflare Pages, with COOP `same-origin` and COEP `require-corp` in `_headers`, scoped to the game path. Serve all assets same-origin. Link to the game; do not iframe it. |
| Threading | One simulation worker, no shared memory, transferable buffers. Must meet the frame and time-skip budgets alone. Threads are a later optional build gated on `crossOriginIsolated`. Do not adopt `coi-serviceworker`. |
| Graphics API | WebGL2 only. No WebGPU renderer and no GPU compute in the first release. |
| WASM baseline | 32-bit memory, fixed-width SIMD required, no relaxed SIMD, no memory64. Memory pre-sized, no growth during play. |
| Rust toolchain (if Rust wins) | Stable Rust, `wasm32-unknown-unknown`, `wasm-bindgen` CLI pinned to an exact version, `wasm-opt`. A handful of coarse exports and raw memory views. |
| Neural nets | Population-wide flat arena, per-creature offset and count, size classes, destination-sorted connections, double-buffered activations, scalar loop. Decide `f32` or `i16` fixed-point on the benchmark. Stagger brain updates by creature id. |
| Rendering | One instanced SDF-part shader, two-level LOD, premultiplied alpha, fog in the fragment shader, two-sample caustic texture, 5-mip bloom on `RGBA16F` or `R11F_G11F_B10F` at reduced resolution with an off switch. DPR capped at 2. |
| Persistence | One versioned binary format. OPFS sync handle in the worker, IndexedDB fallback, `persist()` after first save, export and import to a file. Starter world gzipped at build time, streamed through `DecompressionStream('gzip')`, target under 2 MB. |
| Audio | Tap-to-start gate, `navigator.audioSession.type = "playback"` when present, fixed pool of 8 to 16 voices, one summary message per frame, silent during time-skip. |
| Determinism | Single-threaded reference path, seeded integer PRNG in the save, build id in the save, state-hash test across three engines in CI. |

## Could not confirm

- **Rust WASM threads on stable in 2026.** The only source is the `wasm-bindgen-rayon` README (pinned to `nightly-2025-11-15`, last push 2025-11-21). I did not check Rust release notes from 2026. Looked at: https://github.com/RReverser/wasm-bindgen-rayon, web search.
- **iOS shared-memory size limits on iOS 26 and 27.** WebKit bug 255103 is open but its last activity is 2024-05. No newer statement found. Looked at: bugs.webkit.org (255103, 269937, 222097), web search.
- **`coi-serviceworker` behaviour on current Safari, Firefox, and Chrome.** Not tested. Evidence is user reports in the GitHub discussion up to 2025-08.
- **WebGPU versus WebGL2 speed for instanced 2D sprites.** No measured comparison found. PixiJS claims WebGPU is "more performant" without numbers. Looked at: pixijs.com blog and renderer guide, web search.
- **The Bibites population and neuron counts, and whether it uses Unity DOTS/Burst.** No figures in the devlogs I read. Looked at: thebibites.itch.io devlogs for 0.5.1, search results for 0.6.x.
- **SharpNEAT throughput numbers.** Benchmark source files exist in the repository but I found no published results. Looked at: https://github.com/colgreen/sharpneat.
- **TensorNEAT per-hardware timings.** The paper's table values did not survive text extraction; only "up to 500x" and the configuration are confirmed. Looked at: https://arxiv.org/html/2404.01817v1.
- **Which browsers' `Math.sin` agree in practice.** The specification permits differences; I did not verify which engines use fdlibm today.
- **Mobile fill-rate guidance and DPR cap.** Standard practice, no vendor source fetched this session.
- **Whether 16-bit and 11-bit float render targets blend on every iOS device without `EXT_float_blend`.** The extension text covers only 32-bit float; I did not find a device-level confirmation. Test on a real iPhone. Looked at: MDN `EXT_float_blend`, `EXT_color_buffer_float`, web3dsurvey.
- **Web3D Survey sample dates and sizes.** The pages show percentages without a date or count.
- **`Document-Isolation-Policy` on Chrome for Android in 2026.** The May 2025 post called it planned. Not re-checked.
- **Free-tier bandwidth limits for Cloudflare Pages, Netlify, and Vercel.** The Cloudflare limits page gives none; the others were not checked.
- **Safari's exact heuristics for granting `persist()` in a normal tab.** WebKit names only the Home Screen case.
- **GitHub Pages and Netlify compression behaviour for binary files.** Only Cloudflare's content-type list was checked.
- **The 1.5 billion multiply-adds per second estimate and the 16 MB save estimate.** Both are arithmetic from the brief's upper bounds, not measurements.
