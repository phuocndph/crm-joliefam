import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";

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

interface EditExpenseDialogProps {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

export function EditExpenseDialog({ expense, open, onOpenChange, onSubmit }: EditExpenseDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    category: "",
    person_name: "",
    amount: 0,
    description: "",
    expense_date: ""
  });
  const { toast } = useToast();

  useEffect(() => {
    if (expense) {
      setFormData({
        category: expense.category,
        person_name: expense.person_name || "",
        amount: expense.amount,
        description: expense.description || "",
        expense_date: expense.expense_date.split('T')[0]
      });
    }
  }, [expense]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.category || !formData.amount) {
      toast({
        title: "Lỗi",
        description: "Vui lòng điền đầy đủ thông tin bắt buộc",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (isLocalBackend()) {
        await localApi.updateExpense(expense.id, { category: formData.category, person_name: formData.person_name || null, amount: formData.amount, description: formData.description || null, expense_date: formData.expense_date });
        onSubmit();
        onOpenChange(false);
        toast({ title: "Thành công", description: "Chi phí đã được cập nhật thành công" });
        return;
      }
      const { error } = await supabase
        .from('expenses')
        .update({
          category: formData.category,
          person_name: formData.person_name || null,
          amount: formData.amount,
          description: formData.description || null,
          expense_date: formData.expense_date
        })
        .eq('id', expense.id);

      if (error) throw error;

      onSubmit();
      onOpenChange(false);
      
      toast({
        title: "Thành công",
        description: "Chi phí đã được cập nhật thành công",
      });
    } catch (error) {
      console.error('Error updating expense:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật chi phí",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa chi phí</DialogTitle>
          <DialogDescription>
            Cập nhật thông tin chi phí #{expense?.expense_code}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expense_date">Ngày chi phí *</Label>
              <Input
                id="expense_date"
                type="date"
                value={formData.expense_date}
                onChange={(e) => handleInputChange('expense_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Loại chi phí *</Label>
              <Input
                id="category"
                placeholder="Ví dụ: Văn phòng phẩm, Điện nước, Lương nhân viên..."
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="person_name">Người chi</Label>
              <Input
                id="person_name"
                placeholder="Tên người thực hiện chi phí"
                value={formData.person_name}
                onChange={(e) => handleInputChange('person_name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Số tiền *</Label>
              <CurrencyInput
                id="amount"
                placeholder="0"
                value={formData.amount}
                onChange={(value) => handleInputChange('amount', value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Mô tả chi tiết</Label>
            <Textarea
              id="description"
              placeholder="Mô tả chi tiết về chi phí này..."
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2">
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
