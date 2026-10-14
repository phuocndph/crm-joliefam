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
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

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
      if (isLocalBackend()) {
        await localApi.deleteUser(profile.user_id);
        toast({ title: "Thành công", description: "Đã vô hiệu hóa người dùng local" });
        onUserDeleted();
        onOpenChange(false);
        return;
      }
      // Call edge function to delete user
      const { error } = await supabase.functions.invoke('delete-user', {
        body: { userId: profile.user_id }
      });

      if (error) {
        console.error('Error deleting user:', error);
        toast({
          title: "Lỗi",
          description: "Không thể xóa người dùng",
          variant: "destructive",
        });
        return;
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
