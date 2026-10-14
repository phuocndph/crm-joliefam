import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { getOrderDisplayNumber } from "@/lib/orderUtils";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";
import { useToast } from "@/hooks/use-toast";

interface Order {
  id: string;
  order_number: string;
  display_order_number?: string;
  status: string;
  total_amount: number | null;
  customers?: {
    name: string;
  } | null;
}

interface DeleteOrderDialogProps {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteOrderDialog({ order, open, onOpenChange, onConfirm }: DeleteOrderDialogProps) {
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      if (isLocalBackend()) {
        await localApi.deleteOrder(order.id);
        toast({
          title: "Thành công",
          description: "Đơn hàng đã được xóa thành công",
        });
        onConfirm();
        onOpenChange(false);
        return;
      }

      // First delete related order_payments
      const { error: paymentsError } = await supabase
        .from("order_payments")
        .delete()
        .eq("order_id", order.id);

      if (paymentsError) throw paymentsError;

      // Then delete related transactions
      const { error: transactionsError } = await supabase
        .from("transactions")
        .delete()
        .eq("order_id", order.id);

      if (transactionsError) throw transactionsError;

      // Finally delete the order
      const { error: orderError } = await supabase
        .from("orders")
        .delete()
        .eq("id", order.id);

      if (orderError) throw orderError;

      toast({
        title: "Thành công",
        description: "Đơn hàng đã được xóa thành công",
      });

      onConfirm(); // Callback to refresh data
      onOpenChange(false); // Close dialog
    } catch (error: any) {
      console.error("Error deleting order:", error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa đơn hàng",
        variant: "destructive",
      });
    }
  };

  // Check if order can be deleted (only cancelled orders)
  const canDelete = order.status === "cancelled";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <DialogTitle>Xóa đơn hàng</DialogTitle>
              <DialogDescription>
                {canDelete 
                  ? "Bạn có chắc chắn muốn xóa đơn hàng này không?"
                  : "Chỉ có thể xóa đơn hàng với trạng thái 'Đã hủy'"
                }
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="py-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="space-y-2">
              <div>
                <span className="text-sm font-medium text-gray-500">Số đơn hàng:</span>
                <span className="ml-2 text-sm">{getOrderDisplayNumber(order)}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Khách hàng:</span>
                <span className="ml-2 text-sm">{order.customers?.name || "Khách lẻ"}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Trạng thái:</span>
                <span className="ml-2 text-sm">{order.status}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Giá trị:</span>
                <span className="ml-2 text-sm">{order.total_amount?.toLocaleString()} ₫</span>
              </div>
            </div>
          </div>
          
          <p className="mt-4 text-sm text-gray-600">
            {canDelete 
              ? "Hành động này không thể hoàn tác. Tất cả dữ liệu liên quan đến đơn hàng này sẽ bị xóa vĩnh viễn."
              : "Vui lòng thay đổi trạng thái đơn hàng thành 'Đã hủy' trước khi xóa."
            }
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete}
            disabled={!canDelete}
          >
            Xóa đơn hàng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
