import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, X, Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const quoteFormSchema = z.object({
  title: z.string().min(1, "Tiêu đề báo giá là bắt buộc"),
  quoteNumber: z.string().min(1, "Số báo giá là bắt buộc"),
  quoteDate: z.date({ required_error: "Ngày báo giá là bắt buộc" }),
  expiryDate: z.date({ required_error: "Ngày hết hạn là bắt buộc" }),
  customerName: z.string().min(1, "Tên khách hàng là bắt buộc"),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  includeVAT: z.boolean().default(false),
  vatRate: z.number().min(0).max(100).default(8),
  payment1: z.number().min(0).default(0),
  payment2: z.number().min(0).default(0)
});

type QuoteFormData = z.infer<typeof quoteFormSchema>;

interface QuoteItem {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  total: number;
  description?: string;
  specifications?: string;
}

interface CreateQuoteFormProps {
  onClose?: () => void;
  onSubmit?: () => void;
  initialData?: any;
}

export function CreateQuoteForm({ onClose, onSubmit, initialData }: CreateQuoteFormProps) {
  const [selectedProducts, setSelectedProducts] = useState<QuoteItem[]>([]);
  const { toast } = useToast();

  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      title: "BẢNG BÁO GIÁ",
      quoteNumber: `BG-${format(new Date(), "yyyyMMdd")}-${Math.floor(Math.random() * 1000)}`,
      quoteDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      customerName: "",
      phone: "",
      email: "",
      address: "",
      includeVAT: false,
      vatRate: 8,
      payment1: 0,
      payment2: 0
    }
  });

  // Product management functions
  const addProduct = () => {
    const newItem: QuoteItem = {
      id: `temp-${Date.now()}-${Math.random()}`,
      name: '',
      sku: '',
      price: 0,
      quantity: 1,
      total: 0
    };
    setSelectedProducts(prev => [...prev, newItem]);
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts(prev => prev.filter(item => item.id !== productId));
  };

  const updateProduct = (productId: string, updates: Partial<QuoteItem>) => {
    setSelectedProducts(prev => prev.map(item => {
      if (item.id === productId) {
        const updated = { ...item, ...updates };
        updated.total = updated.quantity * updated.price;
        return updated;
      }
      return item;
    }));
  };

  // Reordering functions - Working stable implementation
  const moveItemUp = (index: number) => {
    if (index === 0) return;
    const items = [...selectedProducts];
    [items[index], items[index - 1]] = [items[index - 1], items[index]];
    setSelectedProducts(items);
    toast({
      title: "Thành công",
      description: "Đã di chuyển sản phẩm lên trên"
    });
  };

  const moveItemDown = (index: number) => {
    if (index === selectedProducts.length - 1) return;
    const items = [...selectedProducts];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setSelectedProducts(items);
    toast({
      title: "Thành công", 
      description: "Đã di chuyển sản phẩm xuống dưới"
    });
  };

  const handleSubmit = async (data: QuoteFormData) => {
    if (selectedProducts.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng thêm ít nhất một sản phẩm",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Thành công",
      description: "Báo giá đã được tạo thành công"
    });
    onSubmit?.();
  };

  const watchedValues = form.watch();
  const subtotal = selectedProducts.reduce((sum, item) => sum + item.total, 0);
  const vatAmount = watchedValues.includeVAT ? subtotal * watchedValues.vatRate / 100 : 0;
  const total = subtotal + vatAmount;
  const remaining = total - (watchedValues.payment1 + watchedValues.payment2);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-foreground">
              {initialData ? 'Chỉnh sửa báo giá' : 'Tạo báo giá mới'}
            </h1>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Thông tin báo giá */}
            <Card>
              <CardHeader className="bg-blue-50">
                <CardTitle className="text-blue-700">Thông tin báo giá</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tiêu đề báo giá <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="BẢNG BÁO GIÁ" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quoteNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Số báo giá <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="BG-20250721-627" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tên khách hàng <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Nhập tên khách hàng..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Số điện thoại</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="VD: 0123456789" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Danh sách sản phẩm với tính năng sắp xếp */}
            <Card>
              <CardHeader className="bg-green-50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-green-700">Danh sách sản phẩm</CardTitle>
                    <p className="text-sm text-green-600 mt-1">
                      Sử dụng các nút mũi tên để sắp xếp lại thứ tự sản phẩm
                    </p>
                  </div>
                  <Button type="button" onClick={addProduct} className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Thêm sản phẩm
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="w-full border-collapse border border-gray-200">
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-bold text-base w-16 text-center">Sắp xếp</TableHead>
                        <TableHead className="font-bold text-base w-48">Tên sản phẩm</TableHead>
                        <TableHead className="font-bold text-base w-24">Mã SP</TableHead>
                        <TableHead className="font-bold text-base w-32 text-right">Đơn giá</TableHead>
                        <TableHead className="font-bold text-base w-24 text-center">Số lượng</TableHead>
                        <TableHead className="font-bold text-base w-32 text-right">Thành tiền</TableHead>
                        <TableHead className="font-bold text-base w-20 text-center">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProducts.map((item, index) => (
                        <TableRow key={item.id} className="h-16 border border-gray-200 hover:bg-gray-50">
                          {/* Sort controls */}
                          <TableCell className="w-16 p-2 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveItemUp(index)}
                                disabled={index === 0}
                                className={`p-1 rounded transition-colors ${
                                  index === 0 
                                    ? 'opacity-30 cursor-not-allowed text-gray-300' 
                                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                                }`}
                                title="Di chuyển lên"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <GripVertical className="w-4 h-4 text-gray-400" />
                              <button
                                type="button"
                                onClick={() => moveItemDown(index)}
                                disabled={index === selectedProducts.length - 1}
                                className={`p-1 rounded transition-colors ${
                                  index === selectedProducts.length - 1 
                                    ? 'opacity-30 cursor-not-allowed text-gray-300' 
                                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                                }`}
                                title="Di chuyển xuống"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            </div>
                          </TableCell>

                          {/* Product name */}
                          <TableCell className="w-48 p-2">
                            <Input
                              value={item.name}
                              onChange={(e) => updateProduct(item.id, { name: e.target.value })}
                              placeholder="Tên sản phẩm"
                              className="border-gray-200 focus:border-blue-500"
                            />
                          </TableCell>

                          {/* SKU */}
                          <TableCell className="w-24 p-2">
                            <Input
                              value={item.sku}
                              onChange={(e) => updateProduct(item.id, { sku: e.target.value })}
                              placeholder="Mã SP"
                              className="border-gray-200 focus:border-blue-500"
                            />
                          </TableCell>

                          {/* Price */}
                          <TableCell className="w-32 text-right p-2">
                            <Input
                              type="number"
                              value={item.price}
                              onChange={(e) => updateProduct(item.id, { price: parseFloat(e.target.value) || 0 })}
                              className="text-right font-mono text-blue-600 font-semibold border-gray-200 focus:border-blue-500"
                              placeholder="0"
                            />
                          </TableCell>

                          {/* Quantity */}
                          <TableCell className="w-24 text-center p-2">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateProduct(item.id, { quantity: parseInt(e.target.value) || 1 })}
                              className="text-center border-2 focus:border-blue-500"
                              min="1"
                            />
                          </TableCell>

                          {/* Total */}
                          <TableCell className="w-32 text-right font-mono font-bold text-green-600 p-2">
                            {item.total.toLocaleString('vi-VN')}đ
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="w-20 text-center p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:bg-red-50 h-8 w-8"
                              onClick={() => removeProduct(item.id)}
                              title="Xóa sản phẩm"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {selectedProducts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            Chưa có sản phẩm nào. Nhấn "Thêm sản phẩm" để bắt đầu.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Tổng kết thanh toán */}
            <Card>
              <CardHeader className="bg-purple-50">
                <CardTitle className="text-purple-700">Tổng kết thanh toán</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <FormField
                      control={form.control}
                      name="includeVAT"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="text-sm font-normal">Bao gồm VAT</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="vatRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Thuế VAT (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            placeholder="8"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span>TỔNG GIÁ TRỊ CHƯA BAO GỒM VAT:</span>
                    <span className="text-blue-600 font-bold">{subtotal.toLocaleString()}đ</span>
                  </div>
                  {watchedValues.includeVAT && (
                    <>
                      <div className="flex justify-between text-sm font-medium">
                        <span>VAT ({watchedValues.vatRate}%):</span>
                        <span className="text-orange-600">{vatAmount.toLocaleString()}đ</span>
                      </div>
                      <div className="flex justify-between text-sm font-medium">
                        <span>TỔNG TIỀN ĐÃ BAO GỒM VAT:</span>
                        <span className="text-green-600 font-bold">{total.toLocaleString()}đ</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Hủy
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {initialData ? 'Cập nhật báo giá' : 'Tạo báo giá'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}