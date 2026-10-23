import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, UserRole } from '@/hooks/useUserRole';
import { useAuthReady } from '@/hooks/useAuthReady';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi, type LocalWorkerLinkResponse } from '@/lib/local-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { User, UserPlus, Users, Shield, Edit, Trash2, Eye, RefreshCw, UserCheck, Key, Link2 } from 'lucide-react';
import EditUserDialog from '@/components/EditUserDialog';
import DeleteUserDialog from '@/components/DeleteUserDialog';
import EmployeePermissionManagement from '@/components/EmployeePermissionManagement';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';
import ResetPasswordDialog from '@/components/ResetPasswordDialog';
import ProfileReviewPanel from '@/components/ProfileReviewPanel';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  has_password?: boolean;
  is_active?: boolean;
  created_at: string;
  user_roles?: { role: UserRole; assigned_by?: string }[];
  manager_name?: string;
}

type LocalWorkerOption = { id: string; employee_code: string; display_name: string; user_id?: string | null; is_active?: boolean };
type LocalWorkerLink = { worker_id: string; employee_code: string; worker_name: string; worker_type: string; is_active: boolean } | null;
const normalizeWorkerLink = (worker: LocalWorkerLinkResponse['worker']): LocalWorkerLink => worker ? {
  worker_id: worker.worker_id,
  employee_code: worker.employee_code,
  worker_name: worker.worker_name ?? worker.display_name ?? '',
  worker_type: worker.worker_type,
  is_active: worker.is_active,
} : null;

const UserManagement = () => {
  const localMode = isLocalBackend();
  const { user, isReady: authReady } = useAuthReady();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [resetPasswordProfile, setResetPasswordProfile] = useState<Profile | null>(null);
  const [localWorkers, setLocalWorkers] = useState<LocalWorkerOption[]>([]);
  const [workerLinks, setWorkerLinks] = useState<Record<string, LocalWorkerLink>>({});
  const [linkingProfile, setLinkingProfile] = useState<Profile | null>(null);
  const [linkWorkerId, setLinkWorkerId] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const { role: currentUserRole, loading: roleLoading } = useUserRole(user);
  const { toast } = useToast();
  const userId = user?.id;
  const canReadUsers = Boolean(userId && currentUserRole && (localMode
    ? ['admin', 'manager'].includes(currentUserRole)
    : ['admin', 'manager', 'accountant'].includes(currentUserRole)));
  const requestIdentity = `${localMode}:${userId || ''}:${currentUserRole || ''}:${authReady && !roleLoading ? 'ready' : 'pending'}`;
  const identityRef = useRef(requestIdentity);
  identityRef.current = requestIdentity;
  const mountedRef = useRef(true);
  const profileGeneration = useRef(0);
  const linkGeneration = useRef(0);
  const [loadedIdentity, setLoadedIdentity] = useState('');
  const [listError, setListError] = useState<string | null>(null);
  const isCurrent = useCallback((identity: string) => mountedRef.current && identityRef.current === identity, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; profileGeneration.current += 1; linkGeneration.current += 1; };
  }, []);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('employee');
  const localUsersWithoutPassword = localMode
    ? profiles.filter((profile) => profile.is_active !== false && profile.has_password === false).length
    : 0;

  const fetchProfiles = useCallback(async (isRefresh = false) => {
    if (!authReady || roleLoading || !canReadUsers || !isCurrent(requestIdentity)) return;
    const identity = requestIdentity;
    const generation = ++profileGeneration.current;
    const current = () => isCurrent(identity) && generation === profileGeneration.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setListError(null);
    
    try {
      if (localMode) {
        const data = await localApi.users();
        if (!current()) return;
        const workers = await localApi.workers();
        if (!current()) return;
        const links = await Promise.all((data as Array<{ user_id: string }>).map(async (profile) => {
          try { return [profile.user_id, normalizeWorkerLink((await localApi.workerLink(profile.user_id)).worker)] as const; }
          catch { return [profile.user_id, null] as const; }
        }));
        if (!current()) return;
        setProfiles(data as unknown as Profile[]);
        setLocalWorkers(workers as unknown as LocalWorkerOption[]);
        setWorkerLinks(Object.fromEntries(links));
        setLoadedIdentity(identity);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!current()) return;

      // Get roles and manager information
      const profilesWithRoles = await Promise.all((data || []).map(async (profile) => {
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('role, assigned_by')
          .eq('user_id', profile.user_id);
        if (roleError) throw roleError;
        
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

      if (!current()) return;
      setProfiles(profilesWithRoles);
      setLocalWorkers([]);
      setWorkerLinks({});
      setLoadedIdentity(identity);
    } catch (error) {
      if (!current()) return;
      console.error('Error fetching profiles:', error);
      setProfiles([]);
      setLocalWorkers([]);
      setWorkerLinks({});
      setSelectedUsers([]);
      setLoadedIdentity(identity);
      setListError('Không thể tải dữ liệu. Vui lòng kiểm tra kết nối rồi thử lại.');
    } finally {
      if (current()) { setLoading(false); setRefreshing(false); }
    }
  }, [authReady, roleLoading, canReadUsers, isCurrent, requestIdentity, localMode]);

  useEffect(() => {
    // Revoke the prior identity immediately; no delayed list/link response may
    // repopulate it after an account, role or authorization state change.
    profileGeneration.current += 1;
    linkGeneration.current += 1;
    setProfiles([]); setLocalWorkers([]); setWorkerLinks({}); setSelectedUsers([]);
    setEditingProfile(null); setDeletingProfile(null); setResetPasswordProfile(null);
    setShowChangePasswordDialog(false); setLinkingProfile(null); setLinkWorkerId(''); setLinkReason('');
    setEmail(''); setPassword(''); setFirstName(''); setLastName(''); setPhone(''); setSelectedRole('employee');
    setCreateUserLoading(false); setBulkDeleting(false); setLinkLoading(false);
    setListError(null); setLoadedIdentity(''); setLoading(false); setRefreshing(false);
    if (authReady && !roleLoading && canReadUsers) void fetchProfiles();
  }, [authReady, roleLoading, canReadUsers, requestIdentity, fetchProfiles]);

  const openWorkerLink = async (profile: Profile) => {
    if (!localMode || !canReadUsers) return;
    const identity = requestIdentity;
    const generation = ++linkGeneration.current;
    const current = () => isCurrent(identity) && generation === linkGeneration.current;
    setLinkingProfile(profile);
    setLinkReason("");
    setLinkLoading(true);
    try {
      const result = await localApi.workerLink(profile.user_id);
      if (!current()) return;
      setLinkWorkerId(result.worker?.worker_id || "");
      setWorkerLinks((current) => ({ ...current, [profile.user_id]: normalizeWorkerLink(result.worker) }));
    } catch (error) {
      if (!current()) return;
      toast({ title: "Không tải được liên kết", description: error instanceof Error ? error.message : "Lỗi", variant: "destructive" });
      setLinkingProfile(null);
    } finally { if (current()) setLinkLoading(false); }
  };

  const saveWorkerLink = async () => {
    if (!linkingProfile || !linkReason.trim()) return;
    const identity = requestIdentity;
    const generation = ++linkGeneration.current;
    const current = () => isCurrent(identity) && generation === linkGeneration.current;
    setLinkLoading(true);
    try {
      const result = await localApi.saveWorkerLink(linkingProfile.user_id, linkWorkerId || null, linkReason.trim());
      if (!current()) return;
      setWorkerLinks((current) => ({ ...current, [linkingProfile.user_id]: normalizeWorkerLink(result.worker) }));
      setLocalWorkers((current) => current.map((worker) => worker.id === linkWorkerId ? { ...worker, user_id: linkingProfile.user_id } : worker));
      toast({ title: "Đã cập nhật liên kết", description: "Tài khoản có thể sử dụng chấm công cá nhân theo hồ sơ mới." });
      setLinkingProfile(null);
      await fetchProfiles(true);
    } catch (error) {
      if (!current()) return;
      toast({ title: "Không thể cập nhật liên kết", description: error instanceof Error ? error.message : "Lỗi", variant: "destructive" });
    } finally { if (current()) setLinkLoading(false); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canReadUsers || !authReady || roleLoading) return;
    const identity = requestIdentity;
    setCreateUserLoading(true);

    try {
      if (localMode) {
        const created = await localApi.createUser({
          email,
          password,
          firstName,
          lastName,
          phone,
          role: selectedRole,
        });
        if (!isCurrent(identity)) return;
        toast({ title: "Thành công", description: `Đã tạo tài khoản cục bộ ${String(created.email || email)}.` });
        setEmail(''); setPassword(''); setFirstName(''); setLastName(''); setPhone(''); setSelectedRole('employee');
        await fetchProfiles();
        if (!isCurrent(identity)) return;
        setSelectedUsers([]);
        return;
      }

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
        if (!isCurrent(identity)) return;

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
        await fetchProfiles();
        if (!isCurrent(identity)) return;
        setSelectedUsers([]);
      } else {
        throw new Error('Không có quyền tạo tài khoản này');
      }
    } catch (error: unknown) {
      if (!isCurrent(identity)) return;
      console.error('Error creating user:', error);
      toast({
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Không thể tạo tài khoản",
        variant: "destructive",
      });
    } finally {
      if (isCurrent(identity)) setCreateUserLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'manager': return 'default';
      case 'accountant': return 'outline';
      case 'team_leader': return 'default';
      case 'employee': return 'secondary';
      default: return 'outline';
    }
  };

  const getRoleDisplayName = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'Quản trị viên';
      case 'manager': return 'Quản lý';
      case 'accountant': return 'Kế toán';
      case 'team_leader': return 'Tổ trưởng';
      case 'employee': return 'Nhân viên';
      default: return 'Chưa phân quyền';
    }
  };

  const canCreateRole = (role: UserRole) => {
    if (localMode) return currentUserRole === 'admin';
    if (currentUserRole === 'admin') return true;
    if (currentUserRole === 'manager' && role === 'employee') return true;
    return false;
  };

  const canEditUser = (targetRole: UserRole) => {
    if (localMode) return currentUserRole === 'admin';
    if (currentUserRole === 'admin') return true;
    if (currentUserRole === 'manager' && targetRole === 'employee') return true;
    return false;
  };

  const canDeleteUser = (targetRole: UserRole) => {
    if (localMode) return currentUserRole === 'admin';
    if (currentUserRole === 'admin') return true;
    if (currentUserRole === 'manager' && targetRole === 'employee') return true;
    return false;
  };

  const canResetPassword = (profile: Profile) => {
    if (profile.user_id === user?.id || (localMode && !user?.id)) return false;
    if (currentUserRole === 'admin') return true;
    const roles = profile.user_roles || [];
    if (localMode) return currentUserRole === 'manager' && profile.is_active !== false &&
      roles.some(role => role.role === 'employee' && role.assigned_by === user?.id) &&
      !roles.some(role => role.role !== 'employee');
    return currentUserRole === 'manager' && (roles[0]?.role || 'employee') === 'employee';
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
    if (selectedUsers.length === 0 || !canReadUsers || !authReady || roleLoading) return;
    const identity = requestIdentity;

    setBulkDeleting(true);
    
    try {
      if (localMode) {
        await Promise.all(selectedUsers.map((id) => localApi.deleteUser(id)));
      } else {
        const { error: rolesError } = await supabase.from('user_roles').delete().in('user_id', selectedUsers);
        if (!isCurrent(identity)) return;
        if (rolesError) throw rolesError;
        const { error: profilesError } = await supabase.from('profiles').delete().in('user_id', selectedUsers);
        if (profilesError) throw profilesError;
      }
      if (!isCurrent(identity)) return;

      toast({
        title: "Thành công",
        description: `Đã xóa ${selectedUsers.length} tài khoản`,
      });

      setSelectedUsers([]);
      await fetchProfiles();
    } catch (error: unknown) {
      if (!isCurrent(identity)) return;
      console.error('Error deleting users:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa tài khoản",
        variant: "destructive",
      });
    } finally {
      if (isCurrent(identity)) setBulkDeleting(false);
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

  if (!authReady || roleLoading) {
    return <div className="flex justify-center items-center h-64">Đang tải...</div>;
  }

  if (!userId || !currentUserRole) {
    return <Card className="mx-auto my-8 max-w-lg"><CardHeader><CardTitle>Chưa xác định được quyền truy cập</CardTitle><CardDescription>Không thể xác nhận tài khoản hoặc vai trò của bạn. Dữ liệu quản trị đã được ẩn để tránh truy cập nhầm.</CardDescription></CardHeader><CardContent><Button onClick={() => window.location.reload()}>Thử lại</Button></CardContent></Card>;
  }

  if (!canReadUsers) {
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

  if (listError && loadedIdentity === requestIdentity) {
    return <Card className="mx-auto my-8 max-w-lg"><CardHeader><CardTitle>Không thể tải danh sách người dùng</CardTitle><CardDescription>{listError}</CardDescription></CardHeader><CardContent><Button disabled={refreshing || loading} onClick={() => void fetchProfiles()}>Thử lại</Button></CardContent></Card>;
  }

  if (loading || loadedIdentity !== requestIdentity) {
    return <div className="flex justify-center items-center h-64">Đang tải...</div>;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Quản lý người dùng</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2">
            Vai trò của bạn: 
            <Badge variant={getRoleBadgeVariant(currentUserRole)}>
              {getRoleDisplayName(currentUserRole)}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {localMode && (
        <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="pt-6 text-sm text-amber-900 dark:text-amber-100">
            <p>Hệ thống cục bộ hiển thị bản sao người dùng đã đồng bộ từ Supabase. Các thao tác quản trị bên dưới chỉ ghi PostgreSQL cục bộ và không chạm dữ liệu công khai.</p>
            {localUsersWithoutPassword > 0 && <p className="mt-2 font-medium">Có {localUsersWithoutPassword} tài khoản đồng bộ chưa có mật khẩu local. Chọn biểu tượng chìa khóa ở từng dòng để đặt mật khẩu trước khi nhân viên đăng nhập.</p>}
          </CardContent>
        </Card>
      )}

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
            <fieldset className="space-y-4">
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
                        <SelectItem value="accountant">Kế toán</SelectItem>
                        {localMode && <SelectItem value="team_leader">Tổ trưởng</SelectItem>}
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
            </fieldset>
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
                  {localMode && <TableHead>Hồ sơ chấm công</TableHead>}
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
                    <TableRow key={profile.id} className={`${isSelected ? 'bg-muted/50' : ''} hover:bg-muted/60 transition-colors`}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectUser(profile.user_id, checked as boolean)}
                          disabled={!canDelete}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{profile.email}</div>
                        {localMode && (
                          <Badge
                            variant={profile.has_password ? "outline" : "destructive"}
                            className="mt-1 text-[10px] font-normal"
                          >
                            {profile.has_password ? "Đã có mật khẩu local" : "Cần đặt mật khẩu local"}
                          </Badge>
                        )}
                      </TableCell>
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
                      {localMode && <TableCell>
                        <div className="flex items-center gap-2">
                          {workerLinks[profile.user_id] ? <span className="text-sm">{workerLinks[profile.user_id]?.employee_code} · {workerLinks[profile.user_id]?.worker_name}</span> : <span className="text-sm text-muted-foreground">Chưa liên kết</span>}
                          {currentUserRole === 'admin' && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void openWorkerLink(profile)} title="Gắn tài khoản với hồ sơ công nhân"><Link2 className="h-4 w-4" /></Button>}
                        </div>
                      </TableCell>}
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
                          {/* Change password button - show for all users for their own account */}
                          {profile.user_id === user?.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowChangePasswordDialog(true)}
                              title="Đổi mật khẩu của tôi"
                            >
                              <Key className="h-4 w-4 text-blue-500" />
                            </Button>
                          )}
                          
                          {/* Reset password button for admin/manager on other users */}
                          {canResetPassword(profile) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setResetPasswordProfile(profile)}
                              title="Đặt lại mật khẩu người dùng"
                            >
                              <Key className="h-4 w-4 text-orange-500" />
                            </Button>
                          )}
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingProfile(profile)}
                            disabled={!canEditUser(userRole)}
                            title="Chỉnh sửa người dùng"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingProfile(profile)}
                            disabled={!canDelete}
                            title="Xóa người dùng"
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
                    <TableCell colSpan={localMode ? 8 : 7} className="text-center py-8 text-muted-foreground">
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

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={showChangePasswordDialog}
        onOpenChange={setShowChangePasswordDialog}
      />

      {/* Reset Password Dialog */}
      <ResetPasswordDialog
        open={!!resetPasswordProfile}
        onOpenChange={(open) => !open && setResetPasswordProfile(null)}
        profile={resetPasswordProfile}
        currentUserRole={currentUserRole}
        onSuccess={() => fetchProfiles(true)}
      />

      {localMode && <Dialog open={!!linkingProfile} onOpenChange={(open) => !open && setLinkingProfile(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Liên kết tài khoản với hồ sơ chấm công</DialogTitle></DialogHeader>
          {linkingProfile && <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{linkingProfile.email} · {linkingProfile.first_name || ""} {linkingProfile.last_name || ""}</p>
            <div className="space-y-2"><Label>Hồ sơ công nhân</Label><Select value={linkWorkerId || "NONE"} onValueChange={(value) => setLinkWorkerId(value === "NONE" ? "" : value)} disabled={linkLoading}><SelectTrigger><SelectValue placeholder="Chọn hồ sơ" /></SelectTrigger><SelectContent><SelectItem value="NONE">Không liên kết</SelectItem>{localWorkers.filter((worker) => worker.is_active !== false).map((worker) => <SelectItem key={worker.id} value={worker.id} disabled={Boolean(worker.user_id && worker.user_id !== linkingProfile.user_id)}>{worker.employee_code} · {worker.display_name}{worker.user_id && worker.user_id !== linkingProfile.user_id ? " (đã gắn)" : ""}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Lý do thay đổi</Label><Input value={linkReason} onChange={(event) => setLinkReason(event.target.value)} placeholder="VD: Cấp tài khoản chấm công cho nhân viên" /></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setLinkingProfile(null)}>Hủy</Button><Button disabled={linkLoading || !linkReason.trim()} onClick={() => void saveWorkerLink()}>{linkLoading ? "Đang lưu..." : "Lưu liên kết"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>}

      {localMode && (currentUserRole === 'admin' || currentUserRole === 'manager') && <ProfileReviewPanel />}

      {/* Employee Permission Management */}
      <EmployeePermissionManagement />
    </div>
  );
};

export default UserManagement;
