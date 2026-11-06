// One hook that gathers everything the two reports render. Every source fails independently into a
// status, so a page with no backend still renders its skeleton with "—".
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EngineError, getEngineState, getHourly, getIsoShading, getReportMeta, getShade, getSunPosition, engineErrorMessage,
  isUnavailable, UNAVAILABLE_MESSAGE,
} from "../engine/client";
import { loadLayout, type SavedLayout } from "../engine/layoutStore";
import type { IsoShadingResult, SunPositionDay } from "../engine/types";
import {
  EMPTY_REPORT_META, type EngineResultSummary, type EngineStateResponse, type HourlyResponse, type ReportMeta,
} from "../engine/types/local";

export type SourceStatus = "idle" | "loading" | "ok" | "unavailable" | "empty" | "error";

export interface SourceState<T> { status: SourceStatus; data: T | null; message?: string; /** helio error code, verbatim */ code?: string }
const idle = <T,>(): SourceState<T> => ({ status: "idle", data: null });

/** The 7 standard sun-path curves (each pair of mirrored dates shares one curve). */
export const SUN_DATES: Array<{ key: string; day: string; label: string }> = [
  { key: "1", day: "06-22", label: "22 June" },
  { key: "2", day: "05-22", label: "22 May and 23 July" },
  { key: "3", day: "04-20", label: "20 Apr and 23 Aug" },
  { key: "4", day: "03-20", label: "20 Mar and 23 Sep" },
  { key: "5", day: "02-21", label: "21 Feb and 23 Oct" },
  { key: "6", day: "01-19", label: "19 Jan and 22 Nov" },
  { key: "7", day: "12-22", label: "22 December" },
];

export function mergeMeta(raw: Partial<ReportMeta> | null | undefined): ReportMeta {
  const m = raw ?? {};
  const a = (m.approvals ?? {}) as Partial<ReportMeta["approvals"]>;
  return {
    ...EMPTY_REPORT_META,
    ...m,
    revisions: Array.isArray(m.revisions) ? m.revisions : [],
    approvals: {
      prepared: { ...EMPTY_REPORT_META.approvals.prepared, ...(a.prepared ?? {}) },
      checked: { ...EMPTY_REPORT_META.approvals.checked, ...(a.checked ?? {}) },
      approved: { ...EMPTY_REPORT_META.approvals.approved, ...(a.approved ?? {}) },
    },
  } as ReportMeta;
}

function toState<T>(e: unknown): SourceState<T> {
  if (isUnavailable(e)) return { status: "unavailable", data: null, message: UNAVAILABLE_MESSAGE };
  if (e instanceof EngineError && e.status === 404) return { status: "empty", data: null, message: engineErrorMessage(e) };
  return { status: "error", data: null, message: engineErrorMessage(e) };
}

export interface ReportData {
  engine: SourceState<EngineStateResponse>;
  result: EngineResultSummary | null;
  layout: SourceState<SavedLayout>;
  meta: SourceState<ReportMeta>;
  hourly: SourceState<HourlyResponse>;
  sun: SourceState<Record<string, SunPositionDay | null>>;
  shade: SourceState<unknown>;
  iso: SourceState<IsoShadingResult>;
  reload: () => void;
  setMeta: (m: ReportMeta) => void;
}

export function useReportData(projectId: string | null | undefined, opts: { hourly?: boolean; sun?: boolean; shade?: boolean; iso?: boolean } = {}): ReportData {
  const { hourly: wantHourly = true, sun: wantSun = false, shade: wantShade = false, iso: wantIso = false } = opts;
  const [engine, setEngine] = useState<SourceState<EngineStateResponse>>(idle);
  const [layout, setLayout] = useState<SourceState<SavedLayout>>(idle);
  const [meta, setMetaState] = useState<SourceState<ReportMeta>>(idle);
  const [hourly, setHourly] = useState<SourceState<HourlyResponse>>(idle);
  const [sun, setSun] = useState<SourceState<Record<string, SunPositionDay | null>>>(idle);
  const [shade, setShade] = useState<SourceState<unknown>>(idle);
  const [iso, setIso] = useState<SourceState<IsoShadingResult>>(idle);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setMeta = useCallback((m: ReportMeta) => setMetaState({ status: "ok", data: m }), []);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const result = engine.data?.helio_last_result ?? null;
  const simId = result?.simulation_id ?? null;
  const lat = (result?.output as any)?.weather?.latitude ?? (layout.data?.site?.coordinates?.lat ?? null);
  const lon = (result?.output as any)?.weather?.longitude ?? (layout.data?.site?.coordinates?.lng ?? null);

  // engine state + layout + meta
  useEffect(() => {
    if (!projectId) {
      setEngine({ status: "empty", data: null, message: "Belum ada proyek aktif." });
      return;
    }
    const ac = new AbortController();
    setEngine({ status: "loading", data: null });
    setLayout({ status: "loading", data: null });
    setMetaState({ status: "loading", data: null });
    getEngineState(projectId, ac.signal)
      .then((s) => setEngine(s.helio_last_result ? { status: "ok", data: s } : { status: "empty", data: s, message: "Belum dihitung — buka PV Layout lalu klik Hitung (Helio)" }))
      .catch((e) => !ac.signal.aborted && setEngine(toState(e)));
    loadLayout(projectId)
      .then((l) => !ac.signal.aborted && setLayout(l ? { status: "ok", data: l } : { status: "empty", data: null }))
      .catch(() => !ac.signal.aborted && setLayout({ status: "error", data: null }));
    getReportMeta(projectId, ac.signal)
      .then((m) => setMetaState({ status: "ok", data: mergeMeta(m) }))
      .catch((e) => { if (!ac.signal.aborted) { const s = toState<ReportMeta>(e); setMetaState({ ...s, data: mergeMeta(null) }); } });
    return () => ac.abort();
  }, [projectId, tick]);

  // hourly (lazy: only once a simulation id is known)
  useEffect(() => {
    if (!wantHourly || !simId) { setHourly(idle); return; }
    const ac = new AbortController();
    setHourly({ status: "loading", data: null });
    getHourly(simId, ac.signal)
      .then((h) => setHourly({ status: "ok", data: h }))
      .catch((e) => !ac.signal.aborted && setHourly(toState(e)));
    return () => ac.abort();
  }, [simId, wantHourly, tick]);

  // sun paths
  useEffect(() => {
    if (!wantSun || typeof lat !== "number" || typeof lon !== "number") { setSun(idle); return; }
    const ac = new AbortController();
    setSun({ status: "loading", data: null });
    Promise.all(SUN_DATES.map((d) => getSunPosition({ lat, lon, day: d.day, stepMin: 15, timeBasis: "solar" }, ac.signal).then((x) => [d.key, x] as const).catch(() => [d.key, null] as const)))
      .then((pairs) => {
        if (ac.signal.aborted) return;
        const rec = Object.fromEntries(pairs);
        const any = pairs.some(([, v]) => v);
        setSun(any ? { status: "ok", data: rec } : { status: "unavailable", data: null, message: UNAVAILABLE_MESSAGE });
      });
    return () => ac.abort();
  }, [wantSun, lat, lon, tick]);

  // shade (iso diagram data, if helio has any)
  useEffect(() => {
    if (!wantShade || !simId) { setShade(idle); return; }
    const ac = new AbortController();
    getShade(simId, ac.signal)
      .then((s) => setShade({ status: "ok", data: s }))
      .catch((e) => !ac.signal.aborted && setShade(toState(e)));
    return () => ac.abort();
  }, [wantShade, simId, tick]);

  // iso-shadings diagram (per design; needs a linked project)
  const designId = engine.data?.helio_design_id ?? null;
  useEffect(() => {
    if (!wantIso || !designId) { setIso(idle); return; }
    const ac = new AbortController();
    setIso({ status: "loading", data: null });
    getIsoShading(designId, { azStep: 5, elStep: 2 }, ac.signal)
      .then((r) => setIso({ status: "ok", data: r }))
      .catch((e) => { if (!ac.signal.aborted) setIso({ ...toState<IsoShadingResult>(e), code: e instanceof EngineError && e.status >= 400 && !isUnavailable(e) ? e.code || undefined : undefined }); });
    return () => ac.abort();
  }, [wantIso, designId, tick]);

  return { engine, result, layout, meta, hourly, sun, shade, iso, reload, setMeta };
}
