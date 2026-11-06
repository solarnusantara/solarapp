// Engineering Calculation: company cover + revision page + simulation report pages. Section structure
// follows the familiar PV simulation report layout; the producer is the Helio engine. Every number
// comes from the engine result / hourly table / sun-position / report-meta; missing -> "—".
import { createContext, useContext, type ReactNode } from "react";
import { reportAssetUrl } from "../engine/client";
import { monthlyBalance, monthlyBalanceFromEngineering, dailyInOut, powerHistogram, horizonAverage, horizonDiffuseFactor, pvsystAzimuth, sunPathSegments, splitAtAzimuthWrap, behindPlaneSegments, sunBandQuads, col, type MonthlyBalance } from "./aggregate";
import { IsoShadingChart, NormalCurve, Scatter, StackedBars, StepHistogram, SunPathChart, Waterfall, BarChart, type SunCurve, type SunHourLine, type WaterfallItem } from "./charts";
import { DASH, MONTHS_SHORT, MONTHS_EN, dateLong, firstOf, dateTime, isNum, monthlyUniform, n, pct, plain, text } from "./format";
import { moduleAreaStats } from "./layoutGeometry";
import NearShadingScene from "./NearShadingScene";
import { buildIsoScene } from "./isoProjection";
import { hasIsoData, isoAttenuationText, isoContourSegments, isoMissingNote } from "./isoShading";
import LossDiagram from "./LossFunnel";
import { exportModeLabel } from "../engine/exportMode";
import { sigmaEnergy, Z } from "./probability";
import { conditionSet, engineering, horizonPoints, inverterRatings, iamTable, lossGroups, lossTree, orientations, out, prod, sourceLabel, stringingReports, uncertaintyRows, weatherVariability } from "./model";
import { mountingPhrase, thermalRows, usersNeedsLabel } from "./labels";
import { LogoImg, Sheet, SOLAR_NUSANTARA_LOGO, SourceNotice, type ReportProps } from "./parts";
import { SUN_DATES } from "./useReportData";

const Row = ({ k, v }: { k: string; v: ReactNode }) => (<div className="sim-row"><span>{k}</span><span>{v}</span></div>);
const Box = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="sim-box"><div className="sim-box-title">{title}</div>{children}</div>
);


export default function EngineeringCalc({ data, projectId, project }: ReportProps) {
  const { result, layout, meta, hourly, sun, shade, iso } = data;
  const m = meta.data;
  const lay = layout.data;
  const o = out(result), p = prod(result);
  const cs = conditionSet(result);
  const w = o?.weather;
  const name = text(p?.design?.project_name ?? project?.name);
  const dc = p?.summary?.nameplate_dc_kwp ?? o?.dc_capacity_kwp;
  const ac = p?.summary?.nameplate_ac_kw ?? o?.ac_capacity_kw;
  const variant = isNum(dc) ? `${n(dc, 0, { group: false })} kWp` : DASH;
  const ver = result?.engine_version ? `Helio engine v${result.engine_version}` : "Helio engine";
  const simDate = dateTime(result?.ran_at);
  const ords = orientations(result, lay);
  // PVsyst measures azimuth from the direction of the equator (south hemisphere: 0 = north, east negative).
  const latDeg: number | null = isNum(result?.output?.weather?.latitude) ? result.output.weather.latitude : isNum(lay?.site?.coordinates?.lat) ? lay.site.coordinates.lat : null;
  const azP = (a: number) => pvsystAzimuth(a, latDeg);
  // helio spells the racking `flush_mount` (input, thermal) but `flushmount` (production.design): normalised in labels.ts
  const rackKey = o?.thermal?.racking ?? (result?.input as any)?.racking ?? p?.design?.racking ?? null;
  const mountingText = mountingPhrase(rackKey) ?? DASH;
  const exportMode = (result?.input as any)?.export_limitation_mode ?? o?.export_limitation_mode;
  const needsTxt = usersNeedsLabel(exportMode, o?.consumption_source);
  const exportTxt = result ? exportModeLabel(exportMode) : DASH;
  const reports = stringingReports(result);
  const invs: any[] = Array.isArray(o?.inverters_summary) ? o.inverters_summary : [];
  const mod = result?.components?.module, inv = result?.components?.inverter;
  const ratings = inverterRatings(result);
  const nomAcKw = ratings.nomAcKw, pMaxAcKw = ratings.pMaxAcKw;
  const mpptWindow = (id: string): string | null => { const w2 = ratings.mpptWindow(id); return w2 ? `${n(w2.minV, 0, { group: false })}-${n(w2.maxV, 0, { group: false })} V` : null; };
  const horizon = horizonPoints(result, lay);
  const hr = hourly.data?.hourly, cols = hourly.data?.columns;
  const eng = engineering(result);
  const bal: MonthlyBalance = monthlyBalanceFromEngineering(eng?.monthly_balance, isNum(dc) ? dc : null) ?? monthlyBalance(hr, cols, isNum(dc) ? dc : null);
  const monthlyProd: any[] = Array.isArray(p?.monthly) ? p.monthly : [];
  const arrOr = (a: number[] | null, key: string): Array<number | null> => (a ?? MONTHS_SHORT.map((_, i) => (isNum(monthlyProd[i]?.[key]) ? monthlyProd[i][key] : null)));
  const globHor = arrOr(bal.globHor, "ghi_kwh_m2"), globInc = arrOr(bal.globInc, "poa_kwh_m2"), eGrid = arrOr(bal.eGrid, "energy_to_grid_kwh");
  const unc = o?.uncertainty;
  const h1 = unc?.horizon_1y;

  /* ---------- page builders (title key -> TOC) ---------- */
  const pages: Array<{ toc?: string; node: (pageNo: number, total: number) => ReactNode }> = [];
  const sim = (toc: string | undefined, body: ReactNode) =>
    pages.push({ toc, node: (no, total) => (
      <Sheet key={`sim-${no}`}>
        <div className="sim-head">
          <div className="meta"><b>{ver}</b>Simulation date:<br />{simDate}</div>
          <div className="ttl"><div>Project: {name}</div><div>Variant: {variant}</div></div>
          <div style={{ width: "38mm" }} />
        </div>
        <div className="rpt-sheet-body" style={{ paddingTop: "5mm" }}>{body}</div>
        <div className="sim-foot"><span>{dateLong(result?.ran_at)}</span><span>{ver}</span><span>Page {no}/{total}</span></div>
      </Sheet>
    ) });

  // 1 - simulation cover
  sim(undefined, (
    <div style={{ textAlign: "center", marginTop: "22mm" }}>
      <div style={{ fontSize: 26 }}>Simulation report</div>
      <div style={{ fontSize: 16, display: "inline-block", borderBottom: "1px solid #111", padding: "0 20mm 3px", marginTop: 6 }}>Grid-Connected System</div>
      <div style={{ fontSize: 18, marginTop: "7mm" }}>Project: {name}</div>
      <div style={{ fontSize: 14, marginTop: 4 }}>Variant: {variant}</div>
      <div style={{ fontSize: 14, marginTop: 4 }}>{mountingText}</div>
      <div style={{ fontSize: 14, marginTop: 4 }}>System power: {variant}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>{text(m?.owner_name || m?.client)}</div>
      <div style={{ fontSize: 10, color: "#475569", marginTop: "12mm" }}>Dihasilkan oleh {ver}</div>
    </div>
  ));

  // 2 - project & results summary
  sim("Project and results summary", (
    <>
      <Box title="Project summary">
        <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div><h5>Geographical Site</h5><div>{name}</div></div>
          <div><h5>Situation</h5>
            <Row k="Latitude" v={isNum(w?.latitude) ? `${n(w.latitude, 2, { group: false })} °` : DASH} />
            <Row k="Longitude" v={isNum(w?.longitude) ? `${n(w.longitude, 2, { group: false })} °` : DASH} />
            <Row k="Altitude" v={isNum(w?.elevation_m) ? `${n(w.elevation_m, 0)} m` : DASH} />
            <Row k="Time zone" v={isNum(w?.utc_offset_h) ? `UTC${w.utc_offset_h >= 0 ? "+" : ""}${w.utc_offset_h}` : DASH} />
          </div>
          <div><h5>Project settings</h5><Row k="Albedo" v={cs ? monthlyUniform(cs.albedo, 2) : DASH} /></div>
        </div>
        <div style={{ marginTop: 8 }}><h5>Weather data</h5><div>{sourceLabel(result)}</div></div>
      </Box>
      <Box title="System summary">
        <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div><h5>Grid-Connected System</h5><div>{mountingText}</div></div>
          <div /><div />
          <div><h5>PV Field Orientation</h5>
            <Row k="Planes" v={ords.length ? `${ords.length} orientation${ords.length > 1 ? "s" : ""}` : DASH} />
            <Row k="Tilts/azimuths" v={ords.length ? <>{ords.map((x, i) => <div key={i}>{n(x.tilt, 0, { group: false })} / {isNum(x.azimuth) ? n(azP(x.azimuth), 0, { group: false }) : DASH} °</div>)}</> : DASH} />
          </div>
          <div><h5>Near Shadings</h5><div>{text(cs ? "3D scene (Helio engine)" : null)}</div></div>
          <div><h5>User's needs</h5><div>{needsTxt}</div><div>Export mode: {exportTxt}</div></div>
        </div>
        <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
          <div><h5>PV Array</h5><Row k="Nb. of modules" v={`${n(p?.design?.module_count, 0)} units`} /><Row k="Pnom total" v={isNum(dc) ? `${n(dc, 0)} kWp` : DASH} /></div>
          <div><h5>Inverters</h5><Row k="Nb. of units" v={invs.length ? `${invs.length} units` : DASH} /><Row k="Pnom total" v={isNum(ac) ? `${n(ac, 0)} kWac` : DASH} /><Row k="Pnom ratio" v={isNum(o?.dc_ac_ratio) ? n(o.dc_ac_ratio, 3) : DASH} /></div>
        </div>
      </Box>
      <Box title="Results summary">
        <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>Produced Energy &nbsp; <b>{isNum(o?.annual_p50_kwh) ? `${plain(o.annual_p50_kwh)} kWh/year` : DASH}</b></div>
          <div>Specific production &nbsp; <b>{isNum(o?.specific_yield_kwh_kwp) ? `${plain(o.specific_yield_kwh_kwp)} kWh/kWp/year` : DASH}</b></div>
          <div>Perf. Ratio PR &nbsp; <b>{pct(o?.performance_ratio_pct, 2)}</b></div>
        </div>
      </Box>
      <Box title="Table of contents"><TocList /></Box>
    </>
  ));

  // 3 - general parameters + arrays
  const arrayRows = reports.map((r, i) => {
    const iv = invs.find((x) => x.inverter_id === r.inverter_id);
    const len = r.strings?.map((s) => s.module_count) ?? [];
    const series = len.length && len.every((x) => x === len[0]) ? String(len[0]) : DASH;
    const o1 = ords.length === 1 ? ords[0] : null;
    const er = eng?.arrays?.find((x) => x.inverter_id === r.inverter_id) ?? null;
    const op50 = er ? { p_mpp_kw: er.pmpp_50c_kw, u_mpp_v: er.umpp_50c_v, i_mpp_a: er.impp_50c_a } : null;
    // plane of this array = the design array that owns its first string
    const sid = r.strings?.[0]?.string_id;
    const da = sid ? (prod(result)?.design?.arrays ?? []).find((x: any) => Array.isArray(x.string_ids) && x.string_ids.includes(sid)) : null;
    const plane = da && isNum(da.tilt_deg) && isNum(da.azimuth_deg) ? { tilt: da.tilt_deg, az: da.azimuth_deg } : null;
    return { i, r, iv, series, o1, op50, er, plane };
  });
  const ArrayBlock = ({ a }: { a: (typeof arrayRows)[number] }) => (
    <div style={{ marginBottom: 8 }}>
      <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <h5>Array #{a.i + 1} - {a.r.inverter_id}</h5>
          <Row k="Orientation" v={a.o1 ? `#${a.o1.id}` : DASH} />
          <Row k="Tilt/Azimuth" v={a.plane ? `${n(a.plane.tilt, 0, { group: false })}/${n(azP(a.plane.az), 0, { group: false })} °` : a.o1 ? `${n(a.o1.tilt, 0, { group: false })}/${isNum(a.o1.azimuth) ? n(azP(a.o1.azimuth), 0, { group: false }) : DASH} °` : DASH} />
          <Row k="Number of PV modules" v={`${n(a.r.strung_module_count)} units`} />
          <Row k="Nominal (STC)" v={`${n(a.r.strung_dc_kwp, 0)} kWp`} />
          <Row k="Modules" v={`${n(a.r.string_count)} string x ${a.series} in series`} />
          <h5 style={{ marginTop: 3 }}>At operating cond. (50°C)</h5>
          <Row k="Pmpp" v={isNum(a.op50?.p_mpp_kw) ? `${n(a.op50.p_mpp_kw, 0)} kWp` : DASH} />
          <Row k="U mpp" v={isNum(a.op50?.u_mpp_v) ? `${n(a.op50.u_mpp_v, 0)} V` : DASH} />
          <Row k="I mpp" v={isNum(a.op50?.i_mpp_a) ? `${n(a.op50.i_mpp_a, 0)} A` : DASH} />
        </div>
        <div>
          <h5>&nbsp;</h5>
          <Row k="Number of inverters" v={`${a.r.mppt_string_counts.length} MPPT, 1 unit`} />
          <Row k="Total power" v={isNum(a.iv?.nominal_ac_kw) ? `${n(a.iv.nominal_ac_kw, 0)} kWac` : DASH} />
          <h5 style={{ marginTop: 3 }}>&nbsp;</h5>
          <Row k="Operating voltage" v={a.er ? `${n(a.er.mppt_v_min_v, 0, { group: false })}-${n(a.er.mppt_v_max_v, 0, { group: false })} V` : mpptWindow(a.r.inverter_id) ?? DASH} />
          <Row k="Max. power (=>30°C)" v={isNum(pMaxAcKw) ? `${n(pMaxAcKw, 0)} kWac` : DASH} />
          <Row k="Pnom ratio (DC:AC)" v={a.er ? n(a.er.dc_ac_ratio, 2) : isNum(a.iv?.nominal_ac_kw) && a.iv.nominal_ac_kw > 0 ? n(a.r.strung_dc_kwp / a.iv.nominal_ac_kw, 2) : DASH} />
        </div>
      </div>
    </div>
  );
  const pvHead = (
    <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 6 }}>
      <div>
        <h5>PV module</h5>
        <Row k="Manufacturer" v={text(mod?.manufacturer)} />
        <Row k="Model" v={text(mod?.model)} />
        <Row k="Unit Nom. Power" v={isNum(mod?.nameplate_w) ? `${n(mod.nameplate_w, 0)} Wp` : DASH} />
        <Row k="Number of PV modules" v={isNum(p?.design?.module_count) ? `${n(p.design.module_count)} units` : DASH} />
        <Row k="Nominal (STC)" v={isNum(dc) ? `${n(dc, 0)} kWp` : DASH} />
      </div>
      <div>
        <h5>Inverter</h5>
        <Row k="Manufacturer" v={text(inv?.manufacturer)} />
        <Row k="Model" v={text(inv?.model)} />
        <Row k="Unit Nom. Power" v={isNum(nomAcKw) ? `${n(nomAcKw, 0)} kWac` : DASH} />
        <Row k="Number of inverters" v={invs.length ? `${invs.length} units` : DASH} />
        <Row k="Total power" v={isNum(ac) ? `${n(ac, 0)} kWac` : DASH} />
      </div>
    </div>
  );
  const FIRST_ARR = 3, REST_ARR = 5;
  const arrChunks = [arrayRows.slice(0, FIRST_ARR)];
  for (let i = FIRST_ARR; i < arrayRows.length; i += REST_ARR) arrChunks.push(arrayRows.slice(i, i + REST_ARR));
  const orientTxt = ords.length ? ords.map((x) => `${n(x.tilt, 0, { group: false })} / ${isNum(x.azimuth) ? n(azP(x.azimuth), 0, { group: false }) : DASH} °`) : [];
  arrChunks.forEach((chunk, ci) => sim(ci === 0 ? "General parameters, PV Array Characteristics, System losses" : undefined, (
    <>
      {ci === 0 && (
        <Box title="General parameters">
          <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div><h5>PV Field Orientation</h5><Row k="Orientation" v={ords.length ? `${ords.length} orientations` : DASH} /><Row k="Tilts/azimuths" v={orientTxt.length ? <>{orientTxt.map((t, i) => <div key={i}>{t}</div>)}</> : DASH} /></div>
            <div><h5>Sheds configuration</h5><Row k="Nb. of modules" v={isNum(p?.design?.module_count) ? `${n(p.design.module_count)} units` : DASH} /></div>
            <div><h5>Models used</h5>
              <Row k="Transposition" v={cs ? cs.transposition : DASH} />
              <Row k="Decomposition" v={cs ? cs.decomposition : DASH} />
              <Row k="IAM" v={cs ? cs.iam : DASH} />
            </div>
            <div><h5>Horizon</h5><Row k="Average Height" v={isNum(horizonAverage(horizon)) ? `${n(horizonAverage(horizon), 1)} °` : DASH} /></div>
            <div><h5>Near Shadings</h5><div>{text(cs ? "3D scene (Helio engine)" : null)}</div></div>
            <div><h5>User's needs</h5><div>{needsTxt}</div><div>Export mode: {exportTxt}</div></div>
          </div>
        </Box>
      )}
      <Box title="PV Array Characteristics">
        {ci === 0 && pvHead}
        {chunk.length ? chunk.map((a) => <ArrayBlock key={a.i} a={a} />) : <div>{DASH} stringing belum dibuat (pilih modul & inverter lalu Buat sirkuit)</div>}
      </Box>
    </>
  )));

  // array losses + system losses
  const lossRowsCS = (() => {
    if (!cs) return null;
    const custom = cs.custom_losses ?? [];
    const find = (re: RegExp) => custom.find((c) => re.test(c.name));
    return {
      soiling: monthlyUniform(cs.soiling_pct, 1, " %"),
      tm: cs.temperature_model,
      lid: cs.lid.mode === "pct" ? pct(cs.lid.pct, 1) : "Tidak diterapkan",
      quality: find(/quality|kualitas/i) ? monthlyUniform(find(/quality|kualitas/i)!.monthly_pct, 1, " %") : DASH,
      strings: find(/string/i) ? monthlyUniform(find(/string/i)!.monthly_pct, 1, " %") : DASH,
      mismatch: pct(cs.mismatch.pct, 1),
      degr: `${n(cs.degradation.annual_rate_pct, 2, { group: false })} %/year`,
      dcw: cs.dc_wiring.mode === "pct" ? `${n(cs.dc_wiring.pct, 1, { group: false })} % at STC` : "Tidak diterapkan",
      avail: cs.availability.mode === "annual" ? pct(cs.availability.pct, 1) : cs.availability.mode === "monthly" ? monthlyUniform(cs.availability.pct, 1, " %") : "Tidak diterapkan",
      acl: cs.ac_loss.mode === "pct" ? `${n(cs.ac_loss.pct, 2, { group: false })} % at STC` : "Tidak diterapkan",
      customOthers: custom.filter((c) => !/quality|kualitas|string/i.test(c.name)),
    };
  })();
  const tmRows = thermalRows(cs?.temperature_model);
  const iam = iamTable(result);
  const IAM_ANGLES = [0, 30, 50, 60, 70, 75, 80, 85, 90];
  const ws = o?.wire_schedule;
  const acEntries: any[] = Array.isArray(ws?.entries) ? ws.entries.filter((e: any) => /ac/.test(String(e.conductor_type))) : [];
  sim(undefined, (
    <>
      <Box title="Array losses">
        <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div><h5>Array Soiling Losses</h5><Row k="Loss Fraction" v={lossRowsCS?.soiling ?? DASH} /></div>
          <div><h5>Thermal Loss factor</h5>
            {tmRows ? <><div>{tmRows.heading}</div>{tmRows.rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}</> : <div>{DASH}</div>}
          </div>
          <div><h5>DC wiring losses</h5><Row k="Loss Fraction" v={lossRowsCS?.dcw ?? DASH} /></div>
          <div><h5>LID - Light Induced Degradation</h5><Row k="Loss Fraction" v={lossRowsCS?.lid ?? DASH} /></div>
          <div><h5>Module Quality Loss</h5><Row k="Loss Fraction" v={lossRowsCS?.quality ?? DASH} /></div>
          <div><h5>Module mismatch losses</h5><Row k="Loss Fraction" v={lossRowsCS?.mismatch ?? DASH} /></div>
          <div><h5>Strings Mismatch loss</h5><Row k="Loss Fraction" v={lossRowsCS?.strings ?? DASH} /></div>
          <div><h5>Module average degradation</h5><Row k="Year no" v={cs ? "1" : DASH} /><Row k="Loss factor" v={lossRowsCS?.degr ?? DASH} /></div>
          <div>{lossRowsCS?.customOthers.map((c) => <div key={c.name}><h5>{c.name}</h5><Row k="Loss Fraction" v={monthlyUniform(c.monthly_pct, 1, " %")} /></div>)}</div>
        </div>
        <h5 style={{ marginTop: 8 }}>IAM loss factor</h5>
        <div style={{ marginBottom: 4 }}>Incidence effect (IAM): {cs ? cs.iam : DASH}</div>
        <table className="sim-table"><tbody>
          <tr>{IAM_ANGLES.map((a) => <td key={a} style={{ textAlign: "center", fontWeight: 400 }}>{a}°</td>)}</tr>
          <tr>{IAM_ANGLES.map((a) => { const hit = iam?.find((x) => x.angle === a); return <td key={a} style={{ textAlign: "center", fontWeight: 400 }}>{hit ? n(hit.value, 3, { group: false }) : DASH}</td>; })}</tr>
        </tbody></table>
      </Box>
      <Box title="System losses">
        <h5>Unavailability of the system</h5>
        <Row k="Time fraction" v={lossRowsCS?.avail ?? DASH} />
      </Box>
      <Box title="AC wiring losses">
        <h5>Inv. output line up to injection point</h5>
        <Row k="Inverter voltage" v={isNum(ws?.ac_line_voltage_v) && ws.ac_line_voltage_v > 0 ? `${n(ws.ac_line_voltage_v, 0)} Vac${ws.ac_phase_system ? ` ${/^three_phase/.test(String(ws.ac_phase_system)) ? "tri" : /^single_phase/.test(String(ws.ac_phase_system)) ? "mono" : String(ws.ac_phase_system).replace(/_/g, " ")}` : ""}` : DASH} />
        <Row k="Loss Fraction" v={lossRowsCS?.acl ?? DASH} />
        <Row k="AC wiring loss at STC" v={isNum(ws?.ac_wiring_loss_stc_kw) && !(ws.ac_wiring_loss_stc_kw === 0 && cs?.ac_loss?.mode === "pct") ? `${n(ws.ac_wiring_loss_stc_kw, 2)} kW` : DASH} />
        <Row k="Wire section" v={acEntries.length ? `${text(acEntries[0].material)} ${n(acEntries[0].num_conductors, 0)} x ${n(acEntries[0].cross_section_mm2, 0)} mm²` : DASH} />
        <Row k="Average wires length" v={acEntries.length ? `${n(acEntries.reduce((a, e) => a + (isNum(e.one_way_length_m) ? e.one_way_length_m : 0), 0) / acEntries.length, 0)} m` : DASH} />
      </Box>
    </>
  ));

  // horizon + sun paths
  const hProfile = horizon ? [...horizon].map((q) => ({ az: Math.round(azP(q.azimuth_deg)), el: q.elevation_deg })).sort((a, b) => a.az - b.az) : null;
  const horizonLine: Array<[number, number]> | null = hProfile ? hProfile.map((q) => [q.az, q.el] as [number, number]) : null;
  const curves: SunCurve[] = SUN_DATES.map((d) => ({ label: d.label, num: d.key, segments: sunPathSegments(sun.data?.[d.key]?.samples, latDeg) }));
  // Hour lines join the same solar hour across the dates; only drawn when the engine answered in solar time.
  const hourLines: SunHourLine[] = [];
  if (SUN_DATES.every((d) => sun.data?.[d.key]?.time_basis === "solar")) {
    for (let hour = 7; hour <= 17; hour++) {
      const pts = SUN_DATES.map((d) => sun.data?.[d.key]?.samples.find((s) => s.minute_of_day === hour * 60))
        .filter((s): s is NonNullable<typeof s> => !!s && s.elevation_deg > 0)
        .map((s): [number, number] => [azP(s.azimuth_deg), s.elevation_deg]);
      const segments = splitAtAzimuthWrap(pts);
      if (segments.length) hourLines.push({ hour, segments });
    }
  }
  const albedoFactor = firstOf(shade.data, "albedo_factor", "horizon.albedo_factor") ?? firstOf(out(result), "horizon_albedo_factor");
  const sunBand = sunBandQuads(SUN_DATES.map((d) => sun.data?.[d.key]?.samples), latDeg);
  const horizonChunks: Array<typeof hProfile> = [];
  if (hProfile) for (let i = 0; i < hProfile.length; i += 14) horizonChunks.push(hProfile.slice(i, i + 14));
  sim("Horizon definition", (
    <Box title="Horizon definition">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Horizon: {horizon ? text((result?.input as any)?.horizon_source ?? lay?.engine_inputs?.horizon_source ?? "profil dari input simulasi") : DASH}</div>
      <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 6 }}>
        <Row k="Average Height" v={isNum(horizonAverage(horizon)) ? `${n(horizonAverage(horizon), 1)} °` : DASH} />
        <Row k="Diffuse Factor" v={isNum(horizonDiffuseFactor(horizon)) ? n(horizonDiffuseFactor(horizon), 2, { group: false }) : DASH} />
        <Row k="Albedo Factor / Fraction" v={isNum(albedoFactor) ? n(albedoFactor, 2, { group: false }) : `${DASH} tidak disediakan engine`} />
      </div>
      <h5 style={{ textAlign: "center" }}>Horizon profile</h5>
      {horizonChunks.length ? horizonChunks.map((ch, i) => (
        <table key={i} className="sim-table" style={{ marginBottom: 3 }}><tbody>
          <tr><td>Azimuth [°]</td>{ch!.map((q, j) => <td key={j}>{q.az}</td>)}</tr>
          <tr><td>Height [°]</td>{ch!.map((q, j) => <td key={j}>{n(q.el, 1, { group: false })}</td>)}</tr>
        </tbody></table>
      )) : <div>{DASH} profil horizon belum diambil (gunakan “Ambil horizon PVGIS”)</div>}
      <h5 style={{ marginTop: 8 }}>Sun Paths (Height / Azimuth diagram)</h5>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(ords.length ? ords : [{ id: "1", tilt: null, azimuth: null } as any]).slice(0, 4).map((x: any) => (
          <SunPathChart key={x.id} curves={curves} hourLines={hourLines} behind={isNum(x.tilt) && isNum(x.azimuth) ? behindPlaneSegments(x.tilt, azP(x.azimuth)) : undefined} horizon={horizonLine} band={sunBand} title={`Orientation #${x.id}`} subtitle={isNum(x.tilt) ? `Fixed plane, Tilts/azimuths: ${n(x.tilt, 0, { group: false })}°/ ${n(azP(x.azimuth), 0, { group: false })}°` : undefined} />
        ))}
      </div>
    </Box>
  ));

  // near shading 3D (+ iso note)
  const isoScene = lay ? buildIsoScene(lay) : null;
  const isoData = hasIsoData(iso.data) ? iso.data : null;
  const isoUsable = !!(shade.data && typeof shade.data === "object" && ((shade.data as any).iso || (shade.data as any).orientations?.some?.((x: any) => x?.iso)));
  sim("Near shading definition - Iso-shadings diagram", (
    <Box title="Near shadings parameter">
      <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 4 }}>Perspective of the PV-field and surrounding shading scene</div>
      {isoScene ? (
        <div style={{ border: "1px solid #cbd5e1", background: "#fff" }}><NearShadingScene layout={lay} height="125mm" /></div>
      ) : <div className="sim-note">{DASH} layout belum dimuat</div>}
      {!isoData && <div className="sim-note" style={{ marginTop: 8 }}>{isoUsable ? "Diagram iso-shading tersedia dari engine (lihat lampiran shade)." : isoMissingNote(iso)}</div>}
    </Box>
  ));

  // iso-shadings diagram: one sun-path chart per orientation with the engine's shading-loss contours
  if (isoData) {
    const isoOrients = isoData.orientations;
    for (let i = 0; i < isoOrients.length; i += 2) {
      sim(undefined, (
        <Box title="Iso-shadings diagram">
          {isoOrients.slice(i, i + 2).map((io, k) => {
            const tilt = io.orientation.tilt_deg, az = azP(io.orientation.azimuth_deg);
            return (
              <IsoShadingChart key={i + k} w={560} h={330}
                curves={curves} hourLines={hourLines} horizon={horizonLine} band={sunBand}
                behind={behindPlaneSegments(tilt, az)}
                contours={io.contours.map((c) => ({ level: c.level, segments: isoContourSegments(c, latDeg) }))}
                attenuation={isoAttenuationText(io, isoData.warnings)}
                title={`Orientation #${i + k + 1}`}
                subtitle={`Fixed plane, Tilts/azimuths: ${n(tilt, 0, { group: false })}°/ ${n(az, 0, { group: false })}°`} />
            );
          })}
        </Box>
      ));
    }
  }

  // main results
  const sumArr = (a: Array<number | null>) => (a.every(isNum) ? (a as number[]).reduce((x, y) => x + y, 0) : null);
  const dcK = isNum(dc) ? dc : null;
  const spec = (e: unknown) => (isNum(e) && dcK ? `${plain(e / dcK)} kWh/kWp/year` : DASH);
  const f = (v: number | null | undefined, d = 1) => (isNum(v) ? n(v, d, { group: false }) : DASH);
  const prArr = bal.pr ?? (dcK && eGrid.every(isNum) && globInc.every(isNum) ? eGrid.map((e, i) => ((globInc[i] as number) > 0 ? (e as number) / (dcK * (globInc[i] as number)) : null)) : null);
  const tAmbYear = bal.tAmb && bal.tAmb.every(isNum) ? bal.tAmb.reduce((a, b) => a + b, 0) / 12 : null;
  const tbl: Array<[string, string, Array<number | null> | null, number, boolean]> = [
    ["GlobHor", "kWh/m²", globHor, 1, true], ["DiffHor", "kWh/m²", bal.diffHor, 1, true], ["T_Amb", "°C", bal.tAmb, 2, false],
    ["GlobInc", "kWh/m²", globInc, 1, true], ["GlobEff", "kWh/m²", bal.globEff, 1, true], ["EArray", "kWh", bal.eArray, 0, true],
    ["E_Grid", "kWh", eGrid, 0, true], ["PR", "ratio", prArr, 3, false],
  ];
  const yearOf = (k: string, arr: Array<number | null> | null) => k === "T_Amb" ? tAmbYear : k === "PR" ? (dcK && sumArr(eGrid) !== null && sumArr(globInc) ? (sumArr(eGrid) as number) / (dcK * (sumArr(globInc) as number)) : null) : arr ? sumArr(arr) : null;
  const day = (v: number[] | null) => (v && v.every(isNum) ? (v as number[]).reduce((a, b) => a + b, 0) / 12 : null);
  sim("Main results", (
    <Box title="Main results">
      <h5>System Production</h5>
      <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <Row k="Produced Energy (P50)" v={isNum(o?.annual_p50_kwh) ? `${plain(o.annual_p50_kwh)} kWh/year` : DASH} />
          <Row k="Produced Energy (P90)" v={isNum(o?.annual_p90_kwh) ? `${plain(o.annual_p90_kwh)} kWh/year` : DASH} />
          <Row k="Produced Energy (P95)" v={isNum(o?.annual_p95_kwh) ? `${plain(o.annual_p95_kwh)} kWh/year` : DASH} />
        </div>
        <div>
          <Row k="Specific production (P50)" v={spec(o?.annual_p50_kwh)} />
          <Row k="Specific production (P90)" v={spec(o?.annual_p90_kwh)} />
          <Row k="Specific production (P95)" v={spec(o?.annual_p95_kwh)} />
          <Row k="Perf. Ratio PR" v={pct(o?.performance_ratio_pct, 2)} />
        </div>
      </div>
      <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
        <div>
          <h5 style={{ textAlign: "center" }}>Normalized productions (per installed kWp)</h5>
          <StackedBars labels={MONTHS_SHORT} yLabel="Normalized Energy [kWh/kWp/day]" series={[
            { name: "Lc: Collection Loss (PV-array losses)", color: "#7c3aed", values: bal.lc ?? [] },
            { name: "Ls: System Loss (inverter, ...)", color: "#15803d", values: bal.ls ?? [] },
            { name: "Yf: Produced useful energy (inverter output)", color: "#7f1d1d", values: bal.yf ?? [] },
          ]} legendNote={{ "Lc: Collection Loss (PV-array losses)": isNum(day(bal.lc)) ? `${n(day(bal.lc), 2)} kWh/kWp/day` : DASH, "Ls: System Loss (inverter, ...)": isNum(day(bal.ls)) ? `${n(day(bal.ls), 2)} kWh/kWp/day` : DASH, "Yf: Produced useful energy (inverter output)": isNum(day(bal.yf)) ? `${n(day(bal.yf), 2)} kWh/kWp/day` : DASH }} />
        </div>
        <div>
          <h5 style={{ textAlign: "center" }}>Performance Ratio PR</h5>
          <BarChart values={prArr} labels={MONTHS_SHORT} color="#7f1d1d" maxOverride={1.2} yLabel="Performance Ratio PR" fmt={(v) => v.toFixed(1)} />
        </div>
      </div>
      <h5 style={{ textAlign: "center", margin: "8px 0 3px" }}>Balances and main results</h5>
      <table className="sim-table">
        <thead>
          <tr><th />{tbl.map((r) => <th key={r[0]} style={{ textAlign: "center" }}>{r[0]}</th>)}</tr>
          <tr className="sub"><th />{tbl.map((r) => <th key={r[0]} style={{ textAlign: "center" }}>{r[1]}</th>)}</tr>
        </thead>
        <tbody>
          {MONTHS_EN.map((mn, i) => <tr key={mn}><td>{mn}</td>{tbl.map((r) => <td key={r[0]}>{r[2] && isNum(r[2][i]) ? f(r[2][i] as number, r[3]) : DASH}</td>)}</tr>)}
          <tr><td>Year</td>{tbl.map((r) => <td key={r[0]} style={{ fontWeight: 700 }}>{f(yearOf(r[0], r[2]), r[3])}</td>)}</tr>
        </tbody>
      </table>
      <div style={{ fontSize: 8.5, marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 12px" }}>
        {[["GlobHor", "Global horizontal irradiation"], ["DiffHor", "Horizontal diffuse irradiation"], ["T_Amb", "Ambient Temperature"], ["GlobInc", "Global incident in coll. plane"], ["GlobEff", "Effective Global, corr. for IAM and shadings"], ["EArray", "Effective energy at the output of the array (optimal_dc_power)"], ["E_Grid", "Energy injected into grid"], ["PR", "Performance Ratio (E_Grid / (kWp x GlobInc))"]].map(([a, b]) => <div key={a}><b style={{ display: "inline-block", width: 52 }}>{a}</b>{b}</div>)}
      </div>
    </Box>
  ));

  // loss diagram (PVsyst funnel; every helio stage and sub-loss, not-modeled ones greyed)
  const lossStages = lossTree(result);
  const modStats = moduleAreaStats(lay, result?.components?.module?.nameplate_w);
  sim("Loss diagram", <Box title="Loss diagram">{lossStages.length ? <LossDiagram stages={lossStages} moduleAreaM2={modStats.areaM2} moduleEffPct={modStats.effPct} /> : <div className="sim-note">{DASH} loss tree belum tersedia</div>}</Box>);

  // predefined graphs
  const dio = eng?.daily?.length ? eng.daily.map((d) => ({ month: d.month, day: d.day, x: d.glob_inc_kwh_m2, y: d.e_grid_kwh })) : dailyInOut(hr, cols, "poa_irradiance", "grid_power");
  // System output power: AC power of the plant, per 5 kW class (falls back to grid power when absent).
  const histCol = col(hr, "ac_power") ? "ac_power" : "grid_power";
  const hist = powerHistogram(hr, cols, histCol, 5);
  sim("Predef. graphs", (
    <Box title="Predef. graphs">
      <h5 style={{ textAlign: "center" }}>Daily Input/Output diagram</h5>
      <Scatter points={dio ? dio.map((q) => ({ x: q.x, y: q.y / 1000 })) : null} xLabel="Global incident in coll. plane [kWh/m²/day]" yLabel="Useful out system energy [MWh/day]" legend="Values from 01/01 to 31/12" h={225} />
      <h5 style={{ textAlign: "center", marginTop: 8 }}>System Output Power Distribution</h5>
      <StepHistogram bins={hist ? hist.map((b) => ({ from: b.from, to: b.to, value: b.energyMwh })) : null} xLabel="Useful out system energy [kW]" yLabel="Useful out system energy [MWh / class of 5 kW]" legend="Values from 01/01 to 31/12" h={225} note={hourly.status === "loading" ? "memuat data per jam dari engine…" : hourly.status === "ok" ? undefined : "data per jam tidak tersedia dari engine"} />
    </Box>
  ));

  // P50 - P90
  const mwh = (v: unknown) => (isNum(v) ? v / 1000 : null);
  const p50 = mwh(h1?.p50_kwh ?? unc?.p50_kwh ?? o?.annual_p50_kwh);
  const p90 = mwh(h1?.p90_kwh ?? o?.annual_p90_kwh);
  const p95 = mwh(h1?.p95_kwh ?? o?.annual_p95_kwh);
  const sigmaPct = h1?.sigma_pct ?? unc?.sigma_1y_pct;
  const zc = { p90: unc?.z?.p90 ?? Z.p90, p95: unc?.z?.p95 ?? Z.p95 };
  const sigmaMwh = sigmaEnergy(p50, sigmaPct, p90, p95, zc);
  const urows = uncertaintyRows(result);
  const wv = weatherVariability(result);
  sim("P50 - P90 evaluation", (
    <Box title="P50 - P90 evaluation">
      <div className="sim-cols" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <h5>Weather data</h5>
          <Row k="Source" v={sourceLabel(result)} />
          <Row k="Kind" v={unc ? (wv.fromSeries ? "Multi-year series" : "TMY") : DASH} />
          <Row k="Year-to-year variability (IAV)" v={isNum(wv.sigmaIavPct) ? `${pct(wv.sigmaIavPct, 1)}${wv.fromSeries ? ` (multi-year series${wv.yearCount ? `, ${wv.yearCount} years` : ""})` : wv.fromUser ? " (user input)" : ""}` : DASH} />
          {wv.fromSeries && isNum(wv.medianKwh) && <Row k="Multi-year median energy" v={`${n(wv.medianKwh / 1000, 1, { group: false })} MWh${isNum(wv.medianDeltaPct) ? ` (${n(wv.medianDeltaPct, 1, { group: false })}% vs TMY P50)` : ""}`} />}
          <h5 style={{ marginTop: 6 }}>Global variability (weather data + system)</h5>
          <Row k="Variability (quadratic sum)" v={isNum(sigmaPct) ? pct(sigmaPct, 1) : DASH} />
        </div>
        <div>
          <h5>Simulation and parameters uncertainties</h5>
          {urows.length ? urows.map((r) => <Row key={r.key} k={text(r.label)} v={isNum(r.sigma_pct) ? pct(r.sigma_pct, 1) : DASH} />) : <div>{DASH}</div>}
          <h5 style={{ marginTop: 6 }}>Annual production probability</h5>
          <Row k="Variability" v={isNum(sigmaMwh) ? `${n(sigmaMwh, 1, { group: false })} MWh` : DASH} />
          <Row k="P50" v={isNum(p50) ? `${n(p50, 1, { group: false })} MWh` : DASH} />
          <Row k="P90" v={isNum(p90) ? `${n(p90, 1, { group: false })} MWh` : DASH} />
          <Row k="P95" v={isNum(p95) ? `${n(p95, 1, { group: false })} MWh` : DASH} />
        </div>
      </div>
      <h5 style={{ textAlign: "center", margin: "8px 0 2px" }}>Probability distribution</h5>
      <NormalCurve p50={p50} sigma={sigmaMwh} simul={p50} markers={[{ name: "P90", x: p90, color: "#15803d" }, { name: "P95", x: p95, color: "#15803d" }]} />
      <div style={{ fontSize: 8.5, color: "#475569", marginTop: 4 }}>{text(unc?.formula)}</div>
    </Box>
  ));

  const total = pages.length;
  const tocEntries = pages.map((pg, i) => ({ title: pg.toc, no: i + 1 })).filter((x): x is { title: string; no: number } => !!x.title);
  const rendered = pages.map((pg, i) => pg.node(i + 1, total));

  /* ---------- company cover + revision page ---------- */
  const rows = Math.max(18, (m?.revisions ?? []).length);
  const ap = m?.approvals;
  const Sign = ({ slot }: { slot?: NonNullable<typeof ap>["prepared"] }) =>
    slot?.signed && slot.signature_url ? <img className="eng-sign" src={slot.signature_url} alt="tanda tangan" /> : null;
  const ownerLogo = projectId ? reportAssetUrl(projectId, "owner_logo") : "";
  const epcLogo = projectId ? reportAssetUrl(projectId, "epc_logo") : "";

  return (
    <div className="rpt-pages">
      <div className="no-print" style={{ width: "100%" }}><SourceNotice data={data} /></div>

      <Sheet>
        <div className="eng-cover-band">ENGINEERING CALCULATION</div>
        <div className="rpt-sheet-body" style={{ padding: "8mm 8mm" }}>
          <table className="eng-box" style={{ textAlign: "center" }}>
            <tbody>
              <tr><td style={{ width: "26%" }}>OWNER</td><td rowSpan={2} style={{ fontSize: 15, lineHeight: 1.9 }}>{text(m?.client || m?.owner_name || name)}<br />PV ROOFTOP – ONGRID <b>({variant})</b></td><td style={{ width: "26%" }}>EPC</td></tr>
              <tr>
                <td style={{ height: "30mm" }}>{ownerLogo ? <LogoImg src={ownerLogo} alt="logo owner" fallbackText={text(m?.owner_name)} /> : null}</td>
                <td>{epcLogo ? <LogoImg src={epcLogo} fallbackSrc={SOLAR_NUSANTARA_LOGO} alt="logo EPC" /> : <img className="eng-logo" src={SOLAR_NUSANTARA_LOGO} alt="EPC" />}</td>
              </tr>
            </tbody>
          </table>
          <div className="eng-rule" style={{ marginTop: "9mm" }} />
          <div className="eng-title">SIMULATION REPORT</div>
          <div className="eng-rule" />
          <table className="eng-box" style={{ marginTop: "8mm" }}>
            <tbody>
              {([["PROJECT ADDRESS", m?.project_address || lay?.site?.address], ["CLIENT", m?.client], ["EPC CONTRACTOR", m?.epc_contractor], ["DOCUMENT NO.", m?.doc_no], ["REV NO.", m?.rev]] as const).map(([k, v]) => (
                <tr key={k}><th style={{ width: "28%" }}>{k}</th><td>{text(v)}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="eng-box is-thin" style={{ marginTop: "8mm" }}>
            <thead><tr><th>Approval</th><th style={{ textAlign: "center" }}>Name</th><th style={{ textAlign: "center" }}>Date</th><th style={{ textAlign: "center" }}>Sign</th></tr></thead>
            <tbody>
              {([["PREPARED BY", ap?.prepared], ["CHECKED BY", ap?.checked], ["APPROVED BY", ap?.approved]] as const).map(([k, s]) => (
                <tr key={k}><td style={{ textDecoration: "underline" }}>{k}</td><td>{text(s?.name).toUpperCase()}</td><td>{s?.date ? dateLong(s.date).toUpperCase() : DASH}</td><td style={{ height: "13mm" }}><Sign slot={s} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sheet>

      <Sheet>
        <div className="rpt-sheet-body" style={{ padding: "6mm 8mm", position: "relative" }}>
          <table className="eng-box is-thin">
            <tbody>
              <tr>
                <td rowSpan={5} style={{ width: "26%", textAlign: "center" }}>{ownerLogo ? <LogoImg src={ownerLogo} alt="logo owner" fallbackText={text(m?.owner_name)} /> : null}</td>
                <td style={{ width: "20%" }}>Project name</td><td>{name}</td>
                <td rowSpan={5} style={{ width: "26%", textAlign: "center" }}>{epcLogo ? <LogoImg src={epcLogo} fallbackSrc={SOLAR_NUSANTARA_LOGO} alt="logo EPC" /> : <img className="eng-logo" src={SOLAR_NUSANTARA_LOGO} alt="EPC" />}</td>
              </tr>
              <tr><td>Project address</td><td>{text(m?.project_address || lay?.site?.address)}</td></tr>
              <tr><td>Doc No</td><td>{text(m?.doc_no)}</td></tr>
              <tr><td>Rev No</td><td>{text(m?.rev)}</td></tr>
              <tr><td>Effective date</td><td>{m?.effective_date ? dateLong(m.effective_date).toUpperCase() : DASH}</td></tr>
            </tbody>
          </table>
          <div style={{ margin: "5mm 0 2mm", textDecoration: "underline", fontSize: 12 }}>Revision History</div>
          <table className="eng-box is-thin">
            <thead><tr><th style={{ width: "10%", textAlign: "center" }}>Rev</th><th style={{ width: "24%", textAlign: "center" }}>Date</th><th style={{ textAlign: "center" }}>Description</th></tr></thead>
            <tbody>
              {Array.from({ length: rows }, (_, i) => {
                const r = m?.revisions?.[i];
                return <tr key={i}><td style={{ height: "7.5mm" }}>{r?.rev ?? ""}</td><td>{r?.date ? dateLong(r.date) : ""}</td><td>{r?.description ?? ""}</td></tr>;
              })}
            </tbody>
          </table>
          <div style={{ border: "1.5px solid #111", background: "#f2f2f2", minHeight: "45mm", marginTop: "6mm", padding: "2mm 3mm", fontSize: 12, whiteSpace: "pre-wrap" }}>
            <b style={{ textDecoration: "underline" }}>Notes :</b><br />{m?.notes ?? ""}
          </div>
          <img className="rpt-wm" src={SOLAR_NUSANTARA_LOGO} alt="" />
        </div>
      </Sheet>

      {rendered.map((node, i) => (i === 1 ? <TocPatch key="toc" entries={tocEntries}>{node}</TocPatch> : node))}
    </div>
  );
}

/** Replaces the TOC placeholder of simulation page 2 with the list built from the real page numbers. */
function TocPatch({ entries, children }: { entries: Array<{ title: string; no: number }>; children: ReactNode }) {
  return (
    <TocContext.Provider value={entries}>{children}</TocContext.Provider>
  );
}
const TocContext = createContext<Array<{ title: string; no: number }>>([]);
export function TocList() {
  const e = useContext(TocContext);
  return <>{e.map((x) => <div key={x.title} className="sim-toc-row"><span>{x.title}</span><i /><span>{x.no}</span></div>)}</>;
}
