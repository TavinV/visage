/**
 * EmailService — Envio de emails via SMTP com sistema de templates tipado.
 *
 * ## Sistema de templates
 * Templates ficam em `backend/templates/email/`:
 *   - `layouts/base.hbs`  — layout HTML base (header, footer, branding)
 *   - `<template-id>.hbs` — conteúdo específico de cada email
 *
 * O serviço injeta o conteúdo renderizado no `{{{body}}}` do layout,
 * garantindo visual consistente entre todos os emails.
 *
 * ## Uso
 * ```ts
 * await emailService.send({
 *   to: "aluno@escola.edu.br",
 *   templateId: "enrollment-invite",
 *   context: { studentName: "Maria", qrCodeUrl: "...", expiresAt: "..." },
 * });
 * ```
 *
 * ## Adicionando um novo template
 * 1. Criar `templates/email/<id>.hbs` com o conteúdo HTML
 * 2. Adicionar a entrada em `TEMPLATE_REGISTRY` com subject e tipo de contexto
 * 3. Exportar a interface de contexto para uso nos chamadores
 */

import Handlebars from "handlebars";
import fs from "fs";
import path from "path";
import { mailer } from "../lib/mailer";
import { config } from "../lib/config";
import { logger } from "../lib/logger";

// ── Diretório de templates ────────────────────────────────────────────────────

const TEMPLATES_DIR = path.join(process.cwd(), "templates", "email");

// ── Interfaces de contexto por template ──────────────────────────────────────

export interface WelcomeEmailContext {
  /** Nome completo do usuário */
  name: string;
  /** Nome da instituição/tenant */
  institutionName: string;
  /** URL do painel de acesso */
  dashboardUrl: string;
}

export interface EnrollmentInviteEmailContext {
  /** Nome completo do aluno */
  studentName: string;
  /** Nome da instituição */
  institutionName: string;
  /** URL da imagem do QR Code (data URL ou URL pública) */
  qrCodeUrl: string;
  /** Data/hora de expiração formatada (ex: "20/05/2026 às 14h00") */
  expiresAt: string;
  /** URL do totem de cadastro (opcional — para acesso web) */
  enrollmentUrl?: string;
}

export interface AdminCredentialsEmailContext {
  /** Nome completo do administrador */
  name: string;
  /** Nome da instituição/tenant */
  institutionName: string;
  /** E-mail de acesso */
  email: string;
  /** Senha temporária gerada automaticamente */
  temporaryPassword: string;
  /** URL do painel de acesso */
  dashboardUrl: string;
}

export interface PasswordResetEmailContext {
  /** Nome do usuário */
  name: string;
  /** URL do link de redefinição */
  resetUrl: string;
  /** Tempo de expiração do link (ex: "2 horas") */
  expiresIn: string;
}

export interface AttendanceReportEmailContext {
  /** Nome do professor */
  teacherName: string;
  /** Nome da turma */
  className: string;
  /** Data da chamada formatada */
  sessionDate: string;
  /** Total de alunos presentes */
  presentCount: number;
  /** Total de alunos na turma */
  totalCount: number;
  /** URL para ver o relatório completo */
  reportUrl: string;
}

// ── Registro de templates ─────────────────────────────────────────────────────

/**
 * Mapa central de todos os templates de email disponíveis.
 *
 * Para cada template, define:
 * - `subject`: linha de assunto (suporta variáveis Handlebars `{{varName}}`)
 * - `file`: nome do arquivo `.hbs` em `templates/email/`
 *
 * O tipo `TemplateContextMap` garante em tempo de compilação que o `context`
 * passado para `send()` corresponde exatamente ao template escolhido.
 */
interface TemplateManifest {
  subject: string;
  file: string;
}

const TEMPLATE_REGISTRY = {
  welcome: {
    subject: "Bem-vindo ao Visage, {{name}}!",
    file: "welcome.hbs",
  },
  "enrollment-invite": {
    subject: "Seu convite de cadastro biométrico — {{institutionName}}",
    file: "enrollment-invite.hbs",
  },
  "password-reset": {
    subject: "Redefinição de senha — Visage",
    file: "password-reset.hbs",
  },
  "attendance-report": {
    subject: "Relatório de chamada: {{className}} — {{sessionDate}}",
    file: "attendance-report.hbs",
  },
  "admin-credentials": {
    subject: "Suas credenciais de acesso — {{institutionName}}",
    file: "admin-credentials.hbs",
  },
} as const satisfies Record<string, TemplateManifest>;

export type EmailTemplateId = keyof typeof TEMPLATE_REGISTRY;

/** Mapeia cada template ID ao tipo de contexto exigido. */
export type TemplateContextMap = {
  welcome: WelcomeEmailContext;
  "enrollment-invite": EnrollmentInviteEmailContext;
  "password-reset": PasswordResetEmailContext;
  "attendance-report": AttendanceReportEmailContext;
  "admin-credentials": AdminCredentialsEmailContext;
};

// ── Options de envio ──────────────────────────────────────────────────────────

export type SendEmailOptions<T extends EmailTemplateId = EmailTemplateId> = {
  /** Destinatário único ou lista */
  to: string | string[];
  /** Template a usar — determina o tipo de `context` */
  templateId: T;
  /** Dados específicos do template — tipo inferido automaticamente */
  context: TemplateContextMap[T];
  /**
   * Sobrescreve o assunto gerado automaticamente pelo template.
   * Util para casos como adicionar prefixos de urgência.
   */
  subjectOverride?: string;
  /** Email de reply-to (opcional) */
  replyTo?: string;
};

// ── Resultado do envio ────────────────────────────────────────────────────────

export interface SendEmailResult {
  /** ID de mensagem retornado pelo servidor SMTP */
  messageId: string;
  /** Destinatários aceitos pelo servidor */
  accepted: string[];
  /** Destinatários rejeitados pelo servidor */
  rejected: string[];
}

// ── Cache de templates compilados ─────────────────────────────────────────────

type CompiledEntry = {
  content: Handlebars.TemplateDelegate;
  subject: Handlebars.TemplateDelegate;
};

// ── Serviço ───────────────────────────────────────────────────────────────────

class EmailService {
  private readonly serviceLogger = logger.child({ service: "EmailService" });

  /** Cache de templates compilados (carregados uma única vez). */
  private readonly cache = new Map<EmailTemplateId, CompiledEntry>();

  /** Template do layout base, compilado uma única vez. */
  private layoutTemplate: Handlebars.TemplateDelegate | null = null;

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Envia um email usando o template especificado.
   *
   * @throws `Error` se o template não existir em disco ou se o SMTP rejeitar o envio
   */
  async send<T extends EmailTemplateId>(
    opts: SendEmailOptions<T>,
  ): Promise<SendEmailResult> {
    const { to, templateId, context, subjectOverride, replyTo } = opts;

    const { content, subject: subjectTpl } = this.loadTemplate(templateId);
    const layout = this.loadLayout();

    // Renderiza conteúdo e assunto com os dados fornecidos
    const bodyHtml = content(context);
    const subject = subjectOverride ?? subjectTpl(context);

    // Injeta conteúdo renderizado no layout base
    // `year` é adicionado automaticamente para uso no footer do layout
    const html = layout({
      ...context,
      body: bodyHtml,
      year: new Date().getFullYear(),
    });

    const info = await mailer.sendMail({
      from: `"${config.smtpFromName}" <${config.smtpFromEmail}>`,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });

    this.serviceLogger.info(
      {
        messageId: info.messageId,
        templateId,
        to,
        accepted: info.accepted,
        rejected: info.rejected,
      },
      "Email sent",
    );

    return {
      messageId: info.messageId,
      accepted: info.accepted as string[],
      rejected: info.rejected as string[],
    };
  }

  // ── Carregamento e cache de templates ───────────────────────────────────────

  /**
   * Carrega e compila um template do disco.
   * Resultados são cacheados em memória — cada arquivo é lido apenas uma vez.
   */
  private loadTemplate(id: EmailTemplateId): CompiledEntry {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    const manifest = TEMPLATE_REGISTRY[id];
    const filePath = path.join(TEMPLATES_DIR, manifest.file);

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Email template file not found: ${filePath} (templateId: "${id}")`,
      );
    }

    const source = fs.readFileSync(filePath, "utf-8");

    const entry: CompiledEntry = {
      content: Handlebars.compile(source),
      subject: Handlebars.compile(manifest.subject),
    };

    this.cache.set(id, entry);
    return entry;
  }

  /**
   * Carrega e compila o layout base.
   * Compilado apenas na primeira chamada.
   */
  private loadLayout(): Handlebars.TemplateDelegate {
    if (this.layoutTemplate) return this.layoutTemplate;

    const layoutPath = path.join(TEMPLATES_DIR, "layouts", "base.hbs");

    if (!fs.existsSync(layoutPath)) {
      throw new Error(`Base email layout not found: ${layoutPath}`);
    }

    this.layoutTemplate = Handlebars.compile(
      fs.readFileSync(layoutPath, "utf-8"),
    );
    return this.layoutTemplate;
  }

  /**
   * Invalida o cache de templates compilados.
   * Útil em testes ou em hot-reload de desenvolvimento.
   */
  clearCache(): void {
    this.cache.clear();
    this.layoutTemplate = null;
    this.serviceLogger.debug("Template cache cleared");
  }
}

export const emailService = new EmailService();
