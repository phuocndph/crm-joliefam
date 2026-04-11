import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarIcon, Plus, CreditCard } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";

const paymentFormSchema = z.object({
  paymentAmount: z.number().min(1, "Số tiền phải lớn hơn 0"),
  paymentType: z.string().min(1, "Vui lòng chọn loại thanh toán"),
  paymentMethod: z.string().min(1, "Vui lòng chọn phương thức thanh toán"),
  paymentDate: z.date({ required_error: "Vui lòng chọn ngày thanh toán" }),
  installmentNumber: z.number().min(1, "Số đợt phải lớn hơn 0"),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentFormSchema>;

interface CreatePaymentFormProps {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  totalPaid: number;
  remainingAmount: number;
  onClose: () => void;
  onSubmit: () => void;
}

export function CreatePaymentForm({ 
  orderId, 
  orderNumber, 
  totalAmount, 
  totalPaid, 
  remainingAmount,
  onClose, 
  onSubmit 
}: CreatePaymentFormProps) {
  const [loading, setLoading] = useState(false);
  const [managerId, setManagerId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch order's manager_id
  React.useEffect(() => {
    const fetchOrderManagerId = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('manager_id')
        .eq('id', orderId)
        .single();
      
      if (!error && data) {
        setManagerId(data.manager_id);
      }
    };
    
    fetchOrderManagerId();
  }, [orderId]);

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      paymentAmount: remainingAmount,
      paymentType: remainingAmount === totalAmount ? "full" : totalPaid === 0 ? "deposit" : "payment_2",
      paymentMethod: "cash",
      paymentDate: new Date(),
      installmentNumber: 1,
      notes: "",
    },
  });

  const watchedPaymentAmount = form.watch("paymentAmount");
  const watchedPaymentType = form.watch("paymentType");

  // Suggest payment type based on amount
  React.useEffect(() => {
    if (watchedPaymentAmount === totalAmount) {
      form.setValue("paymentType", "full");
    } else if (totalPaid === 0 && watchedPaymentAmount < totalAmount) {
      form.setValue("paymentType", "deposit");
    } else if (totalPaid > 0 && watchedPaymentAmount < remainingAmount) {
      form.setValue("paymentType", "payment_2");
    } else if (totalPaid > 0 && watchedPaymentAmount === remainingAmount) {
      form.setValue("paymentType", "payment_3");
    }
  }, [watchedPaymentAmount, totalAmount, remainingAmount, totalPaid, form]);

  const handleSubmit = async (data: PaymentFormData) => {
    setLoading(true);
    try {
      if (data.paymentAmount > remainingAmount) {
        throw new Error("Số tiền thanh toán không thể lớn hơn số tiền còn lại");
      }

      const paymentData = {
        order_id: orderId,
        payment_amount: data.paymentAmount,
        payment_type: data.paymentType,
        payment_method: data.paymentMethod,
        payment_date: data.paymentDate.toISOString(),
        installment_number: data.installmentNumber,
        notes: data.notes || null,
        tenant_id: 'default',
        manager_id: managerId,
      };

      console.log('💰 Creating payment:', paymentData);
      const { error } = await supabase
        .from("order_payments")
        .insert(paymentData);

      if (error) {
        console.error('❌ Error inserting payment:', error);
        throw error;
      }

      console.log('✅ Payment inserted successfully');

      // Also create a transaction record
      const transactionData = {
        amount: data.paymentAmount,
        type: 'income',
        category: 'order_payment',
        description: `Thanh toán đơn hàng ${orderNumber} - ${getPaymentTypeLabel(data.paymentType)}`,
        date: data.paymentDate.toISOString(),
        order_id: orderId,
        payment_type: data.paymentType,
        installment_number: data.installmentNumber,
        total_installments: 1,
        remaining_amount: remainingAmount - data.paymentAmount,
        tenant_id: 'default',
        manager_id: managerId,
      };

      console.log('📊 Creating transaction:', transactionData);
      const { error: transactionError } = await supabase.from('transactions').insert(transactionData);

      if (transactionError) {
        console.error('❌ Error inserting transaction:', transactionError);
        throw transactionError;
      }

      console.log('✅ Transaction inserted successfully');

      // Calculate new payment status
      const newTotalPaid = totalPaid + data.paymentAmount;
      const newPaymentStatus = newTotalPaid >= totalAmount ? 'paid' : 
                              newTotalPaid > 0 ? 'partial' : 'pending';

      // Update order payment status
      const orderUpdateData = {
        payment_status: newPaymentStatus,
        payment_date: newPaymentStatus === 'paid' ? data.paymentDate.toISOString() : null
      };

      console.log('📦 Updating order:', orderId, orderUpdateData);
      const { error: updateError } = await supabase
        .from('orders')
        .update(orderUpdateData)
        .eq('id', orderId);

      if (updateError) {
        console.error('❌ Error updating order:', updateError);
        throw updateError;
      }

      console.log('✅ Order updated successfully');

      console.log('✅ Payment creation completed successfully');
      toast({
        title: "Thành công",
        description: "Đã thêm thanh toán thành công",
      });

      onSubmit();
      onClose();
    } catch (error: any) {
      console.error("❌ Error creating payment:", error);
      toast({
        title: "Lỗi", 
        description: error.message || "Không thể tạo thanh toán",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case 'deposit': return 'Đặt cọc';
      case 'payment_2': return 'Thanh toán lần 2';
      case 'payment_3': return 'Thanh toán lần 3';
      case 'full': return 'Thanh toán toàn bộ';
      default: return type;
    }
  };

  const resetForm = () => {
    const defaultValues = {
      paymentAmount: 0,
      paymentType: "deposit",
      paymentMethod: "cash",
      paymentDate: new Date(),
      installmentNumber: 1,
      notes: "",
    };
    
    // Reset form completely
    form.reset(defaultValues);
  };

  const deleteAllPayments = async () => {
    setLoading(true);
    try {
      // Delete all payments for this order
      const { error: paymentError } = await supabase
        .from("order_payments")
        .delete()
        .eq("order_id", orderId);

      if (paymentError) throw paymentError;

      // Delete all related transactions
      const { error: transactionError } = await supabase
        .from("transactions")
        .delete()
        .eq("order_id", orderId)
        .eq("category", "order_payment");

      if (transactionError) throw transactionError;

      // Update order payment status to pending after deleting all payments
      const { error: orderUpdateError } = await supabase
        .from("orders")
        .update({ 
          payment_status: "pending",
          payment_date: null 
        })
        .eq("id", orderId);

      if (orderUpdateError) throw orderUpdateError;

      toast({
        title: "Thành công",
        description: "Đã xóa tất cả thanh toán trước đó",
      });

      onSubmit(); // Refresh data
    } catch (error: any) {
      console.error("Error deleting payments:", error);
      toast({
        title: "Lỗi", 
        description: error.message || "Không thể xóa thanh toán",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " VNĐ";
  };


  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Thêm thanh toán - Đơn hàng #{orderNumber}
        </DialogTitle>
      </DialogHeader>
      
      {/* Order Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-lg font-bold text-blue-600">
              {formatCurrency(totalAmount)}
            </div>
            <div className="text-sm text-muted-foreground">Tổng tiền</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-lg font-bold text-green-600">
              {formatCurrency(totalPaid)}
            </div>
            <div className="text-sm text-muted-foreground">Đã thanh toán</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-lg font-bold text-red-600">
              {formatCurrency(remainingAmount)}
            </div>
            <div className="text-sm text-muted-foreground">Còn lại</div>
          </CardContent>
        </Card>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="paymentAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Số tiền thanh toán *</FormLabel>
                  <FormControl>
                    <CurrencyInput 
                      placeholder="0" 
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                  {watchedPaymentAmount > remainingAmount && (
                    <p className="text-sm text-red-600">
                      Số tiền không thể lớn hơn {formatCurrency(remainingAmount)}
                    </p>
                  )}
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="paymentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại thanh toán *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn loại thanh toán" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-white z-50">
                      <SelectItem value="deposit">Đặt cọc</SelectItem>
                      <SelectItem value="payment_2">Thanh toán lần 2</SelectItem>
                      <SelectItem value="payment_3">Thanh toán lần 3</SelectItem>
                      <SelectItem value="full">Thanh toán toàn bộ</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phương thức thanh toán *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn phương thức" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-white z-50">
                      <SelectItem value="cash">Tiền mặt</SelectItem>
                      <SelectItem value="bank_transfer">Chuyển khoản</SelectItem>
                      <SelectItem value="card">Thẻ</SelectItem>
                      <SelectItem value="other">Khác</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="installmentNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Đợt thanh toán</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="1" 
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="paymentDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Ngày thanh toán *</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "dd/MM/yyyy", { locale: vi })
                        ) : (
                          <span>Chọn ngày</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ghi chú</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Ghi chú về thanh toán này..."
                    rows={3}
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Summary */}
          <Card className="bg-blue-50">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Loại thanh toán:</span>
                  <span className="font-medium">{getPaymentTypeLabel(watchedPaymentType)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Số tiền:</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(watchedPaymentAmount || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Còn lại sau thanh toán:</span>
                  <span className="font-medium text-red-600">
                    {formatCurrency(remainingAmount - (watchedPaymentAmount || 0))}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between items-center pt-4">
            <div className="flex space-x-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                Đặt lại
              </Button>
              {totalPaid > 0 && (
                <Button 
                  type="button" 
                  variant="destructive" 
                  onClick={deleteAllPayments}
                  disabled={loading}
                >
                  {loading ? "Đang xóa..." : "Xóa tất cả thanh toán"}
                </Button>
              )}
            </div>
            <div className="flex space-x-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Hủy
              </Button>
              <Button type="submit" disabled={loading || !watchedPaymentAmount || watchedPaymentAmount > remainingAmount}>
                {loading ? "Đang lưu..." : "Thêm thanh toán"}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </>
  );
}