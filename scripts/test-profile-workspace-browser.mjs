// Tests only. Own disposable DB/API/frontend; never reads .env or contacts hosted services.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifactDir = path.join(root, '.local-staging-runtime', 'profile-workspace-20261019');
const launcher = spawn(process.execPath, ['scripts/start-attendance-ui-fixture.mjs'], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
let fixtureOutput = '', manifest, browser, token, owned = false;
launcher.stdout.on('data', value => { fixtureOutput += value; });
launcher.stderr.on('data', value => { fixtureOutput += value; });
const passed = [], failed = [], logs = [], pageErrors = [], consoleErrors = [], blockedOrigins = [], reviewRequests = [];
const log = line => { logs.push(line); console.log(line); };
const check = async (name, action) => {
  try { await action(); passed.push(name); log('PASS ' + name); }
  catch (error) {
    failed.push({ name, message: error.message }); log('FAIL ' + name + ': ' + error.message);
    await page?.screenshot({ path: path.join(artifactDir, 'screenshots', 'failure-' + name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png'), animations: 'disabled' }).catch(() => undefined);
  }
};
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = query => {
  assert.ok(owned && /^attendance_ui_qa_[0-9_]+$/.test(manifest.database), 'Verified owned disposable database required');
  const result = spawnSync('docker', ['exec', 'crm-joliefam-local-postgres', 'psql', '-U', 'crm_local', '-d', manifest.database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'Owned SQL failed: ' + result.stderr);
  return result.stdout.trim();
};
const api = async (route, method = 'GET', body) => {
  const response = await fetch(manifest.apiBase + route, { method, headers: { origin: 'https://crm.example.com', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); assert.ok(response.ok, route + ': ' + JSON.stringify(data)); return data;
};
const names = { alpha: 'QA Hồ Sơ Một', duplicate: 'QA Trùng Tên', beta: 'QA Hồ Sơ Hai' };
const ids = Object.fromEntries(Object.keys(names).map(key => [key, randomUUID()]));
let page, context, workers;
const detail = key => page.getByRole('region', { name: 'Kiểm tra hồ sơ — ' + names[key], exact: true });
const note = () => page.locator('#profile-review-note');
const approve = () => page.getByRole('button', { name: 'Duyệt và liên kết', exact: true });
const picker = () => page.getByRole('combobox');
const choose = async key => { await page.getByRole('button', { name: new RegExp('^' + names[key] + '.*@fixture.invalid$') }).click(); await detail(key).waitFor(); };
const selectWorker = async code => { await picker().click(); await page.getByRole('option', { name: new RegExp('^' + code + ' ·') }).click(); };
const emptyChoice = async () => assert.equal(await picker().innerText(), 'Chọn mã và tên công nhân');
const open = async () => {
  await page.goto(manifest.webBase + '/profile-review');
  await page.getByRole('heading', { name: 'Duyệt hồ sơ nhân sự', exact: true }).waitFor();
  await page.getByRole('button', { name: /QA.*@fixture.invalid/ }).first().waitFor();
};
try {
  await mkdir(path.join(artifactDir, 'screenshots'), { recursive: true });
  for (let n = 0; n < 1000; n++) {
    const line = fixtureOutput.split(/\r?\n/).find(value => value.startsWith('UI_FIXTURE_READY '));
    if (line) { manifest = JSON.parse(line.slice('UI_FIXTURE_READY '.length)); break; }
    if (launcher.exitCode !== null) throw new Error('Disposable fixture failed before ready: ' + fixtureOutput.slice(-1500));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(manifest, 'Disposable fixture ready');
  assert.equal((await (await fetch(manifest.apiBase + '/health')).json()).database, manifest.database);
  owned = /^attendance_ui_qa_[0-9_]+$/.test(manifest.database);
  assert.equal(sql('select current_database()'), manifest.database);
  token = (await api('/api/local-auth/login', 'POST', manifest.credentials.admin)).token;
  for (const [index, key] of Object.keys(names).entries()) {
    const data = { first_name: names[key], last_name: '', phone: '090000000' + index, identity_number: 'QA-ID-' + key, bank_name: 'Ngân hàng giả QA', bank_account_number: 'QA00000' + index, current_address: 'Địa chỉ giả lập kiểm thử', notes: 'Chỉ dữ liệu giả QA' };
    sql(`insert into local_user_profiles(id,user_id,email,first_name,last_name,phone,is_active)values(${q(ids[key])},${q(ids[key])},${q(key + '@fixture.invalid')},${q(names[key])},'',${q(data.phone)},true); insert into local_employee_profile_forms(user_id,profile_data,status,revision,submitted_at)values(${q(ids[key])},${q(JSON.stringify(data))}::jsonb,'SUBMITTED',7,'2026-10-${10 + index}T00:00:00Z')`);
  }
  workers = {};
  for (const [key, name] of [['alpha', names.alpha], ['dup1', names.duplicate], ['dup2', names.duplicate], ['beta', names.beta]]) workers[key] = await api('/api/workers', 'POST', { employee_code: 'PROFILE-QA-' + key.toUpperCase(), display_name: name, worker_type: 'HELPER' });
  const { chromium } = createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === manifest.webBase || url.protocol === 'data:') return route.continue(); blockedOrigins.push(url.origin); return route.abort(); });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', request => { if (request.method() === 'POST' && /\/profile-requests\/.*\/review$/.test(new URL(request.url()).pathname)) reviewRequests.push({ url: request.url(), body: request.postDataJSON() }); });
  await page.goto(manifest.webBase + '/auth');
  await page.getByLabel('Email', { exact: true }).fill(manifest.credentials.admin.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(manifest.credentials.admin.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(url => url.pathname !== '/auth');
  await open();
  await check('Submitted inbox opens the correct profile and grouped personal data', async () => {
    await detail('alpha').waitFor();
    await detail('alpha').getByText('QA-ID-alpha', { exact: true }).waitFor();
    assert.ok(await detail('alpha').getByRole('heading', { name: 'Định danh & Căn cước', exact: true }).isVisible());
    assert.ok(await detail('alpha').getByText('Ngân hàng giả QA', { exact: true }).isVisible());
    await page.waitForFunction(() => document.querySelector('[role="combobox"]')?.textContent.includes('PROFILE-QA-ALPHA'));
    assert.equal(await approve().isEnabled(), true, 'Unique matching worker is available for approval');
  });
  await check('Duplicate worker names require an explicit choice', async () => {
    await choose('duplicate'); await emptyChoice(); assert.equal(await approve().isDisabled(), true);
    await picker().click();
    assert.equal(await page.getByRole('option', { name: /^PROFILE-QA-DUP[12] · QA Trùng Tên$/ }).count(), 2);
    await page.keyboard.press('Escape');
  });
  await check('Changing the selected profile clears feedback and worker selection', async () => {
    await choose('alpha'); await note().fill('Feedback belongs only to alpha'); await selectWorker('PROFILE-QA-BETA');
    await choose('duplicate'); assert.equal(await note().inputValue(), ''); await emptyChoice();
    await choose('beta'); assert.equal(await note().inputValue(), ''); assert.match(await picker().innerText(), /PROFILE-QA-BETA/);
  });
  await check('Refresh of a changed revision clears feedback and worker selection', async () => {
    await choose('duplicate'); await note().fill('Old revision feedback'); await selectWorker('PROFILE-QA-DUP1');
    sql(`update local_employee_profile_forms set revision=8,updated_at=now() where user_id=${q(ids.duplicate)}`);
    await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
    await detail('duplicate').getByText('Phiên bản #8', { exact: true }).waitFor();
    assert.equal(await note().inputValue(), ''); await emptyChoice();
  });
  await check('Search removes hidden selection and never restores its draft feedback', async () => {
    await note().fill('Must not leak through search'); await selectWorker('PROFILE-QA-DUP2');
    await page.getByRole('textbox', { name: 'Tìm kiếm hồ sơ', exact: true }).fill('alpha@fixture.invalid');
    await detail('duplicate').waitFor({ state: 'hidden' });
    await choose('alpha'); assert.equal(await note().inputValue(), ''); assert.match(await picker().innerText(), /PROFILE-QA-ALPHA/);
    await page.getByRole('textbox', { name: 'Tìm kiếm hồ sơ', exact: true }).fill('');
  });
  await check('Workers still loading block approval until the owned response arrives', async () => {
    let release, intercepted = false;
    const held = new Promise(resolve => { release = resolve; });
    const handler = async route => { intercepted = true; await held; await route.continue(); };
    await page.route('**/api/workers', handler);
    try {
      await open(); await detail('alpha').waitFor();
      await page.getByText('Đang tải công nhân...', { exact: true }).waitFor();
      assert.ok(intercepted); assert.equal(await picker().isDisabled(), true); assert.equal(await approve().isDisabled(), true);
      release();
      await page.waitForFunction(() => document.querySelector('[role="combobox"]')?.textContent.includes('PROFILE-QA-ALPHA'));
      assert.equal(await approve().isEnabled(), true);
    } finally { release(); await page.unroute('**/api/workers', handler); }
  });
  await check('Worker load failure blocks approval and retry restores selection', async () => {
    const handler = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA synthetic worker list unavailable' }) });
    await page.route('**/api/workers', handler);
    try {
      await open(); await detail('alpha').waitFor();
      await detail('alpha').getByRole('alert').waitFor();
      assert.equal(await picker().isDisabled(), true); assert.equal(await approve().isDisabled(), true);
    } finally { await page.unroute('**/api/workers', handler); }
    await detail('alpha').getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role="combobox"]')?.textContent.includes('PROFILE-QA-ALPHA'));
    assert.equal(await approve().isEnabled(), true);
  });
  await check('Real approval sends viewed revision and links the selected worker atomically', async () => {
    await note().fill('Approved synthetic alpha profile');
    const response = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/' + ids.alpha + '/review'));
    await approve().click(); assert.equal((await response).status(), 200);
    await detail('alpha').waitFor({ state: 'hidden' });
    assert.deepEqual(reviewRequests.at(-1).body, { decision: 'APPROVED', expected_revision: '7', note: 'Approved synthetic alpha profile', worker_id: workers.alpha.id });
    assert.equal(sql(`select status||':'||approved_revision from local_employee_profile_forms where user_id=${q(ids.alpha)}`), 'APPROVED:7');
    assert.equal(sql(`select user_id from local_workers where id=${q(workers.alpha.id)}`), ids.alpha);
    assert.equal(sql(`select count(*) from local_employee_profile_history where user_id=${q(ids.alpha)} and action='APPROVE' and revision=7`), '1');
  });
  await check('Approved status shows a read-only reviewed snapshot and current worker link', async () => {
    await page.getByRole('button', { name: /^Đã duyệt/ }).click(); await choose('alpha');
    await detail('alpha').getByText('Ghi chú phản hồi: Approved synthetic alpha profile', { exact: true }).waitFor();
    assert.ok((await detail('alpha').innerText()).includes('Công nhân đang liên kết: PROFILE-QA-ALPHA'));
    assert.equal(await note().count(), 0); assert.equal(await approve().count(), 0);
    await page.getByRole('button', { name: /^Chờ xác nhận/ }).click(); await choose('beta');
  });
  await check('Real needs-info review requires feedback and becomes read-only', async () => {
    const requestInfo = page.getByRole('button', { name: 'Yêu cầu bổ sung', exact: true });
    assert.equal(await requestInfo.isDisabled(), true);
    await note().fill('Bổ sung căn cước giả lập QA');
    const response = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/' + ids.beta + '/review'));
    await requestInfo.click(); assert.equal((await response).status(), 200);
    await detail('beta').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /^Đã yêu cầu bổ sung/ }).click(); await choose('beta');
    await detail('beta').getByText('Ghi chú phản hồi: Bổ sung căn cước giả lập QA', { exact: true }).waitFor();
    assert.equal(await note().count(), 0); assert.equal(await approve().count(), 0);
    assert.equal(sql(`select status from local_employee_profile_forms where user_id=${q(ids.beta)}`), 'NEEDS_INFO');
    await page.getByRole('button', { name: /^Chờ xác nhận/ }).click(); await choose('duplicate');
  });
  await check('Real stale-revision 409 clears detail and requires a fresh explicit review', async () => {
    await selectWorker('PROFILE-QA-DUP1'); await note().fill('Stale revision feedback must disappear');
    sql(`update local_employee_profile_forms set revision=9,updated_at=now() where user_id=${q(ids.duplicate)}`);
    const response = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/' + ids.duplicate + '/review'));
    await approve().click(); assert.equal((await response).status(), 409);
    await detail('duplicate').waitFor({ state: 'hidden' });
    await page.getByText('Chọn một hồ sơ ở cột bên trái để kiểm tra chi tiết và phê duyệt.', { exact: true }).waitFor();
    assert.equal(sql(`select status from local_employee_profile_forms where user_id=${q(ids.duplicate)}`), 'SUBMITTED');
    assert.equal(sql(`select coalesce(user_id,'unlinked') from local_workers where id=${q(workers.dup1.id)}`), 'unlinked');
    await choose('duplicate'); await detail('duplicate').getByText('Phiên bản #9', { exact: true }).waitFor();
    assert.equal(await note().inputValue(), ''); await emptyChoice();
  });
  for (const width of [375, 768, 1440]) await check('Responsive profile list, detail, back, and overflow at ' + width, async () => {
    await page.setViewportSize({ width, height: 1000 });
    // The app changes its route layout at the mobile breakpoint, remounting the
    // workspace. Start each width at its real route entry state.
    await open();
    if (width >= 1024) await page.getByRole('button', { name: 'Đóng chi tiết', exact: true }).click();
    const list = page.getByLabel('Danh sách hồ sơ', { exact: true }); await list.waitFor();
    assert.ok(await list.isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'List has no document overflow');
    await page.screenshot({ path: path.join(artifactDir, 'screenshots', 'profile-list-' + width + '.png'), animations: 'disabled' });
    await choose('duplicate');
    assert.equal(await list.isVisible(), width >= 1024);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Detail has no document overflow');
    const bounds = await detail('duplicate').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Detail fits viewport');
    if (width < 1024) {
      // Read geometry directly: locator.click() would scroll a covered Back
      // button into view and hide the real opening-state problem.
      const back = page.getByRole('button', { name: 'Trở lại danh sách', exact: true });
      const geometry = await back.evaluate(element => {
        const box = element.getBoundingClientRect();
        const headerBottom = Math.max(0, ...[...document.querySelectorAll('header')].filter(header => ['fixed', 'sticky'].includes(getComputedStyle(header).position)).map(header => header.getBoundingClientRect().bottom));
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { top: box.top, bottom: box.bottom, headerBottom, viewportHeight: innerHeight, hitTarget: hit === element || element.contains(hit) };
      });
      assert.ok(geometry.top >= geometry.headerBottom - 1 && geometry.bottom <= geometry.viewportHeight, 'Back is visible below the actual fixed header: ' + JSON.stringify(geometry));
      assert.equal(geometry.hitTarget, true, 'Back is directly reachable without automatic scrolling');
    }
    await page.screenshot({ path: path.join(artifactDir, 'screenshots', 'profile-detail-' + width + '.png'), animations: 'disabled' });
    if (width < 1024) {
      await page.getByRole('button', { name: 'Trở lại danh sách', exact: true }).click(); await list.waitFor();
      await page.waitForFunction(() => document.querySelector('[aria-label="Danh sách hồ sơ"]') === document.activeElement);
      assert.ok(await list.evaluate(element => element === document.activeElement), 'Back returns keyboard focus to list');
      await detail('duplicate').waitFor({ state: 'hidden' }); await choose('duplicate');
    }
  });
  await check('No runtime exceptions or unexpected console errors', async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of (409|503)/.test(message)), []);
  });
} catch (error) {
  failed.push({ name: 'Browser fixture setup or fatal runner failure', message: error.stack || error.message }); log('FATAL ' + error.message);
} finally {
  await browser?.close();
  if (launcher.exitCode === null) { launcher.stdin.end('stop\n'); await Promise.race([once(launcher, 'exit'), new Promise(resolve => setTimeout(resolve, 15000))]); }
  if (!fixtureOutput.includes('CLEANUP own UI fixture')) failed.push({ name: 'Owned cleanup', message: 'Launcher cleanup acknowledgement missing' });
  const report = { passed: passed.length, failed: failed.length, checks: passed, failures: failed, pageErrors, consoleErrors, blockedOrigins, reviewRequests: reviewRequests.map(({ url, body }) => ({ path: new URL(url).pathname, body })), cleanupConfirmed: fixtureOutput.includes('CLEANUP own UI fixture'), artifactDir, limits: ['Only synthetic profiles in an owned disposable database; no production or hosted requests.', 'Worker loading/error uses browser interception of owned GET /api/workers.', 'Responsive checks use 375, 768, and 1440 pixel headless Chrome viewports.'] };
  await writeFile(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(artifactDir, 'run.log'), logs.join('\n') + '\n');
  // Omit the fixture manifest line because it contains disposable login credentials.
  await writeFile(path.join(artifactDir, 'fixture.log'), fixtureOutput.split(/\r?\n/).filter(line => !line.startsWith('UI_FIXTURE_READY ')).join('\n'));
  console.log(JSON.stringify({ passed: passed.length, failed: failed.length, artifactDir }));
}
if (failed.length) process.exitCode = 1;
