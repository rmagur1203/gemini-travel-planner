import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    base: process.env.BASE_URL || "./",
    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.MAP_ID": JSON.stringify(env.MAP_ID),
      "process.env.MAP_API_KEY": JSON.stringify(env.MAP_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    build: {
      target: "es2022",
      rollupOptions: {
        output: {
          format: "es",
        },
      },
    },
    esbuild: {
      target: "es2022",
      format: "esm",
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "es2022",
        format: "esm",
      },
    },
  };
});
