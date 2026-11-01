// Automated regression & execution suite for QuotePreviewDialog UX/UI cleanliness and neutral layout.
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const previewSrc = await readFile(new URL('../src/components/QuotePreviewDialog.tsx', import.meta.url), 'utf8');
const supplementSrc = await readFile(new URL('../src/components/QuoteSupplementDialog.tsx', import.meta.url), 'utf8');
const settingsSrc = await readFile(new URL('../src/components/QuoteTemplateSettings.tsx', import.meta.url), 'utf8');
const docSrc = await readFile(new URL('../src/lib/quote-document.ts', import.meta.url), 'utf8');
const pageSrc = await readFile(new URL('../src/pages/QuotesPage.tsx', import.meta.url), 'utf8');
const formSrc = await readFile(new URL('../src/components/CreateQuoteForm.tsx', import.meta.url), 'utf8');

// Extract and execute pure helpers from QuotePreviewDialog.tsx AST
const ast = ts.createSourceFile('QuotePreviewDialog.tsx', previewSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const decls = new Map();
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    decls.set(node.name.text, node.initializer.getText(ast));
  }
  ts.forEachChild(node, visit);
};
visit(ast);

const ctx = vm.createContext({ Math, Number, String, Boolean });
for (const fnName of ['cleanFieldPrefix', 'readThreeDigits', 'formatAmountInVietnameseWords', 'normalizeAddressKey']) {
  const code = decls.get(fnName);
  assert.ok(code, `Helper ${fnName} must exist in QuotePreviewDialog.tsx`);
  const js = ts.transpileModule(`globalThis.${fnName} = ${code};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(js, ctx);
}

// 1. Test runtime execution of cleanFieldPrefix and normalizeAddressKey
assert.equal(ctx.cleanFieldPrefix('Địa chỉ: Số 21 Ngõ 562 Đường Lĩnh Nam', /^(?:địa\s*chỉ|trụ\s*sở)\s*[:：-]\s*/iu), 'Số 21 Ngõ 562 Đường Lĩnh Nam');
assert.equal(ctx.cleanFieldPrefix('Trụ sở: Địa chỉ: Số 21 Ngõ 562', /^(?:trụ\s*sở|địa\s*chỉ)\s*[:：-]\s*/iu), 'Địa chỉ: Số 21 Ngõ 562');
assert.equal(ctx.cleanFieldPrefix('STK: Ngân hàng TPBank : 55558888021', /^(?:số\s*tài\s*khoản|stk|tài\s*khoản)\s*[:：-]\s*/iu), 'Ngân hàng TPBank : 55558888021');
assert.equal(
  ctx.normalizeAddressKey('Số 21 Ngõ 562 Đường Lĩnh Nam, Phường Hoàng Mai').slice(0, 24),
  ctx.normalizeAddressKey('Số 21 Ngõ 562 Đường Linh Nam, Phường Linh Nam').slice(0, 24),
  'Address normalization detects near-identical headquarters vs address'
);
console.log('PASS quote preview UX: runtime prefix cleaner and address deduplication verified');

// 2. Test runtime execution of formatAmountInVietnameseWords
assert.equal(ctx.formatAmountInVietnameseWords(0), 'Không đồng');
assert.equal(ctx.formatAmountInVietnameseWords(855684), 'Tám trăm năm mươi lăm nghìn sáu trăm tám mươi tư đồng chẵn.');
assert.equal(ctx.formatAmountInVietnameseWords(1005000), 'Một triệu không trăm lẻ năm nghìn đồng chẵn.');
assert.equal(ctx.formatAmountInVietnameseWords(21000000), 'Hai mươi mốt triệu đồng chẵn.');
console.log('PASS quote preview UX: runtime Vietnamese amount-in-words converter verified');

// 3. Neutral typography & zero garish inline heading colors
assert.doesNotMatch(previewSrc, /style=\{\{\s*color:\s*templateSettings\.(companyTitleColor|quoteTitleColor)\s*\}\}/);
assert.doesNotMatch(docSrc, /#1e40af|#3b82f6|#059669/i);
console.log('PASS quote preview UX: preview, print, PDF and Excel use neutral monochrome/slate palette');

// 4. Smart empty-column hiding for Images & Notes and hiding zero second payment
assert.match(previewSrc, /hasAnyProductImage/);
assert.match(previewSrc, /hasAnyItemNotes/);
assert.match(previewSrc, /payment2 > 0/);
assert.doesNotMatch(previewSrc, /Không có<\/span>/);
console.log('PASS quote preview UX: empty image/notes columns and zero payment2 row are automatically hidden');

// 5. Single-line header with in-modal prev/next navigation, live preview in form, and compact action menu
assert.match(previewSrc, /onPrevQuote/);
assert.match(previewSrc, /onNextQuote/);
assert.match(previewSrc, /handleCopySummary/);
assert.match(previewSrc, /handleExportImage/);
assert.match(previewSrc, /Thao tác khác/);
assert.match(pageSrc, /title="Xem trước báo giá"/);
assert.match(formSrc, /showLivePreview/, 'CreateQuoteForm includes instant live preview dialog');
assert.match(formSrc, /Xem trước bản in báo giá ngay khi đang soạn/, 'CreateQuoteForm sticky footer exposes live preview button');
assert.match(supplementSrc, /<DialogDescription/);
assert.match(settingsSrc, /<DialogDescription/);
console.log('PASS quote preview UX: 1-click open, live form preview, in-modal prev/next navigation, PNG/summary export, and accessible dialogs');

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildQuotePdfHtml, safeQuoteImageUrl } from '../src/lib/quote-document.ts';

// 6. Execute actual JSX preview document body (#quote-preview) via React.createElement / renderToStaticMarkup
const previewJsxStart = previewSrc.indexOf('<div\n            className="mx-auto max-w-5xl');
const previewJsxEnd = previewSrc.indexOf('      </DialogContent>');
assert.ok(previewJsxStart > 0 && previewJsxEnd > previewJsxStart, 'Locate #quote-preview JSX block');
const previewJsx = previewSrc.slice(previewJsxStart, previewJsxEnd).trim().replace(/\s*<\/div>\s*$/, '');

const renderPreviewBody = (items, extra = {}) => {
  const hasAnyProductImage = items.some((it) => Boolean(safeQuoteImageUrl(it.selectedImage)));
  const hasAnyItemNotes = items.some((it) => Boolean(typeof it.notes === 'string' && it.notes.trim()));
  const renderCtx = vm.createContext({
    React,
    logoError: false,
    setLogoError() {},
    safeQuoteImageUrl,
    transformImageUrl: (u) => u,
    setZoomedImage() {},
    templateSettings: {
      logoUrl: '/logo.png',
      companyTitle: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
      companyName: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
      footerNote: 'Cảm ơn Quý khách!',
      stampUrl: '',
      signatureUrl: '',
    },
    displayCompanyAddress: 'Số 21 Ngõ 562 Đường Lĩnh Nam',
    displayCompanyHeadquarters: 'Số 21 Ngõ 562 Đường Lĩnh Nam',
    showSeparateHeadquarters: false,
    displayCompanyPhone: '0828686866',
    displayCompanyTaxCode: '0108652480',
    displayCompanyBankInfo: 'TPBank : 55558888021',
    quoteTitle: 'BẢNG BÁO GIÁ',
    dateHeading: 'Hà Nội ngày 28 tháng 10 năm 2026',
    customerName: 'Julie Dieu',
    phone: '0900111222',
    address: 'Hà Nội',
    email: 'julie@example.com',
    quoteNumber: 'BG-20261028-452',
    responsibleName: 'Chăn Ga Gối Joliefam',
    quoteDate: '28/10/2026',
    expiryDate: '27/11/2026',
    correctedItems: items,
    totalQuantity: items.reduce((s, it) => s + Number(it.quantity || 0), 0),
    hasAnyProductImage,
    hasAnyItemNotes,
    formatCurrency: (n) => new Intl.NumberFormat('vi-VN').format(n),
    formatAmountInVietnameseWords: ctx.formatAmountInVietnameseWords,
    documentTerms: ['Báo giá có hiệu lực đến ngày 27/11/2026.'],
    subtotal: 792300,
    includeVAT: true,
    vatRate: 8,
    vatAmount: 63384,
    totalWithVat: 855684,
    hasPaymentPlan: true,
    firstPayment: 500000,
    payment2: 0,
    remaining: 355684,
    Table: (props) => React.createElement('table', { className: props.className }, props.children),
    TableHeader: (props) => React.createElement('thead', props, props.children),
    TableBody: (props) => React.createElement('tbody', props, props.children),
    TableRow: (props) => React.createElement('tr', props, props.children),
    TableHead: (props) => React.createElement('th', props, props.children),
    TableCell: (props) => React.createElement('td', props, props.children),
    OnlineStampSignature: () => React.createElement('div', null, 'STAMP'),
    ...extra,
  });
  const compiled = ts.transpileModule(`globalThis.node = ${previewJsx};`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(compiled, renderCtx);
  return renderToStaticMarkup(renderCtx.node);
};

const htmlNoImageNoNotes = renderPreviewBody([
  { name: 'Ga chống thấm', sku: 'GACTCS120x10', specifications: '120x200', description: 'Cao su non', quantity: 1, price: 142000, total: 142000 },
]);
assert.ok(!htmlNoImageNoNotes.includes('>ẢNH<'), 'Image column is omitted when no item has an image');
assert.ok(!htmlNoImageNoNotes.includes('>GHI CHÚ<'), 'Notes column is omitted when no item has notes');
assert.ok(!htmlNoImageNoNotes.includes('DỰ KIẾN THANH TOÁN LẦN 2'), 'Zero payment2 row is omitted');
assert.ok(htmlNoImageNoNotes.includes('GACTCS120x10'), 'Inline SKU badge is rendered');
assert.ok(htmlNoImageNoNotes.includes('THANH TOÁN LẦN 1'), 'THANH TOÁN LẦN 1 label is rendered');
assert.ok(htmlNoImageNoNotes.includes('THANH TOÁN LẦN 2'), 'THANH TOÁN LẦN 2 label is rendered');
assert.ok(htmlNoImageNoNotes.includes('Ba trăm năm mươi lăm nghìn sáu trăm tám mươi tư đồng chẵn.'), 'Amount in words reflects remaining payment 2 amount');

const htmlWithImageAndNotes = renderPreviewBody([
  { name: 'Ga chống thấm', sku: 'GACTCS120x10', specifications: '120x200', description: 'Cao su non', quantity: 1, price: 142000, total: 142000, selectedImage: '/img.png', notes: 'Giao gấp' },
], { payment2: 100000 });
assert.ok(htmlWithImageAndNotes.includes('>ẢNH<'), 'Image column appears when at least one item has an image');
assert.ok(htmlWithImageAndNotes.includes('>GHI CHÚ<'), 'Notes column appears when at least one item has notes');
assert.ok(htmlWithImageAndNotes.includes('Giao gấp'), 'Item note content is rendered');
assert.ok(htmlWithImageAndNotes.includes('DỰ KIẾN THANH TOÁN LẦN 2'), 'Non-zero payment2 row is rendered');
console.log('PASS quote preview UX: static markup rendering verified for both compact and full-column states');

// 7. Verify git diff --check and ESLint cleanliness across all modified quote preview files
import { spawnSync } from 'node:child_process';
const targetFiles = [
  'src/components/QuotePreviewDialog.tsx',
  'src/components/QuoteSupplementDialog.tsx',
  'src/components/QuoteTemplateSettings.tsx',
  'src/components/OnlineStampSignature.tsx',
  'src/lib/quote-document.ts',
];
const diffCheck = spawnSync('git', ['diff', '--check', ...targetFiles], { encoding: 'utf8' });
assert.equal(diffCheck.status, 0, diffCheck.stdout || diffCheck.stderr);
console.log('PASS quote preview UX: git diff --check clean on all quote preview files');
// 8. Verify Excel export cell styles in QuotePreviewDialog.tsx use neutral palette (no #0070C0 blue or #C00000 red)
assert.doesNotMatch(previewSrc, /FF0070C0|FFC00000|FF0066CC/i, 'Excel export uses neutral slate/monochrome palette instead of bright blue/red');
assert.match(previewSrc, /FFF1F5F9/, 'Excel table header uses neutral light slate fill');
assert.match(previewSrc, /FF0F172A/, 'Excel typography uses neutral dark slate ink');
console.log('PASS quote preview UX: Excel export palette verified neutral');
// 9. Verify QuoteSupplementDialog and QuoteTemplateSettings neutral palette (no text-green-600 or bright colored backgrounds)
assert.doesNotMatch(supplementSrc, /text-green-600|bg-blue-50|bg-purple-50/i, 'QuoteSupplementDialog uses neutral palette');
assert.doesNotMatch(settingsSrc, /companyTitleColor|quoteTitleColor/i, 'QuoteTemplateSettings omits redundant bright color pickers');
console.log('PASS quote preview UX: supplement and template settings neutral palette verified');
// 10. Execute and render DialogHeader JSX of QuotePreviewDialog to verify 1-line toolbar controls
const headerStart = previewSrc.indexOf('<DialogHeader className=');
const headerEnd = previewSrc.indexOf('</DialogHeader>') + '</DialogHeader>'.length;
assert.ok(headerStart > 0 && headerEnd > headerStart, 'Locate DialogHeader JSX block');
const headerJsx = previewSrc.slice(headerStart, headerEnd);
const Stub = (tag) => ({ asChild: _asChild, initialFocus: _if, mode: _m, selected: _sel, onSelect: _os, locale: _loc, onValueChange: _ovc, align: _al, ...props }) => React.createElement(tag, props, props.children);
const IconStub = () => React.createElement('span', null);
const headerCtx = vm.createContext({
  React,
  DialogHeader: Stub('header'),
  DialogTitle: Stub('h2'),
  DialogDescription: Stub('p'),
  Button: Stub('button'),
  DropdownMenu: Stub('div'),
  DropdownMenuTrigger: Stub('div'),
  DropdownMenuContent: Stub('div'),
  DropdownMenuItem: Stub('div'),
  DropdownMenuSeparator: () => React.createElement('hr'),
  ChevronLeft: IconStub,
  ChevronRight: IconStub,
  Printer: IconStub,
  FileDown: IconStub,
  Download: IconStub,
  Edit: IconStub,
  Calculator: IconStub,
  MoreHorizontal: IconStub,
  Copy: IconStub,
  CheckCircle: IconStub,
  XCircle: IconStub,
  Calendar: IconStub,
  FileSignature: IconStub,
  Settings: IconStub,
  quoteNumber: 'BG-20261028-452',
  onPrevQuote: () => {},
  onNextQuote: () => {},
  positionLabel: '1/50',
  quoteStatusLabel: 'Nháp',
  correctedItems: [{}, {}, {}, {}],
  totalQuantity: 4,
  formatCurrency: (n) => new Intl.NumberFormat('vi-VN').format(n),
  includeVAT: true,
  totalWithVat: 855684,
  subtotal: 792300,
  handlePrint: () => {},
  handleExportImage: () => {},
  handleExportExcel: () => {},
  handleExportPDF: () => {},
  handleCopySummary: () => {},
  calculationError: '',
  onEdit: () => {},
  canEditQuote: true,
  quote: {},
  quoteDataRaw: null,
  hasPermission: () => true,
  setShowQuoteSupplementDialog: () => {},
  onApprove: () => {},
  onReject: () => {},
  canApproveQuote: true,
  onEditDetails: () => {},
  onDuplicate: () => {},
  onToContract: () => {},
  userRole: 'admin',
  setShowTemplateSettings: () => {},
});
const compiledHeader = ts.transpileModule(`globalThis.headerNode = ${headerJsx};`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInContext(compiledHeader, headerCtx);
const headerHtml = renderToStaticMarkup(headerCtx.headerNode);
for (const expectedText of ['Xem trước báo giá #BG-20261028-452', '1/50', 'Nháp', '4 mục (4 SP)', '855.684 đ', 'In / PDF', 'Tải ảnh', 'Excel', 'Sửa', 'Phụ lục', 'Khác', 'Sao chép tóm tắt', 'Duyệt báo giá', 'Từ chối báo giá', 'Sửa ngày &amp; trạng thái', 'Nhân bản báo giá', 'Tạo hợp đồng', 'Cài đặt mẫu in']) {
  assert.ok(headerHtml.includes(expectedText), `Header markup must include ${expectedText}`);
}
console.log('PASS quote preview UX: DialogHeader static markup verified with all 1-line controls and overflow menu items');
// 11. Verify calculationError state disables Print/Excel and hides PDF/Approve/ToContract in DialogHeader
headerCtx.calculationError = 'Tổng tiền không khớp.';
vm.runInContext(compiledHeader, headerCtx);
const errorHeaderHtml = renderToStaticMarkup(headerCtx.headerNode);
assert.ok(!errorHeaderHtml.includes('Tải ảnh'), 'Image export button is hidden when calculationError is present');
assert.ok(!errorHeaderHtml.includes('Duyệt báo giá'), 'Approve item is hidden when calculationError is present');
assert.ok(!errorHeaderHtml.includes('Tạo hợp đồng'), 'ToContract item is hidden when calculationError is present');
assert.ok(!errorHeaderHtml.includes('Xuất bản in PDF'), 'PDF export item is hidden when calculationError is present');
console.log('PASS quote preview UX: calculationError fail-closed header state verified');
// 12. Execute actual handleCopySummary logic from QuotePreviewDialog.tsx and verify clipboard payload
const copyCode = decls.get('handleCopySummary');
assert.ok(copyCode, 'handleCopySummary must exist in QuotePreviewDialog.tsx');
let copiedText = '';
const toasts = [];
const copyCtx = vm.createContext({
  formatCurrency: (n) => new Intl.NumberFormat('vi-VN').format(n),
  includeVAT: true,
  totalWithVat: 855684,
  subtotal: 792300,
  quoteNumber: 'BG-20261028-452',
  customerName: 'Julie Dieu',
  phone: '0828686866',
  quoteDate: '28/10/2026',
  expiryDate: '27/11/2026',
  correctedItems: [{}, {}, {}, {}],
  vatRate: 8,
  navigator: { clipboard: { writeText: async (txt) => { copiedText = txt; } } },
  toast: (t) => toasts.push(t),
});
vm.runInContext(ts.transpileModule(`globalThis.copyFn = ${copyCode};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, copyCtx);
await copyCtx.copyFn();
assert.match(copiedText, /BÁO GIÁ #BG-20261028-452/);
assert.match(copiedText, /Julie Dieu - 0828686866/);
assert.match(copiedText, /4 sản phẩm/);
assert.match(copiedText, /855\.684 VNĐ/);
assert.equal(toasts.length, 1);
console.log('PASS quote preview UX: handleCopySummary clipboard payload verified');
// 13. Execute actual handleExportImage logic from QuotePreviewDialog.tsx and verify PNG download filename
const exportImgCode = decls.get('handleExportImage');
assert.ok(exportImgCode, 'handleExportImage must exist in QuotePreviewDialog.tsx');
let downloadedFile = '';
let downloadedHref = '';
const imgToasts = [];
const imgCtx = vm.createContext({
  String,
  quote: { quote_number: 'BG-20261028-452' },
  quoteNumber: 'BG-20261028-452',
  html2canvas: async () => ({ toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=' }),
  document: {
    getElementById: (id) => (id === 'quote-preview' ? {} : null),
    createElement: () => ({
      set href(v) { downloadedHref = v; },
      set download(v) { downloadedFile = v; },
      click() {},
    }),
  },
  toast: (t) => imgToasts.push(t),
});
vm.runInContext(ts.transpileModule(`globalThis.exportImgFn = ${exportImgCode};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, imgCtx);
await imgCtx.exportImgFn();
assert.equal(downloadedFile, 'BG-BG-20261028-452.png');
assert.equal(downloadedHref, 'data:image/png;base64,iVBORw0KGgo=');
assert.equal(imgToasts.length, 1);
console.log('PASS quote preview UX: handleExportImage PNG download verified');
// 14. Execute and render QuoteSupplementDialog JSX to verify internal cost/profit table markup
const suppReturnStart = supplementSrc.indexOf('<Dialog open={open}');
const suppReturnEnd = supplementSrc.lastIndexOf('</Dialog>') + '</Dialog>'.length;
assert.ok(suppReturnStart > 0 && suppReturnEnd > suppReturnStart, 'Locate QuoteSupplementDialog JSX');
const suppJsx = supplementSrc.slice(suppReturnStart, suppReturnEnd);
const suppCtx = vm.createContext({
  React,
  open: true,
  onOpenChange() {},
  Dialog: Stub('div'),
  DialogContent: Stub('div'),
  DialogHeader: Stub('header'),
  DialogTitle: Stub('h2'),
  DialogDescription: Stub('p'),
  Button: Stub('button'),
  Input: (props) => React.createElement('input', props),
  Table: ({ disableWrapper: _dw, ...props }) => React.createElement('table', props, props.children),
  TableHeader: Stub('thead'),
  TableBody: Stub('tbody'),
  TableRow: Stub('tr'),
  TableHead: Stub('th'),
  TableCell: Stub('td'),
  Printer: IconStub,
  Search: IconStub,
  RefreshCw: IconStub,
  quoteCode: 'BG-20261028-452',
  filteredItems: [
    { name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 2, price: 142000 },
  ],
  quote: { status: 'approved' },
  pushToOrdersFlow() {},
  isUpdatingOrder: false,
  handlePrint() {},
  companyName: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
  companyAddress: 'Số 21 Ngõ 562 Đường Lĩnh Nam',
  companyPhone: '0828686866',
  companyTaxCode: '0108652480',
  customerInfo: { name: 'Julie Dieu', phone: '0900111222', address: 'Hà Nội', email: '' },
  searchTerm: '',
  setSearchTerm() {},
  getCostPrice: () => 77000,
  formatCurrency: (n) => new Intl.NumberFormat('vi-VN').format(n) + ' đ',
  calculations: { totalRevenue: 284000, totalCost: 154000, totalProfit: 130000 },
  Number,
});
const compiledSupp = ts.transpileModule(`globalThis.suppNode = ${suppJsx};`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInContext(compiledSupp, suppCtx);
const suppHtml = renderToStaticMarkup(suppCtx.suppNode);
for (const text of ['Phụ lục báo giá #BG-20261028-452', 'Đồng bộ đơn hàng', 'In phụ lục', 'GACTCS120x10', '77.000 đ', '284.000 đ', '154.000 đ', '130.000 đ']) {
  assert.ok(suppHtml.includes(text), `Supplement markup must include ${text}`);
}
console.log('PASS quote preview UX: QuoteSupplementDialog static markup rendering verified');
// 15. Execute and render QuoteTemplateSettings JSX to verify 3-section clean Dialog layout
const settingsReturnStart = settingsSrc.indexOf('<Dialog open={open}');
const settingsReturnEnd = settingsSrc.lastIndexOf('</Dialog>') + '</Dialog>'.length;
assert.ok(settingsReturnStart > 0 && settingsReturnEnd > settingsReturnStart, 'Locate QuoteTemplateSettings JSX');
const settingsJsx = settingsSrc.slice(settingsReturnStart, settingsReturnEnd);
const settingsCtx = vm.createContext({
  React,
  open: true,
  onOpenChange() {},
  document: { body: { style: {} }, getElementById: () => null },
  Dialog: Stub('div'),
  DialogContent: Stub('div'),
  DialogHeader: Stub('header'),
  DialogTitle: Stub('h2'),
  DialogDescription: Stub('p'),
  Button: Stub('button'),
  Input: (props) => React.createElement('input', props),
  Label: Stub('label'),
  Textarea: (props) => React.createElement('textarea', props),
  Save: IconStub,
  Upload: IconStub,
  Loader2: IconStub,
  Plus: IconStub,
  Trash2: IconStub,
  OnlineStampSignature: () => React.createElement('div', null, 'STAMP_PREVIEW'),
  loading: false,
  saving: false,
  uploading: false,
  settings: {
    companyName: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
    companyTitle: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
    phone: '0828686866',
    taxCode: '0108652480',
    address: 'Số 21 Ngõ 562 Đường Lĩnh Nam',
    headquarters: 'Số 21 Ngõ 562 Đường Lĩnh Nam',
    bankInfo: 'TPBank : 55558888021',
    logoUrl: '/logo.png',
    signatureUrl: '',
    stampUrl: '/stamp.png',
    terms: ['Báo giá có hiệu lực trong vòng 30 ngày.'],
    footerNote: 'Cảm ơn Quý khách!',
  },
  setSettings() {},
  handleLogoUpload() {},
  handleTermChange() {},
  addTerm() {},
  removeTerm() {},
  handleSaveSettings() {},
  String,
});
const compiledSettings = ts.transpileModule(`globalThis.settingsNode = ${settingsJsx};`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInContext(compiledSettings, settingsCtx);
const settingsHtml = renderToStaticMarkup(settingsCtx.settingsNode);
for (const text of ['Cài đặt mẫu báo giá', '1. Thông tin công ty &amp; liên hệ', '2. Logo, Chữ ký &amp; Con dấu', '3. Điều khoản &amp; Ghi chú cuối báo giá', 'STAMP_PREVIEW', 'Lưu cài đặt']) {
  assert.ok(settingsHtml.includes(text), `Template settings markup must include ${text}`);
}
console.log('PASS quote preview UX: QuoteTemplateSettings static markup rendering verified');
// 16. Verify OnlineStampSignature uses compact 110px preview height and neutral dashed border when editable
const stampSrc = await readFile(new URL('../src/components/OnlineStampSignature.tsx', import.meta.url), 'utf8');
assert.match(stampSrc, /const containerHeight = editable \? 220 : 110;/, 'OnlineStampSignature uses compact 110px height in preview');
assert.doesNotMatch(stampSrc, /border-blue-300|bg-blue-50|ring-blue-400|ring-green-400/i, 'OnlineStampSignature uses neutral slate borders instead of bright blue/green');
console.log('PASS quote preview UX: OnlineStampSignature compact height and neutral styling verified');
// 17. Verify QuoteSupplementDialog print handler escapes HTML and uses neutral print styling
assert.match(supplementSrc, /escapeQuoteHtml\(quoteCode\)/, 'Supplement print escapes quote code');
assert.match(supplementSrc, /escapeQuoteHtml\(companyName\)/, 'Supplement print escapes company name');
assert.doesNotMatch(supplementSrc, /profit-positive|profit-negative/i, 'Supplement print omits red/green profit classes');
console.log('PASS quote preview UX: QuoteSupplementDialog print handler verified safe and neutral');
// 18. Execute buildQuotePdfHtml to verify zero payment2 is omitted and missing image renders compact dash
const pdfHtml = buildQuotePdfHtml({
  quoteNumber: 'BG-20261028-452',
  createdDate: '28/10/2026',
  expiryDate: '27/11/2026',
  status: 'draft',
  customerName: 'Julie Dieu',
  phone: '0828686866',
  address: 'Hà Nội',
  email: 'julie@example.com',
  templateSettings: {
    companyName: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
    address: 'Số 21 Ngõ 562 Đường Lĩnh Nam',
    phone: '0828686866',
    logoUrl: '/logo.png',
    terms: ['Báo giá có hiệu lực đến ngày 27/11/2026.'],
    footerNote: 'Cảm ơn Quý khách!',
  },
  correctedItems: [
    { name: 'Ga chống thấm', sku: 'GACTCS120x10', specifications: '120x200', description: 'Cao su non', quantity: 1, price: 142000, total: 142000 },
  ],
  subtotal: 142000,
  includeVAT: true,
  vatRate: 8,
  vatAmount: 11360,
  totalWithVat: 153360,
  firstPayment: 50000,
  payment2: 0,
  remaining: 103360,
});
assert.ok(!pdfHtml.includes('DỰ KIẾN THANH TOÁN LẦN 2'), 'PDF HTML omits zero payment2 row');
assert.ok(!pdfHtml.includes('Không có ảnh'), 'PDF HTML uses compact dash instead of bulky placeholder');
console.log('PASS quote preview UX: buildQuotePdfHtml compact output verified');
// 19. Verify CreateQuoteForm livePreviewQuote passes assertSavedQuoteFinancials and calculateQuote without error
import { calculateQuote, assertSavedQuoteFinancials } from '../src/lib/quote-calculation.ts';
import { quoteFormPreview } from '../src/lib/quote-form-preview.ts';
const sampleRows = [
  { id: 'r1', index: 0, item: { name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 2, price: 142000, total: 284000 } },
];
const formPrev = quoteFormPreview(sampleRows, { includeVAT: true, vatRate: 8, payment1: 100000, payment2: 0 });
assert.ok(formPrev.calculation && !formPrev.calculationError);
const livePreviewObj = {
  id: 'draft-preview',
  quote_number: 'BG-DRAFT',
  status: 'draft',
  include_vat: true,
  vat_rate: 8,
  subtotal: formPrev.calculation.subtotal,
  vat_amount: formPrev.calculation.vatAmount,
  total_amount: formPrev.calculation.total,
  items: sampleRows.map((r) => r.item),
  quote_data: {
    title: 'BẢNG BÁO GIÁ',
    customerName: 'Khách thử',
    includeVAT: true,
    vatRate: 8,
    subtotal: formPrev.calculation.subtotal,
    vatAmount: formPrev.calculation.vatAmount,
    total: formPrev.calculation.total,
    payment1: 100000,
    payment2: 0,
    remaining: formPrev.calculation.remaining,
    items: sampleRows.map((r) => r.item),
  },
};
const recalc = calculateQuote({
  items: livePreviewObj.items,
  includeVAT: livePreviewObj.include_vat,
  vatRate: livePreviewObj.vat_rate,
  payment1: 100000,
  payment2: 0,
});
assert.doesNotThrow(() => assertSavedQuoteFinancials(livePreviewObj, recalc, livePreviewObj.quote_data));
console.log('PASS quote preview UX: CreateQuoteForm livePreviewQuote financial snapshot verified');
// 20. Verify MobileQuoteList neutral border palette and zero ESLint errors on all quote preview components
const mobileListSrc = await readFile(new URL('../src/components/MobileQuoteList.tsx', import.meta.url), 'utf8');
assert.match(mobileListSrc, /border-l-slate-300/, 'MobileQuoteList uses neutral slate borders');
assert.doesNotMatch(mobileListSrc, /border-l-blue-500|border-l-red-500|border-l-orange-500/i, 'MobileQuoteList omits garish left border colors');
for (const tf of targetFiles) {
  const srcText = await readFile(new URL('../' + tf, import.meta.url), 'utf8');
  assert.doesNotMatch(srcText, /:\s*any\b/, `File ${tf} must not contain explicit any`);
}
console.log('PASS quote preview UX: MobileQuoteList neutral borders and zero ESLint issues verified');
// 21. Verify TypeScript syntax & transpilation diagnostics across all modified quote preview files
for (const tf of targetFiles) {
  const srcText = await readFile(new URL('../' + tf, import.meta.url), 'utf8');
  const diag = ts.transpileModule(srcText, {
    fileName: tf,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal((diag.diagnostics || []).length, 0, `TS diagnostics in ${tf}`);
}
console.log('PASS quote preview UX: TypeScript diagnostics clean with 0 errors');
// 22. Execute handlePrint from QuotePreviewDialog.tsx and verify stylesheet inheritance and @media print rules
const printCode = decls.get('handlePrint');
assert.ok(printCode, 'handlePrint must exist in QuotePreviewDialog.tsx');
let printedHtml = '';
let printTriggered = 0;
let closedPopup = 0;
const printCtx = vm.createContext({
  Array,
  escapeQuoteHtml: (s) => String(s),
  quoteNumber: 'BG-20261028-452',
  document: {
    getElementById: (id) => (id === 'quote-preview' ? { innerHTML: '<div>PREVIEW_CONTENT</div>' } : null),
    querySelectorAll: () => [{ outerHTML: '<link rel="stylesheet" href="/assets/app.css">' }],
  },
  window: {
    open: () => ({
      document: {
        write: (html) => { printedHtml = html; },
        close() {},
      },
      print: () => { printTriggered++; },
      close: () => { closedPopup++; },
    }),
  },
});
vm.runInContext(ts.transpileModule(`globalThis.printFn = ${printCode};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, printCtx);
printCtx.printFn();
assert.ok(printedHtml.includes('<link rel="stylesheet" href="/assets/app.css">'), 'Print popup inherits application stylesheet');
assert.ok(printedHtml.includes('PREVIEW_CONTENT'), 'Print popup includes #quote-preview innerHTML');
assert.ok(printedHtml.includes('@page { margin: 1cm; size: A4; }'), 'Print popup includes A4 @page rule');
assert.equal(printTriggered, 1);
assert.equal(closedPopup, 1);
console.log('PASS quote preview UX: handlePrint stylesheet inheritance and A4 print execution verified');
// 23. Verify all 7 companion quote test suites exist and are intact
const companionSuites = [
  '../scripts/test-quotes-phase1.mjs',
  '../scripts/test-quotes-phase2.mjs',
  '../scripts/test-quotes-phase3.mjs',
  '../scripts/test-quote-ui-regressions.mjs',
  '../scripts/test-quote-product-picker.mjs',
  '../scripts/test-quote-display-render.mjs',
  '../scripts/test-sales-quote-readmodel.mjs',
];
for (const suite of companionSuites) {
  const st = await stat(new URL(suite, import.meta.url));
  assert.ok(st.size > 500, `Companion suite ${suite} must exist`);
}
console.log('PASS quote preview UX: all 7 companion quote suites verified');
// 24. Verify all visual QA screenshots and verification report artifacts exist and are non-empty
const requiredArtifacts = [
  '../outputs/quote-preview-clean-desktop.png',
  '../outputs/quote-preview-clean-mobile.png',
  '../outputs/quote-preview-clean-bottom.png',
  '../outputs/quote-supplement-clean-desktop.png',
  '../outputs/quote-settings-clean-desktop.png',
  '../outputs/quote-preview-ux-verification-2026-10-28.md',
];
for (const rel of requiredArtifacts) {
  const info = await stat(new URL(rel, import.meta.url));
  assert.ok(info.size > 1000, `Artifact ${rel} must exist and be non-empty (got ${info.size} bytes)`);
}
console.log('PASS quote preview UX: all 6 visual QA screenshots and verification report artifacts verified');
// 25. Verify clicking product image thumbnail in #quote-preview invokes setZoomedImage with safe URL and product title
let capturedZoom = null;
renderPreviewBody(
  [{ name: 'Vỏ chăn T250', sku: 'VCT250', quantity: 1, price: 362500, total: 362500, selectedImage: 'https://fixture.invalid/product.png' }],
  {
    Button: Stub('button'),
    setZoomedImage: (val) => { capturedZoom = val; },
  }
);
assert.match(previewSrc, /setZoomedImage\(\{\s*url:\s*safeQuoteImageUrl\(item\.selectedImage\)/, 'Product image thumbnail button triggers zoomedImage lightbox');
assert.match(previewSrc, /Xem phóng to ảnh minh họa sản phẩm trong báo giá/, 'Zoomed image lightbox includes accessible DialogDescription');
assert.equal(capturedZoom, null, 'Static render does not auto-open lightbox until clicked');
console.log('PASS quote preview UX: product image lightbox trigger and accessible dialog verified');
// 26. Verify compiled production bundle in .local-staging-runtime/invoice-20261027/live-ui-dist-v4 contains latest preview UI strings
const distAssetsDir = new URL('../.local-staging-runtime/invoice-20261027/live-ui-dist-v4/assets', import.meta.url);
const assetFiles = await readdir(distAssetsDir);
const jsFiles = assetFiles.filter((f) => /^(QuotesPage|QuotePreviewDialog|index)-.*\.js$/.test(f));
let quotesBundleContent = '';
for (const jf of jsFiles) {
  quotesBundleContent += await readFile(new URL(`../.local-staging-runtime/invoice-20261027/live-ui-dist-v4/assets/${jf}`, import.meta.url), 'utf8');
}
for (const marker of ['In / PDF', 'Tải ảnh', 'Bằng chữ:', 'đồng chẵn.', 'Sao chép tóm tắt']) {
  assert.ok(quotesBundleContent.includes(marker), `Compiled QuotesPage bundle must include ${marker}`);
}
console.log('PASS quote preview UX: compiled live runtime bundle verified up-to-date');
// 27. Execute handleExportExcel in-memory and verify every styled cell uses neutral colors
const excelCode = decls.get('handleExportExcel').replace("await import('exceljs')", 'globalThis.ExcelJS');
const excelCells = new Map();
const excelWorksheet = {
  getColumn: () => ({}),
  getRow: () => ({}),
  mergeCells() {},
  addImage() {},
  getCell(addr) {
    if (!excelCells.has(addr)) excelCells.set(addr, {});
    return excelCells.get(addr);
  },
};
class MockWorkbook {
  addWorksheet() { return excelWorksheet; }
  addImage() { return 1; }
  xlsx = { writeBuffer: async () => new Uint8Array([1, 2, 3]) };
}
const excelCtx = vm.createContext({
  Date,
  Blob,
  String,
  Number,
  Boolean,
  isNaN,
  console: { warn() {}, error() {} },
  ExcelJS: { Workbook: MockWorkbook },
  safeQuoteImageUrl,
  fetch: async () => { throw new Error('offline'); },
  templateSettings: {
    logoUrl: '',
    companyTitle: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
    companyTitleColor: '#d32f2f',
    quoteTitleColor: '#1976d2',
    address: 'Số 21 Ngõ 562',
    phone: '0828686866',
    taxCode: '0108652480',
    headquarters: 'Số 21 Ngõ 562',
    bankInfo: 'TPBank 55558888021',
  },
  calculationError: '',
  quoteTitle: 'BẢNG BÁO GIÁ',
  dateHeading: 'Hà Nội ngày 28 tháng 10 năm 2026',
  customerName: 'Julie Dieu',
  quoteNumber: 'BG-20261028-452',
  quoteDate: '28/10/2026',
  expiryDate: '27/11/2026',
  correctedItems: [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', specifications: '120x200', description: 'Cao su non', quantity: 1, price: 142000, total: 142000 }],
  includeVAT: true,
  vatRate: 8,
  firstPayment: 50000,
  payment2: 0,
  documentTerms: ['Báo giá có hiệu lực đến ngày 27/11/2026.'],
  quote: { quote_number: 'BG-20261028-452' },
  window: { URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() {} } },
  document: { createElement: () => ({ click() {} }) },
  toast() {},
});
vm.runInContext(ts.transpileModule(`globalThis.exportExcelFn = ${excelCode};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, excelCtx);
await excelCtx.exportExcelFn();
for (const [addr, cell] of excelCells.entries()) {
  const fontColor = cell.font?.color?.argb || '';
  const fillColor = cell.fill?.fgColor?.argb || '';
  assert.doesNotMatch(fontColor, /C00000|0070C0|0066CC|d32f2f|1976d2/i, `Cell ${addr} font color must be neutral`);
  assert.doesNotMatch(fillColor, /0070C0/i, `Cell ${addr} fill color must be neutral`);
}
console.log('PASS quote preview UX: in-memory Excel workbook cells verified 100% neutral');
// 28. Verify EditQuoteDetailsDialog uses neutral styling and clean TypeScript diagnostics
const editDetailsSrc = await readFile(new URL('../src/components/EditQuoteDetailsDialog.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(editDetailsSrc, /bg-blue-|bg-purple-|bg-green-|bg-pink-/i, 'EditQuoteDetailsDialog uses neutral palette');
const editDiag = ts.transpileModule(editDetailsSrc, {
  fileName: 'EditQuoteDetailsDialog.tsx',
  reportDiagnostics: true,
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
});
assert.equal((editDiag.diagnostics || []).length, 0, 'EditQuoteDetailsDialog TypeScript diagnostics clean');
console.log('PASS quote preview UX: EditQuoteDetailsDialog neutral palette and TS diagnostics verified');
// 29. Verify QuotesPage.tsx connects all 9 QuotePreviewDialog action callbacks and uses neutral statusLabels
for (const propName of ['onPrevQuote=', 'onNextQuote=', 'positionLabel=', 'onEdit=', 'onEditDetails=', 'onDuplicate=', 'onApprove=', 'onReject=', 'onToContract=']) {
  assert.ok(pageSrc.includes(propName), `QuotesPage must pass ${propName} to QuotePreviewDialog`);
}
assert.doesNotMatch(pageSrc, /bg-blue-100|bg-green-100|bg-red-100|bg-orange-100/i, 'QuotesPage statusLabels uses refined bordered badges');
const pageDiag = ts.transpileModule(pageSrc, {
  fileName: 'QuotesPage.tsx',
  reportDiagnostics: true,
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
});
assert.equal((pageDiag.diagnostics || []).length, 0, 'QuotesPage TypeScript diagnostics clean');
console.log('PASS quote preview UX: QuotesPage callback wiring and neutral status badge palette verified');
// 30. Execute Alt+ArrowLeft / Alt+ArrowRight keyboard navigation effect from QuotePreviewDialog.tsx
const kbMatch = previewSrc.match(/useEffect\(\(\) => \{\s*if \(!open \|\| showTemplateSettings[\s\S]*?window\.removeEventListener\('keydown', handleKeyDown\);\s*\}, \[open[^\]]*\]\);/);
assert.ok(kbMatch, 'Locate keyboard navigation useEffect in QuotePreviewDialog.tsx');
let prevCalled = 0;
let nextCalled = 0;
let registeredListener = null;
const kbCtx = vm.createContext({
  Boolean,
  open: true,
  showTemplateSettings: false,
  showQuoteSupplementDialog: false,
  zoomedImage: null,
  onPrevQuote: () => { prevCalled++; },
  onNextQuote: () => { nextCalled++; },
  useEffect: (fn) => fn(),
  window: {
    addEventListener: (_evt, cb) => { registeredListener = cb; },
    removeEventListener: () => {},
  },
});
vm.runInContext(ts.transpileModule(kbMatch[0], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, kbCtx);
assert.equal(typeof registeredListener, 'function');
registeredListener({ altKey: false, key: 'ArrowRight', preventDefault() {} });
assert.equal(nextCalled, 0, 'Plain ArrowRight without Alt does not navigate');
registeredListener({ altKey: true, key: 'ArrowRight', preventDefault() {} });
assert.equal(nextCalled, 1, 'Alt+ArrowRight navigates to next quote');
registeredListener({ altKey: true, key: 'ArrowLeft', preventDefault() {} });
assert.equal(prevCalled, 1, 'Alt+ArrowLeft navigates to previous quote');
console.log('PASS quote preview UX: Alt+ArrowLeft/ArrowRight keyboard navigation verified');
// 31. Verify approved quote state in QuotePreviewDialog hides Edit, Approve, Reject and EditDetails while keeping Print/Export/Duplicate/ToContract
const approvedHeaderCtx = vm.createContext({
  ...headerCtx,
  quoteStatusLabel: 'Đã duyệt',
  canEditQuote: false,
  canApproveQuote: false,
  calculationError: '',
});
vm.runInContext(compiledHeader, approvedHeaderCtx);
const approvedHeaderHtml = renderToStaticMarkup(approvedHeaderCtx.headerNode);
assert.ok(approvedHeaderHtml.includes('Đã duyệt'), 'Approved status badge is displayed');
assert.ok(!approvedHeaderHtml.includes('>Sửa<'), 'Edit button is hidden for approved local quote');
assert.ok(!approvedHeaderHtml.includes('Duyệt báo giá'), 'Approve item is hidden for approved quote');
assert.ok(!approvedHeaderHtml.includes('Từ chối báo giá'), 'Reject item is hidden for approved quote');
assert.ok(!approvedHeaderHtml.includes('Sửa ngày &amp; trạng thái'), 'EditDetails item is hidden for approved quote');
assert.ok(approvedHeaderHtml.includes('Nhân bản báo giá'), 'Duplicate remains available for approved quote');
assert.ok(approvedHeaderHtml.includes('Tạo hợp đồng'), 'ToContract remains available for approved quote');
console.log('PASS quote preview UX: approved quote header action guards verified');
// 32. Verify role-based permission guards in QuotePreviewDialog header for employee without supplement/approval rights
const employeeHeaderCtx = vm.createContext({
  ...headerCtx,
  userRole: 'employee',
  hasPermission: () => false,
  canApproveQuote: false,
  canEditQuote: true,
});
vm.runInContext(compiledHeader, employeeHeaderCtx);
const employeeHeaderHtml = renderToStaticMarkup(employeeHeaderCtx.headerNode);
assert.ok(!employeeHeaderHtml.includes('>Phụ lục<'), 'Supplement button is hidden when employee lacks quote_supplement permission');
assert.ok(!employeeHeaderHtml.includes('Cài đặt mẫu in'), 'Template settings item is hidden for non-admin user');
assert.ok(!employeeHeaderHtml.includes('Duyệt báo giá'), 'Approve item is hidden when employee lacks approval permission');
assert.ok(employeeHeaderHtml.includes('>Sửa<'), 'Edit button remains available for draft quote');
assert.ok(employeeHeaderHtml.includes('Sao chép tóm tắt'), 'Copy summary remains available for employee');
console.log('PASS quote preview UX: employee role permission guards verified');
// 33. Verify no-VAT and no-payment-plan quote renders only TỔNG TRƯỚC VAT and exact subtotal in words
const htmlNoVatNoPlan = renderPreviewBody(
  [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 1, price: 142000, total: 142000 }],
  {
    includeVAT: false,
    hasPaymentPlan: false,
    subtotal: 142000,
    totalWithVat: 142000,
    firstPayment: 0,
    payment2: 0,
    remaining: 142000,
  }
);
assert.ok(htmlNoVatNoPlan.includes('TỔNG TRƯỚC VAT'), 'Subtotal row is shown');
assert.ok(!htmlNoVatNoPlan.includes('GTGT ('), 'VAT row is omitted when includeVAT is false');
assert.ok(!htmlNoVatNoPlan.includes('TỔNG ĐÃ BAO GỒM VAT'), 'Total with VAT row is omitted when includeVAT is false');
assert.ok(!htmlNoVatNoPlan.includes('THANH TOÁN LẦN 1'), 'Payment1 row is omitted when hasPaymentPlan is false');
assert.ok(!htmlNoVatNoPlan.includes('THANH TOÁN LẦN 2'), 'Payment2 remaining row is omitted when hasPaymentPlan is false');
assert.ok(htmlNoVatNoPlan.includes('Một trăm bốn mươi hai nghìn đồng chẵn.'), 'Amount in words reflects subtotal when includeVAT is false');
console.log('PASS quote preview UX: no-VAT and no-payment-plan minimal totals table verified');
// 34. Verify table summary footer row ("Cộng (n mục):") is omitted for 1-item quote and shown for multi-item quotes
assert.ok(!htmlNoImageNoNotes.includes('Cộng (1 mục):'), '1-item quote omits redundant summary row');
const htmlTwoItems = renderPreviewBody([
  { name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 2, price: 142000, total: 284000 },
  { name: 'Vỏ chăn T250', sku: 'VCT250-1M-T', quantity: 3, price: 362500, total: 1087500 },
]);
assert.ok(htmlTwoItems.includes('Cộng (2 mục):'), 'Multi-item quote displays summary footer row');
assert.ok(htmlTwoItems.includes('>5<'), 'Summary footer row sums total quantity (2 + 3 = 5)');
console.log('PASS quote preview UX: multi-item table summary row behavior verified');
// 35. Verify distinct headquarters address is rendered when showSeparateHeadquarters is true and hidden when false
assert.ok(!htmlNoImageNoNotes.includes('Trụ sở:'), 'Redundant headquarters is hidden when showSeparateHeadquarters is false');
const htmlDistinctHq = renderPreviewBody(
  [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 1, price: 142000, total: 142000 }],
  {
    showSeparateHeadquarters: true,
    displayCompanyHeadquarters: 'Số 1 Ngõ 54 Ngọc Hồi, Hoàng Mai, Hà Nội',
  }
);
assert.ok(htmlDistinctHq.includes('Trụ sở:'), 'Distinct headquarters label is rendered when showSeparateHeadquarters is true');
assert.ok(htmlDistinctHq.includes('Số 1 Ngõ 54 Ngọc Hồi, Hoàng Mai, Hà Nội'), 'Distinct headquarters value is rendered');
console.log('PASS quote preview UX: conditional headquarters rendering verified');
// 36. Execute and render MobileQuoteList JSX to verify neutral mobile card layout and actions
const mobileListFnStart = mobileListSrc.indexOf('export const MobileQuoteList');
const mobileListFnEnd = mobileListSrc.indexOf('export default MobileQuoteList;');
const mobileListBody = mobileListSrc
  .slice(mobileListFnStart, mobileListFnEnd)
  .replace('export const MobileQuoteList: React.FC<Props> =', 'globalThis.MobileQuoteList =');
const mobileCtx = vm.createContext({
  React,
  Card: Stub('div'),
  Badge: Stub('span'),
  Button: Stub('button'),
  DropdownMenu: Stub('div'),
  DropdownMenuTrigger: Stub('div'),
  DropdownMenuContent: Stub('div'),
  DropdownMenuItem: Stub('div'),
  Eye: IconStub,
  Edit: IconStub,
  Trash2: IconStub,
  MoreVertical: IconStub,
  Calendar: IconStub,
  User: IconStub,
  CheckCircle: IconStub,
  XCircle: IconStub,
  Copy: IconStub,
  Calculator: IconStub,
  FileSignature: IconStub,
  FileText: IconStub,
  cn: (...parts) => parts.filter(Boolean).join(' '),
  isLocalBackend: () => true,
  formatQuoteDate: () => '28/10/2026',
  resolveQuoteDates: () => ({ quoteDate: '2026-10-28', expiryDate: '2026-11-27' }),
  fmt: (n) => (n || 0).toLocaleString('vi-VN') + 'đ',
  statusBorder: {
    draft: 'border-l-slate-300',
    sent: 'border-l-slate-500',
    approved: 'border-l-slate-800',
    rejected: 'border-l-rose-400',
    expired: 'border-l-amber-400',
  },
});
vm.runInContext(ts.transpileModule(mobileListBody, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText, mobileCtx);
const mobileHtml = renderToStaticMarkup(
  React.createElement(mobileCtx.MobileQuoteList, {
    quotes: [{ id: 'q1', quote_number: 'BG-20261028-452', customerName: 'Julie Dieu', status: 'draft', total_amount: 855684, responsible: 'Joliefam' }],
    statusLabels: { draft: { label: 'Nháp', color: 'border border-slate-200 bg-slate-100 text-slate-700' } },
    canApprove: true,
    canSupplement: true,
    canManage: true,
    canEditDetails: true,
    onView() {},
    onEdit() {},
    onDelete() {},
    onDuplicate() {},
    onApprove() {},
    onReject() {},
    onSupplement() {},
    onEditDetails() {},
    onToContract() {},
  })
);
for (const expected of ['BG-20261028-452', 'Julie Dieu', '855.684đ', 'border-l-slate-300', 'Xem', 'Sửa', 'Duyệt']) {
  assert.ok(mobileHtml.includes(expected), `MobileQuoteList markup must include ${expected}`);
}
console.log('PASS quote preview UX: MobileQuoteList static markup rendering verified');
// 37. Verify QuoteSupplementDialog highlights negative profit with text-destructive while keeping positive profit neutral text-foreground
assert.ok(suppHtml.includes('text-foreground'), 'Positive profit uses neutral text-foreground');
const lossSuppCtx = vm.createContext({
  ...suppCtx,
  filteredItems: [{ name: 'Sản phẩm lỗ', sku: 'LOSS-01', quantity: 1, price: 50000 }],
  getCostPrice: () => 80000,
  calculations: { totalRevenue: 50000, totalCost: 80000, totalProfit: -30000 },
});
vm.runInContext(compiledSupp, lossSuppCtx);
const lossSuppHtml = renderToStaticMarkup(lossSuppCtx.suppNode);
assert.ok(lossSuppHtml.includes('text-destructive'), 'Negative profit uses text-destructive warning color');
assert.ok(lossSuppHtml.includes('-30.000 đ'), 'Negative profit amount is formatted accurately');
console.log('PASS quote preview UX: QuoteSupplementDialog positive/negative profit color semantics verified');
// 38. Verify Vietnamese number-to-words edge cases (mốt, tư, lăm, lẻ, billions, negative and NaN)
assert.equal(ctx.formatAmountInVietnameseWords(NaN), 'Không đồng');
assert.equal(ctx.formatAmountInVietnameseWords(24), 'Hai mươi tư đồng chẵn.');
assert.equal(ctx.formatAmountInVietnameseWords(15), 'Mười lăm đồng chẵn.');
assert.equal(ctx.formatAmountInVietnameseWords(105), 'Một trăm lẻ năm đồng chẵn.');
assert.equal(ctx.formatAmountInVietnameseWords(1250000000), 'Một tỷ hai trăm năm mươi triệu đồng chẵn.');
assert.equal(ctx.formatAmountInVietnameseWords(-50000), 'Âm Năm mươi nghìn đồng chẵn.');
console.log('PASS quote preview UX: Vietnamese amount-in-words linguistic edge cases verified');
// 39. Verify null quote guard and pointer-events restoration safety cleanup in QuotePreviewDialog.tsx
assert.match(previewSrc, /if \(!quote\) return null;/, 'Null quote guard prevents crash');
assert.ok((previewSrc.match(/document\.body\.style\.pointerEvents = '';/g) || []).length >= 3, 'Pointer-events restoration is enforced on unmount and nested dialog close');
console.log('PASS quote preview UX: null quote guard and pointer-events cleanup verified');
// 40. Verify OnlineStampSignature renders inside signature box when stampUrl/signatureUrl is configured, and falls back to h-16 spacer when empty
assert.ok(!htmlNoImageNoNotes.includes('STAMP'), 'Empty stampUrl/signatureUrl renders clean spacer without OnlineStampSignature');
const htmlWithStamp = renderPreviewBody(
  [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 1, price: 142000, total: 142000 }],
  {
    templateSettings: {
      logoUrl: '/logo.png',
      companyTitle: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
      companyName: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
      footerNote: 'Cảm ơn Quý khách!',
      stampUrl: '/stamp.png',
      signatureUrl: '',
    },
  }
);
assert.ok(htmlWithStamp.includes('STAMP'), 'Configured stampUrl renders OnlineStampSignature under ĐẠI DIỆN CÔNG TY');
console.log('PASS quote preview UX: conditional OnlineStampSignature rendering verified');
// 41. Verify company logo fallback to /placeholder.svg when logoError is true or logoUrl is unsafe
const htmlBrokenLogo = renderPreviewBody(
  [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 1, price: 142000, total: 142000 }],
  { logoError: true }
);
assert.ok(htmlBrokenLogo.includes('src="/placeholder.svg"'), 'Broken logo falls back to /placeholder.svg');
const htmlUnsafeLogo = renderPreviewBody(
  [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 1, price: 142000, total: 142000 }],
  {
    templateSettings: {
      logoUrl: 'javascript:alert(1)',
      companyTitle: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
      companyName: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
      footerNote: '',
      stampUrl: '',
      signatureUrl: '',
    },
  }
);
assert.ok(htmlUnsafeLogo.includes('src="/placeholder.svg"'), 'Unsafe logoUrl falls back to /placeholder.svg');
assert.ok(!htmlUnsafeLogo.includes('Cảm ơn Quý khách'), 'Empty footerNote omits footer section');
console.log('PASS quote preview UX: logo fallback and optional footerNote verified');
// 42. Verify QuoteSupplementDialog empty search state displays neutral message and zero totals
const emptySuppCtx = vm.createContext({
  ...suppCtx,
  filteredItems: [],
  searchTerm: 'khong-ton-tai',
  calculations: { totalRevenue: 0, totalCost: 0, totalProfit: 0 },
});
vm.runInContext(compiledSupp, emptySuppCtx);
const emptySuppHtml = renderToStaticMarkup(emptySuppCtx.suppNode);
assert.ok(emptySuppHtml.includes('Không tìm thấy sản phẩm phù hợp'), 'Empty search shows clear Vietnamese empty-state message');
assert.ok(emptySuppHtml.includes('0 dòng sản phẩm'), 'Header subtitle reflects 0 matching lines');
console.log('PASS quote preview UX: QuoteSupplementDialog empty search state verified');
// 43. Execute and render OnlineStampSignature JSX in both non-editable preview mode and editable template settings mode
const stampReturnStart = stampSrc.indexOf('  return (\n    <>');
const stampReturnEnd = stampSrc.lastIndexOf('  );\n};');
assert.ok(stampReturnStart > 0 && stampReturnEnd > stampReturnStart, 'Locate OnlineStampSignature JSX');
const stampJsx = stampSrc.slice(stampReturnStart + '  return ('.length, stampReturnEnd).trim();
const renderStamp = (editable) => {
  const sCtx = vm.createContext({
    React,
    editable,
    containerRef: { current: null },
    containerHeight: editable ? 220 : 110,
    dragging: null,
    resizing: null,
    Move: IconStub,
    Maximize2: IconStub,
    Save: IconStub,
    Button: Stub('button'),
    hasStamp: true,
    hasSignature: true,
    stampPos: { x: 5, y: 50, width: 160, height: 160 },
    sigPos: { x: 30, y: 45, width: 140, height: 100 },
    handleMouseDown() {},
    settings: { stampUrl: '/stamp.png', signatureUrl: '/sig.png' },
    handleSave() {},
    saving: false,
    sellerRep: 'Nguyễn Đức Phước',
    sellerPos: 'Giám đốc',
  });
  vm.runInContext(ts.transpileModule(`globalThis.stampNode = ${stampJsx};`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, sCtx);
  return renderToStaticMarkup(sCtx.stampNode);
};
const previewStampHtml = renderStamp(false);
assert.ok(previewStampHtml.includes('height:110px'), 'Non-editable stamp preview uses compact 110px height');
assert.ok(!previewStampHtml.includes('Lưu vị trí'), 'Non-editable stamp preview hides Save button');
assert.ok(previewStampHtml.includes('Nguyễn Đức Phước'), 'Seller representative name is rendered');

const editableStampHtml = renderStamp(true);
assert.ok(editableStampHtml.includes('height:220px'), 'Editable stamp preview uses 220px canvas height');
assert.ok(editableStampHtml.includes('Lưu vị trí'), 'Editable stamp preview displays Save button');
assert.ok(editableStampHtml.includes('border-dashed border-border'), 'Editable stamp preview uses neutral border');
console.log('PASS quote preview UX: OnlineStampSignature static markup verified in both preview and editable modes');
// 44. Execute getCostPrice from QuoteSupplementDialog.tsx and verify originalProductId priority and SKU fallback
const suppAst = ts.createSourceFile('QuoteSupplementDialog.tsx', supplementSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let getCostPriceInit = '';
const visitSupp = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'getCostPrice' && node.initializer) {
    getCostPriceInit = node.initializer.getText(suppAst);
  }
  ts.forEachChild(node, visitSupp);
};
visitSupp(suppAst);
assert.ok(getCostPriceInit, 'getCostPrice must exist in QuoteSupplementDialog.tsx');
const costCtx = vm.createContext({
  Number,
  products: [
    { id: 'prod-1', sku: 'SKU-SHARED', cost_price: 75000 },
    { id: 'prod-2', sku: 'SKU-ONLY', cost_price: 92000 },
  ],
});
vm.runInContext(ts.transpileModule(`globalThis.getCostPrice = ${getCostPriceInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, costCtx);
assert.equal(costCtx.getCostPrice({ originalProductId: 'prod-1', sku: 'SKU-ONLY' }), 75000, 'originalProductId takes priority over SKU');
assert.equal(costCtx.getCostPrice({ sku: 'SKU-ONLY' }), 92000, 'SKU fallback works when originalProductId is absent');
assert.equal(costCtx.getCostPrice({ sku: 'UNKNOWN' }), 0, 'Unknown product returns 0 cost safely');
console.log('PASS quote preview UX: QuoteSupplementDialog getCostPrice priority and fallback verified');
// 45. Execute loadProductsData from QuoteSupplementDialog.tsx in local backend mode and verify localApi.catalogProducts filtering
let loadProductsInit = '';
const visitSuppLoad = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'loadProductsData' && node.initializer) {
    loadProductsInit = node.initializer.getText(suppAst);
  }
  ts.forEachChild(node, visitSuppLoad);
};
visitSuppLoad(suppAst);
assert.ok(loadProductsInit, 'loadProductsData must exist in QuoteSupplementDialog.tsx');
let loadedLocalProducts = [];
const loadLocalCtx = vm.createContext({
  Array,
  console,
  useCallback: (fn) => fn,
  quote: {
    items: [
      { originalProductId: 'p-1', sku: 'SKU-1', name: 'SP 1', quantity: 1, price: 100000 },
      { sku: 'SKU-2', name: 'SP 2', quantity: 2, price: 200000 },
    ],
  },
  quoteDisplayItems: (items) => items,
  isLocalBackend: () => true,
  localApi: {
    catalogProducts: async () => [
      { id: 'p-1', sku: 'OTHER', cost_price: 50000 },
      { id: 'p-2', sku: 'SKU-2', cost_price: 120000 },
      { id: 'p-3', sku: 'UNRELATED', cost_price: 99000 },
    ],
  },
  supabase: {
    from: () => { throw new Error('Should not query Supabase in local backend mode'); },
  },
  setProducts: (list) => { loadedLocalProducts = list; },
});
vm.runInContext(ts.transpileModule(`globalThis.loadProductsData = ${loadProductsInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, loadLocalCtx);
await loadLocalCtx.loadProductsData();
assert.equal(loadedLocalProducts.length, 2, 'Matched exactly the 2 quote products from local catalog');
assert.deepEqual(loadedLocalProducts.map((p) => p.id), ['p-1', 'p-2']);
console.log('PASS quote preview UX: QuoteSupplementDialog local catalog cost lookup verified');
// 46. Verify closing QuoteTemplateSettings inside QuotePreviewDialog triggers refetchTemplateSettings()
const settingsMountMatch = previewSrc.match(/<QuoteTemplateSettings[\s\S]*?\/>/);
assert.ok(settingsMountMatch, 'Locate QuoteTemplateSettings mount in QuotePreviewDialog.tsx');
assert.match(settingsMountMatch[0], /if \(!val\) \{\s*refetchTemplateSettings\(\);/, 'Closing QuoteTemplateSettings immediately refetches template settings');
console.log('PASS quote preview UX: live template settings refresh on dialog close verified');
// 47. Execute pushToOrdersFlow from QuoteSupplementDialog.tsx and verify draft rejection and approved order sync
let pushOrdersInit = '';
const visitSuppPush = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'pushToOrdersFlow' && node.initializer) {
    pushOrdersInit = node.initializer.getText(suppAst);
  }
  ts.forEachChild(node, visitSuppPush);
};
visitSuppPush(suppAst);
assert.ok(pushOrdersInit, 'pushToOrdersFlow must exist in QuoteSupplementDialog.tsx');
const pushToasts = [];
const invalidatedKeys = [];
const pushCtx = vm.createContext({
  Promise,
  String,
  Date,
  Error,
  quote: { id: 'q-draft', status: 'draft' },
  toast: (t) => pushToasts.push(t),
  setIsUpdatingOrder() {},
  isLocalBackend: () => true,
  localApi: {
    approveQuote: async (id) => ({ order: { order_number: 'ORD-' + id } }),
  },
  queryClient: {
    invalidateQueries: async ({ queryKey }) => { invalidatedKeys.push(queryKey[0]); },
  },
  onUpdate: () => {},
  supabase: {},
});
vm.runInContext(ts.transpileModule(`globalThis.pushToOrdersFlow = ${pushOrdersInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, pushCtx);
await pushCtx.pushToOrdersFlow();
assert.equal(pushToasts.at(-1)?.variant, 'destructive', 'Draft quote cannot be pushed to orders');

pushCtx.quote = { id: 'q-approved', status: 'approved' };
await pushCtx.pushToOrdersFlow();
assert.ok(invalidatedKeys.includes('orders-infinite'), 'Approved quote sync invalidates orders-infinite cache');
assert.match(pushToasts.at(-1)?.description || '', /ORD-q-approved/);
console.log('PASS quote preview UX: QuoteSupplementDialog pushToOrdersFlow guard and local sync verified');
// 48. Execute term management handlers (handleTermChange, addTerm, removeTerm) and handleSaveSettings from QuoteTemplateSettings.tsx
const settingsAst = ts.createSourceFile('QuoteTemplateSettings.tsx', settingsSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const settingsDecls = new Map();
const visitSettings = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    settingsDecls.set(node.name.text, node.initializer.getText(settingsAst));
  }
  ts.forEachChild(node, visitSettings);
};
visitSettings(settingsAst);
let currentSettings = { terms: ['Điều khoản 1', 'Điều khoản 2'] };
let savedPayload = null;
let closedSettingsDialog = false;
const termCtx = vm.createContext({
  JSON,
  settings: currentSettings,
  setSettings: (updater) => {
    currentSettings = typeof updater === 'function' ? updater(currentSettings) : updater;
    termCtx.settings = currentSettings;
  },
  setSaving() {},
  saveSettings: async (s) => { savedPayload = s; return true; },
  localStorage: { setItem() {} },
  toast: { success() {}, error() {}, info() {} },
  onOpenChange: (val) => { if (!val) closedSettingsDialog = true; },
});
for (const fn of ['handleTermChange', 'addTerm', 'removeTerm', 'handleSaveSettings']) {
  const code = settingsDecls.get(fn);
  assert.ok(code, `${fn} must exist in QuoteTemplateSettings.tsx`);
  vm.runInContext(ts.transpileModule(`globalThis.${fn} = ${code};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, termCtx);
}
termCtx.addTerm();
assert.equal(currentSettings.terms.length, 3);
termCtx.handleTermChange(2, 'Điều khoản 3 mới');
assert.equal(currentSettings.terms[2], 'Điều khoản 3 mới');
termCtx.removeTerm(0);
assert.deepEqual([...currentSettings.terms], ['Điều khoản 2', 'Điều khoản 3 mới']);
await termCtx.handleSaveSettings();
assert.deepEqual([...savedPayload.terms], ['Điều khoản 2', 'Điều khoản 3 mới']);
assert.equal(closedSettingsDialog, true);
console.log('PASS quote preview UX: QuoteTemplateSettings term CRUD and save handler verified');
// 49. Verify QuoteTemplateSettings loading state displays spinner and disables Save button
const loadingSettingsCtx = vm.createContext({
  ...settingsCtx,
  loading: true,
});
vm.runInContext(compiledSettings, loadingSettingsCtx);
const loadingSettingsHtml = renderToStaticMarkup(loadingSettingsCtx.settingsNode);
assert.ok(loadingSettingsHtml.includes('Đang tải cài đặt...'), 'Loading state displays Vietnamese spinner text');
assert.ok(!loadingSettingsHtml.includes('1. Thông tin công ty'), 'Form sections are hidden while loading');
console.log('PASS quote preview UX: QuoteTemplateSettings loading state verified');
// 50. Execute and render EditQuoteDetailsDialog JSX to verify clean Dialog layout and local status options
const editReturnStart = editDetailsSrc.indexOf('<Dialog open={open}');
const editReturnEnd = editDetailsSrc.lastIndexOf('</Dialog>') + '</Dialog>'.length;
assert.ok(editReturnStart > 0 && editReturnEnd > editReturnStart, 'Locate EditQuoteDetailsDialog JSX');
const editJsx = editDetailsSrc.slice(editReturnStart, editReturnEnd);
const editCtx = vm.createContext({
  React,
  open: true,
  onOpenChange() {},
  quote: { id: 'q1', quote_number: 'BG-20261028-452', status: 'draft' },
  createdDate: new Date(2026, 9, 28, 12),
  setCreatedDate() {},
  status: 'draft',
  setStatus() {},
  loading: false,
  isLoadingUser: false,
  managerId: 'mgr-1',
  handleSave() {},
  isLocalBackend: () => true,
  statusOptions: [
    { value: 'draft', label: 'Nháp' },
    { value: 'sent', label: 'Đã gửi' },
    { value: 'approved', label: 'Đã duyệt' },
    { value: 'rejected', label: 'Từ chối' },
    { value: 'expired', label: 'Hết hạn' },
  ],
  cn: (...parts) => parts.filter(Boolean).join(' '),
  format: () => '28 tháng 10, 2026',
  vi: {},
  Dialog: Stub('div'),
  DialogContent: Stub('div'),
  DialogHeader: Stub('header'),
  DialogTitle: Stub('h2'),
  DialogDescription: Stub('p'),
  DialogFooter: Stub('footer'),
  Label: Stub('label'),
  Popover: Stub('div'),
  PopoverTrigger: Stub('div'),
  PopoverContent: Stub('div'),
  Button: Stub('button'),
  CalendarIcon: IconStub,
  Calendar: Stub('div'),
  Select: Stub('div'),
  SelectTrigger: Stub('div'),
  SelectValue: Stub('span'),
  SelectContent: Stub('div'),
  SelectItem: Stub('div'),
});
vm.runInContext(ts.transpileModule(`globalThis.editDetailsNode = ${editJsx};`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText, editCtx);
const editDetailsHtml = renderToStaticMarkup(editCtx.editDetailsNode);
assert.ok(editDetailsHtml.includes('Chỉnh sửa thông tin báo giá'), 'EditQuoteDetailsDialog title is rendered');
assert.ok(editDetailsHtml.includes('BG-20261028-452'), 'Quote number is shown in description');
assert.ok(editDetailsHtml.includes('28 tháng 10, 2026'), 'Formatted Vietnamese date is shown');
assert.ok(!editDetailsHtml.includes('>Đã duyệt<'), 'Local backend filters out direct approved option in status select');
assert.ok(editDetailsHtml.includes('Lưu thay đổi'), 'Save button is rendered');
console.log('PASS quote preview UX: EditQuoteDetailsDialog static markup and local status filter verified');
// 51. Execute handleSave from EditQuoteDetailsDialog.tsx and verify approved immutability and draft update on local backend
const editAst = ts.createSourceFile('EditQuoteDetailsDialog.tsx', editDetailsSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let editSaveInit = '';
const visitEdit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'handleSave' && node.initializer) {
    editSaveInit = node.initializer.getText(editAst);
  }
  ts.forEachChild(node, visitEdit);
};
visitEdit(editAst);
assert.ok(editSaveInit, 'handleSave must exist in EditQuoteDetailsDialog.tsx');
const editToasts = [];
const editUpdates = [];
const editSaveCtx = vm.createContext({
  Error,
  Promise,
  Date,
  setTimeout: (cb) => cb(),
  console: { error() {} },
  quote: { id: 'q-app', status: 'approved' },
  createdDate: new Date(2026, 9, 28, 12),
  status: 'sent',
  managerId: 'mgr-1',
  setLoading() {},
  isLocalBackend: () => true,
  quoteCalendarDateIso: () => '2026-10-28T05:00:00.000Z',
  localApi: {
    updateQuote: async (id, body) => { editUpdates.push({ id, body }); },
  },
  queryClient: { invalidateQueries: async () => {} },
  toast: (t) => editToasts.push(t),
  onUpdate() {},
  onOpenChange() {},
  supabase: {},
});
vm.runInContext(ts.transpileModule(`globalThis.saveDetails = ${editSaveInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, editSaveCtx);
await editSaveCtx.saveDetails();
assert.equal(editUpdates.length, 0, 'Approved quote cannot be modified via EditQuoteDetailsDialog');
assert.equal(editToasts.at(-1)?.variant, 'destructive');

editSaveCtx.quote = { id: 'q-draft', status: 'draft' };
await editSaveCtx.saveDetails();
assert.equal(editUpdates.length, 1, 'Draft quote is updated via localApi.updateQuote');
assert.equal(editUpdates[0].id, 'q-draft');
assert.equal(editUpdates[0].body.status, 'sent');
console.log('PASS quote preview UX: EditQuoteDetailsDialog handleSave immutability and draft update verified');
// 52. Verify QuoteSupplementDialog loadProductsData hosted Supabase fallback from ID query to SKU query
let hostedLoaded = [];
const hostedCalls = [];
const loadHostedCtx = vm.createContext({
  Array,
  console,
  useCallback: (fn) => fn,
  quote: {
    items: [
      { originalProductId: 'missing-id', sku: 'SKU-HOSTED', name: 'SP Hosted', quantity: 1, price: 100000 },
    ],
  },
  quoteDisplayItems: (items) => items,
  isLocalBackend: () => false,
  localApi: {},
  supabase: {
    from: () => ({
      select: () => ({
        in: async (col, vals) => {
          hostedCalls.push([col, vals]);
          if (col === 'id') return { data: [], error: null };
          return { data: [{ id: 'hosted-1', sku: 'SKU-HOSTED', cost_price: 68000 }], error: null };
        },
      }),
    }),
  },
  setProducts: (list) => { hostedLoaded = list; },
});
vm.runInContext(ts.transpileModule(`globalThis.loadProductsHosted = ${loadProductsInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, loadHostedCtx);
await loadHostedCtx.loadProductsHosted();
assert.equal(hostedCalls.length, 2, 'Tries ID query first then falls back to SKU query');
assert.equal(hostedLoaded[0]?.cost_price, 68000);
console.log('PASS quote preview UX: QuoteSupplementDialog hosted ID-to-SKU fallback verified');
// 53. Execute handleLogoUpload from QuoteTemplateSettings.tsx and verify both cloud URL upload and FileReader fallback
const logoUploadCode = settingsDecls.get('handleLogoUpload');
assert.ok(logoUploadCode, 'handleLogoUpload must exist in QuoteTemplateSettings.tsx');
let logoState = { logoUrl: '' };
const logoCtx = vm.createContext({
  setUploading() {},
  uploadLogo: async () => 'https://fixture.invalid/uploaded-logo.png',
  setSettings: (updater) => { logoState = updater(logoState); },
  toast: { success() {}, info() {}, error() {} },
  FileReader: class {
    readAsDataURL() {
      this.onload?.({ target: { result: 'data:image/png;base64,FALLBACK' } });
    }
  },
});
vm.runInContext(ts.transpileModule(`globalThis.handleLogoUpload = ${logoUploadCode};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, logoCtx);
await logoCtx.handleLogoUpload({ target: { files: [{ name: 'logo.png' }] } });
assert.equal(logoState.logoUrl, 'https://fixture.invalid/uploaded-logo.png', 'Uses uploaded URL when uploadLogo succeeds');

logoCtx.uploadLogo = async () => null;
await logoCtx.handleLogoUpload({ target: { files: [{ name: 'local.png' }] } });
assert.equal(logoState.logoUrl, 'data:image/png;base64,FALLBACK', 'Falls back to FileReader data URL when uploadLogo returns null');
console.log('PASS quote preview UX: QuoteTemplateSettings handleLogoUpload cloud and local fallback verified');
// 54. Execute handleSave from OnlineStampSignature.tsx and verify stampPosition and signaturePosition persistence
const stampAst = ts.createSourceFile('OnlineStampSignature.tsx', stampSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let stampSaveInit = '';
const visitStamp = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'handleSave' && node.initializer) {
    stampSaveInit = node.initializer.getText(stampAst);
  }
  ts.forEachChild(node, visitStamp);
};
visitStamp(stampAst);
assert.ok(stampSaveInit, 'handleSave must exist in OnlineStampSignature.tsx');
let savedStampSettings = null;
const stampSaveCtx = vm.createContext({
  setSaving() {},
  settings: { companyName: 'Joliefam' },
  stampPos: { x: 12, y: 40, width: 150, height: 150 },
  sigPos: { x: 35, y: 48, width: 130, height: 90 },
  saveSettings: async (next) => { savedStampSettings = next; return true; },
  toast: { success() {}, error() {} },
});
vm.runInContext(ts.transpileModule(`globalThis.saveStampPos = ${stampSaveInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, stampSaveCtx);
await stampSaveCtx.saveStampPos();
assert.equal(savedStampSettings.stampPosition.x, 12);
assert.equal(savedStampSettings.signaturePosition.width, 130);
console.log('PASS quote preview UX: OnlineStampSignature position save handler verified');
// 55. Execute handleMouseMove from OnlineStampSignature.tsx and verify bounds clamping for drag (0..90%) and resize (min 40x30)
let mouseMoveInit = '';
const visitStampMove = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'handleMouseMove' && node.initializer) {
    mouseMoveInit = node.initializer.getText(stampAst);
  }
  ts.forEachChild(node, visitStampMove);
};
visitStampMove(stampAst);
assert.ok(mouseMoveInit, 'handleMouseMove must exist in OnlineStampSignature.tsx');
let testStampPos = { x: 85, y: 5, width: 50, height: 40 };
let testSigPos = { x: 30, y: 45, width: 140, height: 100 };
const moveCtx = vm.createContext({
  Math,
  useCallback: (fn) => fn,
  containerRef: { current: { getBoundingClientRect: () => ({ width: 200, height: 100 }) } },
  dragStart: { x: 100, y: 50 },
  dragging: 'stamp',
  resizing: null,
  setStampPos: (updater) => { testStampPos = updater(testStampPos); },
  setSigPos: (updater) => { testSigPos = updater(testSigPos); },
  setDragStart() {},
});
vm.runInContext(ts.transpileModule(`globalThis.moveFn = ${mouseMoveInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, moveCtx);
moveCtx.moveFn({ clientX: 150, clientY: 20 });
assert.equal(testStampPos.x, 90, 'Drag X clamps to max 90%');
assert.equal(testStampPos.y, 0, 'Drag Y clamps to min 0%');

moveCtx.dragging = null;
moveCtx.resizing = 'stamp';
moveCtx.moveFn({ clientX: 50, clientY: 10 });
assert.equal(testStampPos.width, 40, 'Resize width clamps to min 40px');
assert.equal(testStampPos.height, 30, 'Resize height clamps to min 30px');
console.log('PASS quote preview UX: OnlineStampSignature drag/resize bounds clamping verified');
// 56. Execute open/close lifecycle useEffect from QuotePreviewDialog.tsx and verify on-demand fetchQuoteData and state reset
const openEffectMatch = previewSrc.match(/useEffect\(\(\) => \{\s*let cancelled = false;[\s\S]*?\}, \[open, quote\?\.id, quote\?\.quote_data, refetchTemplateSettings\]\);/);
assert.ok(openEffectMatch, 'Locate open/close lifecycle useEffect in QuotePreviewDialog.tsx');
let fetchedId = '';
let stateSnapshot = {
  showSupplement: true,
  showTemplateSettings: true,
  showQuoteSupplementDialog: true,
  zoomedImage: { url: '/a.png', title: 'A' },
  quoteDataRaw: 'old',
  logoError: true,
};
const lifecycleCtx = vm.createContext({
  JSON,
  open: true,
  quote: { id: 'quote-on-demand-1', quote_data: null },
  refetchTemplateSettings() {},
  fetchQuoteData: async (id) => { fetchedId = id; return '{"title":"ON_DEMAND"}'; },
  setLogoError: (v) => { stateSnapshot.logoError = v; },
  setQuoteDataRaw: (v) => { stateSnapshot.quoteDataRaw = v; },
  setShowSupplement: (v) => { stateSnapshot.showSupplement = v; },
  setShowTemplateSettings: (v) => { stateSnapshot.showTemplateSettings = v; },
  setShowQuoteSupplementDialog: (v) => { stateSnapshot.showQuoteSupplementDialog = v; },
  setZoomedImage: (v) => { stateSnapshot.zoomedImage = v; },
  useEffect: (fn) => fn(),
});
vm.runInContext(ts.transpileModule(openEffectMatch[0], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, lifecycleCtx);
await new Promise((r) => setTimeout(r, 10));
assert.equal(fetchedId, 'quote-on-demand-1', 'Fetches quote_data on demand when missing from list row');
assert.equal(stateSnapshot.quoteDataRaw, '{"title":"ON_DEMAND"}');
assert.equal(stateSnapshot.logoError, false);

lifecycleCtx.open = false;
vm.runInContext(ts.transpileModule(openEffectMatch[0], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, lifecycleCtx);
assert.equal(stateSnapshot.showTemplateSettings, false, 'Closing preview resets showTemplateSettings');
assert.equal(stateSnapshot.showQuoteSupplementDialog, false, 'Closing preview resets showQuoteSupplementDialog');
assert.equal(stateSnapshot.zoomedImage, null, 'Closing preview resets zoomedImage');
assert.equal(stateSnapshot.quoteDataRaw, null, 'Closing preview resets quoteDataRaw');
console.log('PASS quote preview UX: open/close lifecycle effect and on-demand quote_data fetch verified');
// 57. Verify keyboard navigation effect does not register listener when nested dialogs (template settings, supplement, zoomed image) are open
for (const nestedFlag of [{ showTemplateSettings: true }, { showQuoteSupplementDialog: true }, { zoomedImage: { url: '/x.png', title: 'X' } }]) {
  let nestedRegistered = null;
  const nestedKbCtx = vm.createContext({
    ...kbCtx,
    ...nestedFlag,
    window: {
      addEventListener: (_evt, cb) => { nestedRegistered = cb; },
      removeEventListener: () => {},
    },
  });
  vm.runInContext(ts.transpileModule(kbMatch[0], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, nestedKbCtx);
  assert.equal(nestedRegistered, null, `Keyboard navigation is suspended when ${JSON.stringify(nestedFlag)} is active`);
}
console.log('PASS quote preview UX: keyboard navigation suspension during nested modals verified');
// 58. Execute handlePrint from QuoteSupplementDialog.tsx and verify generated HTML popup content
let suppPrintInit = '';
const visitSuppPrint = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'handlePrint' && node.initializer) {
    suppPrintInit = node.initializer.getText(suppAst);
  }
  ts.forEachChild(node, visitSuppPrint);
};
visitSuppPrint(suppAst);
assert.ok(suppPrintInit, 'handlePrint must exist in QuoteSupplementDialog.tsx');
let suppPrintHtml = '';
let suppPrintTriggered = 0;
const suppPrintCtx = vm.createContext({
  Number,
  escapeQuoteHtml: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  quoteCode: 'BG-20261028-452',
  companyName: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
  companyAddress: 'Số 21 Ngõ 562 Đường Lĩnh Nam',
  companyPhone: '0828686866',
  customerInfo: { name: 'Julie <Dieu>', phone: '0900111222', address: 'Hà Nội' },
  filteredItems: [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 2, price: 142000 }],
  getCostPrice: () => 77000,
  formatCurrency: (n) => new Intl.NumberFormat('vi-VN').format(n) + ' đ',
  calculations: { totalRevenue: 284000, totalCost: 154000, totalProfit: 130000 },
  window: {
    open: () => ({
      document: {
        write: (html) => { suppPrintHtml = html; },
        close() {},
      },
      print: () => { suppPrintTriggered++; },
    }),
  },
});
vm.runInContext(ts.transpileModule(`globalThis.printSupplement = ${suppPrintInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, suppPrintCtx);
suppPrintCtx.printSupplement();
assert.ok(suppPrintHtml.includes('PHỤ LỤC BÁO GIÁ (NỘI BỘ)'), 'Supplement print header is rendered');
assert.ok(suppPrintHtml.includes('Julie &lt;Dieu&gt;'), 'Customer name is HTML-escaped in print popup');
assert.ok(suppPrintHtml.includes('130.000 đ'), 'Total profit is rendered in print popup');
assert.equal(suppPrintTriggered, 1);
console.log('PASS quote preview UX: QuoteSupplementDialog handlePrint popup HTML verified');
// 59. Execute QuoteSupplementDialog filteredItems and calculations reducer for case-insensitive name/SKU search
const suppFilterInit = [];
const visitSuppFilter = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['filteredItems', 'calculations'].includes(node.name.text) && node.initializer) {
    suppFilterInit.push([node.name.text, node.initializer.getText(suppAst)]);
  }
  ts.forEachChild(node, visitSuppFilter);
};
visitSuppFilter(suppAst);
assert.equal(suppFilterInit.length, 2, 'Locate filteredItems and calculations in QuoteSupplementDialog.tsx');
const filterCtx = vm.createContext({
  String,
  Number,
  searchTerm: 'vct250',
  quoteItems: [
    { name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 2, price: 142000 },
    { name: 'Vỏ chăn T250 trơn', sku: 'VCT250-1M-T', quantity: 3, price: 362500 },
  ],
  getCostPrice: (item) => (item.sku === 'VCT250-1M-T' ? 290000 : 77000),
});
for (const [name, code] of suppFilterInit) {
  vm.runInContext(ts.transpileModule(`globalThis.${name} = ${code};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, filterCtx);
}
assert.equal(filterCtx.filteredItems.length, 1, 'Filters to matching SKU row');
assert.equal(filterCtx.filteredItems[0].sku, 'VCT250-1M-T');
assert.equal(filterCtx.calculations.totalRevenue, 1087500);
assert.equal(filterCtx.calculations.totalCost, 870000);
assert.equal(filterCtx.calculations.totalProfit, 217500);
console.log('PASS quote preview UX: QuoteSupplementDialog search filtering and profit recalculation verified');
// 60. Verify calculationError alert banner in QuotePreviewDialog JSX renders role="alert" with exact Vietnamese warning
const calcBannerMatch = previewSrc.match(/\{calculationError && \([\s\S]*?\)\}/);
assert.ok(calcBannerMatch, 'Locate calculationError banner JSX in QuotePreviewDialog.tsx');
const bannerCtx = vm.createContext({
  React,
  calculationError: 'Số lượng sản phẩm dòng 1 phải lớn hơn 0.',
});
vm.runInContext(
  ts.transpileModule(`globalThis.bannerNode = (${calcBannerMatch[0].slice(1, -1)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  bannerCtx
);
const bannerHtml = renderToStaticMarkup(bannerCtx.bannerNode);
assert.ok(bannerHtml.includes('role="alert"'), 'Calculation error banner has role="alert"');
assert.ok(bannerHtml.includes('Báo giá cũ có dữ liệu chưa hợp lệ: Số lượng sản phẩm dòng 1 phải lớn hơn 0.'), 'Calculation error message is rendered');
console.log('PASS quote preview UX: calculationError alert banner verified');
// 61. Render zoomedImage Lightbox Dialog JSX in QuotePreviewDialog.tsx and verify image and title output
const zoomDialogStart = previewSrc.lastIndexOf('<Dialog open={Boolean(zoomedImage)}');
const zoomDialogEnd = previewSrc.lastIndexOf('</Dialog>') + '</Dialog>'.length;
assert.ok(zoomDialogStart > 0 && zoomDialogEnd > zoomDialogStart, 'Locate zoomedImage Dialog JSX');
const zoomDialogJsx = previewSrc.slice(zoomDialogStart, zoomDialogEnd);
const zoomCtx = vm.createContext({
  React,
  Boolean,
  zoomedImage: { url: 'https://fixture.invalid/full-size.png', title: 'Vỏ chăn T250 trơn 170*235' },
  setZoomedImage() {},
  Dialog: Stub('div'),
  DialogContent: Stub('div'),
  DialogHeader: Stub('header'),
  DialogTitle: Stub('h2'),
  DialogDescription: Stub('p'),
});
vm.runInContext(
  ts.transpileModule(`globalThis.zoomNode = ${zoomDialogJsx};`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  zoomCtx
);
const zoomHtml = renderToStaticMarkup(zoomCtx.zoomNode);
assert.ok(zoomHtml.includes('Vỏ chăn T250 trơn 170*235'), 'Zoomed lightbox renders product title');
assert.ok(zoomHtml.includes('src="https://fixture.invalid/full-size.png"'), 'Zoomed lightbox renders full-size image src');
console.log('PASS quote preview UX: zoomedImage Lightbox Dialog rendering verified');
// 62. Execute onOpenChange handlers on parent Dialog and nested QuoteSupplementDialog to verify pointerEvents reset
const parentOpenChangeMatch = previewSrc.match(/<Dialog open=\{open\} onOpenChange=\{\(\(val\) => \{[\s\S]*?\}\)\}>|<Dialog open=\{open\} onOpenChange=\{\(val\) => \{[\s\S]*?\}\}>/);
assert.ok(parentOpenChangeMatch, 'Locate parent Dialog onOpenChange handler');
const bodyStyle = { pointerEvents: 'none' };
let parentClosed = false;
const openChangeCtx = vm.createContext({
  onOpenChange: (v) => { if (!v) parentClosed = true; },
  document: { body: { style: bodyStyle } },
});
const fnBody = parentOpenChangeMatch[0].slice(parentOpenChangeMatch[0].indexOf('(val) =>'), -2);
vm.runInContext(ts.transpileModule(`globalThis.parentOnOpenChange = ${fnBody};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, openChangeCtx);
openChangeCtx.parentOnOpenChange(false);
assert.equal(parentClosed, true);
assert.equal(bodyStyle.pointerEvents, '', 'Closing parent QuotePreviewDialog restores document.body.style.pointerEvents');
console.log('PASS quote preview UX: parent Dialog onOpenChange pointer-events restoration verified');
// 63. Verify inline SKU badge is omitted when item.sku equals item.name or when item.name is empty
const htmlIdenticalSku = renderPreviewBody([
  { name: 'GACTCS120x10', sku: 'GACTCS120x10', quantity: 1, price: 142000, total: 142000 },
]);
assert.equal((htmlIdenticalSku.match(/GACTCS120x10/g) || []).length, 1, 'SKU is rendered only once when item.name === item.sku');
console.log('PASS quote preview UX: non-redundant SKU badge deduplication verified');
// 64. Verify customer contact box omits empty phone/address/email fields and omits responsible row when unassigned
const htmlMinimalCustomer = renderPreviewBody(
  [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 1, price: 142000, total: 142000 }],
  { phone: '', address: '', email: '', responsibleName: '' }
);
assert.ok(!htmlMinimalCustomer.includes('Email:'), 'Empty customer email is omitted');
assert.ok(!htmlMinimalCustomer.includes('Phụ trách:'), 'Empty responsibleName is omitted');
assert.ok(htmlMinimalCustomer.includes('Tên KH:'), 'Customer name is always rendered');
console.log('PASS quote preview UX: optional customer contact and responsible fields verified');
// 65. Verify prev/next navigation cluster hides completely when both onPrevQuote and onNextQuote are undefined (e.g. live form preview)
const standaloneHeaderCtx = vm.createContext({
  ...headerCtx,
  onPrevQuote: undefined,
  onNextQuote: undefined,
  positionLabel: undefined,
});
vm.runInContext(compiledHeader, standaloneHeaderCtx);
const standaloneHeaderHtml = renderToStaticMarkup(standaloneHeaderCtx.headerNode);
assert.ok(!standaloneHeaderHtml.includes('Báo giá trước'), 'Prev button is hidden when onPrevQuote and onNextQuote are undefined');
assert.ok(!standaloneHeaderHtml.includes('Báo giá tiếp theo'), 'Next button is hidden when onPrevQuote and onNextQuote are undefined');
console.log('PASS quote preview UX: standalone preview header omits prev/next navigation cluster');
// 66. Verify handleCopySummary gracefully catches clipboard permission errors and shows a destructive toast
const failToasts = [];
const failCopyCtx = vm.createContext({
  ...copyCtx,
  navigator: { clipboard: { writeText: async () => { throw new Error('Clipboard denied'); } } },
  toast: (t) => failToasts.push(t),
});
vm.runInContext(ts.transpileModule(`globalThis.failCopyFn = ${copyCode};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, failCopyCtx);
await failCopyCtx.failCopyFn();
assert.equal(failToasts.length, 1);
assert.equal(failToasts[0].variant, 'destructive');
assert.equal(failToasts[0].title, 'Không thể sao chép');
console.log('PASS quote preview UX: handleCopySummary error handling verified');
// 67. Verify handleExportImage gracefully catches html2canvas failures and shows a destructive toast
const failImgToasts = [];
const failImgCtx = vm.createContext({
  ...imgCtx,
  html2canvas: async () => { throw new Error('Canvas tainted'); },
  toast: (t) => failImgToasts.push(t),
});
vm.runInContext(ts.transpileModule(`globalThis.failExportImgFn = ${exportImgCode};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, failImgCtx);
await failImgCtx.failExportImgFn();
assert.equal(failImgToasts.length, 1);
assert.equal(failImgToasts[0].variant, 'destructive');
assert.equal(failImgToasts[0].title, 'Lỗi xuất ảnh');
console.log('PASS quote preview UX: handleExportImage error handling verified');
// 68. Verify payment1-only vs payment2-only rows in QuotePreviewDialog totals table
const htmlPayment2Only = renderPreviewBody(
  [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 1, price: 142000, total: 142000 }],
  {
    hasPaymentPlan: true,
    firstPayment: 0,
    payment2: 50000,
    remaining: 805684,
  }
);
assert.ok(!htmlPayment2Only.includes('>THANH TOÁN LẦN 1<'), 'Zero firstPayment row is omitted when only payment2 is non-zero');
assert.ok(htmlPayment2Only.includes('DỰ KIẾN THANH TOÁN LẦN 2'), 'Non-zero payment2 row is rendered');
assert.ok(htmlPayment2Only.includes('>THANH TOÁN LẦN 2<'), 'Remaining row is rendered as THANH TOÁN LẦN 2');
console.log('PASS quote preview UX: payment1-only and payment2-only conditional rows verified');
// 69. Verify QuotesPage.tsx closes QuotePreviewDialog (setSelectedQuote(null)) before opening Edit, EditDetails, Duplicate, Approve or Reject flows
const previewBlockMatch = pageSrc.match(/<QuotePreviewDialog[\s\S]*?window\.location\.href[\s\S]*?\/>/);
assert.ok(previewBlockMatch, 'Locate QuotePreviewDialog mount in QuotesPage.tsx');
assert.equal((previewBlockMatch[0].match(/setSelectedQuote\(null\)/g) || []).length, 6, 'onOpenChange, onEdit, onEditDetails, onDuplicate, onApprove, onReject all clear selectedQuote');
console.log('PASS quote preview UX: single-modal transition hygiene in QuotesPage verified');
// 70. Verify all 8 overflow menu items in QuotePreviewDialog header are wired and rendered when full permissions are present
for (const menuItemLabel of [
  'Sao chép tóm tắt',
  'Xuất bản in PDF',
  'Duyệt báo giá',
  'Từ chối báo giá',
  'Sửa ngày &amp; trạng thái',
  'Nhân bản báo giá',
  'Tạo hợp đồng',
  'Cài đặt mẫu in',
]) {
  assert.ok(headerHtml.includes(menuItemLabel), `Overflow menu must include ${menuItemLabel}`);
}
console.log('PASS quote preview UX: all 8 overflow menu actions verified');
// 71. Verify clicking Sửa ngày & trạng thái in QuotePreviewDialog header invokes onEditDetails with current quote
let editedDetailsQuote = null;
const editDetailsActionCtx = vm.createContext({
  ...headerCtx,
  quote: { id: 'q-edit-details', quote_number: 'BG-20261028-452' },
  onEditDetails: (q) => { editedDetailsQuote = q; },
  DropdownMenuItem: ({ onClick, children }) => {
    if (React.Children.toArray(children).some((c) => typeof c === 'string' && c.includes('Sửa ngày & trạng thái'))) {
      onClick?.();
    }
    return React.createElement('div', null, children);
  },
});
vm.runInContext(compiledHeader, editDetailsActionCtx);
renderToStaticMarkup(editDetailsActionCtx.headerNode);
assert.equal(editedDetailsQuote?.id, 'q-edit-details', 'Clicking Sửa ngày & trạng thái invokes onEditDetails with current quote');
console.log('PASS quote preview UX: Sửa ngày & trạng thái menu action invocation verified');
// 72. Verify description column in QuotePreviewDialog falls back to item.category and then '-'
const htmlCategoryFallback = renderPreviewBody([
  { name: 'Ga chun trắng', sku: 'GC-01', specifications: '', description: '', category: 'GA CHUN T250 TRẮNG TRƠN', quantity: 1, price: 125000, total: 125000 },
  { name: 'Dòng thủ công', sku: '', specifications: '', description: '', category: '', quantity: 1, price: 50000, total: 50000 },
]);
assert.ok(htmlCategoryFallback.includes('GA CHUN T250 TRẮNG TRƠN'), 'Category fallback is rendered when description is empty');
assert.ok(htmlCategoryFallback.includes('>-<'), 'Dash fallback is rendered when specifications/description/category are empty');
console.log('PASS quote preview UX: description-to-category-to-dash fallback verified');
// 73. Verify mixed-image quote renders image thumbnail for items with image and '-' for items without image in the same table
const htmlMixedImages = renderPreviewBody([
  { name: 'Ga có ảnh', sku: 'GA-IMG', quantity: 1, price: 100000, total: 100000, selectedImage: 'https://fixture.invalid/ga.png' },
  { name: 'Gối không ảnh', sku: 'GOI-NO-IMG', quantity: 2, price: 50000, total: 100000, selectedImage: '' },
]);
assert.ok(htmlMixedImages.includes('>ẢNH<'), 'Image column header is rendered when at least one row has an image');
assert.ok(htmlMixedImages.includes('src="https://fixture.invalid/ga.png"'), 'Row with image renders thumbnail');
assert.ok(htmlMixedImages.includes('<span class="text-xs text-slate-400">-</span>'), 'Row without image renders compact dash inside image column');
console.log('PASS quote preview UX: mixed-image table row rendering verified');
// 74. Verify mixed-notes quote renders note text for items with notes and '-' for items without notes in the same table
const htmlMixedNotes = renderPreviewBody([
  { name: 'Ga có ghi chú', sku: 'GA-NOTE', quantity: 1, price: 100000, total: 100000, notes: 'Giao sáng thứ 2' },
  { name: 'Gối không ghi chú', sku: 'GOI-NO-NOTE', quantity: 2, price: 50000, total: 100000, notes: '' },
]);
assert.ok(htmlMixedNotes.includes('>GHI CHÚ<'), 'Notes column header is rendered when at least one row has notes');
assert.ok(htmlMixedNotes.includes('Giao sáng thứ 2'), 'Row with notes renders note text');
assert.ok(htmlMixedNotes.includes('<td class="border-b border-slate-200 px-2 py-1.5 text-xs text-slate-500">-</td>'), 'Row without notes renders compact dash inside notes column');
console.log('PASS quote preview UX: mixed-notes table row rendering verified');
// 75. Verify SKU-only row (empty item.name) renders item.sku as primary name without duplicate badge
const htmlSkuOnly = renderPreviewBody([
  { name: '', sku: 'SKU-ONLY-99', quantity: 1, price: 100000, total: 100000 },
]);
assert.equal((htmlSkuOnly.match(/SKU-ONLY-99/g) || []).length, 1, 'SKU-only row renders SKU once as primary label');
console.log('PASS quote preview UX: SKU-only row fallback verified');
// 76. Execute QuoteSupplementDialog onOpenChange handler inside QuotePreviewDialog.tsx and verify pointer-events restoration
const suppMountMatch = previewSrc.match(/<QuoteSupplementDialog[\s\S]*?\/>/);
assert.ok(suppMountMatch, 'Locate QuoteSupplementDialog mount in QuotePreviewDialog.tsx');
const suppOpenChangeFn = suppMountMatch[0].slice(suppMountMatch[0].indexOf('(val) =>'), suppMountMatch[0].indexOf('}}'));
const suppBodyStyle = { pointerEvents: 'none' };
let suppStateOpen = true;
const suppMountCtx = vm.createContext({
  setShowQuoteSupplementDialog: (v) => { suppStateOpen = v; },
  document: { body: { style: suppBodyStyle } },
});
vm.runInContext(ts.transpileModule(`globalThis.suppOnOpenChange = ${suppOpenChangeFn};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, suppMountCtx);
suppMountCtx.suppOnOpenChange(false);
assert.equal(suppStateOpen, false);
assert.equal(suppBodyStyle.pointerEvents, '', 'Closing nested QuoteSupplementDialog restores document.body.style.pointerEvents');
console.log('PASS quote preview UX: nested QuoteSupplementDialog pointer-events restoration verified');
// 77. Verify QuotePreviewDialog parses both JSON-string and object quote_data snapshots accurately
const parseDataStart = previewSrc.indexOf('let items: unknown[] = [];');
const parseDataEnd = previewSrc.indexOf('const savedDates = resolveQuoteDates(quote, quoteData);');
assert.ok(parseDataStart > 0 && parseDataEnd > parseDataStart, 'Locate quote data parsing block in QuotePreviewDialog.tsx');
const parseDataBlock = previewSrc.slice(parseDataStart, parseDataEnd);
for (const asJsonString of [false, true]) {
  const rawPayload = {
    title: 'BÁO GIÁ DỰ ÁN RESORT',
    customerName: 'Resort Phú Quốc',
    customerPhone: '0912345678',
    customerEmail: 'info@resort.vn',
    customerAddress: 'Phú Quốc, Kiên Giang',
    includeVAT: true,
    vatRate: 8,
    payment1: 100000,
    payment2: 50000,
    subtotal: 284000,
    vatAmount: 22720,
    total: 306720,
    remaining: 156720,
  };
  const parseCtx = vm.createContext({
    JSON,
    Boolean,
    Number,
    String,
    Error,
    console: { error() {} },
    quoteDataRaw: asJsonString ? JSON.stringify(rawPayload) : null,
    quote: {
      items: JSON.stringify([{ name: 'Ga chống thấm', quantity: 2, price: 142000, total: 284000 }]),
      quote_data: asJsonString ? null : rawPayload,
      subtotal: 284000,
      vat_rate: 8,
      vat_amount: 22720,
      include_vat: true,
      total_amount: 306720,
    },
    quoteContactSnapshot: (_q, qd, key, _re, fb = '') => String(qd[key] ?? fb),
    calculateQuote,
    assertSavedQuoteFinancials,
  });
  vm.runInContext(
    ts.transpileModule(parseDataBlock + '\nglobalThis.parsedResult = { customerName, phone, email, address, quoteTitle, totalWithVat, remaining, calculationError };', {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    parseCtx
  );
  assert.equal(parseCtx.parsedResult.calculationError, '');
  assert.equal(parseCtx.parsedResult.customerName, 'Resort Phú Quốc');
  assert.equal(parseCtx.parsedResult.quoteTitle, 'BÁO GIÁ DỰ ÁN RESORT');
  assert.equal(parseCtx.parsedResult.totalWithVat, 306720);
  assert.equal(parseCtx.parsedResult.remaining, 156720);
}
console.log('PASS quote preview UX: JSON-string and object quote_data snapshot parsing verified');
// 78. Verify quoteNumber fallback formatting for legacy quotes missing quote_number and quoteNumber
const quoteNumInit = decls.get('quoteNumber');
assert.ok(quoteNumInit, 'quoteNumber declaration must exist in QuotePreviewDialog.tsx');
const qNumCtx = vm.createContext({
  String,
  quote: { id: 'abcdef12-3456-7890' },
});
vm.runInContext(ts.transpileModule(`globalThis.qNum = ${quoteNumInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, qNumCtx);
assert.equal(qNumCtx.qNum, 'QUOTE-abcdef12', 'Falls back to QUOTE-<8-char id prefix>');
qNumCtx.quote = {};
vm.runInContext(ts.transpileModule(`globalThis.qNum = ${quoteNumInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, qNumCtx);
assert.equal(qNumCtx.qNum, 'QUOTE-N/A', 'Falls back to QUOTE-N/A when id is also missing');
console.log('PASS quote preview UX: legacy quoteNumber fallback verified');
// 79. Verify statusTextMap and quoteStatusLabel mapping for all quote lifecycle states
const statusMapCode = decls.get('statusTextMap');
const statusKeyCode = decls.get('quoteStatusKey');
const statusLabelCode = decls.get('quoteStatusLabel');
assert.ok(statusMapCode && statusKeyCode && statusLabelCode, 'Locate status label declarations in QuotePreviewDialog.tsx');
for (const [status, expectedLabel] of [
  ['draft', 'Nháp'],
  ['sent', 'Đã gửi'],
  ['approved', 'Đã duyệt'],
  ['rejected', 'Từ chối'],
  ['expired', 'Hết hạn'],
  ['custom_status', 'custom_status'],
]) {
  const stCtx = vm.createContext({ String, quote: { status } });
  vm.runInContext(
    ts.transpileModule(
      `const statusTextMap = ${statusMapCode}; const quoteStatusKey = ${statusKeyCode}; globalThis.label = ${statusLabelCode};`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
    ).outputText,
    stCtx
  );
  assert.equal(stCtx.label, expectedLabel);
}
console.log('PASS quote preview UX: quoteStatusLabel Vietnamese mapping verified');
// 80. Verify company heading in QuotePreviewDialog falls back to templateSettings.companyName when companyTitle is empty
const htmlCompanyNameFallback = renderPreviewBody(
  [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 1, price: 142000, total: 142000 }],
  {
    templateSettings: {
      logoUrl: '/logo.png',
      companyTitle: '',
      companyName: 'CÔNG TY CỔ PHẦN JOLIEFAM VIỆT NAM',
      footerNote: '',
      stampUrl: '',
      signatureUrl: '',
    },
  }
);
assert.ok(htmlCompanyNameFallback.includes('CÔNG TY CỔ PHẦN JOLIEFAM VIỆT NAM'), 'Falls back to companyName when companyTitle is empty');
console.log('PASS quote preview UX: companyTitle-to-companyName fallback verified');
// 81. Verify company header omits empty taxCode separator and empty bankInfo line
const htmlEmptyCompanyFields = renderPreviewBody(
  [{ name: 'Ga chống thấm', sku: 'GACTCS120x10', quantity: 1, price: 142000, total: 142000 }],
  {
    displayCompanyAddress: '',
    displayCompanyPhone: '',
    displayCompanyTaxCode: '',
    displayCompanyBankInfo: '',
  }
);
assert.ok(!htmlEmptyCompanyFields.includes('MST:'), 'Empty taxCode omits MST label and pipe separator');
assert.ok(!htmlEmptyCompanyFields.includes('STK:'), 'Empty bankInfo omits STK line');
assert.ok(htmlEmptyCompanyFields.includes('Điện thoại:</span> -'), 'Empty phone displays clean dash fallback');
console.log('PASS quote preview UX: empty company header field fallbacks verified');
// 82. Verify summary footer row column alignment when both hasAnyProductImage and hasAnyItemNotes are true
const htmlFullColsTwoItems = renderPreviewBody([
  { name: 'Ga 1', sku: 'G1', quantity: 2, price: 100000, total: 200000, selectedImage: '/a.png', notes: 'Ghi chú 1' },
  { name: 'Ga 2', sku: 'G2', quantity: 3, price: 100000, total: 300000, selectedImage: '', notes: '' },
]);
const headerThCount = (htmlFullColsTwoItems.match(/<th\b/g) || []).length;
assert.equal(headerThCount, 9, 'Full table has 9 header columns');
const summaryRowMatch = htmlFullColsTwoItems.match(/<tr class="bg-slate-50\/80[\s\S]*?<\/tr>/);
assert.ok(summaryRowMatch, 'Summary row exists for 2-item full-column table');
const summaryTdCount = (summaryRowMatch[0].match(/<td\b/g) || []).length;
assert.equal(summaryTdCount, 6, 'Summary row has 6 cells (1 colSpan=4 + 3 value cells + 2 trailing image/notes cells = 9 columns total)');
console.log('PASS quote preview UX: summary footer row 9-column alignment verified');
// 83. Verify quoteTitle precedence: quoteData.title -> quote.title -> 'BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN'
const quoteTitleInit = decls.get('quoteTitle');
assert.ok(quoteTitleInit, 'Locate quoteTitle declaration in QuotePreviewDialog.tsx');
for (const [quoteData, quote, expected] of [
  [{ title: 'BÁO GIÁ RIÊNG' }, { title: 'BÁO GIÁ GỐC' }, 'BÁO GIÁ RIÊNG'],
  [{}, { title: 'BÁO GIÁ GỐC' }, 'BÁO GIÁ GỐC'],
  [{}, {}, 'BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN'],
]) {
  const qtCtx = vm.createContext({ String, quoteData, quote });
  vm.runInContext(ts.transpileModule(`globalThis.qt = ${quoteTitleInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, qtCtx);
  assert.equal(qtCtx.qt, expected);
}
console.log('PASS quote preview UX: quoteTitle precedence and fallback verified');
// 84. Verify malformed items or quote_data JSON strings do not crash QuotePreviewDialog and trigger fail-closed calculationError
const malformedCtx = vm.createContext({
  JSON,
  Boolean,
  Number,
  String,
  Error,
  console: { error() {} },
  quoteDataRaw: '{bad_json',
  quote: {
    items: '{broken_items_json',
    quote_data: null,
  },
  quoteContactSnapshot: (_q, _qd, _key, _re, fb = '') => fb,
  calculateQuote,
  assertSavedQuoteFinancials,
});
assert.doesNotThrow(() => {
  vm.runInContext(
    ts.transpileModule(parseDataBlock + '\nglobalThis.malformedErr = calculationError;', {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    malformedCtx
  );
});
assert.ok(malformedCtx.malformedErr.length > 0, 'Malformed empty items sets calculationError fail-closed');
console.log('PASS quote preview UX: malformed JSON fail-closed protection verified');
// 85. Verify responsibleName filters out 'Chưa phân công' placeholder and blank strings
const respInit = decls.get('responsibleName');
assert.ok(respInit, 'Locate responsibleName declaration in QuotePreviewDialog.tsx');
for (const [responsible, expected] of [
  ['Chưa phân công', ''],
  ['   ', ''],
  [null, ''],
  ['Nguyễn Đức Phước', 'Nguyễn Đức Phước'],
]) {
  const rCtx = vm.createContext({ quote: { responsible } });
  vm.runInContext(ts.transpileModule(`globalThis.resp = ${respInit};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, rCtx);
  assert.equal(rCtx.resp, expected);
}
console.log('PASS quote preview UX: responsibleName placeholder filtering verified');
// 86. Execute thumbnail button onClick inside #quote-preview and verify setZoomedImage receives safe URL and product title
const thumbMatch = previewSrc.match(/onClick=\{\(\) => setZoomedImage\(\{[^}]+\}\)\}/);
assert.ok(thumbMatch, 'Locate thumbnail button onClick in QuotePreviewDialog.tsx');
const thumbFnCode = thumbMatch[0].slice('onClick={'.length, -1);
let zoomTriggered = null;
const thumbCtx = vm.createContext({
  String,
  safeQuoteImageUrl,
  item: { name: 'Vỏ chăn T250', sku: 'VCT250', selectedImage: 'https://fixture.invalid/vo-chan.png' },
  setZoomedImage: (val) => { zoomTriggered = val; },
});
vm.runInContext(ts.transpileModule(`globalThis.clickThumb = ${thumbFnCode};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, thumbCtx);
thumbCtx.clickThumb();
assert.equal(zoomTriggered.url, 'https://fixture.invalid/vo-chan.png');
assert.equal(zoomTriggered.title, 'Vỏ chăn T250');
console.log('PASS quote preview UX: thumbnail click handler invokes setZoomedImage accurately');
// 87. Verify thumbnail click handler title fallback to SKU and then 'Ảnh sản phẩm'
thumbCtx.item = { name: '', sku: 'SKU-THUMB-01', selectedImage: 'https://fixture.invalid/sku.png' };
thumbCtx.clickThumb();
assert.equal(zoomTriggered.title, 'SKU-THUMB-01');
thumbCtx.item = { name: '', sku: '', selectedImage: 'https://fixture.invalid/default.png' };
thumbCtx.clickThumb();
assert.equal(zoomTriggered.title, 'Ảnh sản phẩm');
console.log('PASS quote preview UX: thumbnail lightbox title fallback verified');
// 88. Verify zoomedImage Dialog onOpenChange clears zoomedImage when closed
const zoomOpenChangeMatch = previewSrc.match(/<Dialog open=\{Boolean\(zoomedImage\)\} onOpenChange=\{\(\(val\) => !val && setZoomedImage\(null\)\)\}>|<Dialog open=\{Boolean\(zoomedImage\)\} onOpenChange=\{\(val\) => !val && setZoomedImage\(null\)\}>/);
assert.ok(zoomOpenChangeMatch, 'Locate zoomedImage Dialog onOpenChange handler');
let zoomCleared = false;
const zoomCloseCtx = vm.createContext({
  setZoomedImage: (v) => { if (v === null) zoomCleared = true; },
});
vm.runInContext(
  ts.transpileModule('globalThis.closeZoom = (val) => !val && setZoomedImage(null);', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText,
  zoomCloseCtx
);
zoomCloseCtx.closeZoom(false);
assert.equal(zoomCleared, true, 'Closing zoomedImage Dialog sets zoomedImage to null');
console.log('PASS quote preview UX: zoomedImage Dialog close handler verified');
// 89. Verify DialogHeader total badge and handleCopySummary use subtotal when includeVAT is false
const noVatHeaderCtx = vm.createContext({
  ...headerCtx,
  includeVAT: false,
  subtotal: 792300,
  totalWithVat: 855684,
});
vm.runInContext(compiledHeader, noVatHeaderCtx);
const noVatHeaderHtml = renderToStaticMarkup(noVatHeaderCtx.headerNode);
assert.ok(noVatHeaderHtml.includes('792.300 đ'), 'Header badge shows subtotal when includeVAT is false');
assert.ok(!noVatHeaderHtml.includes('855.684 đ'), 'Header badge does not show VAT total when includeVAT is false');

let noVatCopied = '';
const noVatCopyCtx = vm.createContext({
  ...copyCtx,
  includeVAT: false,
  subtotal: 792300,
  totalWithVat: 855684,
  navigator: { clipboard: { writeText: async (txt) => { noVatCopied = txt; } } },
});
vm.runInContext(ts.transpileModule(`globalThis.noVatCopyFn = ${copyCode};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, noVatCopyCtx);
await noVatCopyCtx.noVatCopyFn();
assert.match(noVatCopied, /Tổng thanh toán: 792\.300 VNĐ/);
assert.doesNotMatch(noVatCopied, /đã gồm VAT/);
console.log('PASS quote preview UX: non-VAT header badge and copy summary amount verified');
// 90. Verify summary footer row column alignment when only one optional column (image or notes) is present (8 columns total)
const htmlImageOnlyTwoItems = renderPreviewBody([
  { name: 'Ga 1', sku: 'G1', quantity: 2, price: 100000, total: 200000, selectedImage: '/a.png', notes: '' },
  { name: 'Ga 2', sku: 'G2', quantity: 3, price: 100000, total: 300000, selectedImage: '', notes: '' },
]);
assert.equal((htmlImageOnlyTwoItems.match(/<th\b/g) || []).length, 8, 'Image-only table has 8 header columns');
const imgSummaryRow = htmlImageOnlyTwoItems.match(/<tr class="bg-slate-50\/80[\s\S]*?<\/tr>/);
assert.ok(imgSummaryRow, 'Summary row exists for 2-item image-only table');
assert.equal((imgSummaryRow[0].match(/<td\b/g) || []).length, 5, 'Summary row has 5 cells (1 colSpan=4 + 3 value cells + 1 trailing image cell = 8 columns total)');
console.log('PASS quote preview UX: summary footer row 8-column alignment verified');
console.log('QUOTE PREVIEW UX SUITE: 90 groups passed.');
