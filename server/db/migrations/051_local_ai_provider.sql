-- Local server-only credentials; never synchronized or routed through compatibility adapters.
CREATE SCHEMA IF NOT EXISTS ai_private;
REVOKE ALL ON SCHEMA ai_private FROM PUBLIC;
CREATE TABLE ai_private.selection (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 provider text NOT NULL DEFAULT 'local' CHECK(provider IN ('local','f5quota','beeknoee')),
 updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ai_private.selection(id,provider) VALUES(true,'local');
CREATE TABLE ai_private.providers (
 provider text PRIMARY KEY CHECK(provider IN ('f5quota','beeknoee')),
 api_key text, model text NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
-- Keys are plaintext backend SQL credentials. Database operators/backups must protect them.
REVOKE ALL ON ALL TABLES IN SCHEMA ai_private FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA ai_private FROM PUBLIC;
