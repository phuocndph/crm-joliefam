/** Matches public.has_payroll_permission; sensitive capabilities are role-owned. */
export const payrollPermissions = ['payroll_view','payroll_team_view','payroll_worker_manage','payroll_rate_view','payroll_rate_manage','payroll_policy_manage','payroll_insurance_manage','payroll_bank_manage','payroll_audit'] as const;
export const delegablePayrollPermissions = new Set<string>(['payroll_view','payroll_team_view','payroll_worker_manage']);
const payrollRoles: Record<string, readonly string[]> = {
  admin: payrollPermissions,
  manager: payrollPermissions.filter(p => p !== 'payroll_insurance_manage' && p !== 'payroll_bank_manage'),
  accountant: ['payroll_view','payroll_rate_view','payroll_insurance_manage','payroll_bank_manage','payroll_audit'],
};
export function payrollCapability(role: string, permission: string, grants: ReadonlySet<string>) {
  if (!payrollPermissions.includes(permission as typeof payrollPermissions[number])) return false;
  return (payrollRoles[role] || []).includes(permission) || (delegablePayrollPermissions.has(permission) && grants.has(permission));
}
export const permissionCatalog = new Set<string>([
  'dashboard','customers','products','quotes','orders','cash_flow','transactions','reports','user_management','quote_supplement','customer_care','fabric_management','ghn_tracking','quote_approval','knowledge_base','contracts','shipping_companies',
  'cost_transactions','cost_categories','cost_centers','cost_objects','transaction_types','cost_transaction_confirm','cost_transaction_void','cost_audit',
  'inventory_view','inventory_items','inventory_documents','inventory_confirm','inventory_adjustment','inventory_opening','inventory_cost_view','inventory_audit',
  'bom_view','bom_manage','bom_approve','cutting_profiles','cutting_approve','production_view','production_manage','production_release','production_complete','production_operations','production_sales_submit','production_sales_workflow','production_cutting_plan','production_worker_manage','production_attendance_approve',
  ...payrollPermissions,
]);
export function validatePermissionChanges(input: unknown): Array<{permission_type: string; enabled: boolean}> {
  if (!Array.isArray(input)) throw new Error('Danh sách quyền không hợp lệ.');
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || typeof item.permission_type !== 'string' || !permissionCatalog.has(item.permission_type) || typeof item.enabled !== 'boolean' || seen.has(item.permission_type)) throw new Error('Danh sách quyền không hợp lệ hoặc bị trùng.');
    seen.add(item.permission_type);
    if (item.permission_type.startsWith('payroll_') && !delegablePayrollPermissions.has(item.permission_type)) throw Object.assign(new Error('Quyền lương nhạy cảm được xác định theo vai trò, không thể cấp riêng.'), {status:403});
  }
  return input;
}
