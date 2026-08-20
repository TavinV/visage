/**
 * Tradução de erro da API para mensagem acionável (src/lib/apiError.ts).
 *
 * É a diferença entre o admin resolver sozinho e abrir chamado: "conflict"
 * não diz nada, "já existe um aluno com esta matrícula" diz o que fazer.
 * A ordem de precedência entre slug, issues, status e code é o miolo do teste.
 */

import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api";
import { friendlyError } from "@/lib/apiError";

describe("friendlyError — slug no campo `error`", () => {
  it("traduz slugs de identificação do aluno", () => {
    expect(friendlyError(new ApiError(400, "validation_error", "invalid_cpf"))).toBe(
      "CPF inválido — confira os dígitos informados."
    );
    expect(friendlyError(new ApiError(400, "validation_error", "invalid_cpf_format"))).toBe(
      "O CPF precisa ter 11 dígitos."
    );
    expect(friendlyError(new ApiError(400, "validation_error", "enrollment_code_required"))).toBe(
      "Informe a matrícula — a instituição identifica os alunos por matrícula."
    );
  });

  it("traduz conflitos de cadastro dizendo qual campo colidiu", () => {
    expect(friendlyError(new ApiError(409, "conflict", "email_already_exists"))).toBe(
      "Já existe um usuário com este e-mail no sistema."
    );
    expect(friendlyError(new ApiError(409, "conflict", "document_already_exists"))).toBe(
      "Já existe um usuário com este CPF na instituição."
    );
    expect(friendlyError(new ApiError(409, "conflict", "enrollment_code_already_exists"))).toBe(
      "Já existe um aluno com esta matrícula na instituição."
    );
  });

  it("explica por que o aluno com histórico não pode ser excluído", () => {
    const mensagem = friendlyError(
      new ApiError(409, "conflict", "user_has_related_records")
    );

    expect(mensagem).toContain("histórico de presença");
    expect(mensagem).toContain("Inative");
  });

  it("traduz erros de senha", () => {
    expect(friendlyError(new ApiError(400, "validation_error", "password_too_short"))).toBe(
      "A senha precisa de pelo menos 8 caracteres."
    );
    expect(
      friendlyError(new ApiError(400, "validation_error", "current_password_incorrect"))
    ).toBe("A senha atual está incorreta.");
    expect(
      friendlyError(new ApiError(400, "validation_error", "new_password_same_as_current"))
    ).toBe("A nova senha precisa ser diferente da atual.");
  });
});

describe("friendlyError — validação com issues", () => {
  it("junta as mensagens de campo com separador legível", () => {
    const erro = new ApiError(400, "validation_error", "Validation failed", [
      { path: "name", message: "Nome é obrigatório" },
      { path: "email", message: "E-mail inválido" },
    ]);

    expect(friendlyError(erro)).toBe("Nome é obrigatório · E-mail inválido");
  });

  it("uma única issue sai sem separador", () => {
    const erro = new ApiError(400, "validation_error", "Validation failed", [
      { path: "name", message: "Nome é obrigatório" },
    ]);

    expect(friendlyError(erro)).toBe("Nome é obrigatório");
  });

  it("issues vazias caem para a mensagem do código", () => {
    const erro = new ApiError(400, "validation_error", "Validation failed", []);

    expect(friendlyError(erro)).toBe("Verifique os campos informados.");
  });
});

describe("friendlyError — sessão e permissão", () => {
  it("credencial errada não revela se o e-mail existe", () => {
    const mensagem = friendlyError(new ApiError(401, "unauthorized", "Invalid credentials"));

    expect(mensagem).toBe("E-mail ou senha inválidos.");
  });

  it("instituição suspensa recebe orientação diferente de senha errada", () => {
    // Mesmo código `unauthorized`, causa completamente distinta: sem isso o
    // admin de uma escola suspensa fica tentando redefinir a senha à toa.
    const mensagem = friendlyError(
      new ApiError(401, "unauthorized", "Tenant status: suspended")
    );

    expect(mensagem).toContain("suspensa");
    expect(mensagem).not.toContain("senha");
  });

  it("reconhece o texto do status em qualquer caixa", () => {
    const mensagem = friendlyError(new ApiError(401, "unauthorized", "TENANT STATUS: cancelled"));

    expect(mensagem).toContain("suspensa");
  });

  it("traduz sessão inválida, expirada e falta de permissão", () => {
    expect(friendlyError(new ApiError(401, "invalid_token", "Invalid token"))).toBe(
      "Sessão inválida. Entre novamente."
    );
    expect(friendlyError(new ApiError(401, "session_expired", "expired"))).toBe(
      "Sessão expirada. Entre novamente."
    );
    expect(friendlyError(new ApiError(403, "forbidden", "Insufficient permissions"))).toBe(
      "Você não tem permissão para executar esta ação."
    );
  });
});

describe("friendlyError — precedência", () => {
  it("slug conhecido ganha das issues", () => {
    const erro = new ApiError(400, "validation_error", "invalid_cpf", [
      { path: "document", message: "mensagem genérica do zod" },
    ]);

    expect(friendlyError(erro)).toBe("CPF inválido — confira os dígitos informados.");
  });

  it("issues ganham do status 429", () => {
    const erro = new ApiError(429, "rate_limited", "Too many requests", [
      { path: "email", message: "campo específico" },
    ]);

    expect(friendlyError(erro)).toBe("campo específico");
  });

  it("status 429 ganha do code quando não há slug nem issues", () => {
    expect(friendlyError(new ApiError(429, "rate_limited", "Too many requests"))).toBe(
      "Muitas tentativas. Aguarde um instante e tente de novo."
    );
  });

  it("code desconhecido cai para a mensagem crua do servidor", () => {
    const erro = new ApiError(500, "codigo_que_nao_existe", "Falhou de um jeito novo");

    expect(friendlyError(erro)).toBe("Falhou de um jeito novo");
  });
});

describe("friendlyError — erros que não vêm da API", () => {
  it("falha de rede vira orientação de conexão, não stack trace", () => {
    // `fetch` rejeita com TypeError quando o servidor está fora do ar.
    const mensagem = friendlyError(new TypeError("Failed to fetch"));

    expect(mensagem).toContain("conectar ao servidor");
  });

  it("Error comum mostra a própria mensagem", () => {
    expect(friendlyError(new Error("algo específico quebrou"))).toBe(
      "algo específico quebrou"
    );
  });

  it("valor que não é erro tem fallback genérico", () => {
    expect(friendlyError("string solta")).toBe("Erro inesperado. Tente novamente.");
    expect(friendlyError(null)).toBe("Erro inesperado. Tente novamente.");
    expect(friendlyError(undefined)).toBe("Erro inesperado. Tente novamente.");
    expect(friendlyError({ qualquer: "coisa" })).toBe("Erro inesperado. Tente novamente.");
  });
});
