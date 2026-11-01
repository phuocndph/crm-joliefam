import { Pool } from "pg";
import {
  installItem5a,
  item5aOfflinePlan,
  verifyItem5aInstallation,
} from "../server/db/item5a-install.ts";

const args = process.argv.slice(2);
const modes = new Set(["--verify", "--install"]);
const mode = args.find((arg) => modes.has(arg));
const confirm = "--confirm-current-local-item5a";
const fail = (message) => { throw new Error(message); };

if (args.some((arg) => !modes.has(arg) && arg !== confirm) || args.filter((arg) => modes.has(arg)).length > 1) {
  fail("Dùng không hợp lệ. Chạy không tham số để xem kế hoạch; --verify để kiểm tra; hoặc --install --confirm-current-local-item5a để cài.");
}

if (!mode) {
  if (args.length) fail("Kế hoạch offline không nhận tham số.");
  console.log(JSON.stringify(await item5aOfflinePlan(), null, 2));
  process.exit(0);
}

if (mode === "--install" && !args.includes(confirm)) fail("Cài đặt cần xác nhận chính xác --confirm-current-local-item5a.");
if (mode === "--verify" && args.includes(confirm)) fail("--verify chỉ đọc, không cần xác nhận cài đặt.");
for (const name of ["LOCAL_SYNC_AUTO", "LOCAL_INTEGRATION_API", "LOCAL_ZCRM_API"]) {
  if (process.env[name] !== "false") fail(`${name}=false là bắt buộc cho thao tác Item5A.`);
}

const databaseUrl = process.env.LOCAL_DATABASE_URL;
if (!databaseUrl) fail("Cần LOCAL_DATABASE_URL local rõ ràng.");
let target;
try { target = new URL(databaseUrl); } catch { fail("LOCAL_DATABASE_URL không hợp lệ."); }
if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(target.hostname) || target.pathname !== '/crm_local' || target.search || target.hash || target.username !== 'crm_local') {
  fail("Item5A chỉ chấp nhận PostgreSQL local loopback crm_local bằng người dùng crm_local.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const options = { expectedDatabase: "crm_local", expectedUser: "crm_local" };
  const result = mode === "--verify"
    ? await verifyItem5aInstallation(pool, options)
    : await installItem5a(pool, options);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
