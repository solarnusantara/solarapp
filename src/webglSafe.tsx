import * as THREE from "three";

/**
 * `new THREE.WebGLRenderer()` throws "Error creating WebGL context." when the browser refuses a
 * context: hardware acceleration off, GPU blocklisted, or Chrome blocking 3D APIs for the site
 * after its GPU process crashed. Uncaught, that throw reaches the ErrorBoundary and takes the
 * whole page with it (Laporan Engineering and PV Layout 3D, 2026-11-25). Returning null lets the
 * caller swap one viewport for <WebGLUnavailable /> and keep the rest of the page.
 */
export function createRendererSafe(params: THREE.WebGLRendererParameters): THREE.WebGLRenderer | null {
  try {
    return new THREE.WebGLRenderer(params);
  } catch (err) {
    console.warn("WebGL tidak tersedia, viewport 3D diganti fallback:", err);
    return null;
  }
}

/**
 * `dispose()` frees buffers and textures but leaves the WebGL context alive until the canvas is
 * garbage-collected. Both 3D views rebuild their renderer whenever the sun hour changes, so
 * without `forceContextLoss()` contexts pile up faster than GC hands them back.
 */
export function releaseRenderer(renderer: THREE.WebGLRenderer) {
  try {
    renderer.dispose();
  } catch {}
  try {
    renderer.forceContextLoss();
  } catch {}
}

export function WebGLUnavailable({
  lang = "id",
  theme = "dark",
  height = "100%",
}: {
  lang?: "id" | "en";
  theme?: "light" | "dark";
  height?: number | string;
}) {
  const id = lang === "id";
  const dark = theme === "dark";
  return (
    <div
      role="status"
      style={{
        height,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "12px 18px",
        boxSizing: "border-box",
        textAlign: "center",
        background: dark ? "#0b1220" : "#f1f5f9",
        color: dark ? "#cbd5e1" : "#334155",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ fontSize: 13, color: dark ? "#f1f5f9" : "#0f172a" }}>
        {id ? "Tampilan 3D tidak bisa dibuat di browser ini" : "3D view is unavailable in this browser"}
      </strong>
      <span style={{ maxWidth: 520 }}>
        {id
          ? "Browser menolak membuat konteks WebGL. Biasanya karena akselerasi grafis (hardware acceleration) mati, atau GPU browser sempat crash lalu Chrome memblokir 3D untuk situs ini. Aktifkan akselerasi grafis di pengaturan browser, lalu tutup semua jendela browser dan buka lagi. Bagian lain tidak terpengaruh."
          : "The browser refused to create a WebGL context. This usually means hardware acceleration is off, or the browser's GPU crashed and Chrome blocked 3D for this site. Turn on hardware acceleration in the browser settings, then close every browser window and reopen it. The rest of the page is unaffected."}
      </span>
    </div>
  );
}
