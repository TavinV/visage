/**
 * SSEService — Server-Sent Events
 * Gerenciador de conexões em memória por canal (aceitável para MVP
 * single-instance; multi-instância exigiria pub/sub via Redis).
 *
 * Canais:
 *   session:{tenantId}:{sessionId} — painel do professor (presenças em tempo real)
 *   device:{tenantId}:{deviceId}   — totem (reconhecimentos, sessão encerrada)
 */

import { Response } from "express";
import { logger } from "../lib/logger";

const HEARTBEAT_INTERVAL_MS = 25_000;

class SSEService {
  private channels = new Map<string, Set<Response>>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  sessionChannel(tenantId: string, sessionId: string): string {
    return `session:${tenantId}:${sessionId}`;
  }

  deviceChannel(tenantId: string, deviceId: string): string {
    return `device:${tenantId}:${deviceId}`;
  }

  /**
   * Registra uma conexão SSE no canal. Escreve os headers e mantém a
   * conexão aberta até o cliente desconectar.
   */
  addClient(channel: string, res: Response): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // evita buffering em proxies (Nginx)
    });
    res.write(": connected\n\n");

    let set = this.channels.get(channel);
    if (!set) {
      set = new Set();
      this.channels.set(channel, set);
    }
    set.add(res);

    res.on("close", () => {
      const clients = this.channels.get(channel);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) this.channels.delete(channel);
      }
    });

    this.ensureHeartbeat();
    logger.debug({ channel }, "SSE client connected");
  }

  /**
   * Emite um evento para todos os clientes de um canal.
   * Nunca lança — falha de um cliente não pode afetar o hot path.
   */
  broadcast(channel: string, event: string, data: unknown): void {
    const clients = this.channels.get(channel);
    if (!clients || clients.size === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch (error) {
        logger.warn({ channel, error }, "Failed to write SSE event — dropping client");
        clients.delete(res);
      }
    }
  }

  /** Comentário keep-alive periódico para evitar timeout de proxies. */
  private ensureHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      let total = 0;
      for (const [channel, clients] of this.channels) {
        for (const res of clients) {
          try {
            res.write(": keep-alive\n\n");
            total++;
          } catch {
            clients.delete(res);
          }
        }
        if (clients.size === 0) this.channels.delete(channel);
      }
      if (total === 0 && this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Não segurar o processo vivo só pelo heartbeat
    this.heartbeatTimer.unref();
  }
}

export const sseService = new SSEService();
