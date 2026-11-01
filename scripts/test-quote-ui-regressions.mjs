import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { parseQuotePriceInput, quoteFormPreview } from '../src/lib/quote-form-preview.ts';
import { calculateQuote } from '../src/lib/quote-calculation.ts';

const form = await readFile(new URL('../src/components/CreateQuoteForm.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('CreateQuoteForm.tsx', form, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let priceChange, priceBlur, priceValue, blankLine;
const scan = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'isBlankQuoteLine') blankLine = node.initializer.getText(ast);
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'Input' && node.attributes.properties.some(p => p.name?.getText(ast) === 'aria-label' && p.getText(ast).includes('Đơn giá dòng'))) {
    priceChange = node.attributes.properties.find(p => p.name?.getText(ast) === 'onChange').initializer.expression.getText(ast);
    priceBlur = node.attributes.properties.find(p => p.name?.getText(ast) === 'onBlur').initializer.expression.getText(ast);
    priceValue = node.attributes.properties.find(p => p.name?.getText(ast) === 'value').initializer.expression.getText(ast);
  }
  ts.forEachChild(node, scan);
};
scan(ast);
const blankContext=vm.createContext({});
vm.runInContext(ts.transpileModule(`globalThis.isBlank=${blankLine};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,blankContext);
assert.equal(blankContext.isBlank({name:'',price:0}),true);
for(const price of [NaN,null,undefined,Infinity,'bad']) assert.equal(blankContext.isBlank({name:'',price}),false,'malformed prices cannot be discarded as blank');
assert.ok(priceChange, 'real price input handler must exist');
const updates = [];
const context = vm.createContext({ parseQuotePriceInput, priceEditing: {}, item: { id: 'edited-line', price: 0 },
  updatePrice: (...args) => { updates.push(args); context.item.price=args[1]; },
  setPriceEditing: update => {context.priceEditing=typeof update==='function'?update(context.priceEditing):update;},
});
vm.runInContext(ts.transpileModule(`globalThis.change = ${priceChange};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
vm.runInContext(ts.transpileModule(`globalThis.blur = ${priceBlur}; globalThis.readValue = () => (${priceValue});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
for (const [text, expected] of [['175000',175000],['175.000',175000],[' 175.000 đ ',175000],['1.234,567891',1234.567891],['0',0],['',0]]) {
  context.change({target:{value:text}});
  assert.deepEqual([...updates.at(-1)], ['edited-line',expected]);
  assert.equal(context.readValue(),text,'while editing, preserve the exact input');
}
context.change({target:{value:''}});
for (const character of '1,567891') context.change({target:{value:context.readValue()+character}});
assert.equal(context.item.price,1.567891,'sequential comma decimal typing must retain all six decimals');
assert.equal(context.readValue(),'1,567891');
context.priceEditing.other='25,';
context.blur();
assert.equal(context.readValue(),'1,567891','blur formats the canonical amount');
assert.equal(context.priceEditing.other,'25,','blur clears only the stable edited row ID');
context.change({target:{value:'175000'}}); context.blur();
assert.equal(context.readValue(),'175.000');
console.log('PASS quote UI: real price handler accepts typed/pasted VND and six decimal catalog precision');

const settings = { includeVAT: true, vatRate: 8, payment1: 100000, payment2: 50000 };
const rows = [
  { id:'first', index:0, item:{name:'Ga',quantity:1,price:175000,total:175000} },
  { id:'second', index:2, item:{name:'Gối',quantity:2,price:25000,total:50000} },
];
const valid = quoteFormPreview(rows,settings);
assert.equal(valid.validLineCount,2);
assert.deepEqual(valid.calculation,calculateQuote({...settings,items:rows.map(r=>r.item)}));
assert.equal(valid.calculation.total,243000);
assert.equal(valid.calculation.remaining,93000);
const invalidRows = structuredClone(rows); invalidRows[1].item.quantity=0;
const invalid = quoteFormPreview(invalidRows,settings);
assert.equal(invalid.calculation,null,'invalid data must never manufacture a zero total');
assert.equal(invalid.validLineCount,1);
assert.match(invalid.lineErrors.second,/dòng 3/,'error retains visible index despite skipped blank rows');
assert.ok(invalid.calculationError);
for (const [field,value] of [['name',''],['price',NaN],['price',-1],['quantity',-2],['quantity',Infinity]]) {
  const bad=structuredClone(rows); bad[0].item[field]=value;
  assert.equal(quoteFormPreview(bad,settings).calculation,null,`${field} ${value} must block final total`);
}
assert.equal(quoteFormPreview(rows,{...settings,vatRate:101}).calculation,null);
assert.equal(quoteFormPreview([],settings).calculation.total,0,'empty form has a neutral initial zero');
console.log('PASS quote UI: canonical validation, row errors, valid count, VAT/payments and unavailable totals');

const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
const main=await readFile(new URL('../src/components/layout/MainLayout.tsx',import.meta.url),'utf8');
const mobile=await readFile(new URL('../src/components/layout/MobileLayout.tsx',import.meta.url),'utf8');
assert.match(app,/<Route path="\/" element=\{<MainLayout \/>\}>/);
assert.doesNotMatch(app,/LayoutComponent\s*=/);
assert.equal((main.match(/<Outlet\s*\/>/g)||[]).length,1);
const chrome=mobile.slice(mobile.indexOf('export function MobileNavigationChrome'),mobile.indexOf('const MobileLayout'));
assert.doesNotMatch(chrome,/<Outlet/,'mobile chrome cannot introduce a second route tree');
assert.match(main,/!isMobile && <DesktopNavigationSearch/,'only active desktop chrome registers Ctrl+K');
assert.match(main,/!isMobile && <AppSidebar/,'hidden mobile sidebar cannot open an orphan sheet');
assert.match(form,/form=\{quoteFormId\}/,'fixed footer submits its associated form');
assert.match(form,/<Table disableWrapper/,'only one table horizontal scroll owner');
console.log('PASS quote UI: stable route shell, single Outlet, exclusive shortcuts and linked fixed footer');

const previewDialog = await readFile(new URL('../src/components/QuotePreviewDialog.tsx', import.meta.url), 'utf8');
assert.match(previewDialog, /cleanFieldPrefix/, 'company header fields normalize duplicate prefixes');
assert.doesNotMatch(previewDialog, /style=\{\{\s*color:\s*templateSettings\.(companyTitleColor|quoteTitleColor)\s*\}\}/, 'quote preview headings use neutral typography instead of bright inline colors');
assert.match(previewDialog, /<DialogDescription/, 'quote preview dialog includes accessible description');
console.log('PASS quote UI: quote preview dialog uses neutral typography, prefix deduplication and accessible header');

assert.match(previewDialog, /onPrevQuote/, 'quote preview supports previous/next quote navigation');
assert.match(previewDialog, /Thao tác khác/, 'quote preview groups secondary actions into a compact menu');
assert.match(previewDialog, /showSeparateHeadquarters/, 'quote preview deduplicates identical company address and headquarters');
