// Hand-drawn SVG charts (no chart library, no canvas). Every chart takes already-sourced numbers and
// renders an explicit "—" box when it has nothing to draw.
import { useId, type ReactNode } from "react";
import { DASH, isNum } from "./format";
import { normalCurve, phi } from "./probability";
import { ISO_LEVEL_STYLES, isoLevelStyle } from "./isoShading";

const FONT = "Arial, Helvetica, sans-serif";

export function ChartEmpty({ w, h, note }: { w: number; h: number; note?: string }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="tidak ada data">
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="4 3" />
      <text x={w / 2} y={h / 2} textAnchor="middle" fontFamily={FONT} fontSize="12" fill="#64748b">{DASH} {note ?? "data belum tersedia"}</text>
    </svg>
  );
}

export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * p;
}

function ticks(max: number, count = 5) {
  return Array.from({ length: count + 1 }, (_, i) => (max * i) / count);
}
const fmtTick = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}K` : Number.isInteger(v) ? String(v) : v.toFixed(1));

interface Frame { l: number; r: number; t: number; b: number }

function Axes({ w, h, f, yMax, yTicks = 5, yLabel, xLabels, ymin = 0, fmt = fmtTick }: {
  w: number; h: number; f: Frame; yMax: number; yTicks?: number; yLabel?: string; xLabels?: string[]; ymin?: number; fmt?: (v: number) => string;
}) {
  const ih = h - f.t - f.b, iw = w - f.l - f.r;
  const yAt = (v: number) => f.t + ih - ((v - ymin) / (yMax - ymin)) * ih;
  return (
    <g fontFamily={FONT} fontSize="9" fill="#475569">
      {ticks(yMax - ymin, yTicks).map((tv, i) => {
        const v = ymin + tv;
        return (
          <g key={i}>
            <line x1={f.l} x2={w - f.r} y1={yAt(v)} y2={yAt(v)} stroke="#e2e8f0" />
            <text x={f.l - 4} y={yAt(v) + 3} textAnchor="end">{fmt(v)}</text>
          </g>
        );
      })}
      <line x1={f.l} x2={f.l} y1={f.t} y2={h - f.b} stroke="#94a3b8" />
      <line x1={f.l} x2={w - f.r} y1={h - f.b} y2={h - f.b} stroke="#94a3b8" />
      {yLabel && <text transform={`translate(10 ${f.t + ih / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>}
      {xLabels?.map((l, i) => (
        <text key={i} x={f.l + (iw / xLabels.length) * (i + 0.5)} y={h - f.b + 12} textAnchor="middle">{l}</text>
      ))}
    </g>
  );
}

export function BarChart({ values, labels, color = "#f59e0b", yLabel, w = 460, h = 190, legend, maxOverride, fmt }: {
  values: Array<number | null | undefined> | null; labels: string[]; color?: string; yLabel?: string; w?: number; h?: number; legend?: string; maxOverride?: number; fmt?: (v: number) => string;
}) {
  if (!values || !values.some(isNum)) return <ChartEmpty w={w} h={h} />;
  const f: Frame = { l: 38, r: 8, t: 8, b: legend ? 38 : 22 };
  const yMax = maxOverride ?? niceMax(Math.max(...values.filter(isNum)));
  const ih = h - f.t - f.b, iw = w - f.l - f.r, bw = (iw / values.length) * 0.62;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img">
      <Axes w={w} h={h} f={f} yMax={yMax} yLabel={yLabel} xLabels={labels} fmt={fmt} />
      {values.map((v, i) => isNum(v) && (
        <rect key={i} x={f.l + (iw / values.length) * (i + 0.5) - bw / 2} width={bw} y={f.t + ih - (v / yMax) * ih} height={(v / yMax) * ih} fill={color} />
      ))}
      {legend && (
        <g fontFamily={FONT} fontSize="9" fill="#334155" fontWeight="700">
          <circle cx={w / 2 - 28} cy={h - 8} r="4" fill={color} />
          <text x={w / 2 - 20} y={h - 5}>{legend}</text>
        </g>
      )}
    </svg>
  );
}

export interface StackSeries { name: string; color: string; values: Array<number | null> }

export function StackedBars({ series, labels, yLabel, w = 440, h = 210, ymax, legendNote }: {
  series: StackSeries[]; labels: string[]; yLabel?: string; w?: number; h?: number; ymax?: number; legendNote?: Record<string, string>;
}) {
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (isNum(s.values[i]) ? (s.values[i] as number) : 0), 0));
  if (!series.length || !series.some((s) => s.values.some(isNum))) return <ChartEmpty w={w} h={h} />;
  const f: Frame = { l: 38, r: 8, t: 8, b: 22 };
  const yMax = ymax ?? niceMax(Math.max(...totals));
  const ih = h - f.t - f.b, iw = w - f.l - f.r, bw = (iw / n) * 0.62;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img">
      <Axes w={w} h={h} f={f} yMax={yMax} yLabel={yLabel} xLabels={labels} />
      {labels.map((_, i) => {
        let acc = 0;
        return series.map((s) => {
          const v = isNum(s.values[i]) ? (s.values[i] as number) : 0;
          const y = f.t + ih - ((acc + v) / yMax) * ih;
          const el = <rect key={`${i}-${s.name}`} x={f.l + (iw / n) * (i + 0.5) - bw / 2} width={bw} y={y} height={(v / yMax) * ih} fill={s.color} />;
          acc += v;
          return el;
        });
      })}
      <g fontFamily={FONT} fontSize="8.5" fill="#334155">
        <rect x={f.l + 6} y={f.t + 4} width={iw * 0.62} height={series.length * 12 + 4} fill="#fff" stroke="#94a3b8" opacity="0.92" />
        {series.map((s, i) => (
          <g key={s.name}>
            <rect x={f.l + 10} y={f.t + 8 + i * 12} width="9" height="8" fill={s.color} />
            <text x={f.l + 23} y={f.t + 15 + i * 12}>{s.name}{legendNote?.[s.name] ? `   ${legendNote[s.name]}` : ""}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

const PALETTE = ["#0e7490", "#b45309", "#16a34a", "#6d28d9", "#ea580c", "#2563eb", "#9ca3af", "#be185d", "#0f766e", "#a16207", "#7c3aed", "#dc2626"];

export function Donut({ slices, w = 420, h = 190, decimals = 1 }: { slices: Array<{ label: string; value: number; color?: string }>; w?: number; h?: number; decimals?: number }) {
  const data = slices.filter((s) => isNum(s.value) && s.value > 0);
  if (!data.length) return <ChartEmpty w={w} h={h} />;
  const total = data.reduce((a, s) => a + s.value, 0);
  const cx = w / 2, cy = h / 2 + 4, R = Math.min(h / 2 - 34, 60), r = R * 0.5;
  let a0 = -Math.PI / 2;
  const items = data.map((s, i) => {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
    const d = `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
    const res = { d, mid, color: s.color ?? PALETTE[i % PALETTE.length], label: s.label, value: s.value };
    a0 = a1;
    return res;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img">
      {items.map((it, i) => <path key={i} d={it.d} fill={it.color} stroke="#fff" strokeWidth="0.8" />)}
      <g fontFamily={FONT} fontSize="8.5" fontWeight="700" fill="#111827">
        {items.map((it, i) => {
          const x1 = cx + R * Math.cos(it.mid), y1 = cy + R * Math.sin(it.mid);
          const x2 = cx + (R + 10) * Math.cos(it.mid), y2 = cy + (R + 10) * Math.sin(it.mid);
          const right = Math.cos(it.mid) >= 0;
          return (
            <g key={i}>
              <polyline points={`${x1},${y1} ${x2},${y2} ${x2 + (right ? 8 : -8)},${y2}`} fill="none" stroke="#475569" strokeWidth="0.6" />
              <text x={x2 + (right ? 10 : -10)} y={y2 + 3} textAnchor={right ? "start" : "end"}>{it.label}: {it.value.toFixed(decimals)}%</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export interface WaterfallItem { kind: "total" | "loss" | "note"; label: string; value?: string; pct?: string }

/** Loss diagram: boxes carry the running energy value, arrows carry the stage loss. */
export function Waterfall({ items, w = 680, rowH = 25 }: { items: WaterfallItem[]; w?: number; rowH?: number }) {
  if (!items.length) return <ChartEmpty w={w} h={120} />;
  const h = items.length * rowH + 30;
  const x0 = 120, x1 = 300;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" fontFamily={FONT} fontSize="11">
      {items.map((it, i) => {
        const y = 10 + i * rowH;
        if (it.kind === "total") {
          return (
            <g key={i}>
              <path d={`M ${x0} ${y} L ${x1} ${y} L ${x1} ${y + rowH - 6} L ${(x0 + x1) / 2} ${y + rowH - 2} L ${x0} ${y + rowH - 6} Z`} fill="#fff" stroke="#111827" />
              <text x={(x0 + x1) / 2} y={y + 12} textAnchor="middle">{it.value ?? DASH}</text>
              <text x={x1 + 70} y={y + 12} fontWeight="700">{it.label}</text>
            </g>
          );
        }
        if (it.kind === "note") {
          return <text key={i} x={(x0 + x1) / 2} y={y + 14} textAnchor="middle" fill="#334155">{it.value}   <tspan x={x1 + 70} fontWeight="700" fill="#111827" textAnchor="start">{it.label}</tspan></text>;
        }
        return (
          <g key={i}>
            <path d={`M ${x1} ${y + 2} L ${x1 + 10} ${y + 8} L ${x1} ${y + 14}`} fill="none" stroke="#111827" />
            <text x={x1 + 18} y={y + 13}>{it.pct ?? DASH}</text>
            <text x={x1 + 70} y={y + 13}>{it.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Axis ranges like PVsyst's Predef. graphs: x 0..8 (integer ticks, wider only if the data is), y from -1. */
export function scatterAxes(points: Array<{ x: number; y: number }>) {
  const mx = Math.max(...points.map((p) => p.x)), my = Math.max(...points.map((p) => p.y));
  const xMax = Math.max(8, Math.ceil(mx));
  const yMax = Math.max(1, Math.ceil(my * 1.05));
  return { xMin: 0, xMax, yMin: -1, yMax, xTicks: Array.from({ length: xMax + 1 }, (_, i) => i), yTicks: Array.from({ length: yMax + 2 }, (_, i) => i - 1) };
}

/** Histogram axes: x to the next 100 kW above the last class, 100 kW ticks; y to a nice max in 5 steps. */
export function histogramAxes(bins: Array<{ from: number; to: number; value: number }>) {
  const last = Math.max(...bins.map((b) => b.to));
  const xMax = Math.max(100, Math.ceil(last / 100) * 100);
  const yMax = niceMax(Math.max(...bins.map((b) => b.value)));
  return { xMax, yMax, xTicks: Array.from({ length: xMax / 100 + 1 }, (_, i) => i * 100) };
}

function Legend({ x, y, label, kind }: { x: number; y: number; label: string; kind: "dot" | "line" }) {
  return (
    <g fontFamily={FONT} fontSize="9.5" fill="#111827">
      {kind === "dot" ? <circle cx={x + 6} cy={y} r="2.4" fill="none" stroke="#111827" strokeWidth="0.8" /> : <line x1={x} x2={x + 26} y1={y} y2={y} stroke="#111827" strokeWidth="1.6" />}
      <text x={x + (kind === "dot" ? 30 : 36)} y={y + 3.5}>{label}</text>
    </g>
  );
}

export function Scatter({ points, xLabel, yLabel, w = 640, h = 270, legend }: {
  points: Array<{ x: number; y: number }> | null; xLabel: string; yLabel: string; w?: number; h?: number; legend?: string;
}) {
  if (!points || !points.length) return <ChartEmpty w={w} h={h} />;
  const f: Frame = { l: 48, r: 10, t: 10, b: 32 };
  const ax = scatterAxes(points);
  const iw = w - f.l - f.r, ih = h - f.t - f.b;
  const X = (v: number) => f.l + (v / ax.xMax) * iw, Y = (v: number) => f.t + ih - ((v - ax.yMin) / (ax.yMax - ax.yMin)) * ih;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img">
      <g fontFamily={FONT} fontSize="9" fill="#475569">
        {ax.yTicks.map((v) => (<g key={v}><line x1={f.l} x2={w - f.r} y1={Y(v)} y2={Y(v)} stroke="#e2e8f0" /><text x={f.l - 4} y={Y(v) + 3} textAnchor="end">{v}</text></g>))}
        <line x1={f.l} x2={f.l} y1={f.t} y2={h - f.b} stroke="#94a3b8" />
        <line x1={f.l} x2={w - f.r} y1={h - f.b} y2={h - f.b} stroke="#94a3b8" />
        <text transform={`translate(10 ${f.t + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize="10">{yLabel}</text>
        {ax.xTicks.map((v) => <text key={v} x={X(v)} y={h - f.b + 12} textAnchor="middle">{v}</text>)}
        <text x={f.l + iw / 2} y={h - 4} textAnchor="middle" fontSize="10">{xLabel}</text>
      </g>
      {points.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r="1.7" fill="none" stroke="#111827" strokeWidth="0.6" />)}
      {legend && <Legend x={f.l + 14} y={f.t + 10} label={legend} kind="dot" />}
    </svg>
  );
}

export function StepHistogram({ bins, xLabel, yLabel, w = 640, h = 270, legend }: {
  bins: Array<{ from: number; to: number; value: number }> | null; xLabel: string; yLabel: string; w?: number; h?: number; legend?: string;
}) {
  if (!bins || !bins.length) return <ChartEmpty w={w} h={h} />;
  const f: Frame = { l: 48, r: 10, t: 10, b: 32 };
  const ax = histogramAxes(bins);
  const xm = ax.xMax, ym = ax.yMax;
  const iw = w - f.l - f.r, ih = h - f.t - f.b;
  const X = (v: number) => f.l + (v / xm) * iw, Y = (v: number) => f.t + ih - (v / ym) * ih;
  // step line like PVsyst: horizontal at each class value, vertical between classes, no fill
  let d = `M ${X(bins[0].from)} ${Y(0)}`;
  for (const b of bins) d += ` L ${X(b.from)} ${Y(b.value)} L ${X(b.to)} ${Y(b.value)}`;
  d += ` L ${X(bins[bins.length - 1].to)} ${Y(0)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img">
      <Axes w={w} h={h} f={f} yMax={ym} yLabel={yLabel} />
      <g fontFamily={FONT} fontSize="9" fill="#475569">
        {ax.xTicks.map((v) => <text key={v} x={X(v)} y={h - f.b + 12} textAnchor="middle">{v}</text>)}
        <text x={f.l + iw / 2} y={h - 4} textAnchor="middle" fontSize="10">{xLabel}</text>
      </g>
      <path d={d} fill="none" stroke="#111827" strokeWidth="1.2" />
      {legend && <Legend x={f.l + 14} y={f.t + 10} label={legend} kind="line" />}
    </svg>
  );
}

/** Normal density curve like PVsyst: x = E_Grid, P50 +- 4 sigma; y = standard-normal density on 0..0.5. */
export function NormalCurve({ p50, sigma, markers, simul, w = 640, h = 270, unit = "MWh" }: {
  p50: number | null; sigma: number | null; markers: Array<{ name: string; x: number | null; color: string }>; simul?: number | null; w?: number; h?: number; unit?: string;
}) {
  if (!isNum(p50) || !isNum(sigma) || sigma <= 0) return <ChartEmpty w={w} h={h} note="distribusi belum tersedia dari engine" />;
  const f: Frame = { l: 48, r: 14, t: 14, b: 32 };
  const { lo, hi, points } = normalCurve(p50, sigma);
  const iw = w - f.l - f.r, ih = h - f.t - f.b;
  const YM = 0.5;
  const X = (x: number) => f.l + ((x - lo) / (hi - lo)) * iw, Y = (v: number) => f.t + ih - (v / YM) * ih;
  const pts = points.map((q) => `${X(q.x)},${Y(q.y)}`).join(" ");
  const xt = Array.from({ length: 9 }, (_, i) => lo + ((hi - lo) * i) / 8);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" fontFamily={FONT} fontSize="9">
      {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((v) => (<g key={v}><line x1={f.l} x2={w - f.r} y1={Y(v)} y2={Y(v)} stroke="#e2e8f0" /><text x={f.l - 4} y={Y(v) + 3} textAnchor="end" fill="#475569">{v.toFixed(1)}</text></g>))}
      <line x1={f.l} x2={f.l} y1={f.t} y2={h - f.b} stroke="#94a3b8" />
      <line x1={f.l} x2={w - f.r} y1={h - f.b} y2={h - f.b} stroke="#94a3b8" />
      {xt.map((x, i) => <text key={i} x={X(x)} y={h - f.b + 12} textAnchor="middle" fill="#475569">{x.toFixed(0)}</text>)}
      <text x={f.l + iw / 2} y={h - 4} textAnchor="middle" fontSize="10" fill="#475569">E_Grid system production [{unit}]</text>
      <text transform={`translate(10 ${f.t + ih / 2}) rotate(-90)`} textAnchor="middle" fill="#475569">Probability density</text>
      <polyline points={pts} fill="none" stroke="#111827" strokeWidth="1.6" />
      {isNum(simul) && <><circle cx={X(simul)} cy={Y(phi(simul, p50, sigma))} r="4" fill="#f59e0b" /><text x={X(simul) + 8} y={Y(phi(simul, p50, sigma)) - 4} fill="#d97706">E_Grid simul = {simul.toFixed(1)} {unit}</text></>}
      {markers.filter((m) => isNum(m.x)).map((m) => (
        <g key={m.name}>
          <circle cx={X(m.x as number)} cy={Y(phi(m.x as number, p50, sigma))} r="3.5" fill={m.color} />
          <text x={X(m.x as number) - 7} y={Y(phi(m.x as number, p50, sigma)) + 3} textAnchor="end" fill={m.color}>{m.name} = {(m.x as number).toFixed(1)} {unit}</text>
        </g>
      ))}
    </svg>
  );
}

export interface SunCurve { label: string; num: string; /** time-ordered polylines (cut at the +-180 azimuth edge) */ segments: Array<Array<[number, number]>> }
export interface SunHourLine { hour: number; segments: Array<Array<[number, number]>> }

/**
 * Height / azimuth diagram in the PVsyst convention: azimuth runs 180 .. -180 left to right, 0 is the
 * direction of the equator, east is negative. Curves are engine sun positions; `band` is the swept
 * region between the solstice paths; hour lines join the same solar hour across the dates.
 */
export interface SunPathCtx { X: (az: number) => number; Y: (el: number) => number; f: Frame; iw: number; ih: number }

export function SunPathChart({ curves, hourLines, behind, horizon, band, title, subtitle, w = 340, h = 210, extra }: {
  curves: SunCurve[]; hourLines?: SunHourLine[]; behind?: Array<Array<[number, number]>>; band?: Array<Array<[number, number]>>; horizon: Array<[number, number]> | null; title: string; subtitle?: string; w?: number; h?: number; extra?: ReactNode | ((c: SunPathCtx) => ReactNode);
}) {
  const f: Frame = { l: 34, r: 8, t: 8, b: 26 };
  const iw = w - f.l - f.r, ih = h - f.t - f.b;
  const X = (az: number) => f.l + ((180 - az) / 360) * iw, Y = (el: number) => f.t + ih - (el / 90) * ih;
  const usable = curves.filter((c) => c.segments.some((s) => s.length > 1));
  const line = (pts: Array<[number, number]>) => pts.map(([a, e]) => `${X(a)},${Y(e)}`).join(" ");
  // unique per instance: the same title ("Orientation #1") appears on the horizon page and the iso page
  const clipId = `sp-clip-${useId().replace(/\W+/g, "")}`;
  return (
    <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 12 }}>{title}</div>
      {subtitle && <div style={{ textAlign: "center", fontWeight: 600, fontSize: 9.5, color: "#1d4ed8" }}>{subtitle}</div>}
      {!usable.length ? <ChartEmpty w={w} h={h} note="posisi matahari belum tersedia" /> : (
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" fontFamily={FONT} fontSize="8.5">
          <defs><clipPath id={clipId}><rect x={f.l} y={f.t} width={iw} height={ih} /></clipPath></defs>
          <rect x={f.l} y={f.t} width={iw} height={ih} fill="#fff" />
          <g clipPath={`url(#${clipId})`}>
            {(band ?? []).flatMap((q, i) => [-360, 0, 360].map((sh) => <polygon key={`band${i}-${sh}`} points={line(q.map(([a, e]) => [a + sh, e] as [number, number]))} fill="#fde047" stroke="#fde047" strokeWidth="0.5" />))}
          </g>
          <rect x={f.l} y={f.t} width={iw} height={ih} fill="none" stroke="#111827" />
          {[0, 15, 30, 45, 60, 75, 90].map((e) => <text key={e} x={f.l - 4} y={Y(e) + 3} textAnchor="end" fill="#475569">{e}</text>)}
          {[180, 150, 120, 90, 60, 30, 0, -30, -60, -90, -120, -150, -180].map((a) => <text key={a} x={X(a)} y={h - f.b + 11} textAnchor="middle" fill="#475569">{a}</text>)}
          <text x={f.l + iw / 2} y={h - 3} textAnchor="middle" fill="#475569">Azimuth [°]</text>
          <text transform={`translate(8 ${f.t + ih / 2}) rotate(-90)`} textAnchor="middle" fill="#475569">Sun height [°]</text>
          {(hourLines ?? []).map((hl) => hl.segments.filter((s) => s.length > 1).map((s, i) => (
            <g key={`h${hl.hour}-${i}`}>
              <polyline points={line(s)} fill="none" stroke="#374151" strokeWidth="0.55" />
              {i === 0 && hl.hour !== 12 && <text x={X(s[0][0]) + (s[0][0] > 0 ? 2 : -2)} y={Y(s[0][1]) - 2} textAnchor={s[0][0] > 0 ? "start" : "end"} fontSize="7" fill="#111827">{hl.hour}h</text>}
            </g>
          )))}
          {usable.map((c) => {
            // number circle at the highest point of the path (solar noon)
            let top: [number, number] = c.segments[0][0];
            for (const sg of c.segments) for (const p of sg) if (p[1] > top[1]) top = p;
            return (
              <g key={c.num}>
                {c.segments.filter((s) => s.length > 1).map((s, i) => <polyline key={i} points={line(s)} fill="none" stroke="#111827" strokeWidth="0.9" />)}
                {c.segments.filter((s) => s.length > 3).map((s, i) => {
                  const k = Math.max(1, Math.floor(s.length / 3));
                  const [x1, y1, x2, y2] = [X(s[k - 1][0]), Y(s[k - 1][1]), X(s[k][0]), Y(s[k][1])];
                  const ang = Math.atan2(y2 - y1, x2 - x1), L = 4.5;
                  const pt = (a: number) => `${x2 - L * Math.cos(ang + a)},${y2 - L * Math.sin(ang + a)}`;
                  return <polygon key={`ar${i}`} points={`${x2},${y2} ${pt(0.4)} ${pt(-0.4)}`} fill="#111827" />;
                })}
                <circle cx={X(top[0])} cy={Y(top[1])} r="5" fill="#fff" stroke="#111827" strokeWidth="0.6" />
                <text x={X(top[0])} y={Y(top[1]) + 3} textAnchor="middle" fontWeight="700" fontSize="7">{c.num}</text>
              </g>
            );
          })}
          {(behind ?? []).map((sg, i) => <polyline key={`b${i}`} points={line(sg)} fill="none" stroke="#1d4ed8" strokeWidth="1.3" />)}
          {(behind ?? []).length > 0 && (() => {
            const pts = behind!.flat();
            const mid = pts.reduce((a, p) => (p[1] > a[1] ? p : a), pts[0]);
            return <text x={X(mid[0])} y={Y(mid[1]) - 3} fontSize="7" fill="#1d4ed8" textAnchor="middle">Behind the plane</text>;
          })()}
          {horizon && horizon.length > 1 && (
            <polyline points={horizon.map(([a, e]) => `${X(a)},${Y(e)}`).join(" ")} fill="none" stroke="#111827" strokeWidth="1.6" />
          )}
          <g fill="#111827" fontSize="8">
            {usable.map((c, i) => <text key={`lg${c.num}`} x={X(0) - 36} y={Y(46) + i * 9}>{c.num}: {c.label}</text>)}
          </g>
          {typeof extra === "function" ? extra({ X, Y, f, iw, ih }) : extra}
        </svg>
      )}
    </div>
  );
}

export interface IsoContourLine { level: number; segments: Array<Array<[number, number]>> }

/**
 * PVsyst "Iso-shadings diagram": the full sun-path diagram of one orientation with the shading-loss
 * contours on top. Contours arrive already in the sun-path azimuth convention (see isoShading.ts).
 */
export function IsoShadingChart({ contours, attenuation, ...sun }: { contours: IsoContourLine[]; attenuation: string } & Parameters<typeof SunPathChart>[0]) {
  return (
    <SunPathChart
      {...sun}
      extra={({ X, Y, f, iw }) => (
        <g data-testid="iso-overlay">
          {contours.map((c) => {
            const st = isoLevelStyle(c.level);
            return c.segments.filter((s) => s.length > 1).map((s, i) => (
              <polyline key={`${c.level}-${i}`} data-level={c.level} points={s.map(([a, e]) => `${X(a)},${Y(e)}`).join(" ")} fill="none" stroke="#000" strokeWidth={st.width} strokeDasharray={st.dash} />
            ));
          })}
          <g fontSize="8.5" fill="#111827" data-testid="iso-legend">
            {ISO_LEVEL_STYLES.map((st, i) => (
              <g key={st.level}>
                <line x1={f.l + 6} x2={f.l + 36} y1={f.t + 9 + i * 10} y2={f.t + 9 + i * 10} stroke="#000" strokeWidth={st.width} strokeDasharray={st.dash} />
                <text x={f.l + 40} y={f.t + 12 + i * 10}>{st.label}</text>
              </g>
            ))}
          </g>
          <text x={f.l + iw / 2} y={f.t + 14} textAnchor="middle" fontSize="10" fontWeight="700" fill="#111827" data-testid="iso-attenuation">
            {attenuation.split(" and ").map((ln, i) => <tspan key={i} x={f.l + iw / 2} dy={i === 0 ? 0 : 12}>{i === 0 ? ln : `and ${ln}`}</tspan>)}
          </text>
        </g>
      )}
    />
  );
}
