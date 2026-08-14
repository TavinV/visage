/**
 * Fechamento automático de chamadas — varredura a cada minuto.
 *
 * A chamada tem prazo: hora real de início (informada pelo professor) +
 * aulas da disciplina × duração da aula do curso. Vencido o prazo, a sessão
 * encerra sozinha e consolida faltas como se o professor tivesse fechado —
 * professor que esquece a chamada aberta não deixa a turma com presença
 * fantasma até o dia seguinte.
 *
 * O endedAt gravado é o prazo previsto, não o instante da varredura, para o
 * atraso do job não vazar para o histórico.
 *
 * Mesmo padrão do cleanupFraudFrames: setTimeout encadeado, sem node-cron.
 */

import { classSessionsService } from "../services/class-sessions.service";
import { logger } from "../lib/logger";

/** Resolução do fechamento: uma varredura por minuto. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Executa uma varredura. Exportado para permitir execução manual e testes.
 */
export async function runAutoCloseSessions(): Promise<number> {
  try {
    const closed = await classSessionsService.closeExpiredSessions();
    if (closed > 0) {
      logger.info({ closed }, "Class sessions auto-closed");
    }
    return closed;
  } catch (error) {
    // Banco fora do ar não pode derrubar o agendamento — a próxima varredura
    // pega as sessões vencidas que ficaram para trás
    logger.error({ error }, "Auto-close sweep failed");
    return 0;
  }
}

/**
 * Agenda a varredura periódica. Chamar uma única vez no bootstrap.
 */
export function startAutoCloseSessionsJob(): void {
  const schedule = (): void => {
    const timer = setTimeout(async () => {
      await runAutoCloseSessions();
      schedule();
    }, SWEEP_INTERVAL_MS);
    timer.unref(); // não segura o processo vivo
  };

  schedule();
  logger.info(
    { intervalSeconds: SWEEP_INTERVAL_MS / 1000 },
    "Class session auto-close job scheduled"
  );
}
