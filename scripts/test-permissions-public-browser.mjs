// Actual public-mode frontend with a completely mocked loopback Supabase HTTP
// boundary. No Supabase project, environment files, credentials or database used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const dist = process.argv[2];
if (!dist || !path.isAbsolute(dist)) throw new Error('Pass the absolute isolated public-mode build directory as the first argument.');
const fixtureOrigin = 'http://127.0.0.1:59997';
const ids = { admin: '99000000-0000-0000-0000-000000000001', employee: '99000000-0000-0000-0000-000000000002' };
const profiles = [
  { id: 'profile-admin', user_id: ids.admin, email: 'public-admin@fixture.invalid', first_name: 'Public', last_name: 'Admin', created_at: '2026-01-01T00:00:00Z' },
  { id: 'profile-employee', user_id: ids.employee, email: 'public-employee@fixture.invalid', first_name: 'Public', last_name: 'Employee', created_at: '2026-01-01T00:00:00Z' },
];
const user = { id: ids.admin, email: profiles[0].email, aud: 'authenticated', role: 'authenticated', user_metadata: { first_name: 'Public', last_name: 'Admin' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: ids.admin, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.fixture-not-a-real-signature';
const session = { access_token: token, refresh_token: 'fixture-not-a-real-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const artifacts = path.join(tmpdir(), 'crm-public-permission-browser-' + Date.now());
let server, browser, external = 0, fixtureCalls = 0;
const checks = [];
const pass = label => { checks.push(label); console.log('PASS ' + label); };
try {
  await mkdir(artifacts, { recursive: true });
  server = createServer(async (req, res) => {
    try { let file = path.join(dist, new URL(req.url, 'http://fixture.invalid').pathname); try { if (!(await stat(file)).isFile()) file = path.join(dist, 'index.html'); } catch { file = path.join(dist, 'index.html'); } res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
    catch { res.writeHead(500); res.end(); }
  }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const { chromium } = createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const [view, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    let roleUnavailable = false, profilesUnavailable = false, currentRole = 'admin';
    const context = await browser.newContext({ viewport });
    await context.addInitScript(value => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin || url.protocol === 'data:') return route.continue();
      if (url.origin !== fixtureOrigin) { external++; return route.abort(); }
      fixtureCalls++;
      const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(body) });
      if (route.request().method() === 'OPTIONS') return reply({});
      if (url.pathname === '/auth/v1/user') return reply(user);
      if (url.pathname.startsWith('/auth/v1/')) return reply(session);
      if (url.pathname === '/rest/v1/user_roles') {
        if (roleUnavailable) return reply({ message: 'QA public role read unavailable', code: 'QA503' }, 503);
        const requested = url.searchParams.get('user_id');
        const rows = [{ user_id: ids.admin, role: currentRole, assigned_by: null }, { user_id: ids.employee, role: 'employee', assigned_by: ids.admin }];
        return reply(requested ? rows.filter(row => requested === 'eq.' + row.user_id) : url.searchParams.has('role') ? rows.filter(row => row.role === 'employee' || row.role === 'accountant') : rows);
      }
      if (url.pathname === '/rest/v1/profiles') {
        if (profilesUnavailable) return reply({ message: 'QA public profiles read unavailable', code: 'QA503' }, 503);
        const filter = url.searchParams.get('user_id');
        const rows = filter?.startsWith('eq.') ? profiles.filter(profile => filter === 'eq.' + profile.user_id) : profiles;
        return reply(route.request().headers().accept?.includes('vnd.pgrst.object') ? rows[0] || null : rows);
      }
      if (url.pathname === '/rest/v1/rpc/list_payroll_capabilities') return reply([]);
      if (url.pathname.startsWith('/rest/v1/')) return reply([]);
      return reply({ message: 'Unexpected fixture request' }, 404);
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    await page.goto(origin + '/user-management');
    await page.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).waitFor();
    roleUnavailable = true; await page.evaluate(() => window.dispatchEvent(new Event('crm-permissions-changed')));
    await page.getByText('Chưa xác định được quyền truy cập', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).count(), 0);
    assert.equal(await page.getByText('Đang tải...', { exact: true }).count(), 0);
    roleUnavailable = false; await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).waitFor();
    pass('Public ' + view + ' role lookup failure fails closed and retry recovers');
    profilesUnavailable = true; await page.reload();
    await page.getByText('Không thể tải danh sách người dùng', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).count(), 0);
    profilesUnavailable = false; await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).waitFor();
    pass('Public ' + view + ' profiles lookup failure shows explicit retry and recovers');
    currentRole = 'employee'; await page.evaluate(() => window.dispatchEvent(new Event('crm-permissions-changed')));
    await page.getByText('Không có quyền truy cập', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Quản lý phân quyền nhân viên & kế toán', exact: true }).count(), 0);
    await page.screenshot({ path: path.join(artifacts, view + '-public-role-denied.png'), fullPage: false });
    pass('Public ' + view + ' known employee role remains denied');
    await context.close();
  }
  assert.ok(fixtureCalls > 0, 'Actual public Supabase HTTP boundary exercised'); assert.equal(external, 0, 'No external service requests');
  console.log(`Public permission browser: ${checks.length} groups passed; all Supabase HTTP mocked. Screenshots: ${artifacts}`);
} finally { await browser?.close(); if (server?.listening) await new Promise(resolve => server.close(resolve)); }
