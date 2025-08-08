import { useState } from 'react';
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
import { Eye, EyeOff, RefreshCw, Shield } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ChangePasswordDialog = ({ open, onOpenChange }: ChangePasswordDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
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

  const generateStrongPassword = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('change-password/generate');
      
      if (error) throw error;
      
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
          action: 'change_own',
          currentPassword,
          newPassword
        }
      });

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã đổi mật khẩu thành công",
      });

      onOpenChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể đổi mật khẩu",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Đổi mật khẩu
          </DialogTitle>
          <DialogDescription>
            Thay đổi mật khẩu hiện tại của bạn. Mật khẩu mới phải đáp ứng tất cả yêu cầu bảo mật.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="newPassword">Mật khẩu mới</Label>
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
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading || passwordStrength.score < 100}>
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Đang xử lý...
                </>
              ) : (
                'Đổi mật khẩu'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordDialog;