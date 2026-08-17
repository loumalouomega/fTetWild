// Runtime loader for the fTetWild WebAssembly module.
//
// Two builds are shipped: a multithreaded one (needs SharedArrayBuffer, which
// in a browser requires the page to be cross-origin isolated via COOP/COEP
// response headers) and a single-threaded one that runs everywhere else,
// including plain Node.js and browser tabs without those headers.

function threadsSupported() {
    if (typeof process !== "undefined" && process.versions?.node) {
        // Node.js supports worker_threads/SharedArrayBuffer unconditionally.
        return true;
    }
    return typeof SharedArrayBuffer !== "undefined" && globalThis.crossOriginIsolated === true;
}

function vectorToArray(vec) {
    const arr = new Array(vec.size());
    for (let i = 0; i < arr.length; i++) arr[i] = vec.get(i);
    return arr;
}

/**
 * Loads the fTetWild wasm module.
 *
 * @param {object} [options]
 * @param {boolean} [options.threads] Force the threaded (true) or serial
 *   (false) build. Defaults to auto-detection.
 * @param {object} [options.moduleArgs] Forwarded to the Emscripten module
 *   factory (e.g. `{ locateFile }` to customize where the .wasm is fetched
 *   from in the browser).
 */
export async function loadFloatTetwild(options = {}) {
    const useThreads = options.threads ?? threadsSupported();

    const createModule = useThreads
        ? (await import("./dist/floattetwild.threaded.mjs")).default
        : (await import("./dist/floattetwild.serial.mjs")).default;

    const Module = await createModule(options.moduleArgs);

    return {
        Module,
        threaded: useThreads,

        /**
         * @param {number[]|Float64Array} vertices Flat (x, y, z, ...) surface vertex positions.
         * @param {number[]|Int32Array} faces Flat 0-based triangle indices.
         * @param {object} [params]
         * @param {number} [params.epsRel=1e-3] Envelope size, as a fraction of the bbox diagonal.
         * @param {number} [params.idealEdgeLengthRel=0.05] Target edge length, as a fraction of the bbox diagonal.
         * @param {number} [params.stopEnergy=10] Stop optimizing once max AMIPS energy is below this.
         * @param {number} [params.maxIts=80] Max optimization iterations.
         * @returns {{status: number, vertices: number[], tets: number[]}} `vertices` is
         *   flat (x, y, z, ...); `tets` is flat groups of 4 vertex indices.
         */
        tetrahedralize(vertices, faces, params = {}) {
            const {
                epsRel = 1e-3,
                idealEdgeLengthRel = 0.05,
                stopEnergy = 10,
                maxIts = 80,
            } = params;

            const vVec = new Module.VectorDouble();
            for (const v of vertices) vVec.push_back(v);
            const fVec = new Module.VectorInt();
            for (const f of faces) fVec.push_back(f);

            const result = Module.tetrahedralize(vVec, fVec, epsRel, idealEdgeLengthRel, stopEnergy, maxIts);
            vVec.delete();
            fVec.delete();

            const out = {
                status: result.status,
                vertices: vectorToArray(result.vertices),
                tets: vectorToArray(result.tets),
            };
            result.vertices.delete();
            result.tets.delete();

            return out;
        },
    };
}

export default loadFloatTetwild;
