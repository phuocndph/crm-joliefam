-- Server-only address-provider key. Never expose via generic adapters or sync.
CREATE TABLE integration_private.goong_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  mode text NOT NULL CHECK (mode IN ('INHERIT_ENV','ENABLED','DISABLED')),
  api_key text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((mode = 'ENABLED' AND api_key IS NOT NULL AND length(api_key) BETWEEN 8 AND 512 AND api_key ~ '^[!-~]+$')
    OR (mode <> 'ENABLED' AND api_key IS NULL))
);
ALTER TABLE integration_private.goong_settings ENABLE ROW LEVEL SECURITY;
-- The local server's migration/table owner is the only reader/writer. No public
-- policies or grants. Database operators/backups remain the at-rest secret boundary.
REVOKE ALL ON integration_private.goong_settings FROM PUBLIC;
