import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "./static",
  base: "/rive-viewer/",
  publicDir: "../public/rive-viewer",
  plugins: [react()],
  build: {
    outDir: "../dist-static",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020",
  },
});
