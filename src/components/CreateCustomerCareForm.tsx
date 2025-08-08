import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAssignees } from "@/hooks/useAssignees";

interface CreateCustomerCareFormProps {
  onSuccess?: () => void;
}

const CreateCustomerCareForm = ({ onSuccess }: CreateCustomerCareFormProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdateDate, setLastUpdateDate] = useState<Date>();
const { toast } = useToast();
  const { data: assigneesData, isLoading: assigneesLoading } = useAssignees();

  const [formData, setFormData] = useState({
    customerName: "",
    assignedTo: "",
    source: "",
    currentStatus: "",
    followUpType: "",
    closingScore: "",
    nextAction: "",
    notes: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.customerName || !formData.assignedTo || !formData.source || !formData.currentStatus || !formData.followUpType) {
        toast({
          title: "Lỗi",
          description: "Vui lòng điền đầy đủ các trường bắt buộc (*)",
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

      // Check for duplicate customer name
      const { data: existingCustomers, error: checkError } = await supabase
        .from('customers')
        .select('id, name')
        .ilike('name', formData.customerName.trim());

      if (checkError) {
        console.error('Error checking duplicate:', checkError);
        toast({
          title: "Lỗi",
          description: "Không thể kiểm tra tên khách hàng",
          variant: "destructive",
        });
        return;
      }

      if (existingCustomers && existingCustomers.length > 0) {
        toast({
          title: "Lỗi",
          description: "Tên khách hàng đã tồn tại, vui lòng chọn tên khác",
          variant: "destructive",
        });
        return;
      }

      // Create customer record
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: formData.customerName,
          notes: formData.notes,
          manager_id: formData.assignedTo,
          // Store customer care specific data in notes for now
          // In a real implementation, you might want to create a separate customer_care table
        });

      if (error) {
        console.error('Error creating customer:', error);
        toast({
          title: "Lỗi",
          description: "Không thể tạo khách hàng. Vui lòng thử lại.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Thành công",
        description: "Đã thêm khách hàng mới thành công!",
      });

      // Reset form
      setFormData({
        customerName: "",
        assignedTo: "",
        source: "",
        currentStatus: "",
        followUpType: "",
        closingScore: "",
        nextAction: "",
        notes: ""
      });
      setLastUpdateDate(undefined);
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
        <Button className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Thêm Khách Hàng
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thêm Khách Hàng Mới</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Tên Khách Hàng */}
            <div className="space-y-2">
              <Label htmlFor="customerName">
                Tên Khách Hàng <span className="text-red-500">*</span>
              </Label>
              <Input
                id="customerName"
                value={formData.customerName}
                onChange={(e) => handleInputChange('customerName', e.target.value)}
                placeholder="Nguyễn Đức Phước"
                required
              />
            </div>

            {/* Người Phụ Trách */}
            <div className="space-y-2">
              <Label>
                Người Phụ Trách <span className="text-red-500">*</span>
              </Label>
              <Select 
                value={formData.assignedTo} 
                onValueChange={(value) => handleInputChange('assignedTo', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn người phụ trách" />
                </SelectTrigger>
<SelectContent>
                  {assigneesLoading ? (
                    <SelectItem value="" disabled>Đang tải...</SelectItem>
                  ) : assigneesData && assigneesData.length > 0 ? (
                    assigneesData.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>Chưa có người phụ trách</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Nguồn Khách */}
            <div className="space-y-2">
              <Label>
                Nguồn Khách <span className="text-red-500">*</span>
              </Label>
              <Select 
                value={formData.source} 
                onValueChange={(value) => handleInputChange('source', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nguồn khách" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zalo">Zalo</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="phone">Điện thoại</SelectItem>
                  <SelectItem value="referral">Giới thiệu</SelectItem>
                  <SelectItem value="walk-in">Ghé thăm trực tiếp</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tình Trạng Hiện Tại */}
            <div className="space-y-2">
              <Label>
                Tình Trạng Hiện Tại <span className="text-red-500">*</span>
              </Label>
              <Select 
                value={formData.currentStatus} 
                onValueChange={(value) => handleInputChange('currentStatus', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn tình trạng" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Mới</SelectItem>
                  <SelectItem value="contacted">Đã liên hệ</SelectItem>
                  <SelectItem value="interested">Quan tâm</SelectItem>
                  <SelectItem value="quoted">Đã báo giá</SelectItem>
                  <SelectItem value="negotiating">Đang đàm phán</SelectItem>
                  <SelectItem value="closed-won">Thành công</SelectItem>
                  <SelectItem value="closed-lost">Thất bại</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Theo Dõi Khách Hàng */}
            <div className="space-y-2">
              <Label>
                Theo Dõi Khách Hàng <span className="text-red-500">*</span>
              </Label>
              <Select 
                value={formData.followUpType} 
                onValueChange={(value) => handleInputChange('followUpType', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại theo dõi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first-contact">Liên hệ lần đầu</SelectItem>
                  <SelectItem value="second-purchase">Mua lần 2</SelectItem>
                  <SelectItem value="regular-customer">Khách hàng thường xuyên</SelectItem>
                  <SelectItem value="vip-customer">Khách VIP</SelectItem>
                  <SelectItem value="potential">Tiềm năng</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Điểm Đánh Giá Chốt */}
            <div className="space-y-2">
              <Label>Điểm Đánh Giá Chốt</Label>
              <Select 
                value={formData.closingScore} 
                onValueChange={(value) => handleInputChange('closingScore', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn điểm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1/5">1/5</SelectItem>
                  <SelectItem value="2/5">2/5</SelectItem>
                  <SelectItem value="3/5">3/5</SelectItem>
                  <SelectItem value="4/5">4/5</SelectItem>
                  <SelectItem value="5/5">5/5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ngày Cập Nhật Cuối */}
            <div className="space-y-2">
              <Label>Ngày Cập Nhật Cuối</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !lastUpdateDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {lastUpdateDate ? format(lastUpdateDate, "dd/MM/yyyy") : "Chọn ngày"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={lastUpdateDate}
                    onSelect={setLastUpdateDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Hành Động Tiếp Theo */}
          <div className="space-y-2">
            <Label htmlFor="nextAction">Hành Động Tiếp Theo</Label>
            <Input
              id="nextAction"
              value={formData.nextAction}
              onChange={(e) => handleInputChange('nextAction', e.target.value)}
              placeholder="Nhập hành động tiếp theo"
            />
          </div>

          {/* Ghi chú */}
          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Nhập ghi chú..."
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Đang thêm..." : "Thêm Khách Hàng"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCustomerCareForm;