// Browser regression on the owned, in-memory GHN fixture only. Never loads .env,
// connects to PostgreSQL, or permits browser traffic to a provider.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = path.join(root, '.local-staging-runtime', 'ghn-modes-browser-20261102');
const fixture = spawn(process.execPath, ['scripts/start-ghn-orders-ui-fixture.mjs'], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
let output = '', browser, manifest, page;
fixture.stdout.on('data', chunk => { output += chunk; });
fixture.stderr.on('data', chunk => { output += chunk; });
const checks = [], failures = [], errors = [], blocked = [], requests = [];
let selectedLightShift, selectedHeavyShift;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(test, label, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await test()) return;
    if (fixture.exitCode !== null) throw Error('Fixture exited: ' + output.slice(-2000));
    await delay(100);
  }
  throw Error('Timed out: ' + label);
}
async function check(name, run) {
  try { await run(); checks.push(name); console.log('PASS GHN modes browser: ' + name); }
  catch (error) { failures.push({ name, message: error.message }); console.log('FAIL GHN modes browser: ' + name + ': ' + error.message); }
}
async function control(command, marker) {
  const offset = output.length;
  fixture.stdin.write(command + '\n');
  await waitFor(() => output.slice(offset).includes(marker), command);
}
const numeric = value => Number(String(value).replaceAll('.', ''));

try {
  await mkdir(artifacts, { recursive: true });
  await waitFor(() => {
    const line = output.split(/\r?\n/).find(row => row.startsWith('GHN_ORDERS_UI_FIXTURE_READY '));
    if (line) manifest = JSON.parse(line.slice('GHN_ORDERS_UI_FIXTURE_READY '.length));
    return Boolean(manifest);
  }, 'fixture ready', 180000);
  assert.equal(manifest.noDatabase, true);
  assert.equal(manifest.noProviderCalls, true);
  const { chromium } = createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === manifest.origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    blocked.push(url.origin); return route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/')) {
      let body; try { body = request.postDataJSON(); } catch { return; }
      if (body?.action === 'calculate_fee' || new URL(request.url()).pathname.startsWith('/api/ghn-orders')) requests.push({ path: new URL(request.url()).pathname, body });
    }
  });
  await page.goto(manifest.origin + '/auth');
  await page.getByLabel('Email', { exact: true }).fill(manifest.credentials.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(manifest.credentials.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(url => url.pathname !== '/auth');
  await page.goto(manifest.origin + '/orders');
  await page.getByRole('button', { name: 'Tạo đơn GHN', exact: true }).first().dispatchEvent('click');
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Tạo đơn hàng lẻ GHN', exact: true }) });
  await dialog.locator('#ghn-to-name').waitFor();
  const light = () => dialog.getByRole('radio', { name: /Hàng nhẹ/ });
  const heavy = () => dialog.getByRole('radio', { name: /Hàng nặng/ });
  async function address() {
    await dialog.locator('#ghn-to-name').fill('Khách thử GHN_4321');
    await dialog.locator('#ghn-to-phone').fill('0900000003');
    await dialog.locator('#ghn-address-summary').click();
    await page.locator('#ghn-street').fill('789 Đường Giả Lập');
    for (const [id, label] of [['ghn-province', 'Tỉnh Thử Nghiệm'], ['ghn-district', 'Quận Giả Lập'], ['ghn-ward', 'Phường Dữ Liệu Thử']]) {
      await page.locator('#' + id).click();
      await page.getByRole('option', { name: label, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Xong', exact: true }).click();
  }
  async function capture(name) { await page.screenshot({ path: path.join(artifacts, name + '.png'), fullPage: false }); }
  const createButton = () => dialog.getByRole('button', { name: 'Tạo đơn', exact: true });
  async function ready() { await waitFor(() => createButton().isEnabled(), 'current quote and valid form'); }
  async function fillHeavy(index, name, weight, length, width, height) {
    await dialog.locator('#ghn-heavy-name-' + index).fill(name);
    const prefix = index === 0 ? '#ghn-parcel-' : '#ghn-parcel-' + (index + 1) + '-';
    for (const [field, value] of Object.entries({ weight, length, width, height })) await dialog.locator(prefix + field).fill(String(value));
  }
  const lastFee = (mode, shopId) => requests.filter(row => row.body.action === 'calculate_fee' && row.body.orderMode === mode && (!shopId || row.body.shopId === shopId)).at(-1)?.body;
  const lastCreate = mode => requests.filter(row => row.path === '/api/ghn-orders' && row.body.orderMode === mode).at(-1)?.body;
  function assertFeeMatchesCreate(fee, created) {
    assert.ok(fee); assert.ok(created);
    assert.equal(fee.orderMode, created.orderMode);
    assert.equal(fee.shopId, created.shopId);
    for (const field of ['weight', 'length', 'width', 'height', 'service_id', 'service_type_id', 'insurance_value', 'cod_failed_amount']) assert.equal(fee.feeData[field], created.orderData[field], field);
    assert.equal(fee.feeData.cod_value, created.orderData.cod_amount);
    assert.deepEqual(fee.feeData.items, created.orderData.items.map(({ price, ...item }) => { assert.equal(price, 0); return item; }));
  }
  async function layout(width, name) {
    await page.setViewportSize({ width, height: 900 });
    await ready();
    await dialog.locator('main').evaluate(node => { node.scrollTop = 0; });
    const rect = await dialog.evaluate(node => ({ width: node.clientWidth, scrollWidth: node.scrollWidth, right: node.getBoundingClientRect().right }));
    assert.ok(rect.scrollWidth <= rect.width + 1, JSON.stringify(rect));
    assert.ok(rect.right <= width + 1, JSON.stringify(rect));
    const main = await dialog.locator('main').evaluate(node => ({ width: node.clientWidth, scrollWidth: node.scrollWidth }));
    assert.ok(main.scrollWidth <= main.width + 1, JSON.stringify(main));
    const button = await dialog.getByRole('button', { name: 'Tạo đơn', exact: true }).boundingBox();
    assert.ok(button && button.y >= 0 && button.y + button.height <= 900, JSON.stringify(button));
    await capture(name);
    await dialog.locator('#ghn-products').evaluate(node => node.scrollIntoView({ block: 'start' }));
    await capture(name + '-products');
    await dialog.locator('#ghn-parcel-heading').evaluate(node => node.scrollIntoView({ block: 'start' }));
    await capture(name + '-package');
  }

  // The mode controls and field IDs below are the public UI contract. Keep the
  // checks on real interactions/payloads instead of extracting implementation.
  await check('two explicit modes and initial LIGHT fields', async () => {
    await light().check();
    assert.equal(await light().isChecked(), true);
    assert.equal(await dialog.locator('#ghn-item-name-0').isVisible(), true);
    assert.equal(await dialog.locator('#ghn-parcel-weight').isVisible(), true);
  });
  await address();
  await dialog.locator('#ghn-item-name-0').fill('Ga thử nghiệm');
  await dialog.locator('#ghn-item-weight-0').fill('2.000');
  await dialog.getByLabel('Số lượng sản phẩm 1', { exact: true }).fill('2');
  for (const field of ['length', 'width', 'height']) await dialog.locator('#ghn-parcel-' + field).fill('10');
  await check('product count updates one package; measured gross overrides product sum', async () => {
    assert.equal(numeric(await dialog.locator('#ghn-parcel-weight').inputValue()), 4000);
    await dialog.locator('#ghn-parcel-weight').fill('5.500');
    await dialog.getByLabel('Số lượng sản phẩm 1', { exact: true }).fill('3');
    assert.equal(numeric(await dialog.locator('#ghn-parcel-weight').inputValue()), 5500);
  });
  await check('COD does not overwrite insurance; failed-delivery default remembers edits', async () => {
    await dialog.locator('#ghn-cod').fill('150.000');
    assert.equal(numeric(await dialog.locator('#ghn-insurance').inputValue()), 0);
    const checkbox = dialog.getByRole('checkbox', { name: /giao thất bại/i });
    await checkbox.check();
    assert.equal(numeric(await dialog.locator('#ghn-failed-cod').inputValue()), 20000);
    await dialog.locator('#ghn-failed-cod').fill('25.000');
    await checkbox.uncheck(); await checkbox.check();
    assert.equal(numeric(await dialog.locator('#ghn-failed-cod').inputValue()), 25000);
    await checkbox.uncheck();
  });
  await check('add N LIGHT products and delete blank rows without creating parcels', async () => {
    await dialog.locator('#ghn-add-count').fill('2');
    await dialog.locator('#ghn-add-rows').click();
    assert.equal(await dialog.locator('[id^="ghn-item-name-"]').count(), 3);
    await dialog.getByRole('button', { name: 'Xóa sản phẩm 3', exact: true }).click();
    await dialog.locator('#ghn-item-name-1').fill('Vỏ gối thử');
    await dialog.locator('#ghn-item-weight-1').fill('500');
    await dialog.locator('#ghn-item-code-1').fill('VG-TEST');
    assert.equal(numeric(await dialog.locator('#ghn-parcel-weight').inputValue()), 5500);
    await ready();
    const fee = lastFee('LIGHT');
    assert.equal(fee.feeData.service_type_id, 2);
    assert.equal(fee.feeData.service_id, 53320);
    assert.equal(fee.feeData.items.length, 2);
    assert.equal(fee.feeData.items[0].quantity, 3);
    assert.equal(fee.feeData.items[0].weight, 2000);
    assert.equal(fee.feeData.weight, 5500);
  });
  await check('selecting a fetched pickup shift invalidates the quote and retains its real ID', async () => {
    await ready();
    const shifts = dialog.locator('#ghn-pick-shift');
    assert.ok(await shifts.locator('option').count() > 1);
    await control('quotes-delay-123', 'FIXTURE_QUOTES_DELAY_READY 123');
    await shifts.selectOption({ index: 1 });
    selectedLightShift = Number(await shifts.inputValue());
    assert.ok(Number.isSafeInteger(selectedLightShift) && selectedLightShift > 0);
    assert.equal(await createButton().isDisabled(), true);
    await ready();
    await control('quotes-reset', 'FIXTURE_QUOTES_RESET_READY');
  });
  await check('desktop LIGHT layout', () => layout(1280, 'desktop-light'));
  await check('mobile LIGHT layout', () => layout(390, 'mobile-light'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await heavy().check();
  await check('HEAVY form has per-parcel input without root dimensions', async () => {
    assert.equal(await dialog.locator('#ghn-item-name-0').count(), 0);
    assert.equal(await dialog.locator('#ghn-parcel-heading').locator('..').locator('#ghn-parcel-length').count(), 0);
  });
  await check('HEAVY adds N parcels, copies/deletes and sums max per parcel to 2.900g', async () => {
    await fillHeavy(0, 'Kiện chăn thử', 1000, 30, 20, 20);
    await dialog.locator('#ghn-add-count').fill('2');
    await dialog.locator('#ghn-add-rows').click();
    assert.equal(await dialog.locator('[id^="ghn-heavy-name-"]').count(), 3);
    await dialog.getByRole('button', { name: 'Xóa kiện 3', exact: true }).click();
    await fillHeavy(1, 'Kiện gối thử', 500, 10, 10, 10);
    assert.equal((await dialog.locator('#ghn-heavy-chargeable').innerText()).trim(), '2.900 g');
    await dialog.getByRole('button', { name: 'Sao chép kiện 1', exact: true }).click();
    assert.equal(await dialog.locator('#ghn-heavy-name-2').inputValue(), 'Kiện chăn thử');
    assert.equal(numeric(await dialog.locator('#ghn-parcel-3-weight').inputValue()), 1000);
    await dialog.getByRole('button', { name: 'Xóa kiện 3', exact: true }).click();
    await ready();
    const fee = lastFee('HEAVY');
    assert.equal(fee.feeData.service_type_id, 5);
    assert.equal(fee.feeData.service_id, 100039);
    assert.equal(fee.feeData.weight, 1500);
    assert.deepEqual(fee.feeData.items.map(row => row.name), ['Kiện chăn thử', 'Kiện gối thử']);
    assert.equal(fee.feeData.length, undefined);
  });
  await check('mode toggle retains LIGHT draft and measured override', async () => {
    await light().check();
    assert.equal(await dialog.locator('#ghn-item-name-0').inputValue(), 'Ga thử nghiệm');
    assert.equal(numeric(await dialog.locator('#ghn-parcel-weight').inputValue()), 5500);
    await heavy().check();
    assert.equal(await dialog.locator('#ghn-heavy-name-1').inputValue(), 'Kiện gối thử');
    assert.equal((await dialog.locator('#ghn-heavy-chargeable').innerText()).trim(), '2.900 g');
  });
  await check('desktop HEAVY layout', () => layout(1280, 'desktop-heavy'));
  await check('mobile HEAVY layout', () => layout(390, 'mobile-heavy'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await check('switching mode invalidates the previous quote while delayed quotes arrive', async () => {
    await ready();
    await control('quotes-delay-123', 'FIXTURE_QUOTES_DELAY_READY 123');
    await light().check();
    assert.equal(await createButton().isDisabled(), true);
    await ready();
    assert.equal(lastFee('LIGHT').feeData.service_type_id, 2);
    await control('quotes-reset', 'FIXTURE_QUOTES_RESET_READY');
  });
  await check('OLD3 LIGHT creation uses the exact measured package and product quote', async () => {
    await ready();
    await createButton().click();
    await page.getByRole('button', { name: 'Tạo đơn mới', exact: true }).waitFor();
    const created = lastCreate('LIGHT');
    assertFeeMatchesCreate(lastFee('LIGHT', created.shopId), created);
    assert.equal(created.addressMode, undefined);
    assert.equal(created.orderData.weight, 5500);
    assert.equal(created.orderData.items.length, 2);
    assert.equal(created.orderData.items[0].quantity, 3);
    assert.deepEqual(created.orderData.pick_shift, [selectedLightShift]);
    await capture('light-synthetic-success');
    await page.getByRole('button', { name: 'Tạo đơn mới', exact: true }).click();
    await dialog.locator('#ghn-item-name-0').waitFor();
    assert.equal(await light().isChecked(), true);
    assert.equal(await dialog.locator('#ghn-item-name-0').inputValue(), '');
  });
  await check('NEW2 HEAVY preview and create preserve names, actual weight, mode and address', async () => {
    await heavy().check();
    await dialog.locator('#ghn-to-name').fill('Người nhận hai cấp_5432');
    await dialog.locator('#ghn-to-phone').fill('0900000003');
    await dialog.locator('#ghn-address-summary').click();
    await page.getByRole('radio', { name: 'Địa chỉ mới · 2 cấp', exact: true }).check();
    await page.locator('#ghn-new-street').fill('789 Đường Giả Lập');
    await page.locator('#ghn-new-province').selectOption('202');
    await waitFor(async () => await page.locator('#ghn-new-ward option').count() > 1, 'new ward directory');
    await page.locator('#ghn-new-ward').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Xong', exact: true }).click();
    await fillHeavy(0, 'Kiện chăn hai cấp', 1000, 30, 20, 20);
    await dialog.locator('#ghn-add-count').fill('1');
    await dialog.locator('#ghn-add-rows').click();
    await fillHeavy(1, 'Kiện gối hai cấp', 500, 10, 10, 10);
    await dialog.locator('#ghn-pick-shift').selectOption({ index: 2 });
    selectedHeavyShift = Number(await dialog.locator('#ghn-pick-shift').inputValue());
    await ready();
    const preview = requests.filter(row => row.path === '/api/ghn-orders/preview' && row.body.orderMode === 'HEAVY').at(-1)?.body;
    assert.ok(preview);
    assert.equal(preview.addressMode, 'NEW2');
    assert.equal(preview.orderData.service_id, undefined);
    assert.deepEqual(preview.orderData.pick_shift, [selectedHeavyShift]);
    await createButton().click();
    await page.getByRole('button', { name: 'Tạo đơn mới', exact: true }).waitFor();
    const created = lastCreate('HEAVY');
    assert.equal(created.addressMode, 'NEW2');
    assert.equal(created.orderData.service_type_id, 5);
    assert.equal(created.orderData.service_id, undefined);
    assert.equal(created.orderData.weight, 1500);
    assert.equal(created.orderData.length, undefined);
    assert.equal(created.orderData.to_district_id, undefined);
    assert.deepEqual(created.orderData.pick_shift, [selectedHeavyShift]);
    assert.deepEqual(created.orderData.items, preview.orderData.items);
    assert.deepEqual(created.orderData.items.map(row => row.name), ['Kiện chăn hai cấp', 'Kiện gối hai cấp']);
    await capture('heavy-new2-synthetic-success');
  });
  await check('no JavaScript errors or provider requests', async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked.filter(origin => /ghn\.vn/.test(origin)), []);
  });
  assert.deepEqual(failures, []);
  console.log('PASS GHN modes browser: ' + checks.length + ' checks; screenshots ' + artifacts);
} catch (error) {
  if (page) await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  await writeFile(path.join(artifacts, 'result.json'), JSON.stringify({ checks, failures, errors, blocked, screenshots: artifacts, requests }, null, 2));
  if (browser) await browser.close();
  fixture.stdin.write('stop\n');
  if (fixture.exitCode === null) await Promise.race([once(fixture, 'exit'), delay(8000)]);
  if (fixture.exitCode === null) fixture.kill();
}
