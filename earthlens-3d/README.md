# EarthLens 3D — automatic map with Khronos Gaussian Splatting

EarthLens now prioritizes the **map itself**. As the user zooms, detail increases automatically: vector basemap → OSM 3D extrusions and terrain → genuine registered Gaussian splat scene if one exists nearby. **No user uploads**.

Production: https://earthlens-3d.vercel.app

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
| MapLibre GL JS | Basemap, OSM extrusions, DEM terrain | Active |
| CesiumJS | KHR glTF / 3D Tiles with LOD | Active only near KHR samples |
| maplibre-gl-splat | Raw splat GIS bridge | Lazy raw scene adapter |
| Spark | Gaussian splat renderer | Transitive dependency of raw adapter |
| Three.js | Scene graphs and WebGL | Transitive dependency of raw adapter |
| maplibre-three-plugin | MapLibre/Three coordinate bridge | Transitive dependency of raw adapter |
| PMTiles | Static archive tile protocol | Registered on boot |
| 3d-tiles-renderer | Alternative 3D Tiles streaming | Candidate, not bundled |
| 3D Tiles RendererJS 3DGS Plugin | Alternative KHR/SPZ tiles | Candidate, not bundled |
| GaussianSplats3D | Standalone raw splat fallback | Candidate, not bundled |

Open-source code may be self-hosted without per-view API pricing; **this does not imply unlimited free hosted data, downloads, tiles, or photos.**

## Local usage

Requires Node.js >=20.

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
