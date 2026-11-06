# PV Layout 2D — Phase 0 Read-Only Audit

**Date:** 2026-11-05
**Repo:** `D:\PROCOD\solarapp` (branch `main`, HEAD `5ec08d7`)
**Baseline:** `npx tsc -b` → exit 0; `npx vite build` → exit 0 (single 1.20 MB JS chunk).
**Scope:** Audit only. No source files changed. This document is the Phase 0 deliverable.

---

## 0. Reality check vs. the development plan

| Plan assumption | Actual repository |
|---|---|
| React + TypeScript + Vite + **Supabase** + RLS | React 18 + TS 5.6 + Vite 6. **No Supabase package, no RLS, no migrations anywhere in the repo.** Persistence is `localStorage` + REST calls to `/api/design/projects/...` (backend not in this repo). |
| Existing "Field Segments" that fail to generate | **There is no segment concept at all.** One `Site` polygon, one flat `panels[]` array, no `segment_id`. |
| `src/api.ts` is Supabase-backed | It is a `fetch` wrapper with localStorage fallback. |
| Automated tests exist | **No test runner, no test files, no `test` script.** |
| `GoogleMapsModal` supports GIS boundary selection | It supports an **editable 4-corner box/trapezoid/parallelogram** and an image-only Static Maps crop. No draw/pan/edit modes. |

Conclusion: Issue B is not a regression in this codebase — the multi-segment capability was never implemented. Issue A is a mix of real interaction defects and missing workflow.

---

## 1. What the current code actually does

### 1.1 GIS → PV Layout data flow

```
PVLayout (src/PVLayout.tsx)
  └─ <GoogleMapsModal initialPolygonPoints={site?.polygonPoints} />
        ├─ Google Maps JS API (satellite, editable+draggable Polygon)
        ├─ 4-point generators: rectangle / trapezoid / parallelogram,
        │  plus Google Solar auto-detect (bbox width/height + azimuth)
        ├─ updateMetricsFromPolygonPath(): centroid, 4 side lengths,
        │  spherical area, heading of edge 0→1
        ├─ computeLocalCornersMm(): inverse-rotates every vertex by
        │  rotationAngle, normalises to [0..w] × [0..h] in mm (Y down)
        └─ handleApply()
             ├─ Google Static Maps request (satellite, 640×640, scale=2)
             ├─ canvas crop centred on the image (axis-aligned, north-up)
             └─ onApply({ widthMm, heightMm, imageSrc, coordinates, address,
                          polygonPoints[], polygonCornersMm[], rotationDeg,
                          pitchDegrees, azimuthDegrees, googleSolarData })
  └─ handleGoogleMapsApply(data):
        site = { coordinates, polygonPoints, polygonCorners, rotationDeg, ... }
        settings.areaWidth/areaHeight = widthMm / heightMm
        backgroundImage = cropped JPEG data URL
        panels = panels.filter(valid against the NEW boundary)   ← destructive
        saveDraft(...) → localStorage + POST /api/design/projects/:id/layout
```

### 1.2 Persistence

- Draft key: `solar-apps-pv-layout-v1:<userId>:<projectId|unassigned>` (`PVLayout.tsx:61`).
- Payload: `{ projectId, settings, panels, obstacles, site, backgroundImage, backgroundOpacity }` (`PVLayout.tsx:437`).
- Browser draft is written on every mutation; remote save is fired-and-forgotten:
  `api.saveProjectLayout(projectId, payload)` (`PVLayout.tsx:450`).
- Remote load only at mount (`PVLayout.tsx:279`), and only applies panels when
  `remote.panels.length > 0` (`PVLayout.tsx:287`).
- `api.ts` maps `layout_data` JSON from `/api/design/projects/:id/layout`.
- No user/workspace scoping in the browser key beyond `userId`; the server contract is unknown (backend absent from repo).
- `BOQ.tsx:156` reads the **localStorage draft** to sync module quantity.
- `EngineeringReport.tsx:970-975` and `PVLayout3D.tsx:498` read
  `settings`, `panels`, `obstacles`, `site.polygonCorners`.

### 1.3 Generation

- `generate()` (`PVLayout.tsx:456`): builds a `rows × cols` grid **centred on the rectangular `settings.areaWidth × areaHeight`**, filters modules that fail boundary/obstacle checks, then **replaces the whole `panels` array** (`setPanels(next)`).
- `autoFillArea()` (`PVLayout.tsx:482`): scans the **bounding box of the setback polygon**, clipped to the settings rectangle, in fixed module+gap steps, filters invalid candidates, then **replaces the whole array**.
- Capacity: `panels.length × settings.watts / 1000` (`PVLayout.tsx:312`) — correct Wp→kWp.
- Module units are millimetres throughout the 2D editor; module `watts` is Wp.
- Validity = inside inset polygon **and** not intersecting an obstacle rectangle (`PVLayout.tsx:343`). There is **no panel-vs-panel collision check** and no rotation-aware module footprints.
- Insets: `computeInsetPolygon()` (`PVLayout.tsx:69`) offsets each edge and intersects adjacent lines — documented as **convex-only**.
- Area: GIS uses `google.maps.geometry.spherical.computeArea` (accurate); 2D canvas never shows area/perimeter.
- Undo history stores **only** `{panels, obstacles}` (`PVLayout.tsx:231`), not settings/site/image.

### 1.4 GIS interaction

- Polygon created with `editable: true` **and** `draggable: true` (`GoogleMapsModal.tsx:537-538`).
- Vertex listeners: `set_at`, `insert_at`, `remove_at` → only recompute metrics (`:547-551`).
- Presets are all 4-point (`computeRotatedBoxCoords`, `:237`).
- Midpoint handles insert extra vertices (Google Maps "editable" behaviour), so >4 vertices are technically possible, but nothing in the UI says so; the header says "Poligon 4-Titik".
- `updateMetricsFromPolygonPath()` treats edges 0-1-2-3 as top/right/bottom/left (`:298-319`) — wrong for 5+ vertices.
- `widthM`/`heightM` become the **average of opposite sides**, not the bounding box.
- No explicit Pan / Draw / Edit / Delete modes, no vertex count, no undo/cancel/reset/finish, no vertex deletion, no "apply boundary only" action.
- Modal always opens at hard-coded Cikarang (`:95-98`); only the polygon shape is restored (`initialPolygonPoints`, `:201`). Saved map center/zoom/address are not restored.
- `apply` path is image-first: Static Maps crop is mandatory; on failure the user gets an error banner with a secondary "dimensions only" action.

### 1.5 2D canvas

- Boundary vertices are rendered as **decorative circles** with no pointer handlers (`PVLayout.tsx:1687-1697`). The boundary cannot be edited in 2D; the user must reopen the GIS modal.
- Pan: middle mouse, `Space`+drag, or "pan" tool; wheel without Ctrl only shows a hint.
- Panels are clamped only to `areaWidth/areaHeight` while dragging (`:861`), then validated against boundary/obstacles.
- Clicking empty canvas adds a panel at the click position (`:940-952`).

---

## 2. Root causes

### Issue A — GIS selection/crop is difficult

| # | Root cause | Evidence | Confidence |
|---|---|---|---|
| A1 | **Navigation and editing are the same gesture.** The polygon is `editable` and `draggable` at the same time, and it covers the site. Dragging inside the site moves the whole polygon instead of panning the map; grabbing a handle by accident edits a vertex. There are no tool modes. | `GoogleMapsModal.tsx:535-545`, `:574-584` | Proven |
| A2 | **"Crop" is a north-up static image, but the boundary is un-rotated into a local frame.** The saved JPEG is axis-aligned while `polygonCornersMm` are inverse-rotated by `rotationAngle`; the canvas then clips that north-up image with the rotated polygon. Rotated/irregular sites can never line up. | `GoogleMapsModal.tsx:805-839`, `:863-893`; `PVLayout.tsx:1613-1626` | Proven |
| A3 | **Crop pixel scale is off by the `scale=2` factor.** `res` is computed for CSS pixels but applied to a 1280×1280 device-pixel image, so the crop covers half the intended ground width/height and is then stretched. Alignment error grows with site size. | `GoogleMapsModal.tsx:858-883` | High (math) — verify with a live key |
| A4 | **The crop ignores the polygon shape.** It always crops a centred rectangle; offset or concave vertices fall outside the retained image, and there is no preview of what will be kept. | `:879-892` | Proven |
| A5 | **Vertex workflow is incomplete.** No explicit add/remove/finish, no undo, no reset/cancel, no vertex count, no perimeter, 4-point presets only, side labels assume 4 edges. Removing a vertex is impossible from the UI. | `:298-319`, `:514-680`, header `:991-1008` | Proven |
| A6 | **Applying a second site is destructive.** `handleGoogleMapsApply` replaces the single `site` object and immediately filters out all panels that are not inside the new boundary. The previous area's modules disappear, which reads as "segments are lost". | `PVLayout.tsx:362-378` | Proven |
| A7 | **No map-context persistence.** Reopening the scanner restarts at Cikarang and only restores vertices; zoom/address are lost. | `:95-98`, `:200-205` | Proven |
| A8 | **Image payload bloat** is written to localStorage and POSTed as a JSON data URL; quota/API failures are swallowed silently. | `PVLayout.tsx:446-452` | Proven |

### Issue B — Multiple field segments cannot all generate

**Root cause: the feature does not exist in this repository.** There is no field-segment data model, no segment UI, no `segment_id` on modules, no per-segment generation, no "Generate All", and no per-segment status.

Supporting evidence:

- `type Panel = { id, x, y, w, h }` — no segment reference (`PVLayout.tsx:29`).
- Single `type Site` with one `polygonCorners` (`:32-41`); `handleGoogleMapsApply` overwrites it (`:362-372`).
- `generate()` and `autoFillArea()` both call `setPanels(next)` — full replacement, so even two mental "areas" cannot coexist (`:474`, `:512`).
- Only one boundary is rendered/clipped (`:1605-1636`).
- Applying a second GIS boundary prunes the first area's panels (`:377`).
- No `generateAll`/per-segment status strings anywhere in `src/`.

Secondary defects that will surface once segments exist:

- B1 `saveDraft`/`loadSaved` silently drops layouts with zero panels (`loadSaved` requires `panels.length > 0`, `:166`; remote load `:287`).
- B2 Undo/redo history does not include settings/site/segments (`:231`) and its index handling can desync when the 50-entry cap shifts (`:238-245`).
- B3 Generation IDs use `Date.now()` (`:466`, `:500`); repeated generation is not idempotent by key, only by array replacement.
- B4 Manual drag and duplicate do not check panel-vs-panel overlap (`:343`, `:610-638`), so "no overlap" is not guaranteed.
- B5 `computeInsetPolygon` is convex-only; concave GIS boundaries will produce wrong setbacks.

---

## 3. Files and functions to change

| File | Functions / areas | Phase |
|---|---|---|
| `src/GoogleMapsModal.tsx` | tool-mode state, draw overlay, polygon edit toggling, vertex panel, metrics (N-gon), crop rotate/scale, map-context restore | 1 |
| `src/PVLayout.tsx` | `handleGoogleMapsApply`, `saveDraft`/`loadSaved`, `generate`, `autoFillArea`, history, canvas rendering, segment UI | 1-4 |
| `src/pv/geometry.ts` *(new)* | point-in-polygon, inset (convex + concave fallback), area/perimeter, overlap, polygon bbox | 1-4 |
| `src/pv/types.ts` *(new)* | shared `FieldSegment`, `SegmentSettings`, `Panel` (adds `segmentId`), `LayoutPayloadV2`, status enum | 1 |
| `src/pv/storage.ts` *(new)* | load/migrate/save payload, v1→v2 migration, quota-safe image handling | 2 |
| `src/pv/generation.ts` *(new)* | `generateSegment(segment, obstacles)`, `generateAll(segments)`, deterministic keys, result summary | 3 |
| `src/pv/SegmentList.tsx` *(new)* | segment CRUD, selection, status badges, Generate Selected/All, Clear Selected | 2-3 |
| `src/styles.css` | additive `.pv-segment-*` styles | 2 |
| `src/BOQ.tsx` | no logic change required; keep reading `panels` + `settings` | 5 (verify) |
| `src/EngineeringReport.tsx` | keep `site.polygonCorners` + `panels`; optionally draw segment outlines | 5 (verify) |
| `src/PVLayout3D.tsx` | keep flat `panels`; optionally draw segment boundaries | 5 (verify) |

No file is deleted, renamed, or replaced. All changes are additive/backward-compatible.

---

## 4. Proposed minimal implementation

### Phase 1 — GIS interaction + geometry handoff
1. **Explicit tools** in the modal: `Navigate` (default), `Draw boundary`, `Edit vertices`. `Navigate` sets the polygon `editable=false, draggable=false`; only `Edit` enables handles; only `Draw` adds map-click vertices. This directly removes A1.
2. **Draw workflow**: click vertices → live polyline → `Finish` / click first vertex / double-click closes; `Undo last`, `Reset`, `Cancel`; polygon keeps N vertices.
3. **Edit workflow**: vertex count, add (click edge), move (drag), delete (select vertex → Delete), plus delete-last; Undo/Restore.
4. **Metrics panel** generalized to N-gon: true perimeter, area (spherical), bounding width/height, orientation, vertex count. Remove the 4-side assumption.
5. **Crop fix**: compute crop in device pixels (`res/2`), fetch a north-up window that covers the rotated polygon's AABB, rotate it on the offscreen canvas by `rotationAngle`, and display a preview thumbnail before Apply. Keep image capture optional and separate from geometry apply (add "Apply boundary only").
6. **Map context**: persist and restore `center` + `zoom` (new optional `initialCenter`/`initialZoom` props) and reuse the saved address.
7. Keep Google Maps + Solar API integration; no new provider.

### Phase 2 — Field segments
8. **Contract (additive, v2 payload)**:
   ```ts
   type FieldSegment = {
     id: string; projectId: string | null; name: string;
     boundary: { latLng?: LatLng[]; corners: Pt[] };   // local mm, Y down
     areaM2: number; perimeterM: number;
     settings: Pick<Settings, "moduleWidth"|"moduleHeight"|"gap"|"watts"|"tilt"|"orientation"|"setback"|"rows"|"cols">;
     status: SegmentStatus;                              // defined in §5
     warnings: string[]; lastGeneratedHash?: string;
     updatedAt: string;
   };
   type Panel = { id: number; segmentId?: string; x; y; w; h };
   type LayoutPayloadV2 = { version: 2; projectId; settings; site; segments; panels; obstacles; backgroundImage; backgroundOpacity };
   ```
9. **Migration**: on load, if `version < 2` (or `segments` missing) create one segment from `site.polygonCorners ?? rectangle` and tag existing panels with its id. Legacy payloads keep working; nothing is deleted.
10. **Site boundary vs. segments**: keep `site` as the outer site boundary; segments are child polygons. GIS "Apply" updates the active segment (and, for the first one, the site). This fixes A6.
11. **UI**: segment list with create / rename / duplicate / delete (confirm) / select; status badge; per-segment settings panel; canvas draws every segment boundary, dims non-selected ones.
12. **Persistence**: include `segments` in the existing payload; keep top-level `settings`/`panels` for BOQ/report/3D compatibility.

### Phase 3 — Multi-segment generation
13. Extract a pure `generateSegment(segment, obstacles)` returning `{ panels, warnings }`; deterministic placement keyed by `segmentId + row + col + x + y`.
14. `Generate Selected`, `Generate All`, `Regenerate Selected`, `Preview`, `Clear Selected` (confirm).
15. Isolation: `setPanels(prev => [...prev.filter(p => p.segmentId !== seg.id), ...generated])`; per-segment `try/catch`, so one bad segment cannot abort the rest.
16. Summary: total / success / warning / failed, module count, DC kWp; per-segment statuses (`Not generated`, `Ready`, `Generating`, `Generated`, `Generated with warnings`, `Failed`, `Out of date`).
17. Out-of-date detection via `lastGeneratedHash` of settings+boundary.

### Phase 4 — Polygon-aware placement and keepouts
18. Replace convex-only inset with a robust polygon offset + self-intersection fallback; keep the old function as fallback for convex input.
19. Panel-vs-panel collision (AABB now, rotation-aware footprint later); duplicate/rotate/place respect it.
20. Obstacles: global + optional per-segment assignment; clearance respected.
21. Unit/capacity tests: mm↔m, Wp→kWp, area from polygon (not W×H).

### Phase 5 — Integration + regression
22. Verify BOQ sync, EngineeringReport, PVLayout3D, CSV/DXF, save/load, project switch.
23. `tsc -b`, `vite build`, new unit tests, manual checklist, PR against `main`.

---

## 5. Database / schema assessment

- **No migration is required or recommended for the front end.** `layout_data` is an opaque JSON document from this repo's perspective; adding `version`, `segments[]` and `panel.segmentId` is additive.
- There is **no Supabase/RLS code in this repo** to change.
- Unknown: the SonusID backend (`/api/design/projects/:id/layout`) may validate or cap payload size. The image data URL and segments must be confirmed against that service before merge. Do not change server schema without approval.
- Recommendation: keep one source of truth per scope (server when authenticated, localStorage as offline draft), and surface save failures instead of swallowing them.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Breaking BOQ / report / 3D that read `settings`, `panels`, `site` | Keep those keys unchanged; only add fields; run regression checklist |
| Legacy drafts/payloads | v1→v2 migration on load, read-only fallback, never overwrite without successful parse |
| localStorage quota (image + segments) | Downscale to ≤1024 px JPEG ~0.75; skip/flag when over quota; never block geometry save |
| Backend rejects larger JSON | Apply geometry first, image upload best-effort; verify API limits before merge |
| Undo/redo desync | Extend history entry to `{panels, obstacles, segments, settings, site}` and fix index trim |
| Concave boundaries / wrong setbacks | New offset algorithm + "setback invalid" warning instead of silently wrong placement |
| Google Maps quota/cost (Static Maps, Solar API) | Preview + explicit Apply, cache last crop, no auto re-fetch on pan |
| Hard-coded Maps API key in source | Move to `window.GOOGLE_MAPS_API_KEY` / env at build; keep existing key working as fallback |
| Two developers editing `PVLayout.tsx` | Land `src/pv/*` contracts first and keep component changes in separate sections/phases |

---

## 7. Test plan (proves the fixes)

Add a lightweight runner. Preferred: **Vitest** (dev-only, `npm test`) because the code is TS/ESM and Vite is already present. Fallback: Node 24 `node --test` with native type stripping (no new dependency).

Unit tests (`src/pv/*.test.ts`):
1. `localProjection`: rotated rectangle → expected mm corners, Y-down, area preserved.
2. `area/perimeter`: rectangle, trapezoid, irregular 5-gon vs. known values; never metres-from-degrees.
3. `pointInPolygon` + `panelInsidePolygon`: inside/edge/outside, concave polygon.
4. `inset`: rectangle/trapezoid setbacks; concave fallback flagged.
5. `generation`: deterministic count/positions; fits inside inset; respects obstacles; no panel overlap.
6. `multi-segment`: two segments → Generate All places both; failure in one still returns the other; `segmentId` correct; running twice → no duplicates; regenerate A leaves B byte-identical; clear A leaves B.
7. `capacity`: `count × Wp / 1000` per segment and project.
8. `migration`: v1 payload without segments → v2 with one segment and tagged panels, panels unchanged.

Manual acceptance checklist (from plan §6): GIS navigate/draw/edit/apply, reload project, rotated site alignment, 2-segment create/generate-all/regenerate/clear, BOQ sync, CSV/DXF, undo/redo, save/load, 3D reload, report render.

---

## 8. Proposed delivery order and approval gates

| Step | Output | Gate |
|---|---|---|
| 0 | This audit | **Awaiting approval** |
| 1 | Branch `feat/pv-layout-2d-segments`, shared `src/pv/types.ts` + `geometry.ts` + tests | Review contracts |
| 2 | GIS tool modes + N-gon + crop fix | Demo + tests |
| 3 | Segments CRUD + persistence/migration | Demo + tests |
| 4 | Selected/All generation + statuses | Demo + tests |
| 5 | Placement/keepouts hardening + regression + PR | Full checks |

**No code changes will be made until this audit and the proposed contracts are approved.**
