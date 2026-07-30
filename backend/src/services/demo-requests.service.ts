/**
 * DemoRequestsService — Captação de leads do formulário público de
 * "Solicitar demonstração" da landing page.
 *
 * Responsabilidades:
 *   - Persistir a solicitação garantindo unicidade por e-mail e telefone
 *     (impede múltiplas tentativas de contato pela mesma pessoa/instituição).
 *   - Notificar o time comercial por e-mail (config.demoNotifyEmail), com
 *     reply-to apontando para o responsável.
 *
 * Sem tenant: a instituição ainda não existe no sistema.
 */

import { Prisma } from "@prisma/client";
import { BaseService } from "./base.service";
import { emailService } from "./email.service";
import { config } from "../lib/config";
import { ConflictError } from "../utils/errors";

export interface CreateDemoRequestInput {
  contactName: string;
  institutionName: string;
  studentCount: number;
  email: string;
  /** Apenas dígitos (DDD + número). */
  phone: string;
  plan: string;
}

class DemoRequestsService extends BaseService {
  /**
   * Registra uma solicitação de demonstração e dispara a notificação por email.
   *
   * @throws {ConflictError} se o e-mail ou telefone já tiver uma solicitação.
   */
  async create(input: CreateDemoRequestInput): Promise<{ id: string }> {
    const email = input.email.trim().toLowerCase();
    const phone = input.phone.replace(/\D/g, "");
    const institutionName = input.institutionName.trim();
    const contactName = input.contactName.trim();

    let created;
    try {
      created = await this.prisma.demoRequest.create({
        data: {
          contactName,
          institutionName,
          studentCount: input.studentCount,
          email,
          phone,
          plan: input.plan,
        },
        select: { id: true },
      });
    } catch (err) {
      // Violação de unicidade (email ou telefone já cadastrado)
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const target = (err.meta?.target as string[] | undefined)?.join(",") ?? "";
        const field = target.includes("phone") ? "telefone" : "e-mail";
        throw new ConflictError(
          `Já recebemos uma solicitação com este ${field}. Nossa equipe entrará em contato em breve.`,
          "demo_request_duplicate",
        );
      }
      throw err;
    }

    // Notificação — falha de e-mail não invalida o lead já persistido.
    try {
      await emailService.send({
        to: config.demoNotifyEmail,
        templateId: "demo-request",
        replyTo: email,
        context: {
          contactName,
          institutionName,
          studentCount: input.studentCount,
          email,
          phone: this.formatPhone(phone),
          plan: input.plan,
          submittedAt: new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Sao_Paulo",
          }).format(new Date()),
        },
      });
    } catch (err) {
      this.logger.error(
        { err, demoRequestId: created.id },
        "Falha ao enviar e-mail de solicitação de demonstração",
      );
    }

    return created;
  }

  /** (11) 98888-7777 a partir de dígitos crus. */
  private formatPhone(digits: string): string {
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return digits;
  }
}

export const demoRequestsService = new DemoRequestsService();
