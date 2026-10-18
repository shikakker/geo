# EarthLens 3D — satellite textures on roofs

This document describes the **implemented** roof-texture pipeline and its limits. The imagery must never be represented as genuine facade photography when no facade capture exists.

## Rendering path

1. MapLibre GL JS displays OpenFreeMap street labels, OSM building footprints, and a Terrarium DEM.
2. The **satellite mode starts enabled** unless the user previously disabled it; Esri World Imagery is drawn as a raster layer **below** OSM building extrusions and map labels.
3. At zoom >= 15.2, `satellite-roofs.js` requests visible building polygons from the already loaded `earthlens-3d-buildings` layer. The polygons and heights come from OSM vector tiles; heights may be estimated.
4. A geographic XYZ grid projects a 4×4 satellite-tile atlas onto each eligible roof polygon. The atlas is shared between nearby buildings, with a guard border. Large footprints automatically use a lower satellite zoom until all rooftop vertices fit, rather than stretching partial imagery.
5. `earcut` triangulates roof polygons, including courtyards. Roof vertices retain Web-Mercator geometry and UV coordinates derived from their world coordinates, rather than an arbitrary repeating material.
6. A custom MapLibre **3D** WebGL layer draws the texture on top of the extrusion roof and shares the map camera and depth buffer. Unsupported or untextured geometry keeps its ordinary 3D material.
7. Atlas downloads are bounded, cancellable, and memory-only. A small bounded RAM-only LRU reuses satellite tiles when users revisit a block; it is cleared when satellite mode is disabled. GPU buffers and textures are released when no longer needed and on style changes. DEM tile completion triggers a debounced roof reprojection to follow terrain.
8. If a valid georeferenced photogrammetry/3D Tiles scene loads, Cesium shows that genuine scene instead of fabricating photo textures.

## Coordinate and texture conventions

- Satellite tile addressing: Web Mercator XYZ (EPSG:3857), north-up, 256px tiles.
- Geographic coordinates: WGS84 longitude/latitude from mapped building footprints.
- Each UV is computed from the original world position and atlas bounds. Image north corresponds to `v = 0`; upload retains the canvas source row orientation (`UNPACK_FLIP_Y_WEBGL=false`).
- WebGL vertex buffers are camera-relative to reduce floating-point jitter at high zoom; the projection matrix is translated correspondingly.
- Terrain elevation is queried from MapLibre when available. Building heights come from the map's OSM vector attributes, and a small positive roof offset avoids z-fighting.
- Roof outlines are treated as **flat** unless an external 3D mesh provides more precise geometry. The engine does not infer a pitched roof shape from an overhead photograph.

## Data provenance and limitations

- Source: Esri World Imagery and its upstream contributors. Its attribution is preserved on the MapLibre raster source.
- Hosted imagery has licensing, coverage, rate, storage, and availability restrictions. **Do not assume it is free or unlimited**, do not bulk-download or permanently store the source images without permission, and verify service rights for a deployment.
- An overhead satellite image does **not** supply true building facade photographs. Streets, building sides and roofs can be off-nadir / occluded in the source capture. Incorrectly matched or unavailable tiles keep a neutral material.
- Projection onto an OSM roof outline does not correct the off-nadir roof displacement, reconstruction error, date mismatch or color mismatch between separate captures. True orthophotos or surveyed textured 3D models are needed for survey-grade alignment.
- Gaussian Splatting and photogrammetry are only used for known published datasets with authorized access; they are not generated from arbitrary satellite tiles in the browser.

## Acceptance and diagnostics

- `npm run check`: geometry/UV/layer preference unit and regression tests.
- `npm run build`: production Vite build.
- `node tests/browser-smoke.mjs`: desktop/mobile availability, real vector building volumes and UI.
- `node tests/satellite-roofs-browser.mjs`: deterministic local satellite-tile **test fixture**, actual Chromium/WebGL roof drawing, and pixel-difference comparison with the roof layer temporarily disabled. The fixture is **test-only**; production always requests the configured real imagery provider.
- Read-only live diagnostics: `window.__earthlensDiagnostics().satelliteRoofs` reports enabled state, triangulated roof count, atlas count, loaded/failed atlases, RAM atlas reuse, rendering timestamp and drawn triangles.

Do not mark the textured roof feature production-verified merely because a build passes. Require the exact-head GitHub Actions browser test to pass and inspect the generated screenshot and live imagery terms at the published URL.
