import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export type Capability = { id: string; label: string; resource: string; secondary?: string; tool: string; path: string; extended?: boolean; module?: string; action?: string };
export type Grant = { capability: string; resource_ids: string[]; secondary_ids: string[]; contact_access: boolean; all_resources?: boolean };
type PickerProps = { type: string; selected: string[]; onChange: (value: string[]) => void; label: string; disabled?: boolean };

const MODULE_LABELS: Record<string, string> = {
  customers: 'Khách hàng', orders: 'Đơn hàng', quotes: 'Báo giá', catalog: 'Sản phẩm & bảng giá', shipping: 'Vận chuyển GHN',
  inventory: 'Kho', fabric: 'Vải', production: 'Lệnh sản xuất', manufacturing: 'Định mức & sản xuất', attendance: 'Chấm công',
  payroll: 'Tiền lương', finance: 'Tài chính, thu chi', cost: 'Giá vốn & giá thành', invoices: 'Hóa đơn điện tử', contracts: 'Hợp đồng',
  reports: 'Báo cáo', knowledge: 'Tri thức', ai: 'Trợ lý AI', users: 'Tài khoản & phân quyền', settings: 'Cài đặt', sync: 'Đồng bộ & sao lưu',
};
const MODULE_ORDER = Object.keys(MODULE_LABELS);
const ACTIONS = [
  { id: 'read', label: 'Xem' },
  { id: 'write', label: 'Ghi' },
  { id: 'provider', label: 'Gửi ra ngoài', hint: 'Gọi dịch vụ ngoài như GHN, hóa đơn điện tử, AI' },
] as const;
/** Mảng nhạy cảm: không nằm trong các nút chọn nhanh, quản trị phải tích tay. */
const SENSITIVE = new Set(['payroll', 'users', 'settings', 'sync', 'ai']);
const SALES = ['customers', 'orders', 'quotes', 'shipping'];

export const moduleLabel = (module = '') => MODULE_LABELS[module] || module;
export function capabilityLabel(cap: Capability | undefined, id = '') {
  if (!cap) return id;
  if (!cap.extended) return cap.label;
  const action = ACTIONS.find(a => a.id === cap.action)?.label || cap.action;
  return `${moduleLabel(cap.module)} · ${action}`;
}

/** Quyền mới luôn mặc định phạm vi toàn bộ; ai cần hẹp hơn thì chuyển sang chọn từng hồ sơ. */
export const newGrant = (capability: string): Grant => ({ capability, resource_ids: [], secondary_ids: [], contact_access: false, all_resources: true });

/** Quyền tra cứu cũ đã chọn nhưng chưa có hồ sơ nào thì sẽ không có hiệu lực. */
export function incompleteGrant(grant: Grant) {
  if (grant.capability.startsWith('business.') || grant.all_resources) return false;
  return !grant.resource_ids.length || (grant.capability === 'inventory.read' && !grant.secondary_ids.length);
}

type Props = {
  catalog: Capability[];
  grants: Grant[];
  busy: boolean;
  onChange: (next: Grant[]) => void;
  Picker: ComponentType<PickerProps>;
};

export function PermissionsEditor({ catalog, grants, busy, onChange, Picker }: Props) {
  const legacy = catalog.filter(c => !c.extended);
  const business = catalog.filter(c => c.extended);
  const modules = [...new Set(business.map(c => c.module || ''))].sort((a, b) => {
    const ia = MODULE_ORDER.indexOf(a), ib = MODULE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const capFor = (module: string, action: string) => business.find(c => c.module === module && c.action === action);
  const has = (id: string) => grants.some(g => g.capability === id);
  const find = (id: string) => grants.find(g => g.capability === id);

  const setMany = (ids: string[], on: boolean) => {
    if (busy) return;
    if (on) onChange([...grants, ...ids.filter(id => !has(id)).map(newGrant)]);
    else onChange(grants.filter(g => !ids.includes(g.capability)));
  };
  const patch = (id: string, value: Partial<Grant>) => {
    if (!busy) onChange(grants.map(g => (g.capability === id ? { ...g, ...value } : g)));
  };

  const readIds = (withSensitive: boolean) => [
    ...legacy.map(c => c.id),
    ...business.filter(c => c.action === 'read' && (withSensitive || !SENSITIVE.has(c.module || ''))).map(c => c.id),
  ];
  const presets = [
    { label: 'Chỉ xem (khuyên dùng)', desc: 'Xem mọi mảng, trừ lương, tài khoản, cài đặt, đồng bộ, AI', ids: readIds(false) },
    { label: 'Xem + ghi bán hàng', desc: 'Thêm quyền ghi khách, đơn, báo giá, vận chuyển', ids: [...readIds(false), ...business.filter(c => c.action === 'write' && SALES.includes(c.module || '')).map(c => c.id)] },
  ];
  const presetActive = (ids: string[]) => ids.length > 0 && ids.every(has);
  const businessCount = grants.filter(g => g.capability.startsWith('business.')).length;
  const legacyCount = grants.length - businessCount;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Chọn nhanh</h3>
          <span className="text-sm text-muted-foreground">Đang chọn {grants.length} quyền</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {presets.map(p => (
            <Button key={p.label} type="button" variant={presetActive(p.ids) ? 'default' : 'outline'} disabled={busy} className="h-auto py-2 flex-col items-start text-left whitespace-normal" onClick={() => setMany(p.ids, true)}>
              <span className="font-medium">{p.label}</span>
              <span className="text-xs opacity-80 font-normal">{p.desc}</span>
            </Button>
          ))}
          <Button type="button" variant="outline" disabled={busy || !grants.length} className="h-auto py-2 flex-col items-start text-left whitespace-normal" onClick={() => !busy && onChange([])}>
            <span className="font-medium">Bỏ chọn tất cả</span>
            <span className="text-xs opacity-80 font-normal">Xóa hết lựa chọn chưa lưu</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Chọn nhanh chỉ cộng thêm quyền, không bỏ quyền anh đã tích. Bấm xong vẫn cần bấm "Lưu quyền và phạm vi".</p>
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Công cụ tra cứu nhanh · {legacyCount}/{legacy.length}</h3>
            <p className="text-xs text-muted-foreground">Mặc định xem toàn bộ, kể cả hồ sơ tạo sau này. Muốn hẹp hơn thì chọn từng hồ sơ.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || legacyCount === legacy.length} onClick={() => setMany(legacy.map(c => c.id), true)}>Chọn cả {legacy.length}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy || !legacyCount} onClick={() => setMany(legacy.map(c => c.id), false)}>Bỏ chọn</Button>
          </div>
        </div>
        <div className="space-y-2">
          {legacy.map(cap => {
            const grant = find(cap.id);
            return (
              <div key={cap.id} className="rounded-md border p-2 space-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-3 font-medium cursor-pointer min-w-0 flex-1">
                    <Checkbox disabled={busy} checked={Boolean(grant)} onCheckedChange={checked => setMany([cap.id], checked === true)} />
                    {cap.label} · Chỉ xem
                  </label>
                  {grant && (
                    <div className="flex rounded-md border p-0.5 text-sm" role="radiogroup" aria-label={'Phạm vi ' + cap.label}>
                      <button type="button" role="radio" aria-checked={grant.all_resources === true} disabled={busy} className={'rounded px-2 py-1 ' + (grant.all_resources ? 'bg-primary text-primary-foreground' : '')} onClick={() => patch(cap.id, { all_resources: true, resource_ids: [], secondary_ids: [] })}>Toàn bộ</button>
                      <button type="button" role="radio" aria-checked={!grant.all_resources} aria-label={'Chọn từng hồ sơ ' + cap.label} disabled={busy} className={'rounded px-2 py-1 ' + (!grant.all_resources ? 'bg-primary text-primary-foreground' : '')} onClick={() => patch(cap.id, { all_resources: false })}>Chọn từng hồ sơ</button>
                    </div>
                  )}
                </div>
                {grant && !grant.all_resources && (
                  <>
                    <Picker disabled={busy} type={cap.resource} selected={grant.resource_ids} onChange={ids => patch(cap.id, { resource_ids: ids })} label={cap.label} />
                    {cap.secondary && <Picker disabled={busy} type={cap.secondary} selected={grant.secondary_ids} onChange={ids => patch(cap.id, { secondary_ids: ids })} label="Vật tư được xem" />}
                    {incompleteGrant(grant) && <p className="text-xs text-destructive">Chưa chọn hồ sơ nào nên quyền này chưa có hiệu lực.</p>}
                  </>
                )}
                {grant && cap.id === 'customers.read' && (
                  <label className="flex gap-3 items-center text-sm cursor-pointer pl-7">
                    <Checkbox disabled={busy} checked={grant.contact_access} onCheckedChange={checked => patch(cap.id, { contact_access: checked === true })} />
                    Cho xem email, số điện thoại và địa chỉ khách hàng
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {business.length > 0 && (
        <div className="rounded-lg border p-3 space-y-3">
          <div>
            <h3 className="font-semibold">Nghiệp vụ theo mảng · {businessCount}/{business.length}</h3>
            <p className="text-xs text-muted-foreground">Mỗi ô cấp cả mảng đó. Agent chỉ làm được trong vai trò đặt ở tab "Danh tính thực thi". Mảng có dấu * là dữ liệu nhạy cảm.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium py-2 pr-2">Mảng</th>
                  {ACTIONS.map(a => {
                    const ids = business.filter(c => c.action === a.id).map(c => c.id);
                    const all = ids.length > 0 && ids.every(has);
                    const some = ids.some(has);
                    return (
                      <th key={a.id} className="font-medium py-2 px-2 text-center whitespace-nowrap" title={'hint' in a ? a.hint : undefined}>
                        <label className="inline-flex flex-col items-center gap-1 cursor-pointer">
                          <span>{a.label}</span>
                          <Checkbox className="data-[state=indeterminate]:bg-primary/40" aria-label={'Chọn cả cột ' + a.label} disabled={busy || !ids.length} checked={all ? true : some ? 'indeterminate' : false} onCheckedChange={() => setMany(ids, !all)} />
                        </label>
                      </th>
                    );
                  })}
                  <th className="font-medium py-2 pl-2 text-center">Cả hàng</th>
                </tr>
              </thead>
              <tbody>
                {modules.map(module => {
                  const ids = ACTIONS.map(a => capFor(module, a.id)?.id).filter((id): id is string => Boolean(id));
                  const all = ids.every(has);
                  return (
                    <tr key={module} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 pr-2">{moduleLabel(module)}{SENSITIVE.has(module) ? ' *' : ''}</td>
                      {ACTIONS.map(a => {
                        const cap = capFor(module, a.id);
                        return (
                          <td key={a.id} className="py-2 px-2 text-center">
                            {cap ? <Checkbox aria-label={capabilityLabel(cap)} disabled={busy} checked={has(cap.id)} onCheckedChange={checked => setMany([cap.id], checked === true)} /> : <span className="text-muted-foreground">-</span>}
                          </td>
                        );
                      })}
                      <td className="py-2 pl-2 text-center">
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setMany(ids, !all)}>{all ? 'Bỏ' : 'Tất cả'}</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
