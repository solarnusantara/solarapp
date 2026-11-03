import { useMemo, useState } from "react";

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
export default function ProtectionGrounding({ lang = "id" }: Props) {
  const id = lang === "id";
  const [dcVoc, setDcVoc] = useState(863.4);
  const [dcIscString, setDcIscString] = useState(14.3);
  const [parallelStrings, setParallelStrings] = useState(1);
  const [inverterPower, setInverterPower] = useState(15000);
  const [acVoltage, setAcVoltage] = useState(400);
  const [phases, setPhases] = useState<1 | 3>(3);
  const [powerFactor, setPowerFactor] = useState(0.99);
  const [designFactor, setDesignFactor] = useState(1.25);
  const [breakerRating, setBreakerRating] = useState(32);
  const [breakingCapacity, setBreakingCapacity] = useState(10);
  const [prospectiveFaultCurrent, setProspectiveFaultCurrent] = useState(6);
  const [dcIsolatorVoltage, setDcIsolatorVoltage] = useState(1000);
  const [dcIsolatorCurrent, setDcIsolatorCurrent] = useState(32);
  const [peConductor, setPeConductor] = useState(6);
  const [spdDc, setSpdDc] = useState(true);
  const [spdAc, setSpdAc] = useState(true);

  const result = useMemo(() => {
    const nums = [dcVoc, dcIscString, parallelStrings, inverterPower, acVoltage, phases, powerFactor,
      designFactor, breakerRating, breakingCapacity, prospectiveFaultCurrent, dcIsolatorVoltage,
      dcIsolatorCurrent, peConductor];
    const valid = nums.every(Number.isFinite) && dcVoc > 0 && dcIscString > 0 &&
      Number.isInteger(parallelStrings) && parallelStrings > 0 && inverterPower > 0 &&
      acVoltage > 0 && (phases === 1 || phases === 3) && powerFactor > 0 && powerFactor <= 1 &&
      designFactor >= 1 && breakerRating > 0 && breakingCapacity > 0 &&
      prospectiveFaultCurrent >= 0 && dcIsolatorVoltage > 0 && dcIsolatorCurrent > 0 && peConductor > 0;
    if (!valid) return { valid: false as const, errors: [id ? "Periksa input. Gunakan nilai positif, jumlah string bulat, PF 0–1, dan faktor desain ≥ 1." : "Check inputs. Use positive values, integer string count, PF 0–1, and design factor ≥ 1."] };
    const dcDesignCurrent = dcIscString * parallelStrings * designFactor;
    const acCurrent = inverterPower / (phases === 3 ? Math.sqrt(3) * acVoltage * powerFactor : acVoltage * powerFactor);
    const acDesignCurrent = acCurrent * designFactor;
    const dcVoltageOk = dcIsolatorVoltage >= dcVoc;
    const dcCurrentOk = dcIsolatorCurrent >= dcDesignCurrent;
    const breakerCurrentOk = breakerRating >= acDesignCurrent;
    const breakingOk = breakingCapacity >= prospectiveFaultCurrent;
    const warnings: string[] = [];
    if (!dcVoltageOk) warnings.push(id ? "Rating tegangan DC isolator lebih rendah dari Voc string desain." : "DC isolator voltage rating is below design string Voc.");
    if (!dcCurrentOk) warnings.push(id ? "Rating arus DC isolator lebih rendah dari arus desain yang dihitung." : "DC isolator current rating is below calculated design current.");
    if (!breakerCurrentOk) warnings.push(id ? "Rating breaker AC lebih rendah dari estimasi arus desain inverter." : "AC breaker rating is below estimated inverter design current.");
    if (!breakingOk) warnings.push(id ? "Kapasitas pemutusan breaker lebih rendah dari arus gangguan prospektif yang dimasukkan." : "Breaker breaking capacity is below the entered prospective fault current.");
    if (!spdDc || !spdAc) warnings.push(id ? "Periksa kebutuhan SPD DC/AC melalui kajian risiko petir, sistem proteksi eksternal, dan standar proyek." : "Verify DC/AC SPD needs against lightning risk, external LPS, and project standards.");
    return { valid: true, dcDesignCurrent, acCurrent, acDesignCurrent, dcVoltageOk, dcCurrentOk,
      breakerCurrentOk, breakingOk, warnings };
  }, [id, dcVoc, dcIscString, parallelStrings, inverterPower, acVoltage, phases, powerFactor, designFactor,
      breakerRating, breakingCapacity, prospectiveFaultCurrent, dcIsolatorVoltage, dcIsolatorCurrent, peConductor, spdDc, spdAc]);

  const field = (label: string, value: number, set: (v: number) => void, step = "any") => (
    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #9ca3af)" }}>
      <span>{label}</span><input style={inputStyle} type="number" min="0" step={step} value={value} onChange={e => set(Number(e.target.value))} />
    </label>
  );
  const metric = (label: string, value: string, note?: string) => (
    <div style={cardStyle}><div style={{ fontSize: 12, color: "var(--muted, #9ca3af)" }}>{label}</div><div style={{ fontSize: 23, fontWeight: 700, marginTop: 7 }}>{value}</div>{note && <div style={{ fontSize: 12, color: "var(--muted, #9ca3af)", marginTop: 5 }}>{note}</div>}</div>
  );
  const status = (label: string, ok: boolean) => <p key={label} style={{ color: ok ? "#22c55e" : "#f87171", margin: "8px 0" }}><strong>{ok ? "✓" : "✕"} {label}</strong></p>;

  return <div style={{ display: "grid", gap: 18, color: "var(--text, #f9fafb)" }}>
    <header>
      <div style={{ fontSize: 12, letterSpacing: 1.2, color: "var(--muted, #9ca3af)", textTransform: "uppercase" }}>Electrical Design · Stage 4</div>
      <h2 style={{ margin: "6px 0", fontSize: 26 }}>{id ? "Proteksi & Grounding" : "Protection & Grounding"}</h2>
      <p style={{ margin: 0, color: "var(--muted, #9ca3af)", lineHeight: 1.5 }}>{id ? "Pemeriksaan awal rating perangkat proteksi DC/AC dan checklist grounding/SPD." : "Preliminary DC/AC protection rating checks and grounding/SPD checklist."}</p>
    </header>
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
      <div style={cardStyle}><h3 style={{ marginTop: 0 }}>{id ? "1. Parameter DC" : "1. DC parameters"}</h3><div style={{ display: "grid", gap: 12 }}>
        {field(id ? "Voc string desain (V)" : "Design string Voc (V)", dcVoc, setDcVoc)}
        {field(id ? "Isc per string (A)" : "Isc per string (A)", dcIscString, setDcIscString)}
        {field(id ? "String paralel pada input yang diperiksa" : "Parallel strings on checked input", parallelStrings, setParallelStrings, "1")}
        {field(id ? "Faktor desain arus" : "Current design factor", designFactor, setDesignFactor, "0.05")}
        {field(id ? "Rating tegangan DC isolator (V)" : "DC isolator voltage rating (V)", dcIsolatorVoltage, setDcIsolatorVoltage)}
        {field(id ? "Rating arus DC isolator (A)" : "DC isolator current rating (A)", dcIsolatorCurrent, setDcIsolatorCurrent)}
      </div></div>
      <div style={cardStyle}><h3 style={{ marginTop: 0 }}>{id ? "2. Parameter AC" : "2. AC parameters"}</h3><div style={{ display: "grid", gap: 12 }}>
        {field(id ? "Daya AC inverter (W)" : "Inverter AC power (W)", inverterPower, setInverterPower)}
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #9ca3af)" }}><span>{id ? "Sistem fasa" : "Phase system"}</span><select style={inputStyle} value={phases} onChange={e => setPhases(Number(e.target.value) as 1 | 3)}><option value={1}>{id ? "1 fasa" : "Single-phase"}</option><option value={3}>{id ? "3 fasa" : "Three-phase"}</option></select></label>
        {field(id ? "Tegangan AC line/phase (V)" : "AC voltage (V)", acVoltage, setAcVoltage)}
        {field(id ? "Power factor (PF)" : "Power factor (PF)", powerFactor, setPowerFactor, "0.01")}
        {field(id ? "Rating breaker AC (A)" : "AC breaker rating (A)", breakerRating, setBreakerRating)}
        {field(id ? "Kapasitas pemutusan breaker (kA)" : "Breaker breaking capacity (kA)", breakingCapacity, setBreakingCapacity)}
        {field(id ? "Arus gangguan prospektif (kA)" : "Prospective fault current (kA)", prospectiveFaultCurrent, setProspectiveFaultCurrent)}
      </div></div>
      <div style={cardStyle}><h3 style={{ marginTop: 0 }}>{id ? "3. Grounding & SPD" : "3. Grounding & SPD"}</h3><div style={{ display: "grid", gap: 12 }}>
        {field(id ? "Penampang konduktor PE (mm²)" : "PE conductor cross-section (mm²)", peConductor, setPeConductor)}
        <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={spdDc} onChange={e => setSpdDc(e.target.checked)} />{id ? "SPD sisi DC direncanakan" : "DC-side SPD planned"}</label>
        <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={spdAc} onChange={e => setSpdAc(e.target.checked)} />{id ? "SPD sisi AC direncanakan" : "AC-side SPD planned"}</label>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--muted, #9ca3af)" }}>{id ? "Penampang PE ditampilkan sebagai input checklist, belum diverifikasi otomatis terhadap metode instalasi, proteksi, dan tabel standar." : "PE size is a checklist input only; it is not automatically verified against installation method, protection, or standards tables."}</p>
      </div></div>
    </section>
    <section style={cardStyle}><h3 style={{ marginTop: 0 }}>{id ? "Hasil pemeriksaan awal" : "Preliminary checks"}</h3>
      {!result.valid ? <p style={{ color: "#f87171" }}>{(result.errors ?? []).join(" ")}</p> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {metric(id ? "Arus desain DC" : "DC design current", `${result.dcDesignCurrent.toFixed(2)} A`, id ? "Isc × string paralel × faktor desain" : "Isc × parallel strings × design factor")}
          {metric(id ? "Arus nominal inverter" : "Inverter nominal current", `${result.acCurrent.toFixed(2)} A`)}
          {metric(id ? "Arus desain AC" : "AC design current", `${result.acDesignCurrent.toFixed(2)} A`, id ? "Estimasi awal" : "Preliminary estimate")}
        </div>
        <div style={{ marginTop: 12 }}>
          {status(id ? "Rating tegangan isolator DC" : "DC isolator voltage rating", result.dcVoltageOk)}
          {status(id ? "Rating arus isolator DC" : "DC isolator current rating", result.dcCurrentOk)}
          {status(id ? "Rating arus breaker AC" : "AC breaker current rating", result.breakerCurrentOk)}
          {status(id ? "Kapasitas pemutusan breaker" : "Breaker breaking capacity", result.breakingOk)}
        </div>
        {result.warnings.length > 0 && <ul style={{ color: "#fbbf24", paddingLeft: 20 }}>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      </>}
    </section>
    <aside style={{ border: "1px solid #b45309", background: "rgba(180,83,9,.12)", borderRadius: 10, padding: 14, fontSize: 12, lineHeight: 1.6 }}>
      <strong>{id ? "Penting — screening awal, bukan desain final" : "Important — preliminary screening, not final design"}</strong><br />
      {id ? "Hasil hanya pemeriksaan aritmetika atas input pengguna. Ini tidak memilih rating proteksi secara otomatis, tidak memverifikasi koordinasi/selectivity, interrupting rating dari hasil studi hubung singkat, pemilihan SPD berdasarkan kajian risiko, atau ukuran PE menurut standar. Verifikasi dengan datasheet resmi, PUIL/IEC dan engineer penanggung jawab." : "Results are arithmetic screening of user inputs only. This does not automatically select protection ratings or verify selectivity, short-circuit study interrupting ratings, risk-based SPD selection, or PE sizing to standards. Verify official datasheets, applicable PUIL/IEC requirements, and responsible engineer review."}
    </aside>
  </div>;
}
