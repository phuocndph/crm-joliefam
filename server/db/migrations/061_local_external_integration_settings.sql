-- Server-only external integration credentials. Never synchronize this schema
-- to Supabase and never route it through the generic compatibility adapters.
CREATE SCHEMA IF NOT EXISTS integration_private;
REVOKE ALL ON SCHEMA integration_private FROM PUBLIC;

CREATE TABLE integration_private.ghn_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  mode text NOT NULL CHECK (mode IN ('INHERIT_ENV','ENABLED','DISABLED')),
  api_key text,
  primary_shop_id text,
  allowed_shop_ids text[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    mode <> 'ENABLED' OR (
      api_key IS NOT NULL
      AND primary_shop_id IS NOT NULL
      AND length(btrim(api_key)) BETWEEN 8 AND 512
      AND primary_shop_id ~ '^[1-9][0-9]{0,19}$'
      AND cardinality(allowed_shop_ids) BETWEEN 1 AND 50
      AND array_position(allowed_shop_ids, NULL) IS NULL
      AND array_to_string(allowed_shop_ids, ',') ~ '^[1-9][0-9]{0,19}(,[1-9][0-9]{0,19}){0,49}$'
      AND primary_shop_id = ANY(allowed_shop_ids)
    )
  ),
  CHECK (
    mode = 'ENABLED'
    OR (api_key IS NULL AND primary_shop_id IS NULL AND cardinality(allowed_shop_ids) = 0)
  )
);

-- Database backups and database operators are the secret boundary for this
-- plaintext-at-rest key, consistent with ai_private.providers.
REVOKE ALL ON ALL TABLES IN SCHEMA integration_private FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA integration_private FROM PUBLIC;
