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
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";

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

      // Check for duplicate customer name (case-insensitive)
      if (isLocalBackend()) {
        const existingCustomers = await localApi.customers({ includeInactive: true });
        const normalizedName = formData.customerName.trim().toLowerCase();
        if (existingCustomers.some((customer) => customer.name.trim().toLowerCase() === normalizedName)) {
          toast({ title: "Lỗi", description: "Tên khách hàng đã tồn tại, vui lòng chọn tên khác", variant: "destructive" });
          return;
        }
        const structuredNotes = [formData.notes, formData.nextAction ? `Hành động tiếp theo: ${formData.nextAction}` : '', formData.closingScore ? `Điểm đánh giá: ${formData.closingScore}` : '', lastUpdateDate ? `Ngày cập nhật: ${format(lastUpdateDate, 'dd/MM/yyyy')}` : ''].filter(Boolean).join('\n');
        await localApi.createCustomer({ name: formData.customerName, notes: structuredNotes, assignee_id: formData.assignedTo, current_status: formData.currentStatus, tags: [formData.source], auto_tags: [formData.followUpType], last_care_date: lastUpdateDate ? lastUpdateDate.toISOString() : new Date().toISOString() });
        toast({ title: "Thành công", description: "Đã thêm khách hàng mới" });
        setOpen(false); onSuccess?.(); return;
      }
      const { data: existingCustomers, error: checkError } = await supabase
        .from('customers')
        .select('id, name');

      if (checkError) {
        console.error('Error checking duplicate:', checkError);
        toast({
          title: "Lỗi",
          description: "Không thể kiểm tra tên khách hàng",
          variant: "destructive",
        });
        return;
      }

      // Check for exact match after trimming and normalizing case
      const normalizedName = formData.customerName.trim().toLowerCase();
      const duplicateExists = existingCustomers?.some(customer => 
        customer.name.trim().toLowerCase() === normalizedName
      );

      if (duplicateExists) {
        toast({
          title: "Lỗi",
          description: "Tên khách hàng đã tồn tại, vui lòng chọn tên khác",
          variant: "destructive",
        });
        return;
      }

      // Create customer record with structured notes
      const structuredNotes = [
        formData.notes,
        formData.nextAction ? `Hành động tiếp theo: ${formData.nextAction}` : '',
        formData.closingScore ? `Điểm đánh giá: ${formData.closingScore}` : '',
        lastUpdateDate ? `Ngày cập nhật: ${format(lastUpdateDate, 'dd/MM/yyyy')}` : ''
      ].filter(Boolean).join('\n');

      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: formData.customerName,
          notes: structuredNotes,
          assignee_id: formData.assignedTo,
          current_status: formData.currentStatus,
        tags: [formData.source], // Store source as tags
        auto_tags: [formData.followUpType], // Store follow-up type as auto_tags
        last_care_date: lastUpdateDate ? lastUpdateDate.toISOString() : new Date().toISOString(),
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
                    <SelectItem value="loading" disabled>Đang tải...</SelectItem>
                  ) : assigneesData && assigneesData.length > 0 ? (
                    assigneesData.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-assignees" disabled>Chưa có người phụ trách</SelectItem>
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
                  <SelectItem value="sent-quote">Đã gửi báo giá</SelectItem>
                  <SelectItem value="sent-sample">Đã gửi mẫu</SelectItem>
                  <SelectItem value="waiting-response">Chờ phản hồi khách</SelectItem>
                  <SelectItem value="ordered">Đã đặt hàng</SelectItem>
                  <SelectItem value="no-response">Khách không phản hồi</SelectItem>
                  <SelectItem value="waiting-deposit">Chờ thanh toán cọc</SelectItem>
                  <SelectItem value="see-notes">Xem ở ghi chú</SelectItem>
                  <SelectItem value="waiting-payment">Chờ thanh toán tiền</SelectItem>
                  <SelectItem value="paid">Đã thanh toán xong</SelectItem>
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
                  <SelectItem value="Đặt Mẫu">Đặt mẫu</SelectItem>
                  <SelectItem value="Đại lý">Đại lý</SelectItem>
                  <SelectItem value="Chưa chuyển đổi">Chưa chuyển đổi</SelectItem>
                  <SelectItem value="KHTT">KHTT</SelectItem>
                  <SelectItem value="Đã Mua lần 3">Mua lần 3</SelectItem>
                  <SelectItem value="Đã Mua lần 2">Mua lần 2</SelectItem>
                  <SelectItem value="NPP">NPP</SelectItem>
                  <SelectItem value="Đã Mua">Đã mua</SelectItem>
                  <SelectItem value="Tiềm năng">Tiềm năng</SelectItem>
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
