// Pure read-model regressions; no browser, database, credentials or network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateQuote, canonicalQuote, assertSavedQuoteFinancials, quoteDisplayItems, quoteContactSnapshot } from '../server/quote-calculation.ts';

let checks = 0;
const check = (name, action) => { action(); checks++; console.log('PASS ' + name); };
const items = [{ name: 'test line', quantity: 2, price: 100000, total: 200000 }];
const calculated = calculateQuote({ items, includeVAT: true, vatRate: 8, payment1: 50000, payment2: 30000 });
const saved = canonicalQuote({ items, include_vat: true, vat_rate: 8, quote_data: { payment1: 50000, payment2: 30000 } });

check('legacy supplement adapter always returns a safely iterable object array', () => {
  for (const input of [undefined, null, false, true, 42, {}, { length: 1 }, 'null', '42', '{}', '{broken', '"text"']) {
    assert.deepEqual(quoteDisplayItems(input), []);
  }
  const object = { name: 'test retained', sku: 'TEST-SKU', quantity: 1, price: 100, total: 100 };
  assert.deepEqual(quoteDisplayItems([null, false, true, 2, 'x', [], object]), [object]);
  assert.deepEqual(quoteDisplayItems(JSON.stringify([null, false, 'text', [], object])), [object]);
});
check('legacy supplemental display fields cannot crash React child rendering', () => {
  const valid = { name: 'test valid retained', sku: 'TEST-VALID', quantity: 1.5, price: 100, total: 150 };
  const variants = [
    { name: { bad: 'test name object' }, sku: { bad: 'test sku object' }, quantity: { bad: 'test quantity object' } },
    { name: ['test array name'], sku: ['test array SKU'], quantity: [] },
    { name: null, sku: null, quantity: null },
    valid,
  ];
  const displayed = quoteDisplayItems(variants);
  assert.ok(displayed.some(row => row.name === valid.name), 'valid row remains visible');
  assert.deepEqual(displayed.find(row => row.name === valid.name), valid);
  assert.doesNotThrow(() => renderToStaticMarkup(createElement('table', null,
    createElement('tbody', null, displayed.map((row, index) => createElement('tr', { key: index },
      createElement('td', null, row.sku || '-'), createElement('td', null, row.name || '-'), createElement('td', null, row.quantity || 0)))))));
});
check('tolerant display does not weaken strict writes', () => {
  for (const input of [{}, null, '{bad', [null, { name: 'test', quantity: 1, price: 1 }]]) {
    assert.throws(() => calculateQuote({ items: input }));
  }
});
check('saved financial snapshot accepts equivalent numeric strings without mutation', () => {
  const source = structuredClone(saved);
  source.subtotal = '200000.000'; source.vat_rate = '8.000'; source.vat_amount = '16000.000'; source.total_amount = '216000.000';
  source.items = JSON.stringify(source.items);
  const before = structuredClone(source);
  assert.doesNotThrow(() => assertSavedQuoteFinancials(source, calculated));
  assert.deepEqual(source, before);
});
check('saved root totals, VAT and line mismatch are rejected rather than silently normalized', () => {
  for (const patch of [{ subtotal: 1 }, { vat_rate: 0 }, { vat_amount: 1 }, { total_amount: 1 }, { include_vat: false }, { items: [{ ...items[0], total: 1 }] }, { total_amount: 'NaN' }]) {
    assert.throws(() => assertSavedQuoteFinancials({ ...saved, ...patch }, calculated), /khớp|hữu hạn/);
  }
});
check('saved nested financial snapshots cannot contradict canonical values', () => {
  for (const patch of [{ subtotal: 1 }, { vatRate: 0 }, { vatAmount: 1 }, { total: 1 }, { totalAmount: 1 }, { includeVAT: false }]) {
    assert.throws(() => assertSavedQuoteFinancials({ ...saved, quote_data: { ...saved.quote_data, ...patch } }, calculated), /khớp/);
  }
});
check('valid VAT zero and fractional quantity snapshots remain printable', () => {
  for (const [quantity, vatRate, includeVAT] of [[1.5, 0, true], [1.5, 8, false], [1, 8.125, true]]) {
    const body = { items: [{ name: 'test quantity', quantity, price: 100.5 }], include_vat: includeVAT, vat_rate: vatRate };
    const canonical = canonicalQuote(body);
    const result = calculateQuote({ items: body.items, includeVAT, vatRate });
    assert.doesNotThrow(() => assertSavedQuoteFinancials(canonical, result));
  }
});

const phonePattern = /(?:^|\n)Điện thoại:[ \t]*([^\r\n]*)/;
const addressPattern = /(?:^|\n)Địa chỉ:[ \t]*([^\r\n]*)/;
check('explicit blank and null snapshot contacts never fall through to old master/notes', () => {
  for (const value of ['', null, undefined]) {
    const quote = { customerPhone: 'test old master', notes: 'Điện thoại: test old notes' };
    assert.equal(quoteContactSnapshot(quote, { customerPhone: value }, 'customerPhone', phonePattern), '');
    assert.equal(quoteContactSnapshot({ ...quote, customerPhone: value }, {}, 'customerPhone', phonePattern), '');
  }
});
check('empty legacy phone and address cannot consume the following notes line', () => {
  for (const newline of ['\n', '\r\n']) {
    const notes = ['Khách hàng: test', 'Điện thoại: ', 'Email: test@example.invalid', 'Địa chỉ:\t', 'Ngày hết hạn: 23/10/2026'].join(newline);
    assert.equal(quoteContactSnapshot({ notes }, {}, 'customerPhone', phonePattern), '');
    assert.equal(quoteContactSnapshot({ notes }, {}, 'customerAddress', addressPattern), '');
  }
  assert.equal(quoteContactSnapshot({ notes: 'Ghi chú: Điện thoại: not a contact' }, {}, 'customerPhone', phonePattern, 'fallback'), 'fallback');
});
check('contact precedence is saved snapshot, formatted quote, bounded legacy line, fallback', () => {
  const quote = { customerPhone: 'test formatted', notes: 'Điện thoại: test legacy\nEmail: ignored' };
  assert.equal(quoteContactSnapshot(quote, { customerPhone: 'test snapshot' }, 'customerPhone', phonePattern), 'test snapshot');
  assert.equal(quoteContactSnapshot(quote, {}, 'customerPhone', phonePattern), 'test formatted');
  assert.equal(quoteContactSnapshot({ notes: quote.notes }, {}, 'customerPhone', phonePattern), 'test legacy');
  assert.equal(quoteContactSnapshot({}, {}, 'customerPhone', phonePattern, 'test fallback'), 'test fallback');
});

const preview = await readFile(new URL('../src/components/QuotePreviewDialog.tsx', import.meta.url), 'utf8');
const supplement = await readFile(new URL('../src/components/QuoteSupplementDialog.tsx', import.meta.url), 'utf8');
check('preview/export and supplement are wired to the guarded shared read model', () => {
  assert.match(preview, /assertSavedQuoteFinancials\(quote, calculated, quoteData\)/);
  assert.match(preview, /if \(calculationError\) throw new Error\(calculationError\)/);
  assert.equal((preview.match(/disabled=\{Boolean\(calculationError\)\}/g) || []).length, 2);
  assert.equal((supplement.match(/quoteDisplayItems\(quote.items\)/g) || []).length, 2);
  assert.match(supplement, /String\(item.name \?\? ''\)\.toLowerCase\(\)/);
});
console.log('QUOTE READ MODEL: ' + checks + ' groups passed.');
