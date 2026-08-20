/**
 * Política de identificação no console (src/lib/identification.ts).
 *
 * Espelha `backend/src/utils/identification.ts`. As duas cópias precisam
 * concordar: se o console pedir CPF e o backend exigir matrícula, o cadastro
 * é rejeitado sem que o admin entenda o motivo. A tabela verdade aqui é a
 * mesma do teste do backend, de propósito.
 */

import { describe, it, expect } from "vitest";
import {
  registersCpf,
  registersEnrollmentCode,
  totemIdentifierLabel,
} from "@/lib/identification";

describe("registersCpf", () => {
  it("cadastro por CPF registra CPF", () => {
    expect(registersCpf("cpf")).toBe(true);
  });

  it("cadastro por matrícula NÃO registra CPF", () => {
    expect(registersCpf("enrollment_code")).toBe(false);
  });

  it("cadastro 'both' registra CPF", () => {
    expect(registersCpf("both")).toBe(true);
  });

  it("modo ainda não carregado assume CPF — o padrão histórico", () => {
    // As telas renderizam antes de a query de tenant-settings responder;
    // assumir CPF mantém o formulário igual ao comportamento anterior.
    expect(registersCpf(undefined)).toBe(true);
  });
});

describe("registersEnrollmentCode", () => {
  it("cadastro por matrícula registra matrícula", () => {
    expect(registersEnrollmentCode("enrollment_code")).toBe(true);
  });

  it("cadastro 'both' registra matrícula", () => {
    expect(registersEnrollmentCode("both")).toBe(true);
  });

  it("cadastro só por CPF não registra matrícula", () => {
    expect(registersEnrollmentCode("cpf")).toBe(false);
  });

  it("modo ainda não carregado não exige matrícula", () => {
    expect(registersEnrollmentCode(undefined)).toBe(false);
  });
});

describe("totemIdentifierLabel", () => {
  it("traduz cada modo para o rótulo da tela do totem", () => {
    expect(totemIdentifierLabel("cpf")).toBe("CPF");
    expect(totemIdentifierLabel("enrollment_code")).toBe("matrícula");
    expect(totemIdentifierLabel("any")).toBe("CPF ou matrícula");
  });

  it("modo ausente cai em CPF", () => {
    expect(totemIdentifierLabel(undefined)).toBe("CPF");
  });
});

describe("paridade com o backend", () => {
  it("todo modo registra ao menos um identificador", () => {
    // Um modo que não registrasse nada deixaria o aluno sem forma de ser
    // encontrado no totem.
    for (const modo of ["cpf", "enrollment_code", "both"] as const) {
      expect(registersCpf(modo) || registersEnrollmentCode(modo), modo).toBe(true);
    }
  });

  it("'both' é o único modo que registra os dois", () => {
    expect(registersCpf("both") && registersEnrollmentCode("both")).toBe(true);
    expect(registersCpf("cpf") && registersEnrollmentCode("cpf")).toBe(false);
    expect(
      registersCpf("enrollment_code") && registersEnrollmentCode("enrollment_code")
    ).toBe(false);
  });

  it("os rótulos do totem cobrem exatamente os três modos do backend", () => {
    const rotulos = (["cpf", "enrollment_code", "any"] as const).map(totemIdentifierLabel);

    expect(new Set(rotulos).size).toBe(3);
  });
});
