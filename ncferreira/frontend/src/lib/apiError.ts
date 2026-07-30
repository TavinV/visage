import { ApiError } from "./api";

/** Mapeia códigos de erro da API para mensagens amigáveis em português. */
const messagesByCode: Record<string, string> = {
  invalid_token: "Sessão inválida. Entre novamente.",
  session_expired: "Sessão expirada. Entre novamente.",
  forbidden: "Você não tem permissão para executar esta ação.",
  not_found: "Registro não encontrado.",
  conflict: "Já existe um registro com esses dados.",
  validation_error: "Verifique os campos informados.",
  rate_limited: "Muitas tentativas. Aguarde um instante e tente de novo.",
};

/**
 * O backend frequentemente devolve o motivo como slug no campo `error`
 * (ex.: "invalid_cpf"). Traduz para algo que o admin consiga agir em cima.
 */
const messagesBySlug: Record<string, string> = {
  invalid_cpf: "CPF inválido — confira os dígitos informados.",
  document_already_exists: "Já existe um usuário com este CPF na instituição.",
  email_already_exists: "Já existe um usuário com este e-mail na instituição.",
  email_required_for_panel_roles: "Informe um e-mail — este cargo acessa o painel.",
  password_too_short: "A senha precisa de pelo menos 8 caracteres.",
  current_password_incorrect: "A senha atual está incorreta.",
  new_password_same_as_current: "A nova senha precisa ser diferente da atual.",
  user_has_no_password: "Este usuário não possui senha de acesso ao painel.",
  user_not_found: "Usuário não encontrado.",
  user_has_related_records:
    "Este usuário possui histórico de presença e não pode ser excluído. Inative o cadastro em vez de excluí-lo.",
};

export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (messagesBySlug[error.message]) return messagesBySlug[error.message];
    if (error.issues?.length) {
      return error.issues.map((i) => i.message).join(" · ");
    }
    if (error.status === 429) return messagesByCode.rate_limited;
    if (error.code === "unauthorized") {
      // O backend usa o mesmo código para credencial errada e tenant inativo
      if (/tenant status/i.test(error.message)) {
        return "A instituição está suspensa ou em análise. Fale com a administração da plataforma.";
      }
      return "E-mail ou senha inválidos.";
    }
    return messagesByCode[error.code] ?? error.message;
  }
  if (error instanceof TypeError) {
    return "Não foi possível conectar à API. Verifique se o backend está no ar.";
  }
  if (error instanceof Error) return error.message;
  return "Erro inesperado. Tente novamente.";
}
