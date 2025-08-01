import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CreateAssigneeFormProps {
  onSuccess?: () => void;
}

const CreateAssigneeForm = ({ onSuccess }: CreateAssigneeFormProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.firstName || !formData.lastName || !formData.email || !formData.role) {
        toast({
          title: "Lỗi",
          description: "Vui lòng điền đầy đủ các trường bắt buộc (*)",
          variant: "destructive",
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        toast({
          title: "Lỗi",
          description: "Email không hợp lệ",
          variant: "destructive",
        });
        return;
      }

      // Check if email already exists
      const { data: existingProfiles, error: checkError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', formData.email.trim());

      if (checkError) {
        console.error('Error checking duplicate email:', checkError);
        toast({
          title: "Lỗi",
          description: "Không thể kiểm tra email",
          variant: "destructive",
        });
        return;
      }

      if (existingProfiles && existingProfiles.length > 0) {
        toast({
          title: "Lỗi",
          description: "Email đã tồn tại trong hệ thống",
          variant: "destructive",
        });
        return;
      }

      // Get current user for manager_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Lỗi",
          description: "Bạn cần đăng nhập để thực hiện hành động này",
          variant: "destructive",
        });
        return;
      }

      // Create a new profile record (since we can't directly create auth users)
      // In a real implementation, you'd want to send an invitation email
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          phone: formData.phone || null,
          user_id: crypto.randomUUID(), // Temporary UUID until user accepts invitation
        });

      if (error) {
        console.error('Error creating assignee:', error);
        toast({
          title: "Lỗi",
          description: "Không thể tạo người phụ trách. Vui lòng thử lại.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Thành công",
        description: "Đã thêm người phụ trách mới thành công!",
      });

      // Reset form
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        role: ""
      });
      
      setOpen(false);
      onSuccess?.();

    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Lỗi",
        description: "Đã có lỗi xảy ra. Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Thêm Người Phụ Trách
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm Người Phụ Trách Mới</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Họ */}
            <div className="space-y-2">
              <Label htmlFor="firstName">
                Họ <span className="text-red-500">*</span>
              </Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                placeholder="Nguyễn"
                required
              />
            </div>

            {/* Tên */}
            <div className="space-y-2">
              <Label htmlFor="lastName">
                Tên <span className="text-red-500">*</span>
              </Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                placeholder="Văn A"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="nguyenvana@company.com"
              required
            />
          </div>

          {/* Số điện thoại */}
          <div className="space-y-2">
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="0987654321"
            />
          </div>

          {/* Vai trò */}
          <div className="space-y-2">
            <Label>
              Vai trò <span className="text-red-500">*</span>
            </Label>
            <Select 
              value={formData.role} 
              onValueChange={(value) => handleInputChange('role', value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Quản lý</SelectItem>
                <SelectItem value="employee">Nhân viên</SelectItem>
                <SelectItem value="supervisor">Giám sát viên</SelectItem>
                <SelectItem value="coordinator">Điều phối viên</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Đang thêm..." : "Thêm Người Phụ Trách"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAssigneeForm;