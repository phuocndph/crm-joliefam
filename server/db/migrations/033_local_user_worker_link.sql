-- Link tài khoản đăng nhập local với hồ sơ công nhân (worker) cho chấm công tự phục vụ.
-- Append-only: chỉ thêm cột/bảng mới, không sửa dữ liệu hay migration cũ.

-- Một tài khoản người dùng chỉ được gắn tới một hồ sơ worker đang hoạt động;
-- một worker chỉ thuộc về một tài khoản. Cho phép worker chưa gắn tài khoản
-- (vẫn quản lý bởi quản lý như hiện tại).
ALTER TABLE local_workers
  ADD COLUMN IF NOT EXISTS user_id text REFERENCES local_user_profiles(user_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS local_workers_user_unique_idx
  ON local_workers (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS local_workers_user_idx
  ON local_workers (user_id, is_active);

-- Phiên đăng nhập per-user cho chế độ local. Token chỉ lưu hash để DB dump
-- không lộ credential. Endpoint /api/local-auth/session (admin loopback) giữ
-- nguyên như một phiên đặc quyền không lưu trong bảng này.
CREATE TABLE IF NOT EXISTS local_auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES local_user_profiles(user_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_auth_sessions_user_idx
  ON local_auth_sessions (user_id, expires_at);
CREATE INDEX IF NOT EXISTS local_auth_sessions_expiry_idx
  ON local_auth_sessions (expires_at);
