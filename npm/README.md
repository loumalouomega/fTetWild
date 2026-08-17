# float-tetwild-wasm

WebAssembly build of [fTetWild](https://github.com/loumalouomega/fTetWild) (Fast Tetrahedral
Meshing in the Wild) for Node.js and the browser.

Two builds are bundled:

- **threaded** — uses `pthread`s for parallelism. In a browser this requires the page to be
  [cross-origin isolated](https://developer.mozilla.org/en-US/docs/Web/API/crossOriginIsolated)
  (COOP/COEP response headers) so `SharedArrayBuffer` is available. Always used in Node.js.
- **serial** — single-threaded, runs everywhere with no special headers required.

`loadFloatTetwild()` picks the right one automatically, or you can force a choice.

## Install

```bash
npm install float-tetwild-wasm
```

## Usage

```js
import { loadFloatTetwild } from "float-tetwild-wasm";

const ft = await loadFloatTetwild();

// A surface mesh as a flat (x, y, z, ...) vertex array and flat 0-based
// triangle indices.
const vertices = [ /* ... */ ];
const faces = [ /* ... */ ];

const { status, vertices: outVertices, tets } = ft.tetrahedralize(vertices, faces, {
    epsRel: 1e-3,             // envelope size, as a fraction of the bbox diagonal
    idealEdgeLengthRel: 0.05, // target edge length, as a fraction of the bbox diagonal
    stopEnergy: 10,           // stop once max AMIPS energy is below this
    maxIts: 80,               // max optimization iterations
});

if (status !== 0) {
    throw new Error("tetrahedralization failed");
}

// outVertices: flat (x, y, z, ...); tets: flat groups of 4 vertex indices.
console.log(`${outVertices.length / 3} vertices, ${tets.length / 4} tets`);
```

To force a specific build:

```js
const ft = await loadFloatTetwild({ threads: false }); // always use the serial build
```

## License

Mozilla Public License 2.0, same as fTetWild itself.
