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
import { format } from "date-fns";

interface FinanceRecord {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  date: string;
}

interface DeleteFinanceRecordDialogProps {
  record: FinanceRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteFinanceRecordDialog({ record, open, onOpenChange, onConfirm }: DeleteFinanceRecordDialogProps) {
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'income':
        return 'Thu nhập';
      case 'expense':
        return 'Chi phí';
      default:
        return type;
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
              <DialogTitle>Xóa giao dịch</DialogTitle>
              <DialogDescription>
                Bạn có chắc chắn muốn xóa giao dịch này không?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="py-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="space-y-2">
              <div>
                <span className="text-sm font-medium text-gray-500">Ngày:</span>
                <span className="ml-2 text-sm">{format(new Date(record.date), 'dd/MM/yyyy')}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Loại:</span>
                <span className="ml-2 text-sm">{getTypeLabel(record.type)}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Số tiền:</span>
                <span className={`ml-2 text-sm font-semibold ${record.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                  {record.type === 'income' ? '+' : '-'}{record.amount.toLocaleString()} ₫
                </span>
              </div>
              {record.description && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Mô tả:</span>
                  <span className="ml-2 text-sm">{record.description}</span>
                </div>
              )}
            </div>
          </div>
          
          <p className="mt-4 text-sm text-gray-600">
            Hành động này không thể hoàn tác. Giao dịch sẽ bị xóa vĩnh viễn khỏi dòng tiền.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Xóa giao dịch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}