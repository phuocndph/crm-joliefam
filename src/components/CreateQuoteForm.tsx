import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Settings, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const quoteFormSchema = z.object({
  title: z.string().min(1, "Tiêu đề báo giá là bắt buộc"),
  quoteNumber: z.string().min(1, "Số báo giá là bắt buộc"),
  quoteDate: z.date({ required_error: "Ngày báo giá là bắt buộc" }),
  expiryDate: z.date({ required_error: "Ngày hết hạn là bắt buộc" }),
  customerName: z.string().min(1, "Tên khách hàng là bắt buộc"),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  priceList: z.string().optional(),
  responsible: z.string().optional(),
  includeVAT: z.boolean().default(false),
  vatRate: z.number().min(0).max(100).default(8),
  payment1: z.number().min(0).default(0),
  payment2: z.number().min(0).default(0),
});

type QuoteFormData = z.infer<typeof quoteFormSchema>;

interface CreateQuoteFormProps {
  onClose?: () => void;
  onSubmit?: (data: QuoteFormData) => void;
}

export function CreateQuoteForm({ onClose, onSubmit }: CreateQuoteFormProps) {
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  
  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      title: "BẢNG BÁO GIÁ",
      quoteNumber: "BG-20250721-627",
      quoteDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      customerName: "",
      phone: "",
      email: "",
      address: "",
      priceList: "",
      responsible: "",
      includeVAT: false,
      vatRate: 8,
      payment1: 0,
      payment2: 0,
    },
  });

  const handleSubmit = (data: QuoteFormData) => {
    console.log("Quote data:", data);
    onSubmit?.(data);
  };

  const watchedValues = form.watch();
  const subtotal = 0; // This would be calculated from products
  const vatAmount = watchedValues.includeVAT ? (subtotal * watchedValues.vatRate) / 100 : 0;
  const total = subtotal + vatAmount;
  const remaining = total - (watchedValues.payment1 + watchedValues.payment2);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-foreground">Tạo báo giá mới</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplateSettings(!showTemplateSettings)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Cài đặt template
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Tiêu đề báo giá <span className="text-red-500">*</span>
                        </FormLabel>
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
                        <FormLabel>
                          Số báo giá <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="BG-20250721-627" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="quoteDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Ngày báo giá <span className="text-red-500">*</span>
                        </FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "dd/MM/yyyy")
                                ) : (
                                  <span>Chọn ngày</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date("1900-01-01")}
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="expiryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Ngày hết hạn <span className="text-red-500">*</span>
                        </FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "dd/MM/yyyy")
                                ) : (
                                  <span>Chọn ngày</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date()}
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priceList"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Bảng giá <span className="text-red-500">*</span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Bảng Báo Giá Tháng 6 (2025)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pricelist-2025-06">Bảng Báo Giá Tháng 6 (2025)</SelectItem>
                            <SelectItem value="pricelist-2025-07">Bảng Báo Giá Tháng 7 (2025)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="responsible"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Người phụ trách</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Chọn người phụ trách" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="manager1">Nguyễn Văn A</SelectItem>
                            <SelectItem value="manager2">Trần Thị B</SelectItem>
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
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Tên khách hàng <span className="text-red-500">*</span>
                        </FormLabel>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="VD: email@example.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Địa chỉ</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="VD: 123 Đường ABC, TP.HCM" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Danh sách sản phẩm */}
            <Card>
              <CardHeader className="bg-green-50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-green-700">Danh sách sản phẩm lựa chọn</CardTitle>
                  <Button type="button" className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Thêm sản phẩm
                  </Button>
                </div>
                <p className="text-sm text-green-600">
                  Bảng giá: Bảng Báo Giá Tháng 6 (0 sản phẩm có sẵn)
                </p>
              </CardHeader>
              <CardContent className="p-6">
                <div className="text-center py-8 text-muted-foreground">
                  Chưa có sản phẩm nào được chọn
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
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal">
                            Bao gồm VAT
                          </FormLabel>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="payment1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Thanh toán lần 1 (VNĐ)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="payment2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Thanh toán lần 2 (VNĐ)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Calculation Summary */}
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Tổng giá trị đơn hàng chưa bao gồm GTGT:</span>
                    <span>{subtotal.toLocaleString()} đ</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>GTGT ({watchedValues.vatRate}%):</span>
                    <span>{vatAmount.toLocaleString()} đ</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>Tổng tiền đã bao gồm GTGT:</span>
                    <span>{total.toLocaleString()} đ</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium text-blue-600">
                    <span>Còn lại:</span>
                    <span>{remaining.toLocaleString()} đ</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Hủy
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                Tạo báo giá
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}