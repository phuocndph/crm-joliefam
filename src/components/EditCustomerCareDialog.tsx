import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  manager_id: string | null;
  assignee_id: string | null;
  tags: string[] | null;
  auto_tags: string[] | null;
  notes: string | null;
  current_status: string | null;
  last_care_date: string | null;
  created_at: string;
  updated_at: string;
}

interface Assignee {
  id: string;
  name: string;
}

interface EditCustomerCareDialogProps {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const EditCustomerCareDialog = ({ customer, open, onOpenChange, onSuccess }: EditCustomerCareDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [lastUpdateDate, setLastUpdateDate] = useState<Date>();
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const { toast } = useToast();

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

  // Fetch assignees
  const fetchAssignees = async () => {
    setLoadingAssignees(true);
    try {
      const { data, error } = await supabase
        .from('assignees' as any)
        .select('id, name')
        .order('name');

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

  // Load assignees when dialog opens
  useEffect(() => {
    if (open) {
      fetchAssignees();
    }
  }, [open]);

  // Parse structured data from notes
  const parseNotesData = (notes: string | null) => {
    if (!notes) return { closingScore: "", nextAction: "", cleanNotes: "" };
    
    const lines = notes.split('\n');
    let closingScore = "";
    let nextAction = "";
    const cleanLines: string[] = [];
    
    for (const line of lines) {
      const scoreMatch = line.match(/^Điểm đánh giá:\s*(.+)$/);
      const actionMatch = line.match(/^Hành động tiếp theo:\s*(.+)$/);
      const dateMatch = line.match(/^Ngày cập nhật:\s*.+$/);
      
      if (scoreMatch) {
        closingScore = scoreMatch[1].trim();
      } else if (actionMatch) {
        nextAction = actionMatch[1].trim();
      } else if (dateMatch) {
        // skip date line
      } else {
        cleanLines.push(line);
      }
    }
    
    return { closingScore, nextAction, cleanNotes: cleanLines.join('\n').trim() };
  };

  // Initialize form with customer data - wait for assignees to load first
  useEffect(() => {
    if (customer && open && !loadingAssignees) {
      const { closingScore, nextAction, cleanNotes } = parseNotesData(customer.notes);
      
      setFormData({
        customerName: customer.name || "",
        assignedTo: customer.assignee_id || "",
        source: customer.tags && customer.tags.length > 0 ? customer.tags[0] : "",
        currentStatus: customer.current_status || "waiting-payment",
        followUpType: customer.auto_tags && customer.auto_tags.length > 0 ? customer.auto_tags[0] : "",
        closingScore,
        nextAction,
        notes: cleanNotes
      });
      setLastUpdateDate(customer.last_care_date ? new Date(customer.last_care_date) : new Date(customer.updated_at));
    }
  }, [customer, open, loadingAssignees]);

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

      // Check for duplicate customer name (excluding current customer)
      if (isLocalBackend()) {
        const existingCustomers = await localApi.customers({ includeInactive: true });
        const duplicate = existingCustomers.some((item) => item.id !== customer.id && item.name.trim().toLowerCase() === formData.customerName.trim().toLowerCase());
        if (duplicate) { toast({ title: "Lỗi", description: "Tên khách hàng đã tồn tại, vui lòng chọn tên khác", variant: "destructive" }); return; }
        const structuredNotes = [formData.notes, formData.nextAction ? `Hành động tiếp theo: ${formData.nextAction}` : '', formData.closingScore ? `Điểm đánh giá: ${formData.closingScore}` : '', lastUpdateDate ? `Ngày cập nhật: ${format(lastUpdateDate, 'dd/MM/yyyy')}` : ''].filter(Boolean).join('\n');
        await localApi.updateCustomer(customer.id, { name: formData.customerName, notes: structuredNotes, assignee_id: formData.assignedTo, tags: formData.source ? [formData.source] : [], current_status: formData.currentStatus, auto_tags: formData.followUpType ? [formData.followUpType] : [], last_care_date: lastUpdateDate?.toISOString() || new Date().toISOString() });
        toast({ title: "Thành công", description: "Đã cập nhật khách hàng thành công!" }); onOpenChange(false); onSuccess(); return;
      }
      const { data: existingCustomers, error: checkError } = await supabase
        .from('customers')
        .select('id, name')
        .neq('id', customer.id)
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

      // Build structured notes matching Create form format
      const structuredNotes = [
        formData.notes,
        formData.nextAction ? `Hành động tiếp theo: ${formData.nextAction}` : '',
        formData.closingScore ? `Điểm đánh giá: ${formData.closingScore}` : '',
        lastUpdateDate ? `Ngày cập nhật: ${format(lastUpdateDate, 'dd/MM/yyyy')}` : ''
      ].filter(Boolean).join('\n');

      // Update customer record
      const { error } = await supabase
        .from('customers')
        .update({
          name: formData.customerName,
          notes: structuredNotes,
          assignee_id: formData.assignedTo,
          tags: formData.source ? [formData.source] : null,
          current_status: formData.currentStatus,
          auto_tags: formData.followUpType ? [formData.followUpType] : null,
          last_care_date: lastUpdateDate?.toISOString() || new Date().toISOString(),
        })
        .eq('id', customer.id);

      if (error) {
        console.error('Error updating customer:', error);
        toast({
          title: "Lỗi",
          description: "Không thể cập nhật khách hàng. Vui lòng thử lại.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Thành công",
        description: "Đã cập nhật khách hàng thành công!",
      });

      onOpenChange(false);
      onSuccess();

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chỉnh Sửa Khách Hàng</DialogTitle>
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
                  <SelectValue placeholder={loadingAssignees ? "Đang tải..." : assignees.length === 0 ? "Chưa có người phụ trách" : "Chọn người phụ trách"} />
                </SelectTrigger>
                <SelectContent>
                  {!loadingAssignees && assignees.length > 0 ? (
                    assignees.map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>
                        {assignee.name}
                      </SelectItem>
                    ))
                  ) : null}
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
                  <SelectItem value="waiting-payment">Chờ thanh toán tiền</SelectItem>
                  <SelectItem value="waiting-deposit">Chờ thanh toán cọc</SelectItem>
                  <SelectItem value="sent-sample">Đã gửi mẫu</SelectItem>
                  <SelectItem value="sent-quote">Đã gửi báo giá</SelectItem>
                  <SelectItem value="waiting-response">Chờ phản hồi khách hàng</SelectItem>
                  <SelectItem value="ordered">Đã đặt hàng</SelectItem>
                  <SelectItem value="paid">Đã thanh toán xong</SelectItem>
                  <SelectItem value="see-notes">Xem ở ghi chú</SelectItem>
                  <SelectItem value="no-response">Khách không phản hồi</SelectItem>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Đang cập nhật..." : "Cập Nhật Khách Hàng"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditCustomerCareDialog;
