# EarthLens 3D — Product readiness (v1.0 release candidate)

EarthLens is a **geospatial exploration product**, not an unlimited hosting platform and not a verified real-estate inventory. Success means users can open a real interactive map, navigate to a place, see available 3D geometry, inspect trustworthy information, and return to saved views without broken screens.

## Core user journeys

| Journey | Implementation | Evidence required |
| --- | --- | --- |
| Open a usable map | WebGL2 MapLibre; Leaflet + Canvas 2.5D when WebGL cannot start | Desktop/mobile Chromium, real map tiles, nonblocking map loader |
| Inspect 3D objects | OSM building extrusions, tree canopies, optional real 3D Tiles & Gaussian scenes | Actual rendered geometry; fallback if scene tiles are unavailable |
| Search a location | User-submitted Nominatim lookup; bounded cadence, UTC-independent geocoding, accurate bounding-box zoom | Keyboard selection, stale-request cancellation, no automatic API spam |
| Inspect location information | OSM addresses, stops, road signals; Fintraffic cameras; weather model; attributed third-party photos | Honest per-provider labels, no fabricated live status or property prices |
| Save a place | Local bookmark for lat/lon/zoom/pitch/bearing, edit label, remove, revisit | Reopen from browser storage; private-mode in-memory fallback |
| Share a view | URL hash with coordinates, zoom, rotation and pitch | A newly opened link restores the map viewpoint |
| Weather | Open-Meteo now/+3/+6/+12 and local SunCalc | Provider timestamp UTC, model provenance, cached calls |
| Low-performance device | Automatic rendering quality, cancellation, tile cache and lazy optional modules | Mobile/headless Chromium; bundle budget; reduced-motion behavior |

## Data and licensing: what is **not** implied

- **OSM/OpenFreeMap**: voluntary OSM coverage differs by region. Addresses, tree tags, levels and building heights are not uniformly available or independently surveyed. No property-listing feed is included.
- **Real-estate and travel websites**: booking/Airbnb/Google/Yandex links are user-initiated *external searches*. EarthLens does not scrape availability, ratings or prices.
- **Weather**: Open-Meteo presents model estimates, not instrument readings at a clicked pin. Hosted free access has commercial-use restrictions and quotas; scale needs a permitted plan or self-hosted model.
- **Photos**: photos can be nearby or text-matched, not confirmed to depict the selected building. Source, author and license remain attached where provided. Requests are made when users open a place card.
- **Fintraffic**: available cameras show provider snapshots, not a live-stream guarantee. Geographic coverage is limited.
- **Gaussian scenes**: actual photogrammetry/3DGS requires published georeferenced datasets; no fabricated splat coverage. Failing remote 3D Tiles never blocks general OSM navigation.
- **200 optional GIS modules**: curated, tested npm catalog candidates, not 200 packages downloaded on each visit. Heavy deck.gl and loaders.gl engines need explicit activation and integration work.

## Reliability expectations

1. The loading overlay disappears when MapLibre becomes usable; a bounded fallback appears if vector rendering fails.
2. Provider failures do not erase the previous map. Stale OSM data is explicitly labeled. Weather errors and Fintraffic failures are visible when those layers are active.
3. A manual **Обновить данные** control retries current data after a 9-second minimum gap; no continuous background polling.
4. Map markers are frame-batched, reused and revived on rapid navigation. Tree sources transition after MapLibre finishes parsing the new GeoJSON.
5. The production entry bundle has a **1,650,000-byte uncompressed JavaScript budget** (not a substitute for network/CPU measurements).
6. No analytics, account or telemetry service is installed by the saved-places feature; saving stays local. Search and external data layers transmit needed queries to providers.
7. The app exposes the real package version in the footer and inside its on-device help dialog.

## Release gates

Run from `earthlens-3d/`:

```bash
npm ci
npm run check
npm run build
```

In CI, verify `EarthLens 3D - Build and Smoke Tests` (Node + desktop/mobile Chromium + bundle budget) and `EarthLens Library Catalog Audit` against the **exact PR head SHA**. External trial PLATEAU/Gaussian hosts are advisory; provider outages are not proof of an application failure.

Before production promotion, verify the specific Vercel team/project, that the head is reviewed, build is `READY`, map tiles load from the public URL, desktop/mobile navigation works, and no newly introduced console/API errors appear. Do not claim deployed merely because GitHub checks succeeded.

## Known operational blockers / next milestones

- **P0 — production freshness:** Vercel returned HTTP `402 api-deployments-free-per-day` after more than 100 deployment API calls/day. Until team quota resets or the owner changes the plan, the published domain may serve an older commit. This needs team-level resolution; do not bypass authorization or auto-change billing.
- **P0 — provider scaling:** public Overpass and Open-Meteo services are not suitable for unlimited high-volume commercial traffic. Production-scale use requires contracted data feeds or self-hosted caching/index infrastructure, service monitoring, and documented rights.
- **P1 — coverage and verification:** camera snapshots are currently Finland-specific; some external photo services may CORS-fail and return zero results. Each adapter should have periodically run contract tests and provider availability metrics.
- **P1 — product discovery:** evaluate favorites UX and map-layer clarity with real users, and perform actual GPU/device measurements (LCP/INP, map FPS, memory) in addition to headless smoke tests.
- **P1 — account sync and teams:** bookmarks are local-only; cloud sync, user identity, personal privacy/data export policies and collaborative maps are future products, not claimed implemented features.

This document is the release acceptance baseline, not an assertion that every listed external service is available worldwide.
