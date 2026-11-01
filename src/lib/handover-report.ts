import { contractBusinessDate, contractDateLabel } from './contract-calculation';
import { savedSellerValue } from './contract-document';

export interface HandoverItem { name: string; specifications: string; quantity: string; status: string; }
export interface HandoverReportState {
  template_version: number;
  title: string; subtitle: string;
  handover_date: string; handover_time: string; handover_location: string;
  handover_role_a: string; handover_role_b: string;
  intro1: string; intro2: string;
  party_a_label: string; party_b_label: string; party_a_text: string; party_b_text: string;
  items_title: string; items: HandoverItem[];
  conclusion_title: string; conclusion: string; notes_title: string; notes: string; footer_note: string;
  sign_label_a: string; sign_label_b: string; sign_caption_a: string; sign_caption_b: string;
  sign_name_a: string; sign_name_b: string;
}
interface HandoverContract {
  contract_number?: string; contract_date?: unknown;
  seller_info?: Record<string, unknown>; buyer_info?: Record<string, unknown>;
  customers?: { company?: string; name?: string };
  items?: { name?: string; specifications?: string; description?: string; quantity?: unknown }[];
}
interface CompanySettings { companyName?: string; address?: string; phone?: string; taxCode?: string; }

/** Prefixes sometimes already exist in legal snapshots. Never print them twice. */
export function handoverFieldValue(value: unknown, field: 'address' | 'phone' | 'tax'): string {
  const prefixes = {
    address: /^(?:Địa chỉ|Address)\s*:\s*/iu,
    phone: /^(?:Điện thoại|Số điện thoại|ĐT|Phone|Tel)\s*:\s*/iu,
    tax: /^(?:MST|Mã số thuế|Tax code)\s*:\s*/iu,
  };
  let text = String(value ?? '').trim();
  while (prefixes[field].test(text)) text = text.replace(prefixes[field], '').trim();
  return text;
}

function companyText(name: string, address: string, phone: string, tax: string): string {
  return [`Đơn vị / cá nhân: ${name || '…'}`,
    ...(handoverFieldValue(address, 'address') ? [`Địa chỉ: ${handoverFieldValue(address, 'address')}`] : []),
    ...(handoverFieldValue(phone, 'phone') ? [`Điện thoại: ${handoverFieldValue(phone, 'phone')}`] : []),
    ...(handoverFieldValue(tax, 'tax') ? [`MST: ${handoverFieldValue(tax, 'tax')}`] : []),
  ].join('\n');
}

export function createHandoverDefaults(contract: HandoverContract | null | undefined, settings: CompanySettings): HandoverReportState {
  const seller = contract?.seller_info || {}, buyer = contract?.buyer_info || {};
  return {
    template_version: 3,
    title: 'BIÊN BẢN GIAO NHẬN HÀNG HÓA',
    subtitle: `(Kèm theo Hợp đồng số: ${contract?.contract_number || ''})`,
    handover_date: '', handover_time: '', handover_location: '', handover_role_a: '', handover_role_b: '',
    intro1: '',
    intro2: `Căn cứ Hợp đồng số ${contract?.contract_number || ''} ngày ${contract?.contract_date ? contractDateLabel(contract.contract_date) : ''}, hai bên lập biên bản ghi nhận việc giao nhận hàng hóa như sau:`,
    party_a_label: 'BÊN GIAO HÀNG:', party_b_label: 'BÊN NHẬN HÀNG:',
    party_a_text: companyText(savedSellerValue(seller, 'company_name', settings.companyName), savedSellerValue(seller, 'address', settings.address), savedSellerValue(seller, 'phone', settings.phone), savedSellerValue(seller, 'tax_code', settings.taxCode)),
    party_b_text: companyText(String(buyer.company_name || contract?.customers?.company || contract?.customers?.name || ''), String(buyer.address || ''), String(buyer.phone || ''), String(buyer.tax_code || '')),
    items_title: 'I. HÀNG HÓA GIAO NHẬN',
    items: (Array.isArray(contract?.items) ? contract.items : []).map(item => ({ name: item.name || '', specifications: item.specifications || item.description || '', quantity: String(item.quantity || 1), status: '' })),
    conclusion_title: 'II. GHI NHẬN GIAO NHẬN',
    conclusion: 'Hai bên ghi nhận số lượng và tình trạng hàng hóa giao nhận theo bảng trên. Các chênh lệch và nội dung cần xử lý (nếu có) được ghi tại phần Ghi chú.',
    notes_title: 'III. GHI CHÚ VÀ NỘI DUNG CẦN XỬ LÝ', notes: '',
    footer_note: 'Biên bản được lập thành 02 bản có nội dung như nhau; mỗi bên giữ 01 bản để đối chiếu.',
    sign_label_a: 'BÊN GIAO', sign_label_b: 'BÊN NHẬN',
    sign_caption_a: '(Ký, ghi rõ họ tên)', sign_caption_b: '(Ký, ghi rõ họ tên)',
    sign_name_a: '', sign_name_b: '',
  };
}

/** v1 is freeform; v2 has structured event/person facts; v3 omits personal signers. */
export const handoverTemplateVersion = (state: HandoverReportState): 1 | 2 | 3 => state.template_version === 3 ? 3 : state.template_version === 2 ? 2 : 1;
export const isLegacyHandover = (state: HandoverReportState): boolean => handoverTemplateVersion(state) !== 3;

function historicalDefaults(defaults: HandoverReportState, version: number): HandoverReportState {
  return { ...defaults, template_version: version,
    title: 'BIÊN BẢN BÀN GIAO',
    intro2: defaults.intro2.replace('hai bên lập biên bản ghi nhận việc giao nhận hàng hóa như sau:', 'hai bên tiến hành bàn giao như sau:'),
    party_a_label: 'BÊN GIAO (Bên A):', party_b_label: 'BÊN NHẬN (Bên B):',
    party_a_text: defaults.party_a_text.replace(/^Đơn vị \/ cá nhân:/u, 'Công ty:'),
    party_b_text: defaults.party_b_text.replace(/^Đơn vị \/ cá nhân:/u, 'Công ty:'),
    items_title: 'I. NỘI DUNG BÀN GIAO:', items: defaults.items.map(item => ({ ...item, status: 'Đạt' })),
    conclusion_title: 'II. KẾT LUẬN:', conclusion: 'Hàng hóa đạt yêu cầu chất lượng theo hợp đồng. Hai bên thống nhất nghiệm thu đạt.',
    notes_title: 'III. GHI CHÚ:', footer_note: 'Biên bản được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau.',
    sign_label_a: 'NGƯỜI GIAO HÀNG', sign_label_b: 'NGƯỜI NHẬN HÀNG' };
}

/** An unversioned saved override is historical content, never an implicit new template. */
export function loadHandoverReport(defaults: HandoverReportState, saved?: Partial<HandoverReportState> | null): HandoverReportState {
  if (!saved) return defaults;
  const version = saved.template_version ?? 1;
  return { ...(version === 3 ? defaults : historicalDefaults(defaults, version)), ...saved, template_version: version };
}

/** Switching templates is only a draft operation. Retain the user's business text and lines. */
export function convertHandoverReport(state: HandoverReportState, defaults: HandoverReportState): HandoverReportState {
  const old = historicalDefaults(defaults, state.template_version);
  const preferCustom = (key: keyof HandoverReportState) => state[key] === old[key] ? defaults[key] : state[key];
  const label = (key: 'sign_label_a' | 'sign_label_b', earlier: string) => state[key] === earlier || state[key] === old[key] ? defaults[key] : state[key];
  return { ...defaults, title: String(preferCustom('title')), subtitle: state.subtitle,
    intro2: state.intro2.replace(/^(Căn cứ Hợp đồng số [^\r\n]* ngày [^\r\n]*), hai bên tiến hành bàn giao như sau:$/u, '$1, hai bên lập biên bản ghi nhận việc giao nhận hàng hóa như sau:'),
    party_a_label: String(preferCustom('party_a_label')), party_b_label: String(preferCustom('party_b_label')),
    items_title: String(preferCustom('items_title')), items: state.items.map(item => ({ ...item })),
    conclusion_title: String(preferCustom('conclusion_title')), conclusion: String(preferCustom('conclusion')),
    notes_title: String(preferCustom('notes_title')), notes: state.notes, footer_note: String(preferCustom('footer_note')),
    sign_label_a: label('sign_label_a', 'BÊN GIAO (BÊN A)'), sign_label_b: label('sign_label_b', 'BÊN NHẬN (BÊN B)'),
    sign_caption_a: state.sign_caption_a === '(Ký, đóng dấu)' ? defaults.sign_caption_a : state.sign_caption_a,
    sign_caption_b: state.sign_caption_b === '(Ký, đóng dấu)' ? defaults.sign_caption_b : state.sign_caption_b };
}

export function handoverToday(now = new Date()): string { return contractBusinessDate(now.toISOString()); }

/** Every output consumes these same event, party and signature texts. */
export function resolveHandoverReport(state: HandoverReportState) {
  const version = handoverTemplateVersion(state);
  const date = state.handover_date ? contractDateLabel(state.handover_date) : '…/…/……';
  const eventLines = version === 1
    ? [state.intro1.split('{ngày_bàn_giao}').join(state.handover_date ? date : '—')]
    : [`Thời gian giao nhận: ${state.handover_time ? `${state.handover_time}, ` : ''}ngày ${date}`,
      `Địa điểm giao nhận: ${state.handover_location.trim() || '…………………………………………'}`];
  const person = (text: string, label: string, name: string, role: string) => [text, `${label}: ${name.trim() || '……………………'}`, ...(role.trim() ? [`Vai trò / chức vụ: ${role.trim()}`] : [])].filter(Boolean).join('\n');
  return { eventLines,
    party_a_text: version === 2 ? person(state.party_a_text, 'Người giao hàng', state.sign_name_a, state.handover_role_a) : state.party_a_text,
    party_b_text: version === 2 ? person(state.party_b_text, 'Người nhận hàng', state.sign_name_b, state.handover_role_b) : state.party_b_text,
    sign_name_a: version === 3 ? '' : state.sign_name_a, sign_name_b: version === 3 ? '' : state.sign_name_b,
    sign_role_a: version === 2 ? state.handover_role_a : '', sign_role_b: version === 2 ? state.handover_role_b : '',
    specifications_header: version === 3 ? 'Quy cách / kích thước' : 'Kích thước',
    status_header: version === 3 ? 'Tình trạng thực tế' : 'Tình trạng',
    status_fallback: version === 3 ? '—' : 'Đạt',
  };
}

export interface HandoverEditorSession {
  contractKey: string | null; open: boolean; report: HandoverReportState; savedReport: HandoverReportState;
  legacyReport: HandoverReportState | null; dirty: boolean; sourceKey: string; pendingSourceKey: string | null;
}
export type HandoverEditorAction =
  | { type: 'hydrate'; contractKey: string; open: boolean; report: HandoverReportState; sourceKey: string }
  | { type: 'edit'; update: (report: HandoverReportState) => HandoverReportState }
  | { type: 'back' }
  | { type: 'saved'; contractKey: string; submitted: HandoverReportState };

export function createHandoverSession(report: HandoverReportState): HandoverEditorSession {
  return { contractKey: null, open: false, report, savedReport: report, legacyReport: null, dirty: false, sourceKey: '', pendingSourceKey: null };
}
const sameReport = (a: HandoverReportState, b: HandoverReportState) => JSON.stringify(a) === JSON.stringify(b);

/** Refetch/settings arrival cannot replace a dirty form, even while a save is pending. */
export function handoverEditorReducer(state: HandoverEditorSession, action: HandoverEditorAction): HandoverEditorSession {
  if (action.type === 'edit') return { ...state, report: action.update(state.report), dirty: true };
  if (action.type === 'back') return state.legacyReport ? { ...state, report: state.legacyReport, dirty: !sameReport(state.legacyReport, state.savedReport) } : state;
  if (action.type === 'saved') {
    if (state.contractKey !== action.contractKey) return state;
    return { ...state, savedReport: action.submitted, dirty: !sameReport(state.report, action.submitted),
      legacyReport: isLegacyHandover(action.submitted) ? action.submitted : null, pendingSourceKey: state.sourceKey };
  }
  if (!action.open) return state.open ? { ...state, open: false } : state;
  const sameContract = state.contractKey === action.contractKey;
  // A successful save may finish before the contract query catches up. Do not restore its old override.
  if (sameContract && state.pendingSourceKey === action.sourceKey) {
    return state.open ? state : { ...state, open: true, report: state.savedReport, dirty: false };
  }
  if (sameContract && state.open && state.dirty) {
    // Observe the new persisted source without replacing the draft. The next save
    // must guard against this source, rather than the source from a previous save.
    return state.sourceKey === action.sourceKey ? state : { ...state, sourceKey: action.sourceKey, pendingSourceKey: null };
  }
  if (sameContract && state.open && state.sourceKey === action.sourceKey && sameReport(state.report, action.report)) return state;
  return { contractKey: action.contractKey, open: true, report: action.report, savedReport: action.report,
    legacyReport: isLegacyHandover(action.report) ? action.report : null, dirty: false, sourceKey: action.sourceKey, pendingSourceKey: null };
}
