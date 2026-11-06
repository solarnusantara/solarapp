// Panel rendered in PVLayout steps 4/5: economic inputs, equipment picker, Asumsi form and the
// "Hitung (Helio)" button with status/warnings. State lives in the parent (PVLayout owns persistence).
import { useCallback, useEffect, useRef, useState } from "react";
import ComponentPicker, { type PickerValue } from "./ComponentPicker";
import ConditionForm from "./ConditionForm";
import { UNAVAILABLE_MESSAGE } from "./client";
import { useEngine } from "./useEngine";
import WeatherPanel from "./WeatherPanel";
import { layoutToScene } from "./sceneAdapter";
import type { SavedLayout } from "./layoutStore";
import type { EngineInputs } from "./types/local";
import { RACKING_OPTIONS } from "./racking";
import { EXPORT_MODE_DEFAULT_LABEL, EXPORT_MODE_OPTIONS } from "./exportMode";
import { moduleCountMismatch } from "./moduleCount";

const inp: React.CSSProperties = { padding: "5px 8px", borderRadius: 6, border: "1px solid #364b38", background: "#0d1410", color: "inherit", width: "100%" };
const card: React.CSSProperties = { border: "1px solid #233527", borderRadius: 10, padding: 12, marginTop: 10 };

function NumIn({ label, value, onChange, hint }: { label: string; value: number | "" | undefined; onChange: (v: number | "") => void; hint?: string }) {
  return (
    <label style={{ display: "grid", gap: 2, fontSize: 12 }}>{label}
      <input style={inp} type="number" step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      {hint && <span style={{ opacity: 0.6, fontSize: 10 }}>{hint}</span>}
    </label>
  );
}

export default function EngineRunPanel({ projectId, projectName, layout, inputs, onInputs, section = "all", showWeather = true }: {
  projectId: string | null;
  projectName: string;
  layout: SavedLayout;
  inputs: EngineInputs;
  onInputs: (next: EngineInputs) => void;
  section?: "all" | "electrical" | "assumptions";
  /** The Advanced workspace renders its own WeatherPanel; hide the duplicate in the assumptions section. */
  showWeather?: boolean;
}) {
  const ref = useRef<SavedLayout>(layout);
  ref.current = { ...layout, engine_inputs: inputs };
  const getLayout = useCallback(() => ref.current, []);
  const eng = useEngine({ projectId, projectName, getLayout });
  const patch = (p: Partial<EngineInputs>) => onInputs({ ...inputs, ...p });
  const [modPick, setModPick] = useState<PickerValue>({ sku: null, characterizationId: inputs.module_characterization_id ?? "" });
  const [invPick, setInvPick] = useState<PickerValue>({ sku: null, characterizationId: inputs.inverter_characterization_id ?? "" });
  useEffect(() => {
    if (!modPick.sku) return;
    patch({ module_sku_id: modPick.sku?.id, module_characterization_id: modPick.characterizationId || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modPick]);
  useEffect(() => {
    if (!invPick.sku) return;
    patch({ inverter_sku_id: invPick.sku?.id, inverter_characterization_id: invPick.characterizationId || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invPick]);

  const ad = layoutToScene(layout);
  const busy = eng.status === "running" || eng.status === "linking";
  const unavailable = eng.status === "unavailable";
  const latLon = ad.latitude !== null && ad.longitude !== null ? { lat: ad.latitude, lon: ad.longitude } : null;

  return (
    <div style={{ padding: 4 }}>
      <div style={{ ...card, marginTop: 0 }}>
        <b>Engine Helio</b>
        {unavailable && <div style={{ color: "#fbbf24", marginTop: 4 }}>{UNAVAILABLE_MESSAGE}. Mode lokal tetap bisa dipakai (kalkulator cepat).</div>}
        {eng.status === "unlinked" && <div style={{ fontSize: 12, marginTop: 4 }}>Proyek ini belum terhubung. Tautan dibuat otomatis saat Hitung pertama.</div>}
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Layout: {ad.moduleCount} modul{ad.moduleWp ? ` × ${ad.moduleWp} Wp = ${((ad.moduleCount * ad.moduleWp) / 1000).toFixed(2)} kWp` : ""} · {ad.scene.field_segments.length} segmen · {ad.scene.keepouts.length} keepout
        </div>
        {eng.result && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Hasil terakhir: {new Date(eng.result.ran_at).toLocaleString("id-ID")} · engine v{eng.result.engine_version} ·
            P50 {Math.round(eng.result.output.annual_p50_kwh).toLocaleString("id-ID")} kWh · PR {eng.result.output.performance_ratio_pct.toFixed(1)}%
          </div>
        )}
      </div>

      {section !== "assumptions" && (
        <div style={card}><b>Input ekonomi</b> <span style={{ fontSize: 11, opacity: 0.7 }}>(tanpa nilai bawaan; wajib diisi)</span>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginTop: 6 }}>
            <label style={{ display: "grid", gap: 2, fontSize: 12 }}>Jenis racking
              <select style={inp} value={inputs.racking ?? ""} onChange={(e) => patch({ racking: e.target.value as EngineInputs["racking"] })}>
                <option value="">— pilih —</option>
                {RACKING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></label>
            <label style={{ display: "grid", gap: 2, fontSize: 12 }}>Mode ekspor
              <select style={inp} value={inputs.export_limitation_mode ?? ""} onChange={(e) => patch({ export_limitation_mode: (e.target.value || undefined) as EngineInputs["export_limitation_mode"] })}>
                <option value="">{EXPORT_MODE_DEFAULT_LABEL}</option>
                {EXPORT_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></label>
            <NumIn label="Kapasitas AC inverter (kW)" value={inputs.inverter_ac_kw} onChange={(v) => patch({ inverter_ac_kw: v })} />
            <label style={{ display: "grid", gap: 2, fontSize: 12 }}>Golongan tarif PLN (mis. I-3, B-2)
              <input style={inp} value={inputs.pln_tariff_code} onChange={(e) => patch({ pln_tariff_code: e.target.value })} /></label>
            <NumIn label="Daya tersambung (kVA)" value={inputs.contracted_power_kva} onChange={(v) => patch({ contracted_power_kva: v })} />
            <NumIn label="Konsumsi bulanan (kWh)" value={inputs.monthly_consumption_kwh} onChange={(v) => patch({ monthly_consumption_kwh: v })} />
            <label style={{ display: "grid", gap: 2, fontSize: 12 }}>Tipe profil beban
              <input style={inp} value={inputs.load_profile_type} onChange={(e) => patch({ load_profile_type: e.target.value })} /></label>
            <NumIn label="Capex per kWp (IDR)" value={inputs.capex_per_kwp_idr} onChange={(v) => patch({ capex_per_kwp_idr: v })} />
            <NumIn label="Biaya BESS per kWh (IDR)" value={inputs.bess_cost_per_kwh_idr} onChange={(v) => patch({ bess_cost_per_kwh_idr: v })} hint="Tanpa BESS di alur ini; kosong dikirim 0." />
            <label style={{ display: "grid", gap: 2, fontSize: 12 }}>Nama klien (opsional)
              <input style={inp} value={inputs.client_name ?? ""} onChange={(e) => patch({ client_name: e.target.value })} /></label>
          </div>
        </div>
      )}

      {section !== "assumptions" && (
        <div style={card}><b>Peralatan (library Helio)</b>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginTop: 6 }}>
            <div><div style={{ fontSize: 12, marginBottom: 4 }}>Modul PV</div><ComponentPicker kind="module" value={modPick} onChange={setModPick} /></div>
            <div><div style={{ fontSize: 12, marginBottom: 4 }}>Inverter</div><ComponentPicker kind="inverter" value={invPick} onChange={setInvPick} /></div>
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginTop: 8 }}>
            <NumIn label="Jumlah inverter" value={inputs.inverter_count} onChange={(v) => patch({ inverter_count: v })} hint="Isi salah satu: jumlah inverter ATAU target DC/AC" />
            <NumIn label="Target DC/AC" value={inputs.target_dc_ac} onChange={(v) => patch({ target_dc_ac: v })} />
            <NumIn label="Suhu minimum sel (°C)" value={inputs.t_min_c} onChange={(v) => patch({ t_min_c: v })} hint="Untuk batas panjang string (Voc dingin)" />
            <label style={{ display: "grid", gap: 2, fontSize: 12 }}>Sumber suhu minimum
              <input style={inp} value={inputs.t_min_source ?? ""} onChange={(e) => patch({ t_min_source: e.target.value })} placeholder="mis. data BMKG stasiun …" /></label>
            <NumIn label="Suhu ambien maks (°C)" value={inputs.t_amb_max_c} onChange={(v) => patch({ t_amb_max_c: v })} hint="Untuk Vmp panas" />
            <label style={{ display: "grid", gap: 2, fontSize: 12 }}>Sumber suhu maksimum
              <input style={inp} value={inputs.t_amb_max_source ?? ""} onChange={(e) => patch({ t_amb_max_source: e.target.value })} /></label>
            <label style={{ display: "grid", gap: 2, fontSize: 12 }}>Panjang string
              <select style={inp} value={inputs.string_length_method ?? ""} onChange={(e) => patch({ string_length_method: e.target.value as EngineInputs["string_length_method"] })}>
                <option value="">Dari suhu situs (butuh NOCT modul)</option>
                <option value="manual">Manual (min/maks + sumber)</option>
              </select></label>
            {inputs.string_length_method === "manual" && (<>
              <NumIn label="Modul per string — minimum" value={inputs.string_len_min} onChange={(v) => patch({ string_len_min: v })} />
              <NumIn label="Modul per string — maksimum" value={inputs.string_len_max} onChange={(v) => patch({ string_len_max: v })} hint="Helio tetap memeriksa batas tegangan MPPT/Vdc dan melaporkan pelanggaran" />
              <label style={{ display: "grid", gap: 2, fontSize: 12 }}>Sumber panjang string
                <input style={inp} value={inputs.string_len_source ?? ""} onChange={(e) => patch({ string_len_source: e.target.value })} placeholder="mis. PVsyst PLTS-MAS-E-CS-001-00: 15 string × 20" /></label>
            </>)}
            <NumIn label="NOCT modul (°C)" value={inputs.noct_c} onChange={(v) => patch({ noct_c: v })} hint="Wajib bila file PAN tidak memuat NOCT (datasheet)" />
            <NumIn label="Tegangan AC inverter (V)" value={inputs.ac_voltage_v} onChange={(v) => patch({ ac_voltage_v: v })} hint="Hanya bila karakterisasi tidak menyebut satu tegangan" />
          </div>
        </div>
      )}

      {section !== "electrical" && showWeather && (
        <WeatherPanel latLon={latLon} choice={inputs.weather_choice} onChoice={(c) => patch({ weather_choice: c })} />
      )}

      {section !== "electrical" && (
        <div style={card}><b>Asumsi simulasi</b>
          <ConditionForm projectHelioId={eng.link?.helio_project_id ?? null} conditionSetId={eng.link?.helio_condition_set_id ?? null}
            engineInputs={inputs} onEngineInputs={patch} latLon={latLon} p90Status={(eng.result?.output as any)?.uncertainty?.p90_status ?? null} />
        </div>
      )}

      <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="primary-button" disabled={busy || !projectId} onClick={() => void eng.run()}>{busy ? "Menghitung…" : "Hitung (Helio)"}</button>
        {section !== "assumptions" && <button className="secondary-button" disabled={busy || !projectId} onClick={() => void eng.buildCircuit()}>Buat sirkuit (Helio)</button>}
        {busy && <button className="secondary-button" onClick={eng.cancel}>Batal</button>}
        {eng.step && <span style={{ fontSize: 12 }}>{eng.step}</span>}
        {!projectId && <span style={{ fontSize: 12, color: "#fbbf24" }}>Simpan proyek di server dulu untuk memakai engine.</span>}
      </div>
      {(() => { const mc = moduleCountMismatch(ad.moduleCount, eng.result); return mc ? <div role="alert" style={{ color: "#fbbf24", fontSize: 12, marginTop: 6 }}>{mc.message}</div> : null; })()}
      {eng.error && <div style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>{eng.error}</div>}
      {eng.errors.length > 0 && <ul style={{ color: "#f87171", fontSize: 12 }}>{eng.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {eng.circuit && (
        <div style={{ fontSize: 12, marginTop: 6 }}>Sirkuit dibuat: {eng.circuit.stringing.reduce((n, r) => n + r.string_count, 0)} string
          {eng.circuit.issues.map((i, k) => <div key={k} style={{ color: "#fbbf24" }}>[{i.code}] {i.message}</div>)}</div>
      )}
      {eng.warnings.length > 0 && (
        <details style={{ fontSize: 12, marginTop: 6 }}><summary>{eng.warnings.length} peringatan</summary>
          <ul>{eng.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>
      )}
    </div>
  );
}
