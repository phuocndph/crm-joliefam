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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getOrderDisplayNumber } from "@/lib/orderUtils";
import { format } from "date-fns";

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
  
  // Tính ngày mặc định (4 ngày từ ngày tạo đơn)
  const getDefaultDeliveryDate = () => {
    const createdDate = new Date(order.created_at);
    const defaultDate = new Date(createdDate);
    defaultDate.setDate(createdDate.getDate() + 4);
    return format(defaultDate, 'yyyy-MM-dd');
  };
  
  const [deliveryDate, setDeliveryDate] = useState(
    order.delivery_date 
      ? format(new Date(order.delivery_date), 'yyyy-MM-dd')
      : getDefaultDeliveryDate()
  );
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    try {
      const orderData = {
        status,
        notes: notes.trim() || null,
        delivery_date: deliveryDate ? new Date(deliveryDate).toISOString() : null,
      };

      const { error } = await supabase
        .from("orders")
        .update(orderData)
        .eq("id", order.id);

      if (error) throw error;

      // Tạo transaction khi đơn hàng hoàn thành
      if (status === 'delivered' && order.status !== 'delivered' && order.total_amount) {
        await supabase.from('transactions').insert({
          amount: order.total_amount,
          type: 'income',
          category: 'sales',
          description: `Thanh toán đơn hàng ${getOrderDisplayNumber(order)}`,
          date: new Date().toISOString(),
          tenant_id: 'default',
        });
      }

      onSubmit();
    } catch (error) {
      console.error("Error updating order:", error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật đơn hàng",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa đơn hàng</DialogTitle>
          <DialogDescription>
            Cập nhật trạng thái và ghi chú cho đơn hàng #{getOrderDisplayNumber(order)}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Thông tin đơn hàng</Label>
            <div className="text-sm space-y-1">
              <p><strong>Số đơn hàng:</strong> {getOrderDisplayNumber(order)}</p>
              <p><strong>Khách hàng:</strong> {order.customers?.name || "Khách lẻ"}</p>
              <p><strong>Giá trị:</strong> {order.total_amount?.toLocaleString()} ₫</p>
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
            <Input
              id="edit-delivery-date"
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
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