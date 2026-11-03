import { useMemo, useState } from "react";

type Lang = "id" | "en";
type Mode = "dc" | "ac";

const sizes = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400];
const style: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--border, #374151)", background: "var(--input-bg, #111827)",
  color: "var(--text, #f9fafb)", font: "inherit"
};
const card: React.CSSProperties = {
  border: "1px solid var(--border, #374151)", borderRadius: 12, padding: 16,
  background: "var(--panel, #111827)", minWidth: 0
};

export default function CableSizing({ lang = "id" }: { lang?: Lang }) {
  const id = lang === "id";
  const [mode, setMode] = useState<Mode>("dc");
  const [powerKw, setPowerKw] = useState(18.56);
  const [voltage, setVoltage] = useState(800);
  const [current, setCurrent] = useState(27.56);
  const [length, setLength] = useState(30);
  const [material, setMaterial] = useState<"cu" | "al">("cu");
  const [pf, setPf] = useState(0.9);
  const [efficiency, setEfficiency] = useState(0.98);
  const [phaseVoltage, setPhaseVoltage] = useState(400);
  const [phase, setPhase] = useState<"1" | "3">("3");
  const [designFactor, setDesignFactor] = useState(1.25);
  const [ampacity, setAmpacity] = useState(40);
  const [maxDrop, setMaxDrop] = useState(1.5);
  const [ambientFactor, setAmbientFactor] = useState(1);
  const [groupingFactor, setGroupingFactor] = useState(1);

  const result = useMemo(() => {
    const nums = [powerKw, voltage, current, length, pf, efficiency, phaseVoltage, designFactor, ampacity, maxDrop, ambientFactor, groupingFactor];
    const valid = nums.every(Number.isFinite) && powerKw > 0 && voltage > 0 && current > 0 &&
      length >= 0 && pf > 0 && pf <= 1 && efficiency > 0 && efficiency <= 1 &&
      phaseVoltage > 0 && designFactor >= 1 && ampacity > 0 && maxDrop > 0 &&
      ambientFactor > 0 && ambientFactor <= 1 && groupingFactor > 0 && groupingFactor <= 1;
    if (!valid) return { valid: false as const };
    const rho = material === "cu" ? 0.0175 : 0.0282; // ohm·mm²/m, approximate at 20°C
    const calculatedCurrent = mode === "dc"
      ? current
      : (phase === "3"
        ? powerKw * 1000 / (Math.sqrt(3) * phaseVoltage * pf * efficiency)
        : powerKw * 1000 / (phaseVoltage * pf * efficiency));
    const designCurrent = calculatedCurrent * designFactor;
    const correctedAmpacityRequired = designCurrent / (ambientFactor * groupingFactor);
    const rows = sizes.map(size => {
      // AC three-phase estimate ignores cable reactance; DC and single-phase use two conductors.
      const dropV = mode === "ac" && phase === "3"
        ? Math.sqrt(3) * length * calculatedCurrent * rho / size * pf
        : 2 * length * calculatedCurrent * rho / size;
      const dropPct = dropV / (mode === "dc" ? voltage : phaseVoltage) * 100;
      const ampacityPass = ampacity * ambientFactor * groupingFactor >= designCurrent && size >= 1.5;
      return { size, dropV, dropPct, ampacityPass, dropPass: dropPct <= maxDrop, pass: ampacityPass && dropPct <= maxDrop };
    });
    const recommended = rows.find(r => r.pass);
    const dropOnly = rows.find(r => r.dropPass);
    return { valid: true as const, calculatedCurrent, designCurrent, correctedAmpacityRequired, rows, recommended, dropOnly, rho };
  }, [mode, powerKw, voltage, current, length, material, pf, efficiency, phaseVoltage, phase, designFactor, ampacity, maxDrop, ambientFactor, groupingFactor]);

  const field = (label: string, value: number, set: (v: number) => void, step = "any", hint?: string) => (
    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #9ca3af)" }}>
      <span>{label}</span>
      <input style={style} type="number" min="0" step={step} value={value} onChange={e => set(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
  const metric = (label: string, value: string, note?: string) => (
    <div style={card}><div style={{ fontSize: 12, color: "var(--muted, #9ca3af)" }}>{label}</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 7, overflowWrap: "anywhere" }}>{value}</div>{note && <div style={{ fontSize: 12, color: "var(--muted, #9ca3af)", marginTop: 5 }}>{note}</div>}</div>
  );

  return <div style={{ display: "grid", gap: 18, color: "var(--text, #f9fafb)" }}>
    <header>
      <div style={{ fontSize: 12, letterSpacing: 1.2, color: "var(--muted, #9ca3af)", textTransform: "uppercase" }}>Electrical Design · Stage 3</div>
      <h2 style={{ margin: "6px 0", fontSize: 26 }}>{id ? "Cable Sizing" : "Cable Sizing"}</h2>
      <p style={{ margin: 0, color: "var(--muted, #9ca3af)", lineHeight: 1.5 }}>{id ? "Estimasi awal ukuran kabel DC/AC berdasarkan arus, ampacity yang dimasukkan, dan batas voltage drop." : "Preliminary DC/AC cable sizing from current, entered ampacity, and voltage-drop limit."}</p>
    </header>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button onClick={() => setMode("dc")} style={{ ...style, width: "auto", cursor: "pointer", borderColor: mode === "dc" ? "#22c55e" : undefined, background: mode === "dc" ? "rgba(34,197,94,.12)" : undefined }}>{id ? "Kabel DC (String → Inverter)" : "DC cable (String → Inverter)"}</button>
      <button onClick={() => setMode("ac")} style={{ ...style, width: "auto", cursor: "pointer", borderColor: mode === "ac" ? "#22c55e" : undefined, background: mode === "ac" ? "rgba(34,197,94,.12)" : undefined }}>{id ? "Kabel AC (Inverter → Panel)" : "AC cable (Inverter → Panel)"}</button>
    </div>
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>{id ? "1. Parameter rangkaian" : "1. Circuit parameters"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {mode === "dc" ? <>
            {field(id ? "Tegangan DC string (V)" : "DC string voltage (V)", voltage, setVoltage)}
            {field(id ? "Arus desain string / rangkaian (A)" : "String / circuit current (A)", current, setCurrent)}
          </> : <>
            {field(id ? "Daya AC (kW)" : "AC power (kW)", powerKw, setPowerKw)}
            {field(id ? "Tegangan AC (V)" : "AC voltage (V)", phaseVoltage, setPhaseVoltage)}
            <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #9ca3af)" }}>
              <span>{id ? "Fasa" : "Phase"}</span>
              <select style={style} value={phase} onChange={e => setPhase(e.target.value as "1" | "3")}><option value="3">{id ? "3 fasa" : "3 phase"}</option><option value="1">{id ? "1 fasa" : "1 phase"}</option></select>
            </label>
            {field(id ? "Faktor daya (PF)" : "Power factor (PF)", pf, setPf, "0.01")}
            {field(id ? "Efisiensi inverter" : "Inverter efficiency", efficiency, setEfficiency, "0.01")}
          </>}
          {field(id ? "Panjang kabel satu arah (m)" : "One-way cable length (m)", length, setLength)}
          {field(id ? "Faktor desain arus" : "Current design factor", designFactor, setDesignFactor, "0.05")}
        </div>
      </div>
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>{id ? "2. Kondisi kabel" : "2. Cable conditions"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #9ca3af)" }}><span>{id ? "Material konduktor" : "Conductor material"}</span><select style={style} value={material} onChange={e => setMaterial(e.target.value as "cu" | "al")}><option value="cu">Copper (Cu)</option><option value="al">Aluminium (Al)</option></select></label>
          {field(id ? "Ampacity kabel terpilih (A)" : "Selected cable ampacity (A)", ampacity, setAmpacity, "any", id ? "Masukkan ampacity dari tabel standar untuk kondisi instalasi." : "Enter tabulated ampacity for the installation conditions.")}
          {field(id ? "Batas voltage drop (%)" : "Voltage-drop limit (%)", maxDrop, setMaxDrop, "0.1")}
          {field(id ? "Faktor koreksi suhu (0–1)" : "Temperature correction factor (0–1)", ambientFactor, setAmbientFactor, "0.01")}
          {field(id ? "Faktor pengelompokan (0–1)" : "Grouping factor (0–1)", groupingFactor, setGroupingFactor, "0.01")}
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--muted, #9ca3af)" }}>{id ? "Ampacity tabel harus sesuai jenis isolasi, metode pemasangan, suhu, pengelompokan, dan standar proyek. Nilai faktor koreksi diterapkan pada ampacity yang dimasukkan." : "Tabulated ampacity must match insulation, installation method, temperature, grouping, and project standards. Correction factors are applied to the entered ampacity."}</p>
      </div>
    </section>
    <section>
      <h3>{id ? "Hasil perhitungan awal" : "Preliminary results"}</h3>
      {!result.valid ? <div style={{ ...card, borderColor: "#ef4444" }}>{id ? "Periksa input: gunakan nilai positif, PF/efisiensi 0–1, dan faktor koreksi 0–1." : "Check inputs: use positive values, PF/efficiency 0–1, and correction factors 0–1."}</div> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {metric(id ? "Arus hitung" : "Calculated current", `${result.calculatedCurrent.toFixed(2)} A`)}
          {metric(id ? "Arus desain" : "Design current", `${result.designCurrent.toFixed(2)} A`, `× ${designFactor}`)}
          {metric(id ? "Ampacity tabel minimum indikatif" : "Indicative minimum tabulated ampacity", `${result.correctedAmpacityRequired.toFixed(2)} A`, id ? "Sebelum pemilihan luas penampang." : "Before selecting conductor size.")}
          {metric(id ? "Rekomendasi awal" : "Preliminary recommendation", result.recommended ? `${result.recommended.size} mm²` : (id ? "Tidak ditemukan" : "No match"), result.recommended ? `${result.recommended.dropV.toFixed(2)} V · ${result.recommended.dropPct.toFixed(2)}% drop` : undefined)}
        </div>
        <div style={{ ...card, marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>{id ? "Perbandingan luas penampang" : "Conductor size comparison"}</h3>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{[id ? "Ukuran" : "Size", id ? "Drop (V)" : "Drop (V)", id ? "Drop (%)" : "Drop (%)", id ? "Ampacity" : "Ampacity", id ? "Hasil" : "Result"].map(x => <th key={x} style={{ textAlign: "left", padding: 9, borderBottom: "1px solid var(--border, #374151)" }}>{x}</th>)}</tr></thead>
            <tbody>{result.rows.filter(r => r.size >= (result.recommended ? Math.max(1.5, result.recommended.size / 2) : 1.5)).map(r => <tr key={r.size} style={{ background: result.recommended?.size === r.size ? "rgba(34,197,94,.10)" : undefined }}>
              <td style={{ padding: 9, borderBottom: "1px solid var(--border, #374151)" }}>{r.size} mm²</td>
              <td style={{ padding: 9, borderBottom: "1px solid var(--border, #374151)" }}>{r.dropV.toFixed(2)}</td>
              <td style={{ padding: 9, borderBottom: "1px solid var(--border, #374151)" }}>{r.dropPct.toFixed(2)}%</td>
              <td style={{ padding: 9, borderBottom: "1px solid var(--border, #374151)", color: r.ampacityPass ? "#22c55e" : "#f87171" }}>{r.ampacityPass ? (id ? "Lolos" : "Pass") : (id ? "Gagal" : "Fail")}</td>
              <td style={{ padding: 9, borderBottom: "1px solid var(--border, #374151)", color: r.pass ? "#22c55e" : "#f87171" }}>{r.pass ? (id ? "Memenuhi" : "Pass") : (id ? "Tidak memenuhi" : "Fail")}</td>
            </tr>)}</tbody>
          </table></div>
          {!result.recommended && <p style={{ color: "#fbbf24" }}>{id ? "Tidak ada ukuran pada daftar awal yang memenuhi kedua pemeriksaan. Naikkan data ampacity tabel atau evaluasi parameter instalasi." : "No listed size meets both checks. Review tabulated ampacity or installation parameters."}</p>}
        </div>
      </>}
    </section>
    <aside style={{ border: "1px solid #b45309", background: "rgba(180,83,9,.12)", borderRadius: 10, padding: 14, fontSize: 12, lineHeight: 1.6 }}>
      <strong>{id ? "Penting — estimasi awal, bukan desain final" : "Important — preliminary estimate, not final design"}</strong><br />
      {id ? "Model voltage drop menggunakan resistivitas pendekatan konduktor pada 20°C; perhitungan AC tiga fasa mengabaikan reaktansi. Ampacity tidak diambil otomatis dari standar, melainkan diinput pengguna. Verifikasi standar yang berlaku, jenis kabel, isolasi, metode instalasi, temperatur, grouping, harmonisa, proteksi, terminal, dan persyaratan proyek oleh engineer yang bertanggung jawab." : "Voltage-drop uses approximate conductor resistivity at 20°C; three-phase AC calculation omits reactance. Ampacity is user-entered, not automatically sourced from a standard. Verify applicable standards, cable type/insulation, installation method, temperature, grouping, harmonics, protection, terminals, and project requirements with the responsible engineer."}
    </aside>
  </div>;
}
