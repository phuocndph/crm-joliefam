// TEST-ONLY: compile the actual SPA and serve an in-memory synthetic API.
// Never loads .env, connects to PostgreSQL, persists keys, or calls providers.
// Start: node scripts/start-ghn-orders-ui-fixture.mjs
// stdin: state | next-create-unknown | reconcile-success | quotes-weight-service
// quotes-fail-456 | quotes-all-fail | quotes-no-services-456 | quotes-delay-456
// quotes-delay-123 | quotes-shared-service-id | quotes-reset | stop. Quote switches are independently composable.
// quotes-fail-next-123-2 (shop 123/456, type 2/5) | quotes-price-plus-1000.
// print-fail-next | print-delay | creates-delay | status-delay | attempt-delay-reset.
// linkfail | linkconflict | linkdelay | importfailpartial | printfail | nullcod | refreshfailed | tracking-reset.
// Print URLs deliberately use GHN's fixed URL shape with a synthetic token. Never
// follow them: fixture QA inspects href only; no real provider or label exists.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';

const root = fileURLToPath(new URL('..', import.meta.url));
const credentials = { email: 'admin@fixture.invalid', password: 'FixtureOnly!123' };
const session = { actor: 'fixture-admin', token: 'synthetic-ghn-ui-session-only', role: 'admin', expires_at: new Date(Date.now() + 4 * 3600000).toISOString() };
const me = { user_id: session.actor, email: credentials.email, role: 'admin', first_name: 'Dữ liệu thử', last_name: 'GHN', assigned_by: null, worker_id: null, employee_code: null, worker_name: null };
const fixtureShops = [
  { _id: 123, name: 'Shop thử 123 — hàng nhẹ', address: '123 Đường Giả Lập — địa chỉ thử', district_id: 1452, ward_code: '010101', phone: '0900000001', status: 1 },
  { _id: 456, name: 'Shop thử 456 — hàng nặng', address: '456 Đường Giả Lập — địa chỉ thử', district_id: 1453, ward_code: '010102', phone: '0900000002', status: 1 },
];
const provinces = [{ ProvinceID: 202, ProvinceName: 'Tỉnh Thử Nghiệm', NameExtension: ['Tinh Thu Nghiem'] }];
const districts = [{ DistrictID: 1444, ProvinceID: 202, DistrictName: 'Quận Giả Lập', NameExtension: ['Quan Gia Lap'] }];
const wards = [{ WardCode: '020308', DistrictID: 1444, WardName: 'Phường Dữ Liệu Thử', NameExtension: ['Phuong Du Lieu Thu'] }];
const linkedOrder = {
  id: 'fixture-order-001', order_number: 'FIXTURE-RENAMED-001', display_order_number: 'FIXTURE-ĐÃ-ĐỔI-001',
  customer_id: 'fixture-customer', manager_id: session.actor, total_amount: 180000, total_paid: 0,
  cost_price: 100000, profit_before: 80000, profit_after: 80000, status: 'processing', payment_status: 'pending',
  payment_date: null, delivery_date: null, delivered_date: null, notes: 'Đơn thử nghiệm — không giao hàng thật',
  items: [{ name: 'Sản phẩm thử', quantity: 1, price: 180000 }], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  customers: { name: 'Người nhận giả lập', email: 'receiver@fixture.invalid', phone: '0900000003', company: 'Dữ liệu thử', customer_code: 'FIXTURE', address: '789 Đường Giả Lập — địa chỉ thử', addresses: [] },
  assignees: null, ghn_tracking: [],
};
const secondOrder = {
  ...structuredClone(linkedOrder), id: 'fixture-order-002', order_number: 'FIXTURE-ORDER-002', display_order_number: 'FIXTURE-002',
  customers: { ...linkedOrder.customers, name: 'Người nhận thử thứ hai', phone: '0900000004', address: '987 Đường Giả Lập — địa chỉ thử thứ hai' },
};
const fixtureOrders = [linkedOrder, secondOrder];
const packedParcelItemName = content => {
  const value = String(content || '');
  if (value.length <= 200) return value;
  let prefix = value.slice(0, 199);
  if (/^[\uD800-\uDBFF]$/.test(prefix.charAt(prefix.length - 1))) prefix = prefix.slice(0, -1);
  return `${prefix}…`;
};
let mode = 'ENABLED', revision = 1, primary = '123', allowed = ['123', '456'];
let nextCreateUnknown = false, reconcileSuccess = false, selectedAi = 'local';
let quoteScenario = 'default', quoteFailure = '', quoteDelayShop = '', quoteNoServices = '', quoteSharedServiceId = false;
let quoteFailNextPair = '', quotePriceDelta = 0;
let printFailNext = false, printDelay = false, createsDelay = false, statusDelay = false;
let linkFail = false, linkConflict = false, linkDelay = false, importFailPartial = false, trackingPrintFail = false, refreshFailed = false;
let importPartialIndex = 0;
const attempts = new Map();
const trackingRows = new Map();
const fixtureTracking = (code, { id = `tracking-${code}`, orderId = null, shopId = '123', legacy = false } = {}) => ({
  id, ghn_order_code: code, internal_order_code: orderId ? 'FIXTURE-OLD-NUMBER-001' : null, order_id: orderId,
  customer_name: `test Khách ${code}`, customer_phone: '0900000003', customer_address: '789 Đường Giả Lập, Phường Dữ Liệu Thử, Quận Giả Lập, Tỉnh Thử Nghiệm',
  package_weight: 1500, cod_amount: code.endsWith('ZERO') ? 0 : 180000, ghn_status: 'delivering', ghn_status_text: 'Đang giao hàng',
  created_date: '2026-10-20T03:00:00.000Z', expected_delivery_date: '2026-10-27T03:00:00.000Z', delivered_date: null,
  tracking_url: `https://donhang.ghn.vn/?order_code=${encodeURIComponent(code)}`, tracking_notes: 'Dữ liệu giả lập giữ nguyên',
  raw_data: legacy ? null : { shop_id: Number(shopId), source: 'synthetic-fixture' }, manager_id: session.actor, tenant_id: 'fixture-tenant',
  created_at: '2026-10-20T03:00:00.000Z', updated_at: '2026-10-20T03:00:00.000Z', last_updated_at: '2026-10-23T03:00:00.000Z',
});
const resetTracking = () => {
  trackingRows.clear();
  for (const row of [
    fixtureTracking('FIXTURETRACK123', { orderId: linkedOrder.id }),
    fixtureTracking('FIXTURETRACK456', { orderId: linkedOrder.id, shopId: '456' }),
    fixtureTracking('FIXTURELEGACYZERO', { legacy: true }),
  ]) trackingRows.set(row.id, row);
};
resetTracking();
const orderTracking = id => [...trackingRows.values()].filter(row => row.order_id === id);
const orderCodes = id => orderTracking(id).map(row => row.ghn_order_code).sort();
const hydrateOrders = () => fixtureOrders.map(order => ({ ...order, ghn_tracking: orderTracking(order.id).map(({ id, ghn_order_code }) => ({ id, ghn_order_code })) }));
const counters = { reads: 0, createRequests: 0, dispatchedCreates: 0, replays: 0, reconciles: 0, printRequests: 0, printed: [], discovery: 0, blocked: 0, serviceReads: 0, feeReads: 0, quoteActive: 0, quoteMaxActive: 0, serviceByShop: {}, feeByPair: {}, feeByServicePair: {}, linkReads: 0, linkRequests: 0, imports: 0, detached: 0, deleted: 0, trackingPrintRequests: 0, trackingPrinted: [] };
const status = () => ({ mode, revision, source: mode === 'DISABLED' ? 'disabled' : mode === 'ENABLED' ? 'saved' : 'server_env', configured: mode !== 'DISABLED', configured_shop_count: mode === 'DISABLED' ? 0 : allowed.length, has_saved_key: mode === 'ENABLED', primary_shop_id: mode === 'DISABLED' ? '' : primary, allowed_shop_ids: mode === 'DISABLED' ? [] : allowed });
const aiStatus = () => ({ selected: selectedAi, providers: ['f5quota', 'beeknoee'].map(provider => ({ provider, configured: false, model: 'fixture-model', base_url: 'https://fixture.invalid', protocol: provider === 'f5quota' ? 'responses' : 'gemini' })) });
const summary = () => ({ fixture: true, counters, shops: allowed, quoteControls: { quoteScenario, quoteFailure, quoteDelayShop, quoteNoServices, quoteSharedServiceId, quoteFailNextPair, quotePriceDelta }, attemptControls: { printFailNext, printDelay, createsDelay, statusDelay }, trackingControls: { linkFail, linkConflict, linkDelay, importFailPartial, trackingPrintFail, refreshFailed }, tracking: [...trackingRows.values()].map(({ id, ghn_order_code, order_id, cod_amount }) => ({ id, code: ghn_order_code, orderId: order_id, cod: cod_amount })), attempts: [...attempts.values()].map(({ result, shopId, serviceId, serviceType, weight }) => ({ status: result.attempt_status, reference: result.reference, shopId, serviceId, serviceType, weight })) });
const created = row => {
  row.result.attempt_status = 'SUCCESS';
  row.result.order_code = `FIXTUREGHN${String(row.sequence).padStart(4, '0')}`;
  const order = fixtureOrders.find(item => item.id === row.orderId);
  if (![...trackingRows.values()].some(item => item.ghn_order_code === row.result.order_code)) {
    const tracking = fixtureTracking(row.result.order_code, { orderId: order?.id || null, shopId: row.shopId });
    trackingRows.set(tracking.id, tracking);
  }
  return row;
};
const app = express();
app.use(express.json({ limit: '64kb' }));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; form-action 'self'; object-src 'none'");
  next();
});
app.post('/api/local-auth/login', (req, res) => req.body?.email === credentials.email && req.body?.password === credentials.password ? res.json(session) : res.status(401).json({ message: 'Chỉ dùng tài khoản thử nghiệm fixture.' }));
app.post('/api/local-auth/logout', (_req, res) => res.json({ success: true }));
app.use('/api', (req, res, next) => req.headers.authorization === `Bearer ${session.token}` ? next() : res.status(401).json({ message: 'Phiên fixture không hợp lệ.' }));
app.get('/api/local-auth/me', (_req, res) => res.json(me));
app.get('/api/external-integrations/ghn', (_req, res) => res.json(status()));
app.put('/api/external-integrations/ghn', (req, res) => {
  const input = req.body || {};
  if (input.revision !== revision) return res.status(409).json({ message: 'Phiên bản cấu hình đã cũ (giả lập).' });
  if (!['ENABLED', 'DISABLED', 'INHERIT_ENV'].includes(input.mode)) return res.status(400).json({ message: 'Chế độ không hợp lệ.' });
  if (input.mode === 'ENABLED') {
    const list = [...new Set(String(input.allowed_shop_ids || '').split(',').map(value => value.trim()).filter(Boolean))];
    if (!list.length || list.some(value => !['123', '456'].includes(value)) || !list.includes(String(input.primary_shop_id))) return res.status(400).json({ message: 'Fixture chỉ hỗ trợ shop thử 123 và 456.' });
    primary = String(input.primary_shop_id); allowed = list;
  }
  mode = input.mode; revision++;
  // The submitted key is intentionally never stored, hashed, or logged.
  res.json(status());
});
app.post('/api/external-integrations/ghn/test', (_req, res) => res.json({ configured: mode !== 'DISABLED', connected: mode !== 'DISABLED', message: 'Kết nối giả lập, không gọi GHN thật.', checked_at: new Date().toISOString() }));
app.post('/api/external-integrations/ghn/shops-discovery', (_req, res) => { counters.discovery++; res.json({ shops: fixtureShops, checked_at: new Date().toISOString() }); });
app.get('/api/external-integrations/status', (_req, res) => res.json({ ghn: { configured: mode !== 'DISABLED', writes_supported: true }, tax: { configured: true } }));
app.post('/api/local-functions/ghn-tracking', async (req, res) => {
  counters.reads++;
  if (mode === 'DISABLED') return res.status(503).json({ message: 'GHN đã tắt trong fixture.' });
  const body = req.body || {}, shop = String(body.shopId || primary);
  const priceDelta = quotePriceDelta;
  if (!allowed.includes(shop)) return res.status(403).json({ message: 'Shop thử không được phép.' });
  if (body.action === 'get_services' || body.action === 'calculate_fee') {
    counters.quoteActive++; counters.quoteMaxActive = Math.max(counters.quoteMaxActive, counters.quoteActive);
    res.once('finish', () => { counters.quoteActive--; });
    if (body.action === 'get_services') { counters.serviceReads++; counters.serviceByShop[shop] = (counters.serviceByShop[shop] || 0) + 1; }
    else {
      counters.feeReads++;
      const pair = `${shop}:${body.feeData?.service_id}`, exactPair = `${pair}:${body.feeData?.service_type_id}`;
      counters.feeByPair[pair] = (counters.feeByPair[pair] || 0) + 1;
      counters.feeByServicePair[exactPair] = (counters.feeByServicePair[exactPair] || 0) + 1;
    }
    // Capture each request's controls so a pending old response stays deterministic.
    const failNext = body.action === 'calculate_fee' && quoteFailNextPair === `${shop}:${body.feeData?.service_type_id}`;
    if (failNext) quoteFailNextPair = '';
    const fail = failNext || quoteFailure === 'all' || quoteFailure === shop, delay = quoteDelayShop === shop;
    if (delay) await new Promise(resolve => setTimeout(resolve, 2500));
    if (fail) return res.status(503).json({ message: 'Lỗi tính cước thử nghiệm có kiểm soát.' });
  }
  let data;
  if (body.action === 'get_shops') data = fixtureShops.filter(item => allowed.includes(String(item._id)));
  else if (body.action === 'get_provinces') data = provinces;
  else if (body.action === 'get_districts') data = Number(body.provinceId) === 202 ? districts : [];
  else if (body.action === 'get_wards') data = Number(body.districtId) === 1444 ? wards : [];
  else if (body.action === 'get_services') data = quoteNoServices === shop ? [] : [{ service_id: 53320, short_name: 'Dịch vụ thử — hàng nhẹ', service_type_id: 2 }, { service_id: quoteSharedServiceId ? 53320 : 100039, short_name: 'Dịch vụ thử — hàng nặng', service_type_id: 5 }];
  else if (body.action === 'calculate_fee') {
    const feeData = body.feeData || {}, item = feeData.items?.[0];
    const dimensionFields = ['length', 'width', 'height'];
    const rootDimensions = dimensionFields.filter(field => feeData[field] !== undefined);
    if (rootDimensions.length && rootDimensions.length !== dimensionFields.length) return res.status(400).json({ message: 'Kích thước kiện phải có đủ dài, rộng, cao (giả lập).' });
    if (feeData.items) {
      const matchesParcel = Array.isArray(feeData.items) && feeData.items.length === 1 && item?.name === 'Kiện hàng đã đóng gói' && Number(item.quantity) === 1 && rootDimensions.length === 3
        && Number(item.weight) === Number(feeData.weight) && dimensionFields.every(field => Number(item[field]) === Number(feeData[field]));
      if (!matchesParcel) return res.status(400).json({ message: 'Kiện trong báo giá phải khớp kiện đã cân, đo (giả lập).' });
    } else if (rootDimensions.length) return res.status(400).json({ message: 'Báo giá đầy đủ cần kiện đã đóng gói chuẩn (giả lập).' });
    // Final pricing deliberately reads the canonical item, never only root weight.
    const physicalWeight = Number(item?.weight ?? feeData.weight);
    const heavy = physicalWeight >= 20000, service5 = Number(feeData.service_type_id) === 5;
    if ((!heavy && service5) || (heavy && !service5)) return res.status(400).json({ message: 'Loại dịch vụ không phù hợp khối lượng kiện (giả lập).' });
    const total = quoteScenario === 'weight-service'
      ? physicalWeight * 4
      : quoteSharedServiceId && service5 ? shop === '123' ? 19000 : 17000 : shop === '123' ? 25000 : 29000;
    data = { service_fee: total + priceDelta - 1000, insurance_fee: 1000, cod_fee: 0, r2s_fee: 0, coupon_value: 0, total: total + priceDelta };
  }
  else { counters.blocked++; return res.status(409).json({ message: 'Thao tác ngoài phạm vi đọc của fixture.' }); }
  res.json({ success: true, data, source: 'fixture', local_only: true });
});
app.post('/api/ghn-orders', async (req, res) => {
  counters.createRequests++;
  const input = req.body || {}, key = String(input.idempotencyKey || ''), shopId = String(input.shopId || '');
  if (!key || !allowed.includes(shopId) || mode === 'DISABLED') return res.status(400).json({ message: 'Yêu cầu tạo thử không hợp lệ.' });
  const orderData = input.orderData || {};
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const previous = attempts.get(key);
  if (previous) {
    if (previous.fingerprint !== fingerprint) return res.status(409).json({ message: 'Mã yêu cầu đã dùng cho thông tin khác (giả lập).' });
    counters.replays++; return res.json({ success: true, data: previous.result });
  }
  const item = orderData.items?.[0], dimensions = ['length', 'width', 'height'];
  const expectedServiceType = Number(orderData.weight) < 20000 ? 2 : 5;
  const canonicalParcel = Array.isArray(orderData.items) && orderData.items.length === 1 && item?.name === packedParcelItemName(orderData.content) && Number(item.quantity) === 1 && Number(item.price) === 0
    && Number.isInteger(orderData.weight) && orderData.weight >= 1 && orderData.weight <= 50000
    && dimensions.every(field => Number.isInteger(orderData[field]) && orderData[field] >= 1 && orderData[field] <= 200 && Number(item[field]) === Number(orderData[field]))
    && Number(item.weight) === Number(orderData.weight) && Number(orderData.service_type_id) === expectedServiceType;
  if (!/^(?:0\d{9}|\+84\d{9})$/.test(String(orderData.to_phone || '')) || !String(orderData.to_name || '').trim() || Number(input.provinceId) !== 202 || Number(orderData.to_district_id) !== 1444 || orderData.to_ward_code !== '020308' || !canonicalParcel) return res.status(400).json({ message: 'Thông tin tạo đơn GHN không hợp lệ (giả lập).' });
  counters.dispatchedCreates++;
  const sequence = counters.dispatchedCreates;
  const row = { fingerprint, sequence, shopId, serviceId: orderData.service_id, serviceType: orderData.service_type_id, weight: item.weight, orderId: input.orderId || null, result: { attempt_status: nextCreateUnknown ? 'UNKNOWN' : 'SUCCESS', reference: `FIXTURE-REF-${String(sequence).padStart(4, '0')}`, request_key: key } };
  nextCreateUnknown = false;
  if (row.result.attempt_status === 'SUCCESS') created(row);
  attempts.set(key, row);
  // Capture the response immediately. A later command or request must not change
  // what an in-flight old dialog receives when its delay finally resolves.
  const result = structuredClone(row.result), delay = createsDelay;
  if (delay) await new Promise(resolve => setTimeout(resolve, 2500));
  res.json({ success: true, data: result });
});
app.get('/api/ghn-orders/recent', async (req, res) => {
  const result = structuredClone([...attempts.values()].filter(row => row.orderId === (req.query.orderId || null)).at(-1)?.result || null), delay = statusDelay;
  if (delay) await new Promise(resolve => setTimeout(resolve, 2500));
  res.json({ success: true, data: result });
});
app.get('/api/ghn-orders/:key', async (req, res) => {
  const row = attempts.get(req.params.key);
  if (!row) return res.status(404).json({ message: 'Không có yêu cầu thử này.' });
  const result = structuredClone(row.result), delay = statusDelay;
  if (delay) await new Promise(resolve => setTimeout(resolve, 2500));
  return res.json({ success: true, data: result });
});
app.post('/api/ghn-orders/:key/reconcile', async (req, res) => {
  counters.reconciles++;
  const row = attempts.get(req.params.key);
  if (!row) return res.status(404).json({ message: 'Không có yêu cầu thử này.' });
  if (reconcileSuccess) created(row);
  const result = structuredClone(row.result), delay = statusDelay;
  if (delay) await new Promise(resolve => setTimeout(resolve, 2500));
  res.json({ success: true, data: result });
});
app.post('/api/ghn-orders/:key/print', async (req, res) => {
  counters.printRequests++;
  const row = attempts.get(req.params.key);
  if (!row) return res.status(404).json({ message: 'Không có yêu cầu thử này.' });
  if (row.result.attempt_status !== 'SUCCESS') return res.status(409).json({ message: 'Chỉ in vận đơn đã lưu thành công (giả lập).' });
  if (mode === 'DISABLED' || !allowed.includes(row.shopId)) return res.status(403).json({ message: 'Cửa hàng thử không còn được phép in.' });
  const fail = printFailNext, delay = printDelay, key = req.params.key, code = row.result.order_code;
  printFailNext = false;
  if (delay) await new Promise(resolve => setTimeout(resolve, 2500));
  if (fail) return res.status(503).json({ message: 'Lỗi lấy phiếu in thử nghiệm; hãy thử lại.' });
  counters.printed.push({ key, code });
  const printUrl = 'https://online-gateway.ghn.vn/a5/public-api/printA5?token=fixture-only-' + String(row.sequence).padStart(4, '0');
  res.json({ success: true, data: { printUrl } });
});
app.get('/api/ghn-tracking', (req, res) => {
  const search = String(req.query.search || '').toLowerCase(), statuses = String(req.query.status || '').split(',').filter(Boolean);
  const filtered = [...trackingRows.values()].filter(row => (!statuses.length || statuses.includes(row.ghn_status)) && (!search || [row.ghn_order_code, row.customer_name, row.customer_phone, row.customer_address, row.internal_order_code].some(value => String(value || '').toLowerCase().includes(search))));
  const page = Math.max(1, Number(req.query.page) || 1), pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
  res.json({ rows: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize });
});
app.get('/api/ghn-tracking/by-order/:orderId', async (req, res) => {
  counters.linkReads++;
  if (!fixtureOrders.some(order => order.id === req.params.orderId)) return res.status(404).json({ message: 'Không có đơn CRM thử này.' });
  const result = structuredClone({ rows: orderTracking(req.params.orderId), orderCodes: orderCodes(req.params.orderId) });
  if (linkDelay) await new Promise(resolve => setTimeout(resolve, 2500));
  res.json(result);
});
app.put('/api/ghn-tracking/by-order/:orderId', async (req, res) => {
  counters.linkRequests++;
  const order = fixtureOrders.find(item => item.id === req.params.orderId);
  if (!order) return res.status(404).json({ message: 'Không có đơn CRM thử này.' });
  const fail = linkFail, conflict = linkConflict, delay = linkDelay;
  linkFail = false; linkConflict = false;
  if (delay) await new Promise(resolve => setTimeout(resolve, 2500));
  if (fail) return res.status(503).json({ message: 'Lỗi lưu liên kết thử nghiệm; dữ liệu cũ được giữ nguyên.' });
  const next = [...new Set(req.body?.orderCodes || [])].sort(), expected = [...new Set(req.body?.expectedOrderCodes || [])].sort();
  if (conflict || JSON.stringify(expected) !== JSON.stringify(orderCodes(order.id))) return res.status(409).json({ message: 'Danh sách vận đơn đã thay đổi; tải lại trước khi lưu (giả lập).' });
  if (next.length > 50 || next.some(code => !/^[A-Za-z0-9_-]{3,60}$/.test(code))) return res.status(400).json({ message: 'Mã GHN thử không hợp lệ.' });
  for (const code of next) {
    const existing = [...trackingRows.values()].find(row => row.ghn_order_code === code);
    if (existing?.order_id && existing.order_id !== order.id) return res.status(409).json({ message: 'Vận đơn đã gắn đơn khác (giả lập).' });
  }
  for (const row of orderTracking(order.id)) if (!next.includes(row.ghn_order_code)) {
    row.order_id = null; row.internal_order_code = null; counters.detached++;
  }
  for (const code of next) {
    let row = [...trackingRows.values()].find(item => item.ghn_order_code === code);
    if (row?.order_id === order.id) continue;
    if (!row) { row = fixtureTracking(code, { shopId: code.includes('456') ? '456' : '123' }); trackingRows.set(row.id, row); }
    row.order_id = order.id; row.internal_order_code = order.display_order_number || order.order_number;
  }
  res.json({ rows: orderTracking(order.id), orderCodes: orderCodes(order.id) });
});
app.post('/api/ghn-tracking', (req, res) => {
  counters.imports++;
  const code = String(req.body?.ghn_order_code || '').trim(), orderId = req.body?.order_id || null;
  if (importFailPartial && ++importPartialIndex % 2 === 0) return res.status(502).json({ message: 'Không nhập được mã thử này từ GHN giả lập; các mã khác không bị mất.' });
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(code)) return res.status(400).json({ message: 'Mã GHN thử không hợp lệ.' });
  if (orderId && !fixtureOrders.some(order => order.id === orderId)) return res.status(404).json({ message: 'Không có đơn thử.' });
  let row = [...trackingRows.values()].find(item => item.ghn_order_code === code);
  if (row?.order_id && orderId && row.order_id !== orderId) return res.status(409).json({ message: 'Vận đơn đã gắn đơn khác (giả lập).' });
  if (!row) { row = fixtureTracking(code, { orderId, shopId: code.includes('456') ? '456' : '123' }); trackingRows.set(row.id, row); }
  else if (orderId && !row.order_id) { row.order_id = orderId; row.internal_order_code = fixtureOrders.find(order => order.id === orderId).display_order_number; }
  res.json(row);
});
app.delete('/api/ghn-tracking/by-order/:orderId', (req, res) => {
  for (const row of orderTracking(req.params.orderId)) { trackingRows.delete(row.id); counters.deleted++; }
  res.json({ success: true });
});
app.delete('/api/ghn-tracking/:id', (req, res) => {
  if (!trackingRows.has(req.params.id)) return res.status(404).json({ message: 'Không có vận đơn thử.' });
  trackingRows.delete(req.params.id); counters.deleted++;
  res.json({ success: true });
});
app.post('/api/ghn-tracking/print', async (req, res) => {
  counters.trackingPrintRequests++;
  const ids = [...new Set(req.body?.ids || [])], fail = trackingPrintFail || printFailNext;
  trackingPrintFail = false; printFailNext = false;
  if (!ids.length || ids.length > 50 || ids.some(id => !trackingRows.has(id))) return res.status(400).json({ message: 'Chọn vận đơn thử hợp lệ để in.' });
  if (printDelay) await new Promise(resolve => setTimeout(resolve, 2500));
  if (fail) return res.status(503).json({ message: 'Lỗi lấy phiếu in tracking thử nghiệm; hãy thử lại.' });
  const groups = new Map();
  for (const id of ids) {
    const row = trackingRows.get(id), shopId = String(row.raw_data?.shop_id || '123');
    if (!groups.has(shopId)) groups.set(shopId, []);
    groups.get(shopId).push(row.ghn_order_code);
  }
  const documents = [...groups].map(([shopId, codes]) => ({ shopId, orderCodes: codes, printUrl: `https://online-gateway.ghn.vn/a5/public-api/printA5?token=fixture-tracking-only-${shopId}` }));
  counters.trackingPrinted.push(...documents.map(({ shopId, orderCodes: codes }) => ({ shopId, orderCodes: codes })));
  res.json({ success: true, data: { documents } });
});
app.post('/api/ghn-tracking/connection-check', (_req, res) => res.json({ configured: mode !== 'DISABLED', connected: mode !== 'DISABLED', message: 'Kết nối GHN giả lập, không gọi nhà cung cấp.', checked_at: new Date().toISOString() }));
app.post('/api/ghn-tracking/refresh', (req, res) => {
  const rows = req.body?.id ? [...trackingRows.values()].filter(row => row.id === req.body.id) : [...trackingRows.values()];
  const fail = refreshFailed;
  refreshFailed = false;
  res.json({ updated: fail ? 0 : rows.length, skipped: 0, failed: fail ? rows.length : 0, has_more: false, next_cursor: null, limit: 50, errors: fail ? rows.map(row => ({ orderCode: row.ghn_order_code, message: 'Lỗi cập nhật trạng thái giả lập; dữ liệu cũ được giữ nguyên.' })) : [] });
});
app.get('/api/orders', (_req, res) => res.json(hydrateOrders()));
app.get('/api/orders/stats', (_req, res) => res.json({ total: 2, pendingCount: 0, processingCount: 2, completedCount: 0, overdueCount: 0, totalReceivable: 360000, totalValue: 0 }));
app.get('/api/orders/duplicates', (_req, res) => res.json([]));
app.get('/api/users', (_req, res) => res.json([{ id: session.actor, user_id: session.actor, role: 'admin', first_name: 'Dữ liệu thử', last_name: 'GHN', email: credentials.email }]));
app.get('/api/users/:id/permissions', (_req, res) => res.json([]));
app.get('/api/payroll/capabilities', (_req, res) => res.json([]));
app.get('/api/local-snapshot/:table', (req, res) => res.json({ table: req.params.table, rows: [], total: 0, limit: 200, offset: 0 }));
app.get('/api/local-realtime', (_req, res) => res.json({ fixture: true }));
app.get('/api/ai/providers', (_req, res) => res.json(aiStatus()));
app.get('/api/fixture-state', (_req, res) => res.json(summary()));
app.use('/api', (req, res) => { if (req.method === 'GET') return res.json([]); counters.blocked++; res.status(409).json({ message: 'Thao tác ngoài phạm vi fixture thử nghiệm.' }); });

const result = await build({ root, configFile: false, envDir: false, publicDir: false, logLevel: 'warn', plugins: [react()], resolve: { alias: { '@': path.join(root, 'src') }, dedupe: ['react', 'react-dom', 'react/jsx-runtime'] }, define: { 'import.meta.env.VITE_BACKEND_MODE': JSON.stringify('local'), 'import.meta.env.VITE_LOCAL_API_URL': JSON.stringify(''), 'import.meta.env.VITE_LOCAL_DEMO_AUTH': JSON.stringify('false'), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('') }, build: { write: false, sourcemap: false, chunkSizeWarningLimit: 3000 } });
const output = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output);
const assets = new Map(output.map(item => ['/' + item.fileName, item.type === 'chunk' ? item.code : item.source]));
assert.ok(assets.has('/index.html'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
app.use((req, res) => {
  const name = assets.has(req.path) ? req.path : path.extname(req.path) ? null : '/index.html';
  if (!name) return res.status(404).end();
  res.type(mime[path.extname(name)] || 'application/octet-stream').send(assets.get(name));
});
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const check = await fetch(origin + '/api/external-integrations/ghn', { headers: { authorization: `Bearer ${session.token}` } });
assert.equal(check.status, 200);
assert.match(check.headers.get('content-security-policy'), /connect-src 'self'/);
console.log('GHN_ORDERS_UI_FIXTURE_READY ' + JSON.stringify({ origin, credentials, simulation: true, apiBase: 'same origin only', noDatabase: true, noProviderCalls: true, printHrefInspectionOnly: true, controls: ['state', 'next-create-unknown', 'reconcile-success', 'print-fail-next', 'print-delay', 'creates-delay', 'status-delay', 'attempt-delay-reset', 'linkfail', 'linkconflict', 'linkdelay', 'importfailpartial', 'printfail', 'nullcod', 'refreshfailed', 'tracking-reset', 'quotes-weight-service', 'quotes-fail-456', 'quotes-all-fail', 'quotes-no-services-456', 'quotes-delay-456', 'quotes-delay-123', 'quotes-shared-service-id', 'quotes-fail-next-123-2', 'quotes-fail-next-123-5', 'quotes-fail-next-456-2', 'quotes-fail-next-456-5', 'quotes-price-plus-1000', 'quotes-reset', 'stop'] }));
await new Promise(resolve => {
  let pending = '';
  process.stdin.setEncoding('utf8'); process.stdin.resume();
  process.stdin.on('data', data => {
    pending += data;
    const commands = pending.split(/[\r\n]+/); pending = commands.pop() || '';
    for (const command of commands) {
      if (command === 'stop') resolve();
      else if (command === 'linkfail') { linkFail = true; console.log('FIXTURE_LINK_FAIL_READY'); }
      else if (command === 'linkconflict') { linkConflict = true; console.log('FIXTURE_LINK_CONFLICT_READY'); }
      else if (command === 'linkdelay') { linkDelay = true; console.log('FIXTURE_LINK_DELAY_READY'); }
      else if (command === 'importfailpartial') { importFailPartial = true; importPartialIndex = 0; console.log('FIXTURE_IMPORT_FAIL_PARTIAL_READY'); }
      else if (command === 'printfail') { trackingPrintFail = true; console.log('FIXTURE_TRACKING_PRINT_FAIL_READY'); }
      else if (command === 'nullcod') { const row = trackingRows.get('tracking-FIXTURETRACK456'); if (row) row.cod_amount = null; console.log('FIXTURE_NULL_COD_READY FIXTURETRACK456'); }
      else if (command === 'refreshfailed') { refreshFailed = true; console.log('FIXTURE_REFRESH_FAILED_READY'); }
      else if (command === 'tracking-reset') { resetTracking(); linkFail = false; linkConflict = false; linkDelay = false; importFailPartial = false; importPartialIndex = 0; trackingPrintFail = false; refreshFailed = false; console.log('FIXTURE_TRACKING_RESET_READY'); }
      else if (command === 'next-create-unknown') { nextCreateUnknown = true; reconcileSuccess = false; console.log('FIXTURE_NEXT_CREATE_UNKNOWN_READY'); }
      else if (command === 'reconcile-success') { reconcileSuccess = true; console.log('FIXTURE_RECONCILE_SUCCESS_READY'); }
      else if (command === 'print-fail-next') { printFailNext = true; console.log('FIXTURE_PRINT_FAIL_NEXT_READY'); }
      else if (command === 'print-delay') { printDelay = true; console.log('FIXTURE_PRINT_DELAY_READY'); }
      else if (command === 'creates-delay') { createsDelay = true; console.log('FIXTURE_CREATES_DELAY_READY'); }
      else if (command === 'status-delay') { statusDelay = true; console.log('FIXTURE_STATUS_DELAY_READY'); }
      else if (command === 'attempt-delay-reset') { printFailNext = false; printDelay = false; createsDelay = false; statusDelay = false; console.log('FIXTURE_ATTEMPT_DELAY_RESET_READY'); }
      else if (command === 'quotes-weight-service') { quoteScenario = 'weight-service'; console.log('FIXTURE_QUOTES_WEIGHT_SERVICE_READY'); }
      else if (command === 'quotes-fail-456') { quoteFailure = '456'; console.log('FIXTURE_QUOTES_FAIL_456_READY'); }
      else if (command === 'quotes-all-fail') { quoteFailure = 'all'; console.log('FIXTURE_QUOTES_ALL_FAIL_READY'); }
      else if (command === 'quotes-no-services-456') { quoteNoServices = '456'; console.log('FIXTURE_QUOTES_NO_SERVICES_456_READY'); }
      else if (command === 'quotes-delay-456' || command === 'quotes-delay-123') { quoteDelayShop = command.endsWith('456') ? '456' : '123'; console.log('FIXTURE_QUOTES_DELAY_READY ' + quoteDelayShop); }
      else if (command === 'quotes-shared-service-id') { quoteSharedServiceId = true; console.log('FIXTURE_QUOTES_SHARED_SERVICE_ID_READY'); }
      else if (/^quotes-fail-next-(123|456)-(2|5)$/.test(command)) { quoteFailNextPair = command.slice('quotes-fail-next-'.length).replace('-', ':'); console.log('FIXTURE_QUOTES_FAIL_NEXT_READY ' + quoteFailNextPair); }
      else if (command === 'quotes-price-plus-1000') { quotePriceDelta += 1000; console.log('FIXTURE_QUOTES_PRICE_READY ' + quotePriceDelta); }
      else if (command === 'quotes-reset') { quoteScenario = 'default'; quoteFailure = ''; quoteDelayShop = ''; quoteNoServices = ''; quoteSharedServiceId = false; quoteFailNextPair = ''; quotePriceDelta = 0; console.log('FIXTURE_QUOTES_RESET_READY'); }
      else if (command === 'state') console.log('FIXTURE_STATE ' + JSON.stringify(summary()));
    }
  });
  process.stdin.on('end', resolve); process.once('SIGINT', resolve); process.once('SIGTERM', resolve);
});
server.closeAllConnections();
await new Promise(resolve => server.close(resolve));
console.log('FIXTURE_STOPPED in-memory mock and compiled SPA only; no database resources exist.');
