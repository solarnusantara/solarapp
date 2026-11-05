// PVsyst-style loss diagram: a funnel whose width follows the energy that remains, a small curved
// arrow leaving (loss) or entering (gain) on the right of each stage, "-x.xx%" next to it, label further right.
import type { StageSummary } from "../engine/types";
import { ChartEmpty } from "./charts";
import { buildLossDiagram, type LossDiagramOpts, type LossRow } from "./lossDiagram";

const FONT = "Arial, Helvetica, sans-serif";
const CX = 235, HW = 120; // funnel centre x and full half-width

export default function LossDiagram({ stages, ...opts }: { stages: StageSummary[] } & LossDiagramOpts) {
  const d = buildLossDiagram(stages, opts);
  const w = 700;
  if (!d.rows.length) return <ChartEmpty w={w} h={120} note="loss tree belum tersedia" />;
  const xr = (r: { frac: number }) => CX + HW * r.frac;
  const arrow = (r: LossRow) => {
    const x = CX + HW * r.frac, y = r.y;
    const gain = (r.deltaPct ?? 0) > 0;
    const col = r.notModeled ? "#9ca3af" : "#111827";
    // hook leaving the funnel edge; the head points away for a loss and back at the funnel for a gain
    return (
      <g stroke={col} fill="none" strokeWidth="0.9">
        <path d={`M ${x} ${y - 5} C ${x + 9} ${y - 5} ${x + 9} ${y + 5} ${x + 2} ${y + 5}`} />
        {gain ? <path d={`M ${x + 5} ${y + 2} L ${x + 2} ${y + 5} L ${x + 5} ${y + 8}`} /> : <path d={`M ${x + 5} ${y + 2} L ${x + 9} ${y + 1} L ${x + 8} ${y + 6}`} />}
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${w} ${d.height}`} width="100%" role="img" aria-label="Loss diagram" fontFamily={FONT} fontSize="10">
      {d.funnels.map((f) => {
        const right = f.profile.map((p) => `${CX + HW * p.frac},${p.y}`);
        const left = [...f.profile].reverse().map((p) => `${CX - HW * p.frac},${p.y}`);
        const last = f.profile[f.profile.length - 1];
        const first = f.profile[0];
        // flat top with a shallow V notch (input arrow), pointed bottom (output arrow)
        const pts = [`${CX - HW * first.frac},${f.top}`, `${CX},${f.top + 6}`, `${CX + HW * first.frac},${f.top}`, ...right, `${CX + HW * last.frac},${f.bottom - 2}`, `${CX},${f.bottom + 8}`, `${CX - HW * last.frac},${f.bottom - 2}`, ...left];
        return <polygon key={f.section} points={pts.join(" ")} fill="none" stroke="#111827" strokeWidth="0.9" />;
      })}
      {d.rows.map((r, i) => {
        const grey = r.notModeled ? "#9ca3af" : "#111827";
        if (r.kind === "milestone") {
          return (
            <g key={i}>
              <text x={CX} y={r.y + 4} textAnchor="middle" fill={grey}>{r.value}</text>
              <text x={w - 250} y={r.y + 4} fontWeight="700" fill={grey}>{r.label}</text>
            </g>
          );
        }
        if (r.kind === "info") {
          return (
            <g key={i}>
              <text x={CX} y={r.y + 4} textAnchor="middle">{r.value}</text>
              <text x={w - 250} y={r.y + 4}>{r.label}</text>
            </g>
          );
        }
        return (
          <g key={i}>
            {arrow(r)}
            <text x={xr(r) + 16} y={r.y + 4} fill={grey} fontStyle={r.notModeled ? "italic" : undefined}>{r.pct}</text>
            <text x={w - 250 + (r.kind === "sub" ? 8 : 0)} y={r.y + 4} fill={grey} fontStyle={r.notModeled ? "italic" : undefined} fontSize={r.kind === "sub" ? 10 : 10.5}>{r.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
