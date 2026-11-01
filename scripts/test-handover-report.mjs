// Synthetic in-memory regression cases. No browser, database, provider or credential access.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as docx from 'docx';
import JSZip from 'jszip';
import * as handover from '../src/lib/handover-report.ts';
import { syncContractNumberInOverrides } from '../src/lib/contractUtils.ts';

const settings = { companyName: 'Công ty cài đặt', address: 'Địa chỉ cài đặt', phone: '111', taxCode: '222', stampUrl: 'synthetic-stamp', signatureUrl: 'synthetic-signature' };
const contract = { id: 'synthetic-a', contract_number: 'HD-20261028-001', contract_date: '2026-10-20',
  seller_info: { company_name: 'Xưởng A', address: 'Địa chỉ: Địa chỉ: Kho pháp nhân A', phone: 'Điện thoại: 0901', tax_code: 'MST: 123', representative: 'Giám đốc A', position: 'Giám đốc' },
  buyer_info: { company_name: 'Khách B', address: 'Địa chỉ: Trụ sở bên nhận', representative: 'Giám đốc B', position: 'Giám đốc' },
  items: [{ name: 'Ga', quantity: 12, specifications: '160 × 200' }], document_overrides: { payment_request: { synthetic: true } } };
const defaults = handover.createHandoverDefaults(contract, settings);
const legacySaved = { ...defaults, title: 'Biên bản lịch sử', handover_date: '2026-10-02', intro1: 'Đã giao ngày {ngày_bàn_giao} tại điểm đã thỏa thuận.',
  party_a_text: 'Bên A đã lưu\nNgười phụ trách cũ', party_b_text: 'Bên B đã lưu', sign_name_a: 'Người ký cũ A', sign_name_b: 'Người ký cũ B',
  sign_label_a: 'NHÃN CŨ A', sign_caption_a: '(Chú thích cũ)', conclusion: 'Nội dung kết luận đã chỉnh', notes: 'Ghi chú riêng' };
delete legacySaved.template_version;
const version2Saved = { ...legacySaved, template_version: 2, handover_time: '09:15', handover_location: 'Kho lịch sử v2', handover_role_a: 'Thủ kho đã lưu', handover_role_b: 'Phụ trách đã lưu' };
let groups = 0;
const check = async (label, run) => { await run(); groups++; console.log('PASS handover: ' + label); };

await check('new reports never infer actual date, place, persons or director signatures', () => {
  assert.equal(defaults.template_version, 3);
  for (const field of ['handover_date', 'handover_time', 'handover_location', 'handover_role_a', 'handover_role_b', 'sign_name_a', 'sign_name_b']) assert.equal(defaults[field], '');
  const resolved = handover.resolveHandoverReport(defaults);
  assert.equal(resolved.eventLines.length, 2);
  assert.match(resolved.eventLines[0], /^Thời gian giao nhận:.*…/u);
  assert.match(resolved.eventLines[1], /^Địa điểm giao nhận:.*…/u);
  assert.ok(!resolved.eventLines.join(' ').includes('Kho pháp nhân A'));
  assert.ok(!resolved.party_a_text.includes('Giám đốc'));
  assert.equal(defaults.sign_label_a, 'BÊN GIAO');
  assert.equal(defaults.sign_caption_a, '(Ký, ghi rõ họ tên)');
  assert.ok(!resolved.party_a_text.includes('Người giao hàng:'));
  assert.ok(!resolved.party_b_text.includes('Người nhận hàng:'));
  assert.equal(defaults.items[0].status, ''); assert.equal(resolved.status_fallback, '—');
  assert.ok(!defaults.conclusion.includes('nghiệm thu đạt'));
});
await check('legal snapshot values, intentional blanks and duplicate field labels are respected', () => {
  assert.match(defaults.party_a_text, /Địa chỉ: Kho pháp nhân A\nĐiện thoại: 0901\nMST: 123/u);
  assert.ok(!defaults.party_a_text.includes('Địa chỉ: Địa chỉ:'));
  const blank = handover.createHandoverDefaults({ seller_info: { company_name: '', address: '', phone: '', tax_code: '' } }, settings);
  assert.ok(!blank.party_a_text.includes(settings.companyName));
  assert.ok(!blank.party_a_text.includes(settings.address));
  assert.ok(!blank.party_a_text.includes('MST:'));
  assert.equal(handover.handoverFieldValue('Mã số thuế: MST: 123', 'tax'), '123');
});
await check('Today uses Vietnam calendar at the UTC date boundary', () => {
  assert.equal(handover.handoverToday(new Date('2026-10-27T16:59:59Z')), '2026-10-27');
  assert.equal(handover.handoverToday(new Date('2026-10-27T17:00:00Z')), '2026-10-28');
  assert.equal(handover.handoverToday(new Date('2026-12-31T18:00:00Z')), '2027-01-01');
});
await check('legacy saved business/signature content is preserved; conversion keeps business text and clears inferred facts', () => {
  const original = structuredClone(legacySaved), loaded = handover.loadHandoverReport(defaults, legacySaved);
  assert.ok(handover.isLegacyHandover(loaded));
  for (const [key, value] of Object.entries(legacySaved)) assert.deepEqual(loaded[key], value);
  assert.deepEqual(handover.resolveHandoverReport(loaded).eventLines, ['Đã giao ngày 02/10/2026 tại điểm đã thỏa thuận.']);
  assert.equal(handover.resolveHandoverReport(loaded).party_a_text, legacySaved.party_a_text);
  const converted = handover.convertHandoverReport(loaded, defaults);
  for (const field of ['title', 'subtitle', 'intro2', 'items', 'conclusion', 'notes']) assert.deepEqual(converted[field], loaded[field]);
  for (const field of ['handover_date', 'handover_time', 'handover_location', 'sign_name_a', 'sign_name_b', 'handover_role_a', 'handover_role_b']) assert.equal(converted[field], '');
  assert.deepEqual(legacySaved, original);
});
await check('v1/v2 missing fields retain historical defaults and their distinct event/person renderers', () => {
  for (const version of [1, 2]) {
    const missing = handover.loadHandoverReport(defaults, { template_version: version });
    assert.equal(missing.title, 'BIÊN BẢN BÀN GIAO'); assert.equal(missing.items[0].status, 'Đạt');
    assert.equal(missing.conclusion, 'Hàng hóa đạt yêu cầu chất lượng theo hợp đồng. Hai bên thống nhất nghiệm thu đạt.');
    assert.match(missing.party_a_text, /^Công ty: Xưởng A/u);
  }
  const loaded = handover.loadHandoverReport(defaults, version2Saved), resolved = handover.resolveHandoverReport(loaded);
  assert.ok(handover.isLegacyHandover(loaded)); assert.equal(handover.handoverTemplateVersion(loaded), 2);
  assert.deepEqual(resolved.eventLines, ['Thời gian giao nhận: 09:15, ngày 02/10/2026', 'Địa điểm giao nhận: Kho lịch sử v2']);
  assert.ok(resolved.party_a_text.includes('Người giao hàng: Người ký cũ A'));
  assert.equal(resolved.sign_role_a, 'Thủ kho đã lưu');
});
await check('explicit conversion refreshes only known canned copy and retains custom business wording and observed statuses', () => {
  const old = handover.loadHandoverReport(defaults, { template_version: 2 });
  old.items = [{ name: 'Ga', specifications: '160 × 200', quantity: '7', status: 'Đạt' }, { name: 'Gối', specifications: '50 × 70', quantity: '2', status: 'Cần đổi' }];
  const converted = handover.convertHandoverReport(old, defaults);
  for (const key of ['title', 'intro2', 'party_a_label', 'party_b_label', 'items_title', 'conclusion_title', 'conclusion', 'notes_title', 'footer_note', 'sign_label_a', 'sign_label_b']) assert.equal(converted[key], defaults[key], key);
  assert.deepEqual(converted.items, old.items);
  const custom = { ...old, title: 'Phiếu giao đợt 2', intro2: 'Nội dung thỏa thuận riêng.', party_a_label: 'ĐƠN VỊ GIAO:', party_b_label: 'ĐƠN VỊ NHẬN:', items_title: 'Hàng giao riêng', conclusion_title: 'Ghi nhận riêng', conclusion: 'Còn thiếu 1 gối.', notes_title: 'Việc cần xử lý', notes: 'Bổ sung ngày mai.', footer_note: 'Mỗi bên giữ một bản đối chiếu nội bộ.', sign_label_a: 'ĐƠN VỊ GIAO KÝ', sign_label_b: 'ĐƠN VỊ NHẬN KÝ', sign_caption_a: '(Xác nhận giao)', sign_caption_b: '(Xác nhận nhận)' };
  const next = handover.convertHandoverReport(custom, defaults);
  for (const key of ['title', 'intro2', 'party_a_label', 'party_b_label', 'items_title', 'conclusion_title', 'conclusion', 'notes_title', 'notes', 'footer_note', 'sign_label_a', 'sign_label_b', 'sign_caption_a', 'sign_caption_b']) assert.equal(next[key], custom[key], key);
});

const source = await readFile(new URL('../src/components/HandoverReportDialog.tsx', import.meta.url), 'utf8');
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None } }).outputText;
const elements = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(child => elements(child, predicate))];
const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node) : React.Children.toArray(node?.props?.children).map(textOf).join('');
const button = (tree, text) => { const node = elements(tree, node => node.type === 'Button' && textOf(node) === text)[0]; assert.ok(node, 'Missing button: ' + text); return node; };
const input = (tree, id) => { const node = elements(tree, node => ['Input', 'Textarea'].includes(node.type) && node.props.id === id)[0]; assert.ok(node, 'Missing input: ' + id); return node; };
const dependenciesChanged = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
function harness(initialContract = structuredClone(contract)) {
  let cursor = 0, slots = [], pending = false, effects = [], gate = null;
  const writes = [], toasts = [], exports = [], print = [], pdf = [];
  const h = { props: { open: true, onOpenChange() {}, contract: initialContract }, settings: { ...settings }, writes, toasts, exports, print, pdf, deferSave() { gate = {}; gate.promise = new Promise(resolve => { gate.resolve = resolve; }); return gate; } };
  const setter = (slot, update) => { const next = typeof update === 'function' ? update(slots[slot]) : update; if (!Object.is(next, slots[slot])) { slots[slot] = next; pending = true; } };
  const context = vm.createContext({ React, console, ...handover, syncContractNumberInOverrides, ...docx,
    DocxTable: docx.Table, DocxTableRow: docx.TableRow, DocxTableCell: docx.TableCell,
    useRef(value) { const slot = cursor++; if (!(slot in slots)) slots[slot] = { current: value }; return slots[slot]; },
    useState(value) { const slot = cursor++; if (!(slot in slots)) slots[slot] = typeof value === 'function' ? value() : value; return [slots[slot], update => setter(slot, update)]; },
    useReducer(reducer, value, initialize) { const slot = cursor++; if (!(slot in slots)) slots[slot] = initialize(value); return [slots[slot], action => setter(slot, current => reducer(current, action))]; },
    useMemo(factory, deps) { const slot = cursor++; if (!slots[slot] || dependenciesChanged(slots[slot].deps, deps)) slots[slot] = { value: factory(), deps }; return slots[slot].value; },
    useEffect(effect, deps) { const slot = cursor++; if (!slots[slot] || dependenciesChanged(slots[slot], deps)) { slots[slot] = deps; effects.push(effect); } },
    useTemplateSettings: () => ({ settings: h.settings }), useToast: () => ({ toast: value => toasts.push(value) }), useQueryClient: () => ({ invalidateQueries() {} }),
    isLocalBackend: () => true, localApi: { async updateContract(...args) { writes.push(args); if (gate) await gate.promise; } },
    supabase: { from() { throw new Error('Unexpected Supabase access'); } }, saveAs: (blob, name) => exports.push({ blob, name }),
    exportElementToPDF: async (element, name) => pdf.push({ element, name }),
    window: { open() { return { document: { write: value => print.push(value), close() {} }, print() {} }; } },
  });
  for (const name of ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'Button', 'Input', 'Label', 'Textarea', 'Accordion', 'AccordionContent', 'AccordionItem', 'AccordionTrigger', 'Switch', 'OnlineStampSignature', 'Printer', 'FileDown', 'FileText', 'Save', 'RotateCcw', 'Plus', 'Trash2']) context[name] = name;
  vm.runInContext(compile(source.replace(/^import .*;\r?\n/gm, '').replace('export const HandoverReportDialog', 'const HandoverReportDialog')) + '\nglobalThis.Component=HandoverReportDialog;', context);
  h.render = () => {
    let tree, rounds = 0;
    do { assert.ok(rounds++ < 10, 'render must settle'); pending = false; cursor = 0; effects = []; tree = context.Component(h.props); for (const effect of effects) effect(); } while (pending);
    return tree;
  };
  h.preview = tree => elements(tree, node => node.type === 'div' && node.props.style?.fontFamily)[0];
  h.change = (id, value) => input(h.render(), id).props.onChange({ target: { value } });
  return h;
}

await check('actual dialog copies address/Today only explicitly, retains legal parties, and has no personal name/role controls', () => {
  const h = harness(); let tree = h.render();
  assert.equal(input(tree, 'handover-date').props.value, '');
  assert.equal(input(tree, 'handover-location').props.value, '');
  assert.equal(elements(tree, node => node.type === 'OnlineStampSignature').length, 0);
  button(tree, 'Dùng địa chỉ bên nhận').props.onClick();
  assert.equal(input(h.render(), 'handover-location').props.value, 'Trụ sở bên nhận');
  button(h.render(), 'Hôm nay').props.onClick();
  assert.equal(input(h.render(), 'handover-date').props.value, handover.handoverToday());
  const preview = textOf(h.preview(h.render()));
  assert.ok(preview.includes('Đơn vị / cá nhân: Xưởng A')); assert.ok(preview.includes('Đơn vị / cá nhân: Khách B'));
  assert.ok(!preview.includes('Giám đốc A'));
  for (const saved of [undefined, legacySaved, version2Saved]) {
    const history = harness({ ...structuredClone(contract), document_overrides: saved ? { handover_report: saved } : {} }), view = history.render();
    assert.equal(elements(view, node => ['Input', 'Textarea'].includes(node.type) && /handover-(?:giver|receiver)/.test(node.props.id || '')).length, 0);
    assert.ok(!textOf(view).includes('Tên người ký A')); assert.ok(!textOf(view).includes('Vai trò / chức vụ người giao'));
  }
  button(h.render(), 'Thêm dòng').props.onClick();
  assert.equal(elements(h.render(), node => node.type === 'Input' && node.props['aria-label'] === 'Tình trạng dòng 2')[0].props.value, '');
  assert.equal(h.writes.length, 0);
});
await check('actual legacy open, convert, reset and back never write; closing without Save preserves the saved template', () => {
  const original = { ...structuredClone(contract), document_overrides: { handover_report: structuredClone(legacySaved) } }, h = harness(original);
  let tree = h.render(); assert.ok(textOf(h.preview(tree)).includes('NHÃN CŨ A'));
  button(tree, 'Dùng mẫu bàn giao mới').props.onClick(); tree = h.render();
  assert.equal(input(tree, 'handover-date').props.value, '');
  assert.ok(textOf(h.preview(tree)).includes(legacySaved.conclusion));
  button(tree, 'Quay lại mẫu đã lưu').props.onClick(); tree = h.render();
  assert.equal(input(tree, 'handover-date').props.value, legacySaved.handover_date);
  button(tree, 'Đặt lại bản nháp').props.onClick(); tree = h.render(); assert.ok(textOf(tree).includes('Có thay đổi chưa lưu'));
  button(tree, 'Quay lại mẫu đã lưu').props.onClick();
  h.props.open = false; h.render(); h.props.open = true; tree = h.render();
  assert.ok(textOf(h.preview(tree)).includes('Người ký cũ A'));
  assert.equal(h.writes.length, 0); assert.deepEqual(original.document_overrides.handover_report, legacySaved);
});
await check('actual dialog preserves edits across late settings, object refetch and external overrides, and resets on a different contract/reopen', () => {
  const h = harness(); h.render(); h.change('handover-time', '10:30'); h.change('handover-location', 'Kho giao thực tế');
  h.settings = { ...h.settings, companyName: 'Cài đặt vừa tải về' };
  h.props.contract = { ...h.props.contract, document_overrides: { handover_report: legacySaved } };
  let tree = h.render(); assert.equal(input(tree, 'handover-time').props.value, '10:30'); assert.equal(input(tree, 'handover-location').props.value, 'Kho giao thực tế');
  h.props.open = false; h.render(); h.props.open = true; tree = h.render();
  assert.equal(input(tree, 'handover-date').props.value, legacySaved.handover_date);
  h.props.contract = { ...structuredClone(contract), id: 'synthetic-b' }; tree = h.render();
  assert.equal(input(tree, 'handover-location').props.value, ''); assert.equal(input(tree, 'handover-date').props.value, '');
});
await check('explicit Save preserves unrelated overrides, ignores stale refetch, and keeps edits made during the request', async () => {
  const h = harness(); h.render(); h.change('handover-location', 'Địa điểm đã gửi lưu');
  const gate = h.deferSave(), request = button(h.render(), 'Lưu').props.onClick();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0][1].document_overrides.payment_request.synthetic, true);
  const submitted = h.writes[0][1].document_overrides.handover_report;
  assert.equal(submitted.handover_location, 'Địa điểm đã gửi lưu'); assert.equal(submitted.template_version, 3);
  h.change('handover-location', 'Sửa trong lúc lưu'); gate.resolve(); await request;
  h.settings = { ...h.settings }; let tree = h.render(); assert.equal(input(tree, 'handover-location').props.value, 'Sửa trong lúc lưu'); assert.ok(textOf(tree).includes('Có thay đổi chưa lưu'));
  h.props.contract = { ...h.props.contract, document_overrides: { ...h.props.contract.document_overrides, handover_report: submitted } };
  tree = h.render(); assert.equal(input(tree, 'handover-location').props.value, 'Sửa trong lúc lưu');
  const pristine = harness(); pristine.render(); pristine.change('handover-location', 'Đã lưu xong'); await button(pristine.render(), 'Lưu').props.onClick();
  pristine.settings = { ...pristine.settings }; tree = pristine.render(); assert.equal(input(tree, 'handover-location').props.value, 'Đã lưu xong'); assert.ok(!textOf(tree).includes('Có thay đổi chưa lưu'));
});
await check('two successive saves use the latest observed refetch source without restoring the first saved event', async () => {
  const h = harness(); h.render();
  const first = { 'handover-time': '10:15', 'handover-notes': 'Ghi chú lần một', 'handover-date': '2026-11-01', 'handover-location': 'Kho lần một' };
  for (const [id, value] of Object.entries(first)) h.change(id, value);
  await button(h.render(), 'Lưu').props.onClick();
  const savedFirst = h.writes[0][1].document_overrides.handover_report;
  const second = { 'handover-time': '11:30', 'handover-notes': 'Ghi chú lần hai', 'handover-date': '2026-11-02', 'handover-location': 'Kho lần hai' };
  for (const [id, value] of Object.entries(second)) h.change(id, value);
  // The first save's refetch arrives while the second draft is dirty.
  h.props.contract = { ...h.props.contract, document_overrides: { ...h.props.contract.document_overrides, handover_report: savedFirst } };
  let tree = h.render();
  for (const [id, value] of Object.entries(second)) assert.equal(input(tree, id).props.value, value);
  await button(tree, 'Lưu').props.onClick();
  const savedSecond = h.writes[1][1].document_overrides.handover_report;
  // A settings/object refresh occurs before the second save's refetch returns.
  h.settings = { ...h.settings }; h.props.contract = { ...h.props.contract }; tree = h.render();
  for (const [id, value] of Object.entries(second)) assert.equal(input(tree, id).props.value, value);
  let preview = textOf(h.preview(tree));
  for (const old of ['10:15', 'Ghi chú lần một', '01/11/2026', 'Kho lần một']) assert.ok(!preview.includes(old), 'stale event returned: ' + old);
  assert.ok(!textOf(tree).includes('Có thay đổi chưa lưu'));
  h.props.contract = { ...h.props.contract, document_overrides: { ...h.props.contract.document_overrides, handover_report: savedSecond } }; tree = h.render();
  preview = textOf(h.preview(tree)); assert.ok(preview.includes('02/11/2026')); assert.ok(preview.includes('Kho lần hai'));
  assert.equal(h.writes.length, 2);
});
await check('v3 preview/print/PDF/Word share neutral event/party/status text and blank signatures even with stale signer fields', async () => {
  const h = harness({ ...structuredClone(contract), document_overrides: { handover_report: { ...defaults, sign_name_a: 'Tên cũ phải ẩn A', sign_name_b: 'Tên cũ phải ẩn B', handover_role_a: 'Vai trò cũ A', handover_role_b: 'Vai trò cũ B' } } }); h.render();
  for (const [id, value] of [['handover-date', '2026-10-28'], ['handover-time', '14:35'], ['handover-location', 'Xưởng giao thực tế']]) h.change(id, value);
  const tree = h.render(), preview = h.preview(tree), html = renderToStaticMarkup(preview);
  preview.ref.current = { innerHTML: html };
  button(tree, 'In').props.onClick(); await button(tree, 'Xuất PDF').props.onClick(); await button(tree, 'Xuất Word').props.onClick();
  assert.equal(h.exports.length, 1); assert.equal(h.pdf.length, 1); assert.equal(h.pdf[0].element, preview.ref.current);
  assert.ok(h.print[0].includes(html)); assert.ok(h.print[0].includes('white-space: pre-wrap'));
  assert.equal(preview.props.children.at(-1).props.style.gridTemplateColumns, '1fr 1fr');
  const zip = await JSZip.loadAsync(await h.exports[0].blob.arrayBuffer()), xml = await zip.file('word/document.xml').async('string');
  for (const text of ['Thời gian giao nhận: 14:35, ngày 28/10/2026', 'Địa điểm giao nhận: Xưởng giao thực tế', 'Đơn vị / cá nhân: Xưởng A', 'Đơn vị / cá nhân: Khách B', 'BIÊN BẢN GIAO NHẬN HÀNG HÓA', 'BÊN GIAO', 'BÊN NHẬN', 'Quy cách / kích thước', 'Tình trạng thực tế', defaults.conclusion, defaults.footer_note]) {
    assert.ok(textOf(preview).includes(text), 'Preview missing: ' + text); assert.ok(xml.includes(text), 'Word missing: ' + text);
  }
  for (const old of ['Tên cũ phải ẩn', 'Vai trò cũ', 'Giám đốc A', 'Người giao hàng:', 'Người nhận hàng:', 'Đạt', 'nghiệm thu đạt']) { assert.ok(!xml.includes(old), old); assert.ok(!textOf(preview).includes(old), old); }
  assert.equal(h.writes.length, 0);
});
await check('v1/v2 historical preview and real Word retain their date/place/party/signature facts until draft conversion', async () => {
  for (const saved of [legacySaved, version2Saved]) {
    const h = harness({ ...structuredClone(contract), document_overrides: { handover_report: saved } }), tree = h.render();
    assert.ok(textOf(tree).includes('Dùng mẫu bàn giao mới'));
    await button(tree, 'Xuất Word').props.onClick();
    const zip = await JSZip.loadAsync(await h.exports[0].blob.arrayBuffer()), xml = await zip.file('word/document.xml').async('string');
    const resolved = handover.resolveHandoverReport(handover.loadHandoverReport(defaults, saved));
    for (const text of [...resolved.eventLines, ...resolved.party_a_text.split('\n'), ...resolved.party_b_text.split('\n'), resolved.sign_name_a, resolved.sign_name_b, resolved.sign_role_a, resolved.sign_role_b].filter(Boolean)) {
      assert.ok(textOf(h.preview(tree)).includes(text)); assert.ok(xml.includes(text), text);
    }
    assert.equal(h.writes.length, 0);
    if (saved.template_version === 2) { assert.equal(elements(tree, node => node.type === 'Switch').length, 0); assert.equal(elements(tree, node => node.type === 'OnlineStampSignature').length, 0); }
    button(tree, 'Dùng mẫu bàn giao mới').props.onClick();
    assert.ok(!textOf(h.preview(h.render())).includes('Người ký cũ A'));
    button(h.render(), 'Quay lại mẫu đã lưu').props.onClick(); assert.ok(textOf(h.preview(h.render())).includes('Người ký cũ A'));
  }
});
await check('legacy online image path uses the edited signer; new drafts never mount global signature images', () => {
  const h = harness({ ...structuredClone(contract), document_overrides: { handover_report: { ...legacySaved, sign_name_a: 'Người ký đã chỉnh' } } });
  let tree = h.render(); elements(tree, node => node.type === 'Switch')[0].props.onCheckedChange(true); tree = h.render();
  const stamp = elements(tree, node => node.type === 'OnlineStampSignature')[0]; assert.equal(stamp.props.sellerRep, 'Người ký đã chỉnh'); assert.equal(stamp.props.sellerPos, '');
  button(tree, 'Dùng mẫu bàn giao mới').props.onClick(); tree = h.render(); assert.equal(elements(tree, node => node.type === 'OnlineStampSignature').length, 0);
});
console.log(`HANDOVER REPORT: ${groups} groups passed.`);
