import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

export default defineConfig(({ command }) => {
  const isInsideMonolith = fs.existsSync(path.resolve(__dirname, "../../Cargo.toml"));
  const forceStandalone = process.env.STANDALONE === "true";
  const isERP = isInsideMonolith && !forceStandalone;

  const base = command === "serve" || !isERP ? "/" : "/static/apps/solar-studio/";
  const outDir = isERP ? "../../static/apps/solar-studio" : "dist";

  return {
    plugins: [react()],
    base,
    build: {
      outDir,
      emptyOutDir: !isERP,
      rollupOptions: {
        output: {
          entryFileNames: "solar-studio.js",
          chunkFileNames: "solar-studio-[name].js",
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith(".css")) {
              return "solar-studio.css";
            }
            return "solar-studio-[name].[ext]";
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
    },
  };
});
