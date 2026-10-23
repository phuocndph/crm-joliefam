// Browser QA only: creates and removes an owned disposable database. Never reads .env.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifactDir = path.join(root, '.local-staging-runtime', 'workspace-redesign-20261019');
const launcher = spawn(process.execPath, ['scripts/start-attendance-ui-fixture.mjs'], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
let output = '', manifest, browser, token, owned = false, diagnosticPage;
launcher.stdout.on('data', chunk => { output += chunk; });
launcher.stderr.on('data', chunk => { output += chunk; });
const passed = [], failed = [], runtimeErrors = [], blockedRequests = [];
const check = async (name, action) => {
  try { await action(); passed.push(name); console.log('PASS ' + name); }
  catch (error) {
    failed.push({ name, message: error.message }); console.log('FAIL ' + name + ': ' + error.message);
    if (diagnosticPage && !diagnosticPage.isClosed()) {
      const diagnosticName = name.replaceAll(/[^a-zA-Z0-9]+/g, '-');
      await diagnosticPage.screenshot({ path: path.join(artifactDir, 'failure-' + diagnosticName + '.png'), animations: 'disabled' }).catch(() => {});
      await writeFile(path.join(artifactDir, 'failure-' + diagnosticName + '.txt'), diagnosticPage.url() + '\n' + await diagnosticPage.locator('body').innerText()).catch(() => {});
    }
  }
};
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = query => {
  assert.ok(owned && /^attendance_ui_qa_[0-9_]+$/.test(manifest.database), 'Only verified owned fixture SQL');
  const result = spawnSync('docker', ['exec', 'crm-joliefam-local-postgres', 'psql', '-U', 'crm_local', '-d', manifest.database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'Owned SQL failed: ' + result.stderr);
  return result.stdout.trim();
};
const api = async (route, method = 'GET', body) => {
  const response = await fetch(manifest.apiBase + route, { method, headers: { origin: 'https://crm.example.com', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  assert.ok(response.ok, route + ': ' + JSON.stringify(data));
  return data;
};
const select = async (page, label, option) => { await page.getByRole('combobox', { name: label, exact: true }).click(); await page.getByRole('option', { name: option, exact: true }).click(); };
const inputUnderLabel = (scope, text) => scope.locator('label').filter({ hasText: new RegExp('^' + text + '$') }).locator('..').locator('input,textarea').first();
const expectVisible = async locator => { await locator.waitFor({ state: 'visible' }); };
const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Document fits viewport');
const openActor = async actor => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === manifest.webBase || url.protocol === 'data:') return route.continue();
    blockedRequests.push(url.origin); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto(manifest.webBase + '/auth');
  await page.getByLabel('Email', { exact: true }).fill(manifest.credentials[actor].email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(manifest.credentials[actor].password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(url => url.pathname !== '/auth');
  return { context, page };
};

try {
  await mkdir(artifactDir, { recursive: true });
  for (let n = 0; n < 800; n++) {
    const line = output.split(/\r?\n/).find(value => value.startsWith('UI_FIXTURE_READY '));
    if (line) { manifest = JSON.parse(line.slice('UI_FIXTURE_READY '.length)); break; }
    if (launcher.exitCode !== null) throw new Error('Owned fixture failed before ready');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(manifest, 'Owned fixture ready');
  assert.equal((await (await fetch(manifest.apiBase + '/health')).json()).database, manifest.database);
  owned = /^attendance_ui_qa_[0-9_]+$/.test(manifest.database);
  assert.equal(sql('select current_database()'), manifest.database);
  token = (await api('/api/local-auth/login', 'POST', manifest.credentials.admin)).token;
  const warehouseA = randomUUID(), warehouseB = randomUUID();
  sql(`insert into local_inventory_warehouses(id,code,name)values(${quote(warehouseA)},'QA-A','Kho QA A'),(${quote(warehouseB)},'QA-B','Kho QA B')`);
  const itemA = await api('/api/inventory/items', 'POST', { code: 'QA-METER', name: 'Vải QA mét', item_type: 'RAW_MATERIAL', base_unit: 'METER', category: 'UI QA' });
  const itemB = await api('/api/inventory/items', 'POST', { code: 'QA-KG', name: 'Vật tư QA kg', item_type: 'SUPPLY', base_unit: 'KG', category: 'UI QA' });
  const inactiveItem = await api('/api/inventory/items', 'POST', { code: 'QA-INACTIVE', name: 'Vật tư QA ngừng dùng', item_type: 'SUPPLY', base_unit: 'PIECE', category: 'UI QA' });
  await api('/api/inventory/items/' + inactiveItem.id + '/active', 'POST', { is_active: false });
  const receipt = async (warehouse, item, quantity = 10, description = 'Nhập tồn QA') => api('/api/inventory/documents', 'POST', { document_type: 'RECEIPT', transaction_at: '2026-01-01T12:00:00+07:00', warehouse_id: warehouse, description, idempotency_key: randomUUID(), lines: [{ inventory_item_id: item.id, unit: item.base_unit, quantity, input_unit_cost: 20000, vat_rate: 0 }] });
  for (const [warehouse, item] of [[warehouseA, itemA], [warehouseB, itemB]]) { const document = await receipt(warehouse, item); await api('/api/inventory/documents/' + document.id + '/confirm', 'POST', {}); }
  const draftToVoid = await receipt(warehouseB, itemB, 1, 'Phiếu QA để hủy');
  const { chromium } = createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const { page, context } = await openActor('admin');
  diagnosticPage = page;
  await check('Inventory route loads owned stock', async () => { await page.goto(manifest.webBase + '/inventory-management'); await expectVisible(page.getByRole('heading', { name: 'Kho & vật tư', exact: true })); await expectVisible(page.getByRole('row').filter({ hasText: 'QA-METER' })); });
  await check('Summary stock link clears warehouse and search filters', async () => {
    await select(page, 'Lọc kho', 'Kho QA B');
    await expectVisible(page.getByRole('row').filter({ hasText: 'QA-KG' }));
    assert.equal(await page.getByRole('row').filter({ hasText: 'QA-METER' }).count(), 0);
    await page.getByPlaceholder('Tìm vật tư hoặc kho...').fill('no-fixture-match');
    await page.getByRole('button', { name: /^Vị trí có tồn/ }).click();
    assert.equal(await page.getByPlaceholder('Tìm vật tư hoặc kho...').inputValue(), '');
    assert.match(await page.getByRole('combobox', { name: 'Lọc kho', exact: true }).innerText(), /Tất cả kho/);
    await expectVisible(page.getByRole('row').filter({ hasText: 'QA-METER' }));
    await expectVisible(page.getByRole('row').filter({ hasText: 'QA-KG' }));
  });
  await check('Summary active items link selects active items and clears stale search', async () => {
    await page.getByRole('tab', { name: 'Vật tư', exact: true }).click();
    await select(page, 'Trạng thái vật tư', 'Ngừng dùng');
    await expectVisible(page.getByRole('row').filter({ hasText: 'QA-INACTIVE' }));
    await page.getByPlaceholder('Tìm mã, tên, nhóm vật tư...').fill('no-fixture-match');
    await page.getByRole('button', { name: /^Vật tư đang dùng/ }).click();
    await expectVisible(page.getByRole('row').filter({ hasText: 'QA-METER' }));
    assert.equal(await page.getByRole('row').filter({ hasText: 'QA-INACTIVE' }).count(), 0);
    assert.equal(await page.getByPlaceholder('Tìm mã, tên, nhóm vật tư...').inputValue(), '');
  });
  await check('Summary pending link clears document search and type filters', async () => {
    await page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
    await select(page, 'Loại phiếu', 'Xuất kho');
    await page.getByPlaceholder('Tìm số phiếu, nội dung, chứng từ...').fill('no-fixture-match');
    await page.getByRole('button', { name: /^Phiếu chờ xác nhận/ }).click();
    await expectVisible(page.getByRole('row').filter({ hasText: draftToVoid.document_number }));
    assert.equal(await page.getByPlaceholder('Tìm số phiếu, nội dung, chứng từ...').inputValue(), '');
    assert.match(await page.getByRole('combobox', { name: 'Loại phiếu', exact: true }).innerText(), /Tất cả loại/);
    assert.equal(await page.getByRole('button', { name: 'Nháp', exact: true }).getAttribute('aria-pressed'), 'true');
  });
  await check('Contextual receipt prefill and stable-key retry creates only one draft', async () => {
    await page.getByRole('button', { name: /^Vị trí có tồn/ }).click();
    await page.getByRole('row').filter({ hasText: 'QA-KG' }).getByRole('button', { name: '+ Nhập', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expectVisible(dialog);
    assert.match(await dialog.getByRole('combobox', { name: 'Kho lập phiếu', exact: true }).innerText(), /Kho QA B/);
    assert.match(await dialog.getByRole('combobox', { name: 'Vật tư 1', exact: true }).innerText(), /QA-KG/);
    assert.equal(await inputUnderLabel(dialog, 'Đơn vị').inputValue(), 'kg');
    await dialog.getByRole('spinbutton', { name: 'Số lượng 1', exact: true }).fill('2.5');
    await inputUnderLabel(dialog, 'Đơn giá chưa VAT').fill('30000');
    await dialog.getByPlaceholder('Mô tả nghiệp vụ kho').fill('UI QA stable retry receipt');
    const attempts = [];
    await page.route('**/api/inventory/documents', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts.push(route.request().postDataJSON());
      if (attempts.length === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Lỗi QA giả lập trước khi ghi dữ liệu' }) });
      return route.continue();
    });
    await dialog.getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click();
    await page.getByText('Lỗi QA giả lập trước khi ghi dữ liệu', { exact: true }).first().waitFor();
    assert.equal(await dialog.getByRole('spinbutton', { name: 'Số lượng 1', exact: true }).inputValue(), '2.5');
    await dialog.getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' }); await page.unroute('**/api/inventory/documents');
    assert.equal(attempts.length, 2); assert.equal(attempts[0].idempotency_key, attempts[1].idempotency_key);
    assert.equal(attempts[1].warehouse_id, warehouseB); assert.equal(attempts[1].lines[0].inventory_item_id, itemB.id);
    assert.equal(attempts[1].lines[0].unit, 'KG'); assert.equal(attempts[1].lines[0].quantity, 2.5);
    assert.equal(JSON.parse(sql("select count(*)::int from local_inventory_documents where description='UI QA stable retry receipt'")), 1);
    assert.equal(JSON.parse(sql("select count(*)::int from local_inventory_movements m join local_inventory_documents d on d.id=m.document_id where d.description='UI QA stable retry receipt'")), 0);
  });
  await check('Labeled confirmation writes ledger once and removes draft actions', async () => {
    await page.getByRole('button', { name: /^Phiếu chờ xác nhận/ }).click();
    const row = page.getByRole('row').filter({ hasText: 'UI QA stable retry receipt' });
    await expectVisible(row); await row.getByRole('button', { name: 'Xác nhận ghi sổ', exact: true }).click();
    await row.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Đã xác nhận', exact: true }).click(); await expectVisible(row);
    assert.equal(await row.getByRole('button', { name: 'Xác nhận ghi sổ', exact: true }).count(), 0);
    assert.equal(await row.getByRole('button', { name: 'Hủy nháp', exact: true }).count(), 0);
    assert.equal(sql("select count(*) from local_inventory_movements m join local_inventory_documents d on d.id=m.document_id where d.description='UI QA stable retry receipt'"), '1');
    assert.equal(sql("select quantity_delta=2.5::numeric from local_inventory_movements m join local_inventory_documents d on d.id=m.document_id where d.description='UI QA stable retry receipt'"), 't');
  });
  await check('Labeled void requires reason and never writes ledger', async () => {
    await page.getByRole('button', { name: /^Phiếu chờ xác nhận/ }).click();
    const row = page.getByRole('row').filter({ hasText: draftToVoid.document_number });
    await row.getByRole('button', { name: 'Hủy nháp', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expectVisible(dialog);
    assert.ok(await dialog.getByRole('button', { name: 'Hủy phiếu', exact: true }).isDisabled());
    await inputUnderLabel(dialog, 'Lý do hủy').fill('QA hủy phiếu nháp kiểm thử');
    await dialog.getByRole('button', { name: 'Hủy phiếu', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Đã hủy', exact: true }).click(); await expectVisible(row);
    assert.equal(await row.getByRole('button').count(), 0);
    assert.equal(sql(`select count(*) from local_inventory_movements where document_id=${quote(draftToVoid.id)}`), '0');
  });
  await check('Contextual issue selects correct item unit and warehouse', async () => {
    await page.getByRole('button', { name: /^Vị trí có tồn/ }).click();
    await page.getByRole('row').filter({ hasText: 'QA-METER' }).getByRole('button', { name: '− Xuất', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expectVisible(dialog);
    assert.match(await dialog.getByRole('combobox', { name: 'Kho lập phiếu', exact: true }).innerText(), /Kho QA A/);
    assert.match(await dialog.getByRole('combobox', { name: 'Vật tư 1', exact: true }).innerText(), /QA-METER/);
    assert.equal(await inputUnderLabel(dialog, 'Đơn vị').inputValue(), 'm');
    assert.equal(await inputUnderLabel(dialog, 'Đơn giá chưa VAT').count(), 0);
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).first().click();
  });
  await check('Stock card opens history filtered to that item', async () => {
    await Promise.all([
      page.waitForRequest(request => new URL(request.url()).pathname === '/api/inventory/movements' && new URL(request.url()).searchParams.get('itemId') === itemA.id),
      page.getByRole('row').filter({ hasText: 'QA-METER' }).getByRole('button', { name: 'Thẻ kho', exact: true }).click(),
    ]);
    await expectVisible(page.getByRole('row').filter({ hasText: 'QA-METER' }));
    assert.equal(await page.getByRole('row').filter({ hasText: 'QA-KG' }).count(), 0);
  });
  await check('Contextual location remains on its own line and clears after removing that line', async () => {
    const locationId = randomUUID();
    await page.route('**/api/inventory/balances', async route => {
      const response = await route.fetch(); const rows = await response.json();
      await route.fulfill({ response, json: rows.map(row => row.inventory_item_id === itemA.id ? { ...row, location_id: locationId, location_name: 'Kệ QA riêng' } : row) });
    });
    await page.goto(manifest.webBase + '/inventory-management');
    const row = page.getByRole('row').filter({ hasText: 'QA-METER' }); await expectVisible(row);
    await row.getByRole('button', { name: '+ Nhập', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expectVisible(dialog.getByText('Vị trí: Kệ QA riêng', { exact: true }));
    const payloads = [];
    await page.route('**/api/inventory/documents', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      payloads.push(route.request().postDataJSON());
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA location payload captured without mutation' }) });
    });
    await dialog.getByPlaceholder('Mô tả nghiệp vụ kho').fill('QA location context');
    await inputUnderLabel(dialog, 'Đơn giá chưa VAT').fill('1000');
    await dialog.getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click();
    await expectVisible(page.getByText('QA location payload captured without mutation', { exact: true }).first());
    assert.equal(payloads[0].lines[0].location_id, locationId);
    await dialog.getByRole('button', { name: 'Thêm dòng', exact: true }).click();
    await expectVisible(dialog.getByText('Vị trí: Khu vực chung', { exact: true }));
    await dialog.getByRole('button', { name: 'Xóa dòng', exact: true }).first().click();
    assert.equal(await dialog.getByText('Vị trí: Kệ QA riêng', { exact: true }).count(), 0);
    await select(page, 'Vật tư 1', 'QA-KG - Vật tư QA kg');
    await inputUnderLabel(dialog, 'Đơn giá chưa VAT').fill('1000');
    await dialog.getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Lưu phiếu nháp'));
    assert.equal(payloads.length, 2); assert.equal(payloads[1].lines[0].location_id ?? null, null);
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).first().click();
    await page.unroute('**/api/inventory/documents'); await page.unroute('**/api/inventory/balances');
  });
  await check('Reconciliation loading and error never claim matched; retry gives neutral local result', async () => {
    let release; const held = new Promise(resolve => { release = resolve; }); let failing = true;
    await page.route('**/api/inventory/reconciliation', async route => {
      await held;
      if (failing) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA reconciliation unavailable' }) });
      return route.continue();
    });
    await page.goto(manifest.webBase + '/inventory-management');
    await page.getByRole('tab', { name: 'Đối soát', exact: true }).click();
    await expectVisible(page.getByRole('status').filter({ hasText: 'Đang tải dữ liệu...' }).first());
    assert.equal(await page.getByText('Sổ kho và số dư đang khớp', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Đã tải số dư kho', { exact: true }).count(), 0);
    release();
    await expectVisible(page.getByRole('alert').filter({ hasText: 'Hệ thống không coi lỗi tải là số dư bằng 0.' }).last());
    assert.equal(await page.getByText('Đã tải số dư kho', { exact: true }).count(), 0);
    failing = false; await page.getByRole('button', { name: 'Thử tải lại', exact: true }).click();
    await expectVisible(page.getByText('Đã tải số dư kho', { exact: true }));
    assert.equal(await page.getByText('Sổ kho và số dư đang khớp', { exact: true }).count(), 0);
    await expectVisible(page.getByText(/chưa hỗ trợ đối chiếu độc lập với sổ kho/));
    await page.unroute('**/api/inventory/reconciliation');
  });
  await check('Balances loading error and retry distinguish unavailable data from empty stock', async () => {
    let failing = true;
    await page.route('**/api/inventory/balances', route => failing ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA stock unavailable' }) }) : route.continue());
    await page.goto(manifest.webBase + '/inventory-management');
    await expectVisible(page.getByRole('alert').filter({ hasText: 'Hệ thống không coi lỗi tải là số dư bằng 0.' }).last());
    assert.equal(await page.getByText('Chưa có số dư tồn kho phù hợp.', { exact: true }).count(), 0);
    failing = false; await page.getByRole('button', { name: 'Thử tải lại', exact: true }).click();
    await expectVisible(page.getByRole('row').filter({ hasText: 'QA-METER' }));
    await page.unroute('**/api/inventory/balances');
  });
  await check('Documents-only permission hides local confirm and void; audit without cost shows metadata only', async () => {
    const restrictedDraft = await receipt(warehouseA, itemA, 1, 'QA restricted actor pending draft');
    const employeeId = sql(`select user_id from local_user_profiles where email=${quote(manifest.credentials.employee.email)}`);
    sql(`insert into local_employee_permissions(user_id,permission_type,enabled)values(${quote(employeeId)},'inventory_view',true),(${quote(employeeId)},'inventory_documents',true),(${quote(employeeId)},'inventory_audit',true)`);
    const scoped = await openActor('employee');
    try {
      await scoped.page.goto(manifest.webBase + '/inventory-management');
      await expectVisible(scoped.page.getByRole('row').filter({ hasText: 'QA-METER' }));
      for (const label of ['Giá bình quân', 'Giá trị tồn']) assert.equal(await scoped.page.getByRole('columnheader', { name: label, exact: true }).count(), 0);
      assert.equal(await scoped.page.getByText('Giá trị tồn:', { exact: false }).count(), 0);
      await scoped.page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
      await expectVisible(scoped.page.getByRole('row').filter({ hasText: restrictedDraft.document_number }));
      assert.equal(await scoped.page.getByRole('button', { name: 'Xác nhận ghi sổ', exact: true }).count(), 0);
      assert.equal(await scoped.page.getByRole('button', { name: 'Hủy nháp', exact: true }).count(), 0);
      assert.equal(await scoped.page.getByRole('columnheader', { name: 'Giá trị', exact: true }).count(), 0);
      await scoped.page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
      await expectVisible(scoped.page.getByRole('row').filter({ hasText: 'QA-METER' }));
      for (const label of ['Đơn giá', 'Giá trị tồn']) assert.equal(await scoped.page.getByRole('columnheader', { name: label, exact: true }).count(), 0);
      await scoped.page.getByRole('tab', { name: 'Đối soát', exact: true }).click();
      await expectVisible(scoped.page.getByRole('heading', { name: 'Nhật ký gần đây', exact: true }));
      await expectVisible(scoped.page.getByRole('columnheader', { name: 'Người thực hiện', exact: true }));
      assert.ok(await scoped.page.getByRole('row').count() > 1, 'Audit metadata remains accessible without cost permission');
      assert.equal(await scoped.page.getByRole('columnheader', { name: 'Lệch giá trị', exact: true }).count(), 0);
    } finally { await scoped.context.close(); }
  });

  await check('Overtime and history respect explicit worker scope', async () => {
    await page.goto(manifest.webBase + '/production-attendance?date=' + manifest.dates.today + '&mode=HISTORY&worker=' + manifest.excelWorker.id);
    // A payroll worker deep link intentionally opens its day detail sheet.
    const scopedDetail = page.getByRole('dialog');
    await expectVisible(scopedDetail);
    assert.match(await scopedDetail.innerText(), /Nhân viên QA - Workbook 5 ngày/);
    await page.keyboard.press('Escape'); await scopedDetail.waitFor({ state: 'hidden' });
    await expectVisible(page.getByRole('tab', { name: 'Lịch sử', exact: true }));
    assert.equal(await page.getByRole('tab', { name: 'Lịch sử', exact: true }).getAttribute('data-state'), 'active', 'Requested monthly history mode stays active');
    await expectVisible(page.getByRole('row').filter({ hasText: 'QA-UI-EXCEL' }).first());
    assert.equal(await page.getByRole('row').filter({ hasText: 'QA-UI-EMPLOYEE' }).count(), 0);
    await page.getByRole('tab', { name: 'Tăng ca', exact: true }).click();
    await expectVisible(page.getByText('Chưa có dữ liệu tăng ca.', { exact: true }));
    await expectVisible(page.getByText('0 phút', { exact: true }));
    assert.equal(await page.getByRole('row').filter({ hasText: 'QA-UI-EMPLOYEE' }).count(), 0);
  });
  await check('No-match attendance search filters monthly overtime and history totals', async () => {
    await page.goto(manifest.webBase + '/production-attendance?date=' + manifest.dates.today + '&mode=OVERTIME');
    await expectVisible(page.getByRole('row').filter({ hasText: 'QA-UI-EMPLOYEE' }).first());
    await page.getByPlaceholder('Tìm tên hoặc mã nhân viên...').fill('NO-QA-PERSON-MATCH');
    await expectVisible(page.getByText('Chưa có dữ liệu tăng ca.', { exact: true }));
    await expectVisible(page.getByText('0 phút', { exact: true }));
    await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
    await expectVisible(page.getByText('Chưa có lịch sử trong tháng.', { exact: true }));
    await expectVisible(page.getByText('0 sự kiện', { exact: true }));
  });
  await check('Hidden test workers are excluded from overtime and history until explicitly revealed', async () => {
    sql(`update local_workers set employee_code='HARDEN-QA-UI-EMPLOYEE' where id=${quote(manifest.worker.id)}`);
    try {
      await page.goto(manifest.webBase + '/production-attendance?date=' + manifest.dates.today + '&mode=OVERTIME');
      await expectVisible(page.getByRole('button', { name: 'Hiện 1 nhân sự kiểm thử', exact: true }));
      await expectVisible(page.getByText('Chưa có dữ liệu tăng ca.', { exact: true }));
      await expectVisible(page.getByText('0 phút', { exact: true }));
      await page.getByRole('button', { name: 'Hiện 1 nhân sự kiểm thử', exact: true }).click();
      await expectVisible(page.getByRole('row').filter({ hasText: 'HARDEN-QA-UI-EMPLOYEE' }).first());
      await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
      await expectVisible(page.getByRole('row').filter({ hasText: 'HARDEN-QA-UI-EMPLOYEE' }).first());
      await page.getByRole('button', { name: 'Ẩn 1 nhân sự kiểm thử', exact: true }).click();
      await expectVisible(page.getByRole('row').filter({ hasText: 'QA-UI-EXCEL' }).first());
      assert.equal(await page.getByRole('row').filter({ hasText: 'HARDEN-QA-UI-EMPLOYEE' }).count(), 0);
    } finally { sql(`update local_workers set employee_code=${quote(manifest.worker.code)} where id=${quote(manifest.worker.id)}`); }
  });

  for (const width of [375, 768, 1440]) await check('Attendance five accessible modes at ' + width, async () => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(manifest.webBase + '/production-attendance?date=' + manifest.dates.today);
    await expectVisible(page.getByRole('heading', { name: 'Chấm công xưởng', exact: true }));
    for (const name of ['Cần xử lý', 'Theo ngày', 'Theo tháng', 'Tăng ca', 'Lịch sử']) {
      const tab = page.getByRole('tab', { name: new RegExp('^' + name) }); await tab.click();
      assert.equal(await tab.getAttribute('data-state'), 'active'); await noOverflow(page);
    }
    await page.screenshot({ path: path.join(artifactDir, 'attendance-' + width + '.png'), animations: 'disabled' });
  });
  for (const [route, heading] of [['inventory-management', 'Kho & vật tư'], ['profile-review', 'Duyệt hồ sơ nhân sự']]) for (const width of [375, 768, 1440]) await check(route + ' responsive ' + width, async () => {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(manifest.webBase + '/' + route);
    await expectVisible(page.getByRole('heading', { name: heading, exact: true })); await noOverflow(page);
    await page.screenshot({ path: path.join(artifactDir, route + '-' + width + '.png'), animations: 'disabled' });
  });
  await context.close();
  await check('No browser runtime errors', async () => assert.deepEqual(runtimeErrors, []));
  await check('Browser never attempts outside owned local origin', async () => assert.deepEqual(blockedRequests, []));
} catch (error) { failed.push({ name: 'Suite setup/runtime', message: error.message }); console.log('FAIL Suite setup/runtime: ' + error.message); }
finally {
  await browser?.close();
  if (launcher.exitCode === null) { launcher.stdin.end('stop\n'); await Promise.race([once(launcher, 'exit'), new Promise(resolve => setTimeout(resolve, 15000))]); }
  if (!output.includes('CLEANUP own UI fixture')) failed.push({ name: 'Cleanup', message: 'Owned fixture did not confirm cleanup' });
  const report = { passed: passed.length, checks: passed, failed, artifactDir };
  await writeFile(path.join(artifactDir, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); if (failed.length) process.exitCode = 1;
}
