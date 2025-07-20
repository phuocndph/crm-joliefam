import { useState } from 'react';
import { UserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
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

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  currentUserRole: UserRole;
  onUserDeleted: () => void;
}

const DeleteUserDialog = ({ open, onOpenChange, profile, currentUserRole, onUserDeleted }: DeleteUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const canDeleteUser = (targetRole: UserRole) => {
    if (currentUserRole === 'admin') return true;
    if (currentUserRole === 'manager' && targetRole === 'employee') return true;
    return false;
  };

  const handleDelete = async () => {
    if (!profile) return;

    const targetRole = profile.user_roles?.[0]?.role;
    if (!canDeleteUser(targetRole)) {
      toast({
        title: "Lỗi",
        description: "Bạn không có quyền xóa người dùng này",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Delete user roles first
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', profile.user_id);

      if (roleError) throw roleError;

      // Delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', profile.user_id);

      if (profileError) throw profileError;

      // Delete auth user (this requires admin privileges)
      const { error: authError } = await supabase.auth.admin.deleteUser(profile.user_id);
      
      if (authError) {
        console.warn('Could not delete auth user:', authError);
        // Continue anyway as the profile and roles are deleted
      }

      toast({
        title: "Thành công",
        description: "Đã xóa người dùng thành công",
      });

      onUserDeleted();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa người dùng",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!profile) return null;

  const targetRole = profile.user_roles?.[0]?.role;
  const userName = profile.first_name && profile.last_name 
    ? `${profile.first_name} ${profile.last_name}` 
    : profile.email;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xác nhận xóa người dùng</AlertDialogTitle>
          <AlertDialogDescription>
            Bạn có chắc chắn muốn xóa người dùng <strong>{userName}</strong>?
            <br />
            Hành động này không thể hoàn tác và sẽ xóa vĩnh viễn tất cả dữ liệu liên quan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading || !canDeleteUser(targetRole)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? 'Đang xóa...' : 'Xóa người dùng'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteUserDialog;