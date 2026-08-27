import React, { useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

interface DeleteCustomerDialogProps {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteCustomerDialog({ customer, open, onOpenChange, onConfirm }: DeleteCustomerDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", customer.id);

      if (error) throw error;

      onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa khách hàng",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <DialogTitle>Xóa khách hàng</DialogTitle>
              <DialogDescription>
                Bạn có chắc chắn muốn xóa khách hàng này không?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="py-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="space-y-2">
              <div>
                <span className="text-sm font-medium text-gray-500">Tên:</span>
                <span className="ml-2 text-sm">{customer.name}</span>
              </div>
              {customer.email && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Email:</span>
                  <span className="ml-2 text-sm">{customer.email}</span>
                </div>
              )}
              {customer.company && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Công ty:</span>
                  <span className="ml-2 text-sm">{customer.company}</span>
                </div>
              )}
            </div>
          </div>
          
          <p className="mt-4 text-sm text-gray-600">
            Hành động này không thể hoàn tác. Tất cả dữ liệu liên quan đến khách hàng này sẽ bị xóa vĩnh viễn.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Hủy
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? "Đang xóa..." : "Xóa khách hàng"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}