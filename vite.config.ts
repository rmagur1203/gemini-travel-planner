import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    root: "./",
    publicDir: "public",
    build: {
      outDir: "dist",
      rollupOptions: {
        input: {
          main: "index.html",
        },
      },
    },
    server: {
      port: 3000,
      open: true,
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
  };
});
