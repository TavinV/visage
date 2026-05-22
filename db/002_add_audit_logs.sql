-- UP
CREATE TABLE audit_logs (
    id TEXT NOT NULL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON SET NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON audit_logs (tenant_id, created_at DESC);

-- DOWN
DROP TABLE IF EXISTS audit_logs CASCADE;
