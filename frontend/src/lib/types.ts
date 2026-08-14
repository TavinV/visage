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

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
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

/** Catálogo: só o nome da disciplina no currículo do curso. */
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

/** Uma disciplina cursada por uma turma: professor e carga próprios. */
export interface ClassSubject {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  teacherId: string;
  teacherName: string;
  lessonsPerSession: number;
  totalLessonsPlanned: number;
  sessionDurationMin: number;
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
