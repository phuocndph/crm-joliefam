import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EditOrderNumberDialogProps {
  orderId: string;
  currentOrderNumber: string;
  currentDisplayNumber?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (newDisplayNumber: string | null) => void;
}

export const EditOrderNumberDialog: React.FC<EditOrderNumberDialogProps> = ({
  orderId,
  currentOrderNumber,
  currentDisplayNumber,
  open,
  onOpenChange,
  onSuccess
}) => {
  const [displayNumber, setDisplayNumber] = useState(currentDisplayNumber || "");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    const newValue = displayNumber.trim() || null;
    try {
      setLoading(true);

      const { error } = await supabase
        .from("orders")
        .update({ 
          display_order_number: newValue 
        })
        .eq("id", orderId);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã cập nhật tên hiển thị mã đơn hàng",
      });

      onSuccess(newValue);
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating order display number:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật tên hiển thị",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setDisplayNumber("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa Hiển thị Mã đơn hàng</DialogTitle>
          <DialogDescription>
            Tùy chỉnh cách hiển thị mã đơn hàng trong toàn bộ hệ thống
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">Mã đơn hàng gốc</Label>
            <div className="p-2 bg-muted rounded text-sm font-mono">
              {currentOrderNumber}
            </div>
          </div>
          
          <div>
            <Label htmlFor="displayNumber">Tên hiển thị tùy chỉnh</Label>
            <Input
              id="displayNumber"
              value={displayNumber}
              onChange={(e) => setDisplayNumber(e.target.value)}
              placeholder="Ví dụ: 1992, DH-001, v.v..."
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Để trống để sử dụng mã đơn hàng gốc
            </p>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Xem trước:</strong> {displayNumber.trim() || currentOrderNumber}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset} disabled={loading}>
            Đặt lại
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};