-- Local-only audit and idempotency boundary for batch attendance workflow.
-- This is not a source of truth for attendance facts: it only records the
-- immutable result of one successfully committed local batch request.

CREATE TABLE IF NOT EXISTS local_attendance_bulk_workflow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  target_status text NOT NULL CHECK (target_status IN ('APPROVED', 'REJECTED')),
  request_scope jsonb NOT NULL,
  result jsonb NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_attendance_bulk_workflow_requests_created_idx
  ON local_attendance_bulk_workflow_requests(created_at DESC);
