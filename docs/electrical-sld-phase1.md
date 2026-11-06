# Electrical Design & Automatic SLD — Phase 1 Implementation

**Date:** 2026-11-06
**Branch:** `feat/electrical-sld` (based on `main` at `5ec08d7`)
**Scope approved:** Phase 1 only — typed contracts, PV Layout adapter, equipment catalog, test setup. **No UI changes.**

## Files added

| File | Purpose |
|---|---|
| `src/electrical/types.ts` | Shared contracts: layout snapshot, equipment specs, design/schedule/topology types |
| `src/electrical/layoutSource.ts` | Read-only adapter over the existing `solar-apps-pv-layout-v1` payload; normalisation, segments, fingerprint, storage/resolve helpers |
| `src/electrical/catalog.ts` | Seed equipment catalog (repo-sourced, unverified only), custom factories, readiness checks |
| `src/electrical/__tests__/layoutSource.test.ts` | 27 adapter/fingerprint/storage/segment tests |
| `src/electrical/__tests__/catalog.test.ts` | 22 catalog/readiness/factory tests |
| `vitest.config.ts` | Node-environment Vitest config (`src/**/*.test.ts`) |

## Files changed

- `package.json` — added `test` (`vitest run`) and `test:watch` scripts; `vitest@^3.2.7` dev dependency.
- `package-lock.json` — lockfile for the dev dependency.
- `tsconfig.node.json` — added `vitest.config.ts` to the node project.

No existing component, menu, route, payload writer, project record, or API endpoint was modified.

## Layout adapter behaviour

Reads the same payload as `PVLayout.tsx`, `BOQ.tsx`, `EngineeringReport.tsx`, and `PVLayout3D.tsx`.

- **Legacy key repair:** `panelWidth → moduleWidth`, `panelHeight → moduleHeight`, `panelWatts → watts`. Runtime `module*` keys win when both exist. Every remap is recorded in `legacyKeysNormalized`; the source payload is never rewritten.
- **Defensive parsing:** invalid panels/obstacles are skipped with explicit warnings; duplicate panel/segment ids are ignored with warnings; invalid/missing payloads return an empty snapshot instead of throwing.
- **REST envelope:** accepts `{ layout_data: { ... } }` in addition to the raw payload.
- **Segments:** if the payload contains no Field Segment model, exactly one `implicit-segment` is returned covering every panel. If segments exist, panels are grouped by `segmentId`; panels with an unknown or missing segment id go to `implicit-segment-unassigned`. No boundary is invented: a segment without corners is returned with `corners: []` and a warning.
- **Capacity:** `dcKwp = panelCount × settings.watts / 1000`, matching the existing BOQ/report derivation.
- **Fingerprint:** deterministic 16-hex hash of parsed settings, panels (sorted by id), site geometry, and segment settings. Stable across key/panel reordering; changes when panels, geometry, power, or site polygon change.
- **Source precedence:** remote payload with panels → local draft with panels → seed payload with panels → empty. This mirrors `PVLayout`'s current "remote only replaces panels when non-empty" behaviour. Because the payload still has no revision timestamp, ordering is precedence-based, not time-based.
- **Storage:** `layoutStorageKey(userId, projectId)` matches `solar-apps-pv-layout-v1:<userId>:<projectId|unassigned>`. `loadLayoutSnapshot` accepts an injected `StorageLike` so it is testable and never touches `window` when a storage argument is supplied.

## Catalog policy

- Seeds come only from `src/BOQ.tsx` and the seeded BOQ text in `src/defaultProjectsData.ts`.
- Every seeded entry is `verification: "unverified"`; fields not present in the repository are `null` (never `0`, never guessed from the model name).
- Seeded modules: JA Solar 550 Wp, Trina Vertex 575, LONGi Hi-MO 650, AIKO ABC 650 — nameplate power only.
- Seeded inverters: Solis/Growatt/Sungrow 10 kW 3-phase, Huawei SUN2000 10 kW, Huawei SUN2000 100 kW. Only values stated in the repo text are filled; all DC limits/MPPT currents/AC voltage remain `null`.
- `createCustomModuleSpec` / `createCustomInverterSpec` always produce `unverified` entries. Missing fields stay `null`.
- `moduleReadiness` / `inverterReadiness` return `{ ready, verification, missing, errors, warnings }`; `ready` requires all required fields and no validation errors, but an `unverified` spec still carries a "preliminary / cannot be approved" warning. A `verified` spec without `verifiedAt` is downgraded to `unverified` with an error.

## Verification (local)

```
npx tsc -b        → exit 0
npx vitest run    → 2 files, 49 tests passed
npx vite build    → exit 0 (pre-existing >500 kB chunk warning only)
```

## Intentionally not included

- No calculation engine (Phase 2).
- No `ElectricalDesign.tsx` shell or menu change (Phase 3).
- No topology/SLD renderer (Phase 5).
- No persistence endpoint, schema, migration, or revision write (Phase 6).
- No PV Layout segment model — the adapter documents and isolates that dependency.
- No fabricated datasheet values; real values must come from a datasheet import or a reviewer.

## Next gate

Phase 2 (`engine/strings.ts`, `engine/mppt.ts`, `engine/dcac.ts`, `engine/validation.ts` + the 11 fixtures) requires explicit approval.
