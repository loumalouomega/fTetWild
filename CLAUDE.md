# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

fTetWild is a robust C++14 tetrahedral meshing library and CLI tool. It takes triangle surface meshes as input and produces high-quality tetrahedral meshes. Published as SIGGRAPH 2020 (Hu et al., "Fast Tetrahedral Meshing in the Wild").

License: Mozilla Public License 2.0.

## Build Commands

```bash
# Configure (Release by default)
mkdir build && cd build
cmake ..

# Build
make -j$(nproc)

# The binary is:
./FloatTetwild_bin

# Run tests
ctest
# or directly:
./tests/unit_tests

# Run a single test by name
./tests/unit_tests "[suite-name]"
```

**System prerequisite**: GMP must be installed (`sudo apt-get install libgmp-dev` on Ubuntu, `brew install gmp` on macOS). CMake will fail with `Cannot find GMP` if absent.

Set `GMP_INC` and `GMP_LIB` env vars if CMake cannot locate GMP automatically.

## CMake Options

| Option | Default | Description |
|--------|---------|-------------|
| `FLOAT_TETWILD_ENABLE_TBB` | ON | Parallel execution via Intel TBB |
| `FLOAT_TETWILD_USE_FLOAT` | OFF | Use `float` instead of `double` (rarely used) |
| `FLOAT_TETWILD_WITH_EXACT_ENVELOPE` | OFF | Use FastEnvelope library (slower build, better envelope accuracy); sets `NEW_ENVELOPE` preprocessor define |
| `FLOAT_TETWILD_WITH_SANITIZERS` | OFF | Enable address/memory/thread/UB sanitizers |

All third-party dependencies (CLI11, fmt, spdlog, libigl, geogram, oneTBB, nlohmann/json, Catch2) are fetched via CMake `FetchContent` at configure time — no manual submodule init needed.

## Code Formatting

`.clang-format` is present (Google-derived style). Key settings: 4-space indent, 100-column limit, custom brace wrapping, pointer alignment left. Run `clang-format -i` on changed files.

## Architecture

### Namespace & Types (`src/Types.hpp`, `src/Mesh.hpp`)

Everything lives in `namespace floatTetWild`. Core scalar type is `Scalar` (`double` by default, `float` if `FLOAT_TETWILD_USE_FLOAT` is defined). Eigen typedefs: `Vector3`, `Vector3i`, `Vector4i`, `Matrix3`, `MatrixXs`.

### Central Data Structures (`src/Mesh.hpp`, `src/Parameters.h`)

- **`MeshVertex`**: 3D position, connectivity list (`conn_tets`), surface/boundary flags, sizing scalar.
- **`MeshTet`**: 4 vertex indices, per-face surface/bbox flags (`is_surface_fs`, `is_bbox_fs`), opposite tet ids, AMIPS quality, removed/outside flags.
- **`Mesh`**: Owns `tet_vertices` and `tets` as flat vectors using **lazy deletion** — removed elements are flagged with `is_removed = true` and reused via `t_empty_start`/`v_empty_start` cursors rather than erased.
- **`Parameters`**: All algorithm parameters (epsilon, ideal edge length, stop energy, etc.) initialized via `Parameters::init(bbox_diag_length)` which computes derived quantities from the bounding box diagonal.

### Meshing Pipeline (`src/main.cpp`, `src/FloatTetwild.cpp`)

The pipeline runs in order:

1. **Simplification** (`Simplification.h`) — Preprocesses the input surface mesh to remove degenerate features within the envelope tolerance.
2. **Delaunay tetrahedralization** (`FloatTetDelaunay.h`) — Initial tet mesh filling the bounding box.
3. **Triangle insertion** (`TriangleInsertion.h`, `CutMesh.h`) — Inserts input surface constraints by cutting through existing tets.
4. **Mesh optimization** (`MeshImprovement.h`) — Iterates local operations to improve AMIPS energy:
   - `EdgeSplitting` — splits long edges
   - `EdgeCollapsing` — collapses short edges
   - `EdgeSwapping` — improves local topology
   - `VertexSmoothing` — repositions vertices
5. **Interior/exterior filtering** (`MeshImprovement.h`) — Classifies tets using winding numbers (`filter_outside`) or flood-fill. Boolean CSG operations happen here.
6. **Output** (`MeshIO.h`) — Writes `.msh` or `.mesh` files.

### Library API (`src/FloatTetwild.h`)

When used as a CMake library target (`FloatTetwild`), the single entry point is:

```cpp
int floatTetWild::tetrahedralization(
    GEO::Mesh& sf_mesh,      // input surface mesh (geogram format)
    Parameters params,
    Eigen::MatrixXd& VO,     // output vertices
    Eigen::MatrixXi& TO,     // output tets
    int boolean_op = -1,     // -1 = none, 0 = union, 1 = intersection, 2 = difference
    bool skip_simplify = false);
```

### AABB & Envelope (`src/AABBWrapper.h`)

`AABBWrapper` wraps geogram's `MeshFacetsAABB` for proximity/envelope queries. Maintains separate trees for the input surface (`sf_tree`) and background mesh (`b_tree`). When `FLOAT_TETWILD_WITH_EXACT_ENVELOPE` is ON, also holds `fastEnvelope::FastEnvelope` instances; the preprocessor guard `#ifdef NEW_ENVELOPE` switches between envelope implementations throughout the codebase.

### Parallelism

When TBB is enabled (`FLOAT_TETWILD_USE_TBB` defined), local mesh operations run in parallel using `tbb::parallel_for`. `Mesh::one_ring_vertex_sets` and `Mesh::partition` compute conflict-free vertex/tet sets for safe concurrent execution. The main thread limit is set via `--max-threads` (CLI) or `params.num_threads`.

### External files (`src/external/`)

- `MshLoader`/`MshSaver` — PyMesh-derived `.msh` file I/O
- `Predicates.hpp`/`.cpp` — Geometric predicates (wraps Shewchuk's exact predicates)
- `Rational.h` — Exact rational arithmetic
- `mesh_AABB.h`/`.cpp` — Custom geogram AABB variant with epsilon tolerance
- `triangle_triangle_intersection.cpp` — Triangle-triangle intersection tests
- `bfs_orient.cpp` — BFS-based mesh orientation

### Quality Metric

Element quality is conformal AMIPS energy (range `[3, +inf]`). Perfect regular tetrahedra have energy 3. The default `stop_energy = 10`. Values above `MAX_ENERGY = 1e50` indicate degenerate/invalid elements.
