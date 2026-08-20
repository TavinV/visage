/**
 * Política de identificação do aluno (utils/identification.ts).
 *
 * A regra que importa: o totem NUNCA pode pedir um identificador que a
 * instituição não registra. Se isso escapa, o aluno chega no totem, digita o
 * que sabe, e não existe caminho de cadastro — falha que só aparece no dia da
 * primeira chamada, com a sala cheia.
 */

import { describe, it, expect } from "vitest";
import {
  resolveIdentification,
  registersCpf,
  registersEnrollmentCode,
  totemIdentifierLabel,
  DEFAULT_IDENTIFICATION,
  STUDENT_IDENTIFICATION_VALUES,
  TOTEM_IDENTIFICATION_VALUES,
} from "../../src/utils/identification";

describe("registersCpf / registersEnrollmentCode", () => {
  it("cpf: registra CPF, não registra matrícula", () => {
    expect(registersCpf("cpf")).toBe(true);
    expect(registersEnrollmentCode("cpf")).toBe(false);
  });

  it("enrollment_code: registra matrícula, não registra CPF", () => {
    expect(registersCpf("enrollment_code")).toBe(false);
    expect(registersEnrollmentCode("enrollment_code")).toBe(true);
  });

  it("both: registra os dois", () => {
    expect(registersCpf("both")).toBe(true);
    expect(registersEnrollmentCode("both")).toBe(true);
  });
});

describe("resolveIdentification — defaults e entrada inválida", () => {
  it("sem configuração devolve o comportamento histórico (CPF/CPF/validando)", () => {
    expect(resolveIdentification(null)).toEqual(DEFAULT_IDENTIFICATION);
    expect(DEFAULT_IDENTIFICATION).toEqual({
      studentIdentification: "cpf",
      totemIdentification: "cpf",
      validateCpf: true,
    });
  });

  it("valores fora do domínio caem no default em vez de propagar lixo", () => {
    const policy = resolveIdentification({
      studentIdentification: "rg",
      totemIdentification: "digital",
      validateCpf: true,
    });

    expect(policy.studentIdentification).toBe("cpf");
    expect(policy.totemIdentification).toBe("cpf");
  });

  it("campos ausentes ou nulos caem no default", () => {
    expect(resolveIdentification({})).toEqual(DEFAULT_IDENTIFICATION);
    expect(
      resolveIdentification({
        studentIdentification: null,
        totemIdentification: null,
        validateCpf: null,
      })
    ).toEqual(DEFAULT_IDENTIFICATION);
  });

  it("validateCpf ausente assume true — validar é o padrão seguro", () => {
    const policy = resolveIdentification({ studentIdentification: "cpf" });
    expect(policy.validateCpf).toBe(true);
  });

  it("validateCpf: false é respeitado (instituição com base legada suja)", () => {
    const policy = resolveIdentification({ studentIdentification: "cpf", validateCpf: false });
    expect(policy.validateCpf).toBe(false);
  });
});

describe("resolveIdentification — o totem não pede o que não é registrado", () => {
  it("só matrícula no cadastro força o totem a pedir matrícula", () => {
    const policy = resolveIdentification({
      studentIdentification: "enrollment_code",
      totemIdentification: "cpf",
    });

    expect(policy.totemIdentification).toBe("enrollment_code");
  });

  it("só matrícula no cadastro rebaixa o totem 'any' para matrícula", () => {
    // "any" aceitaria CPF, que ninguém tem cadastrado.
    const policy = resolveIdentification({
      studentIdentification: "enrollment_code",
      totemIdentification: "any",
    });

    expect(policy.totemIdentification).toBe("enrollment_code");
  });

  it("só CPF no cadastro força o totem a pedir CPF", () => {
    const policy = resolveIdentification({
      studentIdentification: "cpf",
      totemIdentification: "enrollment_code",
    });

    expect(policy.totemIdentification).toBe("cpf");
  });

  it("só CPF no cadastro rebaixa o totem 'any' para CPF", () => {
    const policy = resolveIdentification({
      studentIdentification: "cpf",
      totemIdentification: "any",
    });

    expect(policy.totemIdentification).toBe("cpf");
  });

  it("cadastro 'both' preserva qualquer escolha de totem", () => {
    for (const totem of TOTEM_IDENTIFICATION_VALUES) {
      const policy = resolveIdentification({
        studentIdentification: "both",
        totemIdentification: totem,
      });
      expect(policy.totemIdentification, totem).toBe(totem);
    }
  });

  it("toda combinação possível resulta num totem que o cadastro suporta", () => {
    // Varredura exaustiva: 3 modos de cadastro × 3 de totem. Nenhuma
    // combinação pode terminar com o totem pedindo algo inexistente.
    for (const student of STUDENT_IDENTIFICATION_VALUES) {
      for (const totem of TOTEM_IDENTIFICATION_VALUES) {
        const policy = resolveIdentification({
          studentIdentification: student,
          totemIdentification: totem,
        });

        const rotulo = `${student} + ${totem} → ${policy.totemIdentification}`;
        if (policy.totemIdentification === "cpf") {
          expect(registersCpf(policy.studentIdentification), rotulo).toBe(true);
        }
        if (policy.totemIdentification === "enrollment_code") {
          expect(registersEnrollmentCode(policy.studentIdentification), rotulo).toBe(true);
        }
        if (policy.totemIdentification === "any") {
          expect(registersCpf(policy.studentIdentification), rotulo).toBe(true);
          expect(registersEnrollmentCode(policy.studentIdentification), rotulo).toBe(true);
        }
      }
    }
  });
});

describe("totemIdentifierLabel", () => {
  it("traduz o modo para o rótulo que o aluno lê na tela", () => {
    expect(totemIdentifierLabel("cpf")).toBe("CPF");
    expect(totemIdentifierLabel("enrollment_code")).toBe("matrícula");
    expect(totemIdentifierLabel("any")).toBe("CPF ou matrícula");
  });
});
