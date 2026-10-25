# EarthLens / geo — Product Completion Status

**Product family:** EarthLens 3D (geospatial exploration). **Canonical application:** `earthlens-3d/` within `shikakker/geo`. Root `pages/` and root `package.json` on this stacked branch still contain a separate historical Vercel Next.js example and must not be mistaken for the 3D product.

**Batch:** 15 · **Status:** PARTIAL · **Git:** stacked [Draft PR #4](https://github.com/shikakker/geo/pull/4) (base: `feature/earthlens-explore-layers-20261016`, [Draft PR #2](https://github.com/shikakker/geo/pull/2)); `main` untouched.

## 2026-10-25 — P1 geocoder verification and deployment root cause

- T01 DONE IN CODE: Nominatim geocoder caps searches and request cadence, applies an unconditional ten-second cancellation budget including hung JSON bodies and non-cooperative fetch, protects stale results and retains keyboard semantics.
- T02 DONE VERIFIED TARGETED: exact `geosearch.js` blob `e02609109e43cf2faba8c7bfb40aa52268f658aa`, exact test blob `3652b7532c8108fe24fe5cbc39d74e073049c43f`, `node --test tests/geosearch-product.test.mjs` **6/6 PASS** in isolated Vercel Sandbox with Git hash verification. No live third-party Nominatim call made.
- T03 BLOCKED — Preview `dpl_DzdrrKtRJKFVxJ9LX6yhiYy2DPTt` of exact PR4 head `ef386b5` failed during root `npm install`. Error: root `eslint-config-next@canary` requires ESLint >=9 while root `eslint@^8.9.0`; the root package is an unrelated historical sample with `next@canary`. Vercel project `geo` currently selects that root instead of the `earthlens-3d` Vite application. **Do not disable peer checks or count this as an EarthLens runtime failure.** Establish a distinct correctly scoped Vercel project/root for `earthlens-3d` or validate exact PR4 source in a targeted sandbox before any release.
- I01–I10: P1 next priorities are exact-head `earthlens-3d/npm ci && npm run check && npm run build`, real MapLibre/Leaflet browser QA 375/768/1024/1440, map tile loading, keyboard search, errors and 3D LOD memory. Other improvements deferred until current stacked PRs are reconciled.
- F01–F10: Existing geospatial feature roadmap documented in `earthlens-3d/PRODUCT-READINESS.md`. No unrelated features added to fix a build configuration.
- **Deploy:** NOT READY for exact PR4. **Production:** NOT CHANGED. **Merge:** NOT PERFORMED.

**Next action:** map `earthlens-3d` to its own Vercel preview root without changing an unrelated production project; then run exact-head build, interactive smoke and preview verification. Keep provider claims/coverage truthful.

## 2026-10-26 — P1 invalid-coordinate rejection and exact preview

- **RED confirmed:** persisted map views with `lat:''/lng:''`, nulls or empty arrays became a valid-looking point at (0,0) because `Number('')===0`, `Number(null)===0`; Nominatim responses containing null records crashed during `item.lat` access. These are source/accuracy bugs, not merely theoretical input constraints.
- **Regression commit `9291e6db7006d0c61f86682bad3c2c623029ae97`:** saved-place and geosearch tests for blank/null/array coordinates and valid numeric/string zero.
- **Fix `796ba2327df6c4ecad5045394312699ca60e7783`:** decimal-only parsing of numeric coordinate values; missing/blank/array entries are rejected, malformed upstream records are skipped without blanking the whole search. Legitimate equator/Greenwich zero coordinates continue to work.
- **Exact-source Node 22 proof:** two focused tests **RED 0/2 → GREEN 2/2 PASS**.
- **Exact-head Vercel preview `dpl_A5Ka2QV3wmHR6ZB9pd43gW2m7WLB`:** **READY** at https://earthlens-3d-kpuwfqtau-egordenisov.vercel.app. Vercel build logs: **79/79 tests passed, 0 failed**; build completed. Project `prj_pF6396s5qJX4DfIOD6XdpBSRVyxj` correctly builds Vite app in `earthlens-3d/`, unlike unrelated root Next.js example.
- **Remaining:** interactive MapLibre/WebGL/Leaflet browser QA, mobile widths 375/768/1024/1440, geocoder live Nominatim calls, tile/DEM data and camera/PLATEAU/3D external-source verification. No production promotion or merge. **PARTIAL**, PR#4 remains Draft.
