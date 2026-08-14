"use client";

import { useEffect, useState } from "react";
import { fetchAuthenticatedBlobUrl } from "@/lib/api";

/**
 * Carrega uma imagem protegida por JWT e devolve um object URL para o <img>.
 *
 * Um <img src="/users/:id/photo"> direto não manda o header Authorization —
 * a imagem precisa vir por fetch autenticado e virar blob.
 *
 * `enabled` evita a request quando já se sabe que não há foto (hasPhoto do
 * backend), e `cacheKey` (photoUpdatedAt) força o recarregamento depois de um
 * upload sem depender do cache do navegador.
 */
export function useAuthenticatedImage(
  path: string | null,
  options: { enabled?: boolean; cacheKey?: string } = {}
): string | null {
  const { enabled = true, cacheKey } = options;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path || !enabled) {
      setUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    fetchAuthenticatedBlobUrl(path)
      .then((blobUrl) => {
        // Componente desmontado durante o fetch: revoga na hora, senão o
        // blob fica pendurado na memória até a aba fechar
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        objectUrl = blobUrl;
        setUrl(blobUrl);
      })
      .catch(() => {
        // 404 é o caso comum (arquivo perdido em redeploy sem volume) —
        // as iniciais assumem o lugar
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, enabled, cacheKey]);

  return url;
}
