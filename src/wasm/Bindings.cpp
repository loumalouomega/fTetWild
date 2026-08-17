// This file is part of fTetWild, a software for generating tetrahedral meshes.
//
// This Source Code Form is subject to the terms of the Mozilla Public License
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at http://mozilla.org/MPL/2.0/.
//

#include <emscripten/bind.h>

#include <floattetwild/FloatTetwild.h>
#include <floattetwild/Logger.hpp>
#include <floattetwild/Parameters.h>

#include <geogram/basic/common.h>
#include <geogram/basic/process.h>
#include <geogram/mesh/mesh.h>

#include <Eigen/Dense>

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
// out-parameter rather than returned by value.
void build_surface_mesh(const std::vector<double>& vertices,
                        const std::vector<int>&    faces,
                        GEO::Mesh&                  sf_mesh)
{
    sf_mesh.vertices.set_dimension(3);

    const auto n_vertices = static_cast<GEO::index_t>(vertices.size() / 3);
    sf_mesh.vertices.create_vertices(n_vertices);
    for (GEO::index_t i = 0; i < n_vertices; ++i) {
        double* p = sf_mesh.vertices.point_ptr(i);
        p[0]      = vertices[3 * i + 0];
        p[1]      = vertices[3 * i + 1];
        p[2]      = vertices[3 * i + 2];
    }

    const auto n_faces = static_cast<GEO::index_t>(faces.size() / 3);
    sf_mesh.facets.create_triangles(n_faces);
    for (GEO::index_t f = 0; f < n_faces; ++f) {
        sf_mesh.facets.set_vertex(f, 0, static_cast<GEO::index_t>(faces[3 * f + 0]));
        sf_mesh.facets.set_vertex(f, 1, static_cast<GEO::index_t>(faces[3 * f + 1]));
        sf_mesh.facets.set_vertex(f, 2, static_cast<GEO::index_t>(faces[3 * f + 2]));
    }
}

}  // namespace

// Flat (interleaved) representation so Embind can hand back plain JS number
// arrays without exposing Eigen types to JS.
struct TetrahedralizeResult
{
    std::vector<double> vertices;  // 3 doubles per output vertex
    std::vector<int>    tets;      // 4 ints per output tetrahedron
    int                 status = EXIT_FAILURE;
};

TetrahedralizeResult tetrahedralize(const std::vector<double>& vertices,
                                    const std::vector<int>&    faces,
                                    double                      eps_rel,
                                    double                      ideal_edge_length_rel,
                                    double                      stop_energy,
                                    int                         max_its)
{
    ensure_geogram_initialized();

    GEO::Mesh sf_mesh;
    build_surface_mesh(vertices, faces, sf_mesh);

    floatTetWild::Parameters params;
    params.eps_rel               = eps_rel;
    params.ideal_edge_length_rel = ideal_edge_length_rel;
    params.stop_energy           = stop_energy;
    params.max_its               = max_its;
    params.is_quiet               = true;

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

    result.tets.resize(static_cast<size_t>(T.rows()) * 4);
    for (Eigen::Index i = 0; i < T.rows(); ++i) {
        for (int j = 0; j < 4; ++j)
            result.tets[4 * i + j] = T(i, j);
    }

    return result;
}

EMSCRIPTEN_BINDINGS(floattetwild)
{
    emscripten::register_vector<double>("VectorDouble");
    emscripten::register_vector<int>("VectorInt");

    emscripten::value_object<TetrahedralizeResult>("TetrahedralizeResult")
        .field("vertices", &TetrahedralizeResult::vertices)
        .field("tets", &TetrahedralizeResult::tets)
        .field("status", &TetrahedralizeResult::status);

    emscripten::function("tetrahedralize", &tetrahedralize);
}
