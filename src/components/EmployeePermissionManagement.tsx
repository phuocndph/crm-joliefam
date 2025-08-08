import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { PermissionType } from '@/hooks/useEmployeePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { User, Shield, Settings, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

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

const permissionLabels: Record<PermissionType, string> = {
  dashboard: 'Dashboard - Tổng quan & thống kê',
  customers: 'Khách hàng - Quản lý danh sách khách hàng',
  products: 'Sản phẩm - Quản lý kho hàng và giá',
  quotes: 'Báo giá - Tạo và quản lý báo giá',
  orders: 'Đơn hàng - Xử lý và theo dõi đơn hàng',
  cash_flow: 'Dòng tiền - Quản lý thu chi',
  transactions: 'Giao dịch - Lịch sử thanh toán',
  reports: 'Báo cáo - Thống kê và phân tích',
  user_management: 'Quản lý nhân viên - Phân quyền users',
  quote_supplement: 'Quyền xem báo giá phụ',
  customer_care: 'Chăm sóc khách hàng - Hỗ trợ và tư vấn',
  fabric_management: 'Quản lý vải - Kho vải và giao dịch',
  ghn_tracking: 'Theo dõi GHN - Tra cứu vận chuyển'
};

const EmployeePermissionManagement = () => {
  const [user, setUser] = useState<any>(null);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { role: currentUserRole } = useUserRole(user);
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  useEffect(() => {
    if (currentUserRole && (currentUserRole === 'admin' || currentUserRole === 'manager')) {
      fetchEmployees();
    }
  }, [currentUserRole]);

  const fetchEmployees = async () => {
    try {
      console.log('Fetching employees...');
      
      // Lấy tất cả profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) {
        console.error('Profiles error:', profilesError);
        throw profilesError;
      }

      // Lấy user_roles để filter employees với thông tin manager
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role, assigned_by')
        .eq('role', 'employee');

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

      console.log('Profiles data:', profilesData);
      console.log('Roles data:', rolesData);
      console.log('Managers data:', managersData);

      // Filter và map employee profiles với thông tin manager
      const employeeUserIds = rolesData?.map(r => r.user_id) || [];
      const employeeProfiles = (profilesData || []).filter(profile => 
        employeeUserIds.includes(profile.user_id)
      ).map(profile => {
        const roleInfo = rolesData?.find(r => r.user_id === profile.user_id);
        const managerInfo = managersData?.find(m => m.user_id === roleInfo?.assigned_by);
        
        return {
          ...profile,
          user_roles: [{ role: 'employee' }],
          manager_info: managerInfo ? {
            email: managerInfo.email,
            first_name: managerInfo.first_name,
            last_name: managerInfo.last_name
          } : undefined
        };
      });

      console.log('Employee profiles:', employeeProfiles);
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
  };

  const fetchPermissions = async (employeeUserId: string) => {
    try {
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

      setPermissions(allPermissions);
    } catch (error) {
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
    if (!selectedEmployee) return;

    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('save-employee-permissions', {
        body: {
          userId: selectedEmployee.user_id,
          permissions: permissions
        }
      });

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã cập nhật quyền cho nhân viên",
      });
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

  const selectEmployee = (employee: Profile) => {
    setSelectedEmployee(employee);
    fetchPermissions(employee.user_id);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!currentUserRole || currentUserRole === 'employee') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Không có quyền truy cập
          </CardTitle>
          <CardDescription>
            Bạn không có quyền quản lý phân quyền nhân viên
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Quản lý phân quyền nhân viên</h2>
        <p className="text-muted-foreground">
          Cấu hình quyền truy cập các module cho từng nhân viên
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
                <Badge variant="secondary" className="mt-1 text-xs">
                  Nhân viên
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
                {Object.entries(permissionLabels).map(([key, label]) => {
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
                        onCheckedChange={(checked) => 
                          updatePermission(key as PermissionType, checked)
                        }
                      />
                    </div>
                  );
                })}
                
                <div className="pt-4 border-t">
                  <Button onClick={savePermissions} disabled={saving} className="w-full">
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
    </div>
  );
};

export default EmployeePermissionManagement;