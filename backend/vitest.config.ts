import { defineConfig } from "vitest/config";

/**
 * Tiers de teste (ver .claude/testing.md):
 *   tests/unit         — sem I/O; Prisma, Redis e engine mockados. Roda sempre.
 *   tests/integration  — Express real via supertest, ainda com Prisma/Redis mockados.
 *   tests/db           — exige Postgres de verdade; fora do `npm test` padrão.
 *
 * TEST_TIER escolhe o recorte: `npm run test:unit`, `test:integration`, `test:db`.
 */
const tier = process.env.TEST_TIER;

const includeByTier: Record<string, string[]> = {
  unit: ["tests/unit/**/*.test.ts"],
  integration: ["tests/integration/**/*.test.ts"],
  db: ["tests/db/**/*.test.ts"],
};

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    // Sem TEST_TIER: unit + integration (tudo que roda sem banco)
    include: includeByTier[tier ?? ""] ?? [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types/**"],
    },
  },
});
