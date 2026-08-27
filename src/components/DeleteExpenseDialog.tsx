import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  expense_date: string;
  person_name: string | null;
  expense_code: string;
  created_at: string;
}

interface DeleteExpenseDialogProps {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const formatSafeDate = (dateValue: string | null | undefined, formatStr: string = "dd/MM/yyyy") => {
  if (!dateValue) {
    return "-";
  }
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleDateString('vi-VN');
  } catch (error) {
    return "-";
  }
};

export function DeleteExpenseDialog({ expense, open, onOpenChange, onConfirm }: DeleteExpenseDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xác nhận xóa chi phí</AlertDialogTitle>
          <AlertDialogDescription>
            Bạn có chắc chắn muốn xóa chi phí này? Hành động này không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Mã chi phí:</span>
            <Badge variant="outline">{expense.expense_code}</Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Loại chi phí:</span>
            <Badge className="bg-red-100 text-red-800">{expense.category}</Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Người chi:</span>
            <span className="text-sm">{expense.person_name || "—"}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Số tiền:</span>
            <span className="text-sm font-semibold text-red-600">
              -{expense.amount.toLocaleString()} ₫
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Ngày:</span>
            <span className="text-sm">{formatSafeDate(expense.expense_date)}</span>
          </div>
          
          {expense.description && (
            <div className="space-y-1">
              <span className="text-sm font-medium text-gray-500">Mô tả:</span>
              <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                {expense.description}
              </p>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-red-600 hover:bg-red-700">
            Xóa chi phí
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}