import { defineConfig } from "vitepress";

export default defineConfig({
    title: "fTetWild",
    description: "Fast Tetrahedral Meshing in the Wild",
    base: "/fTetWild/",
    cleanUrls: true,

    themeConfig: {
        nav: [
            { text: "Guide", link: "/library_api" },
            { text: "GitHub", link: "https://github.com/loumalouomega/fTetWild" },
        ],

        sidebar: [
            {
                text: "Getting started",
                items: [
                    { text: "Overview", link: "/index" },
                    { text: "Dependencies", link: "/dependencies" },
                    { text: "Library API", link: "/library_api" },
                ],
            },
            {
                text: "Algorithm",
                items: [
                    { text: "Pipeline overview", link: "/overview" },
                    { text: "Phase 1 — Preprocessing", link: "/preprocessing" },
                    { text: "Phase 2 — Triangle insertion", link: "/triangle_insertion" },
                    { text: "Phase 3 — Mesh improvement", link: "/mesh_improvement" },
                    { text: "Phase 4 — Filtering & booleans", link: "/filtering_and_booleans" },
                ],
            },
            {
                text: "Reference",
                items: [
                    { text: "Data structures", link: "/data_structures" },
                    { text: "Envelope & AABB", link: "/envelope_and_aabb" },
                ],
            },
        ],

        socialLinks: [
            { icon: "github", link: "https://github.com/loumalouomega/fTetWild" },
        ],

        search: {
            provider: "local",
        },
    },
});
