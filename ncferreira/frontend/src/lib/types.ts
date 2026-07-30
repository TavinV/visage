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

export interface Course {
  id: string;
  tenantId: string;
  academicPeriodId: string;
  name: string;
  createdAt: string;
}

export interface ClassItem {
  id: string;
  tenantId: string;
  courseId: string;
  name: string;
  teacherId: string;
  room?: string;
  locationId?: string;
  totalClassesPlanned: number;
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
  classId: string;
  className?: string;
  teacherId: string;
  teacherName?: string;
  createdById: string;
  /** Sala escolhida ao abrir a chamada (sobrepõe a sala padrão da turma). */
  locationId?: string;
  locationName?: string;
  startedAt: string;
  endedAt?: string;
  status: SessionStatus;
  classesWorth: number;
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
  frequencyPercent: number;
}

export interface FrequencyReport {
  classId: string;
  className: string;
  periodId?: string;
  totalClassesPlanned: number;
  students: FrequencyReportStudent[];
}

export interface StudentClassSummary {
  classId: string;
  name: string;
  attended: number;
  absent: number;
  frequencyPercent: number;
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
    class: { id: string; name: string };
  };
}
