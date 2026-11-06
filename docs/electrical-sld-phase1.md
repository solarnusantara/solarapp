# Electrical Design & Automatic SLD — Phase 1 Implementation

**Date:** 2026-11-06
**Branch:** `feat/electrical-sld` (Phase 1 commit `ed3b1fc`, then synced with `origin/main` at `27490f6`)
**Scope approved:** Phase 1 only — typed contracts, PV Layout adapter, equipment catalog, test setup. **No UI changes.**

## Files added

| File | Purpose |
|---|---|
| `src/electrical/types.ts` | Shared contracts: layout snapshot, equipment specs, design/schedule/topology types |
| `src/electrical/layoutSource.ts` | Read-only adapter over the existing `solar-apps-pv-layout-v1` payload; normalisation, segments, fingerprint, storage/resolve helpers |
| `src/electrical/catalog.ts` | Seed equipment catalog (repo-sourced, unverified only), custom factories, readiness checks |
| `src/electrical/__tests__/layoutSource.test.ts` | 28 adapter/fingerprint/storage/segment tests |
| `src/electrical/__tests__/catalog.test.ts` | 22 catalog/readiness/factory tests |
| `vitest.config.ts` | Node-environment Vitest config (`src/**/*.test.ts`) |

## Files changed

- `package.json` — added `test:watch`; kept upstream `test` script and `tsx`; resolved `vitest` to `^2.1.8` to match `origin/main`.
- `package-lock.json` — regenerated with `npm install` after the merge resolution.
- `tsconfig.node.json` — added `vitest.config.ts` to the node project.

No existing component, menu, route, payload writer, project record, or API endpoint was modified.

## Layout adapter behaviour

Reads the same payload as `PVLayout.tsx`, `BOQ.tsx`, `EngineeringReport.tsx`, and `PVLayout3D.tsx`.

- **Legacy key repair:** `panelWidth → moduleWidth`, `panelHeight → moduleHeight`, `panelWatts → watts`. Runtime `module*` keys win when both exist. Every remap is recorded in `legacyKeysNormalized`; the source payload is never rewritten.
- **Defensive parsing:** invalid panels/obstacles are skipped with explicit warnings; duplicate panel/segment ids are ignored with warnings; invalid/missing payloads return an empty snapshot instead of throwing.
- **REST envelope:** accepts `{ layout_data: { ... } }` in addition to the raw payload.
- **Segments:** if the payload contains no Field Segment model, exactly one `implicit-segment` is returned covering every panel. If segments exist, panels are grouped by `segmentId`; panels with an unknown or missing segment id go to `implicit-segment-unassigned`. Segment rings are read from the current `PVLayout.tsx` shape (`segments[].polygon`, with legacy `boundary.corners`/`corners`/`polygonCorners` still accepted). Per-segment power is read from `moduleWatts` (also `watts`/`panelWatts`). No boundary is invented: a segment without corners is returned with `corners: []` and a warning.
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

## Merge with `origin/main`

- `origin/main` moved from `5ec08d7` to `27490f6` (20 commits: multi-segment PV Layout, GIS, Helio engine, reports, 3D).
- A read-only `git merge-tree` check showed conflicts only in `package.json` and `package-lock.json`; no source, test, docs, or config collisions.
- Resolution: keep upstream scripts (`sync:helio-types`, `test`) plus Phase 1 `test:watch`; keep upstream `tsx`; use upstream `vitest ^2.1.8`; regenerate the lockfile with `npm install`.
- The upstream segment payload uses `segments[].polygon` and `moduleWatts`; the adapter was updated and covered by a new test. `FieldSegment` engine types remain separate.
- No existing Phase 1 file was dropped.

## Verification (local)

```
npx tsc -b        → exit 0
npx vitest run    → 21 files, 186 tests passed (50 Phase 1 tests)
npx vite build    → exit 0 (pre-existing >500 kB chunk warning only)
```

## Intentionally not included

- No calculation engine (Phase 2).
- No `ElectricalDesign.tsx` shell or menu change (Phase 3).
- No topology/SLD renderer (Phase 5).
- No persistence endpoint, schema, migration, or revision write (Phase 6).
- No per-segment string allocation yet; the adapter exposes segments for Phase 2.
- No fabricated datasheet values; real values must come from a datasheet import or a reviewer.

## Next gate

Phase 2 (`engine/strings.ts`, `engine/mppt.ts`, `engine/dcac.ts`, `engine/validation.ts` + the 11 fixtures) requires explicit approval.
