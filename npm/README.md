# float-tetwild-wasm

WebAssembly build of [fTetWild](https://github.com/loumalouomega/fTetWild) (Fast Tetrahedral
Meshing in the Wild) for Node.js and the browser.

Two builds are bundled:

- **threaded** — uses `pthread`s for parallelism. In a browser this requires the page to be
  [cross-origin isolated](https://developer.mozilla.org/en-US/docs/Web/API/crossOriginIsolated)
  (COOP/COEP response headers) so `SharedArrayBuffer` is available. Always used in Node.js.
- **serial** — single-threaded, runs everywhere with no special headers required.

`loadFloatTetwild()` picks the right one automatically, or you can force a choice.

TypeScript declarations are included (`index.d.ts`) — no separate `@types` package needed.

## Install

```bash
npm install float-tetwild-wasm
```

## Usage

```js
import { loadFloatTetwild } from "float-tetwild-wasm";

const ft = await loadFloatTetwild();

// A surface mesh as a flat (x, y, z, ...) vertex array and flat 0-based
// triangle indices. Typed arrays avoid an extra copy on the way in.
const vertices = new Float64Array([ /* ... */ ]);
const faces = new Int32Array([ /* ... */ ]);

const { status, vertices: outVertices, tets } = ft.tetrahedralizeTyped(vertices, faces, {
    epsRel: 1e-3,              // envelope size, as a fraction of the bbox diagonal
    idealEdgeLengthRel: 0.05,  // target edge length, as a fraction of the bbox diagonal
    stopEnergy: 10,            // stop once max AMIPS energy is below this
    maxIts: 80,                // max optimization iterations
    disableFiltering: false,   // true = skip interior/exterior filtering, return the raw mesh
    coarsen: false,            // coarsen the output mesh after optimization
    manifoldSurface: false,    // force the output boundary to be manifold
    numThreads: 0,             // max TBB threads (threaded build only); 0 = library default
});

if (status !== 0) {
    throw new Error("tetrahedralization failed");
}

// outVertices: Float64Array, flat (x, y, z, ...).
// tets: Uint32Array, flat groups of 4 vertex indices per tetrahedron.
console.log(`${outVertices.length / 3} vertices, ${tets.length / 4} tets`);
```

`tetrahedralize()` (plain `number[]` in/out, same call shape as v0.1.0) is still available and
still the default for existing callers — `tetrahedralizeTyped()` is the same computation with a
zero-copy typed-array in/out path, worth switching to for meshes above a few thousand triangles:

```js
const { status, vertices, tets } = ft.tetrahedralize(vertexArray, faceArray, params);
```

To force a specific build:

```js
const ft = await loadFloatTetwild({ threads: false }); // always use the serial build
```

### Tet winding

`tets` uses the standard **positive-signed-volume** convention — the same one MSH tet4,
`VTK_TETRA`, and gmsh expect. For a tet `[a, b, c, d]` (indices into `vertices`),
`(b - a) × (c - a) · (d - a) > 0`. No index reordering is needed before handing the output to
those tools.

## License

Mozilla Public License 2.0, same as fTetWild itself.

## Changes in 0.2.0

- **Fixed tet winding** (previously every returned tet had negative signed volume — a silent
  correctness bug; see [Tet winding](#tet-winding) above). This changes the numeric output of
  `tetrahedralize()`/`tetrahedralizeTyped()` for existing callers, but the array shapes and call
  signatures are unchanged.
- Added `tetrahedralizeTyped()`: a zero-copy typed-array in/out path. On an ~82k-triangle mesh,
  input marshaling measured ~49x faster and output unmarshaling ~9x faster than the old
  per-element embind-vector approach (`Float64Array`/`Int32Array` in, `Float64Array`/`Uint32Array`
  out). `tetrahedralize()` now uses this path internally too, so the plain-array API also got
  faster, on top of keeping its existing `number[]` return shape.
- Exposed `disableFiltering`, `coarsen`, `manifoldSurface`, and `numThreads` as new optional
  `params` fields.
- `tetrahedralize()`/`tetrahedralizeTyped()` no longer write to stdout/stderr by default (previously
  ~1KB+ per call regardless of any option, growing with mesh size and optimization passes).
- Under Node, the threaded build's stdout/stderr now route through `console.log`/`console.error`
  by default, matching the serial build (previously it used a lower-level `fs.writeSync` path).
- Added `index.d.ts` TypeScript declarations.

No breaking changes to the public call shape: `loadFloatTetwild(options)` →
`{ Module, threaded, tetrahedralize(vertices, faces, params) }` still works exactly as before for
callers that don't touch the new options — only the corrected winding changes existing callers'
numeric output.
