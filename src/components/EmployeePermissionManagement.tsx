import { useCallback, useState, useEffect, useRef } from 'react';
import type { User as AuthUser } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { PermissionType } from '@/hooks/useEmployeePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { User, Shield, Settings, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { isLocalBackend, localAdminUser } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';
import { notifyPermissionsChanged } from '@/lib/permission-refresh';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  user_roles?: { role: string }[];
  manager_info?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
}

interface Permission {
  permission_type: PermissionType;
  enabled: boolean;
}

const permissionLabels = {
  dashboard: 'Tổng quan - Thống kê',
  customers: 'Khách hàng - Quản lý danh sách khách hàng',
  products: 'Sản phẩm - Quản lý kho hàng và giá',
  quotes: 'Báo giá - Tạo và quản lý báo giá',
  orders: 'Đơn hàng - Xử lý và theo dõi đơn hàng',
  cash_flow: 'Dòng tiền - Quản lý thu chi',
  transactions: 'Giao dịch - Lịch sử thanh toán',
  reports: 'Báo cáo - Thống kê và phân tích',
  user_management: 'Quản lý nhân viên - Phân quyền người dùng',
  quote_supplement: 'Quyền xem báo giá phụ',
  customer_care: 'Chăm sóc khách hàng - Hỗ trợ và tư vấn',
  fabric_management: 'Quản lý vải - Kho vải và giao dịch',
  ghn_tracking: 'Theo dõi GHN - Tra cứu vận chuyển',
  quote_approval: 'Duyệt báo giá - Cho phép duyệt và từ chối báo giá',
  knowledge_base: 'Kho Kiến Thức - AI hỗ trợ bán hàng',
  contracts: 'Hợp đồng - Quản lý hợp đồng khách hàng',
  shipping_companies: 'Nhà xe - Quản lý nhà xe vận chuyển',
  cost_transactions: 'Chi phí - Giao dịch nghiệp vụ',
  cost_categories: 'Chi phí - Danh mục chi phí',
  cost_centers: 'Chi phí - Trung tâm chi phí',
  cost_objects: 'Chi phí - Đối tượng chịu chi phí',
  transaction_types: 'Chi phí - Cấu hình loại nghiệp vụ',
  cost_transaction_confirm: 'Chi phí - Xác nhận giao dịch',
  cost_transaction_void: 'Chi phí - Hủy giao dịch đã xác nhận',
  cost_audit: 'Chi phí - Xem lịch sử thay đổi',
  inventory_view: 'Kho & vật tư - Xem tồn kho, phiếu và lịch sử',
  inventory_items: 'Kho & vật tư - Quản lý danh mục vật tư',
  inventory_documents: 'Kho & vật tư - Tạo và hủy phiếu nháp',
  inventory_confirm: 'Kho & vật tư - Xác nhận phiếu kho',
  inventory_adjustment: 'Kho & vật tư - Điều chỉnh tồn kho',
  inventory_opening: 'Kho & vật tư - Tạo tồn đầu kỳ',
  inventory_cost_view: 'Kho & vật tư - Xem đơn giá và giá trị tồn',
  inventory_audit: 'Kho & vật tư - Đối soát sổ kho và nhật ký',
  bom_view: 'Định mức sản xuất - Xem BOM đã duyệt và tính nhu cầu',
  bom_manage: 'Định mức sản xuất - Tạo và chỉnh sửa phiên bản nháp',
  bom_approve: 'Định mức sản xuất - Duyệt và thay thế phiên bản BOM',
  cutting_profiles: 'Định mức cắt - Tạo và chỉnh sửa cấu hình cắt',
  cutting_approve: 'Định mức cắt - Duyệt và thay thế cấu hình cắt',
  production_view: 'Lệnh sản xuất - Xem danh sách và chi tiết',
  production_manage: 'Lệnh sản xuất - Tạo và chỉnh sửa lệnh',
  production_release: 'Lệnh sản xuất - Phát hành và duyệt quy trình',
  production_complete: 'Lệnh sản xuất - Hoàn thành lệnh',
  production_operations: 'Lệnh sản xuất - Vận hành công đoạn và ghi nhận sản lượng',
  production_sales_submit: 'Sản xuất - Sale gửi đơn cần sản xuất',
  production_sales_workflow: 'Sản xuất - Tiếp nhận và phân bổ đơn Sale',
  production_cutting_plan: 'Sản xuất - Lập dự toán cắt',
  production_worker_manage: 'Lệnh sản xuất - Quản lý công nhân sản xuất',
  production_attendance_approve: 'Chấm công xưởng - Duyệt công trong phạm vi tổ',
  payroll_view: 'Tiền lương - Xem dữ liệu được phân quyền',
  payroll_team_view: 'Tiền lương - Xem nhân sự trong tổ',
  payroll_worker_manage: 'Tiền lương - Cập nhật nhân sự trong tổ',
  payroll_rate_view: 'Tiền lương - Xem mức công và lịch sử đơn giá',
  payroll_rate_manage: 'Tiền lương - Quản lý mức công',
  payroll_policy_manage: 'Tiền lương - Quản lý nhóm chính sách',
  payroll_insurance_manage: 'Tiền lương - Quản lý BHXH',
  payroll_bank_manage: 'Tiền lương - Quản lý tài khoản ngân hàng',
  payroll_audit: 'Tiền lương - Xem nhật ký dữ liệu nhạy cảm',
} satisfies Partial<Record<PermissionType, string>>;

const delegablePayrollPermissions = new Set<PermissionType>([
  'payroll_view', 'payroll_team_view', 'payroll_worker_manage',
]);
const localOnlyPermissions = new Set(['production_sales_submit', 'production_sales_workflow', 'production_cutting_plan']);

const EmployeePermissionManagement = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [initialPermissions, setInitialPermissions] = useState<Permission[]>([]);
  const [permissionsReady, setPermissionsReady] = useState(false);
  const requestVersion = useRef(0);
  const selectedUserId = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [saveReason, setSaveReason] = useState('');
  const { role: currentUserRole } = useUserRole(user);
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {

      if (isLocalBackend()) {
        const users = await localApi.users();
        const employeeProfiles = users
          .filter((profile) => {
            const roles = Array.isArray(profile.user_roles) ? profile.user_roles as Array<{ role?: string }> : [];
            return roles.some((role) => role.role === 'employee' || role.role === 'accountant' || role.role === 'team_leader');
          })
          .map((profile) => {
            const roles = Array.isArray(profile.user_roles) ? profile.user_roles as Array<{ role?: string }> : [];
            return {
              ...profile,
              user_roles: [{ role: roles[0]?.role || 'employee' }],
            } as Profile;
          });
        setEmployees(employeeProfiles);
        return;
      }
      
      // Lấy tất cả profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) {
        console.error('Profiles error:', profilesError);
        throw profilesError;
      }

      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role, assigned_by')
        // Public Supabase keeps its original role enum. `team_leader` is local-only.
        .in('role', ['employee', 'accountant']);

      if (rolesError) {
        console.error('Roles error:', rolesError);
        throw rolesError;
      }

      // Lấy thông tin manager cho employees
      const managerIds = rolesData?.map(r => r.assigned_by).filter(Boolean) || [];
      const { data: managersData } = await supabase
        .from('profiles')
        .select('user_id, email, first_name, last_name')
        .in('user_id', managerIds);


      // Filter và map employee profiles với thông tin manager
      const scopedRoles = (rolesData || []).filter(r => currentUserRole === 'admin' || (r.role === 'employee' && r.assigned_by === user?.id));
      const employeeUserIds = scopedRoles.map(r => r.user_id);
      const employeeProfiles = (profilesData || []).filter(profile => 
        employeeUserIds.includes(profile.user_id)
      ).map(profile => {
        const roleInfo = scopedRoles.find(r => r.user_id === profile.user_id);
        const managerInfo = managersData?.find(m => m.user_id === roleInfo?.assigned_by);
        
        return {
          ...profile,
          user_roles: [{ role: roleInfo?.role || 'employee' }],
          manager_info: managerInfo ? {
            email: managerInfo.email,
            first_name: managerInfo.first_name,
            last_name: managerInfo.last_name
          } : undefined
        };
      });

      setEmployees(employeeProfiles);
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách nhân viên",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, currentUserRole, user?.id]);

  useEffect(() => {
    if (currentUserRole && (currentUserRole === 'admin' || currentUserRole === 'manager')) {
      void fetchEmployees();
    }
  }, [currentUserRole, fetchEmployees]);

  const fetchPermissions = async (employeeUserId: string) => {
    const version = ++requestVersion.current;
    setPermissionsReady(false);
    setPermissions([]);
    setInitialPermissions([]);
    try {
      if (isLocalBackend()) {
        const data = await localApi.employeePermissions(employeeUserId);
        const allPermissions: Permission[] = Object.keys(permissionLabels).map(permissionType => ({
          permission_type: permissionType as PermissionType,
          enabled: data.find((permission) => permission.permission_type === permissionType)?.enabled === true,
        }));
        if (version !== requestVersion.current || selectedUserId.current !== employeeUserId) return;
        setPermissions(allPermissions);
        setInitialPermissions(allPermissions);
        setPermissionsReady(true);
        return;
      }
      const { data, error } = await supabase
        .from('employee_permissions')
        .select('permission_type, enabled')
        .eq('user_id', employeeUserId);

      if (error) throw error;

      // Tạo tất cả các permission với giá trị mặc định nếu chưa có
      const allPermissions: Permission[] = Object.keys(permissionLabels).map(permissionType => {
        const existingPermission = (data || []).find(p => p.permission_type === permissionType);
        return {
          permission_type: permissionType as PermissionType,
          enabled: existingPermission?.enabled || false
        };
      });

      if (version !== requestVersion.current || selectedUserId.current !== employeeUserId) return;
      setPermissions(allPermissions);
      setInitialPermissions(allPermissions);
      setPermissionsReady(true);
    } catch (error) {
      if (version !== requestVersion.current) return;
      console.error('Error fetching permissions:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải quyền của nhân viên",
        variant: "destructive",
      });
    }
  };

  const updatePermission = (permissionType: PermissionType, enabled: boolean) => {
    setPermissions(prev => {
      const existingIndex = prev.findIndex(p => p.permission_type === permissionType);
      if (existingIndex >= 0) {
        // Cập nhật permission hiện có
        return prev.map(p => 
          p.permission_type === permissionType 
            ? { ...p, enabled }
            : p
        );
      } else {
        // Tạo permission mới nếu chưa có
        return [...prev, { permission_type: permissionType, enabled }];
      }
    });
  };

  const savePermissions = async () => {
    if (!selectedEmployee || !permissionsReady || saving) return;
    const targetId = selectedEmployee.user_id;
    const changes = permissions.filter(item => visiblePermissions.some(([key]) => key === item.permission_type) && initialPermissions.find(prior => prior.permission_type === item.permission_type)?.enabled !== item.enabled);
    if (!changes.length) return;

    setSaving(true);
    try {
      if (isLocalBackend()) {
        await localApi.saveEmployeePermissions(targetId, changes, saveReason.trim());
        notifyPermissionsChanged();
        if (selectedUserId.current !== targetId) return;
        setInitialPermissions(permissions);
        toast({ title: "Thành công", description: "Đã cập nhật quyền trên PostgreSQL cục bộ" });
        setReasonOpen(false);
        setSaveReason('');
        return;
      }
      // A separate RPC fails safely on old deployments. Never send a partial
      // list to the legacy replace endpoint (it deletes unsubmitted grants).
      const { error } = await supabase.rpc('patch_employee_permissions' as never, {
        p_user_id: targetId,
        p_permissions: changes,
        p_reason: saveReason.trim(),
      } as never);

      if (error) throw error;
      notifyPermissionsChanged();
      if (selectedUserId.current !== targetId) return;
      setInitialPermissions(permissions);

      toast({
        title: "Thành công",
        description: "Đã cập nhật quyền cho nhân viên",
      });
      setReasonOpen(false);
      setSaveReason('');
    } catch (error) {
      console.error('Error saving permissions:', error);
      toast({
        title: "Lỗi",
        description: "Không thể lưu quyền",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const openSaveDialog = () => {
    if (!selectedEmployee || !permissionsReady || saving) return;
    setSaveReason('');
    setReasonOpen(true);
  };

  const visiblePermissions = Object.entries(permissionLabels).filter(([key]) => {
    if (!isLocalBackend() && localOnlyPermissions.has(key)) return false;
    if (!key.startsWith('payroll_')) return true;
    return delegablePayrollPermissions.has(key as PermissionType);
  });

  const selectEmployee = (employee: Profile) => {
    if (saving) return;
    selectedUserId.current = employee.user_id;
    setReasonOpen(false);
    setSelectedEmployee(employee);
    fetchPermissions(employee.user_id);
  };

  if (!currentUserRole || (currentUserRole !== 'admin' && currentUserRole !== 'manager')) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Không có quyền truy cập
          </CardTitle>
          <CardDescription>
            {currentUserRole === 'accountant' 
              ? 'Kế toán sử dụng quyền theo vai trò và các quyền bổ sung được quản trị viên cấp.'
              : 'Bạn không có quyền quản lý phân quyền nhân viên'
            }
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Quản lý phân quyền nhân viên & kế toán</h2>
        <p className="text-muted-foreground">
          Cấu hình quyền truy cập các module cho từng nhân viên và kế toán
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Danh sách nhân viên */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Danh sách nhân viên ({employees.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {employees.map((employee) => (
              <div
                key={employee.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedEmployee?.id === employee.id
                    ? 'bg-primary/10 border-primary'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => selectEmployee(employee)}
              >
                <div className="font-medium text-sm">
                  {employee.first_name && employee.last_name 
                    ? `${employee.first_name} ${employee.last_name}`
                    : 'Chưa cập nhật tên'
                  }
                </div>
                <div className="text-xs text-muted-foreground">{employee.email}</div>
                {employee.manager_info && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Quản lý: {employee.manager_info.first_name} {employee.manager_info.last_name}
                  </div>
                )}
                <Badge variant={employee.user_roles?.[0]?.role === 'accountant' ? 'outline' : 'secondary'} className="mt-1 text-xs">
                  {employee.user_roles?.[0]?.role === 'accountant'
                    ? 'Kế toán'
                    : employee.user_roles?.[0]?.role === 'team_leader'
                      ? 'Tổ trưởng'
                      : 'Nhân viên'}
                </Badge>
              </div>
            ))}
            {employees.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                Không có nhân viên nào
              </p>
            )}
          </CardContent>
        </Card>

        {/* Cấu hình quyền */}
        <div className="lg:col-span-2">
          {selectedEmployee ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Cấu hình quyền cho {selectedEmployee.first_name} {selectedEmployee.last_name}
                </CardTitle>
                <CardDescription>
                  Chọn các module mà nhân viên này được phép truy cập
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {visiblePermissions.map(([key, label]) => {
                  const permission = permissions.find(p => p.permission_type === key);
                  const isEnabled = permission?.enabled || false;

                  return (
                    <div key={key} className="flex items-center justify-between py-2">
                      <Label htmlFor={key} className="text-sm font-medium cursor-pointer">
                        {label}
                      </Label>
                      <Switch
                        id={key}
                        checked={isEnabled}
                        disabled={!permissionsReady || saving}
                        onCheckedChange={(checked) => 
                          updatePermission(key as PermissionType, checked)
                        }
                      />
                    </div>
                  );
                })}
                
                <div className="pt-4 border-t">
                  <Button onClick={openSaveDialog} disabled={saving || !permissionsReady || !permissions.some(item => visiblePermissions.some(([key]) => key === item.permission_type) && initialPermissions.find(prior => prior.permission_type === item.permission_type)?.enabled !== item.enabled)} className="w-full">
                    {saving ? (
                      <>Đang lưu...</>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Lưu thay đổi
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-16">
                <div className="text-center text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Chọn một nhân viên để cấu hình quyền</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Dialog open={reasonOpen} onOpenChange={(open) => { if (!saving) setReasonOpen(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Xác nhận thay đổi phân quyền</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Lý do bắt buộc để ghi nhật ký. Quyền tiền lương nhạy cảm chỉ hiển thị cho vai trò được phép.</p>
          <div className="space-y-2">
            <Label htmlFor="permission-change-reason">Lý do thay đổi</Label>
            <Textarea id="permission-change-reason" value={saveReason} onChange={(event) => setSaveReason(event.target.value)} placeholder="Ví dụ: Phân quyền kế toán mới nhận việc" />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setReasonOpen(false)}>Hủy</Button>
            <Button disabled={!saveReason.trim() || saving} onClick={() => void savePermissions()}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeePermissionManagement;
