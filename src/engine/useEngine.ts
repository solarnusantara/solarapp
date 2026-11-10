// Orchestration hook: link -> scene sync -> weather -> circuit/auto -> simulate -> report -> cache.
// Never throws to the UI: every failure lands in `error` (standalone dev => "Engine Helio tidak
// tersedia"). Pure data movement; all numbers come from helio.
import { useCallback, useEffect, useRef, useState } from "react";
import * as C from "./client";
import { buildSimulationInput, nearestRegion } from "./inputBuilder";
import { layoutToScene, type AdapterWarning } from "./sceneAdapter";
import { choiceFromDataset, planWeather, weatherRefOf } from "./weather";
import type { SavedLayout } from "./layoutStore";
import type {
  CircuitAutoRequest, CircuitAutoResult, ComponentSku, EngineInputs, EngineLink, EngineResultSummary, EngineStateResponse, WeatherChoice,
} from "./types/local";

export type EngineStatus = "idle" | "loading" | "unavailable" | "unlinked" | "ready" | "linking" | "running" | "error";

export interface EngineHook {
  status: EngineStatus;
  step: string;
  state: EngineStateResponse | null;
  link: EngineLink | null;
  result: EngineResultSummary | null;
  warnings: string[];
  errors: string[];
  error: string | null;
  circuit: CircuitAutoResult | null;
  refresh: () => Promise<void>;
  run: () => Promise<boolean>;
  buildCircuit: () => Promise<boolean>;
  cancel: () => void;
}

export const toLink = (s: EngineStateResponse | null): EngineLink | null =>
  s?.helio_design_id && s.helio_project_id && s.helio_condition_set_id && s.helio_project_slug
    ? { helio_project_slug: s.helio_project_slug, helio_project_id: s.helio_project_id, helio_design_id: s.helio_design_id, helio_condition_set_id: s.helio_condition_set_id }
    : null;

const fmtAdapter = (w: AdapterWarning) => `[${w.code}] ${w.message}`;

const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/**
 * Body for helio `circuit/auto`, or `null` when no module/inverter is picked, or `{ error }` when
 * an input is missing. Exactly one of inverter_count / target_dc_ac; both site temperatures with
 * their source (helio returns 422 temperature_basis_missing otherwise, and we never invent one).
 */
export function circuitRequest(inputs: Partial<EngineInputs>): CircuitAutoRequest | null | { error: string } {
  if (!inputs.module_characterization_id || !inputs.inverter_characterization_id) return null;
  const count = numOrNull(inputs.inverter_count);
  const dcac = numOrNull(inputs.target_dc_ac);
  if ((count === null) === (dcac === null)) return { error: "Isi tepat satu: jumlah inverter atau target DC/AC." };
  const tMin = numOrNull(inputs.t_min_c), tMinSrc = strOrNull(inputs.t_min_source);
  const tMax = numOrNull(inputs.t_amb_max_c), tMaxSrc = strOrNull(inputs.t_amb_max_source);
  if (tMin === null || tMax === null || !tMinSrc || !tMaxSrc) {
    return { error: "Isi suhu minimum sel dan suhu ambien maksimum situs, masing-masing beserta sumbernya." };
  }
  const manual = inputs.string_length_method === "manual";
  const nMin = numOrNull(inputs.string_len_min), nMax = numOrNull(inputs.string_len_max);
  if (manual && (nMin === null || nMax === null || nMin < 1 || nMax < nMin || !strOrNull(inputs.string_len_source))) {
    return { error: "Panjang string manual: isi minimum, maksimum (min ≤ maks) dan sumbernya." };
  }
  return {
    module_characterization_id: inputs.module_characterization_id,
    inverter_characterization_id: inputs.inverter_characterization_id,
    inverter_count: count, target_dc_ac: dcac,
    string_length_method: manual ? "manual" : null,
    manual_min: manual ? nMin : null, manual_max: manual ? nMax : null, routing: null,
    t_min_c: tMin, t_min_source: tMinSrc, t_amb_max_c: tMax, t_amb_max_source: tMaxSrc,
    noct_c: numOrNull(inputs.noct_c), ac_voltage_v: numOrNull(inputs.ac_voltage_v),
  };
}

export function useEngine(args: {
  projectId: string | null;
  projectName: string;
  getLayout: () => SavedLayout | null;
}): EngineHook {
  const { projectId, projectName, getLayout } = args;
  const [status, setStatus] = useState<EngineStatus>("idle");
  const [step, setStep] = useState("");
  const [state, setState] = useState<EngineStateResponse | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [circuit, setCircuit] = useState<CircuitAutoResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fail = useCallback((e: unknown) => {
    setError(C.engineErrorMessage(e));
    setStep("");
    setStatus(C.isUnavailable(e) ? "unavailable" : "error");
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId) { setStatus("idle"); return; }
    setStatus("loading"); setError(null);
    try {
      const s = await C.getEngineState(projectId);
      setState(s);
      setStatus(toLink(s) ? "ready" : "unlinked");
    } catch (e) {
      // 404 from the server (not the vite fallback) = project unknown to erpsonus or never linked.
      if (e instanceof C.EngineError && e.status === 404 && e.code !== "engine_unavailable") { setState(null); setStatus("unlinked"); return; }
      fail(e);
    }
  }, [projectId, fail]);

  useEffect(() => { void refresh(); return () => abortRef.current?.abort(); }, [refresh]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  /** link (idempotent) + scene sync. Returns what later steps need, or null after setting an error. */
  const prepare = useCallback(async (signal: AbortSignal) => {
    if (!projectId) { setError("Proyek belum tersimpan di server."); setStatus("error"); return null; }
    const layout = getLayout();
    if (!layout) { setErrors(["Layout belum dimuat."]); setStatus("error"); return null; }
    const adapter = layoutToScene(layout);
    setWarnings(adapter.warnings.map(fmtAdapter));
    setStep("Memeriksa site referensi");
    const sites = await C.getSites(signal);
    const regionId = adapter.latitude !== null && adapter.longitude !== null
      ? nearestRegion(adapter.latitude, adapter.longitude, sites) : null;
    const inputs = (layout.engine_inputs ?? {}) as Partial<EngineInputs>;
    const built = buildSimulationInput({ projectName, adapter, inputs, regionId });
    if (!built.input) { setErrors(built.errors); setStatus("error"); setError(null); return null; }
    setErrors([]);

    setStep("Menghubungkan ke SolarApp Engine Studio");
    setStatus("linking");
    let link = toLink(state);
    if (!link) {
      link = await C.linkProject(projectId, { project_name: projectName, client_name: inputs.client_name?.trim() || null, sim_input: built.input });
      await refresh();
    }
    setStep("Menyinkronkan geometri (scene)");
    await C.saveSceneWithRetry(link.helio_design_id, adapter.scene, signal);
    return { link, input: built.input, adapter, inputs, sites, regionId: regionId as string };
  }, [projectId, projectName, getLayout, state, refresh]);

  const buildCircuit = useCallback(async () => {
    const ac = new AbortController(); abortRef.current = ac;
    setError(null);
    try {
      const p = await prepare(ac.signal);
      if (!p) return false;
      const req = circuitRequest(p.inputs);
      if (!req || "error" in req) {
        setErrors([req ? req.error : "Pilih modul dan inverter (beserta karakterisasinya) dulu."]);
        setStatus("error"); return false;
      }
      setStep("Membuat sirkuit (SolarApp Engine)");
      const res = await C.autoCircuit(p.link.helio_design_id, req, ac.signal);
      setCircuit(res);
      setStatus("ready"); setStep("");
      return true;
    } catch (e) { fail(e); return false; }
  }, [prepare, fail]);

  const run = useCallback(async () => {
    const ac = new AbortController(); abortRef.current = ac;
    setError(null); setCircuit(null);
    try {
      const p = await prepare(ac.signal);
      if (!p) return false;
      const all = [...p.adapter.warnings.map(fmtAdapter)];

      // Weather: the source picked in the weather panel wins (series -> multi-year IAV/P90). Only when
      // nothing is picked does the run fetch a PVGIS TMY at the project point; if that fails too, the
      // condition set keeps helio's labelled reference site.
      const choice = p.inputs.weather_choice ?? null;
      let auto: WeatherChoice | null = null;
      if (!weatherRefOf(choice)) {
        setStep("Mengambil cuaca PVGIS");
        try {
          const site = p.sites.find((s) => s.id === p.regionId);
          if (site) {
            const w = await C.createPvgisWeather({ lat: p.input.latitude, lon: p.input.longitude, utc_offset_h: site.utc_offset_h, name: projectName }, ac.signal);
            auto = choiceFromDataset(w.dataset);
          }
        } catch (e) {
          if (e instanceof C.EngineError && e.code === "aborted") throw e;
          all.push(`[WEATHER_FALLBACK] Cuaca PVGIS gagal (${C.verbatimError(e)}); simulasi memakai site referensi ${p.regionId}.`);
        }
      }
      const plan = planWeather(choice, auto);
      // helio rejects weather_*_id together with condition_set_id, so the weather goes into the set.
      if (plan.ref) {
        setStep("Menerapkan sumber cuaca");
        try { await C.setConditionSetWeather(p.link.helio_condition_set_id, plan.ref, ac.signal); }
        catch (e) {
          if (plan.mode === "auto" && !(e instanceof C.EngineError && e.code === "aborted")) {
            all.push(`[WEATHER_FALLBACK] Cuaca PVGIS tidak bisa diterapkan (${C.verbatimError(e)}); simulasi memakai cuaca tersimpan di condition set.`);
            plan.used = null;
          } else throw e; // a source the engineer picked is never swapped silently
        }
      }

      let circuitRes: CircuitAutoResult | null = null;
      const req = circuitRequest(p.inputs);
      if (req && "error" in req) {
        setErrors([req.error]); setStatus("error"); return false;
      }
      if (req) {
        setStep("Membuat sirkuit (SolarApp Engine)");
        circuitRes = await C.autoCircuit(p.link.helio_design_id, req, ac.signal);
        setCircuit(circuitRes);
        for (const i of circuitRes.issues ?? []) all.push(`[${i.code}] ${i.message}`);
      }

      setStep("Menjalankan simulasi 8760 jam");
      setStatus("running");
      // helio's simulate only uses the circuit carried in the input; circuit/auto stores it on the
      // design but does not inject it. Without this the run falls back to the lump plant (one
      // inverter per plane, AC = inverter_ac_kw per plane) and gives badly wrong clipping/AC.
      const simInput = circuitRes?.circuit ? { ...p.input, circuit: circuitRes.circuit as typeof p.input.circuit } : p.input;
      const sim = await C.simulate(simInput, { condition_set_id: p.link.helio_condition_set_id }, { signal: ac.signal, onStatus: (s) => setStep(`Simulasi: ${s}`) });
      for (const w of sim.warnings) all.push(w);

      let report: Awaited<ReturnType<typeof C.createReport>> | null = null;
      setStep("Membuat laporan");
      try { report = await C.createReport(sim.output.simulation_id, { design_id: p.link.helio_design_id }, ac.signal); }
      catch (e) {
        if (e instanceof C.EngineError && e.code === "aborted") throw e;
        all.push(`[REPORT_FAILED] ${C.verbatimError(e)}`);
      }

      const sku = async (id?: string): Promise<ComponentSku | null> => { if (!id) return null; try { return await C.getSku(id, ac.signal); } catch { return null; } };
      const { scene, obstacles, bom_items, ...inputNoScene } = p.input; void scene; void obstacles; void bom_items;
      const summary: EngineResultSummary = {
        engine_version: sim.output.engine_version,
        ran_at: new Date().toISOString(),
        simulation_id: sim.output.simulation_id,
        report_id: (report?.report?.id as string | undefined) ?? null,
        design_id: p.link.helio_design_id,
        condition_set_id: p.link.helio_condition_set_id,
        output: C.slimOutput(sim.output),
        production: (report?.production as EngineResultSummary["production"]) ?? null,
        input: inputNoScene,
        warnings: all,
        weather_used: plan.used,
        circuit_auto: circuitRes,
        components: { module: await sku(p.inputs.module_sku_id), inverter: await sku(p.inputs.inverter_sku_id) },
      };
      setStep("Menyimpan hasil");
      await C.saveEngineResult(projectId as string, summary, summary.engine_version);
      setWarnings(all);
      await refresh();
      setStep("");
      return true;
    } catch (e) { fail(e); return false; }
  }, [prepare, fail, refresh, projectId, projectName]);

  return {
    status, step, state, link: toLink(state), result: state?.helio_last_result ?? null,
    warnings, errors, error, circuit, refresh, run, buildCircuit, cancel,
  };
}
