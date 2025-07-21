import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, UserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { User, UserPlus, Users, Shield, Edit, Trash2, Eye, RefreshCw, UserCheck } from 'lucide-react';
import EditUserDialog from '@/components/EditUserDialog';
import DeleteUserDialog from '@/components/DeleteUserDialog';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  user_roles?: { role: UserRole; assigned_by?: string }[];
  manager_name?: string;
}

const UserManagement = () => {
  const [user, setUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { role: currentUserRole, loading: roleLoading } = useUserRole(user);
  const { toast } = useToast();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('employee');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  useEffect(() => {
    if (currentUserRole && !roleLoading) {
      fetchProfiles();
    }
  }, [currentUserRole, roleLoading]);

  const fetchProfiles = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get roles and manager information
      const profilesWithRoles = await Promise.all((data || []).map(async (profile) => {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role, assigned_by')
          .eq('user_id', profile.user_id);
        
        let manager_name = null;
        
        // If user is an employee, get their manager's name
        const employeeRole = roleData?.find(r => r.role === 'employee');
        if (employeeRole?.assigned_by) {
          const { data: managerProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('user_id', employeeRole.assigned_by)
            .single();
          
          if (managerProfile) {
            manager_name = `${managerProfile.first_name || ''} ${managerProfile.last_name || ''}`.trim() || 'Quản lý';
          }
        }
        
        return {
          ...profile,
          user_roles: roleData || [],
          manager_name
        };
      }));

      setProfiles(profilesWithRoles);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách người dùng",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserLoading(true);

    try {
      // Check permissions
      if (currentUserRole === 'admin' || 
          (currentUserRole === 'manager' && selectedRole === 'employee')) {
        
        // Create user using Edge Function with service role
        const { data, error } = await supabase.functions.invoke('create-user', {
          body: {
            email,
            password,
            firstName,
            lastName,
            phone,
            role: selectedRole
          }
        });

        if (error || !data?.success) {
          throw new Error(error?.message || data?.error || "Không thể tạo tài khoản");
        }

        toast({
          title: "Thành công",
          description: `Đã tạo tài khoản ${selectedRole} thành công`,
        });

        // Reset form
        setEmail('');
        setPassword('');
        setFirstName('');
        setLastName('');
        setPhone('');
        setSelectedRole('employee');
        
        // Refresh profiles
        fetchProfiles();
        setSelectedUsers([]);
      } else {
        throw new Error('Không có quyền tạo tài khoản này');
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tạo tài khoản",
        variant: "destructive",
      });
    } finally {
      setCreateUserLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'manager': return 'default';
      case 'employee': return 'secondary';
      default: return 'outline';
    }
  };

  const getRoleDisplayName = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'Quản trị viên';
      case 'manager': return 'Quản lý';
      case 'employee': return 'Nhân viên';
      default: return 'Chưa phân quyền';
    }
  };

  const canCreateRole = (role: UserRole) => {
    if (currentUserRole === 'admin') return true;
    if (currentUserRole === 'manager' && role === 'employee') return true;
    return false;
  };

  const canEditUser = (targetRole: UserRole) => {
    if (currentUserRole === 'admin') return true;
    if (currentUserRole === 'manager' && targetRole === 'employee') return true;
    return false;
  };

  const canDeleteUser = (targetRole: UserRole) => {
    if (currentUserRole === 'admin') return true;
    if (currentUserRole === 'manager' && targetRole === 'employee') return true;
    return false;
  };

  const handleSelectUser = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers(prev => [...prev, userId]);
    } else {
      setSelectedUsers(prev => prev.filter(id => id !== userId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const deletableUsers = profiles
        .filter(profile => canDeleteUser(profile.user_roles?.[0]?.role))
        .map(profile => profile.user_id);
      setSelectedUsers(deletableUsers);
    } else {
      setSelectedUsers([]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.length === 0) return;
    
    setBulkDeleting(true);
    
    try {
      // Delete user roles first
      const { error: rolesError } = await supabase
        .from('user_roles')
        .delete()
        .in('user_id', selectedUsers);

      if (rolesError) throw rolesError;

      // Delete profiles
      const { error: profilesError } = await supabase
        .from('profiles')
        .delete()
        .in('user_id', selectedUsers);

      if (profilesError) throw profilesError;

      toast({
        title: "Thành công",
        description: `Đã xóa ${selectedUsers.length} tài khoản`,
      });

      setSelectedUsers([]);
      fetchProfiles();
    } catch (error: any) {
      console.error('Error deleting users:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa tài khoản",
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  const LoadingSkeleton = () => (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );

  if (roleLoading || loading) {
    return <div className="flex justify-center items-center h-64">Đang tải...</div>;
  }

  if (!currentUserRole || currentUserRole === 'employee') {
    return (
      <div className="flex justify-center items-center h-64">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Không có quyền truy cập
            </CardTitle>
            <CardDescription>
              Bạn không có quyền quản lý người dùng
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quản lý người dùng</h1>
          <div className="text-muted-foreground flex items-center gap-2">
            Vai trò của bạn: 
            <Badge variant={getRoleBadgeVariant(currentUserRole)}>
              {getRoleDisplayName(currentUserRole)}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedUsers.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="animate-fade-in"
            >
              {bulkDeleting ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Xóa {selectedUsers.length} tài khoản
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchProfiles(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Create User Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Tạo tài khoản mới
          </CardTitle>
          <CardDescription>
            {currentUserRole === 'admin' 
              ? 'Bạn có thể tạo tất cả loại tài khoản'
              : 'Bạn chỉ có thể tạo tài khoản nhân viên'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">Họ</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Tên</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Vai trò</Label>
                <Select value={selectedRole || ''} onValueChange={(value) => setSelectedRole(value as UserRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn vai trò" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUserRole === 'admin' && (
                      <>
                        <SelectItem value="admin">Quản trị viên</SelectItem>
                        <SelectItem value="manager">Quản lý</SelectItem>
                      </>
                    )}
                    <SelectItem value="employee">Nhân viên</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={createUserLoading}>
              {createUserLoading ? 'Đang tạo...' : 'Tạo tài khoản'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Danh sách người dùng ({profiles.length})
          </CardTitle>
          {selectedUsers.length > 0 && (
            <CardDescription className="text-orange-600">
              Đã chọn {selectedUsers.length} tài khoản
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedUsers.length === profiles.filter(p => canDeleteUser(p.user_roles?.[0]?.role)).length && profiles.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Cấp bậc</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => {
                  const userRole = profile.user_roles?.[0]?.role;
                  const canDelete = canDeleteUser(userRole);
                  const isSelected = selectedUsers.includes(profile.user_id);
                  
                  return (
                    <TableRow key={profile.id} className={isSelected ? 'bg-muted/50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectUser(profile.user_id, checked as boolean)}
                          disabled={!canDelete}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{profile.email}</TableCell>
                      <TableCell>
                        {profile.first_name && profile.last_name 
                          ? `${profile.first_name} ${profile.last_name}`
                          : 'Chưa cập nhật'
                        }
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(userRole)}>
                          {getRoleDisplayName(userRole)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {userRole === 'employee' && profile.manager_name ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <UserCheck className="h-3 w-3" />
                            Thuộc: {profile.manager_name}
                          </div>
                        ) : userRole === 'manager' ? (
                          <span className="text-sm text-muted-foreground">Quản lý độc lập</span>
                        ) : userRole === 'admin' ? (
                          <span className="text-sm text-muted-foreground">Quản trị hệ thống</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(profile.created_at).toLocaleDateString('vi-VN')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingProfile(profile)}
                            disabled={!canEditUser(userRole)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingProfile(profile)}
                            disabled={!canDelete}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {profiles.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Chưa có người dùng nào
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <EditUserDialog
        open={!!editingProfile}
        onOpenChange={(open) => !open && setEditingProfile(null)}
        profile={editingProfile}
        currentUserRole={currentUserRole}
        onUserUpdated={() => {
          fetchProfiles();
          setSelectedUsers([]);
        }}
      />

      {/* Delete User Dialog */}
      <DeleteUserDialog
        open={!!deletingProfile}
        onOpenChange={(open) => !open && setDeletingProfile(null)}
        profile={deletingProfile}
        currentUserRole={currentUserRole}
        onUserDeleted={() => {
          fetchProfiles();
          setSelectedUsers([]);
        }}
      />
    </div>
  );
};

export default UserManagement;