// UX regression on an owned disposable database/API/frontend. Never loads .env.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const screenshots = path.join(root, '.local-staging-runtime', 'attendance-frontend-20261017', 'screenshots');
const launcher = spawn(process.execPath, ['scripts/start-attendance-ui-fixture.mjs'], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
let output = '', manifest, browser;
launcher.stdout.on('data', chunk => { output += chunk; });
launcher.stderr.on('data', chunk => { output += chunk; });
const failures = [], checks = [], consoleErrors = [];
const check = async (name, fn) => {
  try { await fn(); checks.push(name); console.log('PASS ' + name); }
  catch (error) { failures.push({ name, message: error.message }); console.log('FAIL ' + name + ': ' + error.message); }
};
try {
  for (let n = 0; n < 600; n++) {
    const line = output.split(/\r?\n/).find(value => value.startsWith('UI_FIXTURE_READY '));
    if (line) { manifest = JSON.parse(line.slice('UI_FIXTURE_READY '.length)); break; }
    if (launcher.exitCode !== null) throw new Error('Disposable UI fixture failed before ready: ' + output.slice(-3000));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(manifest, 'Disposable UI fixture became ready');
  console.log('Fixture ready on isolated local origin');
  await mkdir(screenshots, { recursive: true });
  const { chromium } = createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const open = async name => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === manifest.webBase || url.protocol === 'data:' ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.goto(manifest.webBase + '/auth');
    await page.getByLabel('Email', { exact: true }).fill(manifest.credentials[name].email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(manifest.credentials[name].password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL(url => url.pathname !== '/auth');
    return { page, context };
  };
  const { page: employee, context: employeeContext } = await open('employee');
  await employee.goto(manifest.webBase + '/my-attendance');
  await employee.getByRole('heading', { name: 'Chấm công của tôi', exact: true }).waitFor();
  await check('Employee navigation preserves an unfinished attendance note', async () => {
    const form = employee.locator('#attendance-edit-form');
    await form.locator('textarea').fill('Ghi chú QA chưa gửi');
    await employee.getByRole('button', { name: 'Công & thu nhập', exact: true }).click();
    assert.equal(await form.isVisible(), false);
    await employee.getByRole('button', { name: 'Hồ sơ', exact: true }).click();
    assert.ok(await employee.getByRole('link', { name: /hồ sơ/i }).count());
    await employee.getByRole('button', { name: 'Hôm nay', exact: true }).click();
    assert.equal(await form.locator('textarea').inputValue(), 'Ghi chú QA chưa gửi');
    const order = await employee.evaluate(() => {
      const form = document.querySelector('#attendance-edit-form');
      const confirm = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Xác nhận toàn ngày'));
      return !!form && !!confirm && !!(form.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(order, true, 'Entry comes before review and confirmation');
  });
  await check('Employee month and income remain separately readable', async () => {
    await employee.getByRole('button', { name: 'Công & thu nhập', exact: true }).click();
    await employee.getByRole('button', { name: 'Thu nhập sản lượng', exact: true }).click();
    await employee.getByRole('heading', { name: 'Thu nhập sản lượng của tôi', exact: true }).waitFor();
    assert.ok(await employee.getByText('Chưa gồm toàn bộ khoản lương tháng và tăng ca.', { exact: true }).isVisible());
  });
  for (const width of [375, 768, 1440]) await check('Employee responsive ' + width, async () => {
    await employee.setViewportSize({ width, height: 1000 });
    await employee.getByRole('button', { name: 'Hôm nay', exact: true }).click();
    await employee.locator('#attendance-edit-form').waitFor();
    const size = await employee.getByRole('button', { name: 'Hôm nay', exact: true }).boundingBox();
    assert.ok(size.height >= 48, 'Primary touch target is at least 48px');
    assert.ok(await employee.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal document overflow');
    await employee.screenshot({ path: path.join(screenshots, 'employee-' + width + '.jpg'), fullPage: false, animations: 'disabled' });
  });
  await employeeContext.close();

  const { page: manager, context: managerContext } = await open('admin');
  await manager.goto(manifest.webBase + '/production-attendance');
  await manager.getByRole('heading', { name: 'Chấm công xưởng', exact: true }).waitFor();
  await check('Manager quick filter uses existing pending semantics', async () => {
    await manager.getByRole('button', { name: 'Chờ duyệt', exact: true }).click();
    assert.equal(await manager.getByRole('button', { name: 'Chờ duyệt', exact: true }).getAttribute('aria-pressed'), 'true');
    await manager.getByRole('button', { name: 'Tất cả', exact: true }).click();
    const actions = manager.getByRole('button', { name: 'Xử lý ngày', exact: true });
    await actions.first().waitFor();
    await actions.first().click();
    await manager.getByRole('dialog').waitFor();
    assert.ok(await manager.getByRole('dialog').innerText());
    await manager.keyboard.press('Escape');
    await manager.getByRole('dialog').waitFor({ state: 'hidden' });
  });
  await check('Closed and unrecorded quick filters open the day view', async () => {
    for (const label of ['Đã chốt ngày', 'Chưa ghi nhận']) {
      await manager.getByRole('tab', { name: /Cần xử lý/ }).click();
      await manager.getByRole('button', { name: label, exact: true }).click();
      assert.equal(await manager.getByRole('tab', { name: 'Theo ngày', exact: true }).getAttribute('data-state'), 'active');
    }
    await manager.getByRole('button', { name: 'Tất cả', exact: true }).click();
  });
  for (const width of [375, 768, 1440]) await check('Manager responsive ' + width, async () => {
    await manager.setViewportSize({ width, height: 1000 });
    await manager.getByRole('button', { name: 'Chờ duyệt', exact: true }).waitFor();
    assert.ok(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal document overflow');
    await manager.screenshot({ path: path.join(screenshots, 'manager-' + width + '.jpg'), fullPage: false, animations: 'disabled' });
  });

  const openPayroll = async () => {
    await manager.goto(manifest.webBase + '/payroll-settings?tab=runs&month=' + manifest.payrollMonth);
    await manager.getByRole('heading', { name: 'Bàn làm việc kỳ lương', exact: true }).waitFor();
    await manager.getByText('Lịch sử & công cụ', { exact: true }).click();
    await manager.getByRole('button', { name: 'Mở đối soát', exact: true }).click();
  };
  await openPayroll();
  await check('Payslip shows exact server decimal values and keyboard close', async () => {
    const button = manager.getByRole('button', { name: /phiếu lương.*Nhân viên QA - Công và tăng ca/i }).filter({ visible: true }).first();
    await button.click();
    const sheet = manager.getByRole('dialog');
    await sheet.waitFor();
    assert.ok((await sheet.innerText()).includes('2.600.000,123456'), 'Exact salary fraction is retained');
    assert.ok((await sheet.innerText()).includes('2.652.000'), 'Payment is server rounded');
    assert.ok((await sheet.innerText()).includes('273.000'), 'Deduction is shown');
    await manager.keyboard.press('Tab');
    assert.ok(await sheet.evaluate(element => element.contains(document.activeElement)), 'Tab focus remains in sheet');
    await manager.keyboard.press('Shift+Tab');
    assert.ok(await sheet.evaluate(element => element.contains(document.activeElement)), 'Shift+Tab focus remains in sheet');
    await manager.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });
    assert.equal(await sheet.isVisible(), false);
    assert.ok(await button.evaluate(element => element === document.activeElement), 'Focus returns to payslip trigger');
  });
  for (const width of [375, 768, 1440]) await check('Payroll and payslip responsive ' + width, async () => {
    await manager.setViewportSize({ width, height: 1000 });
    await openPayroll();
    const button = manager.getByRole('button', { name: /phiếu lương.*Nhân viên QA - Công và tăng ca/i }).filter({ visible: true }).first();
    await button.click();
    const sheet = manager.getByRole('dialog');
    await sheet.waitFor();
    // Locator screenshots wait for the opening transition to settle.
    await sheet.screenshot({ animations: 'disabled' });
    const bounds = await sheet.boundingBox();
    assert.ok(bounds.width <= width && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Payslip fits viewport');
    assert.ok(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Payslip content does not overflow horizontally');
    await manager.screenshot({ path: path.join(screenshots, 'payslip-' + width + '.jpg'), fullPage: false, animations: 'disabled' });
    await manager.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });
  });
  await check('Payslip closes when month context changes', async () => {
    // Same SPA instance: browser Back changes the query while the sheet is open.
    await manager.locator('#console-month').fill('2019-02');
    await manager.waitForURL(url => url.searchParams.get('month') === '2019-02');
    await manager.locator('#console-month').fill(manifest.payrollMonth);
    await manager.waitForURL(url => url.searchParams.get('month') === manifest.payrollMonth);
    await manager.getByRole('button', { name: 'Mở đối soát', exact: true }).click();
    await manager.getByRole('button', { name: /phiếu lương.*Nhân viên QA - Công và tăng ca/i }).filter({ visible: true }).first().click();
    await manager.goBack();
    await manager.waitForURL(url => url.searchParams.get('month') === '2019-02');
    await manager.getByRole('heading', { name: 'Bàn làm việc kỳ lương', exact: true }).waitFor();
    assert.equal(await manager.getByRole('dialog').isVisible(), false);
  });
  await managerContext.close();
  await check('No browser runtime errors', async () => assert.deepEqual(consoleErrors, []));
} finally {
  await browser?.close();
  if (launcher.exitCode === null) {
    launcher.stdin.end('stop\n');
    await Promise.race([once(launcher, 'exit'), new Promise(resolve => setTimeout(resolve, 15000))]);
  }
  assert.ok(output.includes('CLEANUP own UI fixture'), 'Owned fixture cleaned up');
  console.log(JSON.stringify({ passed: checks.length, failed: failures, screenshots }));
}
if (failures.length) process.exitCode = 1;
