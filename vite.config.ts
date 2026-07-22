import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Daybook — run your life from it",
        short_name: "Daybook",
        description: "Areas, projects, tasks, people, and trackers — one place to run your life from.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#20351f",
        theme_color: "#20351f",
        icons: [
          { src: "/icons/icon-any-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-any-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App-shell caching so the UI loads instantly and offline; live data still needs Supabase,
        // so this only avoids a blank white screen when the network briefly drops.
        globPatterns: ["**/*.{js,css,html,woff2,png,ico,svg}"],
        navigateFallback: "/index.html",
        // The main JS bundle is a single chunk that grows with every feature (it's ~2MB as of
        // v33) and workbox's default precache cap is 2 MiB — cross that and the *build* fails,
        // not just a warning. Raised with headroom so ordinary feature growth doesn't retrigger
        // this; if it's ever hit again, code-splitting the bundle (see the "chunks larger than
        // 500kB" build warning) is the real fix, this is just keeping the lights on.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin,
            handler: "NetworkFirst",
            options: { cacheName: "daybook-shell", networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
