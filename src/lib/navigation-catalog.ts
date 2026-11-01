import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, BookOpen, Boxes, CalendarCheck2, CircleDollarSign, CreditCard,
  Factory, FileSignature, FileText, Globe, Headphones, Home, Package, Receipt,
  Scissors, ShoppingCart, Truck, UserRound, Users2, Wallet, WalletCards,
  Bot, Building,
} from 'lucide-react';
import type { PermissionType } from '@/hooks/useEmployeePermissions';

export type NavigationGroupId = 'sales' | 'operations' | 'delivery' | 'people' | 'finance' | 'system';
export type NavigationSection = 'top' | 'group' | 'account';
export type NavigationRouteId =
  | 'dashboard' | 'reports'
  | 'customers' | 'quotes' | 'orders' | 'customer-care' | 'contracts' | 'products'
  | 'production-orders' | 'fabrics' | 'inventory-management'
  | 'ghn-tracking' | 'shipping-companies'
  | 'production-attendance' | 'payroll-settings' | 'profile-review'
  | 'cash-flow' | 'transactions' | 'einvoices' | 'cost-management'
  | 'user-management' | 'api-settings' | 'integration-access' | 'ai-settings' | 'knowledge-base' | 'web-scraper'
  | 'my-attendance' | 'my-profile';

export type NavigationItem = Readonly<{
  id: NavigationRouteId;
  section: NavigationSection;
  groupId?: NavigationGroupId;
  label: string;
  path: string;
  icon: LucideIcon;
  aliases: readonly string[];
  permission?: PermissionType;
  permissions?: readonly PermissionType[];
  selfOnly?: true;
  integrationAdmin?: true;
  localProductionException?: true;
  pinnable?: false;
}>;

export type NavigationGroup = Readonly<{
  id: NavigationGroupId;
  label: string;
  aliases: readonly string[];
  icon: LucideIcon;
}>;

export type NavigationVisibilityContext = Readonly<{
  actorId: string | null | undefined;
  role: string | null | undefined;
  isLocalBackend: boolean;
  hasLocalSession: boolean;
  hasPermission: (permission: PermissionType) => boolean;
}>;

export const MAX_NAVIGATION_PINS = 4;

export const NAVIGATION_GROUPS: readonly NavigationGroup[] = Object.freeze([
  Object.freeze({ id: 'sales', label: 'Bán hàng', aliases: Object.freeze(['Kinh doanh', 'sales']), icon: ShoppingCart }),
  Object.freeze({ id: 'operations', label: 'Kho & sản xuất', aliases: Object.freeze(['Vận hành', 'sản xuất', 'xưởng', 'operations']), icon: Factory }),
  Object.freeze({ id: 'delivery', label: 'Giao hàng', aliases: Object.freeze(['vận chuyển', 'delivery']), icon: Truck }),
  Object.freeze({ id: 'people', label: 'Nhân sự & lương', aliases: Object.freeze(['Nhân sự', 'lương', 'people']), icon: Users2 }),
  Object.freeze({ id: 'finance', label: 'Tài chính', aliases: Object.freeze(['thu chi', 'finance']), icon: Wallet }),
  Object.freeze({ id: 'system', label: 'Hệ thống', aliases: Object.freeze(['quản trị', 'system']), icon: Globe }),
]);

const productionPermissions = ['production_view', 'production_manage', 'production_operations', 'production_sales_submit', 'production_sales_workflow', 'production_cutting_plan', 'inventory_documents', 'ghn_tracking'] as const satisfies readonly PermissionType[];
const attendancePermissions = ['production_view', 'production_operations', 'production_manage'] as const satisfies readonly PermissionType[];
const payrollPermissions = ['payroll_view', 'payroll_team_view', 'payroll_worker_manage', 'payroll_rate_view', 'payroll_rate_manage', 'payroll_policy_manage', 'payroll_insurance_manage', 'payroll_bank_manage', 'payroll_audit'] as const satisfies readonly PermissionType[];
const costPermissions = ['cost_transactions', 'cost_categories', 'cost_centers', 'cost_objects', 'transaction_types', 'cost_audit'] as const satisfies readonly PermissionType[];

const item = (value: NavigationItem): NavigationItem => Object.freeze({ ...value, aliases: Object.freeze([...value.aliases]), permissions: value.permissions ? Object.freeze([...value.permissions]) : undefined });

export const NAVIGATION_CATALOG: readonly NavigationItem[] = Object.freeze([
  item({ id: 'dashboard', section: 'top', label: 'Tổng quan', path: '/dashboard', icon: Home, aliases: ['trang chủ', 'dashboard'], permission: 'dashboard' }),
  item({ id: 'reports', section: 'top', label: 'Báo cáo', path: '/reports', icon: BarChart3, aliases: ['thống kê', 'phân tích'], permission: 'reports' }),

  item({ id: 'customers', section: 'group', groupId: 'sales', label: 'Khách hàng', path: '/customers', icon: Users2, aliases: ['kh', 'crm'], permission: 'customers' }),
  item({ id: 'quotes', section: 'group', groupId: 'sales', label: 'Báo giá', path: '/quotes', icon: FileText, aliases: ['quote', 'báo giá khách'], permission: 'quotes' }),
  item({ id: 'orders', section: 'group', groupId: 'sales', label: 'Đơn hàng', path: '/orders', icon: ShoppingCart, aliases: ['order', 'đơn bán'], permission: 'orders' }),
  item({ id: 'customer-care', section: 'group', groupId: 'sales', label: 'Chăm sóc KH', path: '/customer-care', icon: Headphones, aliases: ['chăm sóc khách hàng', 'cskh'], permission: 'customer_care' }),
  item({ id: 'contracts', section: 'group', groupId: 'sales', label: 'Hợp đồng', path: '/contracts', icon: FileSignature, aliases: ['contract'], permission: 'contracts' }),
  item({ id: 'products', section: 'group', groupId: 'sales', label: 'Sản phẩm', path: '/products', icon: Package, aliases: ['hàng hóa', 'catalog'], permission: 'products' }),

  item({ id: 'production-orders', section: 'group', groupId: 'operations', label: 'Lệnh sản xuất', path: '/production-orders', icon: Factory, aliases: ['sản xuất', 'xưởng', 'workshop'], permissions: productionPermissions, localProductionException: true }),
  item({ id: 'fabrics', section: 'group', groupId: 'operations', label: 'Kho vải', path: '/fabrics', icon: Scissors, aliases: ['vải', 'fabric'], permission: 'fabric_management' }),
  item({ id: 'inventory-management', section: 'group', groupId: 'operations', label: 'Kho & vật tư', path: '/inventory-management', icon: Boxes, aliases: ['kho', 'inventory', 'nguyên liệu'], permission: 'inventory_view' }),

  item({ id: 'ghn-tracking', section: 'group', groupId: 'delivery', label: 'Theo dõi GHN', path: '/ghn-tracking', icon: Truck, aliases: ['vận chuyển ghn', 'ghn', 'tracking', 'giao hàng'], permission: 'ghn_tracking' }),
  item({ id: 'shipping-companies', section: 'group', groupId: 'delivery', label: 'Đơn vị vận chuyển', path: '/shipping-companies', icon: Building, aliases: ['nhà xe', 'vận tải'], permission: 'shipping_companies' }),

  item({ id: 'production-attendance', section: 'group', groupId: 'people', label: 'Chấm công & Tính lương', path: '/production-attendance', icon: CalendarCheck2, aliases: ['bảng công', 'attendance', 'xưởng', 'tiền lương', 'lương', 'payroll', 'thu nhập', 'đơn giá công may'], permissions: [...attendancePermissions, ...payrollPermissions] }),
  item({ id: 'profile-review', section: 'group', groupId: 'people', label: 'Duyệt hồ sơ', path: '/profile-review', icon: Users2, aliases: ['duyệt hồ sơ nhân sự', 'nhân sự'], permission: 'user_management' }),

  item({ id: 'cash-flow', section: 'group', groupId: 'finance', label: 'Thu chi', path: '/cash-flow', icon: CreditCard, aliases: ['dòng tiền', 'cash flow'], permission: 'cash_flow' }),
  item({ id: 'transactions', section: 'group', groupId: 'finance', label: 'Giao dịch', path: '/transactions', icon: Wallet, aliases: ['thanh toán', 'transaction'], permission: 'transactions' }),
  item({ id: 'einvoices', section: 'group', groupId: 'finance', label: 'Hóa đơn điện tử', path: '/einvoices', icon: Receipt, aliases: ['hóa đơn', 'einvoice'], permission: 'contracts' }),
  item({ id: 'cost-management', section: 'group', groupId: 'finance', label: 'Chi phí & Giá thành', path: '/cost-management', icon: CircleDollarSign, aliases: ['chi phí', 'giá vốn', 'cost'], permissions: costPermissions }),

  item({ id: 'user-management', section: 'group', groupId: 'system', label: 'Tài khoản & phân quyền', path: '/user-management', icon: Users2, aliases: ['quản lý người dùng', 'người dùng', 'phân quyền'], permission: 'user_management' }),
  item({ id: 'api-settings', section: 'group', groupId: 'system', label: 'Cài đặt API', path: '/api-settings', icon: Globe, aliases: ['ghn settings', 'api'], permission: 'user_management', integrationAdmin: true }),
  item({ id: 'integration-access', section: 'group', groupId: 'system', label: 'Kết nối Agent', path: '/integration-access', icon: Globe, aliases: ['api & kết nối agent', 'api & agent', 'agent', 'hermes', 'integration'], permission: 'user_management', integrationAdmin: true }),
  item({ id: 'ai-settings', section: 'group', groupId: 'system', label: 'Cài đặt AI', path: '/ai-settings', icon: Bot, aliases: ['ai', 'trí tuệ nhân tạo'], permission: 'user_management' }),
  item({ id: 'knowledge-base', section: 'group', groupId: 'system', label: 'Kho tri thức', path: '/knowledge-base', icon: BookOpen, aliases: ['tri thức', 'knowledge', 'kho kiến thức'], permission: 'knowledge_base' }),
  item({ id: 'web-scraper', section: 'group', groupId: 'system', label: 'Thu thập dữ liệu web', path: '/web-scraper', icon: Globe, aliases: ['cào dữ liệu', 'scraper'], permission: 'user_management' }),

  item({ id: 'my-attendance', section: 'account', label: 'Công & thu nhập của tôi', path: '/my-attendance', icon: CalendarCheck2, aliases: ['công của tôi', 'thu nhập', 'chấm công cá nhân'], selfOnly: true, pinnable: false }),
  item({ id: 'my-profile', section: 'account', label: 'Hồ sơ của tôi', path: '/my-profile', icon: UserRound, aliases: ['tài khoản', 'profile'], selfOnly: true, pinnable: false }),
]);

export function isNavigationItemVisible(item: NavigationItem, context: NavigationVisibilityContext): boolean {
  if (!context.actorId) return false;
  if (item.integrationAdmin) return context.isLocalBackend && context.hasLocalSession && context.role === 'admin' && context.actorId !== 'local-admin';
  if (item.selfOnly) return context.isLocalBackend && context.hasLocalSession;
  if (item.localProductionException && context.isLocalBackend && context.hasLocalSession) return true;
  if (item.permissions) return item.permissions.some(permission => context.hasPermission(permission));
  return item.permission ? context.hasPermission(item.permission) : false;
}

export function visibleNavigationItems(context: NavigationVisibilityContext, catalog: readonly NavigationItem[] = NAVIGATION_CATALOG): NavigationItem[] {
  return catalog.filter(item => isNavigationItemVisible(item, context));
}

export function navigationItemsInSection(items: readonly NavigationItem[], section: NavigationSection): NavigationItem[] {
  return items.filter(item => item.section === section);
}

export function navigationItemsByGroup(items: readonly NavigationItem[], groupId: NavigationGroupId): NavigationItem[] {
  return items.filter(item => item.section === 'group' && item.groupId === groupId);
}

export function navigationGroupForPath(pathname: string, items: readonly NavigationItem[]): NavigationGroupId | null {
  const normalizedPath = pathname === '/payroll-settings' ? '/production-attendance' : pathname;
  return items.find(item => item.path === normalizedPath)?.groupId || null;
}

export function normalizeNavigationSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi-VN').replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');
}

export function searchNavigationItems(items: readonly NavigationItem[], query: string): NavigationItem[] {
  const normalized = normalizeNavigationSearch(query);
  const groups = new Map(NAVIGATION_GROUPS.map(group => [group.id, group]));
  return items.filter(item => {
    if (item.section === 'account') return false;
    if (!normalized) return true;
    const group = item.groupId ? groups.get(item.groupId) : undefined;
    return normalizeNavigationSearch([
      item.label,
      item.path,
      ...item.aliases,
      group?.label || '',
      ...(group?.aliases || []),
    ].join(' ')).includes(normalized);
  });
}

export function isNavigationSearchShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>): boolean {
  if (event.key.toLowerCase() !== 'k' || (!event.ctrlKey && !event.metaKey) || event.altKey) return false;
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = target?.tagName?.toLowerCase();
  return !target?.isContentEditable && tag !== 'input' && tag !== 'textarea' && tag !== 'select';
}

export type NavigationFavoritesIdentity = Readonly<{ actorId: string | null | undefined; isLocalBackend: boolean; origin: string }>;

export function navigationFavoritesStorageKey(identity: NavigationFavoritesIdentity): string | null {
  if (!identity.actorId || !identity.origin) return null;
  return `crm-joliefam.navigation-pins.v1:${identity.isLocalBackend ? 'local' : 'hosted'}:${encodeURIComponent(identity.origin)}:${encodeURIComponent(identity.actorId)}`;
}

export function sanitizeNavigationFavoriteIds(ids: unknown, visibleItems: readonly NavigationItem[], maxPins = MAX_NAVIGATION_PINS): NavigationRouteId[] {
  if (!Array.isArray(ids)) return [];
  const allowed = new Set(visibleItems.filter(item => item.pinnable !== false).map(item => item.id));
  const seen = new Set<string>();
  const result: NavigationRouteId[] = [];
  for (const value of ids) {
    if (typeof value !== 'string' || seen.has(value) || !allowed.has(value as NavigationRouteId)) continue;
    seen.add(value); result.push(value as NavigationRouteId);
    if (result.length === maxPins) break;
  }
  return result;
}

export function parseNavigationFavoriteIds(raw: string | null | undefined, visibleItems: readonly NavigationItem[]): NavigationRouteId[] {
  if (!raw) return [];
  try { return sanitizeNavigationFavoriteIds(JSON.parse(raw), visibleItems); }
  catch { return []; }
}

export function defaultBottomNavigationItems(visibleItems: readonly NavigationItem[], favoriteIds: readonly NavigationRouteId[], role: string | null | undefined): NavigationItem[] {
  const byId = new Map(visibleItems.map(item => [item.id, item]));
  const selected: NavigationItem[] = [];
  const add = (id: NavigationRouteId) => {
    const item = byId.get(id);
    if (item && !selected.some(existing => existing.id === item.id)) selected.push(item);
  };
  favoriteIds.forEach(add);
  const salesDefaults: readonly NavigationRouteId[] = ['orders', 'quotes', 'customers'];
  const employeeHasSalesWork = salesDefaults.some(id => byId.has(id));
  const defaults: readonly NavigationRouteId[] = role === 'accountant'
    ? ['cash-flow', 'transactions', 'reports']
    : role === 'employee' && employeeHasSalesWork
      ? salesDefaults
      : role === 'employee' || role === 'team_leader'
      ? ['my-attendance', 'production-orders', 'production-attendance']
      : salesDefaults;
  defaults.forEach(add);
  visibleItems.filter(item => item.section !== 'account').forEach(item => add(item.id));
  visibleItems.filter(item => item.section === 'account').forEach(item => add(item.id));
  return selected.slice(0, 3);
}
