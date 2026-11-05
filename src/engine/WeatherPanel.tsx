// "Sumber cuaca" panel (PV Layout, step 5): pick or fetch the weather the engine runs on, compare
// sources and read helio's QC. The pick is saved in `engine_inputs.weather_choice`; `useEngine.run()`
// applies it. Every figure shown comes from helio (or a plain sum/difference of its figures).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createNasaPowerWeather, createPvgisSeries, createPvgisWeather, createSolcastWeather, getSites, getWeatherComparison,
  getWeatherDetail, getWeatherProviders, getWeatherQc, isUnavailable, listWeather, listWeatherSeries, uploadWeather, UNAVAILABLE_MESSAGE,
  verbatimError, weatherCsvUrl, weatherUploadProblems, WEATHER_UPLOAD_MAX_BYTES, type WeatherProvidersResponse, type WeatherUploadFormat,
} from "./client";
import { nearestRegion } from "./inputBuilder";
import type { CsvTemplate, WeatherChoice } from "./types/local";
import type { WeatherComparisonEntry, WeatherDatasetSummary, WeatherQcReport, WeatherSeriesSummary } from "./types";
import {
  annualFromMonthly, buildComparison, buildCsvMapping, choiceFromDataset, choiceFromSeries, CSV_TIME_FORMATS, CSV_TIME_LABELS,
  EMPTY_CSV_MAPPING_FORM, ghiOf, seriesMeanGhi, seriesYearRangeError, spreadExceeds, weatherSourceName, WEATHER_SPREAD_MESSAGE,
  type CompareItem, type CsvMappingForm,
} from "./weather";

const inp: React.CSSProperties = { padding: "4px 6px", borderRadius: 6, border: "1px solid #364b38", background: "#0d1410", color: "inherit", width: "100%", minWidth: 0 };
const sec: React.CSSProperties = { border: "1px solid #233527", borderRadius: 8, padding: 10, marginTop: 10 };
const grid: React.CSSProperties = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" };
const small: React.CSSProperties = { fontSize: 11, opacity: 0.7 };
const th: React.CSSProperties = { textAlign: "right", padding: "3px 6px", borderBottom: "1px solid #233527", fontWeight: 600 };
const td: React.CSSProperties = { textAlign: "right", padding: "3px 6px", borderBottom: "1px solid #1a2a1d" };

type Kind = "pvgis" | "pvgis_series" | "nasa" | "solcast" | "upload";
const KINDS: Array<{ v: Kind; label: string }> = [
  { v: "pvgis", label: "PVGIS TMY" },
  { v: "pvgis_series", label: "PVGIS multi-tahun" },
  { v: "nasa", label: "NASA POWER" },
  { v: "solcast", label: "Solcast" },
  { v: "upload", label: "Unggah file (EPW / TMY3 / CSV)" },
];

const f1 = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("id-ID", { maximumFractionDigits: 1 }) : "—");
const sgn = (v: number | null) => (v === null ? "" : `${v > 0 ? "+" : ""}${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);
const numOrNull = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: 2, fontSize: 12 }}>{label}{children}</label>;
}

export default function WeatherPanel({ latLon, choice, onChoice }: {
  latLon: { lat: number; lon: number } | null;
  choice: WeatherChoice | null | undefined;
  onChoice: (c: WeatherChoice | null) => void;
}) {
  const [datasets, setDatasets] = useState<WeatherDatasetSummary[]>([]);
  const [series, setSeries] = useState<WeatherSeriesSummary[]>([]);
  const [providers, setProviders] = useState<WeatherProvidersResponse | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("pvgis");
  const [utc, setUtc] = useState("");
  const [utcHint, setUtcHint] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [y0, setY0] = useState("");
  const [y1, setY1] = useState("");
  const [d0, setD0] = useState("");
  const [d1, setD1] = useState("");
  const [elev, setElev] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [fmt, setFmt] = useState<WeatherUploadFormat>("epw");
  const [wind, setWind] = useState("");
  const [lat, setLat] = useState(latLon ? String(latLon.lat) : "");
  const [lon, setLon] = useState(latLon ? String(latLon.lon) : "");
  const [template, setTemplate] = useState<"" | CsvTemplate>("");
  const [mapForm, setMapForm] = useState<CsvMappingForm>(EMPTY_CSV_MAPPING_FORM);

  const [pick, setPick] = useState<string[]>([]);
  const [cmp, setCmp] = useState<{ items: CompareItem[]; note: string | null } | null>(null);
  const [cmpErr, setCmpErr] = useState<string | null>(null);
  const [qc, setQc] = useState<{ id: string; label: string; report?: WeatherQcReport; error?: string } | null>(null);

  const refreshLists = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([listWeather(), listWeatherSeries()]);
      setDatasets(d); setSeries(s); setListErr(null);
    } catch (e) { setListErr(isUnavailable(e) ? UNAVAILABLE_MESSAGE : verbatimError(e)); }
    setLoaded(true);
    getWeatherProviders().then(setProviders).catch(() => setProviders(null));
  }, []);
  useEffect(() => { void refreshLists(); }, [refreshLists]);

  // Clock offset hint: the reference site nearest the project (helio's own site list); the engineer can overwrite it.
  useEffect(() => {
    if (!latLon) return;
    let live = true;
    getSites().then((sites) => {
      const id = nearestRegion(latLon.lat, latLon.lon, sites);
      const s = sites.find((x) => x.id === id);
      if (live && s) { setUtcHint(`${s.utc_offset_h} (site referensi ${s.id})`); setUtc((u) => (u === "" ? String(s.utc_offset_h) : u)); }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [latLon?.lat, latLon?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const standalone = useMemo(() => datasets.filter((d) => !d.series_id), [datasets]);
  const known = choice ? (choice.kind === "series" ? series.some((s) => s.id === choice.id) : datasets.some((d) => d.id === choice.id)) : true;

  const run = async (fn: () => Promise<WeatherChoice | null>) => {
    setBusy(true); setMsg(null);
    try {
      const c = await fn();
      await refreshLists();
      if (c) { onChoice(c); setMsg(`Sumber cuaca dipilih: ${c.label}`); }
    } catch (e) { setMsg(verbatimError(e)); }
    setBusy(false);
  };

  const utcNum = numOrNull(utc);
  const needPoint = (): { lat: number; lon: number; utc: number } => {
    if (!latLon) throw new Error("Titik proyek belum ada di layout (koordinat situs kosong).");
    if (utcNum === null || Math.abs(utcNum) > 14) throw new Error("UTC offset (jam) wajib diisi, antara -14 dan 14.");
    return { lat: latLon.lat, lon: latLon.lon, utc: utcNum };
  };
  const dateErr = (a: string, b: string, required: boolean) => {
    if (!a && !b) return required ? "Tanggal mulai dan akhir wajib diisi." : null;
    if (!a || !b) return "Isi tanggal mulai dan akhir keduanya, atau kosongkan keduanya.";
    return a > b ? "Tanggal mulai tidak boleh setelah tanggal akhir." : null;
  };

  const fetchSource = () => run(async () => {
    const nm = name.trim() || undefined;
    if (kind === "pvgis") {
      const p = needPoint();
      const r = await createPvgisWeather({ lat: p.lat, lon: p.lon, utc_offset_h: p.utc, name: nm });
      return choiceFromDataset(r.dataset);
    }
    if (kind === "pvgis_series") {
      const p = needPoint();
      const yr = y0.trim() || y1.trim() ? seriesYearRangeError(numOrNull(y0), numOrNull(y1)) : null;
      if (yr) throw new Error(yr);
      // helio's multi-year fetch hangs off a PVGIS TMY of this point (radiation DB + default year range).
      const tmy = (await createPvgisWeather({ lat: p.lat, lon: p.lon, utc_offset_h: p.utc })).dataset;
      const r = await createPvgisSeries({
        tmy_dataset_id: tmy.id, name: nm,
        ...(y0.trim() ? { year_first: Number(y0), year_last: Number(y1) } : {}),
      });
      return choiceFromSeries(r.series);
    }
    if (kind === "nasa") {
      const p = needPoint();
      const e = dateErr(d0, d1, false);
      if (e) throw new Error(e);
      const r = await createNasaPowerWeather({ lat: p.lat, lon: p.lon, utc_offset_h: p.utc, name: nm, ...(d0 ? { start: d0.replace(/-/g, ""), end: d1.replace(/-/g, "") } : {}) });
      return choiceFromDataset(r.dataset);
    }
    if (kind === "solcast") {
      const p = needPoint();
      const e = dateErr(d0, d1, true);
      if (e) throw new Error(e);
      const el = numOrNull(elev);
      const r = await createSolcastWeather({ lat: p.lat, lon: p.lon, utc_offset_h: p.utc, name: nm, start: d0, end: d1, ...(el !== null ? { elevation_m: el } : {}) });
      return choiceFromDataset(r.dataset);
    }
    // upload
    const mp = fmt === "csv" && !template ? buildCsvMapping(mapForm) : { mapping: null, errors: [] as string[] };
    const opts = {
      name: name.trim() || (file?.name ?? "").slice(0, 120), format: fmt, utc_offset_h: numOrNull(utc), wind_height_m: numOrNull(wind),
      lat: numOrNull(lat), lon: numOrNull(lon), elevation_m: numOrNull(elev), mapping: mp.mapping, template: fmt === "csv" && template ? template : null,
    };
    const problems = [...weatherUploadProblems(file, opts).filter((x) => !(mp.errors.length && x.startsWith("CSV butuh"))), ...mp.errors];
    if (problems.length) throw new Error(problems.join(" "));
    const r = await uploadWeather(file as File, opts);
    return choiceFromDataset(r.dataset);
  });

  // ---------------- comparison ----------------
  const togglePick = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const compare = async () => {
    setBusy(true); setCmpErr(null); setCmp(null);
    try {
      const ids = [...new Set([...(choice ? [choice.id] : []), ...pick])];
      const dsIds = ids.filter((id) => datasets.some((d) => d.id === id));
      const serIds = ids.filter((id) => series.some((s) => s.id === id));
      if (ids.length < 2) throw new Error("Pilih minimal dua sumber (sumber terpilih ikut otomatis).");
      if (dsIds.length > 8) throw new Error("Perbandingan helio maksimal 8 dataset.");
      let entries = new Map<string, WeatherComparisonEntry>();
      if (dsIds.length >= 2) entries = new Map((await getWeatherComparison(dsIds)).sources.map((e) => [e.dataset_id, e]));
      const details = await Promise.allSettled(dsIds.map((id) => getWeatherDetail(id)));
      const items: CompareItem[] = dsIds.map((id, i) => {
        const sum = datasets.find((d) => d.id === id)!;
        const d = details[i];
        const a = annualFromMonthly(d.status === "fulfilled" ? d.value.monthly : null);
        const en = entries.get(id);
        return { id, kind: "dataset", label: sum.name, source: sum.source, ghi: ghiOf(en, sum), ...a, synthetic: en?.synthetic_hourly ?? sum.synthetic_hourly };
      });
      for (const id of serIds) {
        const s = series.find((x) => x.id === id)!;
        items.push({ id, kind: "series", label: s.name, source: s.provider, ghi: seriesMeanGhi(s), dni: null, dhi: null, temp: null });
      }
      setCmp({ items, note: serIds.length ? "Seri multi-tahun: GHI = rerata tahun anggota; DNI, DHI, dan suhu tidak diringkas helio per seri." : null });
    } catch (e) { setCmpErr(e instanceof Error && !(e as { status?: number }).status ? e.message : verbatimError(e)); }
    setBusy(false);
  };
  const rows = useMemo(() => (cmp ? buildComparison(cmp.items, choice?.id) : []), [cmp, choice?.id]);

  // ---------------- QC ----------------
  const loadQc = async (id: string, label: string) => {
    setQc({ id, label });
    try { setQc({ id, label, report: await getWeatherQc(id, latLon ? { lat: latLon.lat, lon: latLon.lon } : {}) }); }
    catch (e) { setQc({ id, label, error: verbatimError(e) }); }
  };

  const cell = (v: number | null, diff: number | null, digits = 1) => (
    <td style={{ ...td, color: diff !== null && Math.abs(diff) > 5 ? "#fbbf24" : undefined }}>
      {v === null ? "—" : v.toLocaleString("id-ID", { maximumFractionDigits: digits })}
      {diff !== null && <div style={{ fontSize: 10 }}>{sgn(diff)}</div>}
    </td>
  );
  const solcastCfg = providers?.providers.find((p) => p.provider === "solcast");
  const setMap = (patch: Partial<CsvMappingForm>) => setMapForm((m) => ({ ...m, ...patch }));

  return (
    <div style={sec} data-testid="weather-panel">
      <b>Sumber cuaca</b>
      <div style={{ fontSize: 12, marginTop: 4 }}>
        {choice
          ? <>Dipakai: <b>{choice.label}</b> · {weatherSourceName(choice.source)}{choice.kind === "series" ? ` · multi-tahun${choice.year_first != null ? ` ${choice.year_first}–${choice.year_last}` : ""}${choice.year_count ? ` (${choice.year_count} tahun)` : ""}` : ""}
            {" "}<button className="secondary-button" onClick={() => onChoice(null)}>Kembali ke PVGIS TMY otomatis</button></>
          : <>Belum dipilih: saat Hitung, engine mengambil PVGIS TMY di titik proyek (bawaan).</>}
      </div>
      {choice && loaded && !listErr && !known && <div style={{ color: "#fbbf24", fontSize: 12 }}>Sumber terpilih tidak ada di daftar helio (diarsipkan?). Pilih ulang.</div>}
      {listErr && <div style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>{listErr}</div>}

      <div style={{ ...grid, marginTop: 8 }}>
        <L label="Sumber"><select style={inp} value={kind} onChange={(e) => { setKind(e.target.value as Kind); setMsg(null); }}>
          {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}</select></L>
        <L label="Nama (opsional)"><input style={inp} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={kind === "upload" ? "default: nama file" : "default dari helio"} /></L>
        <L label="UTC offset situs (jam)"><input style={inp} type="number" step="any" value={utc} onChange={(e) => setUtc(e.target.value)} />
          {utcHint && <span style={small}>acuan: {utcHint}</span>}</L>
        {kind === "pvgis_series" && <>
          <L label="Tahun awal"><input style={inp} type="number" step={1} value={y0} onChange={(e) => setY0(e.target.value)} /></L>
          <L label="Tahun akhir"><input style={inp} type="number" step={1} value={y1} onChange={(e) => setY1(e.target.value)} /></L>
        </>}
        {(kind === "nasa" || kind === "solcast") && <>
          <L label={kind === "nasa" ? "Mulai (opsional)" : "Mulai"}><input style={inp} type="date" value={d0} onChange={(e) => setD0(e.target.value)} /></L>
          <L label={kind === "nasa" ? "Akhir (opsional)" : "Akhir"}><input style={inp} type="date" value={d1} onChange={(e) => setD1(e.target.value)} /></L>
        </>}
        {kind === "solcast" && <L label="Elevasi (m, opsional)"><input style={inp} type="number" step="any" value={elev} onChange={(e) => setElev(e.target.value)} /></L>}
      </div>
      {kind === "pvgis_series" && <div style={small}>Kosongkan tahun untuk memakai rentang TMY PVGIS (bawaan helio). Batas helio: 1900–2100, selisih maksimal 40 tahun. Seri butuh dataset PVGIS TMY di titik ini; dibuat/dipakai ulang otomatis.</div>}
      {kind === "nasa" && <div style={small}>Tanpa tanggal: satu tahun kalender penuh terakhir. NASA POWER adalah cadangan terakhir (resolusi kasar).</div>}
      {kind === "solcast" && <div style={small}>
        {solcastCfg ? (solcastCfg.configured ? "API key Solcast terpasang di organisasi ini." : "API key Solcast belum diisi di organisasi ini (pengelolaan key tidak tersedia dari /design); permintaan akan ditolak helio.") : "Status API key tidak terbaca."}</div>}

      {kind === "upload" && (
        <div style={{ marginTop: 6 }}>
          <div style={grid}>
            <L label={`Berkas (maks ${WEATHER_UPLOAD_MAX_BYTES / 1024 / 1024} MiB)`}>
              <input style={inp} type="file" accept=".epw,.csv,.txt,.tm3,.tmy3" onChange={(e) => {
                const f = e.target.files?.[0] ?? null; setFile(f);
                const ext = f?.name.split(".").pop()?.toLowerCase();
                if (ext === "epw") setFmt("epw"); else if (ext === "csv") setFmt("csv"); else if (ext === "tm3" || ext === "tmy3") setFmt("tmy3");
              }} /></L>
            <L label="Format (tidak ditebak dari isi)"><select style={inp} value={fmt} onChange={(e) => setFmt(e.target.value as WeatherUploadFormat)}>
              <option value="epw">EPW</option><option value="tmy3">TMY3</option><option value="csv">CSV</option></select></L>
            <L label="Tinggi angin (m)"><input style={inp} type="number" step="any" value={wind} onChange={(e) => setWind(e.target.value)} /></L>
            <L label="Lat (wajib CSV)"><input style={inp} type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} /></L>
            <L label="Lon (wajib CSV)"><input style={inp} type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} /></L>
            <L label="Elevasi (m, wajib CSV)"><input style={inp} type="number" step="any" value={elev} onChange={(e) => setElev(e.target.value)} /></L>
          </div>
          <div style={small}>EPW/TMY3: lokasi dibaca dari header berkas; kolom opsional di atas menimpanya bila diisi. UTC offset di atas dipakai untuk semua format.</div>
          {fmt === "csv" && (
            <div style={{ marginTop: 6 }}>
              <div style={grid}>
                <L label="Template vendor"><select style={inp} value={template} onChange={(e) => setTemplate(e.target.value as "" | CsvTemplate)}>
                  <option value="">Pemetaan kolom manual</option><option value="solcast">Solcast</option><option value="solargis">Solargis</option><option value="meteonorm">Meteonorm</option></select></L>
              </div>
              {!template && (
                <div style={{ ...grid, marginTop: 6 }}>
                  <L label="Pemisah"><select style={inp} value={mapForm.delimiter} onChange={(e) => setMap({ delimiter: e.target.value as CsvMappingForm["delimiter"] })}>
                    <option value=",">koma ,</option><option value=";">titik koma ;</option><option value={"\t"}>tab</option></select></L>
                  <L label="Baris sebelum header"><input style={inp} type="number" min={0} step={1} value={mapForm.skip_lines} onChange={(e) => setMap({ skip_lines: e.target.value === "" ? "" : Number(e.target.value) })} /></L>
                  <L label="Kolom waktu"><input style={inp} value={mapForm.time_column} onChange={(e) => setMap({ time_column: e.target.value })} /></L>
                  <L label="Format waktu"><select style={inp} value={mapForm.time_format} onChange={(e) => setMap({ time_format: e.target.value as CsvMappingForm["time_format"] })}>
                    {CSV_TIME_FORMATS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></L>
                  <L label="Zona waktu stempel (UTC jam)"><input style={inp} type="number" step="any" value={mapForm.clock_utc_offset_h} onChange={(e) => setMap({ clock_utc_offset_h: e.target.value === "" ? "" : Number(e.target.value) })} /></L>
                  <L label="Stempel waktu = "><select style={inp} value={mapForm.time_label} onChange={(e) => setMap({ time_label: e.target.value as CsvMappingForm["time_label"] })}>
                    {CSV_TIME_LABELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></L>
                  <L label="Kolom GHI"><input style={inp} value={mapForm.ghi_column} onChange={(e) => setMap({ ghi_column: e.target.value })} /></L>
                  <L label="Satuan GHI"><select style={inp} value={mapForm.ghi_unit} onChange={(e) => setMap({ ghi_unit: e.target.value as CsvMappingForm["ghi_unit"] })}><option>W/m2</option><option>Wh/m2</option></select></L>
                  <L label="Kolom suhu udara (degC)"><input style={inp} value={mapForm.temp_column} onChange={(e) => setMap({ temp_column: e.target.value })} /></L>
                  <L label="Kolom angin (m/s)"><input style={inp} value={mapForm.wind_column} onChange={(e) => setMap({ wind_column: e.target.value })} /></L>
                  <L label="Kolom DNI (opsional)"><input style={inp} value={mapForm.dni_column} onChange={(e) => setMap({ dni_column: e.target.value })} /></L>
                  <L label="Satuan DNI"><select style={inp} value={mapForm.dni_unit} onChange={(e) => setMap({ dni_unit: e.target.value as CsvMappingForm["dni_unit"] })}><option>W/m2</option><option>Wh/m2</option></select></L>
                  <L label="Kolom DHI (opsional)"><input style={inp} value={mapForm.dhi_column} onChange={(e) => setMap({ dhi_column: e.target.value })} /></L>
                  <L label="Satuan DHI"><select style={inp} value={mapForm.dhi_unit} onChange={(e) => setMap({ dhi_unit: e.target.value as CsvMappingForm["dhi_unit"] })}><option>W/m2</option><option>Wh/m2</option></select></L>
                  <L label="Kolom tekanan (opsional)"><input style={inp} value={mapForm.pressure_column} onChange={(e) => setMap({ pressure_column: e.target.value })} /></L>
                  <L label="Satuan tekanan"><select style={inp} value={mapForm.pressure_unit} onChange={(e) => setMap({ pressure_unit: e.target.value as CsvMappingForm["pressure_unit"] })}><option>Pa</option><option>hPa</option><option>mbar</option></select></L>
                  <L label="Kolom RH % (opsional)"><input style={inp} value={mapForm.rh_column} onChange={(e) => setMap({ rh_column: e.target.value })} /></L>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="secondary-button" disabled={busy || !!listErr} onClick={() => void fetchSource()}>{busy ? "Memproses…" : kind === "upload" ? "Unggah & pakai" : "Ambil & pakai"}</button>
        {msg && <span style={{ fontSize: 12, wordBreak: "break-word" }}>{msg}</span>}
      </div>

      <div style={{ marginTop: 10, fontSize: 12 }}><b>Sudah ada di helio</b> <span style={small}>(pakai ulang, tanpa ambil ulang)</span></div>
      {!loaded && <div style={small}>Memuat…</div>}
      {loaded && !listErr && standalone.length === 0 && series.length === 0 && <div style={small}>Belum ada dataset/seri cuaca.</div>}
      <div style={{ maxHeight: 220, overflow: "auto", marginTop: 4 }}>
        {series.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, padding: "2px 0", flexWrap: "wrap" }}>
            <input type="checkbox" checked={pick.includes(s.id)} onChange={() => togglePick(s.id)} title="Ikutkan di perbandingan" />
            <span style={{ flex: 1, minWidth: 160 }}>{s.name} <span style={small}>· seri {s.year_first}–{s.year_last} ({s.members.length} thn) · GHI rerata {f1(seriesMeanGhi(s))} kWh/m²</span></span>
            {s.tmy_dataset_id && <button className="secondary-button" onClick={() => void loadQc(s.tmy_dataset_id as string, `${s.name} (TMY acuan)`)}>QC TMY</button>}
            <button className="secondary-button" disabled={choice?.id === s.id} onClick={() => onChoice(choiceFromSeries(s))}>{choice?.id === s.id ? "Dipakai" : "Pakai"}</button>
          </div>
        ))}
        {standalone.map((d) => (
          <div key={d.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, padding: "2px 0", flexWrap: "wrap" }}>
            <input type="checkbox" checked={pick.includes(d.id)} onChange={() => togglePick(d.id)} title="Ikutkan di perbandingan" />
            <span style={{ flex: 1, minWidth: 160 }}>{d.name} <span style={small}>· {weatherSourceName(d.source)} · GHI {f1(d.annual_ghi_kwh_m2)} kWh/m²{d.synthetic_hourly ? " · jam sintetis" : ""}</span></span>
            <a href={weatherCsvUrl(d.id)} style={{ fontSize: 11 }} download>CSV</a>
            <button className="secondary-button" onClick={() => void loadQc(d.id, d.name)}>QC</button>
            <button className="secondary-button" disabled={choice?.id === d.id} onClick={() => onChoice(choiceFromDataset(d))}>{choice?.id === d.id ? "Dipakai" : "Pakai"}</button>
          </div>
        ))}
      </div>

      {qc && (
        <div style={{ ...sec, fontSize: 12 }}>
          <b>QC: {qc.label}</b> <button className="secondary-button" onClick={() => setQc(null)}>Tutup</button>
          {!qc.report && !qc.error && <div style={small}>Memuat…</div>}
          {qc.error && <div style={{ color: "#f87171" }}>{qc.error}</div>}
          {qc.report && <>
            <div style={{ marginTop: 4 }}>Langkah waktu {qc.report.continuity.step_seconds_ok ? "konsisten" : "TIDAK konsisten"} · {qc.report.continuity.timestep_count} langkah · celah {qc.report.continuity.gaps} · duplikat {qc.report.continuity.duplicates}
              {" "}· dugaan geser waktu: {qc.report.time_shift.suspected ? "ya" : "tidak"}{qc.report.time_shift.mean_offset_minutes != null ? ` (${f1(qc.report.time_shift.mean_offset_minutes)} menit)` : ""}</div>
            <div>Jam gagal uji: GHI {qc.report.irradiance.ghi_limit_fail_hours}, DNI {qc.report.irradiance.dni_limit_fail_hours}, DHI {qc.report.irradiance.dhi_limit_fail_hours}, konsistensi {qc.report.irradiance.consistency_fail_hours}, negatif {qc.report.irradiance.negative_hours}, macet {qc.report.irradiance.stuck_hours}</div>
            {qc.report.metadata.distance_km != null && <div>Jarak ke titik proyek {f1(qc.report.metadata.distance_km)} km{qc.report.metadata.distance_warning ? " (peringatan)" : ""}</div>}
            {qc.report.warnings.length === 0 ? <div style={small}>Helio tidak melaporkan peringatan QC.</div>
              : <ul style={{ margin: "4px 0 0 16px", color: "#fbbf24" }}>{qc.report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          </>}
        </div>
      )}

      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 12 }}>Perbandingan sumber</b>
        <button className="secondary-button" disabled={busy || !!listErr} onClick={() => void compare()}>Bandingkan{pick.length ? ` (${pick.length}${choice && !pick.includes(choice.id) ? " + terpilih" : ""})` : ""}</button>
        <span style={small}>Centang sumber di daftar; sumber terpilih jadi acuan selisih.</span>
      </div>
      {cmpErr && <div style={{ color: "#f87171", fontSize: 12 }}>{cmpErr}</div>}
      {cmp && (
        <div style={{ overflowX: "auto", marginTop: 4 }}>
          {!choice && <div style={{ ...small, color: "#fbbf24" }}>Belum ada sumber terpilih: selisih % tidak dihitung.</div>}
          {spreadExceeds(rows) && <div style={{ color: "#fbbf24", fontSize: 12, fontWeight: 600 }}>{WEATHER_SPREAD_MESSAGE}</div>}
          <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Sumber</th><th style={th}>GHI (kWh/m²/thn)</th><th style={th}>DNI (kWh/m²/thn)</th><th style={th}>DHI (kWh/m²/thn)</th><th style={th}>Suhu rata² (°C)</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={r.isBase ? { background: "#12201a" } : undefined}>
                  <td style={{ ...td, textAlign: "left" }}>{r.label}{r.isBase ? " (terpilih)" : ""}<div style={small}>{weatherSourceName(r.source)}{r.synthetic ? " · jam sintetis" : ""}</div></td>
                  {cell(r.ghi, r.ghiDiffPct)}{cell(r.dni, r.dniDiffPct)}{cell(r.dhi, r.dhiDiffPct)}{cell(r.temp, null)}
                </tr>
              ))}
            </tbody>
          </table>
          {cmp.note && <div style={small}>{cmp.note}</div>}
          <div style={small}>DNI/DHI = jumlah 12 bulan, suhu = rata-rata berbobot hari, dari ringkasan bulanan helio; "—" bila berkas tidak memuatnya.</div>
        </div>
      )}
    </div>
  );
}
