/**
 * Catálogo de eventos auditáveis.
 *
 * Fonte única de verdade para o que a trilha registra. Cada evento traz sua
 * categoria, severidade e rótulo em português — o backend usa para preencher
 * as colunas, e o frontend consome via GET /audit/events para montar o filtro
 * e traduzir as linhas sem duplicar a tabela do lado do cliente.
 *
 * Convenção da chave: `dominio.acao` no passado (device.created, consent.granted).
 * Adicionar evento novo é só acrescentar aqui — nada mais precisa mudar.
 */

export const AUDIT_CATEGORIES = {
  auth: "Acesso ao sistema",
  user: "Usuários",
  student: "Alunos",
  consent: "Consentimento (LGPD)",
  data: "Dados pessoais",
  device: "Totens",
  academic: "Estrutura acadêmica",
  attendance: "Chamada e presença",
  settings: "Configurações",
  tenant: "Instituições",
} as const;

export type AuditCategory = keyof typeof AUDIT_CATEGORIES;
export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEventDefinition {
  category: AuditCategory;
  severity: AuditSeverity;
  /** Rótulo em pt-BR exibido no console. */
  label: string;
  /** Tipo do registro afetado — alimenta a busca "histórico deste aluno". */
  targetType?: string;
}

/**
 * `critical` é reservado para o que um auditor externo procuraria primeiro:
 * exclusão de dados pessoais, consentimento, chaves de acesso e mudanças que
 * afetam o rigor do reconhecimento.
 */
export const AUDIT_EVENTS = {
  // ── Acesso ────────────────────────────────────────────────────────────────
  "auth.login": { category: "auth", severity: "info", label: "Login realizado", targetType: "user" },
  "auth.login_failed": { category: "auth", severity: "warning", label: "Tentativa de login malsucedida", targetType: "user" },
  "auth.logout": { category: "auth", severity: "info", label: "Logout", targetType: "user" },
  "auth.session_expired": { category: "auth", severity: "info", label: "Sessão expirada", targetType: "user" },
  "auth.password_changed": { category: "auth", severity: "warning", label: "Senha alterada pelo próprio usuário", targetType: "user" },
  "auth.password_reset_requested": { category: "auth", severity: "warning", label: "Redefinição de senha solicitada", targetType: "user" },
  "auth.password_reset_completed": { category: "auth", severity: "warning", label: "Senha redefinida por link de e-mail", targetType: "user" },

  // ── Usuários do console ───────────────────────────────────────────────────
  "user.created": { category: "user", severity: "info", label: "Usuário criado", targetType: "user" },
  "user.updated": { category: "user", severity: "info", label: "Usuário editado", targetType: "user" },
  "user.deleted": { category: "user", severity: "critical", label: "Usuário excluído", targetType: "user" },
  "user.password_reset": { category: "user", severity: "warning", label: "Senha de usuário redefinida por administrador", targetType: "user" },
  "user.photo_updated": { category: "user", severity: "info", label: "Foto de perfil atualizada", targetType: "user" },
  "user.photo_removed": { category: "user", severity: "info", label: "Foto de perfil removida", targetType: "user" },

  // ── Alunos ────────────────────────────────────────────────────────────────
  "student.created": { category: "student", severity: "info", label: "Aluno cadastrado", targetType: "user" },
  "student.updated": { category: "student", severity: "info", label: "Cadastro de aluno editado", targetType: "user" },
  "student.deleted": { category: "student", severity: "critical", label: "Aluno excluído", targetType: "user" },
  "student.enrolled_in_class": { category: "student", severity: "info", label: "Aluno matriculado em turma", targetType: "class_enrollment" },
  "student.removed_from_class": { category: "student", severity: "warning", label: "Aluno removido de turma", targetType: "class_enrollment" },

  // ── Consentimento e biometria (LGPD) ──────────────────────────────────────
  "consent.granted": { category: "consent", severity: "critical", label: "Consentimento biométrico concedido", targetType: "user" },
  "consent.refused": { category: "consent", severity: "warning", label: "Consentimento biométrico recusado", targetType: "user" },
  "consent.revoked": { category: "consent", severity: "critical", label: "Consentimento biométrico revogado", targetType: "user" },
  "biometrics.registered": { category: "consent", severity: "critical", label: "Biometria facial cadastrada", targetType: "user" },

  // ── Dados pessoais ────────────────────────────────────────────────────────
  "data.erased": { category: "data", severity: "critical", label: "Dados biométricos excluídos definitivamente", targetType: "user" },
  "data.fraud_frame_viewed": { category: "data", severity: "warning", label: "Foto de tentativa de fraude visualizada", targetType: "recognition_log" },
  "data.student_history_viewed": { category: "data", severity: "info", label: "Histórico de aluno consultado", targetType: "user" },

  // ── Totens ────────────────────────────────────────────────────────────────
  "device.created": { category: "device", severity: "warning", label: "Totem criado", targetType: "device" },
  "device.updated": { category: "device", severity: "info", label: "Totem editado", targetType: "device" },
  "device.deleted": { category: "device", severity: "critical", label: "Totem excluído", targetType: "device" },
  "device.api_key_regenerated": { category: "device", severity: "critical", label: "Chave de acesso do totem regenerada", targetType: "device" },
  "device.calibrated": { category: "device", severity: "warning", label: "Totem calibrado", targetType: "device" },
  "device.calibration_reset": { category: "device", severity: "warning", label: "Calibração do totem redefinida", targetType: "device" },
  "device.calibration_copied": { category: "device", severity: "warning", label: "Calibração copiada para outros totens", targetType: "device" },

  // ── Estrutura acadêmica ───────────────────────────────────────────────────
  "location.created": { category: "academic", severity: "info", label: "Local criado", targetType: "location" },
  "location.updated": { category: "academic", severity: "info", label: "Local editado", targetType: "location" },
  "location.deleted": { category: "academic", severity: "warning", label: "Local excluído", targetType: "location" },
  "course.created": { category: "academic", severity: "info", label: "Curso criado", targetType: "course" },
  "course.updated": { category: "academic", severity: "info", label: "Curso editado", targetType: "course" },
  "course.deleted": { category: "academic", severity: "warning", label: "Curso excluído", targetType: "course" },
  "course.curriculum_applied": { category: "academic", severity: "info", label: "Grade curricular aplicada", targetType: "course" },
  "subject.created": { category: "academic", severity: "info", label: "Disciplina criada", targetType: "subject" },
  "subject.updated": { category: "academic", severity: "info", label: "Disciplina editada", targetType: "subject" },
  "subject.deleted": { category: "academic", severity: "warning", label: "Disciplina excluída", targetType: "subject" },
  "class.created": { category: "academic", severity: "info", label: "Turma criada", targetType: "class" },
  "class.updated": { category: "academic", severity: "info", label: "Turma editada", targetType: "class" },
  "class.deleted": { category: "academic", severity: "warning", label: "Turma excluída", targetType: "class" },
  "period.created": { category: "academic", severity: "info", label: "Período letivo criado", targetType: "academic_period" },
  "period.updated": { category: "academic", severity: "info", label: "Período letivo editado", targetType: "academic_period" },
  "period.deleted": { category: "academic", severity: "warning", label: "Período letivo excluído", targetType: "academic_period" },

  // ── Chamada e presença ────────────────────────────────────────────────────
  "session.opened": { category: "attendance", severity: "info", label: "Chamada aberta", targetType: "class_session" },
  "session.updated": { category: "attendance", severity: "info", label: "Chamada editada", targetType: "class_session" },
  "session.closed": { category: "attendance", severity: "info", label: "Chamada encerrada", targetType: "class_session" },
  "session.cancelled": { category: "attendance", severity: "warning", label: "Chamada cancelada", targetType: "class_session" },
  "session.auto_closed": { category: "attendance", severity: "info", label: "Chamada encerrada automaticamente", targetType: "class_session" },
  "attendance.manual_override": { category: "attendance", severity: "warning", label: "Presença ajustada manualmente", targetType: "attendance_record" },
  "attendance.checkout_released": { category: "attendance", severity: "warning", label: "Saída liberada", targetType: "attendance_record" },
  "attendance.checkout_revoked": { category: "attendance", severity: "warning", label: "Liberação de saída revogada", targetType: "attendance_record" },

  // ── Configurações ─────────────────────────────────────────────────────────
  "settings.updated": { category: "settings", severity: "warning", label: "Configurações da instituição alteradas", targetType: "tenant_settings" },
  "settings.logo_updated": { category: "settings", severity: "info", label: "Logo da instituição atualizada", targetType: "tenant" },

  // ── Instituições (super admin) ────────────────────────────────────────────
  "tenant.created": { category: "tenant", severity: "critical", label: "Instituição criada", targetType: "tenant" },
  "tenant.updated": { category: "tenant", severity: "warning", label: "Instituição editada", targetType: "tenant" },
  "tenant.activated": { category: "tenant", severity: "critical", label: "Instituição ativada", targetType: "tenant" },
  "tenant.deactivated": { category: "tenant", severity: "critical", label: "Instituição suspensa", targetType: "tenant" },
  "tenant.cancelled": { category: "tenant", severity: "critical", label: "Instituição cancelada", targetType: "tenant" },
  "plan.created": { category: "tenant", severity: "warning", label: "Plano criado", targetType: "plan" },
  "plan.updated": { category: "tenant", severity: "warning", label: "Plano editado", targetType: "plan" },
} as const satisfies Record<string, AuditEventDefinition>;

export type AuditAction = keyof typeof AUDIT_EVENTS;

/**
 * Definição do evento. Aceita string solta para tolerar linhas antigas gravadas
 * com ações que não estão mais no catálogo — a trilha nunca perde uma linha
 * só porque a chave envelheceu.
 */
export function describeEvent(action: string): AuditEventDefinition {
  return (
    (AUDIT_EVENTS as Record<string, AuditEventDefinition>)[action] ?? {
      category: "settings",
      severity: "info",
      label: action,
    }
  );
}

/** Catálogo achatado para o frontend montar filtros e traduzir linhas. */
export function listEventCatalog(): Array<
  AuditEventDefinition & { action: string; categoryLabel: string }
> {
  return Object.entries(AUDIT_EVENTS).map(([action, def]) => ({
    action,
    ...def,
    categoryLabel: AUDIT_CATEGORIES[def.category],
  }));
}
