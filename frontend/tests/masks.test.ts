/**
 * Máscaras de documento (src/lib/masks.ts).
 *
 * Aplicadas a cada tecla no `onChange`: a função recebe o valor JÁ mascarado
 * da digitação anterior. Se ela duplicar pontuação ou perder dígito nesse
 * caminho, o campo trava na cara do usuário — daí os testes progressivos.
 */

import { describe, it, expect } from "vitest";
import { onlyDigits, maskCpf, maskCnpj, maskCpfCnpj, isCompleteCpf } from "@/lib/masks";

describe("onlyDigits", () => {
  it("remove tudo que não é dígito", () => {
    expect(onlyDigits("529.982.247-25")).toBe("52998224725");
    expect(onlyDigits("11.222.333/0001-81")).toBe("11222333000181");
    expect(onlyDigits("abc 123 def")).toBe("123");
  });

  it("devolve string vazia quando não há dígito", () => {
    expect(onlyDigits("")).toBe("");
    expect(onlyDigits("---")).toBe("");
  });
});

describe("maskCpf", () => {
  it("insere a pontuação conforme o usuário digita", () => {
    expect(maskCpf("529")).toBe("529");
    expect(maskCpf("5299")).toBe("529.9");
    expect(maskCpf("529982")).toBe("529.982");
    expect(maskCpf("5299822")).toBe("529.982.2");
    expect(maskCpf("529982247")).toBe("529.982.247");
    expect(maskCpf("5299822472")).toBe("529.982.247-2");
    expect(maskCpf("52998224725")).toBe("529.982.247-25");
  });

  it("descarta o que passa de 11 dígitos", () => {
    expect(maskCpf("529982247259999")).toBe("529.982.247-25");
  });

  it("é idempotente — remascarar o valor já mascarado não duplica pontuação", () => {
    // É exatamente o que acontece a cada tecla no onChange.
    const umaVez = maskCpf("52998224725");
    expect(maskCpf(umaVez)).toBe(umaVez);
  });

  it("aceita entrada já pontuada pelo autopreenchimento do navegador", () => {
    expect(maskCpf("529.982.247-25")).toBe("529.982.247-25");
  });

  it("devolve vazio para entrada sem dígitos", () => {
    expect(maskCpf("")).toBe("");
    expect(maskCpf("abc")).toBe("");
  });
});

describe("maskCnpj", () => {
  it("insere a pontuação conforme o usuário digita", () => {
    expect(maskCnpj("11")).toBe("11");
    expect(maskCnpj("112")).toBe("11.2");
    expect(maskCnpj("11222")).toBe("11.222");
    expect(maskCnpj("112223")).toBe("11.222.3");
    expect(maskCnpj("11222333")).toBe("11.222.333");
    expect(maskCnpj("112223330")).toBe("11.222.333/0");
    expect(maskCnpj("1122233300018")).toBe("11.222.333/0001-8");
    expect(maskCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("descarta o que passa de 14 dígitos", () => {
    expect(maskCnpj("112223330001819999")).toBe("11.222.333/0001-81");
  });

  it("é idempotente", () => {
    const umaVez = maskCnpj("11222333000181");
    expect(maskCnpj(umaVez)).toBe(umaVez);
  });
});

describe("maskCpfCnpj", () => {
  it("usa formato de CPF até 11 dígitos", () => {
    expect(maskCpfCnpj("52998224725")).toBe("529.982.247-25");
  });

  it("vira CNPJ a partir do 12º dígito", () => {
    // A instituição pode ter CNPJ; o campo é o mesmo.
    expect(maskCpfCnpj("529982247251")).toBe("52.998.224/7251");
  });

  it("completa o CNPJ com 14 dígitos", () => {
    expect(maskCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("acompanha a transição ao apagar de volta para 11 dígitos", () => {
    expect(maskCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(maskCpfCnpj("11222333000")).toBe("112.223.330-00");
  });
});

describe("isCompleteCpf", () => {
  it("só considera completo com 11 dígitos", () => {
    expect(isCompleteCpf("529.982.247-25")).toBe(true);
    expect(isCompleteCpf("52998224725")).toBe(true);
    expect(isCompleteCpf("529.982.247-2")).toBe(false);
    expect(isCompleteCpf("")).toBe(false);
  });

  it("conta dígitos, não caracteres — não valida os verificadores", () => {
    // Completude é do formulário; a validade matemática é do backend.
    expect(isCompleteCpf("00000000000")).toBe(true);
  });
});
