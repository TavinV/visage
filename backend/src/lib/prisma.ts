/**
 * Prisma Client — Singleton
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      {
        emit: "event",
        level: "query",
      },
      {
        emit: "event",
        level: "error",
      },
      {
        emit: "event",
        level: "warn",
      },
    ],
  });

// Log queries em desenvolvimento (desabilitado por padrão)
// Prisma $on events têm typing complexo em versions recentes
// Se precisar de logs de query, configure via DATABASE_URL ou use Prisma Studio
if (false) {
  // prisma.$on events aqui
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
