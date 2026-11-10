// PVsyst-grade "Asumsi" form: edits the helio ConditionSet (every field required) plus the two
// engine inputs that live outside it (horizon, uncertainty). Load/save through the proxy.
import { useCallback, useEffect, useState } from "react";
import {
  engineErrorMessage, getConditionDefaults, getConditionSet, getPvgisHorizon, isUnavailable, putConditionSet, UNAVAILABLE_MESSAGE, verbatimError,
} from "./client";
import {
  applyPvsystPreset, MAX_CUSTOM_LOSSES, PVSYST_PRESET_LABEL, serializeConditionSet, UNCERTAINTY_ROWS, type UnsupportedItem,
} from "./conditionModel";
import type { ConditionSet, CustomLoss, OptionalDerate } from "./types";
import type { WiringBasis } from "./types/OptionalDerate";
import type { EngineInputs } from "./types/local";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const inp: React.CSSProperties = { padding: "4px 6px", borderRadius: 6, border: "1px solid #364b38", background: "#0d1410", color: "inherit", width: "100%", minWidth: 0 };
const sec: React.CSSProperties = { border: "1px solid #233527", borderRadius: 8, padding: 10, marginTop: 10 };
const grid: React.CSSProperties = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" };

function Num({ label, value, onChange, step = "any" }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; step?: string }) {
  return (
    <label style={{ display: "grid", gap: 2, fontSize: 12 }}>{label}
      <input style={inp} type="number" step={step} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
    </label>
  );
}
function Sel<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <label style={{ display: "grid", gap: 2, fontSize: 12 }}>{label}
      <select style={inp} value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
    </label>
  );
}
function Months12({ label, values, onChange }: { label: string; values: number[]; onChange: (v: number[]) => void }) {
  return (
    <div style={{ fontSize: 12, marginTop: 6 }}>{label}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(46px, 1fr))", gap: 4, marginTop: 2 }}>
        {values.map((v, i) => (
          <label key={i} style={{ display: "grid", fontSize: 10, textAlign: "center" }}>{MONTHS[i]}
            <input style={inp} type="number" step="any" value={Number.isFinite(v) ? v : ""} onChange={(e) => { const n = [...values]; n[i] = e.target.value === "" ? NaN : Number(e.target.value); onChange(n); }} />
          </label>
        ))}
      </div>
    </div>
  );
}
type DerateValue = OptionalDerate;
function Derate({ label, value, onChange, withBasis = false }: { label: string; value: DerateValue; onChange: (v: DerateValue) => void; withBasis?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 2, fontSize: 12 }}>{label}
      <div style={{ display: "flex", gap: 4 }}>
        <select style={inp} value={value.mode} onChange={(e) => onChange(e.target.value === "pct" ? { mode: "pct", pct: 0 } : { mode: "not_applied" })}>
          <option value="not_applied">tidak diterapkan</option><option value="pct">persen</option>
        </select>
        {value.mode === "pct" && <input style={{ ...inp, maxWidth: 90 }} type="number" step="any" value={Number.isFinite(value.pct) ? value.pct : ""} onChange={(e) => onChange({ ...value, mode: "pct", pct: e.target.value === "" ? NaN : Number(e.target.value) })} />}
      </div>
      {withBasis && value.mode === "pct" && (
        <select style={inp} aria-label={`${label}: basis`} value={value.basis ?? "flat"} onChange={(e) => onChange({ mode: "pct", pct: value.pct, basis: e.target.value as WiringBasis })}>
          <option value="flat">Rata setahun (Standar Flat)</option><option value="stc">Pada STC, ∝ I² (Standar IEC / I²R)</option>
        </select>
      )}
    </div>
  );
}

export default function ConditionForm({ projectHelioId, conditionSetId, engineInputs, onEngineInputs, latLon = null, p90Status = null }: {
  latLon?: { lat: number; lon: number } | null;
  /** `uncertainty.p90_status` of the last run; anything but "ready" is shown next to the uncertainty form. */
  p90Status?: string | null;
  projectHelioId: string | null;
  conditionSetId: string | null;
  engineInputs: Partial<EngineInputs>;
  onEngineInputs: (patch: Partial<EngineInputs>) => void;
}) {
  const [cs, setCs] = useState<ConditionSet | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState<UnsupportedItem[]>([]);
  const [needsInput, setNeedsInput] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [presetNote, setPresetNote] = useState("");

  const load = useCallback(async () => {
    if (!conditionSetId) return;
    setMsg(null);
    try { setCs((await getConditionSet(conditionSetId)).params); }
    catch (e) { setMsg(isUnavailable(e) ? UNAVAILABLE_MESSAGE : engineErrorMessage(e)); }
  }, [conditionSetId]);
  useEffect(() => { void load(); }, [load]);

  if (!conditionSetId) {
    return <div style={sec}>Asumsi tersedia setelah proyek terhubung ke SolarApp Engine (klik <b>Hitung (SolarApp Engine)</b> sekali, atau lengkapi input ekonomi dulu).</div>;
  }
  if (!cs) return <div style={sec}>{msg ?? "Memuat asumsi…"}</div>;

  const set = (patch: Partial<ConditionSet>) => setCs({ ...cs, ...patch });

  const save = async () => {
    const { params, errors } = serializeConditionSet(cs);
    setErrs(errors);
    if (errors.length) return;
    setBusy(true); setMsg(null);
    try { await putConditionSet(conditionSetId, params); setMsg("Asumsi tersimpan."); }
    catch (e) { setMsg(verbatimError(e)); }
    setBusy(false);
  };

  const defaults = async () => {
    if (!projectHelioId) return;
    try {
      const d = await getConditionDefaults(projectHelioId);
      setCs({ ...d.params, weather: cs.weather, module_characterization_id: cs.module_characterization_id, inverter_characterization_id: cs.inverter_characterization_id });
      setUnsupported([]); setNeedsInput([]); setPresetNote("Preset: Standar Bawaan (condition-sets/defaults dari engine)");
    } catch (e) { setMsg(verbatimError(e)); }
  };
  const pvsyst = () => {
    const r = applyPvsystPreset(cs);
    setCs(r.params); setUnsupported(r.unsupported); setNeedsInput(r.needsInput);
    onEngineInputs({ uncertainty: r.uncertainty });
    setPresetNote(`Preset: ${r.source}`);
  };

  const unc = engineInputs.uncertainty ?? { horizon_years: 1, combination: "rss" as const, components: [] };
  const setUnc = (components: typeof unc.components) => onEngineInputs({ uncertainty: { ...unc, components } });

  const tm = cs.temperature_model;
  const setLoss = (i: number, patch: Partial<CustomLoss>) => set({ custom_losses: cs.custom_losses.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="secondary-button" onClick={() => void defaults()} disabled={!projectHelioId}>Preset Bawaan</button>
        <button className="secondary-button" onClick={pvsyst}>{PVSYST_PRESET_LABEL}</button>
        <button className="primary-button" onClick={() => void save()} disabled={busy}>Simpan asumsi</button>
        {presetNote && <span style={{ fontSize: 12 }}>{presetNote} (belum disimpan)</span>}
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 6 }}>{msg}</div>}
      {errs.length > 0 && <ul style={{ color: "#f87171", fontSize: 12 }}>{errs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {needsInput.length > 0 && <ul style={{ color: "#fbbf24", fontSize: 12 }}><li><b>Perlu diisi manual:</b></li>{needsInput.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {unsupported.length > 0 && (
        <div style={{ ...sec, borderColor: "#7c5a12" }}>
          <b style={{ fontSize: 12 }}>Parameter tambahan di luar cakupan engine</b>
          <ul style={{ fontSize: 12, margin: "4px 0 0 16px" }}>{unsupported.map((u, i) => <li key={i}>{u.label}: {u.value} — <i>{u.reason}</i></li>)}</ul>
        </div>
      )}

      <div style={sec}><b>Irradiansi</b>
        <div style={grid}>
          <Sel label="Transposisi" value={cs.transposition} options={["perez", "hay_davies", "isotropic"]} onChange={(v) => set({ transposition: v })} />
          <Sel label="Dekomposisi" value={cs.decomposition} options={["dirint", "erbs"]} onChange={(v) => set({ decomposition: v })} />
          <Sel label="Lokasi sudut matahari" value={cs.solar_angle_location} options={["project", "weather"]} onChange={(v) => set({ solar_angle_location: v })} />
          <Sel label="Model IAM" value={cs.iam} options={["physical", "ashrae", "martin_ruiz", "pan_profile"]} onChange={(v) => set({ iam: v })} />
          <Sel label="IAM difus" value={cs.iam_diffuse} options={["no_loss", "marion"]} onChange={(v) => set({ iam_diffuse: v })} />
          <Num label="ASHRAE b0 (bila iam=ashrae)" value={cs.iam_b0} onChange={(v) => set({ iam_b0: v })} />
          <Num label="Martin-Ruiz a_r (bila iam=martin_ruiz)" value={cs.iam_a_r} onChange={(v) => set({ iam_a_r: v })} />
        </div>
        {cs.iam === "pan_profile" && (
          <div style={{ fontSize: 12, marginTop: 6 }}>Profil IAM PAN (sudut°, faktor): {cs.pan_iam_profile ? cs.pan_iam_profile.map((p) => `${p[0]}:${p[1]}`).join("  ") : "dibaca dari karakterisasi modul"}</div>
        )}
        <label style={{ fontSize: 12, display: "block", marginTop: 6 }}><input type="checkbox" checked={cs.albedo_use_weather} onChange={(e) => set({ albedo_use_weather: e.target.checked })} /> Pakai albedo dari berkas cuaca bila ada</label>
        <Months12 label="Albedo per bulan (0–1)" values={cs.albedo} onChange={(v) => set({ albedo: v as ConditionSet["albedo"] })} />
        <Months12 label="Soiling per bulan (%)" values={cs.soiling_pct} onChange={(v) => set({ soiling_pct: v as ConditionSet["soiling_pct"] })} />
      </div>

      <div style={sec}><b>Suhu sel</b>
        <div style={grid}>
          <Sel label="Model suhu" value={tm.model} options={["sapm", "faiman", "pvsyst", "noct_sam"]} onChange={(m) => {
            if (m === tm.model) return;
            const z = NaN;
            set({ temperature_model: m === "sapm" ? { model: "sapm", a: z, b: z, delta_t: z } : m === "faiman" ? { model: "faiman", u0: z, u1: z } : m === "pvsyst" ? { model: "pvsyst", u_c: z, u_v: z, alpha_absorption: z, module_efficiency: z } : { model: "noct_sam", noct_c: z, module_efficiency: z, transmittance_absorptance: z, array_height: z, mount_standoff_in: z } });
          }} />
          {Object.entries(tm).filter(([k]) => k !== "model").map(([k, v]) => (
            <Num key={k} label={k} value={typeof v === "number" && Number.isFinite(v) ? v : null} onChange={(n) => set({ temperature_model: { ...tm, [k]: n ?? NaN } as ConditionSet["temperature_model"] })} />
          ))}
          <Num label="Koef. suhu Pmax (%/°C), kosong = dari karakterisasi" value={cs.module_temp_coeff_p_max_pct_per_c} onChange={(v) => set({ module_temp_coeff_p_max_pct_per_c: v })} />
        </div>
      </div>

      <div style={sec}><b>Rugi listrik</b>
        <div style={grid}>
          <Num label="Mismatch modul (%)" value={cs.mismatch.pct} onChange={(v) => set({ mismatch: { ...cs.mismatch, pct: v ?? NaN } })} />
          <Num label="Sigma irradiansi (%)" value={cs.mismatch.sigma_irradiance_pct} onChange={(v) => set({ mismatch: { ...cs.mismatch, sigma_irradiance_pct: v } })} />
          <Num label="Sebaran suhu sel (°C)" value={cs.mismatch.temp_spread_c} onChange={(v) => set({ mismatch: { ...cs.mismatch, temp_spread_c: v } })} />
          <Num label="Toleransi modul min (%)" value={cs.mismatch.module_tolerance_min_pct} onChange={(v) => set({ mismatch: { ...cs.mismatch, module_tolerance_min_pct: v } })} />
          <Num label="Toleransi modul maks (%)" value={cs.mismatch.module_tolerance_max_pct} onChange={(v) => set({ mismatch: { ...cs.mismatch, module_tolerance_max_pct: v } })} />
          <Derate label="Kabel DC (% pada STC)" value={cs.dc_wiring} withBasis onChange={(v) => set({ dc_wiring: v })} />
          <Derate label="Kabel AC & trafo (%)" value={cs.ac_loss} withBasis onChange={(v) => set({ ac_loss: v })} />
          <Derate label="LID awal (%)" value={cs.lid} onChange={(v) => set({ lid: v })} />
          <Num label="Efisiensi inverter cadangan (%)" value={cs.inverter_efficiency_pct} onChange={(v) => set({ inverter_efficiency_pct: v ?? NaN })} />
          <Num label="Faktor daya" value={cs.power_factor} onChange={(v) => set({ power_factor: v ?? NaN })} />
          <Num label="Offset suhu inverter (°C)" value={cs.inverter_temp_offset_c} onChange={(v) => set({ inverter_temp_offset_c: v ?? NaN })} />
        </div>
      </div>

      <div style={sec}><b>Degradasi & ketersediaan</b>
        <div style={grid}>
          <Num label="Degradasi tahun pertama (%)" value={cs.degradation.first_year_pct} onChange={(v) => set({ degradation: { ...cs.degradation, first_year_pct: v ?? NaN } })} />
          <Num label="Degradasi tahunan (%/tahun)" value={cs.degradation.annual_rate_pct} onChange={(v) => set({ degradation: { ...cs.degradation, annual_rate_pct: v ?? NaN } })} />
          <Num label="Porsi tegangan degradasi (%)" value={cs.degradation.voltage_share_pct} onChange={(v) => set({ degradation: { ...cs.degradation, voltage_share_pct: v ?? NaN } })} />
          <Sel label="Ketersediaan" value={cs.availability.mode} options={["not_applied", "annual", "monthly"]} onChange={(m) => set({ availability: m === "not_applied" ? { mode: "not_applied" } : m === "annual" ? { mode: "annual", pct: 0 } : { mode: "monthly", pct: Array(12).fill(0) as never } })} />
          {cs.availability.mode === "annual" && <Num label="Unavailability tahunan (%)" value={cs.availability.pct} onChange={(v) => set({ availability: { mode: "annual", pct: v ?? NaN } })} />}
        </div>
        {cs.availability.mode === "monthly" && <Months12 label="Unavailability per bulan (%)" values={cs.availability.pct} onChange={(v) => set({ availability: { mode: "monthly", pct: v as never } })} />}
      </div>

      <div style={sec}><b>Loss kustom</b> (maks {MAX_CUSTOM_LOSSES}; mis. kualitas modul)
        {cs.custom_losses.map((c, i) => (
          <div key={i} style={{ marginTop: 8, borderTop: "1px dashed #233527", paddingTop: 6 }}>
            <div style={grid}>
              <label style={{ fontSize: 12, display: "grid", gap: 2 }}>Nama<input style={inp} value={c.name} onChange={(e) => setLoss(i, { name: e.target.value })} /></label>
              <label style={{ fontSize: 12, display: "grid", gap: 2 }}>Keterangan / sumber<input style={inp} value={c.description} onChange={(e) => setLoss(i, { description: e.target.value })} /></label>
              <Sel label="Tahap" value={c.stage} options={["irradiance", "dc", "ac"]} onChange={(v) => setLoss(i, { stage: v })} />
            </div>
            <Months12 label="Persen per bulan" values={c.monthly_pct} onChange={(v) => setLoss(i, { monthly_pct: v as CustomLoss["monthly_pct"] })} />
            <button className="secondary-button" style={{ marginTop: 4 }} onClick={() => set({ custom_losses: cs.custom_losses.filter((_, j) => j !== i) })}>Hapus</button>
          </div>
        ))}
        {cs.custom_losses.length < MAX_CUSTOM_LOSSES && (
          <button className="secondary-button" style={{ marginTop: 8 }} onClick={() => set({ custom_losses: [...cs.custom_losses, { name: "", description: "", stage: "dc", monthly_pct: Array(12).fill(0) as CustomLoss["monthly_pct"] }] })}>+ Tambah loss</button>
        )}
      </div>

      <div style={sec}><b>Horizon</b>
        <HorizonBlock engineInputs={engineInputs} onEngineInputs={onEngineInputs} latLon={latLon} />
      </div>

      <div style={sec}><b>Ketidakpastian (P50–P90)</b>
        <div style={grid}>
          <Num label="Horizon (tahun)" value={unc.horizon_years} onChange={(v) => onEngineInputs({ uncertainty: { ...unc, horizon_years: v ?? 1 } })} />
          <Sel label="Penggabungan" value={unc.combination} options={["rss", "linear"]} onChange={(v) => onEngineInputs({ uncertainty: { ...unc, combination: v } })} />
        </div>
        {p90Status && p90Status !== "ready" && (
          <div role="alert" style={{ color: "#fbbf24", fontSize: 12, marginTop: 6 }}>Status P90 SolarApp: <b>{p90Status}</b>{p90Status === "needs_uncertainty_inputs" ? " - isi sigma dan sumber untuk ke-10 komponen di bawah." : ""}</div>
        )}
        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 6 }}>Sepuluh komponen wajib diisi (nilai dan sumber). SolarApp Engine tidak menghitung P90 bila ada yang kosong; isi 0 beserta alasannya bila memang tidak dipakai.</div>
        <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
          {UNCERTAINTY_ROWS.map(({ key: k, label }) => {
            const row = unc.components.find((c) => c.key === k);
            const missing = !isNum(row?.sigma_pct) || !row?.source;
            const upd = (patch: { sigma_pct?: number | null; source?: string | null }) =>
              setUnc([...unc.components.filter((c) => c.key !== k), { key: k, sigma_pct: row?.sigma_pct ?? null, source: row?.source ?? "", ...patch }]);
            return (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 90px 2fr", gap: 6, alignItems: "end", borderLeft: missing ? "3px solid #f59e0b" : "3px solid transparent", paddingLeft: 6 }}>
                <span style={{ fontSize: 12 }}>{label} <code style={{ opacity: 0.6 }}>{k}</code></span>
                <Num label="σ (%)" value={row?.sigma_pct ?? null} onChange={(v) => upd({ sigma_pct: v })} />
                <label style={{ display: "grid", gap: 2, fontSize: 12 }}>Sumber
                  <input style={inp} value={row?.source ?? ""} onChange={(e) => upd({ source: e.target.value })} /></label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HorizonBlock({ engineInputs, onEngineInputs, latLon }: { latLon: { lat: number; lon: number } | null; engineInputs: Partial<EngineInputs>; onEngineInputs: (p: Partial<EngineInputs>) => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const pts = engineInputs.horizon?.points ?? [];
  const fetchIt = async () => {
    const loc = latLon;
    if (!loc) { setMsg("Lokasi proyek belum diketahui (ambil dari Site GIS)."); return; }
    try {
      const r = await getPvgisHorizon(loc.lat, loc.lon);
      onEngineInputs({ horizon: r.horizon, horizon_source: `${r.source} (lat ${r.lat}, lon ${r.lon})` });
      setMsg(null);
    } catch (e) { setMsg(verbatimError(e)); }
  };
  return (
    <div style={{ fontSize: 12 }}>
      <button className="secondary-button" onClick={() => void fetchIt()}>Ambil horizon PVGIS</button>
      <button className="secondary-button" style={{ marginLeft: 6 }} onClick={() => onEngineInputs({ horizon: null, horizon_source: null })}>Tanpa horizon</button>
      {msg && <div style={{ color: "#f87171", marginTop: 4, whiteSpace: "pre-wrap" }}>{msg}</div>}
      <div style={{ marginTop: 4 }}>{pts.length > 0 ? `${pts.length} titik · sumber: ${engineInputs.horizon_source ?? "—"}` : "Belum ada profil horizon (langit terbuka)."}</div>
    </div>
  );
}
