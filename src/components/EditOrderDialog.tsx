import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { getOrderDisplayNumber } from "@/lib/orderUtils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon, Package, User, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface Order {
  id: string;
  order_number: string;
  display_order_number?: string;
  status: string;
  notes: string | null;
  total_amount: number | null;
  delivery_date: string | null;
  created_at: string;
  customers?: {
    name: string;
  } | null;
}

interface EditOrderDialogProps {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

const statusOptions = [
  { value: "pending", label: "Chờ xử lý" },
  { value: "processing", label: "Đang xử lý" },
  { value: "shipped", label: "Đã giao" },
  { value: "delivered", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã hủy" },
];

export function EditOrderDialog({ order, open, onOpenChange, onSubmit }: EditOrderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(order.status);
  const [notes, setNotes] = useState(order.notes || "");
  const queryClient = useQueryClient();
  
  // Tính ngày mặc định (4 ngày từ ngày tạo đơn)
  const getDefaultDeliveryDate = () => {
    const createdDate = new Date(order.created_at);
    const defaultDate = new Date(createdDate);
    defaultDate.setDate(createdDate.getDate() + 6);
    return format(defaultDate, 'yyyy-MM-dd');
  };
  
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(
    order.delivery_date 
      ? new Date(order.delivery_date)
      : new Date(getDefaultDeliveryDate())
  );
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const orderData = {
      status,
      notes: notes.trim() || null,
      delivery_date: deliveryDate ? deliveryDate.toISOString() : null,
    };

    // 1) Optimistic update vào cache infinite orders
    const queries = queryClient.getQueriesData<any>({ queryKey: ['orders-infinite'] });
    const prev: Array<{ key: any; data: any }> = [];
    queries.forEach(([key, data]) => {
      if (!data?.pages) return;
      prev.push({ key, data });
      const newPages = data.pages.map((page: any[]) =>
        page.map((o: any) => (o.id === order.id ? { ...o, ...orderData } : o))
      );
      queryClient.setQueryData(key, { ...data, pages: newPages });
    });

    // 2) Đóng dialog ngay + báo thành công
    onSubmit();
    toast({ title: "Đã cập nhật", description: "Đơn hàng đã được lưu" });

    // 3) Ghi DB ngầm
    (async () => {
      try {
        const { error } = await supabase
          .from("orders")
          .update(orderData)
          .eq("id", order.id);
        if (error) throw error;

        if (status === 'delivered' && order.status !== 'delivered' && order.total_amount) {
          supabase.from('transactions').insert({
            amount: order.total_amount,
            type: 'income',
            category: 'sales',
            description: `Thanh toán đơn hàng ${getOrderDisplayNumber(order)}`,
            date: new Date().toISOString(),
            tenant_id: 'default',
          }).then(({ error: txErr }) => {
            if (txErr) console.error('Transaction insert error:', txErr);
          });
        }
      } catch (error: any) {
        console.error("Error updating order:", error);
        // Rollback
        prev.forEach(({ key, data }) => queryClient.setQueryData(key, data));
        toast({
          title: "Lỗi",
          description: error?.message || "Không thể cập nhật đơn hàng",
          variant: "destructive",
        });
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="text-center pb-4">
          <DialogTitle className="text-xl font-semibold flex items-center justify-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Chỉnh sửa đơn hàng
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Cập nhật thông tin cho đơn hàng #{getOrderDisplayNumber(order)}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Thông tin đơn hàng
            </Label>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center gap-3 p-2 bg-background rounded-md">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Số đơn hàng</p>
                  <p className="text-sm text-muted-foreground">{getOrderDisplayNumber(order)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 bg-background rounded-md">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Khách hàng</p>
                  <p className="text-sm text-muted-foreground">{order.customers?.name || "Khách lẻ"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 bg-background rounded-md">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Giá trị đơn hàng</p>
                  <p className="text-sm text-muted-foreground font-semibold">{order.total_amount?.toLocaleString()} ₫</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-status">Trạng thái</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-delivery-date">Ngày hẹn giao hàng</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !deliveryDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deliveryDate ? (
                    format(deliveryDate, "dd/MM/yyyy", { locale: vi })
                  ) : (
                    <span>Chọn ngày giao hàng</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={deliveryDate}
                  onSelect={setDeliveryDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Ghi chú</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú về đơn hàng..."
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Đang cập nhật..." : "Cập nhật"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}