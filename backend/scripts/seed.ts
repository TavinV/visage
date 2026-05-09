/**
 * Script de Seed — Criar Planos Iniciais
 * 
 * Executa: npx ts-node scripts/seed.ts
 */

import { prisma } from "../src/lib/prisma";

const PLANOS = [
  {
    name: "Gratuito",
    maxClasses: 5,
    priceMonthly: 0,
  },
  {
    name: "Profissional",
    maxClasses: 50,
    priceMonthly: 299,
  },
  {
    name: "Empresarial",
    maxClasses: 999,
    priceMonthly: 9999,
  },
];

async function main() {
  console.log("🌱 Criando planos iniciais...");

  for (const plano of PLANOS) {
    const existente = await prisma.plan.findFirst({
      where: { name: plano.name },
    });

    if (existente) {
      console.log(`✓ Plano "${plano.name}" já existe`);
      continue;
    }

    const criado = await prisma.plan.create({
      data: {
        ...plano,
        isActive: true,
      },
    });

    console.log(`✓ Plano criado: "${criado.name}" (ID: ${criado.id})`);
  }

  console.log("✅ Seed concluído com sucesso!");
}

main()
  .catch((error) => {
    console.error("❌ Erro no seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
