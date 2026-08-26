/**
 * Tipos da API — espelham os *Output dos services do backend
 * (backend/src/services/*.service.ts). Datas chegam como string ISO via JSON.
 */

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

export type Role = "super_admin" | "admin" | "manager" | "teacher" | "student";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Senha temporária em uso — o console força a troca antes de liberar. */
  mustChangePassword?: boolean;
}

/** access_token/refresh_token não aparecem aqui — chegam como cookies httpOnly. */
export interface AuthTokens {
  expiresIn: number;
  user: AuthUser;
}

export interface Plan {
  id: string;
  name: string;
  maxClasses: number;
  /** Decimal serializado como string pelo Prisma. */
  priceMonthly: string;
  isActive: boolean;
  createdAt: string;
}

export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";
export type InstitutionType = "school" | "university";

export interface Tenant {
  id: string;
  name: string;
  document?: string;
  institutionType: InstitutionType;
  status: TenantStatus;
  createdAt: string;
}

export interface RotateDekResult {
  tenantId: string;
  keyVersion: number;
  embeddingsRotated: number;
}

/** O que a secretaria registra no cadastro do aluno. */
export type StudentIdentification = "cpf" | "enrollment_code" | "both";
/** O que o aluno digita no totem — `any` aceita CPF ou matrícula. */
export type TotemIdentification = "cpf" | "enrollment_code" | "any";

export interface TenantSettings {
  tenantId: string;
  recognitionThreshold: number;
  livenessThreshold: number;
  livenessEnabled: boolean;
  allowManualOverride: boolean;
  preAttendanceEnabled: boolean;
  preAttendanceWindowMin: number;
  individualCheckoutEnabled: boolean;
  saveFraudFrames: boolean;
  fraudRetentionHours: number;
  enrollmentTokenExpiryHours: number;
  requireConsentBeforeFacial: boolean;
  enrollmentMultiFrameCount: number;
  livenessThresholdEnrollment: number;
  totemPanelPassword: string | null;
  totemClockTimezone: string;
  studentIdentification: StudentIdentification;
  totemIdentification: TotemIdentification;
  /** Confere os dígitos verificadores do CPF no cadastro. */
  validateCpf: boolean;
  hasLogo: boolean;
  logoUpdatedAt?: string;
  updatedAt: string;
}

export type FacialStatus = "none" | "consent_given" | "registered" | "consent_refused" | "revoked";
export type UserStatus = "active" | "inactive" | "pending";

export interface User {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  role: Role;
  status: UserStatus;
  document?: string;
  enrollmentCode?: string;
  facialStatus: FacialStatus;
  /** Tem foto de perfil enviada — alunos nunca têm. */
  hasPhoto: boolean;
  photoUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  tenantId: string;
  name: string;
  address?: string;
  isActive: boolean;
  createdAt: string;
}

/** Calibração de um totem — null em um campo significa "herda do tenant". */
export interface DeviceCalibration {
  recognitionThreshold: number | null;
  livenessThreshold: number | null;
  livenessEnabled: boolean | null;
  /** Valores realmente usados no reconhecimento (override ?? tenant). */
  effectiveRecognitionThreshold: number;
  effectiveLivenessThreshold: number;
  effectiveLivenessEnabled: boolean;
  isCalibrated: boolean;
  calibratedAt?: string;
  /** Totem de origem, quando a calibração veio copiada. */
  calibrationSourceId?: string;
  calibrationSourceLabel?: string;
}

export interface Device {
  id: string;
  tenantId: string;
  deviceFingerprint: string;
  label?: string;
  locationId?: string;
  isActive: boolean;
  /** Libera o fluxo de cadastro biométrico por CPF na tela deste totem. */
  allowEnrollment: boolean;
  lastSeenAt?: string;
  createdAt: string;
  calibration?: DeviceCalibration;
  /** Presente somente na resposta do POST — nunca é retornada de novo. */
  apiKey?: string;
}

export interface AcademicPeriod {
  id: string;
  tenantId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  createdAt: string;
}

export type LessonDurationUnit = "minutes" | "hours";

export interface Course {
  id: string;
  tenantId: string;
  academicPeriodId: string;
  periodName?: string;
  name: string;
  /** Quantas aulas cabem num dia letivo. */
  lessonsPerDay: number;
  /** Duração de uma aula na unidade escolhida pela secretaria. */
  lessonDuration: number;
  lessonDurationUnit: LessonDurationUnit;
  /** Mesmo valor em minutos — o que o backend usa nos cálculos. */
  lessonDurationMin: number;
  subjectCount?: number;
  createdAt: string;
}

/** Catálogo: só o nome da disciplina e a sigla no currículo do curso. Carga,
 *  duração e professor são decididos por turma, em ClassSubject. */
export interface Subject {
  id: string;
  tenantId: string;
  courseId: string;
  courseName?: string;
  name: string;
  code?: string;
  isActive: boolean;
  /** Em quantas turmas é cursada. */
  classCount?: number;
  createdAt: string;
}

export interface ClassSubjectTeacher {
  id: string;
  name: string;
  /** Responsável pela disciplina na turma. */
  isPrimary: boolean;
}

/** Uma disciplina cursada por uma turma: time de professores e carga próprios. */
export interface ClassSubject {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  /** Responsável — primeiro da lista de teachers. */
  teacherId: string;
  teacherName: string;
  teachers: ClassSubjectTeacher[];
  lessonsPerSession: number;
  totalLessonsPlanned: number;
  /** Duração de UMA aula desta disciplina nesta turma, em minutos. */
  lessonDurationMin: number;
  /** Duração de uma chamada inteira (lessonDurationMin × lessonsPerSession). */
  sessionDurationMin: number;
}

/** Resultado de aplicar a grade do curso nas turmas. */
export interface ApplyCurriculumResult {
  classesAffected: number;
  created: number;
  updated: number;
  skipped: number;
  details: Array<{
    classId: string;
    className: string;
    subjectName: string;
    action: "created" | "updated" | "skipped";
    reason?: string;
  }>;
}

export interface ClassItem {
  id: string;
  tenantId: string;
  courseId: string;
  courseName?: string;
  name: string;
  room?: string;
  locationId?: string;
  locationName?: string;
  /** Grade do curso — a turma só exibe. */
  lessonDurationMin: number;
  lessonsPerDay: number;
  subjects: ClassSubject[];
  /** Soma das aulas por chamada de todas as disciplinas. */
  lessonsAssigned: number;
  enrolledCount: number;
  createdAt: string;
}

export interface ClassEnrollment {
  classId: string;
  userId: string;
  enrolledAt: string;
  /** Dados do aluno embutidos pelo backend. */
  student?: {
    name: string;
    enrollmentCode?: string;
    facialStatus: FacialStatus;
  };
}

export type SessionStatus = "open" | "closed" | "cancelled";

export interface ClassSession {
  id: string;
  tenantId: string;
  /** A chamada é de uma disciplina da turma. */
  classSubjectId: string;
  classId: string;
  className?: string;
  subjectId?: string;
  subjectName?: string;
  teacherId: string;
  teacherName?: string;
  createdById: string;
  /** Sala escolhida ao abrir a chamada (sobrepõe a sala padrão da turma). */
  locationId?: string;
  locationName?: string;
  /** Hora REAL de início da aula, informada pelo professor. */
  startedAt: string;
  endedAt?: string;
  status: SessionStatus;
  /** Vem da disciplina — o professor não escolhe. */
  classesWorth: number;
  lessonDurationMin: number;
  /** startedAt + classesWorth × lessonDurationMin. */
  scheduledEndsAt?: string;
  autoClosed: boolean;
  createdAt: string;
}

export interface RollcallStudent {
  userId: string;
  name: string;
  enrollmentCode?: string;
  facialStatus: FacialStatus;
  status: "present" | "absent" | "pending";
  source: "facial" | "pre" | "manual" | null;
  recognizedAt?: string;
  confidence?: number;
  classesCounted: number;
  adjusted: boolean;
  /** Checkout individual: professor liberou a saída. */
  checkoutReleased: boolean;
  checkoutReleasedAt?: string;
  /** Preenchido quando o totem reconheceu a saída. */
  checkedOutAt?: string;
}

export interface Rollcall {
  session: ClassSession;
  students: RollcallStudent[];
  stats: { present: number; absent: number; pending: number; facial: number; manual: number };
}

export interface SessionFrame {
  id: string;
  status: string;
  livenessScore?: number;
  deviceId?: string;
  createdAt: string;
}

export interface RecognitionLog {
  id: string;
  tenantId: string;
  deviceId?: string;
  userId?: string;
  userName?: string;
  status: string;
  confidence?: number;
  livenessScore?: number;
  saturationMean?: number;
  processingMs?: number;
  fraudFrameExists: boolean;
  createdAt: string;
}

// ── Trilha de auditoria ──────────────────────────────────────────────────────

export type AuditSeverity = "info" | "warning" | "critical";

/** Um evento da trilha. Espelha AuditLogOutput do backend. */
export interface AuditLog {
  id: string;
  tenantId?: string;
  tenantName?: string;
  /** Chave do catálogo, ex. "device.created". */
  action: string;
  /** Rótulo em pt-BR já resolvido pelo backend. */
  actionLabel: string;
  category: string;
  categoryLabel: string;
  severity: AuditSeverity;
  status: "success" | "failure";
  actorType: "user" | "device" | "system" | "anonymous";
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  sessionId?: string;
  deviceId?: string;
  deviceLabel?: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  /** Campos que mudaram — as chaves de beforeState/afterState. */
  changedFields: string[];
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
  details?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Entrada do catálogo servido por GET /audit/events. */
export interface AuditEventDefinition {
  action: string;
  label: string;
  category: string;
  categoryLabel: string;
  severity: AuditSeverity;
  targetType?: string;
}

export interface AuditEventCatalog {
  events: AuditEventDefinition[];
  categories: Array<{ value: string; label: string }>;
}

export interface AuditActor {
  id: string;
  name: string;
  role?: string;
  eventCount: number;
}

export interface AuditStats {
  total: number;
  byCategory: Array<{ category: string; label: string; count: number }>;
  bySeverity: Array<{ severity: string; count: number }>;
  activeSessions: number;
}

/** Uma sessão de login no console. */
export interface AuthSession {
  id: string;
  tenantId: string;
  tenantName?: string;
  /** Ausente quando a conta foi excluída depois do login. */
  userId?: string;
  userName: string;
  userEmail?: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
  loginAt: string;
  lastSeenAt: string;
  endedAt?: string;
  endReason?: "logout" | "expired" | "revoked";
  isActive: boolean;
  durationMinutes: number;
  eventCount: number;
}

export interface AuthSessionDetail {
  session: AuthSession;
  /** O que a pessoa fez nesta sessão, em ordem cronológica. */
  timeline: AuditLog[];
}

export interface UserActivity {
  user: { id: string; name: string; email?: string; role: string; status: string };
  totals: {
    events: number;
    sessions: number;
    lastLoginAt?: string;
    lastActionAt?: string;
  };
  byAction: Array<{ action: string; label: string; category: string; count: number }>;
  recentSessions: AuthSession[];
}

export interface EnrollmentTokenStatus {
  status: "pending" | "used" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
}

export interface GeneratedEnrollmentToken {
  token: string;
  expiresAt: string;
}

export interface FrequencyReportStudent {
  userId: string;
  name: string;
  attended: number;
  absent: number;
  /** Presenças ÷ aulas previstas no período. */
  frequencyPercent: number;
  /** Presenças ÷ aulas que já aconteceram. */
  partialPercent: number;
}

export interface FrequencyReport {
  classSubjectId: string;
  classId: string;
  className: string;
  subjectName: string;
  teacherName: string;
  periodId?: string;
  periodName?: string;
  /** Aulas previstas no período — denominador da frequência. */
  totalClassesPlanned: number;
  /** Aulas já lançadas. */
  lessonsSoFar: number;
  students: FrequencyReportStudent[];
}

export interface StudentClassSummary {
  classSubjectId: string;
  classId: string;
  /** "3º A — Matemática" */
  name: string;
  className: string;
  subjectName: string;
  attended: number;
  absent: number;
  frequencyPercent: number;
  totalClassesPlanned: number;
}

// ── Visão geral (tela inicial) ───────────────────────────────────────────────

export interface DashboardDailyPoint {
  /** YYYY-MM-DD no fuso da instituição. */
  date: string;
  total: number;
  identified: number;
  notIdentified: number;
  fraud: number;
  fraudRatePercent: number;
  avgProcessingMs: number | null;
  p95ProcessingMs: number | null;
}

export interface DashboardAttendancePoint {
  date: string;
  present: number;
  absent: number;
  attendanceRatePercent: number;
}

export interface DashboardDeviceStat {
  deviceId: string;
  label: string;
  locationName?: string;
  total: number;
  fraud: number;
  avgProcessingMs: number | null;
  lastSeenAt?: string;
  isOnline: boolean;
}

export interface DashboardOverview {
  range: { days: number; from: string; to: string; timezone: string };
  totals: {
    users: number;
    students: number;
    teachers: number;
    classes: number;
    devices: number;
    devicesOnline: number;
    openSessions: number;
    sessionsToday: number;
    studentsWithBiometrics: number;
    biometricCoveragePercent: number;
  };
  recognition: {
    total: number;
    identified: number;
    notIdentified: number;
    fraud: number;
    identificationRatePercent: number;
    fraudRatePercent: number;
    avgProcessingMs: number | null;
    p95ProcessingMs: number | null;
    avgConfidence: number | null;
    avgLivenessScore: number | null;
    previous: {
      total: number;
      fraudRatePercent: number;
      avgProcessingMs: number | null;
    };
  };
  daily: DashboardDailyPoint[];
  hourly: Array<{ hour: number; total: number }>;
  attendance: {
    present: number;
    absent: number;
    attendanceRatePercent: number;
    sessionsClosed: number;
    daily: DashboardAttendancePoint[];
  };
  devices: DashboardDeviceStat[];
  statusBreakdown: Array<{ status: string; count: number }>;
}

// ── Visão geral da plataforma (console do super admin) ───────────────────────

export interface PlatformDailyPoint {
  /** YYYY-MM-DD no fuso da plataforma. */
  date: string;
  total: number;
  identified: number;
  notIdentified: number;
  fraud: number;
  fraudRatePercent: number;
  avgProcessingMs: number | null;
  p95ProcessingMs: number | null;
  /** Instituições distintas que usaram a engine no dia. */
  activeTenants: number;
}

export interface PlatformTenantActivity {
  tenantId: string;
  name: string;
  status: TenantStatus;
  planName: string;
  total: number;
  identified: number;
  fraud: number;
  fraudRatePercent: number;
  avgProcessingMs: number | null;
}

export interface PlatformOverview {
  range: { days: number; from: string; to: string; timezone: string };
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    cancelled: number;
    newInPeriod: number;
    previousNewInPeriod: number;
    byStatus: Array<{ status: string; count: number }>;
    byPlan: Array<{
      planId: string;
      planName: string;
      priceMonthly: number;
      isActive: boolean;
      tenants: number;
      mrr: number;
    }>;
    daily: Array<{ date: string; created: number; cumulative: number }>;
  };
  revenue: {
    /** Mensalidade somada das instituições ativas. */
    mrr: number;
    /** Receita ainda em período de teste. */
    trialMrr: number;
    /** Receita média por instituição pagante. */
    arpa: number;
  };
  usage: {
    users: number;
    students: number;
    teachers: number;
    classes: number;
    devices: number;
    devicesOnline: number;
    openSessions: number;
    sessionsInPeriod: number;
    studentsWithBiometrics: number;
    biometricCoveragePercent: number;
  };
  recognition: {
    total: number;
    identified: number;
    notIdentified: number;
    fraud: number;
    identificationRatePercent: number;
    fraudRatePercent: number;
    avgProcessingMs: number | null;
    p95ProcessingMs: number | null;
    avgConfidence: number | null;
    avgLivenessScore: number | null;
    previous: {
      total: number;
      fraudRatePercent: number;
      avgProcessingMs: number | null;
    };
  };
  daily: PlatformDailyPoint[];
  hourly: Array<{ hour: number; total: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  topTenants: PlatformTenantActivity[];
}

/** Resposta de GET /admin/health — a engine reporta os modelos carregados. */
export interface EngineHealth {
  status?: string;
  models?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface StudentHistoryEntry {
  id: string;
  status: string;
  recognizedAt?: string | null;
  checkedOutAt?: string | null;
  wasPreAttendance: boolean;
  classSession: {
    id: string;
    startedAt: string;
    endedAt?: string | null;
    classesWorth: number;
    classSubject: {
      id: string;
      subject: { name: string };
      class: { id: string; name: string };
    };
  };
}
