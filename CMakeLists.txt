# ##############################################################################
cmake_minimum_required(VERSION 3.20)
project(FloatTetwild)
# ##############################################################################

# Detects whether this is a top-level project
get_directory_property(HAS_PARENT PARENT_DIRECTORY)
if(HAS_PARENT)
    set(FLOAT_TETWILD_TOPLEVEL_PROJECT OFF)
else()
    set(FLOAT_TETWILD_TOPLEVEL_PROJECT ON)
endif()

if(INPUT_THIRD_PARTY_DIR)
    set(FLOAT_TETWILD_EXTERNAL
      ${CMAKE_CURRENT_SOURCE_DIR}/${INPUT_THIRD_PARTY_DIR}/)
else()
    set(FLOAT_TETWILD_EXTERNAL ${CMAKE_CURRENT_SOURCE_DIR}/3rdparty/)
endif()

list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/cmake)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Color output
include(UseColors)

# Prepend function
include(PrependCurrentPath)

# FloatTetwild utils
include(FloatTetwildUtils)

# Extra warnings
include(Warnings)

# Sort projects inside the solution
set_property(GLOBAL PROPERTY USE_FOLDERS ON)

# Generate position independent code by default
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# ##############################################################################

# FloatTetwild options
option(FLOAT_TETWILD_ENABLE_TBB "Enable TBB" ON)
option(FLOAT_TETWILD_USE_FLOAT "Use floats instead of double" OFF)
option(FLOAT_TETWILD_WITH_SANITIZERS "Use sanitizers" OFF)
option(FLOAT_TETWILD_WITH_EXACT_ENVELOPE "Use exact envelope" OFF)
option(FLOAT_TETWILD_USE_GMP "Use GMP for exact rational arithmetic (AMIPS energy stabilisation). When OFF a long double fallback is used." OFF)
option(FLOAT_TETWILD_WASM_THREADS "When building for Emscripten, use pthreads + TBB (requires cross-origin isolation in the browser). When OFF, builds a single-threaded module that runs everywhere." OFF)

# Emscripten/WebAssembly builds: GMP isn't portable to wasm, and TBB is only
# usable when the pthreads variant is requested (it needs -pthread and, in
# the browser, SharedArrayBuffer/cross-origin isolation).
if(EMSCRIPTEN)
    set(FLOAT_TETWILD_USE_GMP OFF CACHE BOOL "" FORCE)
    set(FLOAT_TETWILD_ENABLE_TBB ${FLOAT_TETWILD_WASM_THREADS} CACHE BOOL "" FORCE)

    if(FLOAT_TETWILD_WASM_THREADS)
        # Must be applied globally, before any dependency is fetched/compiled:
        # wasm-ld requires every object in the link to agree on the atomics/
        # bulk-memory target features, so Geogram, TBB, libigl, etc. all need
        # -pthread too, not just fTetWild's own sources.
        add_compile_options(-pthread)
        add_link_options(-pthread)
    endif()
endif()

# Sanitizer options
option(SANITIZE_ADDRESS "Sanitize Address" OFF)
option(SANITIZE_MEMORY "Sanitize Memory" OFF)
option(SANITIZE_THREAD "Sanitize Thread" OFF)
option(SANITIZE_UNDEFINED "Sanitize Undefined" OFF)

# Options for libigl modules
option(LIBIGL_USE_STATIC_LIBRARY "Use libigl as static library" OFF)
option(LIBIGL_WITH_COMISO "Use CoMiso" OFF)
option(LIBIGL_WITH_EMBREE "Use Embree" OFF)
option(LIBIGL_WITH_OPENGL "Use OpenGL" OFF)
option(LIBIGL_WITH_OPENGL_GLFW "Use GLFW" OFF)
option(LIBIGL_WITH_OPENGL_GLFW_IMGUI "Use ImGui" OFF)
option(LIBIGL_WITH_PNG "Use PNG" OFF)
option(LIBIGL_WITH_TETGEN "Use Tetgen" OFF)
option(LIBIGL_WITH_TRIANGLE "Use Triangle" OFF)
option(LIBIGL_WITH_PREDICATES "Use exact predicates" ON)
option(LIBIGL_WITH_XML "Use XML" OFF)

# Sanitizers
if(FLOAT_TETWILD_WITH_SANITIZERS)
    list(APPEND CMAKE_MODULE_PATH
       ${FLOAT_TETWILD_EXTERNAL}/sanitizers-cmake/cmake)
endif()

# Setup dependencies
include(FloatTetwildDependencies)
igl_include(predicates)

# ##############################################################################
# FloatTetwild library
# ##############################################################################

if(FLOAT_TETWILD_USE_GMP)
    find_package(GMPfTetWild)
    if(NOT ${GMP_FOUND})
        message(FATAL_ERROR "Cannot find GMP. Install libgmp-dev or disable with -DFLOAT_TETWILD_USE_GMP=OFF.")
    endif()
    message(STATUS "GMP enabled: using exact rational arithmetic for AMIPS energy stabilisation")
else()
    message(STATUS "GMP disabled: using long double fallback for AMIPS energy stabilisation")
endif()

# add_library() can only be called without any source since CMake 3.11 ...
add_library(${PROJECT_NAME} src/Logger.cpp)

# Public include directory for FloatTetwild
target_include_directories(${PROJECT_NAME} PUBLIC ${PROJECT_BINARY_DIR}/include)

# Extra warnings
target_link_libraries(${PROJECT_NAME} PRIVATE warnings::all)

# Use C++14 (minimum for modern CMake practices)
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
target_compile_features(${PROJECT_NAME} PUBLIC cxx_std_14)
# if(${CMAKE_SYSTEM_NAME} MATCHES "Windows")
# target_compile_options(${PROJECT_NAME} PUBLIC "/Zc:__cplusplus") endif()
# target_compile_definitions(${PROJECT_NAME} PUBLIC
# -DEIGEN_STACK_ALLOCATION_LIMIT=8388608)

if(FLOAT_TETWILD_WITH_SANITIZERS)
    add_sanitizers(${PROJECT_NAME})
endif()

# ##############################################################################
# Required libraries
# ##############################################################################

if(FLOAT_TETWILD_USE_FLOAT)
    target_compile_definitions(${PROJECT_NAME} PUBLIC -DFLOAT_TETWILD_USE_FLOAT)
endif()

if(FLOAT_TETWILD_USE_GMP)
    target_compile_definitions(${PROJECT_NAME} PUBLIC FLOAT_TETWILD_USE_GMP)
    target_include_directories(${PROJECT_NAME} SYSTEM PUBLIC ${GMP_INCLUDE_DIRS})
endif()

target_link_libraries(
  ${PROJECT_NAME}
  PUBLIC igl::core
         igl::predicates
         geogram::geogram
         spdlog::spdlog
         Threads::Threads
         json
)

if(FLOAT_TETWILD_USE_GMP)
    target_link_libraries(${PROJECT_NAME} PUBLIC ${GMP_LIBRARIES})
endif()
if(FLOAT_TETWILD_ENABLE_TBB)
    target_link_libraries(${PROJECT_NAME} PUBLIC TBB::tbb)
    target_compile_definitions(${PROJECT_NAME} PUBLIC FLOAT_TETWILD_USE_TBB)
endif()

if(FLOAT_TETWILD_WITH_EXACT_ENVELOPE)
    target_link_libraries(${PROJECT_NAME} PUBLIC FastEnvelope)
    target_compile_definitions(${PROJECT_NAME} PUBLIC NEW_ENVELOPE)
endif()

# ##############################################################################
# FloatTetwild binary
# ##############################################################################

# Main executable
if(FLOAT_TETWILD_TOPLEVEL_PROJECT AND NOT EMSCRIPTEN)
    add_executable(${PROJECT_NAME}_bin src/main.cpp)
    target_compile_features(${PROJECT_NAME}_bin PUBLIC cxx_std_14)

    target_link_libraries(${PROJECT_NAME}_bin PUBLIC ${PROJECT_NAME} CLI11::CLI11
                                                   warnings::all)

    if(TARGET igl::tetgen)
        target_link_libraries(${PROJECT_NAME} PUBLIC igl::tetgen)
        target_compile_definitions(${PROJECT_NAME} PUBLIC -DLIBIGL_WITH_TETGEN)
    endif()

    if(FLOAT_TETWILD_WITH_SANITIZERS)
        add_sanitizers(${PROJECT_NAME}_bin)
    endif()

    if(NOT (${CMAKE_VERSION} VERSION_LESS "3.6.0"))
        set_property(DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
                 PROPERTY VS_STARTUP_PROJECT ${PROJECT_NAME}_bin)
    endif()
endif()

# ##############################################################################
# FloatTetwild WebAssembly module (Embind)
# ##############################################################################

if(FLOAT_TETWILD_TOPLEVEL_PROJECT AND EMSCRIPTEN)
    add_executable(${PROJECT_NAME}_wasm src/wasm/Bindings.cpp)
    target_compile_features(${PROJECT_NAME}_wasm PUBLIC cxx_std_14)
    target_link_libraries(${PROJECT_NAME}_wasm PUBLIC ${PROJECT_NAME} warnings::all)

    if(FLOAT_TETWILD_WASM_THREADS)
        set(FTETWILD_WASM_OUTPUT_NAME "floattetwild.threaded")
    else()
        set(FTETWILD_WASM_OUTPUT_NAME "floattetwild.serial")
    endif()

    set_target_properties(${PROJECT_NAME}_wasm PROPERTIES
        OUTPUT_NAME ${FTETWILD_WASM_OUTPUT_NAME}
        SUFFIX ".mjs"
    )

    target_link_options(${PROJECT_NAME}_wasm PRIVATE
        --bind
        -sMODULARIZE=1
        -sEXPORT_ES6=1
        -sEXPORT_NAME=createFloatTetwildModule
        -sALLOW_MEMORY_GROWTH=1
        -sENVIRONMENT=web,worker,node
    )

    if(FLOAT_TETWILD_WASM_THREADS)
        # -pthread itself is applied globally (see the FLOAT_TETWILD_WASM_THREADS
        # handling near the top of this file); only the pool size is target-specific.
        target_link_options(${PROJECT_NAME}_wasm PRIVATE -sPTHREAD_POOL_SIZE=4)
    endif()
endif()

# ##############################################################################
# Subdirectories
# ##############################################################################

# Other sources
add_subdirectory(src)

# Compile extras only if this is a top-level project
if(FLOAT_TETWILD_TOPLEVEL_PROJECT)
    # Unit tests
    include(CTest)
    enable_testing()
    add_subdirectory(tests)
endif()
