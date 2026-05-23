import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/vite-proxy/tripadvisor": {
        target: "https://api.content.tripadvisor.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/vite-proxy\/tripadvisor/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("referer");
            proxyReq.setHeader("Referer", "http://localhost.localdomain");
            proxyReq.setHeader("Origin", "http://localhost.localdomain");
          });
        },
      },
    },
  },
});