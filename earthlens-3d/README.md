# EarthLens 3D

Experimental globe-to-street 3D exploration app.

## Features
- OpenFreeMap/MapLibre vector maps, building extrusions based on available OSM attributes.
- Terrain relief from publicly hosted AWS/Mapzen Terrarium elevation tiles.
- Place search via Nominatim (user-submitted only, no autocomplete).
- Wikimedia Commons nearby geolocated photographs, linking to the source/license page.
- Building information panel with height, known levels, and explicitly labeled estimates.
- 2D/3D navigation, named destinations, camera URL sharing, responsive UI.
- Optional satellite style using a user-provided MapTiler public API key saved in the local browser.
- Experimental geolocated Gaussian-splat importer for preprocessed HTTPS scenes with CORS.

## Deployment
Existing GitHub repository: shikakker/geo. This app lives in earthlens-3d and does not overwrite the existing Next.js example.
For a separate Vercel project: Root Directory **earthlens-3d**, framework **Other**, build command **npm run build**, output directory **dist**. No secret environment variables required.

## Verification
Run **npm run check** and **npm run build** using Node 20+. Static output is in dist. For local preview, serve dist via an HTTP static server. Requires internet access for external MapLibre JS ESM CDN and map providers.

## Data quality and limitations
Global photo-real 3D imagery is **not** provided by OpenStreetMap building extrusions. The extrusion is geometric, not a photo-textured facade. Public OSM building height, actual floor counts and addresses vary by coverage. A floor value with **≈** means estimated from height, not a verified count. Nearby Wikimedia images may not depict the selected building exactly.
Gaussian splatting is a separate **experimental** plugin and requires compatible preprocessed 3D data and working external rendering module; merely entering a JPG won't create a splat. Review the plugin compatibility and large scene performance before production use. Optional satellite imagery incurs third-party provider limits.

## Attribution and provider policy
MapLibre: https://maplibre.org
OpenFreeMap: https://openfreemap.org
OSM: https://www.openstreetmap.org/copyright
AWS terrain: https://registry.opendata.aws/terrain-tiles/
Wikimedia Commons: https://commons.wikimedia.org
Nominatim: https://operations.osmfoundation.org/policies/nominatim/
MapTiler: https://www.maptiler.com
Do not bulk download tiles, scrape Nominatim, or assume media can be redistributed. Attribution remains visible in the rendered map and on Commons source pages.

## Roadmap
Typed local package dependencies, georeferenced 3D Tiles ingestion, verification of photo licensing, caching/rate limiting with provider agreement, automated visual E2E testing, Gaussian plugin API validation.
