-- =============================================
-- PLANOS E TENANTS
-- =============================================

CREATE TABLE plans (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  product_type   VARCHAR(20) NOT NULL
                 CHECK (product_type IN ('attendance','timeclock','both','api')),
  max_users      INT NOT NULL DEFAULT 30,
  price_monthly  NUMERIC(10,2) NOT NULL,                        -- preço mensal em reais
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenants (
  id             SERIAL PRIMARY KEY,
  plan_id        INT NOT NULL REFERENCES plans(id),
  name           VARCHAR(200) NOT NULL,
  document       VARCHAR(20),                                   -- CNPJ ou CPF
  type           VARCHAR(20) NOT NULL
                 CHECK (type IN ('school','company')),
  status         VARCHAR(20) NOT NULL DEFAULT 'trial'
                 CHECK (status IN ('active','suspended','trial','cancelled')),
  trial_ends_at  TIMESTAMPTZ,
  timezone       VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenant_settings (
  tenant_id                 INT PRIMARY KEY REFERENCES tenants(id),
  recognition_threshold     FLOAT NOT NULL DEFAULT 1.10,        -- distância máxima ArcFace
  liveness_threshold        FLOAT NOT NULL DEFAULT 0.85,        -- score mínimo MiniFASNet
  liveness_enabled          BOOLEAN NOT NULL DEFAULT true,
  static_pixel_threshold    FLOAT NOT NULL DEFAULT 3.0,         -- variação mínima de pixels (frontend)
  geofence_radius_meters    INT NOT NULL DEFAULT 150,
  allow_manual_override     BOOLEAN NOT NULL DEFAULT true,
  pre_attendance_window_min INT NOT NULL DEFAULT 30,
  -- Fraude: frame salvo apenas quando status='liveness_failed'
  save_fraud_frames         BOOLEAN NOT NULL DEFAULT true,
  fraud_retention_hours     INT NOT NULL DEFAULT 24,            -- TTL dos frames de fraude em disco
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- USUÁRIOS E AUTENTICAÇÃO
-- =============================================

CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  tenant_id      INT NOT NULL REFERENCES tenants(id),
  name           VARCHAR(200) NOT NULL,
  email          VARCHAR(200),                                  -- nulo para quem não acessa o painel
  password_hash  VARCHAR(255),                                  -- nulo para alunos/funcionários sem acesso
  role           VARCHAR(20) NOT NULL
                 CHECK (role IN ('super_admin','admin','manager','teacher','employee')),
  status         VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','inactive','pending')),
  document       VARCHAR(20),                                   -- CPF
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE facial_embeddings (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      INT NOT NULL,
  user_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  embedding_iv   BYTEA NOT NULL,                               -- IV do AES-256-GCM (12 bytes)
  embedding_tag  BYTEA NOT NULL,                               -- tag de autenticação GCM (16 bytes)
  embedding_ct   BYTEA NOT NULL,                               -- ciphertext do embedding (2048 bytes)
  model_version  VARCHAR(50) NOT NULL DEFAULT 'arcface_r50_v1',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, model_version)
);

CREATE TABLE devices (
  id                  SERIAL PRIMARY KEY,
  tenant_id           INT NOT NULL REFERENCES tenants(id),
  user_id             INT REFERENCES users(id),               -- NULL = totem sem vínculo pessoal
  device_fingerprint  VARCHAR(255) NOT NULL,
  device_type         VARCHAR(20) NOT NULL
                      CHECK (device_type IN ('app','totem')),
  label               VARCHAR(100),                           -- "Entrada principal", "Celular João"
  api_key_hash        VARCHAR(255) NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  last_seen_at        TIMESTAMPTZ,
  bound_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, device_fingerprint)
);

CREATE TABLE device_bind_codes (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id),
  user_id     INT NOT NULL REFERENCES users(id),
  code        VARCHAR(6) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- LOCALIZAÇÃO E GEOFENCES
-- =============================================

CREATE TABLE locations (
  id              SERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id),
  name            VARCHAR(100) NOT NULL,
  address         VARCHAR(300),
  latitude        FLOAT,
  longitude       FLOAT,
  radius_meters   INT NOT NULL DEFAULT 150,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_locations (
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id     INT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, location_id)
);

-- =============================================
-- FACEPRESENÇA — ESTRUTURA ACADÊMICA
-- =============================================

CREATE TABLE academic_periods (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id),
  name        VARCHAR(100) NOT NULL,                           -- ex: "2026/1"
  starts_at   DATE NOT NULL,
  ends_at     DATE NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE courses (
  id                  SERIAL PRIMARY KEY,
  tenant_id           INT NOT NULL REFERENCES tenants(id),
  academic_period_id  INT NOT NULL REFERENCES academic_periods(id),
  name                VARCHAR(200) NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE classes (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id),
  course_id   INT NOT NULL REFERENCES courses(id),
  name        VARCHAR(100) NOT NULL,                           -- ex: "Turma A — Noturno"
  teacher_id  INT NOT NULL REFERENCES users(id),
  room        VARCHAR(50),
  location_id INT REFERENCES locations(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE class_enrollments (
  class_id    INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (class_id, user_id)
);

CREATE TABLE class_sessions (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    INT NOT NULL REFERENCES tenants(id),
  class_id     INT NOT NULL REFERENCES classes(id),
  teacher_id   INT NOT NULL REFERENCES users(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  status       VARCHAR(20) NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','closed')),
  created_by   INT NOT NULL REFERENCES users(id)
);

CREATE TABLE attendance_records (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           INT NOT NULL,
  class_session_id    BIGINT NOT NULL REFERENCES class_sessions(id),
  user_id             INT NOT NULL REFERENCES users(id),
  status              VARCHAR(20) NOT NULL
                      CHECK (status IN ('present','absent','manual')),
  recognized_at       TIMESTAMPTZ,
  confidence          FLOAT,
  liveness_score      FLOAT,
  was_pre_attendance  BOOLEAN NOT NULL DEFAULT false,
  adjusted_by         INT REFERENCES users(id),
  adjusted_at         TIMESTAMPTZ,
  UNIQUE (class_session_id, user_id)
);

CREATE TABLE pre_attendances (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      INT NOT NULL,
  location_id    INT NOT NULL REFERENCES locations(id),
  user_id        INT NOT NULL REFERENCES users(id),
  recognized_at  TIMESTAMPTZ NOT NULL,
  confidence     FLOAT NOT NULL,
  liveness_score FLOAT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  consolidated   BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  -- só a primeira chegada por local por dia conta
  UNIQUE (tenant_id, location_id, user_id, date(recognized_at))
);

-- =============================================
-- FACEPONTO — PONTO EMPRESARIAL
-- =============================================

CREATE TABLE work_schedules (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id),
  name        VARCHAR(100) NOT NULL,                           -- ex: "Comercial 8h-17h"
  entries     JSONB NOT NULL,                                  -- [{weekday, start_time, end_time, tolerance_minutes}]
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_schedules (
  user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_schedule_id    INT NOT NULL REFERENCES work_schedules(id),
  starts_at           DATE NOT NULL,
  ends_at             DATE,                                    -- NULL = indefinido
  PRIMARY KEY (user_id, work_schedule_id, starts_at)
);

CREATE TABLE punch_records (
  id                      BIGSERIAL PRIMARY KEY,
  tenant_id               INT NOT NULL,
  user_id                 INT NOT NULL REFERENCES users(id),
  device_id               INT NOT NULL REFERENCES devices(id),
  location_id             INT REFERENCES locations(id),
  type                    VARCHAR(20) NOT NULL
                          CHECK (type IN ('clock_in','clock_out')),
  punched_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude                FLOAT,
  longitude               FLOAT,
  gps_accuracy_meters     FLOAT,
  geofence_valid          BOOLEAN,
  recognition_confidence  FLOAT NOT NULL,
  liveness_score          FLOAT NOT NULL,
  source                  VARCHAR(20) NOT NULL
                          CHECK (source IN ('app','totem')),
  is_manual               BOOLEAN NOT NULL DEFAULT false,
  manual_reason           TEXT,
  adjusted_by             INT REFERENCES users(id),
  adjusted_at             TIMESTAMPTZ
);

-- =============================================
-- RECONHECIMENTO E FRAUDE
-- =============================================

CREATE TABLE recognition_logs (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           INT NOT NULL,
  device_id           INT REFERENCES devices(id),
  user_id             INT REFERENCES users(id),               -- NULL se não identificado
  status              VARCHAR(30) NOT NULL
                      CHECK (status IN (
                        'identified','not_identified',
                        'liveness_failed','no_face_detected'
                      )),
  confidence          FLOAT,
  liveness_score      FLOAT,
  saturation_mean     FLOAT,
  processing_ms       INT,
  source_product      VARCHAR(20)
                      CHECK (source_product IN ('attendance','timeclock','api')),
  -- Preenchido apenas quando status='liveness_failed' e tenant.save_fraud_frames=true
  -- NULL se não salvo ou após exclusão pelo job de limpeza
  fraud_frame_path    VARCHAR(500),
  fraud_frame_exists  BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fraud_cleanup_logs (
  id                  SERIAL PRIMARY KEY,
  run_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  files_deleted       INT NOT NULL DEFAULT 0,
  bytes_freed         BIGINT NOT NULL DEFAULT 0,
  tenants_processed   INT NOT NULL DEFAULT 0,
  error_message       TEXT                                     -- NULL se sucesso
);

-- =============================================
-- CALIBRAÇÃO
-- =============================================

CREATE TABLE calibration_sessions (
  id                    SERIAL PRIMARY KEY,
  tenant_id             INT NOT NULL REFERENCES tenants(id),
  created_by            INT NOT NULL REFERENCES users(id),
  calibration_type      VARCHAR(20) NOT NULL
                        CHECK (calibration_type IN ('liveness_hsv','recognition')),
  status                VARCHAR(20) NOT NULL DEFAULT 'collecting'
                        CHECK (status IN ('collecting','analyzed','applied','discarded')),
  sample_count_real     INT NOT NULL DEFAULT 0,
  sample_count_attack   INT NOT NULL DEFAULT 0,
  suggested_liveness    FLOAT,
  suggested_recognition FLOAT,
  suggested_hsv_sat_max FLOAT,
  applied_liveness      FLOAT,
  applied_recognition   FLOAT,
  applied_hsv_sat_max   FLOAT,
  analysis_result       JSONB,
  confidence            VARCHAR(20)
                        CHECK (confidence IN ('low','medium','high')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at           TIMESTAMPTZ,
  applied_at            TIMESTAMPTZ
);

CREATE TABLE calibration_samples (
  id                      BIGSERIAL PRIMARY KEY,
  calibration_session_id  INT NOT NULL REFERENCES calibration_sessions(id) ON DELETE CASCADE,
  tenant_id               INT NOT NULL,
  label                   VARCHAR(10) NOT NULL
                          CHECK (label IN ('real','attack')),
  face_detected           BOOLEAN NOT NULL,
  detection_score         FLOAT,
  liveness_v1_raw         FLOAT,
  liveness_v2_raw         FLOAT,
  liveness_combined       FLOAT,
  saturation_mean         FLOAT,
  saturation_std          FLOAT,
  attack_type             VARCHAR(50),                         -- 'celular' | 'impresso' | 'video'
  person_id               VARCHAR(100),
  error_message           TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ÍNDICES CRÍTICOS
-- =============================================

-- Hot path: validação de API Key em toda requisição de dispositivo
CREATE INDEX ON devices (api_key_hash);
CREATE INDEX ON devices (tenant_id, is_active);

-- Queries de presença
CREATE INDEX ON users (tenant_id, status);
CREATE INDEX ON facial_embeddings (tenant_id, user_id);
CREATE INDEX ON class_sessions (tenant_id, status, started_at DESC);
CREATE INDEX ON attendance_records (tenant_id, class_session_id);
CREATE INDEX ON pre_attendances (tenant_id, location_id, consolidated)
  WHERE consolidated = false;

-- Queries de ponto
CREATE INDEX ON punch_records (tenant_id, user_id, punched_at DESC);
CREATE INDEX ON punch_records (tenant_id, punched_at DESC);

-- Auditoria de fraude
CREATE INDEX ON recognition_logs (tenant_id, created_at DESC);
CREATE INDEX ON recognition_logs (tenant_id, fraud_frame_exists)
  WHERE fraud_frame_exists = true;
