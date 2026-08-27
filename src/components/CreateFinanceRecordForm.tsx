import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CreateFinanceRecordFormProps {
  onClose: () => void;
  onSubmit: () => void;
}

export function CreateFinanceRecordForm({ onClose, onSubmit }: CreateFinanceRecordFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    amount: 0,
    type: "",
    description: "",
  });
  const [date, setDate] = useState<Date>(new Date());
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.amount || !formData.type) {
      toast({
        title: "Lỗi",
        description: "Vui lòng điền đầy đủ thông tin bắt buộc",
        variant: "destructive",
      });
      return;
    }

    const amount = formData.amount;
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Lỗi",
        description: "Số tiền phải là số dương",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const recordData = {
        amount,
        type: formData.type,
        description: formData.description.trim() || null,
        date: date.toISOString(),
        tenant_id: "default",
        manager_id: user?.id || null,
      };

      const { error } = await supabase
        .from("finance_data")
        .insert([recordData]);

      if (error) throw error;

      onSubmit();
    } catch (error) {
      console.error("Error creating finance record:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tạo bản ghi dòng tiền",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Số tiền *</Label>
          <CurrencyInput
            id="amount"
            value={formData.amount}
            onChange={(value) => handleInputChange("amount", value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Loại giao dịch *</Label>
          <Select value={formData.type} onValueChange={(value) => handleInputChange("type", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn loại giao dịch" />
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              <SelectItem value="income">Thu nhập</SelectItem>
              <SelectItem value="expense">Chi phí</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Ngày giao dịch *</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, "dd/MM/yyyy") : "Chọn ngày"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-white" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(newDate) => newDate && setDate(newDate)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Mô tả</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleInputChange("description", e.target.value)}
          placeholder="Mô tả chi tiết về giao dịch..."
          rows={3}
        />
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Đang tạo..." : "Tạo giao dịch"}
        </Button>
      </div>
    </form>
  );
}