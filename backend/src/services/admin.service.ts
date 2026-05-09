/**
 * Admin Service
 * Bootstrap de Super Admin — criado UMA ÚNICA VEZ via variáveis de ambiente
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                         SUPER ADMIN — REGRA CRÍTICA                       ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                           ║
 * ║ O cargo "super_admin" existe APENAS UMA VEZ no sistema, criado durante   ║
 * ║ o boot da aplicação a partir das variáveis de ambiente:                  ║
 * ║                                                                           ║
 * ║   SUPER_ADMIN_EMAIL      (obrigatório)                                   ║
 * ║   SUPER_ADMIN_PASSWORD   (obrigatório, >= 12 caracteres)                 ║
 * ║                                                                           ║
 * ║ Não há:                                                                   ║
 * ║   • Endpoint para criar Super Admin (endpoint POST /users não cria)       ║
 * ║   • Função para promover usuário para Super Admin                        ║
 * ║   • Seed ou migration que crie Super Admin                               ║
 * ║   • Forma de criar mais de um Super Admin                                ║
 * ║                                                                           ║
 * ║ Se o Super Admin já existe (bootstrapSuperAdmin foi executado antes),    ║
 * ║ esta função retorna sem fazer nada (idempotente).                        ║
 * ║                                                                           ║
 * ║ Para alterar a senha do Super Admin:                                     ║
 * ║   1. Mude SUPER_ADMIN_PASSWORD no .env                                   ║
 * ║   2. Reinicie o backend — a função o detectará e atualizará              ║
 * ║      (TODO: implementar atualização de senha quando já existe)            ║
 * ║                                                                           ║
 * ║ IMPORTANTE: Em produção, use variáveis de ambiente de forma segura       ║
 * ║ (AWS Secrets Manager, HashiCorp Vault, etc.)                             ║
 * ║                                                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import bcryptjs from "bcryptjs";
import { ValidationError } from "../utils/errors";

export async function bootstrapSuperAdmin(
  email: string,
  password: string,
  name: string = "Super Administrator",
): Promise<void> {
  try {
    // Verificar se super admin já existe
    const existing = await prisma.user.findFirst({
      where: {
        role: "super_admin",
      },
    });

    if (existing) {
      logger.info(
        { email: existing.email },
        "Super admin already bootstrapped — skipping"
      );
      return;
    }

    // Validar senha mínima
    if (password.length < 12) {
      throw new ValidationError(
        "Super admin password must be at least 12 characters"
      );
    }

    // Hash da senha
    const passwordHash = await bcryptjs.hash(password, 12);

    // Criar tenant de "admin" (contexto administrativo apenas)
    // O Super Admin precisa de um tenant_id para estar no banco
    const adminTenant = await prisma.tenant.create({
      data: {
        name: "VisageX Admin — Internal",
        institutionType: "school",
        planId: 1, // Deve existir no banco via seed
        status: "active",
      },
    });

    // Criar super admin user — ÚNICA E EXCLUSIVA CRIAÇÃO VIA BOOTSTRAP
    const superAdmin = await prisma.user.create({
      data: {
        tenantId: adminTenant.id,
        name,
        email,
        passwordHash,
        role: "super_admin",
        status: "active",
      },
    });

    logger.info(
      { userId: superAdmin.id, email },
      "✅ Super admin bootstrapped successfully from SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD"
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger.error({ error }, "Error bootstrapping super admin");
    throw error;
  }
}
