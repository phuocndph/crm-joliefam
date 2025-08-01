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
    name: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        toast({
          title: "Lỗi",
          description: "Vui lòng nhập tên người phụ trách",
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

      // For simplicity, we'll just create a profile with the name
      // In a real implementation, you might want to store this in a separate table
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          first_name: formData.name,
          last_name: '',
          email: `${formData.name.toLowerCase().replace(/\s+/g, '')}@temp.com`, // Temporary email
          user_id: crypto.randomUUID(), // Temporary UUID
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
        name: ""
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
          {/* Tên Người Phụ Trách */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Tên Người Phụ Trách <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Nguyễn Văn A"
              required
            />
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