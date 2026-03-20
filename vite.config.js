import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 로컬 개발 시 /api/* 요청을 Firebase Functions 에뮬레이터로 프록시
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001/janhyang-1e4bc/us-central1",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
