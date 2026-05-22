/**
 * AdminService
 * Bootstrap de Super Admin — criado UMA ÚNICA VEZ via variáveis de ambiente.
 * Estende BaseService para acesso centralizado ao prisma e logger.
 *
 * REGRA CRÍTICA: o cargo "super_admin" existe APENAS UMA VEZ no sistema.
 * Não há endpoint, seed ou migration que crie Super Admin — somente esta função.
 * Se já existe, retorna sem fazer nada (idempotente).
 */

import { BaseService } from "./base.service";
import bcryptjs from "bcryptjs";
import { ValidationError } from "../utils/errors";

// ── Serviço ───────────────────────────────────────────────────────────────────

class AdminService extends BaseService {
  /**
   * Cria o super admin UMA ÚNICA VEZ a partir das variáveis de ambiente.
   * Idempotente: retorna sem alteração se já existe um super_admin.
   */
  async bootstrapSuperAdmin(
    email: string,
    password: string,
    name: string = "Super Administrator",
  ): Promise<void> {
    try {
      const existing = await this.prisma.user.findFirst({
        where: { role: "super_admin" },
      });

      if (existing) {
        this.logger.info(
          { email: existing.email },
          "Super admin already bootstrapped — skipping",
        );
        return;
      }

      if (password.length < 12) {
        throw new ValidationError(
          "Super admin password must be at least 12 characters",
        );
      }

      const passwordHash = await bcryptjs.hash(password, 12);

      const firstPlan = await this.prisma.plan.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });

      if (!firstPlan) {
        throw new ValidationError("No active plan found — seed a plan before bootstrapping super admin");
      }

      const adminTenant = await this.prisma.tenant.create({
        data: {
          name: "VisageX Admin — Internal",
          institutionType: "school",
          planId: firstPlan.id,
          status: "active",
        },
      });

      const superAdmin = await this.prisma.user.create({
        data: {
          tenantId: adminTenant.id,
          name,
          email,
          passwordHash,
          role: "super_admin",
          status: "active",
        },
      });

      this.logger.info(
        { userId: superAdmin.id, email },
        "✅ Super admin bootstrapped successfully from SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD",
      );
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      this.logger.error({ error }, "Error bootstrapping super admin");
      throw error;
    }
  }
}

export const adminService = new AdminService();
