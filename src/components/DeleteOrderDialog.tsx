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

interface Order {
  id: string;
  order_number: string;
  display_order_number?: string;
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
                Bạn có chắc chắn muốn xóa đơn hàng này không?
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
                <span className="text-sm font-medium text-gray-500">Giá trị:</span>
                <span className="ml-2 text-sm">{order.total_amount?.toLocaleString()} ₫</span>
              </div>
            </div>
          </div>
          
          <p className="mt-4 text-sm text-gray-600">
            Hành động này không thể hoàn tác. Tất cả dữ liệu liên quan đến đơn hàng này sẽ bị xóa vĩnh viễn.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Xóa đơn hàng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}