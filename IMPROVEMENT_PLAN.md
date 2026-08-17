# Completion plan

1. Define `geo` from its actual small Next.js Pages Router implementation: country data, a world-map SVG, middleware and one main page. Do not position it as a full GIS platform until the user flow/data behavior supports that.
2. Inspect `middleware.ts` and document exactly what geography signal it uses (for example request geolocation/headers). Treat IP-derived location as approximate, handle unavailable/local development cases and never imply precise user location.
3. Audit `lib/countries.json` provenance, schema and update date. Normalize country code/name/region fields and document the dataset source/license rather than presenting an unexplained static JSON file as authoritative current geopolitical data.
4. Review `scripts/countries.js` as the dataset-generation path: make it reproducible, deterministic and safe to rerun; document source inputs and avoid manual divergence between generated JSON and map identifiers.
5. Make `public/map.svg` accessible and robust: keyboard/focusable country interactions if interactive, text alternative/summary, responsive scaling and explicit handling when SVG country IDs do not map to the country dataset.
6. Define a useful core interaction instead of decorative geography: detected/selected country, country details and clear manual override. Never force content or redirect solely based on approximate geolocation without user control.
7. Add privacy messaging appropriate to the implementation: if no coordinates are collected/stored, say so; do not add analytics/location persistence by default. Avoid exposing raw IP or sensitive request headers to the client.
8. Modernize only where valuable: assess the old Next.js/Pages dependencies for security/support, pin Node/package manager and migrate incrementally rather than rewriting a small working visualization solely for framework novelty.
9. Add unit tests for country-code lookup/generation and middleware fallback plus interaction tests for selection/manual override/map mismatch. CI runs lint/typecheck/tests and Next.js production build.
10. Rewrite README as verified geographic visualization/demo documentation: actual dataset and source, approximate geolocation behavior, map interaction, privacy, setup, screenshots and limitations.
