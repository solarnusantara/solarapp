// Engine-mode electrical panels. Each calculator tab keeps its local calculator ("Kalkulator cepat")
// and, only when the project is linked to helio, offers an "Engine Helio" view next to it.
// All values are read from helio responses and rendered as-is (no browser physics).
import { useEffect, useState, type ReactNode } from "react";
import { designFileUrl, designReport, engineErrorMessage, EngineError, getEngineState, isUnavailable, UNAVAILABLE_MESSAGE } from "./client";
import type { StringingReport, WireSchedule } from "./types";
import type { EngineStateResponse } from "./types/local";

const card: React.CSSProperties = { border: "1px solid #233527", borderRadius: 10, padding: 12, marginTop: 10 };
const th: React.CSSProperties = { textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #364b38", fontSize: 11, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "3px 8px", borderBottom: "1px solid #1c2b20", fontSize: 12 };

/** Badge for tabs whose numbers are still browser estimates. */
export function EngineBadge() {
  return (
    <span title="Hitungan di browser, belum memakai engine Helio" style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#3b2f0b", color: "#fbbf24", border: "1px solid #7c5a12" }}>
      Estimasi lokal — belum dari engine
    </span>
  );
}

/** Link state of a project; `null` while loading or when the engine is unreachable (standalone dev). */
export function useEngineLink(projectId: string | null | undefined): { loading: boolean; state: EngineStateResponse | null; designId: string | null } {
  const [state, setState] = useState<EngineStateResponse | null>(null);
  const [loading, setLoading] = useState(!!projectId);
  useEffect(() => {
    if (!projectId) { setLoading(false); setState(null); return; }
    const ac = new AbortController();
    setLoading(true);
    getEngineState(projectId, ac.signal).then((s) => setState(s)).catch(() => setState(null)).finally(() => setLoading(false));
    return () => ac.abort();
  }, [projectId]);
  return { loading, state, designId: state?.helio_design_id ?? null };
}

/** "Kalkulator cepat" | "Engine Helio" switch; renders `quick` alone unless the project is linked. */
export function EngineSwitch({ projectId, quick, engine }: { projectId?: string | null; quick: ReactNode; engine: (designId: string, state: EngineStateResponse) => ReactNode }) {
  const { state, designId } = useEngineLink(projectId);
  const [mode, setMode] = useState<"quick" | "engine">("quick");
  if (!designId || !state) return <>{quick}</>;
  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button className={mode === "quick" ? "primary-button" : "secondary-button"} onClick={() => setMode("quick")}>Kalkulator cepat</button>
        <button className={mode === "engine" ? "primary-button" : "secondary-button"} onClick={() => setMode("engine")}>Engine Helio</button>
      </div>
      {mode === "quick" ? quick : engine(designId, state)}
    </>
  );
}

/** Loads one design report; maps 409 circuit_missing / unavailable to the friendly message. */
export function useDesignReport<T>(designId: string, name: string, query: Record<string, string | number | boolean | null | undefined> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(query);
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true); setErr(null);
    designReport<T>(designId, name, query, ac.signal)
      .then(setData)
      .catch((e) => { if (e instanceof EngineError && e.code === "aborted") return; setData(null); setErr(isUnavailable(e) ? UNAVAILABLE_MESSAGE : engineErrorMessage(e)); })
      .finally(() => setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId, name, key]);
  return { data, err, loading };
}

function Status({ loading, err }: { loading: boolean; err: string | null }) {
  if (loading) return <div style={{ fontSize: 12 }}>Memuat dari Helio…</div>;
  if (err) return <div style={{ fontSize: 12, color: err.startsWith("Sirkuit belum") ? "#fbbf24" : "#f87171" }}>{err}</div>;
  return null;
}

const label = (k: string) => k.replace(/_/g, " ");
const isPrim = (v: unknown) => v === null || typeof v !== "object";
const fmtPrim = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)))) : String(v));

/** Generic read-only renderer for a helio report: objects as key/value, arrays of objects as tables. */
export function JsonView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (isPrim(value)) return <span>{fmtPrim(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span>—</span>;
    if (value.every(isPrim)) return <span>{value.map(fmtPrim).join(", ")}</span>;
    if (value.every((r) => r && typeof r === "object" && !Array.isArray(r) && Object.values(r as object).every(isPrim))) {
      const cols = Array.from(new Set(value.flatMap((r) => Object.keys(r as object))));
      return (
        <div style={{ overflowX: "auto", maxHeight: 360 }}>
          <table style={{ borderCollapse: "collapse" }}>
            <thead><tr>{cols.map((c) => <th key={c} style={th}>{label(c)}</th>)}</tr></thead>
            <tbody>{value.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} style={td}>{fmtPrim((r as Record<string, unknown>)[c])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    return <div>{value.map((v, i) => <div key={i} style={{ marginLeft: 8, borderLeft: "2px solid #233527", paddingLeft: 8 }}><JsonView value={v} depth={depth + 1} /></div>)}</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr", gap: "2px 12px", fontSize: 12 }}>
      {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <div style={{ opacity: 0.7 }}>{label(k)}</div>
          <div><JsonView value={v} depth={depth + 1} /></div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section style={card}><h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h3>{children}</section>;
}

// ---------------- StringCalculator / InverterConfiguration ----------------
export function StringingPanel({ designId }: { designId: string }) {
  const { data, err, loading } = useDesignReport<{ reports?: StringingReport[]; stringing?: StringingReport[] }>(designId, "stringing");
  const reports = data?.reports ?? data?.stringing ?? [];
  return (
    <Section title="Stringing (Helio)">
      <Status loading={loading} err={err} />
      {reports.map((r, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            Zona <b>{r.zone_id}</b> · inverter <b>{r.inverter_id}</b> · {r.module_model} · {r.string_count} string · MPPT: {r.mppt_string_counts.join(" / ")} · modul {r.strung_module_count}/{r.total_module_count} · {r.strung_dc_kwp.toFixed(2)}/{r.total_dc_kwp.toFixed(2)} kWp
          </div>
          {r.issues.map((s, k) => <div key={k} style={{ fontSize: 12, color: "#fbbf24" }}>[{s.code}] {s.message}</div>)}
          <details><summary style={{ fontSize: 12 }}>Daftar string ({r.strings.length})</summary>
            <JsonView value={r.strings.map((s) => ({ string: s.string_id, mppt: s.mppt_id, modul: s.module_count }))} />
          </details>
        </div>
      ))}
      {!loading && !err && reports.length === 0 && <div style={{ fontSize: 12 }}>Belum ada stringing.</div>}
    </Section>
  );
}

// ---------------- CableSizing ----------------
export function WireSchedulePanel({ designId }: { designId: string }) {
  const { data, err, loading } = useDesignReport<WireSchedule>(designId, "wire-schedule");
  return (
    <Section title="Jadwal kabel (Helio)">
      <Status loading={loading} err={err} />
      {data && (
        <>
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            Rugi kabel DC pada STC {data.dc_wiring_loss_stc_kw.toFixed(3)} kW · AC {data.ac_wiring_loss_stc_kw.toFixed(3)} kW · tabel {data.table_version} ({data.table_source})
          </div>
          <JsonView value={data.entries.map((e) => ({
            id: e.id, tipe: e.conductor_label, dari: e.from_node, ke: e.to_node, bahan: e.material, "mm²": e.cross_section_mm2,
            "panjang (m)": e.one_way_length_m, "I stc (A)": e.current_stc_a, "ΔV (%)": e.vdrop_stc_pct, "rugi (W)": e.p_loss_stc_w, kriteria: e.sizing_criterion ?? "",
          }))} />
          {data.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: "#fbbf24" }}>{w}</div>)}
        </>
      )}
    </Section>
  );
}

// ---------------- ProtectionGrounding ----------------
export function ProtectionPanel({ designId }: { designId: string }) {
  const parts: Array<[string, string]> = [
    ["Arus hubung singkat", "short-circuit"], ["Pembumian", "earthing"], ["Proteksi petir", "lightning"],
    ["Koordinasi proteksi", "protection-coordination"], ["Kepatuhan", "compliance"],
  ];
  return <>{parts.map(([t, n]) => <ReportBlock key={n} title={`${t} (Helio)`} designId={designId} name={n} />)}</>;
}
function ReportBlock({ title, designId, name }: { title: string; designId: string; name: string }) {
  const { data, err, loading } = useDesignReport<unknown>(designId, name);
  return <Section title={title}><Status loading={loading} err={err} />{data !== null && <JsonView value={data} />}</Section>;
}

// ---------------- CADDrawings ----------------
export function DrawingsPanel({ designId }: { designId: string }) {
  const links: Array<[string, string]> = [
    ["SLD SVG", "sld/svg"], ["SLD DXF", "sld/dxf"], ["SLD PDF", "sld/pdf"],
    ["Peta string SVG", "string-map/svg"], ["Peta string PDF", "string-map/pdf"], ["Peta string DXF", "string-map/dxf"], ["Peta string ZIP", "string-map/zip"], ["Peta string JSON", "string-map/json"],
  ];
  const [svgOk, setSvgOk] = useState(true);
  return (
    <Section title="Gambar dari Helio">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {links.map(([t, p]) => <a key={p} className="secondary-button" style={{ textDecoration: "none" }} href={designFileUrl(designId, p)} target="_blank" rel="noreferrer" download>{t}</a>)}
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Bila sirkuit belum dibuat Helio menjawab 409: buat sirkuit dulu di PV Layout (langkah Electrical). DXF peta string butuh geometri.</div>
      {svgOk && <img alt="Single line diagram dari Helio" src={designFileUrl(designId, "sld/svg")} onError={() => setSvgOk(false)} style={{ maxWidth: "100%", background: "#fff", marginTop: 8, borderRadius: 6 }} />}
    </Section>
  );
}
