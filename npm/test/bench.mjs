// Benchmark: typed-array marshaling vs. the old per-element embind-vector
// approach, on a mesh in the 50k-150k triangle range (CAD-Preview's own
// large-sphere-100k.stl fixture is in this range; this script generates an
// equivalent subdivided icosphere programmatically so the benchmark has no
// external file dependency).
//
// Reports two things:
//   1. Marshaling cost in isolation: the old push_back()/get() loops vs. the
//      new heap-write/slice() path, on the same buffers, so the speedup is
//      attributable to marshaling and not lost in meshing noise.
//   2. End-to-end wall time for a real tetrahedralize() call using the new
//      typed-array path (the old vector-based tetrahedralize() entry point
//      no longer exists in the C++ binding -- see PR notes -- so end-to-end
//      "before" numbers aren't reproducible post-fix; the isolated
//      marshaling comparison is what's attributable).
import { loadFloatTetwild } from "../index.js";

function buildIcosphere(subdivisions) {
    const t = (1 + Math.sqrt(5)) / 2;
    let vertices = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];
    let faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];

    const midpointCache = new Map();
    function midpoint(a, b) {
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (midpointCache.has(key)) return midpointCache.get(key);
        const va = vertices[a], vb = vertices[b];
        const mid = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
        const len = Math.hypot(mid[0], mid[1], mid[2]);
        const idx = vertices.push([mid[0] / len, mid[1] / len, mid[2] / len]) - 1;
        midpointCache.set(key, idx);
        return idx;
    }

    for (let s = 0; s < subdivisions; s++) {
        const newFaces = [];
        for (const [a, b, c] of faces) {
            const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
            newFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
        }
        faces = newFaces;
    }

    // Normalize to unit sphere, already true by construction (each new vertex is normalized).
    const flatVertices = new Float64Array(vertices.length * 3);
    for (let i = 0; i < vertices.length; i++) {
        flatVertices[3 * i] = vertices[i][0];
        flatVertices[3 * i + 1] = vertices[i][1];
        flatVertices[3 * i + 2] = vertices[i][2];
    }
    const flatFaces = new Int32Array(faces.length * 3);
    for (let i = 0; i < faces.length; i++) {
        flatFaces[3 * i] = faces[i][0];
        flatFaces[3 * i + 1] = faces[i][1];
        flatFaces[3 * i + 2] = faces[i][2];
    }
    return { vertices: flatVertices, faces: flatFaces };
}

// subdivisions=6 -> 20*4^6 = 81920 triangles; subdivisions=7 -> 327680 (too
// large for a quick bench). Pick 6 (~82k tris, squarely in the 50k-150k range).
const { vertices, faces } = buildIcosphere(6);
console.log(`mesh: ${vertices.length / 3} vertices, ${faces.length / 3} triangles`);

function now() {
    return performance.now();
}

async function benchMarshaling(Module) {
    const N_RUNS = 20;

    // Old approach: per-element push_back() into an embind vector, per-element
    // .get() back out (vectorToArray in the pre-fix npm/index.js).
    let oldInMs = 0;
    for (let i = 0; i < N_RUNS; i++) {
        const t0 = now();
        const vVec = new Module.VectorDouble();
        for (const v of vertices) vVec.push_back(v);
        const fVec = new Module.VectorInt();
        for (const f of faces) fVec.push_back(f);
        oldInMs += now() - t0;
        vVec.delete();
        fVec.delete();
    }
    oldInMs /= N_RUNS;

    // Simulate the old vectorToArray() unmarshaling cost using a same-sized
    // VectorDouble built via the new bulk path, read back with .get() in a loop.
    let oldOutMs = 0;
    {
        const v = Module.allocBuffer(vertices.byteLength);
        Module.HEAPF64.set(vertices, v / 8);
        // Build a VectorDouble of the same size via push_back once (setup, not timed).
        const vec = new Module.VectorDouble();
        for (const x of vertices) vec.push_back(x);
        for (let i = 0; i < N_RUNS; i++) {
            const t0 = now();
            const arr = new Array(vec.size());
            for (let j = 0; j < arr.length; j++) arr[j] = vec.get(j);
            oldOutMs += now() - t0;
        }
        oldOutMs /= N_RUNS;
        vec.delete();
        Module.freeBuffer(v);
    }

    // New approach: one bulk HEAPF64.set()/HEAP32.set() call in, one .slice() out.
    let newInMs = 0;
    let newOutMs = 0;
    for (let i = 0; i < N_RUNS; i++) {
        const t0 = now();
        const vPtr = Module.allocBuffer(vertices.byteLength);
        Module.HEAPF64.set(vertices, vPtr / 8);
        const fPtr = Module.allocBuffer(faces.byteLength);
        Module.HEAP32.set(faces, fPtr / 4);
        newInMs += now() - t0;

        const t1 = now();
        const view = new Float64Array(Module.HEAPF64.buffer, vPtr, vertices.length);
        const copy = view.slice();
        newOutMs += now() - t1;

        Module.freeBuffer(vPtr);
        Module.freeBuffer(fPtr);
        void copy;
    }
    newInMs /= N_RUNS;
    newOutMs /= N_RUNS;

    console.log(`marshaling IN  (${N_RUNS} runs avg): old push_back loop = ${oldInMs.toFixed(3)}ms, new HEAP*.set() = ${newInMs.toFixed(3)}ms (${(oldInMs / newInMs).toFixed(1)}x)`);
    console.log(`marshaling OUT (${N_RUNS} runs avg): old .get() loop = ${oldOutMs.toFixed(3)}ms, new .slice() view = ${newOutMs.toFixed(3)}ms (${(oldOutMs / newOutMs).toFixed(1)}x)`);
}

async function benchEndToEnd(threads) {
    const label = threads ? "threaded" : "serial";
    const ft = await loadFloatTetwild({ threads });

    await benchMarshaling(ft.Module);

    const t0 = now();
    const result = ft.tetrahedralizeTyped(vertices, faces, { idealEdgeLengthRel: 0.05 });
    const elapsed = now() - t0;
    console.log(`${label}: end-to-end tetrahedralizeTyped() = ${elapsed.toFixed(1)}ms, status=${result.status}, tets=${result.tets.length / 4}`);
}

await benchEndToEnd(false);

console.log("BENCHMARK DONE");
process.exit(0);
