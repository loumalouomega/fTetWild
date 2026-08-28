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

// Copies `data` into the WASM heap in one bulk operation (Module.HEAP*.set())
// rather than one push_back()/element the way the v0.1.0 embind-vector path
// worked, and returns the {ptr, length, free} needed to pass it to the
// tetrahedralize() binding and release it afterwards.
//
// `data` is coerced to `Ctor` first if it isn't already an instance of it
// (covers plain number[] input, or a differently-typed typed array) -- this
// coercion is itself one bulk copy, not a per-element JS loop.
function writeToHeap(Module, data, Ctor, heapName) {
    const typed = data instanceof Ctor ? data : new Ctor(data);
    const bytesPerElement = Ctor.BYTES_PER_ELEMENT;
    const ptr = Module.allocBuffer(typed.byteLength);
    // Re-read Module[heapName] *after* allocBuffer(): ALLOW_MEMORY_GROWTH=1
    // means a growing heap detaches and replaces these views, so a cached
    // reference taken before this allocation could already be stale.
    Module[heapName].set(typed, ptr / bytesPerElement);
    return { ptr, length: typed.length, free: () => Module.freeBuffer(ptr) };
}

function buildTetParams(params) {
    const {
        epsRel = 1e-3,
        idealEdgeLengthRel = 0.05,
        stopEnergy = 10,
        maxIts = 80,
        disableFiltering = false,
        coarsen = false,
        manifoldSurface = false,
        numThreads = 0,
    } = params;
    // embind's value_object conversion requires every registered TetParams
    // field to be present on the object handed to it, so this is always a
    // fully populated plain object -- never the caller's `params` forwarded
    // as-is (which may be missing fields, or have extras that are ignored).
    return {
        epsRel,
        idealEdgeLengthRel,
        stopEnergy,
        maxIts,
        disableFiltering,
        coarsen,
        manifoldSurface,
        numThreads,
    };
}

/**
 * Loads the fTetWild wasm module.
 *
 * @param {object} [options]
 * @param {boolean} [options.threads] Force the threaded (true) or serial
 *   (false) build. Defaults to auto-detection.
 * @param {object} [options.moduleArgs] Forwarded to the Emscripten module
 *   factory (e.g. `{ locateFile }` to customize where the .wasm is fetched
 *   from in the browser). Under Node with the threaded build, `print` and
 *   `printErr` default to `console.log`/`console.error` (matching the serial
 *   build's own default) unless overridden here.
 */
export async function loadFloatTetwild(options = {}) {
    const useThreads = options.threads ?? threadsSupported();

    const createModule = useThreads
        ? (await import("./dist/floattetwild.threaded.mjs")).default
        : (await import("./dist/floattetwild.serial.mjs")).default;

    const isNode = typeof process !== "undefined" && !!process.versions?.node;
    let moduleArgs = options.moduleArgs;
    if (useThreads && isNode) {
        // The threaded build's Node glue defaults stdio to raw
        // fs.writeSync(1|2, ...) calls, unlike the serial build (which
        // already routes through console.log/console.error). Make both
        // builds behave the same way by default; an explicit override in
        // moduleArgs still wins.
        moduleArgs = { print: (...args) => console.log(...args), printErr: (...args) => console.error(...args), ...options.moduleArgs };
    }

    const Module = await createModule(moduleArgs);

    /**
     * @param {number[]|Float64Array|Float32Array} vertices Flat (x, y, z, ...) surface vertex positions.
     * @param {number[]|Int32Array|Uint32Array} faces Flat 0-based triangle indices.
     * @param {object} [params]
     * @param {number} [params.epsRel=1e-3] Envelope size, as a fraction of the bbox diagonal.
     * @param {number} [params.idealEdgeLengthRel=0.05] Target edge length, as a fraction of the bbox diagonal.
     * @param {number} [params.stopEnergy=10] Stop optimizing once max AMIPS energy is below this.
     * @param {number} [params.maxIts=80] Max optimization iterations.
     * @param {boolean} [params.disableFiltering=false] Skip winding-number/flood-fill
     *   interior-exterior filtering, returning the raw (unfiltered) tetrahedralization.
     * @param {boolean} [params.coarsen=false] Coarsen the output mesh after optimization.
     * @param {boolean} [params.manifoldSurface=false] Force the output boundary to be manifold.
     * @param {number} [params.numThreads=0] Max TBB threads to use (0 = library default).
     *   No effect on the serial build.
     * @returns {{status: number, vertices: Float64Array, tets: Uint32Array}} `vertices` is
     *   flat (x, y, z, ...); `tets` is flat groups of 4 vertex indices, one tetrahedron per
     *   group, in the standard positive-signed-volume winding (MSH tet4 / VTK_TETRA / gmsh).
     */
    function tetrahedralizeTyped(vertices, faces, params = {}) {
        const v = writeToHeap(Module, vertices, Float64Array, "HEAPF64");
        const f = writeToHeap(Module, faces, Int32Array, "HEAP32");

        let result;
        try {
            result = Module.tetrahedralize(v.ptr, v.length, f.ptr, f.length, buildTetParams(params));
        } finally {
            v.free();
            f.free();
        }

        // .slice() copies each zero-copy heap view out into an owned typed
        // array *before* result.delete() frees the C++-side buffers it views.
        const out = {
            status: result.status,
            vertices: result.verticesView().slice(),
            tets: result.tetsView().slice(),
        };
        result.delete();

        return out;
    }

    return {
        Module,
        threaded: useThreads,

        /**
         * Same as `tetrahedralizeTyped()`, except `vertices`/`tets` on the returned object are
         * plain `number[]` instead of typed arrays -- kept for compatibility with existing
         * v0.1.0 callers. New code should prefer `tetrahedralizeTyped()`.
         *
         * @param {number[]|Float64Array} vertices
         * @param {number[]|Int32Array} faces
         * @param {object} [params] See `tetrahedralizeTyped()`.
         * @returns {{status: number, vertices: number[], tets: number[]}}
         */
        tetrahedralize(vertices, faces, params = {}) {
            const result = tetrahedralizeTyped(vertices, faces, params);
            return {
                status: result.status,
                vertices: Array.from(result.vertices),
                tets: Array.from(result.tets),
            };
        },

        tetrahedralizeTyped,
    };
}

export default loadFloatTetwild;
