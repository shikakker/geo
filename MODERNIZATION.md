# geo — Geolocation Engineering Roadmap

The repository contains a Next.js/TypeScript app with edge middleware, library code, pages and scripts. Geolocation behavior should be treated as privacy-sensitive infrastructure.

## 10 tasks

1. Document exactly which location signals `middleware.ts` reads and how they affect routing or UI.
2. Define behavior for missing, malformed, localhost and proxy/CDN geolocation data.
3. Avoid presenting IP-derived location as precise physical location; document accuracy limitations in product copy.
4. Minimize storage/logging of location and IP-derived data and document retention assumptions.
5. Add tests for representative countries/regions, absent headers and fallback behavior.
6. Add explicit user-facing fallback states when geolocation cannot be resolved.
7. Add CI for lint, type-check, tests and production build.
8. Audit middleware caching and redirects to prevent location leakage or incorrect cached regional responses.
9. Upgrade the historical Next.js stack incrementally and verify current edge-runtime compatibility.
10. Create a portfolio case focused on edge middleware, privacy-aware UX and fallback design rather than overstating geolocation precision.

## Portfolio value

A useful small infrastructure case when framed around edge request handling, product behavior and privacy constraints.