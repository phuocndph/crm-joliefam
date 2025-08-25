import { useState } from 'react';
import { UserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, RefreshCw, Shield, Copy } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  user_roles?: { role: UserRole; assigned_by?: string }[];
}

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  currentUserRole: UserRole;
}

const ResetPasswordDialog = ({ open, onOpenChange, profile, currentUserRole }: ResetPasswordDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();

  // Calculate password strength
  const calculatePasswordStrength = (password: string): { score: number; feedback: string[] } => {
    let score = 0;
    const feedback: string[] = [];

    if (password.length >= 8) {
      score += 20;
    } else {
      feedback.push('Ít nhất 8 ký tự');
    }

    if (/[a-z]/.test(password)) {
      score += 20;
    } else {
      feedback.push('Chữ cái thường');
    }

    if (/[A-Z]/.test(password)) {
      score += 20;
    } else {
      feedback.push('Chữ cái hoa');
    }

    if (/\d/.test(password)) {
      score += 20;
    } else {
      feedback.push('Chữ số');
    }

    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
      score += 20;
    } else {
      feedback.push('Ký tự đặc biệt');
    }

    return { score, feedback };
  };

  const passwordStrength = calculatePasswordStrength(newPassword);

  const getStrengthColor = (score: number) => {
    if (score < 40) return 'bg-destructive';
    if (score < 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthText = (score: number) => {
    if (score < 40) return 'Yếu';
    if (score < 80) return 'Trung bình';
    return 'Mạnh';
  };

  const canResetUser = () => {
    if (!profile) return false;
    
    const targetRole = profile.user_roles?.[0]?.role;
    const assignedBy = profile.user_roles?.[0]?.assigned_by;
    
    if (currentUserRole === 'admin') return true;
    if (currentUserRole === 'manager' && targetRole === 'employee') {
      // Manager can only reset password for employees they manage
      return true; // Note: We'll check assigned_by in the backend
    }
    return false;
  };

  const generateStrongPassword = async () => {
    try {
      // Call the password generation endpoint
      const response = await fetch('https://kmxfljxsmnozvvgypdei.supabase.co/functions/v1/change-password/generate', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      setNewPassword(data.password);
      setConfirmPassword(data.password);
      
      toast({
        title: "Đã tạo mật khẩu mạnh",
        description: "Mật khẩu mới đã được tạo tự động. Vui lòng lưu lại mật khẩu này.",
      });
    } catch (error: any) {
      console.error('Error generating password:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tạo mật khẩu tự động",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(newPassword);
      toast({
        title: "Đã sao chép",
        description: "Mật khẩu đã được sao chép vào clipboard",
      });
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể sao chép mật khẩu",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile) return;

    if (newPassword !== confirmPassword) {
      toast({
        title: "Lỗi",
        description: "Mật khẩu xác nhận không khớp",
        variant: "destructive",
      });
      return;
    }

    if (passwordStrength.score < 100) {
      toast({
        title: "Mật khẩu chưa đủ mạnh",
        description: `Còn thiếu: ${passwordStrength.feedback.join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('change-password', {
        body: {
          action: 'reset_user',
          targetUserId: profile.user_id,
          newPassword
        }
      });

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã reset mật khẩu thành công",
      });

      onOpenChange(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể reset mật khẩu",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!profile) return null;

  const userName = profile.first_name && profile.last_name 
    ? `${profile.first_name} ${profile.last_name}` 
    : profile.email;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Reset mật khẩu
          </DialogTitle>
          <DialogDescription>
            Reset mật khẩu cho người dùng <strong>{userName}</strong>. 
            Mật khẩu mới phải đáp ứng tất cả yêu cầu bảo mật.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="newPassword">Mật khẩu mới</Label>
              <div className="flex gap-2">
                {newPassword && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyToClipboard}
                    className="text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Sao chép
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateStrongPassword}
                  className="text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Tạo tự động
                </Button>
              </div>
            </div>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Nhập mật khẩu mới hoặc tạo tự động"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            
            {newPassword && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Độ mạnh mật khẩu:</span>
                  <span className={`font-medium ${passwordStrength.score < 40 ? 'text-destructive' : passwordStrength.score < 80 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {getStrengthText(passwordStrength.score)}
                  </span>
                </div>
                <Progress 
                  value={passwordStrength.score} 
                  className="h-2" 
                />
                {passwordStrength.feedback.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span>Còn thiếu: {passwordStrength.feedback.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Nhập lại mật khẩu mới"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">Mật khẩu xác nhận không khớp</p>
            )}
          </div>

          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">⚠️ Lưu ý quan trọng:</p>
              <ul className="text-xs space-y-1">
                <li>• Mật khẩu cũ sẽ bị vô hiệu hóa ngay lập tức</li>
                <li>• Người dùng sẽ cần đăng nhập lại với mật khẩu mới</li>
                <li>• Hãy chia sẻ mật khẩu mới một cách bảo mật</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button 
              type="submit" 
              disabled={loading || passwordStrength.score < 100 || !canResetUser()}
              variant="destructive"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Đang reset...
                </>
              ) : (
                'Reset mật khẩu'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ResetPasswordDialog;