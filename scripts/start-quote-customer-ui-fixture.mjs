// Actual SPA, synthetic in-memory API. No .env, SQL, providers or operational data.
// Controls via stdin: state | stop. All credentials and customer records are fake.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';

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
const product = { id: 'fixture-product', name: 'Ga thử nghiệm', sku: 'TEST-GA', price: 100000, cost_price: null, in_stock: true, is_active: true, price_list_id: priceList.id, description: 'Dữ liệu giả lập' };
const quotes = [];
let attempts = 0;
const state = () => ({ simulation: true, attempts, saved: quotes.map(q => ({ customer_id: q.customer_id, customer: q.customer, items: q.items, quote_number: q.quote_number })), masterUnchanged: JSON.stringify(masters) === initialMasters });
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
app.get('/api/catalog/price-lists', (_req, res) => res.json([priceList]));
app.get('/api/catalog/products', (_req, res) => res.json([product]));
app.get('/api/quotes/stats', (_req, res) => res.json({ total: quotes.length, draft_count: quotes.length, approved_count: 0, sent_count: 0, rejected_count: 0, approved_value: 0 }));
app.get('/api/quotes/customer-suggestions', (req, res) => {
  const search = String(req.query.search || '').toLocaleLowerCase('vi').trim();
  const rows = masters.filter(row => [row.name, row.phone, row.email, row.address].some(value => value.toLocaleLowerCase('vi').includes(search)));
  // Deliberately return old search later to verify stale-response guards.
  if (search === 'cũ') return setTimeout(() => res.json([masters[1]]), 1500);
  res.json(rows);
});
app.get('/api/quotes', (_req, res) => res.json(quotes.map(q => ({ ...q, customers: q.customer, customer_name: q.customer?.name }))));
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
assert.ok(assets.has('/index.html'));
app.use((req, res) => {
  const name = assets.has(req.path) ? req.path : path.extname(req.path) ? null : '/index.html';
  if (!name) return res.status(404).end();
  res.type(({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(name)] || 'application/octet-stream').send(assets.get(name));
});
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
console.log('QUOTE_CUSTOMER_UI_FIXTURE_READY ' + JSON.stringify({ origin: 'http://127.0.0.1:' + server.address().port, credentials, simulation: true, noDatabase: true, noProviderCalls: true }));
process.stdin.setEncoding('utf8');
process.stdin.on('data', input => { for (const command of input.trim().split(/\r?\n/)) { if (command === 'state') console.log(JSON.stringify(state())); if (command === 'stop') server.close(() => process.exit(0)); } });
