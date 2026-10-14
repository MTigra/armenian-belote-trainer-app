import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
const base = process.env.VITE_BASE_PATH || "/";
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Базар блот",
        short_name: "Блот",
        lang: "ru",
        theme_color: "#102c26",
        background_color: "#0c221d",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}icon.svg`,
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,svg}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@blot/game-core": fileURLToPath(
        new URL(
          "../game-core/build/dist/js/productionLibrary/armenian-belote-trainer-game-core.mjs",
          import.meta.url,
        ),
      ),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("game-core/build/dist/")) return "rules";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          )
            return "react";
        },
      },
    },
  },
  server: {
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
    proxy: { "/api": { target: "http://127.0.0.1:8080", ws: true } },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
