import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-netlify",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => assetInfo.names.some((name) => name.includes("pdf.worker.min"))
          ? "assets/pdf.worker.min.mjs"
          : "assets/[name]-[hash][extname]",
      },
    },
  },
});
