-- Local-only Auth/RBAC and knowledge-base records.
-- Snapshot rows are copied once and remain available as a read-only source reference.
CREATE TABLE IF NOT EXISTS local_user_profiles (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  email text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  password_hash text,
  is_active boolean NOT NULL DEFAULT true,
  is_snapshot_record boolean NOT NULL DEFAULT false,
  source_snapshot_key text,
  local_modified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS local_user_profiles_email_idx
  ON local_user_profiles (lower(email));

CREATE TABLE IF NOT EXISTS local_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES local_user_profiles(user_id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','manager','accountant','employee')),
  assigned_by text,
  is_active boolean NOT NULL DEFAULT true,
  is_snapshot_record boolean NOT NULL DEFAULT false,
  source_snapshot_key text,
  local_modified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS local_user_roles_user_idx
  ON local_user_roles (user_id, is_active);

INSERT INTO local_user_profiles (id,user_id,email,first_name,last_name,phone,is_snapshot_record,source_snapshot_key,created_at,updated_at)
SELECT s.source_key,
       coalesce(s.payload->>'user_id', s.source_key),
       coalesce(nullif(s.payload->>'email',''), 'unknown+' || s.source_key || '@local.invalid'),
       s.payload->>'first_name', s.payload->>'last_name', s.payload->>'phone',
       true, s.source_key,
       coalesce(nullif(s.payload->>'created_at','')::timestamptz, s.first_seen_at),
       coalesce(nullif(s.payload->>'updated_at','')::timestamptz, s.last_seen_at)
FROM local_source_snapshots s
WHERE s.source='SUPABASE' AND s.source_table='profiles' AND NOT s.is_deleted
ON CONFLICT (id) DO UPDATE SET
  email=excluded.email, first_name=excluded.first_name, last_name=excluded.last_name,
  phone=excluded.phone, source_snapshot_key=excluded.source_snapshot_key,
  updated_at=excluded.updated_at
WHERE local_user_profiles.local_modified_at IS NULL;

INSERT INTO local_user_roles (user_id,role,assigned_by,is_snapshot_record,source_snapshot_key,created_at,updated_at)
SELECT s.payload->>'user_id', s.payload->>'role', s.payload->>'assigned_by', true, s.source_key,
       coalesce(nullif(s.payload->>'created_at','')::timestamptz, s.first_seen_at),
       coalesce(nullif(s.payload->>'updated_at','')::timestamptz, s.last_seen_at)
FROM local_source_snapshots s
JOIN local_user_profiles p ON p.user_id=s.payload->>'user_id'
WHERE s.source='SUPABASE' AND s.source_table='user_roles' AND NOT s.is_deleted
  AND s.payload->>'role' IN ('admin','manager','accountant','employee')
ON CONFLICT (user_id,role) DO UPDATE SET
  assigned_by=excluded.assigned_by, source_snapshot_key=excluded.source_snapshot_key,
  updated_at=excluded.updated_at
WHERE local_user_roles.local_modified_at IS NULL;

INSERT INTO local_user_profiles (id,user_id,email,first_name,last_name,is_snapshot_record,created_at,updated_at)
VALUES ('local-admin','local-admin','admin@local.crm','Local','Admin',false,now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO local_user_roles (user_id,role,assigned_by,is_snapshot_record)
VALUES ('local-admin','admin','local-admin',false)
ON CONFLICT (user_id,role) DO NOTHING;

CREATE TABLE IF NOT EXISTS local_knowledge_documents (
  id text PRIMARY KEY,
  title text NOT NULL,
  content text,
  document_type text NOT NULL DEFAULT 'text',
  file_url text,
  faq_answer text,
  source_snapshot_key text,
  is_snapshot_record boolean NOT NULL DEFAULT false,
  local_modified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_knowledge_documents_created_idx
  ON local_knowledge_documents (created_at DESC);

INSERT INTO local_knowledge_documents (id,title,content,document_type,file_url,faq_answer,source_snapshot_key,is_snapshot_record,created_at,updated_at)
SELECT s.source_key,
       coalesce(nullif(s.payload->>'title',''),'Không có tiêu đề'),
       s.payload->>'content', coalesce(nullif(s.payload->>'document_type',''),'text'),
       s.payload->>'file_url', s.payload->>'faq_answer', s.source_key, true,
       coalesce(nullif(s.payload->>'created_at','')::timestamptz, s.first_seen_at),
       coalesce(nullif(s.payload->>'updated_at','')::timestamptz, s.last_seen_at)
FROM local_source_snapshots s
WHERE s.source='SUPABASE' AND s.source_table='knowledge_documents' AND NOT s.is_deleted
ON CONFLICT (id) DO UPDATE SET
  title=excluded.title, content=excluded.content, document_type=excluded.document_type,
  file_url=excluded.file_url, faq_answer=excluded.faq_answer,
  source_snapshot_key=excluded.source_snapshot_key, updated_at=excluded.updated_at
WHERE local_knowledge_documents.local_modified_at IS NULL;
