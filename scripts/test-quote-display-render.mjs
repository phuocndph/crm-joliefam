// No browser, database, environment files or external services are used.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { quoteDisplayItems } from '../server/quote-calculation.ts';

const valid = { name: 'test display', sku: 'test-SKU', quantity: 1.5, price: 100, total: 150 };
const render = values => renderToStaticMarkup(React.createElement('table', null,
  React.createElement('tbody', null, quoteDisplayItems(values).map((row, index) =>
    React.createElement('tr', { key: index },
      React.createElement('td', null, row.name || ''),
      React.createElement('td', null, row.sku || ''),
      React.createElement('td', null, row.quantity || 0))))));
for (const field of ['name', 'sku', 'quantity', 'price', 'total']) {
  for (const bad of [{ bad: 1 }, [1], true]) {
    const input = [{ ...valid, [field]: bad }, valid];
    assert.deepEqual(quoteDisplayItems(input), [valid], `${field}: corrupt row is excluded`);
    assert.doesNotThrow(() => render(input), `${field}: safe React render`);
  }
}
assert.deepEqual(quoteDisplayItems([valid]), [valid], 'valid fractional item is unchanged');
assert.deepEqual(quoteDisplayItems(JSON.stringify([valid])), [valid], 'legacy JSON item remains unchanged');
assert.match(render([valid]), /test display/);
assert.match(render([valid]), /1\.5/);
console.log('PASS quote display: corrupt name/SKU/quantity/price/total cannot crash React; valid rows preserved');
