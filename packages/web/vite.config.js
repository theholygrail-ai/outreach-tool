import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    port: 9001,
    strictPort: false,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:9002",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
