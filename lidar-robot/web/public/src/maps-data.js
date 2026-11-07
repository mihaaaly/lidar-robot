/* ------------------------------------------------------------------
   LiDAR Autonomous Robot · Map selection — demo library

   Static sample maps for the "Map selection" main screen. The geometry is
   transcribed from the Figma frame `LiDAR · Map selection` (43:4131):

     preview  -> the two-column map cards      (viewBox 0 0 412 148)
     hero     -> the selected-map panel        (viewBox 0 0 520 260)
     outline  -> points relative to the outline origin (x / y)
     walls    -> [x, y, width, height, kind] relative to the same origin
                 kind 1 = occupied area (filled), 0 = interior wall
     base     -> base point centre, relative to the outline origin

   The Figma file draws the big Robotics lab preview at a different scale,
   so MAP-001 carries an explicit `hero`. The other maps reuse their card
   geometry, fitted into the hero box at render time (see maps.js).

   ⚠️  DEMO DATA: nothing here is read from the robot. The metadata of the
   non-selected maps (dimensions, base point, file size) is illustrative.
   ------------------------------------------------------------------ */

(function (window) {
    "use strict";

    window.MAP_LIBRARY = {
        storageKey: "lidar.map",
        maps: [
            {
                id: "MAP-001",
                name: "Robotics lab",
                recent: true,
                order: 0,
                area: "240 m²",
                areaValue: 240,
                resolution: "0.05 m / px",
                updated: "Updated Today, 09:42",
                updatedShort: "Today, 09:42",
                description: "Indoor test environment with two rooms and a central passage.",
                dimensions: "20 × 12 m",
                frame: "map",
                baseCoordinates: "0.00 / 0.00 m",
                file: { name: "robotics_lab.yaml", format: "+ PGM · 1.2 MB" },
                preview: {
                    width: 412,
                    height: 148,
                    outline: {
                        x: 74.9,
                        y: 28,
                        points: [
                            [0, 0], [152.36, 0], [152.36, 8.7], [262.2, 8.7],
                            [262.2, 77.08], [212.59, 77.08], [212.59, 93.24], [0, 93.24]
                        ]
                    },
                    walls: [
                        [24.8, 12.4, 31.9, 17.4, 1],
                        [212.6, 26.1, 24.8, 22.4, 1],
                        [116.9, 59.7, 31.9, 18.6, 1],
                        [81.5, 63.4, 2, 29.8, 0],
                        [180.7, 82.1, 2, 11.2, 0],
                        [180.7, 44.8, 2, 24.9, 0],
                        [180.7, 8.7, 2, 22.4, 0],
                        [88.6, 44.8, 92.1, 2, 0],
                        [0, 44.8, 56.7, 2, 0],
                        [81.5, 0, 2, 34.8, 0]
                    ],
                    base: [113.4, 36.1],
                    dots: { radius: 0.75, spacing: 4.2 }
                },
                hero: {
                    width: 520,
                    height: 260,
                    outline: {
                        x: 94.5,
                        y: 49.2,
                        points: [
                            [0, 0], [192.3, 0], [192.3, 15.29], [330.93, 15.29],
                            [330.93, 135.41], [268.32, 135.41], [268.32, 163.8], [0, 163.8]
                        ]
                    },
                    walls: [
                        [31.5, 21.8, 40.2, 30.6, 1],
                        [268.5, 45.8, 31.3, 39.3, 1],
                        [147.5, 104.8, 40.2, 32.8, 1],
                        [102.5, 111.8, 3, 52.4, 0],
                        [228.5, 143.8, 3, 19.7, 0],
                        [228.5, 78.8, 3, 43.7, 0],
                        [228.5, 14.8, 3, 39.3, 0],
                        [111.5, 78.8, 116.3, 3, 0],
                        [0.5, 78.8, 71.6, 3, 0],
                        [102.5, 0.8, 3, 61.2, 0]
                    ],
                    base: [143.5, 63.8],
                    dots: { radius: 1, spacing: 4.6 },
                    labels: [
                        { text: "BASE POINT", x: 163.5, y: 57.8, tone: "accent" },
                        { text: "TEST AREA", x: 17.5, y: 91.8, tone: "dim" },
                        { text: "LAB / B", x: 245.5, y: 104.8, tone: "dim" }
                    ]
                }
            },
            {
                id: "MAP-002",
                name: "Office floor",
                recent: true,
                order: 1,
                area: "385 m²",
                areaValue: 385,
                resolution: "0.05 m / px",
                updated: "Updated Yesterday, 16:18",
                updatedShort: "Yesterday, 16:18",
                description: "Open-plan office layout with meeting rooms and a central corridor.",
                dimensions: "28 × 14 m",
                frame: "map",
                baseCoordinates: "1.20 / 0.80 m",
                file: { name: "office_floor.yaml", format: "+ PGM · 1.6 MB" },
                preview: {
                    width: 412,
                    height: 148,
                    outline: {
                        x: 64.3,
                        y: 34.2,
                        points: [[0, 0], [283.46, 0], [283.46, 82.05], [0, 82.05]]
                    },
                    walls: [
                        [106.3, 8.7, 49.6, 9.9, 1],
                        [28.4, 54.7, 70.9, 11.2, 1],
                        [223.2, 49.7, 2, 32.3, 0],
                        [141.7, 49.7, 2, 32.3, 0],
                        [184.2, 0, 2, 33.6, 0],
                        [70.9, 0, 2, 19.9, 0],
                        [219.7, 33.6, 63.8, 2, 0],
                        [85, 33.6, 99.2, 2, 0],
                        [0, 33.6, 49.6, 2, 0]
                    ],
                    base: [124, 29.8],
                    dots: { radius: 0.75, spacing: 4.2 }
                }
            },
            {
                id: "MAP-003",
                name: "Warehouse aisle",
                recent: false,
                order: 2,
                area: "620 m²",
                areaValue: 620,
                resolution: "0.05 m / px",
                updated: "Updated 04 Nov 2026",
                updatedShort: "04 Nov 2026",
                description: "Long storage racks with two parallel aisles and a loading bay.",
                dimensions: "38 × 16 m",
                frame: "map",
                baseCoordinates: "0.00 / 0.00 m",
                file: { name: "warehouse_aisle.yaml", format: "+ PGM · 2.1 MB" },
                preview: {
                    width: 412,
                    height: 148,
                    outline: {
                        x: 82,
                        y: 27,
                        points: [[0, 0], [248.02, 0], [248.02, 90.75], [0, 90.75]]
                    },
                    walls: [
                        [170, 43.2, 31.9, 31.1, 1],
                        [106, 43.2, 31.9, 31.1, 1],
                        [43, 43.2, 31.9, 31.1, 1],
                        [195, 0, 2, 27.4, 0],
                        [103, 27.2, 92.1, 2, 0],
                        [0, 27.2, 67.3, 2, 0]
                    ],
                    base: [106, 37.2],
                    dots: { radius: 0.75, spacing: 4.2 }
                }
            },
            {
                id: "MAP-004",
                name: "Test arena",
                recent: false,
                order: 3,
                area: "180 m²",
                areaValue: 180,
                resolution: "0.05 m / px",
                updated: "Updated 02 Nov 2026",
                updatedShort: "02 Nov 2026",
                description: "Compact arena used for obstacle-avoidance and docking tests.",
                dimensions: "15 × 12 m",
                frame: "map",
                baseCoordinates: "0.50 / 0.50 m",
                file: { name: "test_arena.yaml", format: "+ PGM · 0.9 MB" },
                preview: {
                    width: 412,
                    height: 148,
                    outline: {
                        x: 64,
                        y: 27,
                        points: [
                            [0, 9.95], [170.07, 9.95], [170.07, 0], [276.37, 0],
                            [276.37, 84.54], [152.36, 84.54], [152.36, 95.73], [0, 95.73]
                        ]
                    },
                    walls: [
                        [223, 52.2, 24.8, 18.6, 1],
                        [36, 20.2, 49.6, 9.9, 1],
                        [71, 64.2, 2, 31.1, 0],
                        [153, 62.2, 2, 33.6, 0],
                        [206, 0, 2, 27.4, 0],
                        [124, 42.2, 81.5, 2, 0],
                        [0, 42.2, 88.6, 2, 0]
                    ],
                    base: [124, 37.2],
                    dots: { radius: 0.75, spacing: 4.2 }
                }
            }
        ]
    };
})(window);
