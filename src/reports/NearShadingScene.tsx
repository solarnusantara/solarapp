// Print-only static render for "Near shadings parameter": fixed south-east isometric camera, white
// background, light grid, "North" / "East" labels. No interactive UI, deterministic SVG.
import type { SavedLayout } from "../engine/layoutStore";
import { buildIsoScene, type IsoKind } from "./isoProjection";

const FILL: Record<IsoKind, { fill: string; stroke: string; sw: number }> = {
  grid: { fill: "none", stroke: "#e5e7eb", sw: 0 },
  site: { fill: "#e5e7eb", stroke: "#9ca3af", sw: 0.8 },
  slab: { fill: "#9ca3af", stroke: "#6b7280", sw: 0.6 },
  walkway: { fill: "#d1d5db", stroke: "#9ca3af", sw: 0.4 },
  module: { fill: "#7b7fe0", stroke: "#3f3fa8", sw: 0.5 },
  "obstacle-top": { fill: "#6b7280", stroke: "#374151", sw: 0.6 },
  "obstacle-side": { fill: "#4b5563", stroke: "#374151", sw: 0.6 },
  "obstacle-flat": { fill: "#6b7280", stroke: "#374151", sw: 0.5 },
};

export default function NearShadingScene({ layout, height = "125mm" }: { layout: SavedLayout | null | undefined; height?: string }) {
  const scene = buildIsoScene(layout);
  if (!scene) return null;
  const { viewBox: v } = scene;
  const u = v.w / 800; // stroke scale: widths are in px of an 800 px wide drawing
  const pts = (p: Array<[number, number]>) => p.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" ");
  return (
    <svg viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} width="100%" style={{ height, background: "#fff" }} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Perspective of the PV-field and surrounding shading scene">
      <rect x={v.x} y={v.y} width={v.w} height={v.h} fill="#fff" />
      <g stroke="#e5e7eb" strokeWidth={u * 0.7} fill="none">{scene.gridLines.map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />)}</g>
      {scene.axisLines.map((l) => <line key={l.kind} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke={l.kind === "east" ? "#ef4444" : "#22c55e"} strokeWidth={u} strokeDasharray={`${u * 2} ${u * 3}`} />)}
      {scene.polys.map((p, i) => {
        const s = FILL[p.kind];
        return <polygon key={i} points={pts(p.pts)} fill={s.fill} stroke={s.stroke} strokeWidth={u * s.sw} strokeLinejoin="round" />;
      })}
      {scene.labels.map((l) => <text key={l.text} x={l.at[0]} y={l.at[1] + u * 4} textAnchor={l.anchor} fontFamily="Arial, Helvetica, sans-serif" fontSize={u * 22} fill="#6b7280">{l.text}</text>)}
    </svg>
  );
}
