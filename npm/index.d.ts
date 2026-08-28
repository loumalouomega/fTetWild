/**
 * TypeScript declarations for float-tetwild-wasm.
 *
 * Winding convention: `tets` (in both `TetResult` and `TetResultTyped`) uses
 * the standard positive-signed-volume convention -- the same one MSH tet4,
 * VTK_TETRA, and gmsh expect. For a tet `[a, b, c, d]` (indices into
 * `vertices`), `(b - a) x (c - a) . (d - a) > 0`.
 */

/** Options forwarded to the underlying Emscripten module factory. */
export interface ModuleArgs {
    /** Customize where the .wasm binary is fetched/read from. */
    locateFile?: (path: string, scriptDirectory: string) => string;
    /** Override stdout routing. Defaults to `console.log` under Node. */
    print?: (...args: unknown[]) => void;
    /** Override stderr routing. Defaults to `console.error` under Node. */
    printErr?: (...args: unknown[]) => void;
    [key: string]: unknown;
}

export interface LoadOptions {
    /**
     * Force the threaded (true) or serial (false) build. Defaults to
     * auto-detection (always threaded under Node; browser default depends on
     * `crossOriginIsolated`).
     */
    threads?: boolean;
    /** Forwarded to the Emscripten module factory. */
    moduleArgs?: ModuleArgs;
}

export interface TetParams {
    /** Envelope size, as a fraction of the bbox diagonal. @default 1e-3 */
    epsRel?: number;
    /** Target edge length, as a fraction of the bbox diagonal. @default 0.05 */
    idealEdgeLengthRel?: number;
    /** Stop optimizing once max AMIPS energy is below this. @default 10 */
    stopEnergy?: number;
    /** Max optimization iterations. @default 80 */
    maxIts?: number;
    /**
     * Skip winding-number/flood-fill interior-exterior filtering, returning
     * the raw (unfiltered) tetrahedralization. @default false
     */
    disableFiltering?: boolean;
    /** Coarsen the output mesh after optimization. @default false */
    coarsen?: boolean;
    /** Force the output boundary to be manifold. @default false */
    manifoldSurface?: boolean;
    /**
     * Max TBB threads to use (0 = library default). No effect on the serial
     * build. @default 0
     */
    numThreads?: number;
}

/** `status` is 0 on success. `vertices` is flat (x, y, z, ...); `tets` is flat groups of 4 vertex indices. */
export interface TetResult {
    status: number;
    vertices: number[];
    tets: number[];
}

/** Same shape as {@link TetResult}, with typed-array payloads instead of plain arrays. */
export interface TetResultTyped {
    status: number;
    vertices: Float64Array;
    tets: Uint32Array;
}

export interface FloatTetwild {
    /** The underlying Emscripten module instance. */
    Module: unknown;
    /** Whether the threaded build was loaded. */
    threaded: boolean;

    /**
     * Tetrahedralize a surface mesh. Kept for compatibility with v0.1.0
     * callers -- returns plain `number[]`. Prefer {@link tetrahedralizeTyped}
     * in new code.
     */
    tetrahedralize(
        vertices: number[] | Float64Array,
        faces: number[] | Int32Array,
        params?: TetParams
    ): TetResult;

    /** Same as {@link tetrahedralize}, returning typed-array payloads (zero-copy on the way out). */
    tetrahedralizeTyped(
        vertices: number[] | Float64Array | Float32Array,
        faces: number[] | Int32Array | Uint32Array,
        params?: TetParams
    ): TetResultTyped;
}

export function loadFloatTetwild(options?: LoadOptions): Promise<FloatTetwild>;

export default loadFloatTetwild;
