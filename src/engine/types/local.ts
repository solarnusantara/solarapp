// Types for helio endpoints / payloads that have no ts-rs binding at the pinned SHA, plus the
// solarapp-side contracts (engine inputs, cached result, report meta). Defined by hand against
// the PR C brief; keep every field tolerant: helio may add fields.
import type {
  ConditionSet, HorizonProfile, Scene, SimulationInput, SimulationOutput, StageSummary,
  StringingReport, UncertaintyInput, WireSchedule,
} from "./index";

// ---------------- helio component library (componentsClient.ts) ----------------
export type ComponentKind = "module" | "inverter" | "micro_inverter" | "optimizer" | "hybrid_inverter" | "ac_module" | "bess";
export interface ComponentCharacterization {
  id: string;
  source: "pan" | "ond" | "cec" | "datasheet" | "lab";
  file_sha256?: string;
  data_source?: string | null;
  is_default: boolean;
  review_status?: "pending" | "approved" | "rejected";
  v_out_v?: number | null;
}
export interface ComponentSku {
  id: string;
  kind: ComponentKind;
  manufacturer: string;
  model: string;
  nameplate_w: number;
  width_m?: number | null;
  height_m?: number | null;
  technology?: string | null;
  v_dc_max_v?: number | null;
  nb_mppt?: number | null;
  v_out_v?: number | null;
  p_max_ac_w?: number | null;
  characterizations: ComponentCharacterization[];
}

// ---------------- erpsonus proxy ----------------
export interface EngineLink {
  helio_project_slug: string;
  helio_project_id: string;
  helio_design_id: string;
  helio_condition_set_id: string;
}

/** Everything the reports need from one run, cached in erpsonus (`engine/result`). */
export interface EngineResultSummary {
  engine_version: string;
  ran_at: string; // ISO
  simulation_id: string;
  report_id: string | null;
  design_id: string;
  condition_set_id: string;
  /** SimulateResponse minus the bulky arrays the reports never read. */
  output: EngineOutputSlim;
  /** `production` object of `POST simulations/{id}/reports` (helio `ProductionReport`), if returned. */
  production: ProductionReportJson | null;
  /** The SimulationInput that was sent, minus scene/obstacles/bom (geometry comes from the layout). */
  input: Omit<SimulationInput, "scene" | "obstacles" | "bom_items"> | null;
  /** Scene-adapter + engine warnings, verbatim. */
  warnings: string[];
  /** circuit/auto response (null when no module+inverter was chosen). */
  circuit_auto: CircuitAutoResult | null;
  /** Component SKUs resolved at run time, so reports need no extra fetches. */
  components: { module: ComponentSku | null; inverter: ComponentSku | null };
}

export type EngineOutputSlim = Omit<
  SimulationOutput,
  "cashflow_25yr" | "typical_day_hourly" | "monthly_bills" | "baseline_monthly_bills" | "finance" | "tkdn" | "assumptions"
> & { simulation_id?: string; weather_dataset_id?: string | null };

export interface EngineStateResponse extends Partial<EngineLink> {
  helio_last_result: EngineResultSummary | null;
  helio_last_run_at: string | null;
  helio_engine_version: string | null;
}

// ---------------- circuit/auto ----------------
export interface CircuitAutoRequest {
  module_characterization_id: string;
  inverter_characterization_id: string;
  inverter_count: number | null;
  target_dc_ac: number | null;
  string_length_method: string | null;
  manual_min: number | null;
  manual_max: number | null;
  routing: unknown | null;
}
export interface CircuitAutoResult {
  circuit: unknown;
  stringing: StringingReport[];
  issues: Array<{ code: string; severity?: string; message: string }>;
}

// ---------------- helio production report (report/production.rs) ----------------
export interface ProductionReportJson {
  schema_version: number;
  engine_version: string;
  weather_sha256: string;
  timestep_count: number;
  summary: {
    energy_to_grid_kwh: number; p50_kwh: number; p75_kwh?: number | null; p90_kwh?: number | null;
    p95_kwh?: number | null; p99_kwh?: number | null; self_consumed_kwh: number;
    annual_ghi_kwh_m2: number; annual_poa_kwh_m2: number; annual_shaded_kwh_m2: number;
    performance_ratio_pct: number; specific_yield_kwh_kwp: number;
    dc_capacity_kwp: number; ac_capacity_kw: number; nameplate_dc_kwp: number; nameplate_ac_kw: number;
  };
  monthly: Array<{
    month: number; days: number; ghi_kwh_m2: number; poa_kwh_m2: number; shaded_kwh_m2: number;
    nameplate_kwh: number; energy_to_grid_kwh: number; daily_average_kwh: number;
  }>;
  daily_average?: unknown[];
  loss_tree: StageSummary[];
  condition_set: ConditionSet;
  design: {
    project_name: string; region_id: string; latitude: number; longitude: number;
    arrays: Array<{ id: string; tilt_deg: number; azimuth_deg: number; module_count: number; module_power_wp: number; dc_kwp: number; roof_area_m2: number; string_ids: string[] }>;
    module_count: number; dc_kwp: number; ac_kw: number; racking?: string | null;
    module_tilt_deg?: number | null; module_azimuth_deg?: number | null;
    inverter_models: string[]; string_count: number; has_circuit: boolean;
  };
  bom?: Array<Record<string, unknown>>;
  stringing?: {
    total_module_count: number; strung_module_count: number; unstrung_module_count: number;
    total_dc_kwp: number; strung_dc_kwp: number; reports: StringingReport[];
  };
  warnings?: string[];
  [k: string]: unknown;
}

// ---------------- solarapp-side persisted inputs ----------------
/** Economic + equipment inputs persisted in the layout payload as `engine_inputs`. No hidden defaults. */
export interface EngineInputs {
  inverter_ac_kw: number | "";
  pln_tariff_code: string;
  contracted_power_kva: number | "";
  monthly_consumption_kwh: number | "";
  load_profile_type: string;
  capex_per_kwp_idr: number | "";
  bess_cost_per_kwh_idr: number | "";
  /** helio component picks. */
  module_sku_id?: string;
  module_characterization_id?: string;
  inverter_sku_id?: string;
  inverter_characterization_id?: string;
  inverter_count?: number | "";
  target_dc_ac?: number | "";
  /** Engine extras that live in SimulationInput, not in ConditionSet. */
  horizon?: HorizonProfile | null;
  horizon_source?: string | null;
  uncertainty?: UncertaintyInput | null;
  client_name?: string;
}
export const EMPTY_ENGINE_INPUTS: EngineInputs = {
  inverter_ac_kw: "", pln_tariff_code: "", contracted_power_kva: "", monthly_consumption_kwh: "",
  load_profile_type: "", capex_per_kwp_idr: "", bess_cost_per_kwh_idr: "",
};

// ---------------- report meta (erpsonus report-meta) ----------------
export interface ApprovalSlot {
  user_id: string | null;
  name: string;
  date: string;
  signed: boolean;
  signature_url?: string | null;
}
export interface ReportMeta {
  doc_no: string; rev: string; effective_date: string;
  owner_name: string; client: string; project_address: string; epc_contractor: string;
  revisions: Array<{ rev: string; date: string; description: string }>;
  notes: string;
  approvals: { prepared: ApprovalSlot; checked: ApprovalSlot; approved: ApprovalSlot };
}
export const EMPTY_APPROVAL: ApprovalSlot = { user_id: null, name: "", date: "", signed: false };
export const EMPTY_REPORT_META: ReportMeta = {
  doc_no: "", rev: "", effective_date: "", owner_name: "", client: "", project_address: "", epc_contractor: "",
  revisions: [], notes: "",
  approvals: { prepared: EMPTY_APPROVAL, checked: EMPTY_APPROVAL, approved: EMPTY_APPROVAL },
};

// ---------------- hourly ----------------
export interface HourlyColumnSpec { name: string; unit: string; status: string; note?: string }
export interface HourlyResponse {
  simulation_id: string;
  engine_version: string;
  utc_offset_h: number;
  columns: HourlyColumnSpec[];
  /** HourlyTable serialised: parallel arrays keyed by column name; absent columns are null. */
  hourly: Record<string, unknown> & { month: number[]; day: number[]; hour: number[] };
}

export type { Scene, WireSchedule };
