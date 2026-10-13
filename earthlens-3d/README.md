# EarthLens 3D — automatic map with Khronos Gaussian Splatting

EarthLens now prioritizes the **map itself**. As the user zooms, detail increases automatically: vector basemap → OSM 3D extrusions and terrain → genuine registered Gaussian splat scene if one exists nearby. **No user uploads**.

Production: https://earthlens-3d.vercel.app

## Map reliability — 2026-10-13 hotfix

The original map could render as a blank screen because MapLibre GL JS 6 has no default export, and because its standalone Web Worker must be explicitly bundled by Vite. The fix now:
- Bundles MapLibre GL JS 6.14, its CSS and the worker **locally** from npm dependencies; entry uses a namespace import and worker import with the documented **?worker&url** suffix.
- Uses five keyless OpenFreeMap styles (Liberty, Bright, Positron, Fiord, Dark) via the compact "СЛОЙ" button.
- Watches startup: if WebGL is absent, the remote style/worker fails, or map fails to become ready in 12 seconds, switches to a **locally bundled Leaflet** viewer with **official OSM raster tiles**. It preserves search, location, share URLs and the Gaussian-scene catalog.
- Keeps original map viewport dimensions with fully bundled CSS, and never indefinitely hides the page behind the loading indicator when a WebGL render failure occurs.
- Node unit/integration tests verify the real worker import, offline-bundled JS/CSS, automatic fallback and source registry.
- Important: OSM raster tile server is a fair-use fallback only, **not** an unlimited tile CDN; see https://operations.osmfoundation.org/policies/tiles/. OpenFreeMap is primary and states no map-view limits, but no SLA.


## October 2026: genuine 3D globe, global buildings and open real-world city models

EarthLens **now starts over Midtown Manhattan with 3D WebGL2 buildings**, not a flat 2D map.
The MapLibre GL JS v6 startup bug was caused by calling removed \`maplibregl.supported()\`; it has been replaced by an explicit WebGL2 capability probe. The worker is bundled locally by Vite. Actual Chromium smoke results: **3,476 rendered New York buildings desktop, 1,164 buildings mobile** at startup, MapLibre WebGL2 active, 0 page JavaScript errors.

- Global OSM vector building footprints and public elevation via OpenFreeMap and AWS Terrarium DEM; extrusion height is data-based where height exists, heuristic otherwise.
- Zoomed-out world is a globe. Moving into a city enables projected and shaded **real geometric 3D buildings**. WebGL2 absent: locally bundled Leaflet with Canvas2D pseudo-3D volume extraction from OpenFreeMap PBF building tiles, not GPU-dependent.
- Photoreal **Gaussian splats** only at actual captured sites: public Cesium 110M-splat Microsoft Redmond campus via evaluation ion asset **4547222**; third-party KHR Gaussian Wilhelmina Utrecht 3D Tiles example.
- **Japanese Project PLATEAU** official open government 3D CityGML-derived **3D Tiles, LOD2**: Chiyoda, Tokyo, and a nationwide municipality composite catalog. These are high-fidelity *geometric/possibly textured city models*, **NOT Gaussian splats**. Street-scale image quality varies by dataset and municipal coverage. Reference: https://docs.plateauview.mlit.go.jp/datasets/3d-tiles/ . The official 2023 PLATEAU orthophoto tiles supplement Tokyo where imagery is available.
- Exact official Tokyo URL: https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13101-bldg-lod2-latest/tileset.json
- Nationwide *participating Japan cities* composite: https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/all-bldg-maxlod2-latest/tileset.json
- A georegistered scene is loaded automatically when camera zoom and geo coordinates match the manifest. User uploads are not needed. Detail switches off gracefully if provider is unavailable. Camera exit has a 30s cooldown to avoid accidental reload loops.
- Screenshot tests run in real headless Chromium (desktop/mobile). A separate scene probe checks Tokyo PLATEAU and Redmond Gaussian and logs actual network responses.

**Data costs/licensing:** open-source renderer code does not equal unlimited dataset hosting. PLATEAU is an experimental Japanese government data service with no guaranteed SLA, attribution requirements and variable coverage. Cesium public evaluation asset and third-party sample URLs can enforce access/usage limits. Do not claim these models cover every building with textures or Gaussian data.

## Progressive zoom

1. MapLibre uses OpenFreeMap vector tiles as global basemap.
2. At zoom 13+ OpenStreetMap building footprints are extruded according to available height attributes and a public Terrarium DEM provides terrain.
3. The scene catalog (scenes.json) is queried as the camera moves. When both the location and threshold match:
   - khr-3dtiles: native CesiumJS renderer loads glTF KHR_gaussian_splatting / KHR_gaussian_splatting_compression_spz_2 packaged as 3D Tiles LOD.
   - raw-splat: lazy maplibre-gl-splat + Spark + Three.js renderer loads a pre-registered georeferenced .splat/.spz/.ply/.sog/.ksplat URL.
4. Users can zoom out again. On missing scenes the true geometric OSM map remains; **no fabricated photorealistic façades**.
5. Clicking a building reveals known height, known floor count or a clearly marked estimated count, and nearby geolocated Wikimedia Commons photos.

## First pilot scene: Wilhelmina

The pilot is a third-party public KHR 3D Tiles demo whose source includes the real ECEF transform:
- Latitude: 52.087424; longitude: 5.139727 (Netherlands).
- Source repository: https://github.com/bertt/3DGS-3DTiles-demo
- Public tileset: https://bertt.github.io/3DGS-3DTiles-demo/tileset-data/tileset.json
- Format: KHR_gaussian_splatting and KHR_gaussian_splatting_compression_spz_2.
- Auto-load condition: center within 210 meters, zoom >= 17.2.
- No copying/re-hosting: rendered from source. Redistribution rights for the captured object are **not assumed**.

Start at the sample location, zoom in, and observe the renderer switching from OSM to a genuine 3D Tiles Gaussian scene. Streaming depends on third-party availability and browser GPU support.

## Ten open-source libraries

See open-source-stack.json for licenses, source links, precise component status and purpose. Not all ten are instantiated: redundant 3D engines must **not** run at the same time.

| Library | Role | Status |
| --- | --- | --- |
| MapLibre GL JS | Basemap, OSM extrusions, DEM terrain | Active, locally bundled |
| CesiumJS | KHR glTF / 3D Tiles with LOD | Active only near KHR samples |
| maplibre-gl-splat | Raw splat GIS bridge | Lazy raw scene adapter |
| Spark | Gaussian splat renderer | Transitive dependency of raw adapter |
| Three.js | Scene graphs and WebGL | Transitive dependency of raw adapter |
| maplibre-three-plugin | MapLibre/Three coordinate bridge | Transitive dependency of raw adapter |
| Leaflet | OpenStreetMap raster fallback (fair use) | Active, locally bundled |
| 3d-tiles-renderer | Alternative 3D Tiles streaming | Candidate, not bundled |
| PMTiles | Optional self-hosted tile archive | Candidate, not bundled |
| GaussianSplats3D | Standalone raw splat fallback | Candidate, not bundled |

Open-source code may be self-hosted without per-view API pricing; **this does not imply unlimited free hosted data, downloads, tiles, or photos.**

## Local usage

Requires Node.js >=20. Vite production bundles MapLibre JS/CSS/worker and Leaflet fallback locally, removing the initial CDN dependency.

~~~sh
npm test
npm run check
npm run build
cd dist
python3 -m http.server 8080
~~~

The static build includes Node test suite validation and copies scenes.json plus open-source-stack.json into dist.

## Deployment

The project lives inside the existing shikakker/geo repository, directory earthlens-3d, without modifying the old root app. Vercel project name: earthlens-3d.

Use framework Vite/static, build command npm run build, output dist. GitHub Login Connection must be linked in Vercel for automatic deployments on future Git pushes; direct file deployments require an explicit deploy.

## Sources / licensing

- Khronos specification: https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_gaussian_splatting/README.md
- Khronos demo reference: https://www.youtube.com/watch?v=F-S-x0b9TrE
- OSM: https://www.openstreetmap.org/copyright
- OpenFreeMap: https://openfreemap.org
- Elevation / Mapzen: https://registry.opendata.aws/terrain-tiles/
- Nominatim (public server limit: <=1 query/second; no autocomplete): https://operations.osmfoundation.org/policies/nominatim/
- Wikimedia Commons: https://commons.wikimedia.org

Globally continuous **photorealistic** 3D content is not in these libraries. Photogrammetric 3D meshes or actual Gaussian-splat scenes must exist and be georeferenced, licensed, optimized and hosted. Future work: more verified scans, wider coverage, tile caching, provenance, LOD budgets and visual browser QA.
