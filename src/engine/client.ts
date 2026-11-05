// Typed fetch client for the helio engine, reached through the erpsonus same-origin proxy
// (`/api/design/engine/<rest>` -> helio `/api/v1/<rest>`). No physics here (ADR-0007): this only
// moves JSON. Every failure becomes an EngineError so callers never crash standalone (no backend).
import type {
  ConditionSet, DocumentedDefaults, SavedConditionSet, Scene, SimulationInput, SimulationOutput,
  SiteSummary, SunPositionDay, WeatherDatasetCreated, HorizonProfile,
} from "./types";
import type {
  CircuitAutoRequest, CircuitAutoResult, ComponentCharacterization, ComponentKind, ComponentSku, EngineLink, EngineOutputSlim,
  EngineResultSummary, EngineStateResponse, HourlyResponse, ReportMeta,
} from "./types/local";

export const ENGINE_BASE = "/api/design/engine/";
export const UNAVAILABLE_MESSAGE = "Engine Helio tidak tersedia";

export class EngineError extends Error {
  status: number;
  code: string;
  detail: unknown;
  constructor(status: number, code: string, detail?: unknown, message?: string) {
    super(message ?? engineMessage(status, code, detail));
    this.name = "EngineError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function engineMessage(status: number, code: string, detail: unknown): string {
  switch (code) {
    case "engine_unavailable":
    case "engine_not_configured":
    case "engine_unreachable":
      return UNAVAILABLE_MESSAGE;
    case "forbidden":
      return "Anda tidak punya hak menulis di proyek ini (akun viewer hanya bisa membaca).";
    case "not_linked":
    case "not_allowed":
      return "Proyek ini belum terhubung ke engine Helio.";
    case "circuit_missing":
      return "Sirkuit belum dibuat — pilih modul & inverter lalu Buat sirkuit";
    case "stale_revision":
      return "Desain berubah di tempat lain (revisi usang). Muat ulang lalu coba lagi.";
    case "aborted":
      return "Dibatalkan.";
    case "timeout":
      return "Perhitungan melebihi 5 menit dan dihentikan.";
  }
  const d = detail as { error?: string; message?: string } | string | null;
  const text = typeof d === "string" ? d : d?.message ?? d?.error;
  return text ? String(text) : `Engine Helio mengembalikan HTTP ${status}${code ? ` (${code})` : ""}`;
}

export function engineErrorMessage(e: unknown): string {
  if (e instanceof EngineError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

export const isUnavailable = (e: unknown) =>
  e instanceof EngineError && (e.code === "engine_unavailable" || e.code === "engine_not_configured" || e.code === "engine_unreachable");

type Init = Omit<RequestInit, "body"> & { json?: unknown; raw?: BodyInit };

/** Core fetch. `path` is relative to the proxy base (no leading slash) unless it starts with `/api/`. */
export async function engineFetch(path: string, init: Init = {}): Promise<Response> {
  const url = path.startsWith("/api/") ? path : ENGINE_BASE + path.replace(/^\/+/, "");
  const headers = new Headers(init.headers);
  let body: BodyInit | undefined = init.raw;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, body, credentials: "same-origin" });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw new EngineError(0, "aborted");
    throw new EngineError(0, "engine_unavailable", String(e));
  }
  if (res.ok) return res;
  throw await toError(res);
}

async function toError(res: Response): Promise<EngineError> {
  const ct = res.headers.get("content-type") ?? "";
  let detail: unknown = null;
  let code = "";
  if (ct.includes("json")) {
    try {
      detail = await res.json();
      const c = (detail as { code?: unknown })?.code;
      if (typeof c === "string") code = c;
    } catch { /* keep null */ }
  } else {
    // Standalone dev: vite answers /api/* with index.html (200) or a bare 404. Not a helio answer.
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    code = "engine_unavailable";
  }
  if (res.status === 403 && !code) code = "forbidden";
  if (res.status === 409 && !code) code = "conflict";
  return new EngineError(res.status, code, detail);
}

/** JSON helper. A 200 that is not JSON (vite fallback html) is "engine unavailable". */
export async function engineJson<T>(path: string, init: Init = {}): Promise<T> {
  const res = await engineFetch(path, init);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) throw new EngineError(res.status, "engine_unavailable", "respons bukan JSON");
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const qs = (o: Record<string, string | number | boolean | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const enc = encodeURIComponent;

// ---------------- simulate (200 body | 202 job) ----------------
export type SimulateResponse = SimulationOutput & {
  simulation_id: string;
  weather_dataset_id: string | null;
  design_version_id?: string | null;
};

export interface SimulateOptions {
  signal?: AbortSignal;
  onStatus?: (status: string) => void;
  timeoutMs?: number;
  pollMs?: number;
}
export interface SimulateQuery {
  weather_dataset_id?: string | null;
  condition_set_id?: string | null;
  design_version_id?: string | null;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new EngineError(0, "aborted"));
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new EngineError(0, "aborted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** Polls `jobs/{id}` every `pollMs` until it succeeds, fails, or `timeoutMs` (default 5 min) passes. */
export async function pollJob(jobId: string, opts: SimulateOptions = {}): Promise<SimulateResponse> {
  const { signal, onStatus, timeoutMs = 300_000, pollMs = 1000 } = opts;
  const started = Date.now();
  for (;;) {
    if (signal?.aborted) throw new EngineError(0, "aborted");
    const job = await engineJson<{ status: string; result?: SimulateResponse; error?: unknown; status_reason?: string }>(
      `jobs/${enc(jobId)}`, { signal },
    );
    onStatus?.(job.status);
    if (job.status === "succeeded" || job.status === "completed" || job.status === "done") {
      if (!job.result) throw new EngineError(200, "job_no_result", job, "Job selesai tetapi tanpa hasil.");
      return job.result;
    }
    if (job.status === "failed" || job.status === "error" || job.status === "cancelled") {
      const e = job.error as { message?: string; code?: string } | string | undefined;
      const msg = typeof e === "string" ? e : e?.message ?? job.status_reason ?? "Simulasi gagal";
      throw new EngineError(500, (typeof e === "object" && e?.code) || "job_failed", job, msg);
    }
    if (Date.now() - started > timeoutMs) throw new EngineError(0, "timeout");
    await sleep(pollMs, signal);
  }
}

export async function simulate(
  input: SimulationInput, query: SimulateQuery = {}, opts: SimulateOptions = {},
): Promise<{ output: SimulateResponse; warnings: string[] }> {
  const res = await engineFetch(`simulate${qs({ ...query })}`, { method: "POST", json: input, signal: opts.signal });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) throw new EngineError(res.status, "engine_unavailable", "respons bukan JSON");
  const body = (await res.json()) as SimulateResponse | { job_id: string };
  const output = res.status === 202 || ("job_id" in body && !("annual_p50_kwh" in body))
    ? await pollJob((body as { job_id: string }).job_id, opts)
    : (body as SimulateResponse);
  return { output, warnings: Array.isArray(output.warnings) ? [...output.warnings] : [] };
}

// ---------------- link / state / result (erpsonus) ----------------
export interface LinkRequest { project_name: string; client_name: string | null; sim_input: unknown }
export const linkProject = (projectId: string, body: LinkRequest) =>
  engineJson<EngineLink>(`/api/design/projects/${enc(projectId)}/engine/link`, { method: "POST", json: body });
export const getEngineState = (projectId: string, signal?: AbortSignal) =>
  engineJson<EngineStateResponse>(`/api/design/projects/${enc(projectId)}/engine`, { signal });
export const saveEngineResult = (projectId: string, result: EngineResultSummary, engine_version: string) =>
  engineJson<unknown>(`/api/design/projects/${enc(projectId)}/engine/result`, { method: "POST", json: { result, engine_version } });

// ---------------- report meta + assets ----------------
export const getReportMeta = (projectId: string, signal?: AbortSignal) =>
  engineJson<Partial<ReportMeta>>(`/api/design/projects/${enc(projectId)}/report-meta`, { signal });
export const putReportMeta = (projectId: string, meta: ReportMeta) =>
  engineJson<Partial<ReportMeta>>(`/api/design/projects/${enc(projectId)}/report-meta`, { method: "PUT", json: meta });
export type ReportAssetKind = "owner_logo" | "epc_logo";
/** Same-origin URL usable directly in an `<img src>`; `bust` forces a reload after an upload. */
export const reportAssetUrl = (projectId: string, kind: ReportAssetKind, bust?: number) =>
  `/api/design/projects/${enc(projectId)}/report-assets/${kind}${bust ? `?v=${bust}` : ""}`;
export async function uploadReportAsset(projectId: string, kind: ReportAssetKind, file: File): Promise<void> {
  if (file.type !== "image/png" && file.type !== "image/jpeg") throw new EngineError(0, "bad_type", null, "Logo harus PNG atau JPEG.");
  if (file.size > 1_048_576) throw new EngineError(0, "too_large", null, "Logo maksimal 1 MB.");
  await engineFetch(reportAssetUrl(projectId, kind), { method: "PUT", raw: file, headers: { "Content-Type": file.type } });
}

// ---------------- scene / design ----------------
export interface SceneEnvelope { design_id?: string; revision: number; scene: Scene | null }
export const getScene = (designId: string, signal?: AbortSignal) =>
  engineJson<SceneEnvelope>(`designs/${enc(designId)}/scene`, { signal });
export const putScene = (designId: string, scene: Scene, revision: number | null, signal?: AbortSignal) =>
  engineJson<unknown>(`designs/${enc(designId)}/scene${qs({ revision })}`, { method: "PUT", json: scene, signal });

/** PUT scene with stale-revision recovery: on 409 re-GET the revision once and retry. */
export async function saveSceneWithRetry(designId: string, scene: Scene, signal?: AbortSignal): Promise<number | null> {
  let env = await getScene(designId, signal).catch((e) => { if (e instanceof EngineError && e.status === 404) return null; throw e; });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await putScene(designId, scene, env?.revision ?? null, signal);
      return env?.revision ?? null;
    } catch (e) {
      if (e instanceof EngineError && e.status === 409 && attempt === 0) {
        env = await getScene(designId, signal);
        continue;
      }
      if (e instanceof EngineError && e.status === 423) throw new EngineError(423, "locked", e.detail, "Desain di Helio sedang dikunci.");
      throw e;
    }
  }
  return null;
}

export const autoCircuit = (designId: string, body: CircuitAutoRequest, signal?: AbortSignal) =>
  engineJson<CircuitAutoResult>(`designs/${enc(designId)}/circuit/auto`, { method: "POST", json: body, signal });

/** GET of a stored-circuit report. 409 `circuit_missing` becomes EngineError(code "circuit_missing"). */
export const designReport = <T = unknown>(designId: string, name: string, query: Record<string, string | number | boolean | null | undefined> = {}, signal?: AbortSignal) =>
  engineJson<T>(`designs/${enc(designId)}/${name}${qs(query)}`, { signal });
export const designFileUrl = (designId: string, path: string) => `${ENGINE_BASE}designs/${enc(designId)}/${path}`;

// ---------------- weather / sites / sun / horizon ----------------
export const getSites = (signal?: AbortSignal) => engineJson<SiteSummary[]>("sites", { signal });
export const getSunPosition = (q: { lat: number; lon: number; day: string; stepMin?: number }, signal?: AbortSignal) =>
  engineJson<SunPositionDay>(`sun-position${qs({ lat: q.lat, lon: q.lon, day: q.day, step_min: q.stepMin ?? 15 })}`, { signal });
export const createPvgisWeather = (body: { lat: number; lon: number; utc_offset_h: number; name?: string }, signal?: AbortSignal) =>
  engineJson<WeatherDatasetCreated>("weather/pvgis", { method: "POST", json: body, signal });
export const getPvgisHorizon = (lat: number, lon: number, signal?: AbortSignal) =>
  engineJson<{ horizon: HorizonProfile; source: string; lat: number; lon: number }>(`horizon/pvgis${qs({ lat, lon })}`, { signal });

// ---------------- condition sets ----------------
export const getConditionSet = (id: string, signal?: AbortSignal) =>
  engineJson<SavedConditionSet>(`condition-sets/${enc(id)}`, { signal });
export const putConditionSet = (id: string, params: ConditionSet, name?: string) =>
  engineJson<SavedConditionSet>(`condition-sets/${enc(id)}`, { method: "PUT", json: name ? { name, params } : { params } });
export const getConditionDefaults = (projectId: string, signal?: AbortSignal) =>
  engineJson<DocumentedDefaults>(`projects/${enc(projectId)}/condition-sets/defaults`, { signal });

// ---------------- components ----------------
export async function searchComponents(
  f: { q?: string; kind?: ComponentKind; manufacturer?: string; limit?: number }, signal?: AbortSignal,
): Promise<ComponentSku[]> {
  const r = await engineJson<ComponentSku[] | { skus: ComponentSku[] }>(`components/search${qs({ ...f })}`, { signal });
  return Array.isArray(r) ? r : r.skus ?? [];
}
export const getSku = (id: string, signal?: AbortSignal) => engineJson<ComponentSku>(`components/skus/${enc(id)}`, { signal });

// ---------------- simulations / reports / hourly ----------------
export const getHourly = (simulationId: string, signal?: AbortSignal) =>
  engineJson<HourlyResponse>(`simulations/${enc(simulationId)}/hourly`, { signal });
export const getShade = (simulationId: string, signal?: AbortSignal) =>
  engineJson<unknown>(`simulations/${enc(simulationId)}/shade`, { signal });
export const createReport = (simulationId: string, body: { design_id?: string | null } = {}, signal?: AbortSignal) =>
  engineJson<{ report: { id?: string } & Record<string, unknown>; production: unknown | null; links?: Record<string, string> }>(
    `simulations/${enc(simulationId)}/reports`, { method: "POST", json: body, signal });
export const getReport = (reportId: string, signal?: AbortSignal) =>
  engineJson<{ report: Record<string, unknown>; production: unknown | null; links?: Record<string, string> }>(`reports/${enc(reportId)}`, { signal });

/** Keeps the cached result compact: drops arrays no report reads. */
export function slimOutput(o: SimulateResponse): EngineOutputSlim {
  const { cashflow_25yr, typical_day_hourly, monthly_bills, baseline_monthly_bills, finance, tkdn, assumptions, ...rest } = o as SimulateResponse & Record<string, unknown>;
  void cashflow_25yr; void typical_day_hourly; void monthly_bills; void baseline_monthly_bills; void finance; void tkdn; void assumptions;
  return rest as unknown as EngineOutputSlim;
}

// ---------------- component upload (PAN / OND / CEC / datasheet) ----------------
export const COMPONENT_FILE_MAX_BYTES = 256 * 1024;
export type ComponentFileFormat = "pan" | "ond" | "cec_module" | "cec_inverter";
export interface ComponentPreview {
  kind: string;
  source: string;
  file_sha256: string;
  parsed: unknown;
  warnings: Array<{ code: string; message: string }>;
  module_model?: unknown;
  existing_characterization_id: string | null;
  sku_candidates: ComponentSku[];
}
/** Exact text helio returned (code + message), for error panels that must not paraphrase. */
export function verbatimError(e: unknown): string {
  if (e instanceof EngineError) {
    const d = e.detail;
    const body = d == null ? "" : typeof d === "string" ? d : JSON.stringify(d);
    return `HTTP ${e.status}${e.code ? ` ${e.code}` : ""}${body ? `: ${body}` : ""}`;
  }
  return e instanceof Error ? e.message : String(e);
}
async function fileBody(file: File): Promise<ArrayBuffer> {
  if (file.size > COMPONENT_FILE_MAX_BYTES) {
    throw new EngineError(0, "file_too_large", null, `File melebihi ${COMPONENT_FILE_MAX_BYTES / 1024} KiB (batas helio).`);
  }
  return file.arrayBuffer();
}
export async function previewComponentFile(
  file: File, format: ComponentFileFormat, o: { manufacturer?: string; model?: string; cecName?: string } = {},
): Promise<ComponentPreview> {
  return engineJson<ComponentPreview>(
    `components/preview${qs({ format, filename: file.name, manufacturer: o.manufacturer, model: o.model, cec_name: o.cecName, visibility: "org" })}`,
    { method: "POST", raw: await fileBody(file), headers: { "Content-Type": "application/octet-stream" } },
  );
}
export async function uploadComponentFile(
  file: File, format: ComponentFileFormat, o: { manufacturer?: string; model?: string; cecName?: string; isDefault?: boolean } = {},
): Promise<{ characterization: ComponentCharacterization; sku: ComponentSku }> {
  return engineJson(
    `components/characterizations${qs({ format, filename: file.name, manufacturer: o.manufacturer, model: o.model, cec_name: o.cecName, visibility: "org", is_default: o.isDefault ? "true" : undefined })}`,
    { method: "POST", raw: await fileBody(file), headers: { "Content-Type": "application/octet-stream" } },
  );
}
export interface DatasheetInput {
  kind: "module" | "inverter";
  manufacturer: string; model: string; nameplate_w: number; nameplate_source: string; source: string;
  technology?: string; width_m?: number; height_m?: number;
  v_dc_max_v?: number; nb_mppt?: number; v_out_v?: number; p_max_ac_w?: number;
  datasheet_url?: string;
  visibility: "org"; is_default?: boolean;
}
export const createDatasheet = (input: DatasheetInput) =>
  engineJson<{ characterization: ComponentCharacterization; sku: ComponentSku }>(
    "components/characterizations/datasheet", { method: "POST", json: input });
