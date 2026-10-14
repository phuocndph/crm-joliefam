import assert from "node:assert/strict";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["src/lib/local-auth.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  define: {
    "import.meta.env.VITE_BACKEND_MODE": '"local"',
    "import.meta.env.PROD": 'false',
    "import.meta.env.VITE_LOCAL_DEMO_AUTH": '"true"',
    "import.meta.env.VITE_LOCAL_API_URL": '"http://127.0.0.1:8787"',
  },
  logLevel: "silent",
});

const session = (expiresAt) => ({
  actor: "employee-fixture",
  role: "employee",
  token: "isolated-user-token",
  expires_at: expiresAt,
});
let imports = 0;
const freshModule = async (storedValue, fetchImpl) => {
  const storage = new Map(storedValue === null ? [] : [["local_user_session", storedValue]]);
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.fetch = fetchImpl;
  const source = `${outputFiles[0].text}\n// fresh test module ${imports++}`;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
};

for (const invalidStored of [
  JSON.stringify(session(new Date(Date.now() - 60_000).toISOString())),
  "corrupt session value",
]) {
  let calls = 0;
  const auth = await freshModule(invalidStored, async () => { calls++; throw new Error("Expired session must not fetch."); });
  assert.equal(auth.hasStoredLocalUserSession(), true);
  assert.equal(auth.hasLocalUserSession(), false);
  assert.equal(auth.getLocalUserSession(), null);
  await assert.rejects(auth.localFetch("http://127.0.0.1:8787/api/attendance"), (error) => error.status === 401);
  await assert.rejects(auth.getLocalMe(), (error) => error.status === 401);
  assert.equal(calls, 0, "Expired/corrupt stored login fetched an admin bootstrap session.");
}

const revokedCalls = [];
const revoked = await freshModule(JSON.stringify(session(new Date(Date.now() + 3_600_000).toISOString())), async (url, init) => {
  revokedCalls.push({ url: String(url), authorization: new Headers(init.headers).get("authorization") });
  return new Response(JSON.stringify({ message: "revoked fixture" }), { status: 401 });
});
assert.equal(revoked.hasStoredLocalUserSession(), true);
assert.equal(revoked.hasLocalUserSession(), true);
assert.equal((await revoked.localFetch("http://127.0.0.1:8787/api/attendance")).status, 401);
assert.equal((await revoked.localFetch("http://127.0.0.1:8787/api/attendance")).status, 401);
await assert.rejects(revoked.getLocalMe());
assert.equal(revokedCalls.length, 3);
assert.ok(revokedCalls.every((call) => call.authorization === "Bearer isolated-user-token"));
assert.ok(revokedCalls.every((call) => !call.url.endsWith("/api/local-auth/session")), "Revoked user login retried as admin.");

console.log("Local frontend auth regression passed: expired, corrupt, and revoked user sessions never bootstrap or retry as admin.");
