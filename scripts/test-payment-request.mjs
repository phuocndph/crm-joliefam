// Actual component/hook regressions with synthetic in-memory sources. No network or business writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as docx from 'docx';
import JSZip from 'jszip';
import * as payment from '../src/lib/payment-request.ts';
import { contractDateLabel } from '../src/lib/contract-calculation.ts';
import { savedSellerValue } from '../src/lib/contract-document.ts';
import { syncContractNumberInOverrides } from '../src/lib/contractUtils.ts';

const contract = { id: 'contract-a', contract_number: 'HD-A', contract_date: '2026-10-01', total_amount: 100000000, deposit_amount: 70000000,
  order_id: 'order-a', seller_info: { company_name: 'Xưởng A', address: 'Địa chỉ: Địa chỉ: Kho A', representative: 'Người A' }, buyer_info: { company_name: 'Khách B' }, document_overrides: {} };
const source = (advance = 70000000, total = 100000000, extra = {}) => ({ ...structuredClone(contract), total_amount: total, deposit_amount: advance, ...extra });
let groups = 0;
const check = async (label, run) => { await run(); groups++; console.log('PASS payment-request: ' + label); };
await check('exact amount uses agreed total minus advance, independent of receipts, order links and percentages', () => {
  for (const [advance, remaining] of [[0, 100000000], [70000000, 30000000], [80000000, 20000000]]) {
    const v = payment.paymentRequestFinancialView({ ...contract, deposit_amount: 999 }, source(advance, 100000000, { order_id: null, paid: 123, deposit_percentage: 99 }));
    assert.equal(v.advance, advance); assert.equal(v.remaining, remaining); assert.equal(v.ready, true);
  }
  const historical = source(20000000, 81761400, { order_id: null, deposit_percentage: 70, payment_percentage: 70 });
  assert.equal(payment.paymentRequestFinancialView(contract, historical).remaining, 61761400);
  assert.equal(payment.paymentRequestFinancialView(contract, { ...historical, order_total: 1 }).total, 81761400);
  assert.equal(payment.paymentRequestFinancialView(contract, { ...historical, order_id: 'changed', deposit_percentage: 0 }).fingerprint, payment.paymentRequestFinancialView(contract, historical).fingerprint);
  assert.equal(payment.paymentRequestFinancialView(contract).ready, false);
});
await check('explicit zero, equal total, missing/malformed advances and stale identities are distinguished safely', () => {
  const equal = payment.paymentRequestFinancialView(contract, source(100000000));
  assert.equal(equal.remaining, 0); assert.equal(equal.ready, false); assert.equal(equal.noRemaining, true);
  assert.equal(equal.reason, 'Không có khoản thanh toán còn lại theo thỏa thuận.'); assert.ok(!equal.reason.includes('thanh toán đủ'));
  for (const advance of [undefined, null, '', ' ', -1, '-1', '1,000', 'invalid', Infinity, true, 100000001]) {
    const v = payment.paymentRequestFinancialView(contract, { ...source(), deposit_amount: advance }); assert.equal(v.ready, false, String(advance)); assert.equal(v.remaining, null); assert.equal(v.noRemaining, false);
  }
  const absent = source(); delete absent.deposit_amount; assert.equal(payment.paymentRequestFinancialView(contract, absent).ready, false);
  assert.equal(payment.paymentRequestFinancialView(contract, source('0')).remaining, 100000000);
  for (const extra of [{ id: 'other' }, { contract_number: 'HD-CHANGED' }]) assert.equal(payment.paymentRequestFinancialView(contract, source(1, 100, extra)).ready, false);
  for (const total of [null, undefined, '', -1, 'broken']) assert.equal(payment.paymentRequestFinancialView(contract, { ...source(), total_amount: total }).ready, false);
});
await check('decimal subtraction is exact before numeric projection and date rules retain Vietnam business day', () => {
  for (const [total, advance, expected] of [['0.3', '0.1', 0.2], ['1.01', '0.999999', 0.010001], ['123.45', '10.2', 113.25], ['100000000.000001', '0.000001', 100000000]]) {
    const decimal = payment.paymentRequestFinancialView(contract, source(advance, total)); assert.equal(decimal.ready, true); assert.equal(decimal.remaining, expected);
  }
  assert.equal(payment.paymentRequestCurrency(113.25), '113,25 ₫');
  assert.equal(payment.paymentRequestToday(new Date('2026-10-27T17:30:00Z')), '2026-10-28');
  assert.equal(payment.paymentRequestDateValid('2026-02-30'), false);
});

const raw = await readFile(new URL('../src/components/PaymentRequestDialog.tsx', import.meta.url), 'utf8');
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None } }).outputText;
const elements = (node, match) => !node || typeof node !== 'object' ? [] : [...(match(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(c => elements(c, match))];
const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node) : React.Children.toArray(node?.props?.children).map(textOf).join('');
const button = (tree, name) => { const n = elements(tree, n => n.type === 'Button' && textOf(n) === name)[0]; assert.ok(n, 'button ' + name); return n; };
const input = (tree, id) => { const n = elements(tree, n => ['Input', 'Textarea'].includes(n.type) && n.props.id === id)[0]; assert.ok(n, 'input ' + id); return n; };
const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
function harness(initial = source(), overrides = {}) {
  let cursor = 0, slots = [], pending, effects, gate;
  const h = { source: initial, next: null, error: null, fetching: false, isPending: false, refetchCount: 0, writes: [], toasts: [], exports: [], pdf: [], print: [], windows: [],
    settings: { companyName: 'Settings', address: 'Settings address', phone: '', bankInfo: '', taxCode: '' },
    props: { open: true, onOpenChange() {}, contract: { ...structuredClone(contract), document_overrides: overrides } },
    defer() { gate = {}; gate.promise = new Promise(r => { gate.resolve = r; }); return gate; } };
  if (h.source) h.source = { ...h.source, document_overrides: overrides };
  const setter = (s, v) => { slots[s] = typeof v === 'function' ? v(slots[s]) : v; pending = true; };
  const context = vm.createContext({ React, console, ...payment, contractDateLabel, savedSellerValue, syncContractNumberInOverrides, ...docx,
    DocxTable: docx.Table, DocxTableRow: docx.TableRow, DocxTableCell: docx.TableCell,
    useRef(v) { const i = cursor++; if (!(i in slots)) slots[i] = { current: v }; return slots[i]; },
    useState(v) { const i = cursor++; if (!(i in slots)) slots[i] = typeof v === 'function' ? v() : v; return [slots[i], v => setter(i, v)]; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    useTemplateSettings: () => ({ settings: h.settings }), useToast: () => ({ toast: t => h.toasts.push(t) }), useQueryClient: () => ({ invalidateQueries() {} }),
    usePaymentRequestContract: () => ({ data: h.source, isError: Boolean(h.error), isFetching: h.fetching, isPending: h.isPending, async refetch() {
      h.refetchCount++; if (gate) { const wait = gate; gate = null; await wait.promise; }
      if (h.next) { h.source = h.next; h.next = null; } return { data: h.error ? undefined : h.source, error: h.error };
    } }),
    isLocalBackend: () => true, localApi: { async updateContract(...args) { h.writes.push(args); } }, supabase: { from() { throw Error('Unexpected remote'); } },
    saveAs: (blob, name) => h.exports.push({ blob, name }), exportElementToPDF: async (element, name) => h.pdf.push({ element, name }),
    window: { open() { const w = { closed: false, document: { write: html => h.print.push(html), close() {} }, print() { w.printed = true; }, close() { w.closed = true; } }; h.windows.push(w); return w; } },
  });
  for (const name of ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'Button', 'Input', 'Label', 'Textarea', 'Accordion', 'AccordionContent', 'AccordionItem', 'AccordionTrigger', 'Switch', 'OnlineStampSignature', 'Printer', 'FileDown', 'FileText', 'Save', 'RotateCcw', 'RefreshCw']) context[name] = name;
  context.OnlineStampSignature = () => null;
  vm.runInContext(compile(raw.replace(/^import .*;\r?\n/gm, '').replace('export const PaymentRequestDialog', 'const PaymentRequestDialog')) + '\nglobalThis.Component=PaymentRequestDialog;', context);
  h.render = () => { let tree, rounds = 0; do { assert.ok(rounds++ < 12, 'render settles'); pending = false; cursor = 0; effects = []; tree = context.Component(h.props); effects.forEach(fn => fn()); } while (pending); return tree; };
  h.preview = tree => elements(tree, n => n.type === 'div' && n.props.style?.fontFamily)[0];
  h.change = (id, value) => input(h.render(), id).props.onChange({ target: { value } });
  h.prepare = () => { const tree = h.render(), preview = h.preview(tree); preview.ref.current = { innerHTML: renderToStaticMarkup(preview) }; return tree; };
  h.unmount = () => { for (const slot of slots) if (typeof slot?.cleanup === 'function') slot.cleanup(); };
  return h;
}

await check('actual dialog has only read-only final finances and ignores legacy full/custom amounts and labels', () => {
  for (const phase of ['full', 'custom', 'deposit', 'remaining']) {
    const h = harness(source(), { payment_request: { phase, amount: 999999999, row1_amount: 1, row1_label: 'WRONG', row2_label: 'WRONG', notes: 'Keep notes' } }), tree = h.render();
    assert.equal(input(tree, 'payment-total').props.value, '100.000.000 ₫'); assert.equal(input(tree, 'payment-remaining').props.value, '30.000.000 ₫');
    for (const id of ['payment-total', 'payment-advance', 'payment-remaining']) assert.equal(input(tree, id).props.readOnly, true);
    assert.equal(input(tree, 'payment-notes').props.value, 'Keep notes'); assert.ok(!textOf(h.preview(tree)).includes('WRONG'));
    assert.equal(elements(tree, n => ['Select', 'CurrencyInput'].includes(n.type)).length, 0);
  }
});
await check('only exact old canned introductions migrate; custom prose, closing and saved dates survive', () => {
  const lead = `Căn cứ Hợp đồng số HD-A ký ngày ${contractDateLabel(contract.contract_date)} giữa hai bên về việc cung cấp hàng hóa, Xưởng A kính đề nghị Quý Công ty `;
  const receiptIntro = `${lead}thanh toán phần giá trị còn lại theo điều khoản giao nhận và thanh toán của hợp đồng, sau khi trừ các khoản đã thanh toán theo chứng từ thu, cụ thể như sau:`;
  const headIntro = `Căn cứ Hợp đồng số HD-A ký ngày ${new Date(contract.contract_date).toLocaleDateString('vi-VN')} giữa hai bên về việc cung cấp hàng hóa, Xưởng A kính đề nghị Quý Công ty thanh toán số tiền theo bảng chi tiết dưới đây:`;
  for (const intro of [receiptIntro, headIntro]) {
    const h = harness(source(), { payment_request: { calculation_version: 2, intro, closing: 'Custom closing', request_date: '2026-11-10' } }), tree = h.render();
    const preview = textOf(h.preview(tree)); assert.ok(preview.includes('thanh toán số tiền còn lại sau khi nhận hàng theo điều khoản thanh toán đã thỏa thuận'));
    assert.ok(!preview.includes('chứng từ thu')); assert.ok(preview.includes('Custom closing')); assert.equal(input(tree, 'payment-date').props.value, '2026-11-10');
  }
  const custom = receiptIntro + ' Thỏa thuận riêng của khách.';
  const h = harness(source(), { payment_request: { intro: custom, closing: 'Custom closing' } }); assert.ok(textOf(h.preview(h.render())).includes(custom));
});
await check('missing, invalid, fetching, error, no remainder and invalid date block every action without requiring linked orders', async () => {
  const cases = [harness(null), harness({ ...source(), deposit_amount: null }), harness(source(100000000)), harness(source(120000000))];
  const fetching = harness(); fetching.fetching = true; cases.push(fetching);
  const failed = harness(); failed.error = Error('Denied'); cases.push(failed);
  const invalid = harness(); invalid.render(); invalid.change('payment-date', '2026-02-30'); cases.push(invalid);
  for (const h of cases) for (const name of ['Lưu', 'In', 'Xuất PDF', 'Xuất Word']) assert.equal(button(h.render(), name).props.disabled, true, name);
  const h = cases[0]; for (const name of ['Lưu', 'In', 'Xuất PDF', 'Xuất Word']) await button(h.prepare(), name).props.onClick();
  assert.equal(h.writes.length + h.print.length + h.exports.length + h.pdf.length, 0); assert.equal(h.windows[0].closed, true);
  const historical = harness(source(20000000, 81761400, { order_id: null, deposit_percentage: 70 }));
  for (const name of ['Lưu', 'In', 'Xuất PDF', 'Xuất Word']) assert.equal(button(historical.render(), name).props.disabled, false);
  assert.equal(input(historical.render(), 'payment-remaining').props.value, '61.761.400 ₫');
  assert.ok(!textOf(historical.render()).includes('Cần liên kết')); assert.ok(!textOf(historical.preview(historical.render())).includes('chứng từ thu'));
});
await check('dirty prose survives late contract/settings response and resets only on reopen', () => {
  const h = harness(); h.render(); h.change('payment-notes', 'Unsaved edits'); h.change('payment-date', '2026-11-10'); h.settings = { ...h.settings, companyName: 'New settings' };
  h.source = source(80000000, 100000000, { document_overrides: { payment_request: { notes: 'Remote prose' } } });
  let tree = h.render(); assert.equal(input(tree, 'payment-notes').props.value, 'Unsaved edits'); assert.equal(input(tree, 'payment-date').props.value, '2026-11-10'); assert.equal(input(tree, 'payment-remaining').props.value, '20.000.000 ₫');
  h.props.open = false; h.render(); h.props.open = true; tree = h.render(); assert.equal(input(tree, 'payment-notes').props.value, 'Remote prose');
});
await check('every output/save refetches and stops changed money; repeat click uses reviewed amount', async () => {
  for (const name of ['Lưu', 'In', 'Xuất PDF', 'Xuất Word']) for (const next of [source(80000000), source(70000000, 110000000)]) {
    const h = harness(); const tree = h.prepare(); h.next = next; await button(tree, name).props.onClick();
    assert.equal(h.writes.length + h.print.length + h.exports.length + h.pdf.length, 0, name); assert.equal(h.refetchCount, 1);
    assert.ok(h.toasts.some(t => /Số tiền đã thay đổi/.test(t.description || ''))); if (name === 'In') assert.equal(h.windows[0].closed, true);
    await button(h.prepare(), name).props.onClick(); assert.equal(h.refetchCount, 2); assert.equal(h.writes.length + h.print.length + h.exports.length + h.pdf.length, 1, name);
  }
  const noMoneyChange = harness(); noMoneyChange.next = source(70000000, 100000000, { order_id: null, deposit_percentage: 20 });
  await button(noMoneyChange.prepare(), 'Lưu').props.onClick(); assert.equal(noMoneyChange.writes.length, 1);
});
await check('save merges latest observed unrelated overrides, canonical numbers and preserves saved prose against late stale source', async () => {
  const h = harness(); h.render(); h.change('payment-notes', 'Saved notes');
  h.next = source(70000000, 100000000, { document_overrides: { handover_report: { note: 'Latest handover' }, advance_request: { note: 'Latest advance' } } });
  await button(h.prepare(), 'Lưu').props.onClick(); const saved = h.writes[0][1].document_overrides;
  assert.equal(saved.handover_report.note, 'Latest handover'); assert.equal(saved.advance_request.note, 'Latest advance');
  assert.equal(saved.payment_request.amount, 30000000); assert.equal(saved.payment_request.row2_amount, 70000000);
  assert.equal(saved.payment_request.row2_label, 'Tạm ứng theo hợp đồng'); assert.equal(saved.payment_request.calculation_version, 3); assert.equal(saved.payment_request.calculation_basis, 'contract_terms');
  h.settings = { ...h.settings }; assert.equal(input(h.render(), 'payment-notes').props.value, 'Saved notes');
  button(h.render(), 'Đặt lại bản nháp').props.onClick(); assert.equal(h.writes.length, 1);
});
await check('busy guard prevents duplicate submissions and closing cancels pending preflight', async () => {
  const h = harness(); const tree = h.prepare(), gate = h.defer(); const first = button(tree, 'Lưu').props.onClick(); const duplicate = button(tree, 'Lưu').props.onClick();
  assert.equal(h.refetchCount, 1); gate.resolve(); await Promise.all([first, duplicate]); assert.equal(h.writes.length, 1);
  const closed = harness(); const pending = closed.defer(), request = button(closed.prepare(), 'Xuất PDF').props.onClick(); closed.props.open = false; closed.render(); pending.resolve(); await request; assert.equal(closed.pdf.length, 0);
});
await check('true route-parent unmount cancels pending preflight for every action without an open=false render', async () => {
  for (const name of ['Lưu', 'In', 'Xuất PDF', 'Xuất Word']) {
    const h = harness(), gate = h.defer(), request = button(h.prepare(), name).props.onClick();
    assert.equal(h.props.open, true); h.unmount(); gate.resolve(); await request;
    assert.equal(h.writes.length + h.print.length + h.exports.length + h.pdf.length, 0, name);
    if (name === 'In') assert.equal(h.windows[0].closed, true);
  }
});
await check('preview, print, PDF and real in-memory DOCX use identical financial rows with decimal values', async () => {
  const h = harness(source(10.2, 123.45)); const tree = h.prepare(), preview = textOf(h.preview(tree));
  for (const name of ['In', 'Xuất PDF', 'Xuất Word']) await button(h.prepare(), name).props.onClick();
  assert.equal(h.print.length, 1); assert.equal(h.pdf.length, 1); assert.equal(h.exports.length, 1);
  const zip = await JSZip.loadAsync(await h.exports[0].blob.arrayBuffer()), xml = await zip.file('word/document.xml').async('string');
  for (const text of [...Object.values(payment.paymentRequestLabels), '123,45 ₫', '10,2 ₫', '113,25 ₫']) { assert.ok(preview.includes(text), text); assert.ok(xml.includes(text), text); assert.ok(h.print[0].includes(text), text); }
  assert.ok(!preview.includes('Địa chỉ: Địa chỉ:'));
});

await check('actual contract-only hook reads fresh local/hosted permitted contracts without summary/RPC and honors auth lifecycle', async () => {
  const hook = await readFile(new URL('../src/hooks/useContracts.ts', import.meta.url), 'utf8');
  let local = true, rows = [source(20000000, 81761400, { order_id: null, deposit_percentage: 70 })], auth = { user: { id: 'user-a' }, isReady: true }, remoteError = null;
  const calls = [], forbidden = [];
  const chain = {
    select(columns) { calls.push(['select', columns]); return chain; },
    eq(field, value) { calls.push(['eq', field, value]); return chain; },
    async single() { calls.push(['single']); return { data: rows[0] || null, error: remoteError }; },
  };
  const context = vm.createContext({ useAuthReady: () => auth, useQuery: opts => opts, isLocalBackend: () => local,
    localApi: { async contracts() { calls.push(['local-contracts']); return rows; }, contractPaymentSummary() { forbidden.push('summary'); throw Error('Unexpected receipt summary'); } },
    supabase: { from(table) { calls.push(['from', table]); return chain; }, rpc() { forbidden.push('rpc'); throw Error('Unexpected RPC'); } } });
  vm.runInContext(compile(hook.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')) + '\nglobalThis.contractQuery=usePaymentRequestContract;', context);
  const q = context.contractQuery('contract-a', true); assert.equal(q.staleTime, 0); assert.equal(q.refetchOnMount, 'always'); assert.equal(q.refetchOnWindowFocus, true); assert.equal(q.enabled, true);
  assert.equal(q.queryKey.join('|'), 'payment-request-contract|user-a|contract-a');
  const data = await q.queryFn(); assert.equal(data.order_id, null); assert.equal(payment.paymentRequestFinancialView(contract, data).remaining, 61761400); assert.deepEqual(calls, [['local-contracts']]);
  rows = []; calls.length = 0; await assert.rejects(q.queryFn(), /Không tìm thấy/); assert.deepEqual(calls, [['local-contracts']]);
  local = false; rows = [source(0, 100, { customers: { name: 'Hosted customer' } })]; calls.length = 0;
  const hosted = context.contractQuery('contract-a', true); assert.equal((await hosted.queryFn()).customers.name, 'Hosted customer');
  assert.deepEqual(calls, [['from', 'contracts'], ['select', '*, customers (name, email, phone, address, company)'], ['eq', 'id', 'contract-a'], ['single']]);
  remoteError = Error('Permission denied'); await assert.rejects(hosted.queryFn(), /Permission denied/); remoteError = null;
  rows = []; await assert.rejects(hosted.queryFn(), /Không tìm thấy/);
  assert.equal(context.contractQuery('contract-a', false).enabled, false); assert.equal(context.contractQuery(undefined, true).enabled, false);
  auth = { user: null, isReady: true }; assert.equal(context.contractQuery('contract-a', true).enabled, false);
  auth = { user: { id: 'user-b' }, isReady: false }; assert.equal(context.contractQuery('contract-a', true).enabled, false);
  auth.isReady = true; assert.equal(context.contractQuery('contract-a', true).queryKey[1], 'user-b'); assert.deepEqual(forbidden, []);
});

await check('actual hook fetches current contract before receipts, is always fresh, honors closed/auth state and preserves unknown', async () => {
  const hook = await readFile(new URL('../src/hooks/useContracts.ts', import.meta.url), 'utf8');
  const calls = []; let rows = [structuredClone(contract)], known = false, auth = { user: { id: 'user-a' }, isReady: true };
  const context = vm.createContext({ useAuthReady: () => auth, useQuery: opts => opts, isLocalBackend: () => true,
    localApi: { async contracts() { calls.push('contract'); return rows; }, async contractPaymentSummary() { calls.push('receipt'); return { known, paid: known ? 70000000 : null, remaining: known ? 30000000 : null, reason: 'Unknown' }; } } });
  vm.runInContext(compile(hook.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')) + '\nglobalThis.summary=useContractPaymentSummary;', context);
  let query = context.summary('contract-a', true); assert.equal(query.staleTime, 0); assert.equal(query.refetchOnMount, 'always'); assert.equal(query.enabled, true);
  const unknown = await query.queryFn(); assert.equal(unknown.known, false); assert.equal(unknown.paid, null); assert.equal(unknown.contract.id, contract.id); assert.deepEqual(calls, ['contract', 'receipt']);
  known = true; calls.length = 0; query = context.summary('contract-a', true); assert.equal((await query.queryFn()).paid, 70000000);
  assert.equal(context.summary('contract-a', false).enabled, false); auth = { user: null, isReady: true }; assert.equal(context.summary('contract-a', true).enabled, false);
  rows = []; calls.length = 0; await assert.rejects(query.queryFn(), /Không tìm thấy/); assert.deepEqual(calls, ['contract']);
});
console.log(`PASS ${groups}/${groups} payment request groups; no network/database access.`);
