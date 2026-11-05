// Production Report: 4-page HelioScope-style annual production report, every number from the engine
// result, the hourly table, the layout geometry or report-meta. Missing values render "—".
import type { ReactNode } from "react";
import { BarChart, Donut } from "./charts";
import { DASH, MONTHS_EN, MONTHS_SHORT, dateTime, firstOf, isNum, monthlyUniform, n, pct, text } from "./format";
import { producingMean, monthlyEnergy } from "./aggregate";
import { conditionSet, donutSlices, engineering, isTotalRow, lossGroups, out, prod, sourceLabel, wireSummary } from "./model";
import { helioscopeStageLabel } from "./labels";
import { exportModeLabel } from "../engine/exportMode";
import { renderModel } from "./layoutGeometry";
import { Sheet, SONUS_ID_LOGO, SourceNotice, type ReportProps } from "./parts";

const Band = ({ footer, children }: { footer?: boolean; children?: ReactNode }) => (
  <div className={`prd-band${footer ? " is-footer" : ""}`}>{children}</div>
);
const Header = () => <Band>Annual Production Report <small>produced by Sonus ID</small></Band>;

function Card({ title, icon = "▤", children, style }: { title: string; icon?: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="prd-card" style={style}>
      <div className="prd-card-head"><span>{icon}</span>{title}</div>
      {children}
    </div>
  );
}
const KV = ({ k, v }: { k: string; v: ReactNode }) => (<tr><th className="k">{k}</th><td>{v}</td></tr>);

const RACKING: Record<string, string> = { fixed_tilt: "Fixed Tilt", flush_mount: "Flush Mount", east_west: "East-West", carport: "Carport", ground_mount: "Ground Mount", tracker: "Tracker" };
const TEMP_MODEL: Record<string, string> = { sapm: "Sandia Model", faiman: "Faiman Model", pvsyst: "PVsyst Model", noct_sam: "NOCT (SAM) Model" };

export default function ProductionReport({ data, projectId, project }: ReportProps) {
  const { result, layout, meta, hourly } = data;
  const o = out(result), p = prod(result);
  const cs = conditionSet(result);
  const lay = layout.data;
  const m = meta.data;
  const design = p?.design;
  const summary = p?.summary;
  // Engine echo of the input first, else the choice stored with the layout (engine_inputs.racking).
  const rackingKey: string | null = design?.racking || lay?.engine_inputs?.racking || null;
  const rackingLabel = rackingKey ? RACKING[rackingKey] ?? rackingKey : DASH;

  const name = text(design?.project_name ?? project?.name);
  const client = m?.client || m?.owner_name || "";
  const address = lay?.site?.address || m?.project_address || "";
  const lat = o?.weather?.latitude ?? lay?.site?.coordinates?.lat;
  const lon = o?.weather?.longitude ?? lay?.site?.coordinates?.lng;
  const utc = o?.weather?.utc_offset_h;

  const dc = summary?.nameplate_dc_kwp ?? o?.dc_capacity_kwp;
  const ac = summary?.nameplate_ac_kw ?? o?.ac_capacity_kw;
  const annual = summary?.energy_to_grid_kwh ?? o?.annual_p50_kwh;

  const monthlyKwh: Array<number | null> | null = Array.isArray(p?.monthly) && p.monthly.length === 12
    ? p.monthly.map((r: any) => (isNum(r.energy_to_grid_kwh) ? r.energy_to_grid_kwh : null))
    : monthlyEnergy(hourly.data?.hourly, hourly.data?.columns, "grid_power");

  const groups = lossGroups(result);
  const rm = renderModel(lay);
  const hr = hourly.data?.hourly;
  const ambient = producingMean(hr, "temp_air", "ac_power");
  const cell = producingMean(hr, "avg_cell_temp", "ac_power");

  const inverters: Record<string, { n: number; kw: number }> = {};
  for (const iv of Array.isArray(o?.inverters_summary) ? o.inverters_summary : []) {
    const k = text(iv.model_name);
    inverters[k] ??= { n: 0, kw: 0 };
    inverters[k].n += 1;
    inverters[k].kw += isNum(iv.nominal_ac_kw) ? iv.nominal_ac_kw : 0;
  }
  const mod = result?.components?.module, inv = result?.components?.inverter;
  const wires = wireSummary(result);
  const stringReports: any[] = (result?.circuit_auto?.stringing as any[]) ?? o?.stringing ?? [];
  const sizes = stringReports.flatMap((r) => (r.strings ?? []).map((s: any) => s.module_count)).filter(isNum);

  const segs = (lay?.segments ?? []).filter((s) => s.visible !== false);
  const segRows = segs.map((s) => ({
    key: s.id,
    racking: rackingLabel,
    orientation: s.orientation === "portrait" ? "Portrait (Vertical)" : s.orientation === "landscape" ? "Landscape (Horizontal)" : DASH,
    tilt: isNum(s.tilt) ? `${n(s.tilt, 0, { group: false })}°` : DASH,
    az: isNum(s.azimuth) ? `${n(s.azimuth, 3, { group: false })}°` : DASH,
    modules: s.panels?.length ?? null,
    kw: s.panels?.length && isNum(s.moduleWatts) ? (s.panels.length * s.moduleWatts) / 1000 : null,
  }));
  const FIRST = 11, REST = 36;
  const segChunks: typeof segRows[] = [segRows.slice(0, FIRST)];
  for (let i = FIRST; i < segRows.length; i += REST) segChunks.push(segRows.slice(i, i + REST));

  // One module-count source: the footer total is the sum of the rows above; a run on another count is flagged, never hidden.
  const segTotalModules = segRows.reduce((a, r) => a + (r.modules ?? 0), 0);
  const segTotalKw = segRows.reduce((a, r) => a + (isNum(r.kw) ? r.kw : 0), 0);
  const runModules = isNum(design?.module_count) ? design.module_count : null;
  const SegTable = ({ rows, last }: { rows: typeof segRows; last?: boolean }) => (
    <Card title="Field Segments" style={{ marginTop: "4mm" }}>
      <table className="prd-table">
        <thead><tr>{["Description", "Racking", "Orientation", "Tilt", "Azimuth", "Intrarow Spacing", "Frame Size", "Frames", "Modules", "Power"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center" }}>{DASH} layout belum dimuat</td></tr>}
          {rows.map((r) => (
            <tr key={r.key}><td>Field Segment</td><td>{r.racking}</td><td>{r.orientation}</td><td>{r.tilt}</td><td>{r.az}</td><td>{DASH}</td><td>{DASH}</td><td>{DASH}</td><td>{n(r.modules)}</td><td>{isNum(r.kw) ? `${n(r.kw, 2)} kW` : DASH}</td></tr>
          ))}
          {last && rows.length > 0 && (
            <tr className="is-total"><td colSpan={8}><b>Total</b>{isNum(runModules) && runModules !== segTotalModules ? <span style={{ color: "#b45309" }}> - Helio memakai {n(runModules)} modul</span> : null}</td><td><b>{n(segTotalModules)}</b></td><td><b>{n(segTotalKw, 2)} kW</b></td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );

  return (
    <div className="rpt-pages">
      <div className="no-print" style={{ width: "100%" }}><SourceNotice data={data} /></div>

      {/* ---------------- page 1 ---------------- */}
      <Sheet>
        <Header />
        <div className="rpt-sheet-body">
          <h1 className="prd-title">{name}{client && <small>{client}</small>}</h1>
          <div className="prd-sub">{address || DASH}</div>
          <div className="prd-grid" style={{ gridTemplateColumns: "1fr 1.15fr 0.9fr" }}>
            <Card title="Project Details">
              <table className="prd-table"><tbody>
                <KV k="Address" v={text(address)} />
                <KV k="Owner" v={text(m?.owner_name || m?.client)} />
                <KV k="Last Modified" v={dateTime(result?.ran_at)} />
                <KV k="Location" v={isNum(lat) && isNum(lon) ? `(${n(lat, 5, { group: false })}, ${n(lon, 5, { group: false })})${isNum(utc) ? ` (GMT ${utc > 0 ? "+" : ""}${utc})` : ""}` : DASH} />
                <KV k="Racking" v={rackingLabel} />
              </tbody></table>
            </Card>
            <Card title="System Metrics">
              <table className="prd-table"><tbody>
                <KV k="Design" v={name} />
                <KV k="Module DC Nameplate" v={isNum(dc) ? `${n(dc, 2)} kW` : DASH} />
                <KV k="Inverter AC Nameplate" v={isNum(ac) ? <>{n(ac, 2)} kW<br />Load Ratio: {isNum(dc) && ac > 0 ? n(dc / ac, 2) : DASH}</> : DASH} />
                <KV k="Annual Production" v={isNum(annual) ? `${n(annual / 1e6, 2)} GWh` : DASH} />
                <KV k="Performance Ratio" v={pct(summary?.performance_ratio_pct ?? o?.performance_ratio_pct, 1)} />
                <KV k="kWh/kWp" v={n(summary?.specific_yield_kwh_kwp ?? o?.specific_yield_kwh_kwp, 1)} />
                <KV k="Export Mode" v={result ? exportModeLabel((result.input as any)?.export_limitation_mode) : DASH} />
                <KV k="Weather Dataset" v={sourceLabel(result)} />
                <KV k="Simulator Version" v={text(result?.engine_version ? `Helio engine v${result.engine_version}` : null)} />
              </tbody></table>
            </Card>
            <Card title="Project Location" icon="⌖">
              <div className="prd-map">
                {lay?.backgroundImage ? <><img src={lay.backgroundImage} alt="lokasi" /><span className="prd-pin" /></> : (
                  <div style={{ padding: 14, fontSize: 10, color: "#64748b" }}>{DASH} Citra satelit belum diambil</div>
                )}
              </div>
            </Card>
          </div>
          <div className="prd-grid" style={{ gridTemplateColumns: "1.35fr 1fr", marginTop: "9mm" }}>
            <Card title="Energy Consumption" icon="▥">
              <div style={{ padding: 6 }}>
                <BarChart values={monthlyKwh} labels={MONTHS_SHORT} yLabel="kWh" color="#ff9d0a" legend="Production" />
              </div>
            </Card>
            <Card title="System Loss" icon="◔">
              <div style={{ padding: 6 }}><Donut slices={donutSlices(result)} /></div>
            </Card>
          </div>
        </div>
        <Band footer />
      </Sheet>

      {/* ---------------- page 2 ---------------- */}
      <Sheet>
        <Header />
        <div className="rpt-sheet-body">
          <div className="prd-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Card title="Annual Production">
              <table className="prd-table prd-annual">
                <thead><tr><th className="sec-h" /><th>Description</th><th className="r">Output</th><th className="r">% Delta</th></tr></thead>
                <tbody>
                  {groups.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center" }}>{DASH} belum dihitung</td></tr>}
                  {groups.map((g) => g.rows.map((row, i) => (
                    <tr key={`${g.section}-${row.key}`} className={isTotalRow(g, i) ? "is-total" : ""}>
                      {i === 0 && <td className="sec" rowSpan={g.rows.length}>{g.section === "irradiance" ? <>Irradiance<br />(kWh/m²)</> : <>Energy<br />(kWh)</>}</td>}
                      <td className="r" style={isTotalRow(g, i) ? undefined : { textAlign: "right" }}>{helioscopeStageLabel(row)}</td>
                      <td className="r">{n(row.annual, 1)}</td>
                      <td className="r delta">{isNum(row.delta_pct) ? pct(row.delta_pct, 1) : "-"}</td>
                    </tr>
                  )))}
                  <tr className="prd-sec-head"><td colSpan={4}>Temperature Metrics</td></tr>
                  <tr><td colSpan={3} className="r">Avg. Operating Ambient Temp (jam produksi)</td><td className="r">{isNum(ambient) ? `${n(ambient, 1)}°C` : DASH}</td></tr>
                  <tr><td colSpan={3} className="r">Avg. Operating Cell Temp (jam produksi)</td><td className="r">{isNum(cell) ? `${n(cell, 1)}°C` : DASH}</td></tr>
                  <tr className="prd-sec-head"><td colSpan={4}>Simulation Metrics</td></tr>
                  <tr><td colSpan={3} className="r">Operating Hours</td><td className="r">{n(o?.operating_hours, 0)}</td></tr>
                </tbody>
              </table>
            </Card>
            <Card title="Condition Set">
              <table className="prd-table"><tbody>
                <KV k="Description" v={text(result?.condition_set_id ? "Condition Set (Helio)" : null)} />
                <KV k="Weather Dataset" v={sourceLabel(result)} />
                <KV k="Solar Angle Location" v={cs ? (cs.solar_angle_location === "weather" ? "Weather file Lat/Lng" : "Project Lat/Lng") : DASH} />
                <KV k="Transposition Model" v={cs ? ({ perez: "Perez Model", hay_davies: "Hay-Davies Model", isotropic: "Isotropic Model" } as any)[cs.transposition] ?? cs.transposition : DASH} />
                <KV k="Temperature Model" v={cs ? TEMP_MODEL[cs.temperature_model.model] ?? cs.temperature_model.model : DASH} />
                <tr><th className="k">Temperature Model Parameters</th><td>
                  {cs ? (
                    <table className="prd-mini"><tbody>
                      <tr><th>Rack Type</th>{Object.keys(cs.temperature_model).filter((k) => k !== "model").map((k) => <th key={k}>{k}</th>)}</tr>
                      <tr><td>{rackingLabel}</td>{Object.entries(cs.temperature_model).filter(([k]) => k !== "model").map(([k, v]) => <td key={k}>{text(v)}</td>)}</tr>
                    </tbody></table>
                  ) : DASH}
                </td></tr>
                <tr><th className="k">Soiling (%)</th><td>{cs ? <MonthGrid values={cs.soiling_pct} /> : DASH}</td></tr>
                <tr><th className="k">Albedo</th><td>{cs ? <MonthGrid values={cs.albedo} /> : DASH}</td></tr>
                <KV k="Rear Mismatch Loss" v={cs ? <>{pct(cs.bifacial.rear_mismatch_pct, 0)} &nbsp; Rear Shading Factor: {pct(cs.bifacial.rear_shading_factor_pct, 0)}</> : DASH} />
                <KV k="Module Transparency" v={cs ? pct(cs.bifacial.module_transparency_pct, 0) : DASH} />
                <KV k="Mismatch Loss" v={cs ? pct(cs.mismatch.pct, 2) : DASH} />
                <KV k="Irradiation Variance" v={cs ? (isNum(cs.mismatch.sigma_irradiance_pct) ? pct(cs.mismatch.sigma_irradiance_pct, 1) : DASH) : DASH} />
                <KV k="Cell Temperature Spread" v={cs ? (isNum(cs.mismatch.temp_spread_c) ? `${n(cs.mismatch.temp_spread_c, 1)}°C` : DASH) : DASH} />
                <KV k="Module Binning Range" v={cs ? (isNum(cs.mismatch.module_tolerance_min_pct) && isNum(cs.mismatch.module_tolerance_max_pct) ? `${n(cs.mismatch.module_tolerance_min_pct, 1)}% to ${n(cs.mismatch.module_tolerance_max_pct, 1)}%` : DASH) : DASH} />
                <KV k="AC System Derate" v={cs ? (cs.ac_loss.mode === "pct" ? pct(cs.ac_loss.pct, 2) : "Tidak diterapkan") : DASH} />
                <tr><th className="k">Component Characterizations</th><td>
                  <table className="prd-mini"><thead><tr><th>Type</th><th>Component</th><th>Characterization</th><th>Bifacial</th></tr></thead><tbody>
                    <tr><td>Module</td><td>{mod ? `${mod.model} (${mod.manufacturer})` : DASH}</td><td>{mod?.characterizations?.find((c) => c.is_default)?.source?.toUpperCase() ?? DASH}</td><td>{cs ? String(cs.bifacial.enabled) : DASH}</td></tr>
                    <tr><td>Inverter</td><td>{inv ? `${inv.model} (${inv.manufacturer})` : DASH}</td><td>{inv?.characterizations?.find((c) => c.is_default)?.source?.toUpperCase() ?? DASH}</td><td>N/A</td></tr>
                  </tbody></table>
                </td></tr>
              </tbody></table>
            </Card>
          </div>
        </div>
        <Band footer />
      </Sheet>

      {/* ---------------- page 3 ---------------- */}
      <Sheet>
        <Header />
        <div className="rpt-sheet-body">
          <div className="prd-grid" style={{ gridTemplateColumns: "0.8fr 1.7fr" }}>
            <div>
              <Card title="Design BOM">
                <table className="prd-table">
                  <thead><tr><th>Component</th><th>Type</th><th>Specs</th></tr></thead>
                  <tbody>
                    {Object.entries(inverters).map(([k, v]) => <tr key={k}><td>{k}</td><td>Inverters</td><td>{v.n} ({n(v.kw, 2)} kW)</td></tr>)}
                    {Object.keys(inverters).length === 0 && <tr><td>{inv ? `${inv.model} (${inv.manufacturer})` : DASH}</td><td>Inverters</td><td>{DASH}</td></tr>}
                    <tr><td>{mod ? `${mod.manufacturer}, ${mod.model} (${n(mod.nameplate_w, 0)}W)` : DASH}</td><td>Modules</td><td>{isNum(design?.module_count) ? `${n(design.module_count)} (${n(design.dc_kwp, 2)} kW)` : DASH}</td></tr>
                    <tr><td>{wires?.label ?? DASH}</td><td>Strings</td><td>{wires ? `${n(wires.count)} (${n(wires.lengthM, 1)} m)` : DASH}</td></tr>
                  </tbody>
                </table>
              </Card>
            </div>
            <div>
              <Card title="Monthly Shading">
                <table className="prd-table prd-monthly">
                  <thead><tr><th>Month</th><th>GHI (kWh/m²)</th><th>POA (kWh/m²)</th><th>Shaded (kWh/m²)</th><th>Nameplate (kWh)</th><th>Grid (kWh)</th></tr></thead>
                  <tbody>
                    {MONTHS_EN.map((mn, i) => {
                      const r = Array.isArray(p?.monthly) ? p.monthly[i] : null;
                      return <tr key={mn}><td>{mn}</td><td>{n(r?.ghi_kwh_m2, 1)}</td><td>{n(r?.poa_kwh_m2, 1)}</td><td>{n(r?.shaded_kwh_m2, 1)}</td><td>{n(r?.nameplate_kwh, 1)}</td><td>{n(r?.energy_to_grid_kwh, 1)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </Card>
              <Card title="Design Wiring Zone" style={{ marginTop: "5mm" }}>
                <table className="prd-table">
                  <thead><tr><th>Description</th><th>Combiner Poles</th><th>String Size</th><th>Stringing Strategy</th></tr></thead>
                  <tbody><tr>
                    <td>Wiring Zone</td>
                    <td>{text(firstOf(result?.circuit_auto?.circuit, "wiring_zones.0.combiner_poles"))}</td>
                    <td>{sizes.length ? (Math.min(...sizes) === Math.max(...sizes) ? String(sizes[0]) : `${Math.min(...sizes)} - ${Math.max(...sizes)}`) : DASH}</td>
                    <td>{text(firstOf(result?.circuit_auto?.circuit, "wiring_zones.0.stringing_strategy", "wiring_zones.0.strategy"))}</td>
                  </tr></tbody>
                </table>
              </Card>
            </div>
          </div>
        </div>
        <Band footer />
      </Sheet>

      {/* ---------------- page 4 (+ continuation) ---------------- */}
      {segChunks.map((rows, ci) => (
        <Sheet key={ci}>
          <Header />
          <div className="rpt-sheet-body">
            {ci === 0 && (
              <Card title="Design Render" icon="◈">
                <div className="prd-render">
                  {rm ? (
                    <svg viewBox={`0 0 ${rm.w} ${rm.h}`} style={{ background: "#d7dbe0" }}>
                      <defs><clipPath id="rpt-site-clip"><rect x="0" y="0" width={rm.w} height={rm.h} /></clipPath></defs>
                      {rm.bg && (
                        <g clipPath="url(#rpt-site-clip)">
                          <g transform={`rotate(${rm.bg.rotate}, ${rm.bg.cx}, ${rm.bg.cy})`}>
                            <image href={rm.bg.href} x={rm.bg.cx - rm.bg.size / 2} y={rm.bg.cy - rm.bg.size / 2} width={rm.bg.size} height={rm.bg.size} preserveAspectRatio="xMidYMid meet" />
                          </g>
                        </g>
                      )}
                      {!rm.bg && <g stroke="#e5e7eb" strokeWidth={rm.w / 400}>{Array.from({ length: 20 }, (_, i) => <line key={i} x1={(rm.w / 20) * i} x2={(rm.w / 20) * i} y1="0" y2={rm.h} />)}</g>}
                      {rm.walkways.map((w, i) => <rect key={`w${i}`} x={w.x} y={w.y} width={w.w} height={w.h} fill="#ea580c" fillOpacity="0.4" />)}
                      {rm.obstacles.map((w, i) => <rect key={`o${i}`} x={w.x} y={w.y} width={w.w} height={w.h} fill="#ef4444" fillOpacity="0.55" />)}
                      {rm.rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#3b3bdc" stroke="#1e1b9c" strokeWidth={Math.max(8, rm.w / 2500)} />)}
                      {!rm.bg && <text x={rm.w / 2} y={rm.h - rm.h * 0.03} textAnchor="middle" fontSize={rm.w / 40} fill="#64748b">Citra satelit belum diambil</text>}
                      <g transform={`translate(${rm.w * 0.95} ${rm.h * 0.93})`} fill="none" stroke="#16a34a" strokeWidth={rm.w / 400}>
                        <path d={`M0 ${rm.w / 30} L0 ${-rm.w / 30} M${-rm.w / 70} ${-rm.w / 60} L0 ${-rm.w / 30} L${rm.w / 70} ${-rm.w / 60}`} />
                        <text x={rm.w / 60} y={-rm.w / 36} fontSize={rm.w / 50} fill="#16a34a" stroke="none">N</text>
                      </g>
                    </svg>
                  ) : <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>{DASH} layout belum dimuat</div>}
                  <img className="logo" src={SONUS_ID_LOGO} alt="Sonus ID" />
                </div>
              </Card>
            )}
            <SegTable rows={rows} last={ci === segChunks.length - 1} />
          </div>
          <Band footer />
        </Sheet>
      ))}
    </div>
  );
}

function MonthGrid({ values }: { values: number[] }) {
  const L = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  return (
    <table className="prd-mini"><tbody>
      <tr>{L.map((l, i) => <th key={i}>{l}</th>)}</tr>
      <tr>{values.map((v, i) => <td key={i}>{isNum(v) ? String(Number(v.toFixed(2))) : DASH}</td>)}</tr>
    </tbody></table>
  );
}
void monthlyUniform;
