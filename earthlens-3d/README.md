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

## 2026-10-13 reliability release

- **Redmond Cesium ion asset 4547222 disabled**: public browser requests returned 401. There is no login or upload step for end users. The metadata remains in `scenes.json` marked `enabled:false` for provenance; no misleading automatic map marker or failed button.
- The open Utrecht `KHR_gaussian_splatting` 3D Tiles scene remains the supported photographic pilot. Japan PLATEAU open geometric LOD2 tiles remain enabled.
- The map stays in actual global OSM 3D mode while loading Cesium and switches only after a *visible content tile* is rendered. A 27-second timeout restores the map if geometry cannot stream; no blank detail view.
- GitHub Pages release now runs **real desktop + mobile Chromium WebGL2 smoke tests** before publishing. This prevents a return to the previous flat-map regression.

## Visual validation of real Gaussian geometry

In Chromium smoke tests the app now decodes a PNG screenshot for the center of each registered detail scene and validates its luminance standard deviation. Cesium reports a tile as visible before its GPU shader / splat textures have finished initializing; the viewer consequently uses a short warmup delay after the first visible tile before fading from MapLibre's proven 3D scene. A flat colored background is rejected by the smoke test, even when Cesium's metadata and tile events succeeded.

## Cesium Gaussian Splat LOD tutorial integration (October 2026)

Upstream guide (Apache-2.0 example): https://cesium.com/learn/cesiumjs-learn/3d-guassian-splat-tilesets-lods/

This is a native integration, not an iframe. On a registered scene, the existing MapLibre map remains visible while **CesiumJS v1.141** creates an offscreen Viewer, streams 3D Tiles and verifies the first visible tile. Only then does it reveal detailed geometry. Controls appear within the existing 3D scene banner:

- **AUTO**: SSE 16 px desktop; SSE 32 px on phones, slow connections and low-memory devices.
- **FAST**: SSE 32 px. Better performance, coarser 3D Tiles hierarchy.
- **BALANCE**: SSE 16 px.
- **DETAIL**: SSE 8 px. Sharper result at potentially greater network and GPU cost.

Clicking a mode updates the active \`Cesium3DTileset.maximumScreenSpaceError\` without rebuilding the scene. \`Cesium3DTileset.loadProgress\` reports outstanding requests and processing. For diagnostics add \`?lodDebug=1\` to the website URL and press **ГРАНИЦЫ** to see tile hierarchy bounding boxes. The quality choice persists in this browser. Users **never upload 3D files**.

### Microsoft Redmond Campus (tutorial asset 4547222)

The Cesium guide showcases ~110 million splats across 3.7 km² and a camera at longitude **-122.141186**, latitude **47.644605**, altitude **170.48 m**, heading **100°**, pitch **-25°**. EarthLens now preserves exactly this tutorial camera and enables this scene only when the **project owner** configures Cesium ion access. In previous production Chromium runs the public asset endpoint returned HTTP **401**, so simply making the button visible would create a broken experience.

**Owner configuration (optional, no end-user token or upload):**

1. In the Cesium ion dashboard, create an **assets:read-only public application token** with access to the desired published 3DGS LOD dataset. If asset 4547222 is unavailable to your account, obtain viewing access from the asset owner or publish an equivalent authorized asset and adapt the scene manifest.
2. Restrict allowed origins/domains to **https://shikakker.github.io** (and any future Vercel domain) in Cesium ion if the account supports it. Never use an account-wide default token or an \`assets:write\` token in a public client.
3. GitHub \`shikakker/geo\` → **Settings → Secrets and variables → Actions → Variables**: set \`CESIUM_ION_PUBLIC_TOKEN\`. A Pages rebuild passes it into Vite as \`VITE_CESIUM_ION_PUBLIC_TOKEN\`. It is intentionally client-visible, *not a secret*. Create a restricted read-only token.
4. Once a new Pages workflow successfully builds, the **✳ Cesium LOD** destination is automatically enabled. If Cesium still responds 401/403, EarthLens remains on the 3D OSM map with a temporary retry cooldown.

**Without the token**, existing open **Utrecht KHR Gaussian Splat** and **Tokyo PLATEAU 3D Tiles** still work and now use the same LOD controls. CESIUM_WORLD_TERRAIN is opt-in through \`VITE_CESIUM_WORLD_TERRAIN=true\` and requires authorized Cesium ion access; default uses open-map imagery and ellipsoid terrain within the Cesium detail view.

Reference on SSE: https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html

## October 16: Explore layers (feature branch)

- New compact, collapsible world layer panel; addresses, OSM geolocated trees/green areas, bus stops, road signals, mapped buildings and Finnish Digitraffic road weather cameras. Objects are requested at zoom 13+ around the viewport with capped result counts. OpenStreetMap coverage is uneven; trees are mapped points, **not** fictional globally continuous photorealistic trees.
- Optional Esri World Imagery imagery tiles under required attribution. Service terms and capacity restrictions apply; not a self-hosted open-source unlimited satellite tile service.
- Click a feature or map location to open a bottom photo gallery. Wikimedia Commons, Wikipedia, Panoramax, iNaturalist, KartaView and Openverse are keyless integrations (individual public endpoints may reject CORS, throttle, lack imagery, or change schemas). Optional API-key integrations: Mapillary, Flickr and Unsplash. OSM-linked feature photos count as tenth source adapter. Photo provenance and distance labeling avoid claiming a nearby photo depicts the selected property.
- Property search buttons lead to Airbnb, Booking.com, Google Travel and Yandex Realty search pages, **not listing feed integration**. No unauthorized scraping or fabricated inventory.
- Supplemental geospatial candidate library list in explore-layers.js is **not installed as ten extra npm dependencies**; adopt individually when required for performance and data processing.
- Finland camera photos are still images updated periodically (about 10 minutes), not a live video stream. Other countries need their own authorized camera feeds.
- API quotas, attribution, availability and licences remain provider-specific. Overpass servers are shared community services and must not be used as production unlimited infrastructure: production should adopt cached/self-hosted extracts and a licensed traffic provider.


## October 16: progressive rendering, weather and 10 OSS addons

Version 0.4.0: Objects load and appear progressively without a full marker teardown. Existing MapLibre markers persist across Overpass queries by stable identity; newly loaded icons rise/fade in, old icons fade out. Buildings fade in, OSM tree 3D canopies rise progressively and satellite imagery crossfades. Photo gallery thumbnails enter smoothly. Reduced-motion settings are respected.

The geographic overlay waits 850 ms after a map move, cancels stale requests, reuses data with a bounded 4-minute OSM cache, and limits visible markers on phones. The map remains usable during network failures. Shared Overpass endpoints may throttle or fail and must be replaced by hosted regional extracts for substantial production traffic.

Enable **Погода** in the layer panel: Open-Meteo model weather (temperature, feels-like, precipitation, cloud cover, wind, pressure, humidity) appears as georeferenced markers. Click one for details. Data is batched (up to five coordinates), cached for 15 minutes, and failures are shown instead of inventing weather. Source attribution appears in the weather card.

Ten extra permissively licensed npm dependencies are **installed on demand through Vite lazy imports**, never loaded all on initial view:

| Package | License | Role |
| --- | --- | --- |
| supercluster | ISC | Feature clustering |
| rbush | MIT | Spatial indexing |
| @turf/distance | MIT | Spherical distances |
| @turf/bbox | MIT | Bounding boxes |
| @turf/boolean-point-in-polygon | MIT | Containment queries |
| d3-ease | BSD-3-Clause | Easing |
| d3-interpolate | ISC | Value transitions |
| d3-array | ISC | Numeric/geodata aggregation |
| d3-scale | ISC | Weather temperature colors (active when weather enabled) |
| proj4 | MIT | Coordinate projections |

The add-ons have no provider usage quotas when self-hosted. **That does not make Open-Meteo or imagery services unlimited.** Open-Meteo's free tier is non-commercial only, with <10,000 requests/day and additional hourly/minute limits: https://open-meteo.com/en/terms . Production and commercial operation require licensed service arrangements.

GitHub Actions checks syntax, Node regression tests, Vite build and desktop/mobile Chromium smoke. Draft PR code is not a verified production deployment.
