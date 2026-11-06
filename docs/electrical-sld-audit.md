# Electrical Design & Automatic SLD — Phase 0 Read-Only Audit

**Date:** 2026-11-06
**Repo:** `D:\PROCOD\solarapp` (branch `main`, HEAD `5ec08d7`)
**Baseline:** `npm ci` OK; `npx tsc -b` exit 0; `npx vite build` exit 0 (1.20 MB JS chunk, 28.6 kB CSS).
**Scope:** Audit only. No source files, migrations, or configs were changed. This file is the Phase 0 deliverable.

---

## 0. Discrepancies with the plan (read first)

| Plan assumption | Actual repository |
|---|---|
| React + TS + Vite + **Supabase** + auth + RLS | React 18 / TS 5.6 / Vite 6. **No Supabase package, no auth library, no migrations, no SQL, no RLS anywhere.** User context comes from `window.SONUS_USER`; persistence is `localStorage` + `fetch` to `/api/design/...`. |
| Field Segment data available from PV Layout | **No Field Segment model exists.** One `site` polygon and a flat `panels[]` array with no `segment_id`. |
| Existing Electrical menu | The menu is a composition of two standalone calculators (`StringCalculator` + `InverterConfiguration`); cable/protection/breaker/tray are separate top-level menu items. |
| SLD / diagrams exist to extend | **No SLD, topology model, or diagram renderer exists anywhere in `src/`.** |
| Equipment catalog with datasheets exists | Only a **price catalog** in `BOQ.tsx` with free-text descriptions; no Voc/Vmp/Isc/MPPT data. |
| Revisioned designs / stale detection | No layout revision, timestamp, version, or snapshot mechanism. |
| Automated tests | No test runner, no test files, no `test` script, no lint script. |

The backend (`/api/design/projects/...`) is **not part of this repository**; Vite config only proxies nothing (no proxy configured). Any endpoint addition must be confirmed with the SonusID backend owner.

---

## 1. Current architecture and exact file paths

```
index.html
src/main.tsx                    → React root
src/App.tsx                     → routing (history API), sidebar, project context, module switch
src/api.ts                      → Project/SonusUser types, REST + localStorage persistence
src/defaultProjectsData.ts      → 2 seeded projects/layouts/BOQs (Cikarang 500 kWp, Karawang 2 MWp)
src/PVLayout.tsx                → PV Layout 2D (source of module count/capacity)
src/PVLayout3D.tsx              → 3D viewer, reads same layout payload
src/GoogleMapsModal.tsx         → GIS scanner (image + polygon)
src/gisSolarService.ts          → NASA POWER, Google Solar, PLN substation helpers
src/StringCalculator.tsx        → standalone string screening
src/InverterConfiguration.tsx   → standalone MPPT/DC-AC screening
src/CableSizing.tsx             → standalone DC/AC cable screening
src/ProtectionGrounding.tsx     → standalone protection/earthing screening
src/BreakerSizing.tsx           → standalone breaker screening (single-line implementation)
src/TraySizing.tsx              → standalone tray fill screening (single-line implementation)
src/CADDrawings.tsx             → demo drawing workspace + DXF/JSON export
src/BOQ.tsx                     → price catalog, BOQ editor, PV Layout count sync
src/EngineeringReport.tsx       → report/PDF-ish preview, reads layout localStorage
src/SurveyReport.tsx            → preserved module, unrelated to electrical
src/styles.css                  → single global stylesheet
```

### Routing / navigation
- `App.tsx:28` — `ModuleId` union; `App.tsx:271-288` — `navGroups` (all menus).
- `App.tsx:662-705` — module switch. Electrical is rendered as:
  ```tsx
  <StringCalculator lang={lang} />
  <div ...borderTop...><InverterConfiguration lang={lang} /></div>
  ```
  (`App.tsx:679-686`). Neither receives `projectId`, `userId`, or layout data.
- URL route shape: `/design/:projectId/:module` (`App.tsx:136-144`), history API with `pushState` (`:169-186`).
- Active project passed to PV Layout/3D/BOQ/Report only.

### Persistence patterns
| Scope | Mechanism | Key / endpoint |
|---|---|---|
| Projects | REST + localStorage fallback | `/api/design/projects`, `sonus_solar_studio_projects_v2` (`api.ts:21`) |
| Layout draft | localStorage | `solar-apps-pv-layout-v1:<userId>:<projectId|unassigned>` (`PVLayout.tsx:61`) |
| Layout remote | REST | `GET/POST /api/design/projects/:id/layout` (`api.ts:143-171`) |
| BOQ remote | REST | `GET/POST /api/design/projects/:id/boq` (`api.ts:173-203`) |
| BOQ draft | localStorage | `solar-apps-boq-v1:<userId>:<projectId>` (`BOQ.tsx:67,94-105`) |
| 3D camera | localStorage | `solar-apps-3d-cam:<projectId>` |
| Electrical modules | **none** — all `useState` defaults, lost on navigation | — |

- `api.ts` calls use `credentials: "same-origin"` but **no auth token/headers**.
- Remote layout is returned as `data.layout_data || data` (`api.ts:148-150`).
- `saveProjectLayout()` returns `boolean` but callers ignore it (`PVLayout.tsx:451`), so failures are silent.

### Export utilities
| Utility | Location | Format |
|---|---|---|
| PV Layout CSV | `PVLayout.tsx:966-980` | CSV (UTF-8 BOM) |
| PV Layout DXF | `PVLayout.tsx:982-1048` | DXF R12, layers `SITE_BOUNDARY`, `PV_MODULES`, `PANEL_ID`, `OBSTACLES` |
| CAD DXF | `CADDrawings.tsx:55-70` | DXF R12 with title block |
| CAD JSON | `CADDrawings.tsx:71-72` | JSON |
| Breaker/Tray JSON | `BreakerSizing.tsx:12`, `TraySizing.tsx:12` | JSON |
| BOQ CSV/JSON | `BOQ.tsx:207-222` | CSV/JSON |
| Report print | `EngineeringReport.tsx:982-1010` + print CSS | browser print/PDF |

There is **no SVG/PNG/PDF export of a diagram**, and no shared drawing engine.

---

## 2. Existing electrical functionality — classification

| Capability | Status | Evidence / notes |
|---|---|---|
| PV module selection / specification | **Missing** | BOQ catalog has brand/description/price only (`BOQ.tsx:38-42`); no electrical datasheet fields, no project assignment, no persistence. Layout stores only `moduleWidth`, `moduleHeight`, `watts` (`PVLayout.tsx:44-59`), no manufacturer/model/Voc/Isc. |
| Inverter selection / specification | **Missing** | BOQ catalog lists 10 kW inverter prices only (`BOQ.tsx:43-46`); seeded BOQ text mentions "Huawei SUN2000 100 kW, 10 MPPT" (`defaultProjectsData.ts:81`) but not structured data. `InverterConfiguration` takes manual numeric inputs. |
| String configuration | **Partial** | `StringCalculator.tsx:35-95`: series range from cold Voc / hot Vmp, parallel limits from operating & Isc current, even string allocation. Manual inputs only, no project/layout binding, no persistence, no orientation/tilt per string. |
| MPPT allocation | **Partial** | `InverterConfiguration.tsx:75-104`: comma-separated strings-per-MPPT, per-MPPT operating/Isc checks, DC/AC ratio. No per-MPPT voltage mix check, no physical input count, no orientation conflict check, no snapshot. |
| DC voltage/current + temperature correction | **Partial** | Cold `Voc` correction (`StringCalculator.tsx:47`) and hot `Vmp` (`:48-49`); coefficient assumed %/°C at 25 °C; no Vmp/Isc coefficients, no max-system-voltage check, no series-fuse check. |
| DC/AC topology & protection | **Missing** | No topology model anywhere. `ProtectionGrounding.tsx:32-58` only compares user-entered ratings. |
| Cable sizing / voltage drop | **Partial** | `CableSizing.tsx:35-62`: DC 2-wire / AC 3-phase formulas, user-entered ampacity and route length, no reactance, no standard tables, no project link. |
| SLD rendering / export | **Missing** | No node/connection model, no SVG diagram, no editable symbols. |
| Calculation tables / wire schedule | **Partial** | Per-screen tables only (cable size comparison, per-MPPT rows). No consolidated schedules, no export, no traceability fields, no revision. |
| Revisioning / stale state | **Missing** | No version/timestamp/fingerprint in layout or electrical data. |
| Shared engine | **Missing** | Each component duplicates formulas and status strings; no pure functions, no tests. |

### Component intercommunication today
- `StringCalculator` dispatches `window.dispatchEvent(new CustomEvent("solarapps:pv-string-config", { detail }))` (`:172-187`).
- `InverterConfiguration` listens to that event (`:38-62`).
- That is the **entire** integration. It only works while both are mounted on the same page, carries no `project_id`, and is lost on reload.
- `App.tsx` mounts both simultaneously, so the event works today, but it is not a data contract.

---

## 3. PV Layout data contract (actual, not guessed)

### Browser payload
```ts
// localStorage["solar-apps-pv-layout-v1:<userId>:<projectId|"unassigned">"]
type LayoutPayload = {
  projectId: string | null;
  settings: {
    system: "Rooftop" | "Ground-mounted";
    areaWidth: number; areaHeight: number;       // mm
    moduleWidth: number; moduleHeight: number;   // mm
    gap: number; rows: number; cols: number;
    watts: number;                               // Wp
    tilt: number;
    orientation: "landscape" | "portrait";
    setback: number;
    obstacleWidth: number; obstacleHeight: number;
  };
  panels: Array<{ id: number; x: number; y: number; w: number; h: number }>; // mm
  obstacles: Array<{ id: number; x: number; y: number; w: number; h: number; label: string; heightM?: number }>;
  site: {
    coordinates: { lat: number; lng: number };
    address: string;
    polygonPoints?: Array<{ lat: number; lng: number }>;
    polygonCorners?: Array<{ x: number; y: number }>;  // local mm, Y down
    rotationDeg?: number; pitchDegrees?: number; azimuthDegrees?: number;
    googleSolarData?: unknown;
  } | null;
  backgroundImage: string;      // JPEG data URL (can be MBs)
  backgroundOpacity: number;
};
```
Source: `PVLayout.tsx:32-59, 154-172, 429-453`; confirmed by reading seeded payloads `defaultProjectsData.ts:23-77`.

### Remote payload
- `POST /api/design/projects/:id/layout` with exactly the object above (`api.ts:158-166`).
- `GET` returns `{ layout_data }` or the payload itself (`api.ts:143-156`).
- No `layout_data` DB shape is defined in this repo.

### Consumers (all read the same localStorage key)
| Consumer | Fields used | Notes |
|---|---|---|
| `BOQ.tsx:156-189` | `panels.length`, `settings.watts`, `settings.system` | If `panels` empty, sync refuses. |
| `EngineeringReport.tsx:824-840, 970-980` | `settings`, `panels`, `obstacles`, `site.polygonCorners`, `site.coordinates`, `backgroundImage` | Scans every localStorage key ending in `:<projectId>`; requires `panels.length > 0`. |
| `PVLayout3D.tsx:498-537` | `site.polygonCorners`, `panels`, `obstacles`, `settings` | Same payload. |
| `PVLayout` itself | all fields | Remote load only overwrites panels when `remote.panels.length > 0` (`:287`). |

### Contract defects relevant to Electrical
1. **No module identity.** Electrical cannot know manufacturer/model/Voc/Isc from the layout; only geometry and `watts`.
2. **No segment IDs / per-segment counts.** The SLD plan's "strings linked to Field Segments" is impossible without the PV Layout segment work.
3. **No revision or timestamp.** Stale detection cannot be implemented from current data.
4. **Legacy key drift.** Seeded layouts use `panelWidth`, `panelHeight`, `panelWatts` (`defaultProjectsData.ts:28-30, 56-58`) while `PVLayout` reads `moduleWidth`, `moduleHeight`, `watts` (`:44-59`). Result: seeded projects silently fall back to 2278×1134 mm / 580 Wp in the editor, and `BOQ.syncPVLayout` reports `? Wp` because `settings.watts` is `undefined`.
5. **Capacity is derived from `panels.length × settings.watts`**, so any electrical design must read the panel array, not a project `capacity` field.
6. **Image blob in the same payload** makes snapshots heavy if copied; electrical snapshots must reference the layout, not duplicate it.

### Project contract
```ts
// api.ts:10-19
type Project = { id; name; type: "Ground-mounted"|"Rooftop"; capacity: number; status;
                 updated: string; layout_data?: any; boq_data?: any };
```
`project_id` is the only join key; no user/workspace scoping is sent to the server.

---

## 4. Reusable code (extract, don't rewrite)

| Candidate | Source | Reuse plan |
|---|---|---|
| String math | `StringCalculator.tsx:35-95` | Extract to pure `engine/strings.ts`; keep formulas, add units/coefficient metadata |
| MPPT math | `InverterConfiguration.tsx:64-104` | Extract to `engine/mppt.ts`; add voltage-mix + input-count checks |
| Temperature correction | `StringCalculator.tsx:46-49` | Generalise to βVoc/βVmp/αIsc with explicit reference temperature |
| Cable drop | `CableSizing.tsx:42-62` | Extract `engine/cables.ts`; keep user-entered ampacity and route-length requirement |
| Protection checks | `ProtectionGrounding.tsx:42-56` | Extract `engine/protection.ts` |
| Breaker formulas | `BreakerSizing.tsx:16` | Extract `engine/breakers.ts` |
| Tray fill | `TraySizing.tsx:17-19` | Extract `engine/tray.ts` (optional Phase 4) |
| Layout adapter | `PVLayout.tsx:154-172` + `api.fetchProjectLayout` | New `electrical/layoutSource.ts` with explicit types + fingerprint |
| Persistence pattern | `api.ts:173-203` (BOQ) | Mirror for electrical (REST + localStorage fallback) |
| DXF writer | `PVLayout.tsx:982-1048`, `CADDrawings.tsx:55-70` | Reuse pair/entity style for future SLD DXF export |
| BOQ categories | `BOQ.tsx:34-64` | Map SLD equipment to existing categories: `Electrical`, `Cable`, `Grounding`, `Inverter`, `PV Module` |
| Report print styles | `EngineeringReport.tsx:982-1010` | Reuse print/A4 CSS approach for SLD sheet |
| Status styling | `.status`, `.status-planning`, `.pv-good`, `.pv-warning` (`styles.css`) | Reuse for Pass/Warning/Fail/Not calculated |

---

## 5. Missing functionality (build list)

1. Typed PV module + inverter datasheet catalog with source + verification date, and "custom equipment" entry.
2. Project-scoped electrical design state and persistence.
3. Pure calculation engine with explicit assumptions and Pass / Warning / Fail / Not Calculated states.
4. Per-segment string groups (depends on PV Layout segments; fallback: one implicit segment).
5. MPPT allocation UI with per-MPPT voltage/current/orientation validation.
6. DC topology (strings → combiner → isolator → SPD → inverter) and AC topology (inverter → breaker → panel → meter → PCC/grid) as data.
7. Cable schedule driven by actual route lengths (never inferred) and installation assumptions.
8. Protection schedule with breaking capacity only when fault data exists.
9. Structured SLD: node/connection model → automatic layout → SVG rendering with zoom/pan/select/drag; drag edits layout only, not calculations.
10. Stale/revision handling: fingerprint of layout + equipment + assumptions; mark SLD stale on change; keep revisions.
11. Schedules/tables with traceability and export (CSV/JSON; SBOM later).
12. Tests for the 11 fixtures in the plan §16.

---

## 6. Risks to existing projects and modules

| # | Risk | Detail / mitigation |
|---|---|---|
| R1 | **Backend is absent** | No server code in repo. New `/electrical` endpoint or DB column cannot be verified here. Ship local-first with REST best-effort, same as layout/BOQ; confirm contract with SonusID owner before relying on it. |
| R2 | **Contract drift** | Seeded `panel*` vs runtime `module*` keys already break Wp sync. Fix additively with a normaliser (`watts ?? panelWatts ?? 580`), never by rewriting user drafts. |
| R3 | **No Field Segments** | Electrical must not invent segments. Phase 1 adapter returns one `ImplicitSegment` covering all panels; per-segment strings become available only after the PV Layout segment work. |
| R4 | **Duplicate source of truth** | BOQ, Report, 3D and PV Layout all read the same localStorage key. Electrical must read that payload and store only references + snapshots, never a second panel count. |
| R5 | **localStorage quota** | Layout payload already contains a JPEG data URL. Electrical snapshots must exclude images and stay small; handle `QuotaExceededError` visibly. |
| R6 | **API failure silence** | `saveProjectLayout` swallows failure. New code must surface save status/revision mismatch. |
| R7 | **UI regression** | `App.tsx` mounts existing calculators directly. Any electrical shell must preserve them (e.g. keep them as a "Preliminary calculators" tab) and must not remove menu items `cable`, `protection`, `breaker`, `tray`. |
| R8 | **Fabricated specs** | The plan forbids invented datasheets. Catalog entries must have `source` + `verifiedAt`; otherwise mark `Unverified` and block "approved" states. |
| R9 | **Engineering liability** | All results remain preliminary until a qualified engineer reviews. The UI must carry the same warning pattern already used in the calculators. |
| R10 | **No tests/tooling** | Add Vitest (dev-only) + `npm test`; keep `tsc -b` and `vite build` green. |
| R11 | **Large single files** | `EngineeringReport.tsx` is 128 kB; avoid growing it. New electrical code goes into a dedicated folder. |
| R12 | **Existing seeded data** | Default layouts/BOQs are demo data (`defaultProjectsData.ts`) and must not be overwritten or "migrated" by the electrical feature. |

---

## 7. Proposed schema changes (identified separately, not implemented)

### 7.1 Front-end contracts (no DB)
```ts
// src/electrical/types.ts
type VerificationState = "verified" | "unverified" | "missing";
type DesignStatus = "preliminary" | "calculated" | "stale" | "approved";

interface ModuleSpec {
  manufacturer: string; model: string;
  pmaxWp: number; voc: number; vmp: number; isc: number; imp: number;
  betaVocPctPerC: number; betaVmpPctPerC?: number; alphaIscPctPerC?: number;
  referenceTempC: 25; maxSystemVoltageV: number; maxSeriesFuseA: number;
  tempMinC?: number; tempMaxC?: number;
  source: string; verifiedAt?: string; verification: VerificationState;
}

interface InverterSpec {
  manufacturer: string; model: string;
  ratedAcPowerW: number; maxDcVoltageV: number;
  mpptMinV: number; mpptMaxV: number; startupV?: number;
  mpptCount: number; inputsPerMppt: number;
  maxMpptCurrentA: number; maxMpptIscA: number;
  maxUsableDcPowerW?: number;
  ratedAcVoltageV: number; phases: 1 | 3; frequencyHz: 50 | 60;
  powerFactorRange?: [number, number]; efficiencyPct: number;
  source: string; verifiedAt?: string; verification: VerificationState;
}

interface StringGroup {
  id: string; segmentId: string; name: string;
  moduleId: string; modulesPerString: number; stringCount: number;
  orientation?: "landscape" | "portrait"; tiltDeg?: number; azimuthDeg?: number;
  inverterId: string; mppt: Array<{ mpptIndex: number; strings: number }>;
}

interface ElectricalDesign {
  version: 1; schema: "solarapp.electrical"; projectId: string;
  revision: number; status: DesignStatus;
  createdAt: string; updatedAt: string;
  sourceLayout: { fingerprint: string; panelCount: number; dcKwp: number; savedAt?: string };
  modules: ModuleSpec[]; inverters: Array<InverterSpec & { quantity: number }>;
  strings: StringGroup[];
  dc: { combiner?: boolean; isolator?: boolean; spd?: boolean; cableRuns: CableRun[] };
  ac: { topology: "single" | "combined" | "multiple"; voltageV: number; phases: 1 | 3; frequencyHz: 50 | 60;
        powerFactor: number; mainBreakerA?: number; faultLevelKa?: number; cableRuns: CableRun[] };
  assumptions: { tempMinC: number; tempMaxC: number; dcAcMin: number; dcAcMax: number; routeLengthRequired: true };
  topology: { nodes: TopologyNode[]; connections: TopologyConnection[] };
  sldLayout: Record<string, { x: number; y: number }>;   // visual only
  results?: CalculationSnapshot;
}

interface CalculationSnapshot {
  engineVersion: string; computedAt: string; inputHash: string;
  strings: Array<{ id: string; vocColdV: number; vmpHotV: number; iscA: number; impA: number;
                   checks: Record<string, "pass" | "warning" | "fail" | "not_calculated"> }>;
  warnings: string[]; totals: { modules: number; dcKwp: number; acKw: number; dcAcRatio: number };
}
```
All fields optional-tolerant on read; unknown properties preserved on write.

### 7.2 Persistence options (choose with backend owner)
| Option | Change | Pros / cons |
|---|---|---|
| **A. Add `electrical` key to the existing layout payload** | Front-end only | Zero backend change; mixes concerns; layout payload grows; still one source of truth. Acceptable interim. |
| **B. New `/api/design/projects/:id/electrical` endpoint + `electrical_data` column** (mirror BOQ) | Backend change required | Clean separation; matches `fetchProjectBoq` pattern; needs backend + migration outside this repo. **Recommended if backend is available.** |
| **C. Supabase table `project_electrical_designs` + RLS** | Architecture change | Plan mentions Supabase/RLS, but this repo has no Supabase client at all. Not recommended without an approved architecture decision. |

**No migration is proposed for this repository** (there is nothing to migrate). Do not create tables or endpoints without approval.

### 7.3 Additive fixes needed in PV Layout (approved separately)
- Normalise `moduleWidth|panelWidth`, `moduleHeight|panelHeight`, `watts|panelWatts`.
- Add `version` + `updatedAt` to the payload (small, backward compatible) for fingerprints/stale detection.
- Do **not** add segments here; that is the other plan.

---

## 8. Smallest safe implementation sequence

| Phase | Work | Deliverable | Gate |
|---|---|---|---|
| 0 | This audit | this file | **awaiting approval** |
| 1 | `src/electrical/types.ts`, `src/electrical/layoutSource.ts` (read + normalise + fingerprint), `src/electrical/catalog.ts` (verified/custom only), Vitest setup | Contract + adapter + tests; no UI change | contract review |
| 2 | `engine/strings.ts`, `engine/mppt.ts`, `engine/dcac.ts`, `engine/validation.ts` (pure functions, no React) | Deterministic calculations + 11 fixtures | tests green |
| 3 | `ElectricalDesign.tsx` shell (tabs: Overview, Equipment, String Design, DC, AC, SLD, Schedules) inside existing `electrical` route; keep old calculators in a "Preliminary calculators" tab; pass `projectId`/`userId` | Working selection + strings + validation | demo |
| 4 | DC/AC topology data, route-length inputs, cable/protection schedules | Schedules + "not calculated — route length required" states | demo |
| 5 | `sld/model.ts` (topology builder) + `sld/SldViewer.tsx` (SVG, zoom/pan/select/drag) + stale badge + export (SVG/PNG/print; DXF optional) | Editable SLD from typed model | demo |
| 6 | Persist revisions (option A/B), stale fingerprints, BOQ/Report exports, regression | Revision-aware design + PR | full checks |

Constraints: one branch `feat/electrical-sld`; no changes to `main`; no deletion of existing components; no invented datasheet values; every phase must keep `tsc -b` + `vite build` + tests green.

---

## 9. Test plan (maps to plan §16)

Add Vitest (dev-only) with fixtures in `src/electrical/__tests__/`:

1. Valid string configuration → all Pass.
2. Cold-corrected Voc > inverter max DC voltage → Fail.
3. Hot Vmp outside MPPT window → Fail / Warning as configured.
4. MPPT operating or Isc limit exceeded → Fail with the exact MPPT index.
5. Too many physical string inputs on one MPPT → Fail.
6. Strings with different tilt/azimuth on one MPPT → Warning (mixed orientation).
7. Missing βVoc → `not_calculated`, never Pass.
8. Missing cable route length → `not_calculated`, no inferred length.
9. Single inverter topology → expected node/connection list and tags.
10. Multiple inverter topology → correct aggregation and AC combiner node.
11. Multiple Field Segments with unequal counts → per-segment strings, totals, and assignment correctness (adapter test with a synthetic v2 payload; until segments ship, assert the single implicit segment).

Plus:
- Adapter test: legacy `panel*` payload normalises to `module*`; unknown fields preserved.
- Fingerprint test: changing panel count/settings changes hash; reordering unrelated keys does not.
- SLD model test: every connection references an existing node; node order deterministic; drag updates only `sldLayout`.
- Regression: `tsc -b`, `vite build`, and a manual checklist for PV Layout 2D/GIS, 3D, BOQ, Report, Cable/Breaker/Protection/Tray, CAD.

---

## 10. Definition-of-success audit verdict

The electrical side today is a set of **disconnected, non-persistent screening calculators** with no equipment catalog, no topology model, no revisioning, and no SLD. The PV Layout side provides a usable **module count and capacity**, but no module identity, no segment IDs, and no revision timestamp.

Therefore the smallest credible path is:
1. typed contracts + layout adapter + verified equipment data;
2. pure, tested calculation engine;
3. project-scoped UI reusing existing calculators;
4. topology + SLD renderer;
5. persistence/revisions + downstream exports.

No code will be changed until this audit and the Phase 1 contracts are approved.
