/**
 * Encerramento de sessões de acesso abandonadas.
 *
 * Nem todo login termina em logout: o usuário fecha a aba, o notebook dorme, a
 * rede cai. Sem esta varredura, essas sessões ficariam eternamente "abertas" na
 * tela de auditoria e o coordenador não conseguiria distinguir quem está
 * realmente no console agora de quem esteve lá em março.
 *
 * O critério é o refresh token: enquanto o usuário navega, o painel renova o
 * access token e o refresh atualiza `lastSeenAt`. Passado o TTL do refresh
 * token, aquela sessão não tem mais como voltar à vida — é sessão morta.
 *
 * Mesmo padrão do cleanupFraudFrames: setTimeout encadeado, sem node-cron.
 */

import { prisma } from "../lib/prisma";
import { config } from "../lib/config";
import { logger } from "../lib/logger";

/** Uma varredura por hora — sessão morta não tem pressa de virar histórico. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Fecha as sessões sem atividade além do TTL do refresh token.
 * Exportado para execução manual e testes.
 *
 * Retorna quantas sessões foram encerradas.
 */
export async function runExpireAuthSessions(now: Date = new Date()): Promise<number> {
  try {
    // Margem de 1h sobre o TTL para não fechar sessão que o usuário ainda
    // poderia renovar por diferença de relógio entre a API e o Redis
    const cutoff = new Date(
      now.getTime() - (config.jwtRefreshExpiresIn + 3600) * 1000,
    );

    const result = await prisma.authSession.updateMany({
      where: { endedAt: null, lastSeenAt: { lt: cutoff } },
      data: { endedAt: cutoff, endReason: "expired" },
    });

    if (result.count > 0) {
      logger.info({ expired: result.count, cutoff }, "Auth sessions expired");
    }
    return result.count;
  } catch (error) {
    // Banco indisponível não pode derrubar o agendamento — a próxima
    // varredura pega as sessões que ficaram para trás
    logger.error({ error }, "Auth session expiry sweep failed");
    return 0;
  }
}

/**
 * Agenda a varredura periódica. Chamar uma única vez no bootstrap.
 */
export function startExpireAuthSessionsJob(): void {
  const schedule = (): void => {
    const timer = setTimeout(async () => {
      await runExpireAuthSessions();
      schedule();
    }, SWEEP_INTERVAL_MS);
    timer.unref(); // não segura o processo vivo
  };

  schedule();
  logger.info(
    { intervalMinutes: SWEEP_INTERVAL_MS / 60000 },
    "Auth session expiry job scheduled",
  );
}
