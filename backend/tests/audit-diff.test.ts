/**
 * Diff da trilha de auditoria.
 *
 * Dois contratos são inegociáveis e por isso estão cobertos aqui:
 *   1. Só o que MUDOU vai para o banco — um PATCH que reenvia os mesmos
 *      valores não pode gerar linha de auditoria nem inchar a tabela.
 *   2. Nada sensível é gravado. Um vazamento da tabela de auditoria não pode
 *      virar vazamento de senhas, chaves de totem ou embeddings faciais.
 */

import { describe, it, expect } from "vitest";
import { diffStates, snapshot, REDACTED } from "../src/utils/diff";

describe("diffStates — só o que mudou", () => {
  it("ignora campos idênticos", () => {
    const diff = diffStates(
      { name: "3ºA", room: "204", isActive: true },
      { name: "3ºA", room: "204", isActive: true },
    );

    expect(diff.changedFields).toEqual([]);
    expect(diff.beforeState).toBeUndefined();
    expect(diff.afterState).toBeUndefined();
  });

  it("captura antes e depois apenas dos campos alterados", () => {
    const diff = diffStates(
      { name: "3ºA", room: "204", isActive: true },
      { name: "3ºA", room: "310", isActive: false },
    );

    expect(diff.changedFields.sort()).toEqual(["isActive", "room"]);
    expect(diff.beforeState).toEqual({ room: "204", isActive: true });
    expect(diff.afterState).toEqual({ room: "310", isActive: false });
  });

  it("restringe a comparação à allowlist de campos", () => {
    // updatedAt muda em toda escrita e não pode virar ruído na trilha
    const diff = diffStates(
      { name: "Matemática", updatedAt: new Date("2026-01-01") },
      { name: "Matemática", updatedAt: new Date("2026-08-15") },
      ["name"],
    );

    expect(diff.changedFields).toEqual([]);
  });

  it("trata campo ausente nos dois lados como não mexido", () => {
    // PATCH parcial: quem não veio no payload não foi apagado
    const diff = diffStates({ name: "Ana" }, { name: "Ana Paula" }, [
      "name",
      "document",
    ]);

    expect(diff.changedFields).toEqual(["name"]);
    expect(diff.beforeState).not.toHaveProperty("document");
  });

  it("distingue null de ausente", () => {
    const diff = diffStates({ document: "12345678901" }, { document: null });

    expect(diff.changedFields).toEqual(["document"]);
    expect(diff.afterState).toEqual({ document: null });
  });

  it("normaliza datas para ISO antes de comparar", () => {
    const same = diffStates(
      { startedAt: new Date("2026-08-15T19:00:00.000Z") },
      { startedAt: new Date("2026-08-15T19:00:00.000Z") },
    );
    expect(same.changedFields).toEqual([]);

    const changed = diffStates(
      { startedAt: new Date("2026-08-15T19:00:00.000Z") },
      { startedAt: new Date("2026-08-15T19:40:00.000Z") },
    );
    expect(changed.changedFields).toEqual(["startedAt"]);
    expect(changed.afterState?.startedAt).toBe("2026-08-15T19:40:00.000Z");
  });
});

describe("diffStates — redação de dados sensíveis", () => {
  it("registra QUE a senha mudou sem gravar senha nenhuma", () => {
    const diff = diffStates(
      { passwordHash: "$2a$12$antigo" },
      { passwordHash: "$2a$12$novo" },
    );

    expect(diff.changedFields).toEqual(["passwordHash"]);
    expect(diff.beforeState).toEqual({ passwordHash: REDACTED });
    expect(diff.afterState).toEqual({ passwordHash: REDACTED });
  });

  it("redige chave de totem, token, segredo e embedding", () => {
    const diff = diffStates(
      {
        apiKeyHash: "abc",
        totemPanelPassword: "adminumc{{data}}",
        tokenHash: "xyz",
        qrSecretKey: "s3cr3t",
        embeddingCt: "vetor",
      },
      {
        apiKeyHash: "def",
        totemPanelPassword: "novasenha",
        tokenHash: "uvw",
        qrSecretKey: "outro",
        embeddingCt: "outro vetor",
      },
    );

    for (const field of diff.changedFields) {
      expect(diff.beforeState?.[field]).toBe(REDACTED);
      expect(diff.afterState?.[field]).toBe(REDACTED);
    }
    // A senha do painel do totem tem de constar como alterada, mesmo redigida
    expect(diff.changedFields).toContain("totemPanelPassword");
  });

  it("redige campos sensíveis aninhados", () => {
    const diff = diffStates(
      { config: { label: "Totem A", apiKey: "chave-antiga" } },
      { config: { label: "Totem B", apiKey: "chave-nova" } },
    );

    expect(JSON.stringify(diff)).not.toContain("chave-antiga");
    expect(JSON.stringify(diff)).not.toContain("chave-nova");
  });

  it("nunca deixa Buffer cru (bytes cifrados) entrar na trilha", () => {
    const diff = diffStates(
      { dekCt: Buffer.from("segredo") },
      { dekCt: Buffer.from("outro segredo") },
    );

    expect(JSON.stringify(diff)).not.toContain("segredo");
  });
});

describe("snapshot", () => {
  it("recorta apenas os campos pedidos", () => {
    const result = snapshot(
      { id: "u1", name: "Ana", email: "ana@escola.br", passwordHash: "$2a$12$x" },
      ["name", "email"],
    );

    expect(result).toEqual({ name: "Ana", email: "ana@escola.br" });
  });

  it("redige sensíveis mesmo quando explicitamente pedidos", () => {
    const result = snapshot({ name: "Ana", passwordHash: "$2a$12$x" }, [
      "name",
      "passwordHash",
    ]);

    expect(result).toEqual({ name: "Ana", passwordHash: REDACTED });
  });

  it("devolve undefined para entidade ausente", () => {
    expect(snapshot(null)).toBeUndefined();
    expect(snapshot(undefined)).toBeUndefined();
  });
});
