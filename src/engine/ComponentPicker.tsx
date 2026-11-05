// Module / inverter picker over helio's component library, with upload flows for an empty org
// library: PAN/OND/CEC file (preview -> confirm) and manual datasheet entry (every field required,
// no defaults). Visibility is always "org". helio errors are shown verbatim.
import { useCallback, useEffect, useState } from "react";
import {
  COMPONENT_FILE_MAX_BYTES, createDatasheet, previewComponentFile, searchComponents, uploadComponentFile,
  verbatimError, type ComponentFileFormat, type ComponentPreview, type DatasheetInput,
} from "./client";
import type { ComponentKind, ComponentSku } from "./types/local";

export interface PickerValue { sku: ComponentSku | null; characterizationId: string }

const box: React.CSSProperties = { border: "1px solid #364b38", borderRadius: 8, padding: 10, marginTop: 8 };
const inp: React.CSSProperties = { padding: "5px 8px", borderRadius: 6, border: "1px solid #364b38", background: "#0d1410", color: "inherit", width: "100%" };
const lab: React.CSSProperties = { display: "grid", gap: 2, fontSize: 12 };

export default function ComponentPicker({ kind, value, onChange }: {
  kind: "module" | "inverter"; value: PickerValue; onChange: (v: PickerValue) => void;
}) {
  const [q, setQ] = useState("");
  const [skus, setSkus] = useState<ComponentSku[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "file" | "datasheet">("none");

  const refresh = useCallback(async (select?: { skuId: string; charId: string }) => {
    setErr(null);
    try {
      const list = await searchComponents({ q: q || undefined, kind: kind as ComponentKind, limit: 50 });
      setSkus(list);
      if (select) {
        const sku = list.find((s) => s.id === select.skuId) ?? null;
        onChange({ sku, characterizationId: select.charId });
      }
    } catch (e) { setErr(verbatimError(e)); }
  }, [q, kind, onChange]);

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);

  const sel = value.sku;
  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        <input style={inp} placeholder={kind === "module" ? "Cari modul (mis. Longi)" : "Cari inverter (mis. Huawei)"} value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void refresh()} />
        <button className="secondary-button" onClick={() => void refresh()}>Cari</button>
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap" }}>{err}</div>}
      <select style={{ ...inp, marginTop: 6 }} value={sel?.id ?? ""}
        onChange={(e) => {
          const s = skus.find((x) => x.id === e.target.value) ?? null;
          const def = s?.characterizations.find((c) => c.is_default) ?? s?.characterizations[0];
          onChange({ sku: s, characterizationId: def?.id ?? "" });
        }}>
        <option value="">{skus.length ? "— pilih —" : "Library kosong: unggah file atau isi datasheet"}</option>
        {skus.map((s) => (
          <option key={s.id} value={s.id}>{s.manufacturer} {s.model} ({s.nameplate_w} {kind === "module" ? "Wp" : "W"})</option>
        ))}
      </select>
      {sel && (
        <select style={{ ...inp, marginTop: 6 }} value={value.characterizationId}
          onChange={(e) => onChange({ sku: sel, characterizationId: e.target.value })}>
          <option value="">— karakterisasi —</option>
          {sel.characterizations.map((c) => (
            <option key={c.id} value={c.id}>{c.source.toUpperCase()}{c.is_default ? " (default)" : ""}{c.data_source ? ` — ${c.data_source}` : ""}</option>
          ))}
        </select>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button className="secondary-button" onClick={() => setMode(mode === "file" ? "none" : "file")}>Unggah PAN/OND/CEC</button>
        <button className="secondary-button" onClick={() => setMode(mode === "datasheet" ? "none" : "datasheet")}>Isi datasheet manual</button>
      </div>
      {mode === "file" && (
        <FileUpload kind={kind} onDone={(skuId, charId) => { setMode("none"); void refresh({ skuId, charId }); }} />
      )}
      {mode === "datasheet" && (
        <DatasheetForm kind={kind} onDone={(skuId, charId) => { setMode("none"); void refresh({ skuId, charId }); }} />
      )}
    </div>
  );
}

function FileUpload({ kind, onDone }: { kind: "module" | "inverter"; onDone: (skuId: string, charId: string) => void }) {
  const [format, setFormat] = useState<ComponentFileFormat>(kind === "module" ? "pan" : "ond");
  const [file, setFile] = useState<File | null>(null);
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [cecName, setCecName] = useState("");
  const [preview, setPreview] = useState<ComponentPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const formats: ComponentFileFormat[] = kind === "module" ? ["pan", "cec_module"] : ["ond", "cec_inverter"];
  const opts = { manufacturer: manufacturer || undefined, model: model || undefined, cecName: cecName || undefined };

  const doPreview = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setPreview(null);
    try { setPreview(await previewComponentFile(file, format, opts)); } catch (e) { setErr(verbatimError(e)); }
    setBusy(false);
  };
  const doConfirm = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const r = await uploadComponentFile(file, format, opts);
      onDone(r.sku.id, r.characterization.id);
    } catch (e) { setErr(verbatimError(e)); }
    setBusy(false);
  };

  return (
    <div style={box}>
      <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr" }}>
        <label style={lab}>Format
          <select style={inp} value={format} onChange={(e) => { setFormat(e.target.value as ComponentFileFormat); setPreview(null); }}>
            {formats.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label style={lab}>Berkas (maks {COMPONENT_FILE_MAX_BYTES / 1024} KiB)
          <input type="file" accept=".pan,.ond,.json,.csv,.txt" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />
        </label>
        <label style={lab}>Pabrikan (opsional)<input style={inp} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></label>
        <label style={lab}>Model (opsional)<input style={inp} value={model} onChange={(e) => setModel(e.target.value)} /></label>
        {format.startsWith("cec") && (
          <label style={lab}>Nama CEC<input style={inp} value={cecName} onChange={(e) => setCecName(e.target.value)} /></label>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <button className="secondary-button" disabled={!file || busy} onClick={() => void doPreview()}>Pratinjau</button>
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 6, whiteSpace: "pre-wrap" }}>{err}</div>}
      {preview && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <div>Jenis: <b>{preview.kind}</b> · sumber: <b>{preview.source}</b> · SHA-256 <code>{preview.file_sha256.slice(0, 12)}…</code></div>
          {preview.existing_characterization_id && <div>Berkas identik sudah ada di library (id {preview.existing_characterization_id}).</div>}
          {preview.warnings.map((w, i) => <div key={i} style={{ color: "#fbbf24" }}>{w.code}: {w.message}</div>)}
          <pre style={{ maxHeight: 180, overflow: "auto", background: "#0d1410", padding: 6, borderRadius: 6 }}>{JSON.stringify(preview.parsed, null, 2)}</pre>
          <button className="primary-button" disabled={busy} onClick={() => void doConfirm()}>Konfirmasi & simpan ke library organisasi</button>
        </div>
      )}
    </div>
  );
}

type DsField = { key: keyof DatasheetInput; label: string; num?: boolean; modules?: boolean; inverters?: boolean };
const DS_FIELDS: DsField[] = [
  { key: "manufacturer", label: "Pabrikan" },
  { key: "model", label: "Model" },
  { key: "nameplate_w", label: "Daya nominal (Wp untuk modul, W AC untuk inverter)", num: true },
  { key: "technology", label: "Teknologi sel (mono, poly, …)", modules: true },
  { key: "width_m", label: "Lebar modul (m)", num: true, modules: true },
  { key: "height_m", label: "Tinggi modul (m)", num: true, modules: true },
  { key: "v_dc_max_v", label: "Tegangan DC maks (V)", num: true },
  { key: "v_out_v", label: "Tegangan keluaran AC (V)", num: true, inverters: true },
  { key: "nb_mppt", label: "Jumlah MPPT", num: true, inverters: true },
  { key: "p_max_ac_w", label: "Daya AC maks (W)", num: true, inverters: true },
];

function DatasheetForm({ kind, onDone }: { kind: "module" | "inverter"; onDone: (skuId: string, charId: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fields = DS_FIELDS.filter((f) => (kind === "module" ? !f.inverters : !f.modules));
  const missing = fields.filter((f) => !(vals[f.key as string] ?? "").trim()).map((f) => f.label);
  if (!source.trim()) missing.push("Sumber datasheet");

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { kind, visibility: "org", nameplate_source: source.trim(), source: source.trim() };
      for (const f of fields) {
        const raw = vals[f.key as string].trim();
        body[f.key as string] = f.num ? Number(raw) : raw;
      }
      const r = await createDatasheet(body as unknown as DatasheetInput);
      onDone(r.sku.id, r.characterization.id);
    } catch (e) { setErr(verbatimError(e)); }
    setBusy(false);
  };

  return (
    <div style={box}>
      <div style={{ fontSize: 12, marginBottom: 6 }}>Semua isian wajib, tanpa nilai bawaan. Isi persis dari datasheet pabrikan.</div>
      <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr" }}>
        {fields.map((f) => (
          <label key={f.key as string} style={lab}>{f.label}
            <input style={inp} inputMode={f.num ? "decimal" : "text"} value={vals[f.key as string] ?? ""}
              onChange={(e) => setVals({ ...vals, [f.key as string]: e.target.value })} />
          </label>
        ))}
        <label style={{ ...lab, gridColumn: "1 / -1" }}>Sumber datasheet (dokumen, revisi, halaman)
          <input style={inp} value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
      </div>
      {missing.length > 0 && <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 6 }}>Belum diisi: {missing.join("; ")}</div>}
      {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 6, whiteSpace: "pre-wrap" }}>{err}</div>}
      <button className="primary-button" style={{ marginTop: 8 }} disabled={busy || missing.length > 0} onClick={() => void submit()}>Simpan ke library organisasi</button>
    </div>
  );
}
