// Actual SPA, synthetic in-memory API. No .env, SQL, providers or operational data.
// Controls via stdin: state | failA | failB | recover | slowA | fast | stop.
// Visit /fixture/draft or /fixture/inactive-draft after login to seed a recoverable draft.
// Visit /fixture/saved-quotes after login to seed old/custom/missing/invalid date previews.
// All credentials and customer records are fake.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { normalizeQuoteFilters, quoteFilterBounds } from '../server/quote-filters.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const credentials = { email: 'quote-customer@fixture.invalid', password: 'FixtureOnly!123' };
const session = { actor: 'fixture-quote-manager', token: 'synthetic-quote-customer-session', expires_at: new Date(Date.now() + 3600000).toISOString() };
const me = { user_id: session.actor, email: credentials.email, role: 'manager', first_name: 'Báo giá', last_name: 'Thử nghiệm', assigned_by: null, worker_id: null };
const masters = [
  { id: 'fixture-selected', name: 'Khách thử Liên Kết', phone: '0900000101', email: 'linked@fixture.invalid', address: 'Địa chỉ gốc thử nghiệm', is_active: true },
  { id: 'fixture-duplicate-a', name: 'Khách thử Trùng', phone: '0900000202', email: 'a@fixture.invalid', address: 'Địa chỉ thử A', is_active: true },
  { id: 'fixture-duplicate-b', name: 'Khách thử Trùng', phone: '0900000202', email: 'b@fixture.invalid', address: 'Địa chỉ thử B', is_active: true },
];
const initialMasters = JSON.stringify(masters);
const priceList = { id: 'fixture-price', name: 'Bảng giá thử nghiệm', year: 2026, status: 'active' };
const priceListB = { id: 'fixture-price-b', name: 'Bảng giá B thử nghiệm', year: 2026, status: 'active' };
const productB = { id: 'fixture-product-b', name: 'Gối thử nghiệm B', sku: 'TEST-B', price: 200000, cost_price: null, in_stock: true, is_active: true, price_list_id: priceListB.id, description: 'Danh mục B giả lập' };
const catalogFailures = new Set();
const catalogDelays = { [priceList.id]: 1500, [priceListB.id]: 75 };
const catalogRequests = [];
const product = { id: 'fixture-product', name: 'Ga thử nghiệm', sku: 'TEST-GA', price: 100000, cost_price: null, in_stock: true, is_active: true, price_list_id: priceList.id, description: 'Dữ liệu giả lập' };
const pickerProducts = [
  { id: 'picker-ga-exact', name: 'Ga chun trắng 25', sku: 'VCT250-1M-T', category: 'GA CHUN T250 TRẮNG TRƠN', price: 125000 },
  { id: 'picker-ga-second', name: 'Ga chun cao cấp trắng', sku: 'TEST-GA-2', category: 'VỎ GỐI', price: 225000 },
  { id: 'picker-ga-third', name: 'Ga chống thấm màu trắng khổ lớn rất dài dùng cho phòng khách sạn', sku: 'TEST-GA-3', category: 'GA CHUN T250 TRẮNG TRƠN', price: 325000 },
  { id: 'picker-long-sku', name: 'Vỏ chăn trắng cao cấp dành cho bộ phòng khách sạn rất dài', sku: 'TEST-250', category: 'VỎ GỐI', price: 425000 },
  { id: 'picker-rank-a1', name: 'Ga chun', sku: 'RANK-A1', category: 'GA CHUN T250 TRẮNG TRƠN', price: 1000 },
  { id: 'picker-rank-b1', name: 'Ga chun mới', sku: 'RANK-B1', category: 'VỎ GỐI', price: 2000 },
  { id: 'picker-rank-a2', name: 'Ga khác', sku: 'RANK-A2', category: 'GA CHUN T250 TRẮNG TRƠN', price: 3000 },
].map(row => ({ ...product, ...row, description: 'Sản phẩm tìm kiếm giả lập' }));
const quotes = [];
const quoteReadFailures = new Set();
const quoteRequests = [];
let quoteReadDelay = 100;
const fixtureAssignees = [{ id: 'fixture-assignee-a', name: 'Phụ trách A' }, { id: 'fixture-assignee-b', name: 'Phụ trách B' }];
const fixtureMembership = query => {
  const filters = normalizeQuoteFilters(query), bounds = quoteFilterBounds(filters);
  return quotes.filter(q => {
    const haystack = [q.quote_number, q.notes, ...['customerName','customerPhone','customerEmail','customerAddress'].map(key => q.quote_data?.[key])].filter(value => value != null).join(' ').toLocaleLowerCase('vi');
    const created = q.created_at ? Date.parse(q.created_at) : NaN;
    return (!filters.search || haystack.includes(filters.search)) && (!filters.status || q.status === filters.status)
      && (!filters.assigneeId || (filters.assigneeId === '__unassigned__' ? !q.assignee_id : q.assignee_id === filters.assigneeId))
      && (!bounds.from || created >= Date.parse(bounds.from)) && (!bounds.to || created < Date.parse(bounds.to));
  }).sort((a,b) => (b.created_at ? Date.parse(b.created_at) : -Infinity) - (a.created_at ? Date.parse(a.created_at) : -Infinity) || b.id.localeCompare(a.id));
};
const quoteRead = (req, res, stats) => {
  const offset = Number(req.query.offset || 0), limit = Number(req.query.limit || 50);
  const status = quoteReadFailures.has('session') ? 401 : quoteReadFailures.has(stats ? 'stats' : 'list') || (!stats && offset >= 50 && quoteReadFailures.has('next')) ? 503 : 200;
  try {
    const rows = fixtureMembership(req.query);
    const values = rows.filter(row => row.status === 'approved').reduce((sum,row) => sum + row.total_amount, 0);
    const response = stats ? { total: rows.length, draft_count: rows.filter(row => row.status === 'draft').length, sent_count: rows.filter(row => row.status === 'sent').length, approved_count: rows.filter(row => row.status === 'approved').length, approved_value: values } : rows.slice(offset,offset+limit).map(q => ({ ...q, customers: q.customer, assignees: fixtureAssignees.find(row => row.id === q.assignee_id), customer_name: q.customer?.name }));
    quoteRequests.push({ kind: stats ? 'stats' : 'list', query: req.query, status, total: rows.length, ids: stats ? undefined : response.map(row => row.id) });
    setTimeout(() => status === 200 ? res.json(response) : res.status(status).json({ message: status === 401 ? 'Phiên thử nghiệm đã hết hạn.' : 'Lỗi đọc báo giá giả lập.' }), quoteReadDelay);
  } catch (error) { res.status(400).json({ message: error.message }); }
};
let attempts = 0;
const state = () => ({ simulation: true, catalogFailures: [...catalogFailures], catalogDelays, catalogRequests, quoteReadFailures: [...quoteReadFailures], quoteRequests, records: quotes.length, attempts, saved: quotes.filter(q => !q.id.startsWith('fixture-list-')).map(q => ({ customer_id: q.customer_id, customer: q.customer, items: q.items, quote_number: q.quote_number })), masterUnchanged: JSON.stringify(masters) === initialMasters });
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; form-action 'self'; object-src 'none'");
  next();
});
app.post('/api/local-auth/login', (req, res) => req.body?.email === credentials.email && req.body?.password === credentials.password ? res.json(session) : res.status(401).json({ message: 'Chỉ dùng tài khoản fixture.' }));
app.post('/api/local-auth/logout', (_req, res) => res.json({ success: true }));
app.get('/api/fixture-state', (_req, res) => res.json(state()));
app.use('/api', (req, res, next) => req.headers.authorization === `Bearer ${session.token}` ? next() : res.status(401).json({ message: 'Phiên thử nghiệm không hợp lệ.' }));
app.get('/api/local-auth/me', (_req, res) => res.json(me));
app.get('/api/users/:id/permissions', (_req, res) => res.json([]));
app.get('/api/payroll/capabilities', (_req, res) => res.json([]));
// Login lands on the dashboard before the quote page is opened.
app.get('/api/dashboard/stats', (_req, res) => res.json({
  totalRevenue: 0, totalOrders: 0, totalCustomers: masters.length, totalQuotes: quotes.length, totalProducts: 1,
  pendingOrders: 0, approvedQuotes: 0, monthlyRevenue: 0, previousMonthRevenue: 0,
  monthlyOrders: 0, monthlyCustomers: 0, totalContracts: 0, monthlyExpenses: 0,
  activeWorkers: 0, attendanceEntries: 0, productionQuantity: 0, inventoryValue: 0, payrollRuns: 0,
}));
app.get('/api/catalog/price-lists', (_req, res) => res.json([priceList, priceListB]));
app.get('/api/catalog/products', (req, res) => {
  const id = String(req.query.priceListId || '');
  const failed = catalogFailures.has(id);
  const request = { id, failed, started: Date.now(), finished: null };
  catalogRequests.push(request);
  setTimeout(() => {
    request.finished = Date.now();
    if (failed) return res.status(503).json({ message: 'Lỗi tải danh mục giả lập; dùng recover rồi thử lại.' });
    res.json(id === priceList.id ? [product, ...pickerProducts] : id === priceListB.id ? [productB] : []);
  }, catalogDelays[id] || 0);
});
app.get('/api/quotes/stats', (req, res) => quoteRead(req, res, true));
app.get('/api/assignees', (_req, res) => res.json(fixtureAssignees));
app.get('/api/quotes/customer-suggestions', (req, res) => {
  const search = String(req.query.search || '').toLocaleLowerCase('vi').trim();
  const rows = masters.filter(row => [row.name, row.phone, row.email, row.address].some(value => value.toLocaleLowerCase('vi').includes(search)));
  // Deliberately return old search later to verify stale-response guards.
  if (search === 'cũ') return setTimeout(() => res.json([masters[1]]), 1500);
  res.json(rows);
});
app.get('/api/quotes', (req, res) => quoteRead(req, res, false));
app.get('/api/quotes/:id/quote-data', (req, res) => res.json({ quote_data: quotes.find(q => q.id === req.params.id)?.quote_data || null }));
app.post('/api/quotes', (req, res) => {
  attempts++;
  const body = req.body;
  if (!body.customer_id && body.customer?.name.includes('Trùng')) return res.status(409).json({ message: 'Có nhiều hồ sơ khách hàng phù hợp. Chọn một hồ sơ bên dưới để tiếp tục; thông tin và sản phẩm đã nhập được giữ nguyên.', code: 'QUOTE_CUSTOMER_CONFLICT', candidates: masters.slice(1) });
  if (body.customer_id && !masters.some(row => row.id === body.customer_id)) return res.status(400).json({ message: 'Khách fixture không hợp lệ.' });
  const row = { ...structuredClone(body), id: 'fixture-saved-' + (quotes.length + 1), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status: 'draft' };
  quotes.push(row);
  res.status(201).json(row);
});
app.get('/api/local-snapshot/:table', (_req, res) => res.json({ rows: [], total: 0 }));
app.get('/api/local-realtime', (_req, res) => res.json({ simulation: true }));
app.use('/api', (req, res) => req.method === 'GET' ? res.json([]) : res.status(409).json({ message: 'Thao tác ngoài phạm vi fixture.' }));

const result = await build({ root, configFile: false, envDir: false, publicDir: false, logLevel: 'warn', plugins: [react()], resolve: { alias: { '@': path.join(root, 'src') }, dedupe: ['react', 'react-dom', 'react/jsx-runtime'] }, define: { 'import.meta.env.VITE_BACKEND_MODE': JSON.stringify('local'), 'import.meta.env.VITE_LOCAL_API_URL': JSON.stringify(''), 'import.meta.env.VITE_LOCAL_DEMO_AUTH': JSON.stringify('false'), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('') }, build: { write: false, sourcemap: false, chunkSizeWarningLimit: 3000 } });
const assets = new Map((Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output).map(item => ['/' + item.fileName, item.type === 'chunk' ? item.code : item.source]));
app.get('/fixture/quote-list', (_req, res) => {
  for (let index = 0; index <= 70; index++) {
    const id = 'fixture-list-' + String(index).padStart(3, '0');
    if (quotes.some(quote => quote.id === id)) continue;
    const customerName = 'Khách danh sách ' + String(index).padStart(3, '0'), price = 100000 + index;
    const items = [{ id: id + '-line', name: 'Ga dữ liệu giả', sku: 'LIST-' + index, quantity: 1, price, total: price }];
    quotes.push({ id, quote_number: 'BG-LIST-' + String(index).padStart(3, '0'), status: index ? ['draft','sent','approved','rejected','expired'][index % 5] : 'draft', manager_id: session.actor,
      assignee_id: index % 3 === 0 ? null : fixtureAssignees[index % 2].id, price_list_id: priceList.id,
      customer: { name: customerName, phone: '0900' + String(index).padStart(6,'0'), email: 'list-' + index + '@fixture.invalid', address: 'Địa chỉ đã lưu ' + index },
      items, subtotal: price, vat_rate: 0, vat_amount: 0, include_vat: false, total_amount: price,
      created_at: index ? '2026-10-20T05:00:00.000Z' : '2020-01-01T05:00:00.000Z', updated_at: '2026-10-20T05:00:00.000Z', notes: 'Khách hàng: ' + customerName + '\nNgày hết hạn: 20/11/2026',
      quote_data: { customerName, customerPhone: '0900' + String(index).padStart(6,'0'), customerEmail: 'list-' + index + '@fixture.invalid', customerAddress: 'Địa chỉ đã lưu ' + index, items, subtotal: price, includeVAT: false, vatRate: 0, vatAmount: 0, total: price, totalAmount: price, payment1: 0, payment2: 0, remaining: price },
    });
  }
  res.redirect('/quotes');
});
app.get('/fixture/saved-quotes', (_req, res) => {
  for (const [suffix, expiry] of [['CUSTOM', '15/02/2020'], ['MISSING', ''], ['INVALID', '31/02/2020']]) {
    const id = 'fixture-old-' + suffix;
    if (quotes.some(quote => quote.id === id)) continue;
    const items = [{ id: 'fixture-line-' + suffix, originalProductId: product.id, name: product.name, sku: product.sku, price: 100000, quantity: 1, total: 100000 }];
    const contact = { name: 'Khách ngày ' + suffix, phone: '', email: '', address: '' };
    quotes.push({ id, quote_number: 'BG-OLD-' + suffix, status: 'draft', manager_id: session.actor, price_list_id: priceList.id, customer: contact,
      created_at: '2020-01-01T18:00:00.000Z', updated_at: '2020-01-02T00:00:00.000Z', items,
      subtotal: 100000, vat_rate: 0, vat_amount: 0, include_vat: false, total_amount: 100000,
      notes: 'Khách hàng: ' + contact.name + '\nNgày hết hạn: ' + expiry,
      quote_data: { title: 'BẢNG BÁO GIÁ NGÀY THỬ', customerName: contact.name, quoteDate: '2030-01-01T00:00:00Z', items, includeVAT: false, vatRate: 0, vatAmount: 0, subtotal: 100000, total: 100000, totalAmount: 100000, payment1: 0, payment2: 0 },
    });
  }
  res.redirect('/quotes');
});
app.get(['/fixture/draft', '/fixture/inactive-draft'], (req, res) => {
  const inactive = req.path.includes('inactive');
  const draft = {
    accountId: session.actor, customerId: null, customerName: 'Khách nháp thử nghiệm', savedAt: new Date().toISOString(),
    formData: { title: 'BẢNG BÁO GIÁ THỬ', quoteNumber: 'BG-FIXTURE-DRAFT', quoteDate: '2026-10-01T00:00:00.000Z', expiryDate: '2026-11-01T00:00:00.000Z', customerName: 'Khách nháp thử nghiệm', phone: '', email: '', address: '', priceList: inactive ? 'fixture-inactive-price' : priceList.id, responsible: '', includeVAT: false, vatRate: 8, payment1: 0, payment2: 0 },
    selectedProducts: [
      { id: 'fixture-catalog-line', originalProductId: product.id, name: product.name, sku: product.sku, description: product.description, specifications: '160 × 200', price: 100000, quantity: 1, total: 100000 },
      { id: 'temp-fixture-manual', name: 'Sản phẩm nhập tay thử nghiệm', sku: '', description: 'Dòng thủ công cần giữ', specifications: '180 × 220', price: 25000, quantity: 2, total: 50000 },
    ],
  };
  res.type('html').send('<!doctype html><meta charset="utf-8"><title>Nháp thử nghiệm</title><script>localStorage.setItem(' + JSON.stringify('quote-draft-autosave:' + session.actor) + ',' + JSON.stringify(JSON.stringify(draft)) + ');location.replace("/quotes");</script>');
});
assert.ok(assets.has('/index.html'));
app.use((req, res) => {
  const name = assets.has(req.path) ? req.path : path.extname(req.path) ? null : '/index.html';
  if (!name) return res.status(404).end();
  res.type(({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(name)] || 'application/octet-stream').send(assets.get(name));
});
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
console.log('QUOTE_CUSTOMER_UI_FIXTURE_READY ' + JSON.stringify({ origin: 'http://127.0.0.1:' + server.address().port, credentials, simulation: true, noDatabase: true, noProviderCalls: true, commands: ['state','failA','failB','recover','slowA','fast','failList','failNext','failStats','session401','slowList','stop'], draftPaths: ['/fixture/draft','/fixture/inactive-draft'], savedQuotesPath: '/fixture/saved-quotes', listPath: '/fixture/quote-list', priceLists: { A: priceList.id, B: priceListB.id } }));
process.stdin.setEncoding('utf8');
process.stdin.on('data', input => {
  for (const command of input.trim().split(/\r?\n/)) {
    if (command === 'failA') catalogFailures.add(priceList.id);
    if (command === 'failB') catalogFailures.add(priceListB.id);
    if (command === 'recover') { catalogFailures.clear(); quoteReadFailures.clear(); }
    if (command === 'failList') quoteReadFailures.add('list');
    if (command === 'failNext') quoteReadFailures.add('next');
    if (command === 'failStats') quoteReadFailures.add('stats');
    if (command === 'session401') quoteReadFailures.add('session');
    if (command === 'slowList') quoteReadDelay = 1500;
    if (command === 'slowA') catalogDelays[priceList.id] = 3000;
    if (command === 'fast') { quoteReadDelay = 0; catalogDelays[priceList.id] = 0; catalogDelays[priceListB.id] = 0; }
    if (command === 'stop') server.close(() => process.exit(0));
    else console.log(JSON.stringify(state()));
  }
});
