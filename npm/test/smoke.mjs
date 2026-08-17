// Smoke test: tetrahedralize a unit cube with both the serial and threaded
// builds and check that a non-empty, successful mesh comes back. Run after
// `dist/` has been populated by the build (see .github/workflows/wasm.yml).
import { loadFloatTetwild } from "../index.js";

const cubeVertices = [
    0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0,
    0, 0, 1,  1, 0, 1,  1, 1, 1,  0, 1, 1,
];
const cubeFaces = [
    0, 2, 1,  0, 3, 2,
    4, 5, 6,  4, 6, 7,
    0, 1, 5,  0, 5, 4,
    1, 2, 6,  1, 6, 5,
    2, 3, 7,  2, 7, 6,
    3, 0, 4,  3, 4, 7,
];

async function run(threads) {
    const label = threads ? "threaded" : "serial";
    console.log(`--- ${label} ---`);

    const ft = await loadFloatTetwild({ threads });
    const { status, vertices, tets } = ft.tetrahedralize(cubeVertices, cubeFaces, {
        idealEdgeLengthRel: 0.25,
    });

    console.log(`${label}: status=${status} vertices=${vertices.length / 3} tets=${tets.length / 4}`);

    if (status !== 0 || tets.length === 0) {
        throw new Error(`${label} smoke test failed`);
    }
}

await run(false);
await run(true);

console.log("SMOKE TEST PASSED");
process.exit(0);
