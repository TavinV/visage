import { Badge } from "@/components/ui/Badge";
import type { FacialStatus, SessionStatus, TenantStatus, UserStatus } from "@/lib/types";

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const map: Record<TenantStatus, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
    trial: { label: "Período de teste", variant: "warning" },
    active: { label: "Ativa", variant: "success" },
    suspended: { label: "Suspensa", variant: "danger" },
    cancelled: { label: "Cancelada", variant: "neutral" },
  };
  const cfg = map[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const map: Record<UserStatus, { label: string; variant: "success" | "warning" | "neutral" }> = {
    active: { label: "Ativo", variant: "success" },
    inactive: { label: "Inativo", variant: "neutral" },
    pending: { label: "Pendente", variant: "warning" },
  };
  const cfg = map[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function FacialStatusBadge({ status }: { status: FacialStatus }) {
  const map: Record<FacialStatus, { label: string; variant: "success" | "warning" | "danger" | "neutral" | "accent" }> = {
    none: { label: "Sem biometria", variant: "neutral" },
    consent_given: { label: "Consentiu", variant: "accent" },
    registered: { label: "Biometria ativa", variant: "success" },
    consent_refused: { label: "Recusou", variant: "warning" },
    revoked: { label: "Revogada", variant: "danger" },
  };
  const cfg = map[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>;
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  if (status === "open") return <Badge variant="success" dot>Aberta</Badge>;
  if (status === "cancelled") return <Badge variant="danger">Cancelada</Badge>;
  return <Badge variant="neutral">Encerrada</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="success" dot>Ativo</Badge>
  ) : (
    <Badge variant="neutral">Inativo</Badge>
  );
}

/**
 * Status de recognition_logs. Os quatro primeiros são o que a engine grava
 * hoje (ver recognition.service.ts); os demais são nomes antigos que ainda
 * podem existir em linhas gravadas por versões anteriores.
 */
export const recognitionStatusOptions = [
  { value: "identified", label: "Identificado" },
  { value: "not_identified", label: "Não identificado" },
  { value: "liveness_failed", label: "Vivacidade reprovada" },
  { value: "no_face_detected", label: "Sem rosto na imagem" },
  { value: "multiple_faces_detected", label: "Mais de um rosto" },
];

export function RecognitionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
    identified: { label: "Identificado", variant: "success" },
    not_identified: { label: "Não identificado", variant: "warning" },
    liveness_failed: { label: "Vivacidade reprovada", variant: "danger" },
    no_face_detected: { label: "Sem rosto", variant: "neutral" },
    multiple_faces_detected: { label: "Mais de um rosto", variant: "warning" },
    // Legado
    recognized: { label: "Reconhecido", variant: "success" },
    unknown: { label: "Não identificado", variant: "neutral" },
    below_threshold: { label: "Abaixo do limiar", variant: "warning" },
    screen_detected: { label: "Tela detectada", variant: "danger" },
    no_face: { label: "Sem rosto", variant: "neutral" },
    error: { label: "Erro", variant: "danger" },
  };
  const cfg = map[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

/** Status de enrollment_tokens. */
export function EnrollmentTokenBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "success" | "warning" | "danger" | "neutral" | "accent" }> = {
    pending: { label: "Pendente", variant: "accent" },
    used: { label: "Utilizado", variant: "success" },
    revoked: { label: "Revogado", variant: "danger" },
    expired: { label: "Expirado", variant: "warning" },
  };
  const cfg = map[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
