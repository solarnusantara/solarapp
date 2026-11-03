import { useMemo, useState } from "react";

type Props = { lang?: "id" | "en" };

const fieldStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--border, #374151)", background: "var(--input-bg, #111827)",
  color: "var(--text, #f9fafb)", font: "inherit"
};
const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border, #374151)", borderRadius: 12, padding: 16,
  background: "var(--panel, #111827)", minWidth: 0
};

export default function StringCalculator({ lang = "id" }: Props) {
  const id = lang === "id";
  const [vmp, setVmp] = useState(42.1);
  const [voc, setVoc] = useState(50.2);
  const [imp, setImp] = useState(13.78);
  const [isc, setIsc] = useState(14.3);
  const [pmax, setPmax] = useState(580);
  const [betaVoc, setBetaVoc] = useState(-0.25);
  const [betaVmp, setBetaVmp] = useState(-0.30);
  const [moduleCount, setModuleCount] = useState(32);
  const [vdcMax, setVdcMax] = useState(1100);
  const [mpptMin, setMpptMin] = useState(200);
  const [mpptMax, setMpptMax] = useState(1000);
  const [inputCurrent, setInputCurrent] = useState(30);
  const [shortCircuitCurrentLimit, setShortCircuitCurrentLimit] = useState(30);
  const [mpptCount, setMpptCount] = useState(2);
  const [minAmbient, setMinAmbient] = useState(-5);
  const [maxCell, setMaxCell] = useState(70);
  const [safetyFactor, setSafetyFactor] = useState(1.25);

  const result = useMemo(() => {
    const valid = vmp > 0 && voc > 0 && imp > 0 && isc > 0 && pmax > 0 &&
      Number.isInteger(moduleCount) && moduleCount > 0 &&
      vdcMax > 0 && mpptMin >= 0 && mpptMax > mpptMin &&
      inputCurrent > 0 && shortCircuitCurrentLimit > 0 &&
      Number.isInteger(mpptCount) && mpptCount > 0 &&
      safetyFactor >= 1 && minAmbient < 25 && maxCell > 25;
    if (!valid) return { valid: false as const, errors: [id
      ? "Periksa input: nilai listrik harus positif, jumlah modul/MPPT harus bilangan bulat, dan rentang MPPT harus valid."
      : "Check inputs: electrical values must be positive, module/MPPT counts must be integers, and MPPT range must be valid."] };

    // Datasheet coefficients are entered as %/°C, referenced here to 25°C.
    const vocCold = voc * (1 + (betaVoc / 100) * (minAmbient - 25));
    const vmpHot = vmp * (1 + (betaVmp / 100) * (maxCell - 25));
    const vmpCold = vmp * (1 + (betaVmp / 100) * (minAmbient - 25));
    const maxSeriesByVdc = Math.floor(vdcMax / vocCold);
    const maxSeriesByMppt = Math.floor(mpptMax / vmpCold);
    const minSeriesByMppt = Math.ceil(mpptMin / vmpHot);
    const maxSeries = Math.min(maxSeriesByVdc, maxSeriesByMppt);

    // Keep operating-current and short-circuit-current checks separate.
    const parallelByOperatingCurrent = Math.floor(inputCurrent / imp);
    const parallelByShortCircuit = Math.floor(shortCircuitCurrentLimit / (isc * safetyFactor));
    const maxParallelPerMppt = Math.max(0, Math.min(parallelByOperatingCurrent, parallelByShortCircuit));
    const totalStrings = maxParallelPerMppt * mpptCount;

    // Find an even allocation that uses every module, respects the series range,
    // and does not exceed the estimated string capacity.
    let recommendedSeries = 0;
    let stringsNeeded = 0;
    if (maxSeries >= minSeriesByMppt && maxParallelPerMppt >= 1) {
      for (let strings = 1; strings <= Math.min(totalStrings, moduleCount); strings++) {
        if (moduleCount % strings !== 0) continue;
        const modulesPerString = moduleCount / strings;
        if (modulesPerString >= minSeriesByMppt && modulesPerString <= maxSeries) {
          stringsNeeded = strings;
          recommendedSeries = modulesPerString;
          break;
        }
      }
    }
    const modulesUsed = recommendedSeries > 0 ? stringsNeeded * recommendedSeries : 0;
    const dcCapacity = modulesUsed * pmax / 1000;
    const possible = recommendedSeries > 0 && modulesUsed === moduleCount;
    const operatingCurrentPerString = imp;
    const shortCircuitCurrentPerString = isc * safetyFactor;
    const warnings = [
      ...(vocCold <= 0 || maxSeriesByVdc < 1 ? [id ? "Voc terkoreksi suhu dingin tidak memenuhi batas tegangan DC inverter." : "Cold-corrected Voc does not meet inverter maximum DC voltage limit."] : []),
      ...(minSeriesByMppt > maxSeries ? [id ? "Tidak ada rentang jumlah modul seri yang memenuhi batas MPPT dan tegangan DC." : "No series count satisfies both MPPT and maximum DC voltage limits."] : []),
      ...(maxParallelPerMppt < 1 ? [id ? "Satu string saja melebihi batas arus operasi atau batas arus hubung singkat MPPT." : "Even one string exceeds the MPPT operating-current or short-circuit-current limit."] : []),
      ...(stringsNeeded === 0 ? [id ? "Tidak ditemukan pembagian string merata yang memakai semua modul dan memenuhi batas yang dimasukkan." : "No even string allocation uses all modules while meeting the entered limits."] : []),
      ...(stringsNeeded > totalStrings ? [id ? "Jumlah string yang dibutuhkan melebihi kapasitas total MPPT." : "Required string count exceeds total estimated MPPT capacity."] : [])
    ];
    return {
      valid: true as const, vocCold, vmpHot, vmpCold, maxSeriesByVdc, maxSeriesByMppt,
      minSeriesByMppt, maxSeries, maxParallelPerMppt, totalStrings, recommendedSeries,
      stringsNeeded, modulesUsed, dcCapacity, possible, warnings,
      operatingCurrentPerString, shortCircuitCurrentPerString,
      parallelByOperatingCurrent, parallelByShortCircuit
    };
  }, [vmp, voc, imp, isc, pmax, betaVoc, betaVmp, moduleCount, vdcMax, mpptMin, mpptMax, inputCurrent, shortCircuitCurrentLimit, mpptCount, minAmbient, maxCell, safetyFactor, id]);

  const numberField = (label: string, value: number, set: (v: number) => void, step = "any", hint?: string) => (
    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #9ca3af)" }}>
      <span>{label}</span>
      <input style={fieldStyle} type="number" step={step} value={value} onChange={e => set(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
  const metric = (label: string, value: string, note?: string) => (
    <div style={cardStyle}><div style={{ fontSize: 12, color: "var(--muted, #9ca3af)" }}>{label}</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 7, overflowWrap: "anywhere" }}>{value}</div>{note && <div style={{ fontSize: 12, color: "var(--muted, #9ca3af)", marginTop: 5 }}>{note}</div>}</div>
  );

  return <div style={{ display: "grid", gap: 18, color: "var(--text, #f9fafb)" }}>
    <header>
      <div style={{ fontSize: 12, letterSpacing: 1.2, color: "var(--muted, #9ca3af)", textTransform: "uppercase" }}>Electrical Design · Stage 2</div>
      <h2 style={{ margin: "6px 0", fontSize: 26 }}>{id ? "Kalkulator Konfigurasi String" : "PV String Calculator"}</h2>
      <p style={{ margin: 0, color: "var(--muted, #9ca3af)", lineHeight: 1.5 }}>{id ? "Estimasi jumlah modul seri/paralel berdasarkan datasheet modul dan batas input inverter." : "Estimate series/parallel module configuration from module datasheet and inverter input limits."}</p>
    </header>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>{id ? "1. Data modul PV" : "1. PV module data"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {numberField("Pmax (Wp)", pmax, setPmax)}{numberField("Vmp (V)", vmp, setVmp)}
          {numberField("Voc (V)", voc, setVoc)}{numberField("Imp (A)", imp, setImp)}
          {numberField("Isc (A)", isc, setIsc)}{numberField(id ? "Jumlah modul tersedia" : "Available modules", moduleCount, setModuleCount, "1")}
          {numberField("Koef. suhu Voc (%/°C)", betaVoc, setBetaVoc, "0.01")}{numberField("Koef. suhu Vmp (%/°C)", betaVmp, setBetaVmp, "0.01")}
        </div>
      </div>
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>{id ? "2. Batas inverter" : "2. Inverter limits"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {numberField(id ? "Tegangan DC maksimum (V)" : "Max DC voltage (V)", vdcMax, setVdcMax)}
          {numberField(id ? "MPPT minimum (V)" : "MPPT minimum (V)", mpptMin, setMpptMin)}
          {numberField(id ? "MPPT maksimum (V)" : "MPPT maximum (V)", mpptMax, setMpptMax)}
          {numberField(id ? "Batas arus operasi per MPPT (A)" : "Max operating current per MPPT (A)", inputCurrent, setInputCurrent, "any", id ? "Isi sesuai datasheet inverter." : "Enter the inverter datasheet value.")}
          {numberField(id ? "Batas arus hubung singkat per MPPT (A)" : "Max short-circuit current per MPPT (A)", shortCircuitCurrentLimit, setShortCircuitCurrentLimit, "any", id ? "Isi terpisah dari batas arus operasi." : "Separate from the operating-current limit.")}
          {numberField(id ? "Jumlah MPPT" : "Number of MPPTs", mpptCount, setMpptCount, "1")}
          {numberField(id ? "Faktor desain arus Isc" : "Isc design factor", safetyFactor, setSafetyFactor, "0.05", id ? "Default 1,25 untuk pemeriksaan awal." : "Default 1.25 for preliminary checking.")}
        </div>
      </div>
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>{id ? "3. Kondisi suhu desain" : "3. Design temperatures"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {numberField(id ? "Suhu minimum lingkungan (°C)" : "Minimum ambient temperature (°C)", minAmbient, setMinAmbient)}
          {numberField(id ? "Suhu sel maksimum (°C)" : "Maximum cell temperature (°C)", maxCell, setMaxCell)}
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--muted, #9ca3af)" }}>{id ? "Masukkan suhu desain lokasi proyek. Koefisien suhu diambil dari datasheet modul." : "Use project design temperatures. Temperature coefficients must come from the module datasheet."}</p>
      </div>
    </section>

    <section>
      <h3>{id ? "Hasil perhitungan awal" : "Preliminary results"}</h3>
      {!result.valid ? <div style={{ ...cardStyle, borderColor: "#ef4444" }}>{result.errors.join(" ")}</div> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {metric(id ? "Batas maksimum modul seri" : "Maximum modules in series", `${result.maxSeries} mod`, id ? "Dibatasi oleh tegangan DC dan MPPT." : "Limited by max DC voltage and MPPT.")}
          {metric(id ? "Minimum modul seri" : "Minimum modules in series", `${result.minSeriesByMppt} mod`, id ? "Agar Vmp saat panas tetap di rentang MPPT." : "Keeps hot-condition Vmp within MPPT range.")}
          {metric(id ? "String paralel maksimum per MPPT" : "Maximum parallel strings per MPPT", `${result.maxParallelPerMppt}`, id ? "Batas paling ketat dari arus operasi dan arus hubung singkat." : "Tighter limit from operating and short-circuit current checks.")}
          {metric(id ? "Total string (batas arus)" : "Total strings (current limit)", `${result.totalStrings}`)}
          {metric(id ? "Kapasitas DC teralokasi" : "Allocated module DC capacity", `${result.dcCapacity.toFixed(2)} kWp`, `${result.modulesUsed} / ${moduleCount} ${id ? "modul teralokasi" : "modules allocated"}`)}
          {metric(id ? "Koreksi Voc pada suhu minimum" : "Cold-corrected Voc", `${result.vocCold.toFixed(2)} V`, id ? "Per modul." : "Per module.")}
        </div>
        <div style={{ ...cardStyle, marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>{id ? "Pemeriksaan konfigurasi" : "Configuration check"}</h3>
          <p style={{ margin: "6px 0" }}>{id ? "Rentang jumlah seri yang memenuhi batas" : "Valid series-count range"}: <strong>{result.minSeriesByMppt}–{result.maxSeries} {id ? "modul/string" : "modules/string"}</strong></p>
          <p style={{ margin: "6px 0" }}>{id ? "Konfigurasi string rekomendasi" : "Recommended string configuration"}: <strong>{result.possible ? `${result.stringsNeeded} × ${result.recommendedSeries} ${id ? "modul/string" : "modules/string"}` : (id ? "Tidak ditemukan" : "No valid allocation found")}</strong></p>
          <p style={{ margin: "6px 0" }}>{id ? "Modul teralokasi" : "Modules allocated"}: <strong>{result.modulesUsed} / {moduleCount}</strong></p>
          <p style={{ margin: "6px 0" }}>{id ? "Vmp string saat panas (estimasi)" : "Estimated hot-condition string Vmp"}: <strong>{result.possible ? (result.vmpHot * result.recommendedSeries).toFixed(1) : "—"} V</strong></p>
          <p style={{ margin: "6px 0" }}>{id ? "Voc string saat dingin (estimasi)" : "Estimated cold-condition string Voc"}: <strong>{result.possible ? (result.vocCold * result.recommendedSeries).toFixed(1) : "—"} V</strong></p>
          <p style={{ margin: "6px 0" }}>{id ? "Arus operasi per string" : "Operating current per string"}: <strong>{result.operatingCurrentPerString.toFixed(2)} A</strong></p>
          <p style={{ margin: "6px 0" }}>{id ? "Arus hubung singkat desain per string" : "Design short-circuit current per string"}: <strong>{result.shortCircuitCurrentPerString.toFixed(2)} A</strong></p>
          {result.possible ? <p style={{ color: "#22c55e", fontWeight: 600 }}>{id ? "Alokasi awal memenuhi batas yang dimasukkan. Verifikasi datasheet inverter dan kondisi desain." : "Preliminary allocation meets entered limits. Verify inverter datasheet and design conditions."}</p> : <p style={{ color: "#f87171", fontWeight: 600 }}>{id ? "Tidak ditemukan konfigurasi valid untuk batas input saat ini." : "No valid configuration found for the current input limits."}</p>}
          {result.warnings.length > 0 && <ul style={{ marginBottom: 0, paddingLeft: 20 }}>{result.warnings.map((w, i) => <li key={i} style={{ color: "#fbbf24", marginTop: 5 }}>{w}</li>)}</ul>}
          {result.possible && <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("solarapps:pv-string-config", { detail: {
                moduleCount,
                modulePower: pmax,
                modulesPerString: result.recommendedSeries,
                stringCount: result.stringsNeeded,
                maxDcVoltage: vdcMax,
                mpptMin,
                mpptMax,
                mpptCount,
                maxOperatingCurrent: inputCurrent,
                maxShortCircuitCurrent: shortCircuitCurrentLimit,
                stringVocCold: result.vocCold * result.recommendedSeries,
                stringVmpHot: result.vmpHot * result.recommendedSeries,
                stringImp: imp,
                stringIscDesign: result.shortCircuitCurrentPerString
              }}));
            }}
            style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, border: "1px solid #16a34a", background: "rgba(22,163,74,.14)", color: "var(--text, #f9fafb)", font: "inherit", fontWeight: 600, cursor: "pointer" }}
          >
            {id ? "Kirim konfigurasi ke Inverter Configuration" : "Send configuration to Inverter Configuration"}
          </button>}
        </div>
      </>}
    </section>
    <aside style={{ border: "1px solid #b45309", background: "rgba(180,83,9,.12)", borderRadius: 10, padding: 14, fontSize: 12, lineHeight: 1.6 }}>
      <strong>{id ? "Penting — perhitungan awal" : "Important — preliminary calculation"}</strong><br />
      {id ? "Hasil ini alat bantu screening, bukan persetujuan desain final. Pastikan parameter modul/inverter berasal dari datasheet resmi, verifikasi batas arus tiap konektor/MPPT, suhu desain, aturan lokal, serta standar proyek oleh engineer yang bertanggung jawab. Perhitungan belum membaca otomatis jumlah panel dari PV Layout." : "This is a screening aid, not final design approval. Verify official module/inverter datasheets, per-connector/MPPT current limits, design temperatures, local rules, and project standards with the responsible engineer. Module count is not yet imported automatically from PV Layout."}
    </aside>
  </div>;
}
