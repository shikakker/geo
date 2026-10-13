# Product Completion Status — geo

Canonical repository: `shikakker/geo`  
Completion branch: `portfolio-improvements-2026-08`  
Draft PR: #1

## Product boundary

A privacy-conscious demo of Vercel request geolocation headers. It displays only location metadata actually supplied by the hosting edge, never fabricates a fallback city/country, rejects client-spoofed internal geo query values, and prevents personalized location output from being shared through caches.

## T01–T10 core tasks

| ID | Status | Task |
| --- | --- | --- |
| T01 | DONE | Reproduced unsafe US/San Francisco/CA fallback behavior. |
| T02 | DONE | Explicit `Location unavailable` state replaces fabricated fallback values. |
| T03 | DONE | Country metadata/currency/language lookup is fail-safe. |
| T04 | DONE | Personalized responses are `private, no-store`. |
| T05 | DONE | Vercel request headers replace removed `NextRequest.geo`. |
| T06 | DONE | Runtime migrated to Next 16.3.5 / React 19.3 / Node 22. |
| T07 | DONE | Next 16 `proxy.ts` convention. |
| T08 | DONE | Removed `@vercel/examples-ui` coupling and legacy image props. |
| T09 | DONE | Verified deterministic package-lock + permanent frozen Quality. |
| T10 | BLOCKED | Exact-current Vercel preview/browser verification is rate-limited. |

## I01–I10 improvements

| ID | Status | Improvement |
| --- | --- | --- |
| I01 | DONE | Normalize country code. |
| I02 | DONE | Decode edge city header defensively. |
| I03 | DONE | Missing region/currency/language becomes unavailable, not exception. |
| I04 | DONE | Typed server-side props. |
| I05 | DONE | Responsive data-card layout. |
| I06 | DONE | Semantic description list. |
| I07 | DONE | Visible focus on external docs link. |
| I08 | DONE | Explicit coarse/provider-dependent location copy. |
| I09 | DONE | Internal geo rewrite query keys are cleared before edge-derived values are written, preventing client spoofing. |
| I10 | DONE | Permanent Quality enforces install/audit/tests/typecheck/lint/build. |

## F01–F10 product features

| ID | Status | Feature |
| --- | --- | --- |
| F01 | DONE | Edge-provided country/city/region. |
| F02 | DONE | Currency metadata when known. |
| F03 | DONE | Language metadata when known. |
| F04 | DONE | Educational display of Vercel geo header names. |
| F05 | DONE | Explicit unavailable state. |
| F06 | DONE | No fabricated default location. |
| F07 | DONE | Private/no-store personalized response. |
| F08 | DONE | Maintained Next 16 runtime. |
| F09 | DEFERRED WITH REASON | Exact GPS/browser permission intentionally out of scope. |
| F10 | DEFERRED WITH REASON | No persistent location history; unnecessary privacy risk. |

## Verification evidence

Earlier dependency bootstrap and release work verified Next 16 migration, package-lock, production audit, 12 regressions, typecheck, strict lint and production build.

### Latest client-spoofing slice

The proxy cloned the incoming URL and only set geo query keys when edge metadata was non-empty. A user-supplied `?city=San%20Francisco&country=US` could therefore survive when Vercel geo headers were absent/partial and be rendered by `getServerSideProps`, contradicting the no-fabrication product boundary.

- `9f32cc74b5eee757ce79a23592d46579c26f5a8d` — regression first: all internal geo query keys must be deleted before trusted edge-derived writes.
- `82d542f94a399ccd5425fb2ad4e4e4ffd535e644` — defines `GEO_QUERY_KEYS`, deletes those seven keys from the cloned URL, then writes only non-empty edge-derived location metadata. Unrelated query parameters are preserved.
- Exact-head Quality run `35282820114`, job `105408409949`: **PASS**:
  - `npm ci`: PASS;
  - production audit: PASS;
  - all tests including anti-spoof regression: PASS;
  - typecheck: PASS;
  - strict lint: PASS;
  - Next 16 production build: PASS.

## Hosted state

Canonical Vercel project `geo` remains connected. Exact runtime-head status for `82d542f9...` is still **Deployment rate limited** before application build, so hosted/browser proof is not claimed.

## Remaining release gate

**BLOCKED ONLY BY:** Vercel Hobby capacity for an exact-head preview/browser smoke.

## Project checkpoint

**PROJECT:** `geo`  
**Fixed this pass:** client query strings can no longer spoof trusted Vercel geolocation metadata when edge headers are missing/partial.  
**Verification:** exact-head install/audit/tests/typecheck/lint/build **PASS**; Vercel exact head = RATE-LIMITED.  
**Git:** `portfolio-improvements-2026-08`, Draft PR #1; verified runtime head `82d542f9...`.  
**Status:** **PARTIAL**.

No merge, production promotion, billing action or destructive operation was performed automatically.
\n\n## 2026-09-20 continuation

- P1 privacy boundary: edge-derived geo metadata no longer traverses the internal rewrite query string.
- `proxy.ts` clears client-supplied internal geo headers, writes trusted `x-geo-*` request headers, and still deletes spoofable legacy geo query keys.
- `pages/index.tsx` now reads only proxy-owned headers and sets `Cache-Control: private, no-store` on the SSR response itself.
- `tests/geo-boundary.test.mjs` permanently guards query removal, header ownership and SSR no-store behavior.
\n
- Exact-head Quality exposed a real TypeScript release blocker in `countryCodeToFlagEmoji`: string spread was incompatible with the repository target. It now uses `split('')`, preserving behavior while passing the configured typecheck target.

## 2026-09-23 verification refresh

- Runtime head remains `3550419b1d530efd501e5f72ee6532fb47793306`; no new P0/P1 was identified in the inspected proxy/header ownership and SSR privacy paths.
- GitHub Quality run `35504794468`: **SUCCESS**.
- Exact-head Vercel status: **SUCCESS**.
- Proxy-owned `x-geo-*` headers, spoofed-query removal, explicit unavailable state and private/no-store SSR remain intact.
- Remaining gate: interactive exact-preview browser QA.

Status remains **PARTIAL** only for browser verification. Keep Draft; no merge or production promotion.


## 2026-10-13 — Batch 11: root Geo vs EarthLens split, safe integration and preview

- Verified repository `main` at `7eb3c2603ec80fcbe4198f35550df4c79457e4da` contains two distinct applications: the obsolete root Next.js geolocation demo and the new `earthlens-3d/` Vite app.
- The root Vercel project `geo` (ID `prj_zYJOiKpFSDVfa7CxMgnbIYmzlAUt`) production deployment `dpl_AVeJRRcphfGGN53SJSXWKKUSPqto` failed during npm install with ERESOLVE: ESLint 8 vs eslint-config-next canary 16 requiring ESLint >=9. The open hardening PR #1 already has pinned Next 16.3.5, React 19.3, ESLint 9.39.5, lockfile and successful prior CI proof; it had diverged from main because EarthLens was added later.
- Created merge commit `8d31a808332a4e140229bf24cd2a328ce68bc522` in Draft PR #1 with two parents (old PR and latest main). Its tree retains exact `earthlens-3d/` tree `bd16cf02e7f2f210fb2232c9ed866f3123f26f25` and both workflows unchanged, together with the hardened root Next.js files. Comparison `main...PR` now shows **ahead 50, behind 0**, `mergeable=true`; **no merge to main**.
- Diagnosed a second deployment accuracy defect: Vercel EarthLens `dpl_CkT6MGn8shpSnH45Hm75Z341SBy4` reported READY but served legacy 2026-10-13 15:33 HTML with `./app.js` and `unpkg.com/maplibre-gl`, not current Vite bundle and local worker.
- Created an explicit **preview**, without production targeting, for PR SHA `8d31a80` against Vercel EarthLens project `prj_pF6396s5qJX4DfIOD6XdpBSRVyxj`, with Vite framework, root `earthlens-3d`, `npm run build`, output `dist`: deployment `dpl_44Zc3t8Cq6ys8bXGYidcjT875AEP` **READY**, at https://earthlens-3d-lz7sgbr9o-egordenisov.vercel.app/ .
- Vercel build logs show npm install **PASS**, Vite build **PASS**, Node integration **11/11 PASS** and worker/CSS output verification **PASS**. HTTP fetch of the exact preview returns **200** and `/assets/index-ytM9bjn7.js` plus bundled CSS; unlike the old production alias it has **no external MapLibre CDN or `./app.js`**.
- **Remaining gates:** actual Chromium viewport/console/network/3D tile and fallback QA on this exact preview; verify latest root Geo Next.js preview/build for merged SHA; determine Vercel root project deployment trigger and avoid indiscriminately promoting the PR. Old EarthLens production alias still serves the stale artifact; no automatic production promotion or destructive change made.
- **Status:** root Geo **PARTIAL**, EarthLens Vite **PREVIEW BUILD VERIFIED / BROWSER QA PENDING**, [Draft PR #1](https://github.com/shikakker/geo/pull/1).


## 2026-10-13 — Batch 11 continuation: exact-preview real browser QA

- **EarthLens exact working preview:** https://earthlens-3d-lz7sgbr9o-egordenisov.vercel.app/ at original code SHA `8d31a808332a4e140229bf24cd2a328ce68bc522` (Vercel `dpl_44Zc3t8Cq6ys8bXGYidcjT875AEP`), before this documentation commit. Node 24 isolated Vercel sandbox checked out GitHub source `fb670d9bc699756ed48fb36cbbac62571348acd3`. `npm test`: **11/11 PASS**.
- **Browser environment:** Browser plugin absent; real Playwright Chromium via Vercel Sandbox, with OS dependencies installed for Chromium. Executed the repository's `earthlens-3d/tests/browser-smoke.mjs` against the actual HTTPS preview.
- **Desktop 1440x900:** `pass:true`, WebGL2 `true`, engine `webgl-3d`, 3476 visible Manhattan building features, map/canvas 1440x900, loading spinner hidden, search visible, no horizontal overflow, **0 page errors**, **0 failed responses**.
- **Mobile 431x845:** `pass:true`, WebGL2 `true`, engine `webgl-3d`, 1164 rendered building features, map/canvas 431x845, spinner hidden, search visible, no horizontal overflow, **0 page errors**, **0 failed responses**.
- **Known non-blocking warnings:** 9 MapLibre warnings per viewport from OpenFreeMap styles (missing icon images and several malformed/null shield filters). Preserve as upstream/style quality follow-up; do not claim zero console warnings.
- **Root Geo exact working preview:** https://geo-nxa9k8xqp-egordenisov.vercel.app/ (deployment `dpl_CduEJuccRVmzgaxQFmivNUUaGi1V`, code SHA `fb670d9bc699756ed48fb36cbbac62571348acd3`) **READY**. Vercel `npm ci` and Next.js production build complete, replacing the previous production-root `ERESOLVE` failure. Real Playwright Chromium 375x820 and 1440x820: HTTP 200, title `Geolocation Header Demo`, heading `Geolocation`, real Vercel edge header-derived city Ashburn/US, no horizontal overflow, **0 page errors**. This does not verify every supported geo/currency combination.
- **Outstanding:** Gaussian/KHR 3D Tiles Tokyo/Redmond/Utrecht end-to-end, fallback rendering with GPU/provider failures, other viewports (768/1024), user camera controls and error-state interactions; current production aliases remain old/unpromoted. **Preview build + desktop/mobile smoke PASS; production readiness PARTIAL**. Keep Draft PR #1; do not merge, promote or change data.


### Deep-scene diagnostic (same date)
- Launched real Chromium deep-scene script `tests/scene-smoke.mjs` at preview with `EARTHLENS_SCENE_ID=tokyo-chiyoda-plateau` in a constrained Vercel Sandbox (1 vCPU/2 GiB). Initial MapLibre WebGL startup succeeded; after a 28-second Tokyo probe the Chromium page crashed during `page.screenshot` (`Target crashed`), so there is **no valid Tokyo PLATEAU renderer PASS**.
- Cause not yet established (large 3D GPU/memory load vs actual scene error); needs resource telemetry, smaller scene budget/limits and repeat Chromium with adequate memory. Do not mark scene support as verified based on 2D/OSM map success. Ordinary desktop/mobile map smoke remains PASS.
