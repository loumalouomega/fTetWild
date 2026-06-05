# Dependencies

## System dependency (must be installed manually)

| Library | Role | Install |
|---|---|---|
| **GMP** | Exact arithmetic for AMIPS energy stabilisation and geometric predicates | `sudo apt-get install libgmp-dev` / `brew install gmp` |

CMake hard-fails with `Cannot find GMP` if absent. Override detected paths with the `GMP_INC` / `GMP_LIB` environment variables, or the `--gmp-inc` / `--gmp-lib` flags in `build/configure.sh`.

---

## FetchContent dependencies (auto-downloaded at configure time)

| Library | Pinned version | Role |
|---|---|---|
| **CLI11** | v2.5.0 | Command-line argument parsing (`src/main.cpp`) |
| **fmt** | v11.2.0 | String formatting; used by spdlog |
| **spdlog** | v1.15.3 | Structured logging (`src/Logger.hpp`); configured to use external fmt |
| **libigl** | v2.6.0 | Geometry utilities: `igl::Timer`, `igl::write_triangle_mesh`, `igl::default_num_threads`; also pulls in Eigen |
| **Eigen** | (via libigl) | All linear algebra — `Vector3`, `Matrix3`, `MatrixXd`, etc. |
| **predicates** | (via libigl) | Shewchuk's exact orient/insphere floating-point predicates |
| **geogram** | v1.9.6 | Delaunay 3D tetrahedralization, AABB trees, mesh I/O; built library-only (no GUI, no Lua) |
| **oneTBB** | v2022.2.0 | Intel Threading Building Blocks for parallel preprocessing and vertex smoothing; only when `FLOAT_TETWILD_ENABLE_TBB=ON` (default) |
| **nlohmann/json** | jdumas fork (pinned commit) | JSON parsing for CSG tree files (`--csg`) |
| **Catch2** | v3.5.3 | Unit test framework; only when `BUILD_TESTING=ON` |
| **sanitizers-cmake** | pinned commit | CMake sanitizer helpers; only when `FLOAT_TETWILD_WITH_SANITIZERS=ON` |
| **FastEnvelope** | pinned commit | Exact envelope containment tests; only when `FLOAT_TETWILD_WITH_EXACT_ENVELOPE=ON` |

---

## Optional / implicit

| Library | Condition |
|---|---|
| **Threads** | Always linked; provided by the OS (`find_package(Threads)`) |
| **OpenMP** | Detected if available; used by libigl internally |
| **TetGen** (via `igl::tetgen`) | Enabled with `--with-tetgen` in `configure.sh`; exposes a `--tetgen` CLI flag for comparison runs |

---

## Vendored in `src/external/`

Bundled directly in the repository — no download needed.

| File(s) | Origin / Role |
|---|---|
| `MshLoader.cpp/.h`, `MshSaver.cpp/.h` | PyMesh-derived `.msh` file I/O |
| `Predicates.cpp/.hpp`, `predicates.c` | Wrapper around Shewchuk's exact predicates |
| `Rational.h` | Exact rational arithmetic (used for unstable AMIPS energy stabilisation) |
| `mesh_AABB.h/.cpp` | Custom geogram AABB variant with ε-tolerance proximity queries |
| `triangle_triangle_intersection.cpp` | Guigue–Devillers triangle–triangle intersection test |
| `bfs_orient.cpp/.h` | BFS-based mesh orientation |
| `get_mem.cpp/.h`, `getRSS.c` | Peak memory reporting for statistics CSV |
