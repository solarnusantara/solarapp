# PV Layout 2D — Keepouts, Walkway & Advanced — Phase 0 Audit

**Date:** 2026-11-06
**Repository:** `D:\PROCOD\solarapp`
**Branch:** `feat/electrical-sld` (HEAD `a0a9313`, clean working tree)
**Local `main` / `origin/main`:** `fbb7d79`
**Baseline commands (current tree):** `npx tsc -b` pass · `npx vitest run` 21 files / 186 tests pass · `npx vite build` pass (pre-existing >500 kB chunk warning only)

**Scope:** Read-only audit for the plan
`SolarApps_PVLayout2D_Walkway_Advanced_Agent_Plan.md`.
No source file is changed by this phase. This document is the Phase 0 deliverable.

---

## 1. Exact files and functions in scope

| File | Relevant functions / regions | Role |
|---|---|---|
| `src/PVLayout.tsx` (~115 KB) | `Walkway` (66), `Obstacle` (47), `LayerState` (75), `generatePanelsForSegment` (259), `loadSaved` (310), `HistoryEntry` (355), `applyLayoutData` (391), `saveDraft` (677), `pushHistory` / `handleUndo` / `handleRedo` (718–746), `handleDeleteSegment` (824), keyboard handler (940), `handleBackgroundUpload` (1055), step bar (1140–1186), walkway toolbar button (1715), canvas pointer handlers (1861–1961), walkway render (2032), obstacle render (2060), segment render/handles (2088–2200), Advanced/Electrical panel mount (2325), Layers panel (2340–2401), satellite upload/opacity (2404–2446) | Owns all 2D layout state, canvas, history, persistence and step UI |
| `src/engine/EngineRunPanel.tsx` | component (28), sections (76–145) | Actual content of steps 4/5; no Shading/Overlays/LiDAR UI |
| `src/engine/WeatherPanel.tsx` | weather dataset list / create / compare / CSV | Real weather dataset UI; no shading calculation UI |
| `src/engine/client.ts` | `getShade` (383), `getIsoShading` (386), weather/site/simulation endpoints | Real Helio HTTP client; shade/iso-shading endpoints exist but are not called from PV Layout UI |
| `src/engine/sceneAdapter.ts` | `buildFrame` (48), `layoutToScene` (133), keepout mapping (221–242) | PV Layout (`mm`, Y-down) → Helio scene (`ENU m`) |
| `src/engine/layoutStore.ts` | `SavedLayout` (8), `readLocalLayout` (28), `loadLayout` (42) | Reads the saved payload; `walkways`/`obstacles` are first-class fields |
| `src/PVLayout3D.tsx` | `DemGrid` (26), `fetchDem` (~282–318), terrain mesh (~556–615) | DEM terrain visualisation; no LiDAR point cloud |
| `src/gisSolarService.ts` | Google Solar `buildingInsights:findClosest` (237–309), NASA POWER, Open-Meteo | GIS/weather/solar insights; not LiDAR |
| `src/GoogleMapsModal.tsx` | editable polygon, Static Maps crop, `onApply` (1127) | GIS boundary + satellite image source; no KML/KMZ or overlay import |
| `src/api.ts` | `fetchProjectLayout` (143), `saveProjectLayout` (159) | REST persistence with localStorage fallback; backend not in this repo |
| `src/defaultProjectsData.ts` | `walkways` (127–132), `obstacles` (133–135, 163, 191) | Seeded project layouts that already contain walkways |
| `src/reports/isoProjection.ts` | `walkway` layer (81, 139) | Report renderer consumes walkway rectangles |
| `src/engine/fixtures/regenerate.test.ts` | calls `generatePanelsForSegment(..., walkways)` (13) | Existing regression coverage for generation with walkways |
| `src/engine/sceneAdapter.test.ts` | walkway → height-0 keepout (89–96) | Existing adapter coverage |
| `vitest.config.ts` | `environment: "node"`, `include: ["src/**/*.test.ts"]` | No jsdom; only pure/unit tests today |

`PVLayout.tsx` is the only owner of the 2D layout payload. There is no separate walkway store, service, or second source of truth.

---

## 2. Current Walkway data model and persisted representation

```ts
export interface Walkway {
  id: string;      // e.g. "w-1720000000000" or "w-v1"
  x: number;       // mm
  y: number;       // mm
  w: number;       // mm
  h: number;       // mm
  label?: string;  // e.g. "Walkway 2m"
}
```

- Geometry is an **axis-aligned rectangle in millimetres** on the 2D canvas (Y down). There is no centerline+width model, no polygon, no circle and no rotation.
- `Obstacle` is a different type: `{ id: number; x; y; w; h; label; heightM?: number }`. Also an axis-aligned rectangle in mm, with an optional real height.
- `LayerState` has two separate booleans: `keepouts` and `walkway` (`PVLayout.tsx:75–84`).
- Persisted payload (`saveDraft`, 687–700) contains `walkways: Walkway[]` and `obstacles: Obstacle[]` as sibling arrays, plus `segments`, `panels`, `site`, `backgroundImage`, `backgroundOpacity`, `layers`, `savedAt`, `engine_inputs`.
- Storage writes both `<user>:<project>` and a project-scoped key; remote save uses `POST /api/design/projects/:id/layout` (`PVLayout.tsx:702–710`, `api.ts:159–169`).
- `loadSaved` tries project key → user key → richest `solar-apps-pv-layout-v1:*:<projectId>` draft → seeded default (`PVLayout.tsx:310–353`).
- `applyLayoutData` accepts `data.walkways` and `data.obstacles` directly (`435–436`). No migration, rename or normalisation is applied.
- Seeded layouts already contain walkways, e.g. `w-v1`, `w-v2`, `w-h1`, `w-h2` (`defaultProjectsData.ts:127–132`), so compatibility must be tested against data that already exists.

---

## 3. Is Walkway a keepout, a layer, or a separate object?

**It is a separate semantic object with its own layer toggle.**

- In the editor it is **not** stored inside `obstacles`. It stays in its own `walkways[]` array.
- It is rendered separately (`PVLayout.tsx:2032–2058`) with orange styling and the `layers.walkway` toggle.
- It is converted to a **height-0 Helio keepout only at the engine boundary** (`sceneAdapter.ts:234–242`). That conversion is one-way and does not mutate the saved layout.
- Reports already treat walkways as a ground layer (`reports/isoProjection.ts:81,139`).
- Therefore "move Walkway into Keepouts" should be a **UI/workflow move**, not a data merge. Keeping `walkways[]` distinct preserves identity, avoids migration, and matches the plan's "distinct semantic object" rule.

---

## 4. Current selection / edit / delete behavior, and why deletion is unavailable

### 4.1 Creation
The Walkway toolbar button (`PVLayout.tsx:1715–1745`) does **not** enter a draw mode. It immediately appends a fixed rectangle:

```ts
x: 2000, y: 11000,
w: settings.areaWidth - 4000, h: 2000,
label: "Walkway 2m"
```

It then calls `pushHistory` and `saveDraft`. This is why a wrongly placed walkway appears in a default position and cannot be corrected.

`toolMode` declares `"keepout" | "walkway"` (`589`), and the step-3 button sets `toolMode("keepout")` (`1150–1155`). However, the canvas `onPointerDown` (`1861–1876`) only handles `pan`, `rectangle` and `polygon`. **The `keepout` and `walkway` branches are dead code**, so clicking the canvas in step 3 does nothing.

### 4.2 Selection and edit
- Walkway/obstacle `<rect>` elements have **no pointer handlers** (`2032–2086`); they cannot be clicked.
- `selectedObstacleId` / `draggingObstacleId` exist (`607–608`) but are **never read or written** anywhere else.
- No obstacle creation path exists: `setObstacles` is only called on load/undo/redo.
- Segment selection/drag is implemented (`2088–2200`, `1890–1909`) and is the closest interaction pattern to reuse.

### 4.3 Delete
- The Delete/Backspace handler (`965–977`) removes **selected PV panels only**. Obstacles and walkways are never targets.
- `handleDeleteSegment` only filters `segments` (`824–837`).
- There is no walkway/keepout delete handler, no per-row delete action, and no object list to host one.
- The step-3 "Keepouts" tab renders no dedicated workspace/panel. `EngineRunPanel` is mounted only for steps 4 and 5 (`2325–2334`). Step 3 is currently just a toolbar hint.

### 4.4 History / Undo / Redo
- `HistoryEntry = { segments, obstacles, walkways }` (`355–359`); `pushHistory` keeps the last 30 snapshots (`718–724`).
- `handleUndo` / `handleRedo` restore all three arrays and call `saveDraft` (`726–746`). The mechanism already includes walkways.
- Walkway **creation** pushes history. Walkway **edit/delete** do not exist, so they cannot be undone today.
- Existing bug to account for: pointer-up after segment drag calls `saveDraft(segments, ...)` / `pushHistory(segments, ...)` with the pre-update state (`1953–1958`). Any new walkway drag must use the final computed geometry, not stale state.
- History entries hold array references. All new updates must replace objects/arrays immutably, or undo snapshots will alias live state.

---

## 5. Existing module-placement exclusion logic

`generatePanelsForSegment(seg, obstacles, walkways)` (`PVLayout.tsx:259–308`):

1. Builds the setback polygon from `seg.polygon` and `seg.setback` (convex-only inset, existing behaviour).
2. Computes module footprint from `moduleWidth` / `moduleHeight` and orientation.
3. Walks the setback bbox in `module + gap` steps.
4. Rejects a candidate if it is outside the setback polygon **or** collides with any obstacle/walkway.

Collision test (`289–297`) is a strict AABB overlap in millimetres:

```ts
p.x < obs.x + obs.w && p.x + p.w > obs.x &&
p.y < obs.y + obs.h && p.y + p.h > obs.y
```

Same loop then applies to `walkways`.

**Conclusion:** Walkway exclusion already exists and is authoritative for generated modules. Phase 2 is therefore mainly verification + regression tests, plus any warning/consistency work, not a new geometry pipeline. Regeneration (`handleGenerateSegmentPanels`, global auto-populate) passes the current `walkways` array.

Limitations to preserve/document:
- Rectangles only, axis-aligned, no rotation.
- No warning when a walkway is entirely outside the segment or overlaps another object.
- Existing panels are not retroactively re-validated on save/load; only regeneration applies exclusion.
- `generatePanelsForSegment` uses a local ID counter based on `Date.now()`; not part of this audit's scope.

---

## 6. Advanced UI and actual backend/service capability

### 6.1 Current UI
- Step 4 **Electrical** and step 5 **Advanced** both mount the same `EngineRunPanel` (`2325–2334`).
- Step 4 passes `section="electrical"` (economic inputs, equipment picker, run/circuit buttons).
- Step 5 passes `section="assumptions"` (WeatherPanel + `ConditionForm` + run button).
- **There is no Shading Optimization / Overlays / LiDAR section, no collapse cards, no tabs and no Advanced-specific state.**
- `Advanced` currently means: weather dataset choice + simulation assumptions + "Hitung (Helio)".

### 6.2 Real services already present
- `src/engine/client.ts` exposes `getShade(simulationId)` and `getIsoShading(designId, {azStep, elStep})` (`383–387`), plus weather dataset creation/comparison and `runSimulation`.
- `src/engine/WeatherPanel.tsx` uses real Helio weather endpoints (`createNasaPowerWeather`, `createPvgisWeather`, `createSolcastWeather`, `getSites`, `getWeatherComparison`, CSV mapping) and returns a `WeatherChoice` into `engine_inputs`.
- `src/engine/sceneAdapter.ts` sends real module positions, segment geometry, tilt/azimuth, obstacle heights and walkway keepouts.
- `src/reports/isoShading.ts` / `isoProjection.ts` already render iso-shading and 3D report projections from real data.
- The Helio engine is optional: `useEngine` reports `unavailable` when not configured, and the UI already shows `UNAVAILABLE_MESSAGE`.

### 6.3 What is missing
- No UI calls `getShade` or `getIsoShading`; results are not displayed in PV Layout.
- No persisted shading result, no stale/provenance metadata, no "ignore row-to-row shading" option exposed by this UI.
- No dedicated overlay model; no file-format validation; no KML/KMZ parsing.
- No LiDAR provider or point-cloud/mesh/imagery dataset integration.

**Truthfulness rule for later phases:** the engine endpoints are real, but a shading result can only be shown after a real Helio simulation/design exists. Otherwise the UI must show "not configured / data unavailable", not a fabricated percentage.

---

## 7. Supported overlay formats and limitations

Today there is exactly **one raster background**:

- `backgroundImage: string` (data URL) + `backgroundOpacity: number` (`PVLayout.tsx:573–574`).
- Upload accepts `image/*` via `<input type="file">` and reads it with `FileReader.readAsDataURL` (`1055–1065`, `2406`).
- Rendered as a single SVG `<image>` clipped to the site boundary, rotated by `site.rotationDeg`, positioned by `site.imageCenterMm` and scaled by `site.imageSpanM` (`1988–2015`).
- Opacity slider and remove action exist (`2416–2446`). Rotation is editable.
- Google Maps supplies the same field as a Static Maps crop (`GoogleMapsModal.tsx:1123–1132`).

Limitations:
- **No KML or KMZ parser.** `package.json` has no ZIP/KML dependency (`jszip`, `@tmcw/togeojson`, etc. are absent). Implementing KMZ safely would require a new dependency or a hand-written ZIP reader; neither is justified for Phase 3 without approval.
- No multi-overlay list, no per-overlay visibility, no drag-and-drop zone, no file name/type/status display.
- The existing background is clipped to the site boundary, so it is not a free-floating overlay.
- A plain uploaded image has no independent georeference; it inherits the site image centre/span. Do not label it "georeferenced".
- No KML/KMZ import is assumed or promised.

**Recommended Phase 3 scope:** support JPG/JPEG/PNG as an image overlay using the existing data-URL/persistence path, and explicitly reject KML/KMZ with a clear "not supported by this build" message. Persist overlay metadata additively (e.g. `overlays?: Overlay[]`) without removing `backgroundImage`.

---

## 8. Actual LiDAR / elevation data sources

No LiDAR provider exists in the repository.

| Source | Where | What it actually is |
|---|---|---|
| Open-Meteo Elevation API | `PVLayout3D.tsx:296–311` | A **9 × 9 elevation grid** (`rows = 9, cols = 9`) sampled around the project coordinates. Used as a visual DEM/terrain mesh. Low-resolution, not survey data, not a point cloud. |
| Manual slope fallback | `PVLayout3D.tsx:562` | Linear slope percentage when DEM is absent. |
| Google Solar API `buildingInsights:findClosest` | `gisSolarService.ts:237–309` | Building insights (roof segments, area, sunshine, etc.), not LiDAR. |
| NASA POWER / Open-Meteo radiation | `gisSolarService.ts` | Weather/climatology, not terrain. |
| Helio shading/iso-shading | `engine/client.ts:383–387` | Geometric shading simulation, not LiDAR data. |

Coordinate context:
- DEM points are generated as lat/lng offsets around `site.coordinates` (`latSpan = 0.0015°`, longitude corrected by `cos(lat)`), then converted to a 3D visual height field.
- The 2D layout uses mm with Y down; the engine adapter converts to local ENU metres (`sceneAdapter.ts:1–11`). These are distinct coordinate systems and must not be mixed.
- There is no vertical datum metadata, no point-cloud CRS, no mesh import, and no offset X/Y/Z workflow.

**Recommended Phase 4 scope:** show LiDAR as **"Not configured / no provider"** with the existing DEM clearly labelled "DEM Terrain (visual only)", not "LiDAR". Do not invent a provider or fabricate point clouds. If offsets are added, scope them to the DEM/overlay dataset only and persist them separately.

---

## 9. Compatibility risks for existing saved projects

| Risk | Detail | Mitigation |
|---|---|---|
| Walkway shape change | Existing records are `{id, x, y, w, h, label?}` in mm. Changing to polygon/centerline would break every saved project and the seeded defaults. | Keep the rectangle model. Add optional fields only (`heightM?`, `visible?`, `type?`) with defaults. |
| Duplicate source of truth | Moving walkways into `obstacles` would duplicate or drop records and change engine semantics (walkways are height-0 keepouts). | Keep `walkways[]`; build a **read-only unified view model** for the Keepouts list. |
| ID collisions | Walkway IDs are strings (`w-*`); obstacle IDs are numbers. Engine prefixes them (`walk-*`, `obs-*`). | Preserve prefixes; do not coerce IDs. |
| History aliasing | `HistoryEntry` stores array references; in-place mutation would corrupt undo. | All create/edit/delete handlers must produce new arrays/objects. |
| Stale-state save bug | Segment drag pointer-up saves pre-move state (`1953–1958`). | New walkway drag must save the computed final rectangle, and the existing bug should be fixed only if in scope / flagged. |
| Multi-key load order | Project key → user key → scan-all → default. A field added only to one writer path can appear lost. | Add new fields to every `saveDraft` payload and to `applyLayoutData`; keep old keys readable. |
| Segment fallback | Legacy payloads without `segments` create one fallback segment (`406–433`). | Do not tie walkway management to segment presence. |
| Reports / 3D / BOQ consumers | `reports/isoProjection.ts`, `PVLayout3D.tsx`, `BOQ.tsx` read the same payload. | Additive fields only; keep `walkways`/`obstacles`/`backgroundImage` names. |
| Seeded projects | `defaultProjectsData.ts` already has four walkways and obstacles. | Include seeded data in regression fixtures. |
| No jsdom | Tests run in Node only; React canvas interaction cannot be unit-tested directly today. | Put geometry/state logic in pure modules and test those; optionally add jsdom only with approval. |
| Electrical SLD Phase 1 | `src/electrical/*`, `vitest` config and tests must remain untouched. | No changes to electrical files; run full suite. |

---

## 10. Minimal phased implementation proposal

### Phase 1 — Keepouts workspace + walkway object management (no geometry change)

**New pure module** `src/pv/keepoutModel.ts` (suggested path):
- `type KeepoutKind = "walkway" | "obstacle"`
- unified view type `{ id: string; kind; label; x; y; w; h; visible; heightM? }`
- `hitTestRect(pointMm, objects, toleranceMm)` — topmost-first, deterministic.
- `addWalkway`, `updateWalkway`, `deleteWalkway`, `moveWalkway`, `resizeWalkway` pure helpers.
- `normalizeLegacyWalkway(raw)` — accepts current shape, preserves id/label, rejects/repairs malformed values without dropping records.
- No new persistence fields except optional `visible`.

**New UI** `src/pv/KeepoutsPanel.tsx` (or a local component inside `PVLayout.tsx` if extraction is too invasive):
- Drawing toolbar: Select | Rectangle Keepout | Walkway. **Do not claim Circle/Tree unless a model is added**; they are not supported by the current data model.
- Unified list of walkways + obstacles with type badge, visibility toggle, focus/select, delete.
- Selected-object properties (label, width/height/position in metres).
- Reuse existing dark styling and `pv-*` classes.

**`src/PVLayout.tsx` changes:**
- Replace the fixed-insert walkway button with "enter walkway draw mode"; keep a compatible quick-add if desired but route it through the same handler.
- Implement `toolMode === "keepout" | "walkway"` in pointer down/move/up using the existing rectangle drawing pattern.
- Add `selectedKeepout` state (`{ kind, id } | null`), canvas click handlers on walkway/obstacle rects, drag-to-move, and delete.
- Extend keyboard Delete to remove the selected keepout/walkway first (safe order), then panels.
- Push history and `saveDraft` on create/edit/delete; clear selection after delete.
- Render selection highlight; keep `layers.walkway` and `layers.keepouts` toggles.
- Mount `KeepoutsPanel` for `activeStep === 3`.
- Keep step 4/5 `EngineRunPanel` unchanged.

**Tests:**
- `src/pv/keepoutModel.test.ts`: hit-test, add/update/delete, ID preservation, legacy payload, no cross-object deletion, immutable history snapshots.
- Update `src/engine/fixtures/regenerate.test.ts` only if helper signatures move.

**Stop for approval.**

### Phase 2 — Placement exclusion verification

- Keep `generatePanelsForSegment` as the single authoritative path.
- Add tests: no walkway baseline, one walkway, multiple walkways, delete then regenerate, walkway+keepout overlap, multi-segment.
- Optionally add a non-blocking warning when a walkway lies outside all segment polygons or overlaps another keepout.
- Recalculate counts/capacity through existing derived values (no new calculation path).
- **Stop for approval.**

### Phase 3 — Advanced workspace + overlays

**New UI** `src/engine/AdvancedPanel.tsx`:
- Collapsible cards: Module Shading Optimization | Overlays | LiDAR.
- Keep the existing weather/assumptions controls reachable; do not remove step 4.
- Overlays: drag-and-drop + browse for JPG/JPEG/PNG only; file name/type/status, visibility, opacity, remove; clear rejection for KML/KMZ and malformed/oversized files.
- Reuse the existing data-URL persistence and SVG render path; add `overlays?: Overlay[]` additively **or** map the first overlay onto `backgroundImage` while retaining the old field. Do not add a backend.
- LiDAR card: honest "Not configured / no provider" state; link to the existing DEM as visual terrain, clearly labelled.

**Tests:** pure overlay validation/normalisation, unsupported extension rejection, size guard, removal does not touch `site`, persistence round-trip.

**Stop for approval.**

### Phase 4 — Shading / LiDAR integration (real sources only)

- Shading: only after a real Helio simulation/design exists; call `getShade`/`getIsoShading`, show loading/calculated/failed/stale, and record the "ignore row-to-row" assumption in result metadata. Otherwise show "Not configured".
- LiDAR: keep the unavailable boundary unless a real provider is explicitly approved. Do not relabel DEM as LiDAR.
- **Stop for approval.**

### Phase 5 — Regression / release readiness

- Full manual checks (GIS, segments, generation, keepouts, save/reload, 3D, reports, Electrical Phase 1).
- `npx tsc -b`, `npx vitest run`, `npx vite build`.
- Screenshots or a concise manual test report.
- No push/merge without approval.

---

## 11. Required tests mapped to the plan

| Plan requirement | Phase | Test location |
|---|---|---|
| Create walkway | 1 | `keepoutModel.test.ts` + manual canvas check |
| Select by canvas hit-test / from list | 1 | `keepoutModel.hitTest` + manual |
| Edit/move walkway | 1 | `keepoutModel.update/move` |
| Delete selected / from list | 1 | `keepoutModel.delete` |
| Delete one leaves others intact | 1 | `keepoutModel` identity test |
| Undo/Redo create, edit, delete | 1 | history pure helper test / manual |
| Save/load identity + geometry | 1 | payload round-trip test |
| Legacy walkway readable | 1 | `normalizeLegacyWalkway` fixture |
| No walkway baseline unchanged | 2 | `generatePanelsForSegment` |
| One/multiple walkways excluded | 2 | same |
| Delete → area eligible after regenerate | 2 | same |
| Walkway + keepout overlap deterministic | 2 | same |
| Multi-segment exclusion | 2 | same |
| Advanced sections render | 3 | component smoke test if jsdom approved; otherwise manual |
| Unsupported/invalid/oversized file rejected | 3 | `overlayModel.test.ts` |
| Image visibility/opacity/removal | 3 | `overlayModel` + manual |
| KML/KMZ only if parser exists | 3 | explicit "unsupported" test |
| Shading never fabricated | 4 | UI state test / manual |
| LiDAR never fabricated | 4 | UI state test / manual |
| Offset cannot move site geometry | 4 | pure offset-scope test if implemented |
| GIS, segments, generation, keepouts, save/load, 3D, Electrical Phase 1 | 5 | full suite + manual |

---

## 12. Open decisions to confirm before Phase 1

1. **Geometry:** keep the existing axis-aligned walkway rectangle (recommended, no migration) and add rectangle drawing/move/resize. Circle/polygon/tree keepouts are **not** supported by the current model and would require new geometry plus engine changes.
2. **Walkway storage:** keep `walkways[]` distinct and show it in a unified Keepouts list. Do **not** merge into `obstacles`.
3. **Overlay formats:** image-only (JPG/JPEG/PNG) for now; KML/KMZ explicitly unsupported. If KML/KMZ is mandatory, approve adding a parser/ZIP dependency in Phase 3.
4. **LiDAR:** no provider exists. Phase 4 will show unavailable + existing DEM as visual terrain only.
5. **Branch:** create `feat/pv-layout-walkway-advanced` from current `main` (`fbb7d79`) for implementation; no commits to `main`.
6. **Test environment:** keep Node/Vitest and test pure logic. If React interaction tests are required, approve adding jsdom + testing-library in Phase 1.

---

## 13. Bottom line

- Walkway is already a **first-class, persisted, distinct object** and is already **excluded from module generation**.
- The real gaps are **UI/workflow**: no Keepouts object list, no safe creation mode, no selection/edit/delete, and dead `keepout`/`walkway` tool modes.
- Undo/Redo already snapshots walkways; it only needs to be wired to the new edit/delete actions.
- Advanced has **no Shading/Overlays/LiDAR workspace**. Real weather and Helio shade/iso-shading endpoints exist, but are not exposed here; there is **no KML/KMZ parser** and **no LiDAR provider**.
- The implementation can stay additive and low-risk if the rectangle model and `walkways[]` array are preserved.

**Awaiting explicit approval for Phase 1. No source changes, branch switch, commit, push, merge, or PR were performed in Phase 0.**
