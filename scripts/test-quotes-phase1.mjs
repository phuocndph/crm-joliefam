// Execute actual TSX handlers/effects and the full document helper with synthetic state.
// No browser driver, environment files, API, database or image/provider requests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateQuote } from '../src/lib/quote-calculation.ts';
import { buildQuotePdfHtml, escapeQuoteHtml, safeQuoteImageUrl } from '../src/lib/quote-document.ts';
import { quoteCalendarDate } from '../src/lib/quote-dates.ts';

const parse = async file => {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const initializers = new Map(), effects = [], jsx = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) initializers.set(node.name.text, node.initializer.getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push({ body: node.arguments[0].getText(ast), deps: node.arguments[1]?.getText(ast) || '' });
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) jsx.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return { source, ast, initializers, effects, jsx };
};
const formCode = await parse('../src/components/CreateQuoteForm.tsx');
const previewCode = await parse('../src/components/QuotePreviewDialog.tsx');
const compile = (name, body) => ts.transpileModule(`globalThis.${name} = ${body};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const plain = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let n = 0; n < 16; n++) await Promise.resolve(); };
const originalLines = [
  { id: 'catalog-instance', originalProductId: 'product-a', name: 'Ga catalog', sku: 'A', description: 'Vải A', specifications: '160 × 200', price: 100000, quantity: 1, total: 100000, selectedImage: '/fixture/a.png' },
  { id: 'temp-manual', name: 'Dòng thủ công', sku: '', description: 'Vải thủ công', specifications: '180 × 220', price: 25000, quantity: 2, total: 50000 },
];
let checks = 0;
const check = async (label, run) => { await run(); console.log('PASS quotes Phase 1: ' + label); checks++; };
const catalogEffect = formCode.effects.find(effect => effect.deps.includes('selectedPriceListId') && effect.body.includes('loadProducts'));
const lifetimeEffect = formCode.effects.find(effect => effect.body.includes('productsMounted.current = true'));
assert.ok(catalogEffect && lifetimeEffect, 'catalog and mounted lifecycle effects are present');

function harness({ local = true } = {}) {
  const pending = [], notifications = [], values = { priceList: '', includeVAT: false, vatRate: 8, payment1: 0, payment2: 0 };
  const context = {
    React, Date, console, products: [], productsPriceListId: '', productsLoading: false, productsError: '', selectedProducts: [],
    productsMounted: { current: true }, productsRequest: { current: 0 }, selectedPriceListId: '',
    selectedCustomerId: null, currentUser: { id: 'fixture-user' }, customerAccount: { current: 'fixture-user' }, accountChanged: false, initialData: null,
    selectedIdentityName: { current: '' }, showDraftRecovery: true, savedDraft: null,
    form: { getValues: key => key ? values[key] : values, reset: next => { Object.assign(values, next); context.selectedPriceListId = values.priceList; } },
    useCallback: callback => callback, isLocalBackend: () => local, toast: value => notifications.push(value), quoteCalendarDate,
    localApi: { catalogProducts: query => { const request = deferred(); pending.push({ ...request, id: query.priceListId }); return request.promise; } },
  };
  context.supabase = {
    from: () => {
      const chain = { select: () => chain, eq: () => chain, order: () => context.localApi.catalogProducts({ priceListId: values.priceList }).then(data => ({ data, error: null })) };
      return chain;
    },
    rpc: () => { const request = deferred(); pending.push({ ...request, id: values.priceList, rpc: true }); return request.promise; },
  };
  for (const name of new Set(formCode.source.match(/\bset[A-Z][A-Za-z0-9_]+(?=\()/g))) {
    if (name === 'setTimeout') continue;
    const key = name[3].toLowerCase() + name.slice(4);
    context[name] = value => { context[key] = typeof value === 'function' ? value(context[key]) : value; };
  }
  vm.createContext(context);
  for (const name of ['invalidateProductsRequest', 'loadProducts', 'restoreDraft']) vm.runInContext(compile(name, formCode.initializers.get(name)), context);
  vm.runInContext(compile('catalogEffect', catalogEffect.body), context);
  vm.runInContext(compile('lifetimeEffect', lifetimeEffect.body), context);
  let cleanup = () => {};
  const unmount = context.lifetimeEffect();
  const select = id => { cleanup(); values.priceList = id; context.selectedPriceListId = id; cleanup = context.catalogEffect(); };
  const invariant = () => {
    // Also execute any catalog-dependent effects added later, so reintroducing the
    // old catalog filter fails against actual effect behavior rather than a string assertion.
    for (const effect of formCode.effects.filter(row => row !== catalogEffect && /^\[products(?:,|\])/.test(row.deps))) {
      vm.runInContext(compile('dependentEffect', effect.body), context); context.dependentEffect();
    }
    assert.deepEqual(plain(context.selectedProducts), originalLines, 'all fields, order, manual and catalog lines survive');
    assert.equal(calculateQuote({ items: context.selectedProducts }).total, 150000, 'restored total is preserved');
  };
  return { context, values, pending, select, unmount, invariant, notifications };
}

await check('draft restoration preserves complete manual/catalog snapshot through load, error, retry, list change and clear', async () => {
  const h = harness();
  h.context.savedDraft = { accountId: 'fixture-user', formData: { priceList: 'A', customerName: 'Khách thử', quoteDate: '2026-10-01', expiryDate: '2026-11-01' }, selectedProducts: structuredClone(originalLines) };
  h.context.restoreDraft(); h.invariant();
  h.select(h.values.priceList); h.invariant();
  assert.equal(h.context.productsLoading, true);
  h.pending[0].reject(new Error('synthetic failure')); await settle();
  h.invariant(); assert.equal(h.context.productsLoading, false); assert.match(h.context.productsError, /Không thể tải/);
  const retry = h.context.loadProducts('A'); assert.equal(h.context.productsError, '');
  h.pending[1].resolve([{ id: 'product-a' }]); await retry; h.invariant();
  h.select('B'); assert.deepEqual(plain(h.context.products), [], 'old catalog clears at request start'); h.invariant();
  h.pending[2].resolve([{ id: 'product-b' }]); await settle(); h.invariant();
  h.select(''); h.invariant(); assert.deepEqual(plain(h.context.products), []); assert.equal(h.context.productsLoading, false);
});

await check('late A success/error/finally cannot replace B or release B loading; clear/unmount invalidate requests', async () => {
  for (const outcome of ['success', 'error']) {
    const h = harness(); h.context.selectedProducts = structuredClone(originalLines);
    h.select('A'); h.select('B');
    outcome === 'success' ? h.pending[0].resolve([{ id: 'wrong-a' }]) : h.pending[0].reject(new Error('old A error'));
    await settle();
    assert.equal(h.context.productsLoading, true, 'stale finally cannot finish B'); assert.equal(h.context.productsError, ''); assert.deepEqual(plain(h.context.products), []);
    h.pending[1].resolve([{ id: 'right-b' }]); await settle();
    assert.deepEqual(plain(h.context.products), [{ id: 'right-b' }]); assert.equal(h.context.productsLoading, false); h.invariant();
    h.select('A'); h.select('B'); h.pending[3].resolve([{ id: 'latest-b' }]); await settle();
    h.pending[2].resolve([{ id: 'late-a' }]); await settle();
    assert.deepEqual(plain(h.context.products), [{ id: 'latest-b' }]);
    h.select('A'); h.select(''); h.pending[4].resolve([{ id: 'cleared-a' }]); await settle();
    assert.deepEqual(plain(h.context.products), []); assert.equal(h.context.productsError, '');
    h.select('A'); h.unmount(); outcome === 'success' ? h.pending[5].resolve([{ id: 'unmounted-a' }]) : h.pending[5].reject(new Error('unmounted failure')); await settle();
    assert.deepEqual(plain(h.context.products), []); assert.equal(h.context.productsError, '');
    const generation = h.context.productsRequest.current;
    await h.context.loadProducts('A'); assert.equal(h.context.productsRequest.current, generation, 'post-create refresh after unmount is ignored'); h.invariant();
  }
});

await check('hosted query and fallback obey the same generation guard; obsolete create refresh cannot cancel current list', async () => {
  const h = harness({ local: false });
  h.select('A'); h.select('B'); const generation = h.context.productsRequest.current;
  await h.context.loadProducts('A'); assert.equal(h.context.productsRequest.current, generation);
  h.pending[0].resolve([{ id: 'stale-a' }]); h.pending[1].resolve([{ id: 'right-b' }]); await settle();
  assert.deepEqual(plain(h.context.products), [{ id: 'right-b' }]);
  h.select('A'); h.pending[2].resolve([]); await settle();
  assert.equal(h.pending[3].rpc, true);
  h.select('B'); h.pending[4].resolve([{ id: 'new-b' }]); h.pending[3].resolve({ data: [{ id: 'stale-rpc-a' }], error: null });
  await settle();
  assert.deepEqual(plain(h.context.products), [{ id: 'new-b' }]);
});

const attr = (node, name) => node.attributes.properties.find(prop => prop.name?.getText(formCode.ast) === name);
const fieldNode = formCode.jsx.find(node => node.tagName.getText(formCode.ast) === 'FormField' && attr(node, 'name')?.initializer?.text === 'priceList');
const fieldRender = attr(fieldNode, 'render').initializer.expression.getText(formCode.ast);
const findElement = (element, type) => {
  if (!element || typeof element !== 'object') return null;
  if (element.type === type) return element;
  return React.Children.toArray(element.props?.children).map(child => findElement(child, type)).find(Boolean) || null;
};
await check('actual price-list field rerenders controlled value after reset and displays neutral/inactive labels', async () => {
  const context = { React, priceLists: [{ id: 'A', name: 'Bảng giá A', year: 2026 }], savedPriceListLabel: 'Bảng giá C (không còn hoạt động)' };
  for (const name of ['FormItem', 'FormLabel', 'Select', 'FormControl', 'SelectTrigger', 'SelectValue', 'SelectContent', 'SelectItem', 'FormMessage']) context[name] = name;
  vm.createContext(context); vm.runInContext(compile('renderField', fieldRender), context);
  for (const value of ['', 'A', 'C', 'B', '']) {
    const changes = [];
    const element = context.renderField({ field: { value, onChange(next) { changes.push(next); } } });
    const select = findElement(element, 'Select'); assert.equal(select.props.value, value); assert.equal(select.props.defaultValue, undefined);
    select.props.onValueChange(''); assert.deepEqual(changes, [], 'spurious empty native change cannot erase a saved ID');
    select.props.onValueChange('A'); assert.deepEqual(changes, ['A'], 'deliberate list selection still changes value');
    assert.equal(findElement(element, 'SelectValue').props.placeholder, 'Chọn bảng giá');
    if (value === 'C') {
      const option = findElement(element, 'SelectItem'); assert.equal(option.props.value, 'C'); assert.equal(option.props.disabled, true); assert.match(option.props.children, /không còn hoạt động/);
    }
  }
});

const payload = key => `${key} <b>TEST</b> & " '</title><script>test-only</script><img src=x onerror="test-only">`;
const input = {
  quoteNumber: payload('number'), createdDate: payload('createdDate'), expiryDate: payload('expiryDate'), status: payload('status'),
  customerName: payload('customer'), phone: payload('phone'), address: payload('address'), email: payload('email'),
  templateSettings: { companyName: payload('company'), address: payload('companyAddress'), phone: payload('companyPhone'), logoUrl: 'javascript:test-only', terms: [payload('terms'), ''], footerNote: payload('footer') },
  correctedItems: [{ name: payload('itemName'), sku: payload('sku'), specifications: payload('specs'), category: payload('category'), description: payload('description'), notes: payload('notes'), selectedImage: 'data:text/html,test-only', quantity: 2, price: 25000, total: 50000 }, { name: '', sku: payload('skuFallback'), description: payload('descriptionFallback'), quantity: 1, price: 1, total: 1 }],
  subtotal: 50001, includeVAT: true, vatRate: 8, vatAmount: 4000, totalWithVat: 54001, firstPayment: 10000, payment2: 20000, remaining: 24001,
};
await check('full PDF HTML escapes every dynamic field and rejects executable/invalid image URLs', async () => {
  const html = buildQuotePdfHtml(input);
  for (const value of [input.quoteNumber, input.createdDate, input.expiryDate, input.status, input.customerName, input.phone, input.address, input.email, input.templateSettings.companyName, input.templateSettings.address, input.templateSettings.phone, input.templateSettings.terms[0], input.templateSettings.footerNote, input.correctedItems[0].name, input.correctedItems[0].specifications, input.correctedItems[0].category, input.correctedItems[0].notes, input.correctedItems[1].sku, input.correctedItems[1].description]) assert.ok(html.includes(escapeQuoteHtml(value)), value);
  assert.doesNotMatch(html, /<script\b|<b>|<img\b|javascript:|data:text\/html/i);
  assert.equal(escapeQuoteHtml('<>&"\''), '&lt;&gt;&amp;&quot;&#39;');
  for (const url of ['javascript:test-only', 'java\tscript:test-only', 'data:image/png;base64,abc', 'file:///tmp/a.png', 'blob:https://fixture.invalid/test', '//fixture.invalid/image.png', '\\fixture.invalid\\image.png', '/a\u0000.png', '/a%0a.png', 'https://', 'https://[invalid', '/a%broken', '#fragment']) assert.equal(safeQuoteImageUrl(url), '', url);
  for (const url of ['http://fixture.invalid/image.png', 'https://fixture.invalid/image.png?a=1&b=2', '/images/a.png', './images/a.png', '../images/a.png', 'images/a.png']) assert.equal(safeQuoteImageUrl(url), url);
  const attributeUrl = 'https://fixture.invalid/image.png?label=" ><img src=x onerror="test-only">&a=1';
  const withImage = buildQuotePdfHtml({ ...input, templateSettings: { ...input.templateSettings, logoUrl: attributeUrl }, correctedItems: [{ ...input.correctedItems[0], selectedImage: attributeUrl }] });
  assert.equal((withImage.match(/<img\b/g) || []).length, 2, 'only two fixed-layout image tags exist');
  assert.ok(withImage.includes(`src="${escapeQuoteHtml(attributeUrl)}"`)); assert.doesNotMatch(withImage, /<img src=x|<script\b/);
});

await check('actual export/print handlers use escaped document/title and register PDF load before close', async () => {
  let html = '', timerCalls = 0, printCalls = 0;
  const popup = { onload: null, print: () => printCalls++, close() {}, document: { write: value => { html = value; }, close: () => { assert.equal(typeof popup.onload, 'function', 'PDF onload registered before document.close'); popup.onload(); } } };
  const context = { ...input, quoteDate: input.createdDate, documentTerms: input.templateSettings.terms, React, Date, console, quote: { quote_number: input.quoteNumber, created_at: '2026-10-01', status: input.status },
    buildQuotePdfHtml, escapeQuoteHtml, safeQuoteImageUrl, document: { getElementById: () => ({ innerHTML: renderToStaticMarkup(React.createElement('p', null, input.customerName)) }) },
    window: { open: () => popup }, toast() {}, setTimeout: callback => { timerCalls++; callback(); } };
  vm.createContext(context); vm.runInContext(compile('exportPdf', previewCode.initializers.get('handleExportPDF')), context);
  await context.exportPdf(); assert.ok(html.includes(escapeQuoteHtml(input.customerName))); assert.doesNotMatch(html, /<script\b|<b>|<img\b/); assert.equal(timerCalls, 1); assert.equal(printCalls, 1);
  popup.document.close = () => {};
  vm.runInContext(compile('printQuote', previewCode.initializers.get('handlePrint')), context);
  context.printQuote(); assert.ok(html.includes(`<title>Báo giá ${escapeQuoteHtml(input.quoteNumber)}</title>`)); assert.doesNotMatch(html, /<script\b|<b>/); assert.equal(printCalls, 2);
});

console.log(`QUOTES PHASE 1 COMPLETE (${checks} groups; source handlers/effects + full PDF helper, synthetic only)`);
