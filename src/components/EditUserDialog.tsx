import { useState, useEffect } from 'react';
import { UserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  user_roles?: { role: UserRole }[];
}

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  currentUserRole: UserRole;
  onUserUpdated: () => void;
}

const EditUserDialog = ({ open, onOpenChange, profile, currentUserRole, onUserUpdated }: EditUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [selectedRole, setSelectedRole] = useState<UserRole>(profile?.user_roles?.[0]?.role || 'employee');
  const { toast } = useToast();

  // Reset form when profile changes
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setPhone(profile.phone || '');
      setSelectedRole(profile.user_roles?.[0]?.role || 'employee');
    }
  }, [profile]);

  const canEditRole = (targetRole: UserRole) => {
    if (currentUserRole === 'admin') return true;
    if (currentUserRole === 'manager' && (targetRole === 'employee' || profile?.user_roles?.[0]?.role === 'employee')) return true;
    return false;
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);
    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone
        })
        .eq('user_id', profile.user_id);

      if (profileError) throw profileError;

      // Update role if changed and user has permission
      const currentRole = profile.user_roles?.[0]?.role;
      if (selectedRole !== currentRole && canEditRole(selectedRole)) {
        // Delete old role
        if (currentRole) {
          await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', profile.user_id);
        }

        // Insert new role
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: profile.user_id,
            role: selectedRole
          });

        if (roleError) throw roleError;
      }

      toast({
        title: "Thành công",
        description: "Cập nhật thông tin người dùng thành công",
      });

      onUserUpdated();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật thông tin người dùng",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa thông tin người dùng</DialogTitle>
          <DialogDescription>
            Cập nhật thông tin cá nhân và vai trò của người dùng
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={profile.email}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
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
            <Select 
              value={selectedRole || ''} 
              onValueChange={(value) => setSelectedRole(value as UserRole)}
              disabled={!canEditRole(selectedRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                {currentUserRole === 'admin' && (
                  <>
                    <SelectItem value="admin">Quản trị viên</SelectItem>
                    <SelectItem value="manager">Quản lý</SelectItem>
                    <SelectItem value="accountant">Kế toán</SelectItem>
                  </>
                )}
                <SelectItem value="employee">Nhân viên</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Đang cập nhật...' : 'Cập nhật'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserDialog;