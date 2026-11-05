// Builds helio's SimulationInput from the layout adapter result + the user's engine inputs.
// No hidden defaults: every economic input must be filled by the user, otherwise we return an
// error list naming each missing field. BESS is not part of this flow, so it is sent as an
// explicit 0 (helio requires the fields). `obstacles`/`bom_items` are explicit empty arrays:
// obstacles travel inside `scene.keepouts`, the BOM is out of scope.
import type { SimulationInput, SiteSummary } from "./types";
import type { EngineInputs } from "./types/local";
import type { SceneAdapterResult } from "./sceneAdapter";

export type BuildResult = { input: SimulationInput; errors?: undefined } | { input?: undefined; errors: string[] };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPos = (v: unknown): v is number => isNum(v) && v > 0;

/** Nearest helio reference site by great-circle distance; only picks a label, no data derived. */
export function nearestRegion(lat: number, lon: number, sites: Array<Pick<SiteSummary, "id" | "latitude" | "longitude">>): string | null {
  let best: { id: string; d: number } | null = null;
  const r = Math.PI / 180;
  for (const s of sites) {
    const a = Math.sin(((s.latitude - lat) * r) / 2) ** 2 +
      Math.cos(lat * r) * Math.cos(s.latitude * r) * Math.sin(((s.longitude - lon) * r) / 2) ** 2;
    const d = 2 * Math.asin(Math.sqrt(a));
    if (!best || d < best.d) best = { id: s.id, d };
  }
  return best?.id ?? null;
}

export function buildSimulationInput(args: {
  projectName: string;
  adapter: SceneAdapterResult;
  inputs: Partial<EngineInputs>;
  regionId: string | null;
}): BuildResult {
  const { adapter, inputs, projectName, regionId } = args;
  const errors: string[] = [];
  for (const b of adapter.blocking) errors.push(b.message);
  if (!projectName.trim()) errors.push("Nama proyek kosong.");
  if (!regionId) errors.push("Site referensi Helio terdekat tidak dapat ditentukan (daftar site kosong).");
  if (!isPos(inputs.inverter_ac_kw)) errors.push("Kapasitas AC inverter (kW) wajib diisi.");
  if (!inputs.pln_tariff_code?.trim()) errors.push("Golongan tarif PLN wajib diisi.");
  if (!isPos(inputs.contracted_power_kva)) errors.push("Daya tersambung (kVA) wajib diisi.");
  if (!isNum(inputs.monthly_consumption_kwh) || inputs.monthly_consumption_kwh < 0) errors.push("Konsumsi bulanan (kWh) wajib diisi.");
  if (!inputs.load_profile_type?.trim()) errors.push("Tipe profil beban wajib diisi.");
  if (!isNum(inputs.capex_per_kwp_idr) || inputs.capex_per_kwp_idr < 0) errors.push("Capex per kWp (IDR) wajib diisi.");
  if (!isNum(adapter.moduleWp) || adapter.moduleWp <= 0) {
    if (!adapter.blocking.some((b) => b.code === "MIXED_MODULE_POWER" || b.code === "NO_SEGMENTS")) errors.push("Daya modul (Wp) tidak dapat ditentukan dari layout.");
  }
  if (errors.length > 0 || adapter.latitude === null || adapter.longitude === null) {
    return { errors: errors.length ? errors : ["Lokasi proyek belum ditentukan."] };
  }

  const input: SimulationInput = {
    project_name: projectName.trim(),
    region_id: regionId as string,
    latitude: adapter.latitude,
    longitude: adapter.longitude,
    roof_area_m2: adapter.roofAreaM2,
    tilt_deg: adapter.tiltDeg,
    azimuth_deg: adapter.azimuthDeg,
    module_power_wp: adapter.moduleWp as number,
    module_count: adapter.moduleCount,
    inverter_ac_kw: inputs.inverter_ac_kw as number,
    bess_capacity_kwh: 0,
    bess_power_kw: 0,
    load_profile_type: inputs.load_profile_type as string,
    monthly_consumption_kwh: inputs.monthly_consumption_kwh as number,
    pln_tariff_code: (inputs.pln_tariff_code as string).trim(),
    contracted_power_kva: inputs.contracted_power_kva as number,
    capex_per_kwp_idr: inputs.capex_per_kwp_idr as number,
    bess_cost_per_kwh_idr: isNum(inputs.bess_cost_per_kwh_idr) ? inputs.bess_cost_per_kwh_idr : 0,
    obstacles: [],
    bom_items: [],
    scene: adapter.scene,
  };
  if (inputs.horizon && inputs.horizon.points.length > 0) input.horizon = inputs.horizon;
  if (inputs.uncertainty) input.uncertainty = inputs.uncertainty;
  if (inputs.module_characterization_id) input.module_characterization_id = inputs.module_characterization_id;
  if (inputs.inverter_characterization_id) input.inverter_characterization_id = inputs.inverter_characterization_id;
  return { input };
}
