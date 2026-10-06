/**
 * Cliente da API do totem — exclusão da biometria (src/lib/deviceApi.ts).
 *
 * O contrato com o backend: o totem só manda o identificador digitado e o
 * frame da câmera, sempre com a própria chave. Quem decide se apaga é o
 * backend; aqui só se garante que o pedido sai certo e que a recusa volta
 * com o código para a tela reagir.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { deviceApi, deviceKeyStore, DeviceApiError } from "@/lib/deviceApi";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastRequest(fetchSpy: ReturnType<typeof vi.spyOn>) {
  const [url, init] = fetchSpy.mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    method: init.method,
    deviceKey: new Headers(init.headers).get("X-Device-Key"),
    body: JSON.parse(String(init.body)),
  };
}

describe("deviceApi — exclusão da biometria", () => {
  beforeEach(() => {
    deviceKeyStore.set("chave-do-totem-sala-12");
  });

  it("lookup envia só o identificador, com a chave do totem", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { data: { firstName: "Maria" } }));

    await expect(deviceApi.erasureLookup("529.982.247-25")).resolves.toEqual({
      firstName: "Maria",
    });

    expect(lastRequest(fetchSpy)).toEqual({
      url: "/api/enrollment/erasure/lookup",
      method: "POST",
      deviceKey: "chave-do-totem-sala-12",
      body: { identifier: "529.982.247-25" },
    });
  });

  it("confirm envia identificador e frame e devolve o desfecho", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse(200, { data: { erased: false, reason: "face_mismatch", attemptsLeft: 2 } })
      );

    const result = await deviceApi.erasureConfirm("2026001", "base64-do-frame");

    expect(result).toEqual({ erased: false, reason: "face_mismatch", attemptsLeft: 2 });
    expect(lastRequest(fetchSpy)).toEqual({
      url: "/api/enrollment/erasure/confirm",
      method: "POST",
      deviceKey: "chave-do-totem-sala-12",
      body: { identifier: "2026001", imageB64: "base64-do-frame" },
    });
  });

  it("bloqueio do backend volta com código e mensagem para a tela", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, {
        error: "Muitas tentativas sem confirmar a identidade.",
        code: "ERASURE_LOCKED",
      })
    );

    const error = await deviceApi.erasureConfirm("2026001", "frame").catch((e) => e);

    expect(error).toBeInstanceOf(DeviceApiError);
    expect(error.code).toBe("ERASURE_LOCKED");
    expect(error.message).toBe("Muitas tentativas sem confirmar a identidade.");
  });

  it("sem chave configurada, nem chega a chamar o backend", async () => {
    deviceKeyStore.clear();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const error = await deviceApi.erasureLookup("529.982.247-25").catch((e) => e);

    expect(error).toBeInstanceOf(DeviceApiError);
    expect(error.code).toBe("missing_key");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
