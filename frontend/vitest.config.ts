import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Testes do console e do totem.
 *
 * Ambiente jsdom porque quase tudo aqui toca `window`: token store
 * (localStorage/sessionStorage), api client (fetch) e formatação em pt-BR.
 * As requisições são interceptadas pelo msw — nenhum teste sai para a rede.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts", "src/components/**/*.{ts,tsx}"],
    },
  },
});
