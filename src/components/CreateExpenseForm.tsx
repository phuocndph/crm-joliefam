import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CreateExpenseFormProps {
  onClose: () => void;
  onSubmit: () => void;
}

export function CreateExpenseForm({ onClose, onSubmit }: CreateExpenseFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    category: "",
    person_name: "",
    amount: 0,
    description: "",
    expense_date: new Date().toISOString().split('T')[0]
  });
  const { toast } = useToast();

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
      const expenseCode = `CP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 1000)}`;
      
      // Get current user session to set manager_id
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('expenses')
        .insert({
          category: formData.category,
          person_name: formData.person_name || null,
          amount: formData.amount,
          description: formData.description || '',
          expense_date: formData.expense_date,
          expense_code: expenseCode,
          manager_id: user?.id
        });

      if (error) throw error;

      onSubmit();
      onClose();
      
      toast({
        title: "Thành công",
        description: "Chi phí đã được tạo thành công",
      });
    } catch (error) {
      console.error('Error creating expense:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tạo chi phí",
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
        <Button type="button" variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Đang tạo..." : "Tạo chi phí"}
        </Button>
      </div>
    </form>
  );
}