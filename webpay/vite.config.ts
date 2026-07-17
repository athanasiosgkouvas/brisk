import { defineConfig } from "vite";

// Served by the Brisk backend under /pay/ (express.static + SPA fallback), so the
// asset base must match. Output goes to webpay/dist, which the backend serves.
export default defineConfig({
  base: "/pay/",
  build: { outDir: "dist", emptyOutDir: true },
});
