import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: { external: ["electron"], output: { format: "cjs" } },
    },
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    resolve: { alias: { "@": resolve("src/renderer/src") } },
    server: { port: 43127, strictPort: true },
  },
});
