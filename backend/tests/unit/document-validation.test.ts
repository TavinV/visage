/**
 * Validação do documento do aluno (utils/document.ts).
 *
 * É o que separa "aluno cadastrado" de "aluno que nunca vai ser reconhecido":
 * o CPF é a chave que o totem usa para achar a pessoa antes da biometria, e um
 * CPF aceito com dígito verificador errado vira um cadastro órfão que só
 * aparece no dia da chamada.
 */

import { describe, it, expect } from "vitest";
import { normalizeDocument, isValidCpf, isValidCnpj } from "../../src/utils/document";

describe("normalizeDocument", () => {
  it("remove a máscara do CPF", () => {
    expect(normalizeDocument("529.982.247-25")).toBe("52998224725");
  });

  it("remove a máscara do CNPJ, inclusive a barra", () => {
    expect(normalizeDocument("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("não altera o que já vem só com dígitos", () => {
    expect(normalizeDocument("52998224725")).toBe("52998224725");
  });

  it("é idempotente — normalizar duas vezes dá o mesmo resultado", () => {
    const uma = normalizeDocument("529.982.247-25");
    expect(normalizeDocument(uma)).toBe(uma);
  });

  it("não remove espaços nem letras — só pontuação de documento", () => {
    // Documenta o comportamento: a limpeza é de máscara, não de lixo geral.
    expect(normalizeDocument(" 529 982 ")).toBe(" 529 982 ");
  });
});

describe("isValidCpf", () => {
  it("aceita CPFs com dígitos verificadores corretos", () => {
    for (const cpf of ["52998224725", "11144477735", "01234567890"]) {
      expect(isValidCpf(cpf), cpf).toBe(true);
    }
  });

  it("rejeita quando o primeiro dígito verificador está errado", () => {
    expect(isValidCpf("52998224715")).toBe(false);
  });

  it("rejeita quando o segundo dígito verificador está errado", () => {
    expect(isValidCpf("52998224726")).toBe(false);
  });

  it("rejeita sequências homogêneas, que passam na conta mas não existem", () => {
    // 111.111.111-11 satisfaz a fórmula dos dígitos verificadores — sem o
    // filtro explícito, entraria no sistema como CPF válido.
    for (let d = 0; d <= 9; d++) {
      const homogeneo = String(d).repeat(11);
      expect(isValidCpf(homogeneo), homogeneo).toBe(false);
    }
  });

  it("rejeita tamanhos diferentes de 11 dígitos", () => {
    expect(isValidCpf("5299822472")).toBe(false); // 10
    expect(isValidCpf("529982247251")).toBe(false); // 12
    expect(isValidCpf("")).toBe(false);
  });

  it("rejeita CPF ainda mascarado — a normalização vem antes", () => {
    expect(isValidCpf("529.982.247-25")).toBe(false);
  });

  it("rejeita entrada não numérica", () => {
    expect(isValidCpf("abcdefghijk")).toBe(false);
    expect(isValidCpf("5299822472a")).toBe(false);
  });

  it("aceita o mesmo CPF depois de normalizado", () => {
    expect(isValidCpf(normalizeDocument("529.982.247-25"))).toBe(true);
  });
});

describe("isValidCnpj", () => {
  it("aceita 14 dígitos", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("rejeita tamanhos diferentes de 14", () => {
    expect(isValidCnpj("1122233300018")).toBe(false);
    expect(isValidCnpj("112223330001811")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });

  it("rejeita entrada não numérica e ainda mascarada", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(false);
    expect(isValidCnpj("1122233300018a")).toBe(false);
  });

  it("não confere dígitos verificadores — só formato", () => {
    // Comportamento deliberado hoje: o CNPJ identifica a instituição, que é
    // cadastrada pelo super admin, não digitada por aluno em totem.
    expect(isValidCnpj("00000000000000")).toBe(true);
  });
});
