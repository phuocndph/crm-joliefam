import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CreateAssigneeFormProps {
  onSuccess?: () => void;
}

interface Assignee {
  id: string;
  name: string;
  created_at: string;
}

const CreateAssigneeForm = ({ onSuccess }: CreateAssigneeFormProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: ""
  });

  const fetchAssignees = async () => {
    setLoadingAssignees(true);
    try {
      const { data, error } = await supabase
        .from('assignees' as any)
        .select('id, name, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching assignees:', error);
        return;
      }

      setAssignees((data as any) || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoadingAssignees(false);
    }
  };

  const handleDeleteAssignee = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from('assignees' as any)
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting assignee:', error);
        toast({
          title: "Lỗi",
          description: "Không thể xóa người phụ trách. Vui lòng thử lại.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Thành công",
        description: `Đã xóa người phụ trách "${name}" thành công!`,
      });

      // Refresh the list
      fetchAssignees();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Lỗi",
        description: "Đã có lỗi xảy ra. Vui lòng thử lại.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (open) {
      fetchAssignees();
    }
  }, [open]);

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

      // For simplicity, we'll create an assignee record
      const { data, error } = await supabase
        .from('assignees' as any)
        .insert({
          name: formData.name.trim(),
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
      
      // Refresh assignees list
      fetchAssignees();
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quản Lý Người Phụ Trách</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Form thêm mới */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Tên người phụ trách mới <span className="text-red-500">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Nguyễn Văn A"
                  required
                />
                <Button type="submit" disabled={loading} className="shrink-0">
                  <UserPlus className="h-4 w-4 mr-2" />
                  {loading ? "Đang thêm..." : "Thêm"}
                </Button>
              </div>
            </div>
          </form>

          {/* Danh sách người phụ trách */}
          <div className="space-y-2">
            <Label>Danh sách người phụ trách hiện có</Label>
            {loadingAssignees ? (
              <div className="text-center py-4 text-muted-foreground">Đang tải...</div>
            ) : assignees.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">Chưa có người phụ trách nào</div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead className="w-20">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignees.map((assignee) => (
                      <TableRow key={assignee.id}>
                        <TableCell className="font-medium">{assignee.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(assignee.created_at).toLocaleDateString('vi-VN')}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAssignee(assignee.id, assignee.name)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Đóng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAssigneeForm;