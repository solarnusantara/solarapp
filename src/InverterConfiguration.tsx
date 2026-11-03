import { useEffect, useMemo, useState } from "react";

type Props = { lang?: "id" | "en" };

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--border, #374151)", background: "var(--input-bg, #111827)",
  color: "var(--text, #f9fafb)", font: "inherit"
};
const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border, #374151)", borderRadius: 12, padding: 16,
  background: "var(--panel, #111827)", minWidth: 0
};

export default function InverterConfiguration({ lang = "id" }: Props) {
  const id = lang === "id";
  const [moduleCount, setModuleCount] = useState(32);
  const [modulePower, setModulePower] = useState(580);
  const [modulesPerString, setModulesPerString] = useState(16);
  const [stringCount, setStringCount] = useState(2);
  const [inverterAcPower, setInverterAcPower] = useState(15000);
  const [maxDcVoltage, setMaxDcVoltage] = useState(1100);
  const [mpptMin, setMpptMin] = useState(200);
  const [mpptMax, setMpptMax] = useState(1000);
  const [mpptCount, setMpptCount] = useState(2);
  const [maxOperatingCurrent, setMaxOperatingCurrent] = useState(30);
  const [maxShortCircuitCurrent, setMaxShortCircuitCurrent] = useState(30);
  const [stringVocCold, setStringVocCold] = useState(863.4);
  const [stringVmpHot, setStringVmpHot] = useState(582.7);
  const [stringImp, setStringImp] = useState(13.78);
  const [stringIscDesign, setStringIscDesign] = useState(17.88);
  const [dcAcMin, setDcAcMin] = useState(0.8);
  const [dcAcMax, setDcAcMax] = useState(1.5);
  // Jumlah string yang terhubung ke tiap MPPT, misalnya "1,1".
  const [mpptAllocation, setMpptAllocation] = useState("1,1");

  // Receive a validated preliminary configuration from PV String Calculator.
  useEffect(() => {
    const handlePvStringConfig = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, number>>).detail;
      if (!detail) return;
      if (Number.isFinite(detail.moduleCount) && detail.moduleCount > 0) setModuleCount(detail.moduleCount);
      if (Number.isFinite(detail.modulePower) && detail.modulePower > 0) setModulePower(detail.modulePower);
      if (Number.isFinite(detail.modulesPerString) && detail.modulesPerString > 0) setModulesPerString(detail.modulesPerString);
      if (Number.isFinite(detail.stringCount) && detail.stringCount > 0) setStringCount(detail.stringCount);
      if (Number.isFinite(detail.maxDcVoltage) && detail.maxDcVoltage > 0) setMaxDcVoltage(detail.maxDcVoltage);
      if (Number.isFinite(detail.mpptMin) && detail.mpptMin >= 0) setMpptMin(detail.mpptMin);
      if (Number.isFinite(detail.mpptMax) && detail.mpptMax > 0) setMpptMax(detail.mpptMax);
      if (Number.isFinite(detail.maxOperatingCurrent) && detail.maxOperatingCurrent > 0) setMaxOperatingCurrent(detail.maxOperatingCurrent);
      if (Number.isFinite(detail.maxShortCircuitCurrent) && detail.maxShortCircuitCurrent > 0) setMaxShortCircuitCurrent(detail.maxShortCircuitCurrent);
      if (Number.isFinite(detail.stringVocCold) && detail.stringVocCold > 0) setStringVocCold(detail.stringVocCold);
      if (Number.isFinite(detail.stringVmpHot) && detail.stringVmpHot > 0) setStringVmpHot(detail.stringVmpHot);
      if (Number.isFinite(detail.stringImp) && detail.stringImp > 0) setStringImp(detail.stringImp);
      if (Number.isFinite(detail.stringIscDesign) && detail.stringIscDesign > 0) setStringIscDesign(detail.stringIscDesign);
      if (Number.isFinite(detail.mpptCount) && detail.mpptCount > 0) {
        setMpptCount(detail.mpptCount);
        setMpptAllocation(Array.from({ length: Math.floor(detail.mpptCount) }, (_, i) => i < detail.stringCount ? 1 : 0).join(","));
      }
    };
    window.addEventListener("solarapps:pv-string-config", handlePvStringConfig);
    return () => window.removeEventListener("solarapps:pv-string-config", handlePvStringConfig);
  }, []);

  const result = useMemo(() => {
    const numeric = [moduleCount, modulePower, modulesPerString, stringCount, inverterAcPower, maxDcVoltage,
      mpptMin, mpptMax, mpptCount, maxOperatingCurrent, maxShortCircuitCurrent, stringVocCold,
      stringVmpHot, stringImp, stringIscDesign, dcAcMin, dcAcMax];
    const valid = numeric.every(Number.isFinite) && moduleCount > 0 && modulePower > 0 &&
      modulesPerString > 0 && stringCount > 0 && inverterAcPower > 0 && maxDcVoltage > 0 &&
      mpptMin >= 0 && mpptMax > mpptMin && mpptCount > 0 && maxOperatingCurrent > 0 &&
      maxShortCircuitCurrent > 0 && stringVocCold > 0 && stringVmpHot > 0 && stringImp > 0 &&
      stringIscDesign > 0 && dcAcMin >= 0 && dcAcMax >= dcAcMin;
    if (!valid) return { valid: false as const, errors: [id ? "Periksa input: gunakan angka positif dan rentang MPPT serta rasio DC/AC yang valid." : "Check inputs: use positive values and valid MPPT and DC/AC ratio ranges."] };

    const allocations = mpptAllocation.split(",").map(v => v.trim()).map(v => v === "" ? NaN : Number(v));
    const allocationInputOk = allocations.length === mpptCount && allocations.every(n => Number.isInteger(n) && n >= 0);
    const allocatedStrings = allocationInputOk ? allocations.reduce((a, b) => a + b, 0) : NaN;
    const allocationSumOk = allocationInputOk && allocatedStrings === stringCount;
    const dcPowerKw = moduleCount * modulePower / 1000;
    const dcAcRatio = dcPowerKw / (inverterAcPower / 1000);
    const modulesAllocated = modulesPerString * stringCount;
    const voltageOk = stringVocCold < maxDcVoltage && stringVmpHot >= mpptMin && stringVmpHot <= mpptMax;
    const mpptRows = allocationInputOk ? allocations.map((strings, i) => ({
      index: i + 1, strings,
      operatingCurrent: strings * stringImp,
      shortCircuitCurrent: strings * stringIscDesign,
      currentOk: strings * stringImp <= maxOperatingCurrent,
      shortCircuitOk: strings * stringIscDesign <= maxShortCircuitCurrent
    })) : [];
    const currentOk = allocationSumOk && mpptRows.every(row => row.currentOk && row.shortCircuitOk);
    const allocationOk = modulesAllocated === moduleCount;
    const ratioOk = dcAcRatio >= dcAcMin && dcAcRatio <= dcAcMax;
    const warnings: string[] = [];
    if (!allocationOk) warnings.push(id ? `Alokasi ${modulesAllocated} modul berbeda dari jumlah tersedia ${moduleCount}.` : `Allocated modules (${modulesAllocated}) do not equal available modules (${moduleCount}).`);
    if (!voltageOk) warnings.push(id ? "Tegangan string tidak memenuhi batas DC/MPPT yang dimasukkan." : "String voltage does not meet the entered DC/MPPT limits.");
    if (!allocationInputOk) warnings.push(id ? `Masukkan tepat ${mpptCount} angka bulat dipisahkan koma, misalnya 1,1.` : `Enter exactly ${mpptCount} comma-separated integers, e.g. 1,1.`);
    else if (!allocationSumOk) warnings.push(id ? `Jumlah alokasi (${allocatedStrings}) harus sama dengan jumlah string (${stringCount}).` : `Allocation sum (${allocatedStrings}) must equal string count (${stringCount}).`);
    if (allocationInputOk) mpptRows.forEach(row => {
      if (!row.currentOk) warnings.push(id ? `MPPT ${row.index}: arus operasi ${row.operatingCurrent.toFixed(2)} A melebihi batas ${maxOperatingCurrent} A.` : `MPPT ${row.index}: operating current ${row.operatingCurrent.toFixed(2)} A exceeds ${maxOperatingCurrent} A.`);
      if (!row.shortCircuitOk) warnings.push(id ? `MPPT ${row.index}: Isc desain ${row.shortCircuitCurrent.toFixed(2)} A melebihi batas ${maxShortCircuitCurrent} A.` : `MPPT ${row.index}: design Isc ${row.shortCircuitCurrent.toFixed(2)} A exceeds ${maxShortCircuitCurrent} A.`);
    });
    if (!ratioOk) warnings.push(id ? "Rasio DC/AC berada di luar rentang target yang dimasukkan." : "DC/AC ratio is outside the entered target range.");
    return { valid: true as const, dcPowerKw, dcAcRatio, modulesAllocated, allocationInputOk, allocatedStrings, allocationSumOk, mpptRows, voltageOk, currentOk, allocationOk, ratioOk, warnings };
  }, [id, moduleCount, modulePower, modulesPerString, stringCount, inverterAcPower, maxDcVoltage, mpptMin, mpptMax, mpptCount, maxOperatingCurrent, maxShortCircuitCurrent, stringVocCold, stringVmpHot, stringImp, stringIscDesign, dcAcMin, dcAcMax, mpptAllocation]);

  const field = (label: string, value: number, set: (n: number) => void, hint?: string, step = "any") => (
    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #9ca3af)" }}>
      <span>{label}</span><input style={inputStyle} type="number" min="0" step={step} value={value} onChange={e => set(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
  const metric = (label: string, value: string, note?: string) => (
    <div style={cardStyle}><div style={{ fontSize: 12, color: "var(--muted, #9ca3af)" }}>{label}</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 7, overflowWrap: "anywhere" }}>{value}</div>{note && <div style={{ fontSize: 12, color: "var(--muted, #9ca3af)", marginTop: 5 }}>{note}</div>}</div>
  );

  return <div style={{ display: "grid", gap: 18, color: "var(--text, #f9fafb)" }}>
    <header>
      <div style={{ fontSize: 12, letterSpacing: 1.2, color: "var(--muted, #9ca3af)", textTransform: "uppercase" }}>Electrical Design · Stage 2</div>
      <h2 style={{ margin: "6px 0", fontSize: 26 }}>{id ? "Konfigurasi Inverter" : "Inverter Configuration"}</h2>
      <p style={{ margin: 0, color: "var(--muted, #9ca3af)", lineHeight: 1.5 }}>{id ? "Periksa rasio DC/AC, alokasi string ke MPPT, serta batas tegangan dan arus." : "Check DC/AC ratio, string allocation to MPPTs, and voltage/current limits."}</p>
    </header>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
      <div style={cardStyle}><h3 style={{ marginTop: 0 }}>{id ? "1. Konfigurasi array PV" : "1. PV array configuration"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {field(id ? "Jumlah modul" : "Module count", moduleCount, setModuleCount, undefined, "1")}
          {field(id ? "Daya modul (Wp)" : "Module power (Wp)", modulePower, setModulePower)}
          {field(id ? "Modul per string" : "Modules per string", modulesPerString, setModulesPerString, undefined, "1")}
          {field(id ? "Jumlah string" : "String count", stringCount, setStringCount, undefined, "1")}
          {field(id ? "Voc string terkoreksi dingin (V)" : "Cold-corrected string Voc (V)", stringVocCold, setStringVocCold)}
          {field(id ? "Vmp string saat panas (V)" : "Hot-condition string Vmp (V)", stringVmpHot, setStringVmpHot)}
          {field(id ? "Imp per string (A)" : "Imp per string (A)", stringImp, setStringImp)}
          {field(id ? "Isc desain per string (A)" : "Design Isc per string (A)", stringIscDesign, setStringIscDesign)}
        </div>
      </div>
      <div style={cardStyle}><h3 style={{ marginTop: 0 }}>{id ? "2. Batas inverter" : "2. Inverter limits"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {field(id ? "Daya AC nominal inverter (W)" : "Inverter nominal AC power (W)", inverterAcPower, setInverterAcPower)}
          {field(id ? "Tegangan DC maksimum (V)" : "Max DC voltage (V)", maxDcVoltage, setMaxDcVoltage)}
          {field("MPPT minimum (V)", mpptMin, setMpptMin)}
          {field(id ? "MPPT maksimum (V)" : "MPPT maximum (V)", mpptMax, setMpptMax)}
          {field(id ? "Jumlah MPPT" : "Number of MPPTs", mpptCount, setMpptCount, undefined, "1")}
          {field(id ? "Arus operasi maksimum per MPPT (A)" : "Max operating current per MPPT (A)", maxOperatingCurrent, setMaxOperatingCurrent)}
          {field(id ? "Arus hubung singkat maksimum per MPPT (A)" : "Max short-circuit current per MPPT (A)", maxShortCircuitCurrent, setMaxShortCircuitCurrent)}
          {field(id ? "Rasio DC/AC minimum" : "Minimum DC/AC ratio", dcAcMin, setDcAcMin)}
          {field(id ? "Rasio DC/AC maksimum" : "Maximum DC/AC ratio", dcAcMax, setDcAcMax)}
        </div>
      </div>
    </section>

    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>{id ? "3. Alokasi string per MPPT" : "3. String allocation per MPPT"}</h3>
      <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #9ca3af)" }}>
        <span>{id ? `Masukkan ${mpptCount} angka dipisahkan koma (contoh: 1,1)` : `Enter ${mpptCount} comma-separated numbers (example: 1,1)`}</span>
        <input style={inputStyle} value={mpptAllocation} onChange={e => setMpptAllocation(e.target.value)} placeholder="1,1" />
      </label>
      <p style={{ color: "var(--muted, #9ca3af)", fontSize: 12, marginBottom: 0 }}>{id ? "Urutan angka mewakili MPPT 1, MPPT 2, dan seterusnya. Total alokasi harus sama dengan jumlah string." : "Numbers map to MPPT 1, MPPT 2, etc. Total allocation must equal string count."}</p>
    </section>

    <section><h3>{id ? "Hasil pemeriksaan awal" : "Preliminary check results"}</h3>
      {!result.valid ? <div style={{ ...cardStyle, borderColor: "#ef4444" }}>{result.errors.join(" ")}</div> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {metric(id ? "Kapasitas DC array" : "Array DC capacity", `${result.dcPowerKw.toFixed(2)} kWp`)}
          {metric(id ? "Rasio DC/AC" : "DC/AC ratio", `${result.dcAcRatio.toFixed(2)} : 1`)}
          {metric(id ? "Modul dialokasikan" : "Modules allocated", `${result.modulesAllocated} / ${moduleCount}`)}

        </div>
        <div style={{ ...cardStyle, marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>{id ? "Hasil per MPPT" : "Per-MPPT results"}</h3>
          {!result.allocationInputOk ? <p style={{ color: "#fbbf24" }}>{id ? `Masukkan tepat ${mpptCount} bilangan bulat dipisahkan koma.` : `Enter exactly ${mpptCount} comma-separated integers.`}</p> : <>
            {result.mpptRows.map(row => <div key={row.index} style={{ border: "1px solid var(--border, #374151)", borderRadius: 10, padding: 12, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong>MPPT {row.index} · {row.strings} {id ? "string" : "strings"}</strong>
                <strong style={{ color: row.currentOk && row.shortCircuitOk ? "#22c55e" : "#f87171" }}>{row.currentOk && row.shortCircuitOk ? (id ? "Memenuhi input" : "Within entered limits") : (id ? "Melebihi batas" : "Exceeds limits")}</strong>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 10 }}>
                {metric(id ? "Arus operasi" : "Operating current", `${row.operatingCurrent.toFixed(2)} A`, `${id ? "Batas" : "Limit"} ${maxOperatingCurrent} A`)}
                {metric("Isc desain", `${row.shortCircuitCurrent.toFixed(2)} A`, `${id ? "Batas" : "Limit"} ${maxShortCircuitCurrent} A`)}
              </div>
            </div>)}
            <p style={{ color: result.allocationSumOk ? "#22c55e" : "#f87171", fontWeight: 600 }}>{result.allocationSumOk ? (id ? "Jumlah alokasi string sesuai." : "String allocation total matches.") : (id ? `Jumlah alokasi ${result.allocatedStrings} tidak sama dengan ${stringCount} string.` : `Allocated total ${result.allocatedStrings} does not equal ${stringCount} strings.`)}</p>
          </>}
        </div>
        <div style={{ ...cardStyle, marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>{id ? "Status validasi" : "Validation status"}</h3>
          {([
            [id ? "Alokasi modul" : "Module allocation", result.allocationOk],
            [id ? "Batas tegangan" : "Voltage limits", result.voltageOk],
            [id ? "Batas arus dan pembagian MPPT" : "Current limits and MPPT distribution", result.currentOk],
            [id ? "Rasio DC/AC" : "DC/AC ratio", result.ratioOk]
          ] as const).map(([label, ok]) => <p key={String(label)} style={{ margin: "8px 0", color: ok ? "#22c55e" : "#f87171" }}><strong>{ok ? "✓" : "✕"} {label}</strong></p>)}
          {result.warnings.length > 0 ? <ul style={{ marginBottom: 0, paddingLeft: 20 }}>{result.warnings.map((w, i) => <li key={i} style={{ color: "#fbbf24", marginTop: 5 }}>{w}</li>)}</ul> : <p style={{ color: "#22c55e", fontWeight: 600 }}>{id ? "Semua pemeriksaan awal memenuhi nilai input." : "All preliminary checks meet the entered values."}</p>}
        </div>
      </>}
    </section>
    <aside style={{ border: "1px solid #b45309", background: "rgba(180,83,9,.12)", borderRadius: 10, padding: 14, fontSize: 12, lineHeight: 1.6 }}>
      <strong>{id ? "Penting — pemeriksaan awal" : "Important — preliminary screening"}</strong><br />
      {id ? "Masukkan nilai dari datasheet resmi. Alokasi string dan arus diperiksa per MPPT berdasarkan input distribusi. Cocokkan semua batas dengan datasheet resmi. Pastikan batas arus operasi, Isc maksimum, rentang MPPT, serta rasio DC/AC sesuai produsen dan standar proyek. Bukan persetujuan desain final." : "Use official datasheet values. Strings-per-MPPT currently assumes even distribution; for uneven allocation, verify each MPPT separately. Confirm operating current, maximum Isc, MPPT range, and DC/AC ratio against manufacturer data and project standards. Not final design approval."}
    </aside>
  </div>;
}
