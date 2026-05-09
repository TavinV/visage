-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "maxClasses" INTEGER NOT NULL DEFAULT 20,
    "priceMonthly" DECIMAL(19,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "document" VARCHAR(20),
    "institutionType" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'trial',
    "trialEndsAt" TIMESTAMPTZ,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenantId" INTEGER NOT NULL,
    "recognitionThreshold" DOUBLE PRECISION NOT NULL DEFAULT 1.10,
    "livenessThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "livenessEnabled" BOOLEAN NOT NULL DEFAULT true,
    "staticPixelThreshold" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "allowManualOverride" BOOLEAN NOT NULL DEFAULT true,
    "preAttendanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "preAttendanceWindowMin" INTEGER NOT NULL DEFAULT 30,
    "individualCheckoutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "saveFraudFrames" BOOLEAN NOT NULL DEFAULT true,
    "fraudRetentionHours" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "tenant_keys" (
    "tenantId" INTEGER NOT NULL,
    "dekCt" BYTEA NOT NULL,
    "dekIv" BYTEA NOT NULL,
    "dekTag" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_keys_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(200),
    "passwordHash" VARCHAR(255),
    "role" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "document" VARCHAR(20),
    "enrollmentCode" VARCHAR(50),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facial_embeddings" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "embeddingIv" BYTEA NOT NULL,
    "embeddingTag" BYTEA NOT NULL,
    "embeddingCt" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "modelVersion" VARCHAR(50) NOT NULL DEFAULT 'arcface_r50_v1',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facial_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "deviceFingerprint" VARCHAR(255) NOT NULL,
    "label" VARCHAR(100),
    "apiKeyHash" VARCHAR(255) NOT NULL,
    "locationId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(300),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "academicPeriodId" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "room" VARCHAR(50),
    "locationId" INTEGER,
    "totalClassesPlanned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_enrollments" (
    "classId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "enrolledAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("classId","userId")
);

-- CreateTable
CREATE TABLE "student_class_summary" (
    "classId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "classesAttended" INTEGER NOT NULL DEFAULT 0,
    "classesAbsent" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_class_summary_pkey" PRIMARY KEY ("classId","userId")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "classesWorth" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "classSessionId" BIGINT NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "recognizedAt" TIMESTAMPTZ,
    "checkedOutAt" TIMESTAMPTZ,
    "checkoutReleasedById" INTEGER,
    "confidence" DOUBLE PRECISION,
    "livenessScore" DOUBLE PRECISION,
    "wasPreAttendance" BOOLEAN NOT NULL DEFAULT false,
    "adjustedById" INTEGER,
    "adjustedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_attendances" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "recognizedAt" TIMESTAMPTZ NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "livenessScore" DOUBLE PRECISION NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consolidated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pre_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recognition_logs" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "deviceId" INTEGER,
    "userId" INTEGER,
    "status" VARCHAR(30) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "livenessScore" DOUBLE PRECISION,
    "saturationMean" DOUBLE PRECISION,
    "processingMs" INTEGER,
    "fraudFramePath" VARCHAR(500),
    "fraudFrameExists" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recognition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_cleanup_logs" (
    "id" SERIAL NOT NULL,
    "runAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filesDeleted" INTEGER NOT NULL DEFAULT 0,
    "bytesFreed" BIGINT NOT NULL DEFAULT 0,
    "tenantsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "audit_cleanup_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "facial_embeddings_userId_modelVersion_key" ON "facial_embeddings"("userId", "modelVersion");

-- CreateIndex
CREATE INDEX "devices_apiKeyHash_idx" ON "devices"("apiKeyHash");

-- CreateIndex
CREATE INDEX "devices_tenantId_isActive_idx" ON "devices"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "devices_tenantId_deviceFingerprint_key" ON "devices"("tenantId", "deviceFingerprint");

-- CreateIndex
CREATE INDEX "student_class_summary_userId_idx" ON "student_class_summary"("userId");

-- CreateIndex
CREATE INDEX "attendance_records_tenantId_classSessionId_idx" ON "attendance_records"("tenantId", "classSessionId");

-- CreateIndex
CREATE INDEX "attendance_records_classSessionId_status_idx" ON "attendance_records"("classSessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_classSessionId_userId_key" ON "attendance_records"("classSessionId", "userId");

-- CreateIndex
CREATE INDEX "pre_attendances_tenantId_locationId_consolidated_idx" ON "pre_attendances"("tenantId", "locationId", "consolidated");

-- CreateIndex
CREATE UNIQUE INDEX "pre_attendances_tenantId_locationId_userId_recognizedAt_key" ON "pre_attendances"("tenantId", "locationId", "userId", "recognizedAt" DESC);

-- CreateIndex
CREATE INDEX "recognition_logs_tenantId_createdAt_idx" ON "recognition_logs"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "recognition_logs_tenantId_fraudFrameExists_idx" ON "recognition_logs"("tenantId", "fraudFrameExists");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_keys" ADD CONSTRAINT "tenant_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facial_embeddings" ADD CONSTRAINT "facial_embeddings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facial_embeddings" ADD CONSTRAINT "facial_embeddings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_class_summary" ADD CONSTRAINT "student_class_summary_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_checkoutReleasedById_fkey" FOREIGN KEY ("checkoutReleasedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_attendances" ADD CONSTRAINT "pre_attendances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_attendances" ADD CONSTRAINT "pre_attendances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_attendances" ADD CONSTRAINT "pre_attendances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition_logs" ADD CONSTRAINT "recognition_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition_logs" ADD CONSTRAINT "recognition_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition_logs" ADD CONSTRAINT "recognition_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
