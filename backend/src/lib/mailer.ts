/**
 * Mailer — Transporter nodemailer singleton.
 *
 * Criado uma única vez e reutilizado em toda a aplicação.
 * Configuração lida de `config.ts` (valores via env vars).
 *
 * Verificação de conectividade disponível via `verifyMailer()` —
 * chamada opcional no startup para alertar sobre falhas de configuração
 * sem bloquear a inicialização do servidor.
 */

import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { config } from "./config";
import { logger } from "./logger";

// ── Criação do transporter ────────────────────────────────────────────────────

function buildTransporter(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
  const transportOptions: SMTPTransport.Options = {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    ...(config.smtpUser && config.smtpPassword
      ? { auth: { user: config.smtpUser, pass: config.smtpPassword } }
      : {}),
    // Previne timeouts silenciosos em conexões lentas
    connectionTimeout: 10_000,
    greetingTimeout: 5_000,
    socketTimeout: 15_000,
  };

  return nodemailer.createTransport(transportOptions);
}

export const mailer = buildTransporter();

// ── Verificação de conectividade (opcional) ───────────────────────────────────

/**
 * Verifica se o transporter consegue se conectar ao servidor SMTP.
 * Deve ser chamada no startup — nunca bloqueia, apenas loga o resultado.
 */
export async function verifyMailer(): Promise<void> {
  try {
    await mailer.verify();
    logger.info(
      { host: config.smtpHost, port: config.smtpPort },
      "SMTP connection verified",
    );
  } catch (err) {
    logger.warn(
      { host: config.smtpHost, port: config.smtpPort, err },
      "SMTP connection could not be verified — emails may fail",
    );
  }
}
