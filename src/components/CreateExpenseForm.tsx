import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { getOrderDisplayNumber } from "@/lib/orderUtils";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";

interface CreateExpenseFormProps {
  onClose: () => void;
  onSubmit: () => void;
}

export function CreateExpenseForm({ onClose, onSubmit }: CreateExpenseFormProps) {
  const [loading, setLoading] = useState(false);
  const [orderPopoverOpen, setOrderPopoverOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [formData, setFormData] = useState({
    category: "",
    person_name: "",
    amount: 0,
    description: "",
    expense_date: new Date().toISOString().split('T')[0]
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchOrders = async () => {
      if (isLocalBackend()) {
        const data = await localApi.orders({ limit: 5000 });
        setOrders(data);
        return;
      }
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, display_order_number, customers!left(name)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) setOrders(data);
    };
    fetchOrders();
  }, []);

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

      if (isLocalBackend()) {
        await localApi.createExpense({ ...formData, expense_code: expenseCode, manager_id: "local-admin" });
        if (selectedOrderId && selectedOrderId !== "none") {
          await localApi.createTransaction({ type: "expense", order_id: selectedOrderId, amount: formData.amount, description: formData.description || formData.category, category: formData.category, date: formData.expense_date, manager_id: "local-admin" });
        }
        onSubmit();
        onClose();
        toast({ title: "Thành công", description: "Chi phí đã được tạo thành công" });
        return;
      }
      
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

      // If an order is selected, also create a transaction record
      if (selectedOrderId && selectedOrderId !== "none") {
        const { error: txError } = await supabase
          .from('transactions')
          .insert({
            type: 'expense',
            order_id: selectedOrderId,
            amount: formData.amount,
            description: formData.description || formData.category,
            category: formData.category,
            date: formData.expense_date,
            manager_id: user?.id
          });

        if (txError) {
          console.error('Error creating linked transaction:', txError);
        } else {
          // Invalidate transaction-related queries
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['allOrderExpenses'] });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
      }

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

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="order_id">Đơn hàng liên quan (tùy chọn)</Label>
          <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={orderPopoverOpen}
                className="w-full justify-between font-normal"
              >
                {selectedOrderId && selectedOrderId !== "none"
                  ? (() => {
                      const order = orders.find(o => o.id === selectedOrderId);
                      return order ? `#${getOrderDisplayNumber(order)} - ${order.customers?.name || 'Không có KH'}` : 'Chọn đơn hàng...';
                    })()
                  : "Chọn đơn hàng nếu chi phí liên quan đến đơn hàng"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Tìm đơn hàng..." value={orderSearch} onValueChange={setOrderSearch} />
                <CommandList>
                  <CommandEmpty>Không tìm thấy đơn hàng</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="none"
                      onSelect={() => {
                        setSelectedOrderId("none");
                        setOrderPopoverOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selectedOrderId === "none" || !selectedOrderId ? "opacity-100" : "opacity-0")} />
                      -- Không liên kết đơn hàng --
                    </CommandItem>
                    {orders.map((order) => {
                      const label = `#${getOrderDisplayNumber(order)} - ${order.customers?.name || 'Không có KH'}`;
                      return (
                        <CommandItem
                          key={order.id}
                          value={label}
                          onSelect={() => {
                            setSelectedOrderId(order.id);
                            setOrderPopoverOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedOrderId === order.id ? "opacity-100" : "opacity-0")} />
                          {label}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            Nếu chọn đơn hàng, chi phí sẽ được tính vào cột "Chi phí" của đơn hàng đó trong trang Thanh toán.
          </p>
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
