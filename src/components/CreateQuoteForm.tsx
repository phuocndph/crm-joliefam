import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Settings, X, Plus, Trash2 } from "lucide-react";
import { ProductSelectionForm } from './ProductSelectionForm';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const quoteFormSchema = z.object({
  title: z.string().min(1, "Tiêu đề báo giá là bắt buộc"),
  quoteNumber: z.string().min(1, "Số báo giá là bắt buộc"),
  quoteDate: z.date({ required_error: "Ngày báo giá là bắt buộc" }),
  expiryDate: z.date({ required_error: "Ngày hết hạn là bắt buộc" }),
  customerName: z.string().min(1, "Tên khách hàng là bắt buộc"),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  priceList: z.string().min(1, "Bảng giá là bắt buộc"),
  responsible: z.string().optional(),
  includeVAT: z.boolean().default(false),
  vatRate: z.number().min(0).max(100).default(8),
  payment1: z.number().min(0).default(0),
  payment2: z.number().min(0).default(0),
});

type QuoteFormData = z.infer<typeof quoteFormSchema>;

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  sku: string | null;
  category: string | null;
  specifications: string | null;
  in_stock: boolean;
}

interface QuoteItem {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  total: number;
}

interface PriceList {
  id: string;
  name: string;
  year: number;
  status: string;
}

interface CreateQuoteFormProps {
  onClose?: () => void;
  onSubmit?: () => void;
  initialData?: any;
}

export function CreateQuoteForm({ onClose, onSubmit, initialData }: CreateQuoteFormProps) {
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<QuoteItem[]>([]);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  
  // Helper function to safely parse dates
  const parseDate = (dateString: string): Date => {
    // Try different date formats
    const formats = [
      // ISO format
      () => new Date(dateString),
      // Vietnamese dd/MM/yyyy format
      () => {
        const parts = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (parts) {
          return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
        }
        return null;
      },
      // Other common formats can be added here
    ];

    for (const formatFn of formats) {
      try {
        const date = formatFn();
        if (date && !isNaN(date.getTime())) {
          return date;
        }
      } catch (error) {
        // Continue to next format
      }
    }

    // If all parsing fails, return a default date
    console.warn('Unable to parse date:', dateString);
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  };
  
  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      title: initialData?.title || "BẢNG BÁO GIÁ",
      quoteNumber: initialData?.quote_number || `BG-${format(new Date(), "yyyyMMdd")}-${Math.floor(Math.random() * 1000)}`,
      quoteDate: initialData?.created_at ? new Date(initialData.created_at) : new Date(),
      expiryDate: initialData?.expiryDate ? parseDate(initialData.expiryDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      customerName: initialData?.customerName || "",
      phone: initialData?.customerPhone || "",
      email: initialData?.customerEmail || "",
      address: initialData?.customerAddress || "",
      priceList: "",
      responsible: initialData?.responsible || "",
      includeVAT: false,
      vatRate: 8,
      payment1: 0,
      payment2: 0,
    },
  });

  // Load price lists and products
  useEffect(() => {
    loadPriceLists();
    
    // Load existing data if editing
    if (initialData) {
      try {
        const items = typeof initialData.items === 'string' 
          ? JSON.parse(initialData.items) 
          : initialData.items || [];
        setSelectedProducts(items);
      } catch (error) {
        console.error('Error parsing initial items:', error);
      }
    }
  }, [initialData]);

  useEffect(() => {
    const selectedPriceList = form.watch("priceList");
    if (selectedPriceList) {
      loadProducts(selectedPriceList);
    }
  }, [form.watch("priceList")]);

  const loadPriceLists = async () => {
    try {
      const { data, error } = await supabase
        .from("price_lists")
        .select("*")
        .eq("status", "active")
        .order("year", { ascending: false });

      if (error) throw error;
      setPriceLists(data || []);
    } catch (error) {
      console.error("Error loading price lists:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách bảng giá",
        variant: "destructive",
      });
    }
  };

  const loadProducts = async (priceListId: string) => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("price_list_id", priceListId)
        .eq("in_stock", true)
        .order("name");

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error("Error loading products:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách sản phẩm",
        variant: "destructive",
      });
    }
  };

  const addProduct = (product: Product) => {
    const existingItem = selectedProducts.find(item => item.id === product.id);
    
    if (existingItem) {
      setSelectedProducts(prev => 
        prev.map(item => 
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
            : item
        )
      );
    } else {
      const newItem: QuoteItem = {
        id: product.id,
        name: product.name,
        sku: product.sku || '',
        price: product.price || 0,
        quantity: 1,
        total: product.price || 0,
      };
      setSelectedProducts(prev => [...prev, newItem]);
    }
    setShowProductDialog(false);
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeProduct(productId);
      return;
    }
    
    setSelectedProducts(prev =>
      prev.map(item =>
        item.id === productId
          ? { ...item, quantity, total: quantity * item.price }
          : item
      )
    );
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts(prev => prev.filter(item => item.id !== productId));
  };

  const handleSubmit = async (data: QuoteFormData) => {
    if (selectedProducts.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một sản phẩm",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // Calculate total
      const subtotal = selectedProducts.reduce((sum, item) => sum + item.total, 0);
      const vatAmount = watchedValues.includeVAT ? (subtotal * watchedValues.vatRate) / 100 : 0;
      const calculatedTotal = subtotal + vatAmount;
      
      const quoteData = {
        quote_number: data.quoteNumber,
        customer_id: null, // Would need customer selection
        total_amount: calculatedTotal,
        status: "draft",
        notes: `Khách hàng: ${data.customerName}\nĐiện thoại: ${data.phone}\nEmail: ${data.email}\nĐịa chỉ: ${data.address}\nNgày hết hạn: ${data.expiryDate && !isNaN(data.expiryDate.getTime()) ? format(data.expiryDate, "dd/MM/yyyy") : ""}`,
        items: JSON.stringify(selectedProducts),
        quote_data: JSON.stringify({
          includeVAT: data.includeVAT,
          vatRate: data.vatRate,
          payment1: data.payment1,
          payment2: data.payment2,
          quoteNumber: data.quoteNumber,
          customerName: data.customerName,
          customerPhone: data.phone,
          customerEmail: data.email,
          customerAddress: data.address,
          expiryDate: data.expiryDate && !isNaN(data.expiryDate.getTime()) ? format(data.expiryDate, "dd/MM/yyyy") : ""
        }),
        tenant_id: "default",
        manager_id: user?.id ? user.id.toString() : null,
      };

      if (initialData) {
        // Update existing quote
        const { error } = await supabase
          .from("quotes")
          .update(quoteData)
          .eq('id', initialData.id);

        if (error) throw error;

        toast({
          title: "Thành công",
          description: "Báo giá đã được cập nhật thành công",
        });
      } else {
        // Create new quote
        const { error } = await supabase
          .from("quotes")
          .insert([quoteData]);

        if (error) throw error;

        toast({
          title: "Thành công",
          description: "Báo giá đã được tạo thành công",
        });
      }

      onSubmit?.();
    } catch (error) {
      console.error("Error creating quote:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tạo báo giá",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const watchedValues = form.watch();
  const subtotal = selectedProducts.reduce((sum, item) => sum + item.total, 0);
  const vatAmount = watchedValues.includeVAT ? (subtotal * watchedValues.vatRate) / 100 : 0;
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
                             {priceLists.map((priceList) => (
                               <SelectItem key={priceList.id} value={priceList.id}>
                                 {priceList.name} ({priceList.year})
                               </SelectItem>
                             ))}
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
                  <div>
                    <CardTitle className="text-green-700">Danh sách sản phẩm lựa chọn</CardTitle>
                    <p className="text-sm text-green-600">
                      Bảng giá: {priceLists.find(p => p.id === watchedValues.priceList)?.name || "Chưa chọn"} ({products.length} sản phẩm có sẵn)
                    </p>
                  </div>
                  <Button 
                    type="button" 
                    className="bg-green-600 hover:bg-green-700"
                    disabled={!watchedValues.priceList}
                    onClick={() => setShowProductDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Thêm sản phẩm
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {watchedValues.priceList ? (
                  <ProductSelectionForm 
                    products={products}
                    onAddProduct={(product) => {
                      const newItem: QuoteItem = {
                        id: product.id,
                        name: product.name,
                        sku: product.sku || '',
                        price: product.price || 0,
                        quantity: 1,
                        total: product.price || 0,
                      };
                      setSelectedProducts(prev => [...prev, newItem]);
                      toast({
                        title: "Thành công",
                        description: `Đã thêm ${product.name} vào báo giá`,
                      });
                    }}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Vui lòng chọn bảng giá trước để bắt đầu thêm sản phẩm
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Danh sách sản phẩm đã chọn */}
            {selectedProducts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Sản phẩm đã chọn</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tên sản phẩm</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Đơn giá</TableHead>
                        <TableHead>Số lượng</TableHead>
                        <TableHead>Thành tiền</TableHead>
                        <TableHead>Hành động</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProducts.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.sku}</TableCell>
                          <TableCell>{item.price.toLocaleString()} VNĐ</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell className="font-semibold">
                            {item.total.toLocaleString()} VNĐ
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeProduct(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

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
                  <div className="flex justify-between text-sm font-medium">
                    <span>TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT:</span>
                    <span>{subtotal.toLocaleString()}</span>
                  </div>
                  {watchedValues.includeVAT && (
                    <>
                      <div className="flex justify-between text-sm font-medium">
                        <span>GTGT ({watchedValues.vatRate}%):</span>
                        <span>{vatAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm font-medium">
                        <span>TỔNG TIỀN ĐÃ BAO GỒM GTGT:</span>
                        <span>{total.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm font-medium">
                    <span>THANH TOÁN LẦN 1:</span>
                    <span>{(watchedValues.payment1 || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium text-blue-600">
                    <span>CÒN LẠI:</span>
                    <span>{remaining.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Hủy
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                {initialData ? 'Cập nhật báo giá' : 'Tạo báo giá'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}