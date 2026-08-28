// Smoke test: tetrahedralize a unit cube with both the serial and threaded
// builds and check that a non-empty, successful mesh comes back, with the
// correct (positive-signed-volume) tet winding, using both the plain-array
// and typed-array entry points, plus the newly-exposed params. Run after
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

// signed volume of (b-a)x(c-a).(d-a); MSH tet4 / VTK_TETRA / gmsh all expect
// this to be positive for a correctly-oriented tet.
function signedVolume(vertices, tets, i) {
    const v = (k) => vertices.slice(3 * tets[4 * i + k], 3 * tets[4 * i + k] + 3);
    const [a, b, c, d] = [v(0), v(1), v(2), v(3)];
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    const cross = (p, q) => [
        p[1] * q[2] - p[2] * q[1],
        p[2] * q[0] - p[0] * q[2],
        p[0] * q[1] - p[1] * q[0],
    ];
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const [ab, ac, ad] = [sub(b, a), sub(c, a), sub(d, a)];
    return dot(cross(ab, ac), ad);
}

function assertPositiveWinding(label, vertices, tets) {
    const nTets = tets.length / 4;
    let negative = 0;
    for (let i = 0; i < nTets; i++) {
        if (signedVolume(vertices, tets, i) < 0) negative++;
    }
    if (negative !== 0) {
        throw new Error(`${label}: ${negative}/${nTets} tets have negative signed volume (expected 0)`);
    }
}

async function run(threads) {
    const label = threads ? "threaded" : "serial";
    console.log(`--- ${label} ---`);

    const ft = await loadFloatTetwild({ threads });

    // Plain-array API (v0.1.0-compatible call shape).
    const { status, vertices, tets } = ft.tetrahedralize(cubeVertices, cubeFaces, {
        idealEdgeLengthRel: 0.25,
    });
    console.log(`${label}: status=${status} vertices=${vertices.length / 3} tets=${tets.length / 4}`);
    if (status !== 0 || tets.length === 0) {
        throw new Error(`${label} smoke test failed`);
    }
    if (!Array.isArray(vertices) || !Array.isArray(tets)) {
        throw new Error(`${label}: tetrahedralize() must keep returning plain arrays`);
    }
    assertPositiveWinding(`${label} (plain array)`, vertices, tets);

    // Typed-array API, same input as typed arrays this time.
    const typedResult = ft.tetrahedralizeTyped(
        Float64Array.from(cubeVertices),
        Int32Array.from(cubeFaces),
        { idealEdgeLengthRel: 0.25 }
    );
    if (!(typedResult.vertices instanceof Float64Array) || !(typedResult.tets instanceof Uint32Array)) {
        throw new Error(`${label}: tetrahedralizeTyped() must return typed arrays`);
    }
    if (typedResult.status !== 0 || typedResult.tets.length === 0) {
        throw new Error(`${label} typed smoke test failed`);
    }
    assertPositiveWinding(`${label} (typed array)`, typedResult.vertices, typedResult.tets);

    // disableFiltering: true should skip winding-number filtering, so the
    // raw tetrahedralization should never have *fewer* tets than the
    // filtered default on the same input.
    const filtered = ft.tetrahedralizeTyped(cubeVertices, cubeFaces, { idealEdgeLengthRel: 0.25 });
    const unfiltered = ft.tetrahedralizeTyped(cubeVertices, cubeFaces, {
        idealEdgeLengthRel: 0.25,
        disableFiltering: true,
    });
    if (unfiltered.status !== 0 || unfiltered.tets.length < filtered.tets.length) {
        throw new Error(
            `${label}: disableFiltering=true produced fewer tets (${unfiltered.tets.length / 4}) ` +
            `than the filtered default (${filtered.tets.length / 4})`
        );
    }

    // coarsen / manifoldSurface: just check they run to completion.
    const coarsened = ft.tetrahedralizeTyped(cubeVertices, cubeFaces, {
        idealEdgeLengthRel: 0.25,
        coarsen: true,
    });
    if (coarsened.status !== 0) throw new Error(`${label}: coarsen=true failed`);

    const manifold = ft.tetrahedralizeTyped(cubeVertices, cubeFaces, {
        idealEdgeLengthRel: 0.25,
        manifoldSurface: true,
    });
    if (manifold.status !== 0) throw new Error(`${label}: manifoldSurface=true failed`);
}

await run(false);
await run(true);

console.log("SMOKE TEST PASSED");
process.exit(0);
