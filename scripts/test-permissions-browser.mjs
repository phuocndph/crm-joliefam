// Actual built local UI, disposable database/API, no environment-file reads.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import pg from 'pg';

const repo = fileURLToPath(new URL('..', import.meta.url)), suffix = process.pid + '_' + Date.now();
const database = 'permission_browser_' + suffix, role = 'permission_browser_role_' + suffix;
const dbPassword = randomBytes(24).toString('hex'), connectionString = `postgres://${role}:${dbPassword}@127.0.0.1:55432/${database}`;
const ids = { admin: randomUUID(), accountant: randomUUID(), employeeA: randomUUID(), employeeB: randomUUID(), employeeC: randomUUID(), productionOnly: randomUUID() };
const fixturePassword = 'PermissionBrowserFixture!123', salt = randomBytes(16).toString('hex');
const passwordHash = `scrypt$${salt}$${scryptSync(fixturePassword, salt, 64).toString('hex')}`;
const artifactRoot = path.join(tmpdir(), 'crm-permission-browser-' + suffix);
const sql = statement => { const result = spawnSync('docker', ['exec', 'crm-joliefam-local-postgres', 'psql', '-U', 'crm_local', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement], { encoding: 'utf8', windowsHide: true }); if (result.status !== 0) throw new Error('Isolated QA DB control failed'); return result.stdout; };
const port = async () => { const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value; };
let pool, api, frontend, browser, created = false, apiBase, origin, logs = '', externalRequests = 0;
const checks = [], failures = [];
const pass = label => { checks.push(label); console.log('PASS ' + label); };
try {
  sql(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${dbPassword}'`); sql(`create database ${database} owner ${role}`); created = true;
  const apiPort = await port(); apiBase = 'http://127.0.0.1:' + apiPort;
  api = spawn(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent('globalThis.fetch=async()=>{throw new Error("QA outbound blocked")};'), path.join(repo, 'server-dist/index.js')], { cwd: repo, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'production', PUBLIC_APP_URL: 'https://crm.example.com', LOCAL_DATABASE_URL: connectionString, LOCAL_API_PORT: String(apiPort), LOCAL_API_HOST: '127.0.0.1', LOCAL_SYNC_AUTO: 'false', LOCAL_DEMO_AUTH: 'false', LOCAL_AUTH_SUPABASE_BRIDGE: 'false', LOCAL_INTEGRATION_API: 'false' } });
  api.stdout.on('data', data => logs += data); api.stderr.on('data', data => logs += data);
  let ready = false;
  for (let attempt = 0; attempt < 160; attempt++) { if (api.exitCode !== null) throw new Error('QA API exited'); try { if ((await (await fetch(apiBase + '/health')).json()).database === database) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(ready, 'isolated API health'); pool = new pg.Pool({ connectionString });
  for (const [name, id] of Object.entries(ids)) {
    await pool.query('insert into local_user_profiles(id,user_id,email,first_name,last_name,password_hash,is_active)values($1,$1,$2,$3,$4,$5,true)', [id, name + '@permissions-browser.invalid', name, 'QA', passwordHash]);
    await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)', [id, ['admin','accountant'].includes(name) ? name : 'employee', ids.admin]);
  }
  await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'orders',true),($1,'quotes',true),($1,'legacy_hidden_permission',true),($2,'customers',true),($2,'legacy_hidden_permission',true),($3,'production_sales_submit',true)", [ids.employeeA, ids.employeeB, ids.productionOnly]);
  const periodId = randomUUID();
  await pool.query("insert into local_payroll_periods(id,period_start,period_end)values($1,date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date)", [periodId]);
  await pool.query("insert into local_payroll_runs(period_id,run_number,input_hash,idempotency_key)values($1,1,'fixture','fixture-browser-run')", [periodId]);
  const session = async name => { const response = await fetch(apiBase + '/api/local-auth/login', { method: 'POST', headers: { origin: 'https://crm.example.com', 'content-type': 'application/json' }, body: JSON.stringify({ email: name + '@permissions-browser.invalid', password: fixturePassword }) }); assert.equal(response.status, 200); return response.json(); };
  const sessions = {};
  for (const name of Object.keys(ids)) sessions[name] = await session(name);
  const frontPort = await port(); origin = 'http://127.0.0.1:' + frontPort;
  frontend = createServer(async (req, res) => {
    if (req.url.startsWith('/api/') || req.url === '/health') {
      const upstream = httpRequest(apiBase + req.url, { method: req.method, headers: { ...req.headers, origin: 'https://crm.example.com', host: 'crm.example.com' } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
      upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream); return;
    }
    try { let file = path.join(repo, 'dist', new URL(req.url, origin).pathname); try { if (!(await stat(file)).isFile()) file = path.join(repo, 'dist/index.html'); } catch { file = path.join(repo, 'dist/index.html'); } res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
    catch { res.writeHead(500); res.end(); }
  }); frontend.listen(frontPort, '127.0.0.1'); await once(frontend, 'listening');
  const { chromium } = createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  await mkdir(artifactRoot, { recursive: true });
  const contextFor = async (name, viewport) => {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin || url.protocol === 'data:') return route.continue(); externalRequests++; return route.abort(); });
    // Identity-failure cases intentionally revoke their session. Never reuse
    // that same bearer token in a later browser fixture/context.
    await context.addInitScript(value => localStorage.setItem('local_user_session', JSON.stringify(value)), await session(name));
    return context;
  };
  const adminContext = await contextFor('admin', { width: 1440, height: 1000 });
  const adminPage = await adminContext.newPage(); adminPage.setDefaultTimeout(15000);
  let releaseA, aRequested;
  const aArrived = new Promise(resolve => aRequested = resolve);
  const aReleased = new Promise(resolve => releaseA = resolve);
  await adminPage.route('**/api/users/' + ids.employeeA + '/permissions', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(); aRequested(); await aReleased; await route.fulfill({ response });
  });
  await adminPage.goto(origin + '/user-management');
  const management = adminPage.locator('div.space-y-6').filter({ has: adminPage.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }) }).last();
  await management.getByText('employeeA@permissions-browser.invalid', { exact: true }).click(); await aArrived;
  assert.equal(await management.getByRole('button', { name: 'Lưu thay đổi', exact: true }).isDisabled(), true);
  await management.getByText('employeeB@permissions-browser.invalid', { exact: true }).click();
  await adminPage.waitForFunction(() => document.querySelector('#customers')?.getAttribute('aria-checked') === 'true' && !document.querySelector('#customers')?.disabled);
  releaseA(); await adminPage.waitForTimeout(350);
  assert.equal(await management.locator('#customers').getAttribute('aria-checked'), 'true');
  assert.equal(await management.locator('#orders').getAttribute('aria-checked'), 'false');
  assert.equal(await management.locator('#quotes').getAttribute('aria-checked'), 'false');
  pass('Slow A response cannot overwrite selected employee B permissions');
  let saved;
  await adminPage.route('**/api/users/*/permissions', async route => { if (route.request().method() === 'PUT') saved = { url: route.request().url(), body: route.request().postDataJSON() }; return route.continue(); });
  await management.locator('#orders').click(); await management.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const dialog = adminPage.getByRole('dialog'); await dialog.getByLabel('Lý do thay đổi', { exact: true }).fill('QA chỉ thay đổi một quyền');
  await dialog.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  assert.ok(saved.url.endsWith('/api/users/' + ids.employeeB + '/permissions'));
  assert.deepEqual(saved.body.permissions, [{ permission_type: 'orders', enabled: true }]);
  const bGrants = (await pool.query('select permission_type,enabled from local_employee_permissions where user_id=$1 order by permission_type', [ids.employeeB])).rows;
  assert.deepEqual(bGrants, [{ permission_type: 'customers', enabled: true }, { permission_type: 'legacy_hidden_permission', enabled: true }, { permission_type: 'orders', enabled: true }]);
  pass('Browser saves correct B ID and changed key only, preserving hidden grants');
  await adminPage.route('**/api/users/' + ids.employeeC + '/permissions', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Lỗi tải quyền kiểm thử' }) }));
  await management.getByText('employeeC@permissions-browser.invalid', { exact: true }).click();
  await adminPage.getByText('Không thể tải quyền của nhân viên', { exact: true }).waitFor();
  assert.equal(await management.getByRole('button', { name: 'Lưu thay đổi', exact: true }).isDisabled(), true);
  assert.equal(await management.locator('#orders').isDisabled(), true);
  await adminPage.screenshot({ path: path.join(artifactRoot, 'desktop-permission-load-failure.png'), fullPage: false });
  pass('Permission load failure disables switches and save');
  let identityUnavailable = true;
  await adminPage.route('**/api/local-auth/me', route => identityUnavailable ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA identity read unavailable' }) }) : route.continue());
  await adminPage.evaluate(() => window.dispatchEvent(new Event('crm-permissions-changed')));
  await adminPage.getByText('Chưa xác định được quyền truy cập', { exact: true }).waitFor();
  assert.equal(await adminPage.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).count(), 0, 'old admin privileges must disappear');
  assert.equal(await adminPage.getByText('Đang tải...', { exact: true }).count(), 0, 'role failure must settle');
  await adminPage.screenshot({ path: path.join(artifactRoot, 'desktop-role-failure-retry.png'), fullPage: false });
  identityUnavailable = false;
  await adminPage.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).waitFor();
  pass('Desktop identity refresh failure shows explicit error and retry recovers');
  let usersUnavailable = true;
  await adminPage.route('**/api/users', route => usersUnavailable && route.request().method() === 'GET' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA users unavailable' }) }) : route.continue());
  await adminPage.reload(); await adminPage.getByText('Không thể tải danh sách người dùng', { exact: true }).first().waitFor();
  assert.equal(await adminPage.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).count(), 0);
  usersUnavailable = false; await adminPage.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).waitFor();
  pass('Desktop user-list failure shows explicit error and retry recovers');
  let releaseUsers, usersArrived;
  const heldUsers = new Promise(resolve => releaseUsers = resolve), usersRequested = new Promise(resolve => usersArrived = resolve);
  await adminPage.route('**/api/users', async route => { if (route.request().method() !== 'GET') return route.continue(); const response = await route.fetch(); usersArrived(); await heldUsers; return route.fulfill({ response }); });
  await adminPage.getByRole('button', { name: 'Làm mới', exact: true }).first().click(); await usersRequested;
  await pool.query("update local_user_roles set role='employee' where user_id=$1 and role='admin'", [ids.admin]);
  try {
    await adminPage.evaluate(() => window.dispatchEvent(new Event('crm-permissions-changed')));
    await adminPage.getByText('Không có quyền truy cập', { exact: true }).first().waitFor();
    await adminPage.evaluate(() => {
      window.__permissionContentFlash = false;
      new MutationObserver(() => { if (document.body.innerText.includes('Quản lý phân quyền nhân viên & kế toán') || document.body.innerText.includes('employeeB@permissions-browser.invalid')) window.__permissionContentFlash = true; }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    releaseUsers(); await adminPage.waitForTimeout(500);
    assert.equal(await adminPage.evaluate(() => window.__permissionContentFlash), false);
    assert.equal(await adminPage.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).count(), 0);
    pass('Delayed administrator user-list response cannot restore content after role revocation');
  } finally { releaseUsers(); await pool.query("update local_user_roles set role='admin' where user_id=$1 and role='employee'", [ids.admin]); }
  await adminContext.close();

  const mobileAdminContext = await contextFor('admin', { width: 390, height: 844 }), mobileAdminPage = await mobileAdminContext.newPage();
  await mobileAdminPage.goto(origin + '/user-management');
  await mobileAdminPage.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).waitFor();
  let mobileIdentityUnavailable = true;
  await mobileAdminPage.route('**/api/local-auth/me', route => mobileIdentityUnavailable ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) : route.continue());
  await mobileAdminPage.evaluate(() => window.dispatchEvent(new Event('crm-permissions-changed')));
  await mobileAdminPage.getByText('Chưa xác định được quyền truy cập', { exact: true }).waitFor();
  assert.equal(await mobileAdminPage.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).count(), 0);
  mobileIdentityUnavailable = false; await mobileAdminPage.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await mobileAdminPage.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).waitFor();
  pass('Mobile identity refresh failure shows explicit error and retry recovers'); await mobileAdminContext.close();

  const failedIdentity = await contextFor('employeeA', { width: 1440, height: 1000 }), failedPage = await failedIdentity.newPage();
  await failedIdentity.route('**/api/local-auth/me', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await failedPage.goto(origin + '/quotes'); await failedPage.waitForURL('**/auth');
  await failedPage.getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor();
  pass('Initial identity load failure reaches login, not an endless role spinner'); await failedIdentity.close();

  const accountantContext = await contextFor('accountant', { width: 1440, height: 1000 }), accountantPage = await accountantContext.newPage();
  await accountantPage.goto(origin + '/payroll-settings?tab=runs');
  await accountantPage.getByRole('button', { name: 'Chi tiết', exact: true }).first().waitFor();
  assert.equal(await accountantPage.getByRole('button', { name: 'Tạo bản xem trước', exact: true }).count(), 0);
  assert.equal(await accountantPage.getByRole('button', { name: 'Khóa', exact: true }).count(), 0);
  await accountantPage.getByRole('button', { name: 'Chi tiết', exact: true }).first().click();
  await accountantPage.getByRole('heading', { name: 'Bảng lương tổng hợp kiểu Excel', exact: true }).waitFor();
  await accountantPage.screenshot({ path: path.join(artifactRoot, 'desktop-accountant-runs-readonly.png'), fullPage: false });
  pass('Accountant can read run details but cannot see create/lock actions'); await accountantContext.close();

  for (const [view, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await contextFor('employeeA', viewport), page = await context.newPage();
    const statuses = []; page.on('response', response => { if (/\/api\/(?:local-auth\/me|users\/.*\/permissions|payroll\/capabilities)/.test(response.url())) statuses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    await context.route('**/api/payroll/capabilities*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA payroll unavailable' }) }));
    await page.goto(origin + (view === 'mobile' ? '/menu' : '/quotes')); await page.waitForLoadState('networkidle');
    try {
      if (view === 'mobile') {
        await page.getByText('Báo giá', { exact: true }).first().waitFor({ timeout: 10000 });
        await page.getByText('Công & thu nhập của tôi', { exact: true }).first().waitFor();
        await page.getByText('Công & thu nhập của tôi', { exact: true }).first().click();
        await page.getByText('Chưa liên kết hồ sơ công nhân', { exact: true }).waitFor();
        await page.getByRole('link', { name: 'Hoàn thiện hồ sơ của tôi', exact: true }).waitFor();
        pass('Mobile no-worker employee retains attendance onboarding');
      } else await page.locator('a[href="/quotes"]').first().waitFor({ timeout: 10000 });
      pass(view + ' CRM grants remain usable when payroll capability API fails');
    } catch (error) {
      failures.push(view + ' CRM menu/onboarding failed with payroll capability 503: ' + error.message);
      console.error(view + ' statuses: ' + JSON.stringify(statuses)); console.error(view + ' page text: ' + (await page.locator('body').innerText()).slice(0, 2500));
    }
    await page.screenshot({ path: path.join(artifactRoot, view + '-crm-menu-payroll-failure.png'), fullPage: false });
    await context.close();
    const productionContext = await contextFor('productionOnly', viewport), productionPage = await productionContext.newPage();
    await productionPage.goto(origin + (view === 'mobile' ? '/menu' : '/my-attendance')); await productionPage.waitForLoadState('networkidle');
    if (view === 'mobile') await productionPage.getByText('Lệnh SX', { exact: true }).first().waitFor();
    else await productionPage.locator('a[href="/production-orders"]').first().waitFor();
    pass(view + ' production OR menu supports sales-submit without production-view'); await productionContext.close();
  }
  assert.equal(externalRequests, 0, 'No external browser services contacted'); assert.ok(!logs.includes(dbPassword));
  console.log(`Browser permission QA: ${checks.length} groups passed, ${failures.length} known failures. Screenshots: ${artifactRoot}`);
  assert.deepEqual(failures, [], 'Browser regression failures');
} finally {
  await browser?.close(); if (frontend?.listening) await new Promise(resolve => frontend.close(resolve));
  if (api && api.exitCode === null) { api.kill(); await Promise.race([once(api, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
  await pool?.end(); if (created) sql(`drop database ${database} with (force)`); sql(`drop role if exists ${role}`);
}
