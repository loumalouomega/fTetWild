// This file is part of fTetWild, a software for generating tetrahedral meshes.
//
// This Source Code Form is subject to the terms of the Mozilla Public License
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at http://mozilla.org/MPL/2.0/.
//

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <floattetwild/FloatTetwild.h>
#include <floattetwild/Logger.hpp>
#include <floattetwild/Parameters.h>

#include <geogram/basic/common.h>
#include <geogram/basic/process.h>
#include <geogram/mesh/mesh.h>

#include <Eigen/Dense>

#include <cstdint>
#include <cstdlib>
#include <vector>

namespace {

// GEO::initialize() must run exactly once per process (see doc/library_api.md).
void ensure_geogram_initialized()
{
    static bool initialized = false;
    if (!initialized) {
        GEO::initialize();
#ifndef FLOAT_TETWILD_USE_TBB
        // Geogram spins up its own std::thread-based thread pool internally
        // (independent of fTetWild's own TBB usage) sized to the detected
        // core count. Without -pthread, std::thread construction always
        // fails under Emscripten ("thread constructor failed"), so threading
        // must be explicitly disabled for the serial (non-pthread) build.
        GEO::Process::enable_multithreading(false);
#endif
        floatTetWild::Logger::init(/*use_cout=*/false, /*log_file=*/"");
        initialized = true;
    }
}

// GEO::Mesh has a deleted copy constructor, so it's built in-place into an
// out-parameter rather than returned by value. Reads directly from caller-
// owned WASM heap memory (see allocBuffer/freeBuffer below) rather than
// copying through a std::vector, so there is no per-element marshaling cost
// on the way in.
void build_surface_mesh(const double* vertices,
                        size_t        vertices_len,
                        const int*    faces,
                        size_t        faces_len,
                        GEO::Mesh&    sf_mesh)
{
    sf_mesh.vertices.set_dimension(3);

    const auto n_vertices = static_cast<GEO::index_t>(vertices_len / 3);
    sf_mesh.vertices.create_vertices(n_vertices);
    for (GEO::index_t i = 0; i < n_vertices; ++i) {
        double* p = sf_mesh.vertices.point_ptr(i);
        p[0]      = vertices[3 * i + 0];
        p[1]      = vertices[3 * i + 1];
        p[2]      = vertices[3 * i + 2];
    }

    const auto n_faces = static_cast<GEO::index_t>(faces_len / 3);
    sf_mesh.facets.create_triangles(n_faces);
    for (GEO::index_t f = 0; f < n_faces; ++f) {
        sf_mesh.facets.set_vertex(f, 0, static_cast<GEO::index_t>(faces[3 * f + 0]));
        sf_mesh.facets.set_vertex(f, 1, static_cast<GEO::index_t>(faces[3 * f + 1]));
        sf_mesh.facets.set_vertex(f, 2, static_cast<GEO::index_t>(faces[3 * f + 2]));
    }
}

}  // namespace

// Subset of floatTetWild::Parameters exposed to JS. Field names are
// camelCase to match the JS-side params object in npm/index.js directly;
// embind's value_object conversion requires every field listed here to be
// present on the JS object passed in, so npm/index.js always builds a fully
// populated object (its own destructuring defaults fill in anything the
// caller omitted) rather than forwarding the caller's object as-is.
struct TetParams
{
    double eps_rel               = 1e-3;
    double ideal_edge_length_rel = 1.0 / 20.0;
    double stop_energy           = 10.0;
    int    max_its               = 80;
    bool   disable_filtering     = false;
    bool   coarsen               = false;
    bool   manifold_surface      = false;
    // 0 means "use floatTetWild::Parameters's own default"; the serial wasm
    // build ignores this regardless, since it has no thread pool to size.
    int num_threads = 0;
};

// Bound as an embind class_ (not a value_object) so that verticesView() /
// tetsView() can hand back zero-copy views directly into this object's own
// heap-resident std::vectors instead of eagerly copying them into JS arrays.
// Returned by value from tetrahedralize(); embind heap-allocates the JS-side
// copy, so callers must call .delete() on the result once done with it (see
// npm/index.js), same as any other embind class_ instance.
struct TetrahedralizeResult
{
    std::vector<double>   vertices;  // 3 doubles per output vertex
    std::vector<uint32_t> tets;      // 4 indices per output tetrahedron
    int                   status = EXIT_FAILURE;

    emscripten::val verticesView() const
    {
        return emscripten::val(emscripten::typed_memory_view(vertices.size(), vertices.data()));
    }

    emscripten::val tetsView() const
    {
        return emscripten::val(emscripten::typed_memory_view(tets.size(), tets.data()));
    }
};

// Raw-heap allocation pair so JS can write vertex/face data directly into
// the WASM heap (via HEAPF64.set()/HEAP32.set()) instead of marshaling it
// one element at a time through an embind vector. Plain malloc/free: no
// alignment beyond what malloc already guarantees is required here.
uintptr_t allocBuffer(size_t bytes)
{
    return reinterpret_cast<uintptr_t>(std::malloc(bytes));
}

void freeBuffer(uintptr_t ptr)
{
    std::free(reinterpret_cast<void*>(ptr));
}

// vertices/faces are read directly out of the WASM heap at [v_ptr, v_ptr +
// v_len) / [f_ptr, f_ptr + f_len) -- see allocBuffer() above and
// npm/index.js's writeToHeap(). Both buffers are only read here; ownership
// (and freeing) stays with the caller.
TetrahedralizeResult tetrahedralize(uintptr_t         v_ptr,
                                    size_t             v_len,
                                    uintptr_t          f_ptr,
                                    size_t             f_len,
                                    const TetParams&   tet_params)
{
    ensure_geogram_initialized();

    GEO::Mesh sf_mesh;
    build_surface_mesh(reinterpret_cast<const double*>(v_ptr),
                       v_len,
                       reinterpret_cast<const int*>(f_ptr),
                       f_len,
                       sf_mesh);

    floatTetWild::Parameters params;
    params.eps_rel               = tet_params.eps_rel;
    params.ideal_edge_length_rel = tet_params.ideal_edge_length_rel;
    params.stop_energy           = tet_params.stop_energy;
    params.max_its               = tet_params.max_its;
    params.disable_filtering     = tet_params.disable_filtering;
    params.coarsen               = tet_params.coarsen;
    params.manifold_surface      = tet_params.manifold_surface;
    if (tet_params.num_threads > 0)
        params.num_threads = static_cast<unsigned int>(tet_params.num_threads);
    params.is_quiet = true;

    Eigen::MatrixXd V;
    Eigen::MatrixXi T;

    TetrahedralizeResult result;
    result.status = floatTetWild::tetrahedralization(sf_mesh, params, V, T);

    result.vertices.resize(static_cast<size_t>(V.rows()) * 3);
    for (Eigen::Index i = 0; i < V.rows(); ++i) {
        result.vertices[3 * i + 0] = V(i, 0);
        result.vertices[3 * i + 1] = V(i, 1);
        result.vertices[3 * i + 2] = V(i, 2);
    }

    // T is already positive-volume (see MeshIO::extract_volume_mesh): no
    // reordering needed here, just the narrowing int -> uint32_t copy.
    result.tets.resize(static_cast<size_t>(T.rows()) * 4);
    for (Eigen::Index i = 0; i < T.rows(); ++i) {
        for (int j = 0; j < 4; ++j)
            result.tets[4 * i + j] = static_cast<uint32_t>(T(i, j));
    }

    return result;
}

EMSCRIPTEN_BINDINGS(floattetwild)
{
    // Kept registered (unused by tetrahedralize() itself, which now reads
    // directly off the heap) purely so Module.VectorDouble/VectorInt remain
    // constructible -- e.g. for benchmarking the old per-element push_back()
    // marshaling approach against the new bulk heap-write path.
    emscripten::register_vector<double>("VectorDouble");
    emscripten::register_vector<int>("VectorInt");

    emscripten::function("allocBuffer", &allocBuffer);
    emscripten::function("freeBuffer", &freeBuffer);

    emscripten::value_object<TetParams>("TetParams")
        .field("epsRel", &TetParams::eps_rel)
        .field("idealEdgeLengthRel", &TetParams::ideal_edge_length_rel)
        .field("stopEnergy", &TetParams::stop_energy)
        .field("maxIts", &TetParams::max_its)
        .field("disableFiltering", &TetParams::disable_filtering)
        .field("coarsen", &TetParams::coarsen)
        .field("manifoldSurface", &TetParams::manifold_surface)
        .field("numThreads", &TetParams::num_threads);

    emscripten::class_<TetrahedralizeResult>("TetrahedralizeResult")
        .property("status", &TetrahedralizeResult::status)
        .function("verticesView", &TetrahedralizeResult::verticesView)
        .function("tetsView", &TetrahedralizeResult::tetsView);

    emscripten::function("tetrahedralize", &tetrahedralize);
}
