import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";

// This suite is deliberately self-contained: it owns a temporary loopback auth
// provider and a temporary local PostgreSQL database. It never reads .env files
// and never sends requests to a public Supabase project.
const container = "crm-joliefam-local-postgres";
const suffix = `${process.pid}_${Date.now()}`;
const database = `crm_local_auth_bridge_${suffix}`.replace(/[^a-zA-Z0-9_]/g, "_");
const databaseUrl = `postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/${database}`;

const getFreePort = async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
};
const sql = (statement) => run("docker", ["exec", container, "psql", "-U", "crm_local", "-d", database, "-v", "ON_ERROR_STOP=1", "-At", "-c", statement]);
const sqlValue = (value) => `'${String(value).replaceAll("'", "''")}'`;

const waitForHealth = async (base, child) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Local API exited before health check (${child.exitCode}).`);
    try {
      const response = await fetch(`${base}/health`);
      const payload = await response.json();
      if (response.ok && payload.ok === true && payload.database === database) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Local auth bridge API did not become healthy.");
};

const createMockAuth = async () => {
  const port = await getFreePort();
  const users = new Map([
    ["legacy.same@public.test", { password: "OldPass!1", id: "11111111-1111-4111-8111-111111111111", email: "legacy.same@public.test" }],
    // Same email as local, deliberately different UUID. This must be rejected.
    ["legacy.mismatch@public.test", { password: "OldPass!1", id: "99999999-9999-4999-8999-999999999992", email: "legacy.mismatch@public.test" }],
    ["inactive@public.test", { password: "OldPass!1", id: "33333333-3333-4333-8333-333333333333", email: "inactive@public.test" }],
    ["unsynced@public.test", { password: "OldPass!1", id: "44444444-4444-4444-8444-444444444444", email: "unsynced@public.test" }],
  ]);
  const server = createServer(async (request, response) => {
    if (request.url !== "/auth/v1/token?grant_type=password" || request.method !== "POST") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body || "{}");
    if (input.email === "upstream.error@public.test") {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "upstream unavailable" }));
      return;
    }
    if (input.email === "upstream.malformed@public.test") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ access_token: "invalid-user-response" }));
      return;
    }
    const account = users.get(String(input.email || "").toLowerCase());
    if (!account || input.password !== account.password) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_credentials" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      user: { id: account.id, email: account.email, user_metadata: { role: "admin" } },
      access_token: "supabase-access-token-must-not-be-stored",
      refresh_token: "supabase-refresh-token-must-not-be-stored",
    }));
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return { server, url: `http://127.0.0.1:${port}` };
};

const request = async (base, path, options = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { origin: "http://127.0.0.1:8090", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
};
const expectStatus = async (base, path, options, expected, label) => {
  const result = await request(base, path, options);
  assert.equal(result.response.status, expected, `${label}: expected HTTP ${expected}, got ${result.response.status}`);
  return result.payload;
};
const jsonOptions = (method, body, token) => ({
  method,
  headers: {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

let api;
let mock;
let created = false;
let apiLogs = "";
try {
  run("docker", ["exec", container, "psql", "-U", "crm_local", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${database}`]);
  created = true;
  mock = await createMockAuth();
  const apiPort = await getFreePort();
  const apiBase = `http://127.0.0.1:${apiPort}`;
  const env = {
    ...process.env,
    LOCAL_DATABASE_URL: databaseUrl,
    LOCAL_API_PORT: String(apiPort),
    LOCAL_API_URL: apiBase,
    LOCAL_SYNC_AUTO: "false",
    LOCAL_TEST_ISOLATED: "1",
    LOCAL_AUTH_SUPABASE_BRIDGE: "true",
    VITE_SUPABASE_URL: mock.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key",
  };
  api = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: new URL("..", import.meta.url), env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  api.stdout.on("data", (chunk) => { apiLogs += chunk; });
  api.stderr.on("data", (chunk) => { apiLogs += chunk; });
  await waitForHealth(apiBase, api);

  const hash = (password) => {
    const salt = randomBytes(16).toString("hex");
    return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
  };
  const sameId = "11111111-1111-4111-8111-111111111111";
  const mismatchId = "22222222-2222-4222-8222-222222222222";
  const inactiveId = "33333333-3333-4333-8333-333333333333";
  const localId = "55555555-5555-4555-8555-555555555555";
  const errorId = "66666666-6666-4666-8666-666666666666";
  const malformedId = "77777777-7777-4777-8777-777777777777";
  sql(`insert into local_user_profiles(id,user_id,email,first_name,last_name,password_hash,is_active) values
    (${sqlValue(sameId)},${sqlValue(sameId)},'legacy.same@public.test','Legacy','Same',null,true),
    (${sqlValue(mismatchId)},${sqlValue(mismatchId)},'legacy.mismatch@public.test','Legacy','Mismatch',null,true),
    (${sqlValue(inactiveId)},${sqlValue(inactiveId)},'inactive@public.test','Legacy','Inactive',null,false),
    (${sqlValue(errorId)},${sqlValue(errorId)},'upstream.error@public.test','Legacy','Error',null,true),
    (${sqlValue(malformedId)},${sqlValue(malformedId)},'upstream.malformed@public.test','Legacy','Malformed',null,true),
    (${sqlValue(localId)},${sqlValue(localId)},'local.demo@local.crm','Local','Demo',${sqlValue(hash("LocalOnly!1"))},true)`);
  sql(`update local_user_profiles set is_snapshot_record=true, source_snapshot_key='test-${suffix}' where user_id in (${sqlValue(sameId)},${sqlValue(mismatchId)},${sqlValue(errorId)},${sqlValue(malformedId)});`);
  sql(`insert into local_user_roles(user_id,role) values
    (${sqlValue(sameId)},'employee'),(${sqlValue(mismatchId)},'manager'),(${sqlValue(inactiveId)},'employee'),(${sqlValue(localId)},'employee')`);
  sql(`insert into local_employee_permissions(user_id,permission_type,enabled) values (${sqlValue(sameId)},'production_attendance_view',true)`);

  // Wrong upstream password is rejected.
  await expectStatus(apiBase, "/api/local-auth/login", jsonOptions("POST", { email: "legacy.same@public.test", password: "wrong" }), 401, "sai mật khẩu");
  // A successful old account maps by the upstream UUID and receives local permissions.
  const same = await request(apiBase, "/api/local-auth/login", jsonOptions("POST", { email: "legacy.same@public.test", password: "OldPass!1" }));
  assert.equal(same.response.status, 200, "tài khoản cũ hợp lệ phải đăng nhập được");
  assert.equal(same.payload.actor, sameId);
  assert.equal(same.payload.role, "employee");
  const me = await request(apiBase, "/api/local-auth/me", { headers: { authorization: `Bearer ${same.payload.token}` } });
  assert.equal(me.response.status, 200);
  assert.equal(me.payload.user_id, sameId);
  const permissions = await expectStatus(apiBase, `/api/users/${sameId}/permissions`, { headers: { authorization: `Bearer ${same.payload.token}` } }, 200, "quyền local");
  assert.ok(permissions.some((item) => item.permission_type === "production_attendance_view" && item.enabled));
  await expectStatus(apiBase, "/api/payroll/runs", { headers: { authorization: `Bearer ${same.payload.token}` } }, 403, "không nâng quyền employee");
  // Email collision with a different upstream UUID must not grant the local account.
  await expectStatus(apiBase, "/api/local-auth/login", jsonOptions("POST", { email: "legacy.mismatch@public.test", password: "OldPass!1" }), 401, "UUID khác dù email trùng");
  // Inactive and unsynchronised profiles are denied even when Supabase accepts them.
  await expectStatus(apiBase, "/api/local-auth/login", jsonOptions("POST", { email: "inactive@public.test", password: "OldPass!1" }), 401, "tài khoản inactive");
  await expectStatus(apiBase, "/api/local-auth/login", jsonOptions("POST", { email: "unsynced@public.test", password: "OldPass!1" }), 401, "tài khoản chưa đồng bộ");
  await expectStatus(apiBase, "/api/local-auth/login", jsonOptions("POST", { email: "upstream.error@public.test", password: "OldPass!1" }), 503, "lỗi upstream");
  await expectStatus(apiBase, "/api/local-auth/login", jsonOptions("POST", { email: "upstream.malformed@public.test", password: "OldPass!1" }), 503, "upstream thiếu UUID");

  // A local password remains usable while the upstream provider is offline.
  await new Promise((resolve) => mock.server.close(resolve));
  await expectStatus(apiBase, "/api/local-auth/login", jsonOptions("POST", { email: "legacy.same@public.test", password: "OldPass!1" }), 503, "upstream offline phải báo tạm thời không khả dụng");
  const local = await request(apiBase, "/api/local-auth/login", jsonOptions("POST", { email: "local.demo@local.crm", password: "LocalOnly!1" }));
  assert.equal(local.response.status, 200, "tài khoản local phải đăng nhập được khi Supabase offline");
  const logout = await request(apiBase, "/api/local-auth/logout", { method: "POST", headers: { authorization: `Bearer ${local.payload.token}` } });
  assert.equal(logout.response.status, 200);
  await expectStatus(apiBase, "/api/local-auth/me", { headers: { authorization: `Bearer ${local.payload.token}` } }, 401, "đăng xuất thu hồi phiên");

  // Neither the upstream password nor its access/refresh token may be persisted.
  assert.equal(sql(`select password_hash is null from local_user_profiles where user_id=${sqlValue(sameId)}`).trim(), "t", "không lưu cả bản hash của mật khẩu Supabase");
  assert.equal(sql(`select token_hash from local_auth_sessions where user_id=${sqlValue(sameId)}`).trim(), createHash("sha256").update(same.payload.token).digest("hex"), "chỉ lưu hash của token local");
  const persisted = run("docker", ["exec", container, "pg_dump", "-U", "crm_local", "-d", database, "--data-only"]);
  for (const secret of ["OldPass!1", "supabase-access-token-must-not-be-stored", "supabase-refresh-token-must-not-be-stored"]) {
    assert.ok(!persisted.includes(secret), "Thông tin xác thực Supabase bị lưu vào DB local.");
    assert.ok(!apiLogs.includes(secret), "Thông tin xác thực Supabase bị ghi vào log local.");
    assert.ok(!JSON.stringify(same.payload).includes(secret), "Thông tin xác thực Supabase bị gửi về trình duyệt.");
  }
  await expectStatus(apiBase, "/api/local-auth/logout", { method: "POST", headers: { authorization: `Bearer ${same.payload.token}` } }, 200, "đăng xuất tài khoản cũ");
  await expectStatus(apiBase, "/api/local-auth/me", { headers: { authorization: `Bearer ${same.payload.token}` } }, 401, "phiên local tài khoản cũ được thu hồi");
  console.log("Local auth bridge regression passed: old UUID mapping, fail-closed mismatch/inactive/unsynced/error cases, offline local login, secret isolation, and logout revocation.");
} catch (error) {
  console.error(error instanceof Error ? `${error.message}\n${error.stack || ""}` : error);
  process.exitCode = 1;
} finally {
  if (api && api.exitCode === null) {
    api.kill();
    await Promise.race([once(api, "exit"), new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
  if (mock?.server?.listening) await new Promise((resolve) => mock.server.close(resolve));
  if (created) run("docker", ["exec", container, "psql", "-U", "crm_local", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${database}`]);
}
