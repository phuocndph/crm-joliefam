import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Settings, X, Plus, Trash2, Search, Image } from "lucide-react";
import { ProductSelectionForm } from './ProductSelectionForm';
import ProductImageLibrary from './ProductImageLibrary';
import { AssigneeManagement } from './AssigneeManagement';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useProductSearch, highlightSearchTerms } from "@/lib/searchUtils";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const quoteFormSchema = z.object({
  title: z.string().min(1, "Tiêu đề báo giá là bắt buộc"),
  quoteNumber: z.string().min(1, "Số báo giá là bắt buộc"),
  quoteDate: z.date({
    required_error: "Ngày báo giá là bắt buộc"
  }),
  expiryDate: z.date({
    required_error: "Ngày hết hạn là bắt buộc"
  }),
  customerName: z.string().min(1, "Tên khách hàng là bắt buộc"),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  priceList: z.string().min(1, "Bảng giá là bắt buộc"),
  responsible: z.string().optional(),
  includeVAT: z.boolean().default(false),
  vatRate: z.number().min(0).max(100).default(8),
  payment1: z.number().min(0).default(0),
  payment2: z.number().min(0).default(0)
});

type QuoteFormData = z.infer<typeof quoteFormSchema>;

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  cost_price: number | null;
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
  originalProductId?: string;
  description?: string;
  specifications?: string;
  discount?: number;
  selectedImage?: string;
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

export function CreateQuoteForm({
  onClose,
  onSubmit,
  initialData
}: CreateQuoteFormProps) {
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<QuoteItem[]>([]);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentEditingIndex, setCurrentEditingIndex] = useState<number>(-1);
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [currentImageEditingIndex, setCurrentImageEditingIndex] = useState<number>(-1);
  const [imageDialogOpen, setImageDialogOpen] = useState<{
    [key: number]: boolean;
  }>({});
  
  const [currentEditingIndex2, setCurrentEditingIndex2] = useState<number | null>(null);
  const [showProductSelection, setShowProductSelection] = useState(false);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  
  const {
    toast
  } = useToast();

  // Create new product states
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [createProductLoading, setCreateProductLoading] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductCostPrice, setNewProductCostPrice] = useState('');
  const [newProductSku, setNewProductSku] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductSpecifications, setNewProductSpecifications] = useState('');
  const [newProductInStock, setNewProductInStock] = useState(true);

  // Helper function to safely parse dates
  const parseDateString = (dateString: string | null | undefined): Date | undefined => {
    if (!dateString) return undefined;
    try {
      return new Date(dateString);
    } catch {
      return undefined;
    }
  };

  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      title: initialData?.title || "",
      quoteNumber: initialData?.quote_number || "",
      quoteDate: parseDateString(initialData?.quote_date) || new Date(),
      expiryDate: parseDateString(initialData?.expiry_date) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      customerName: initialData?.customer_name || "",
      phone: initialData?.customer_phone || "",
      email: initialData?.customer_email || "",
      address: initialData?.customer_address || "",
      priceList: initialData?.price_list || "",
      responsible: initialData?.responsible || "",
      includeVAT: initialData?.include_vat || false,
      vatRate: initialData?.vat_rate || 8,
      payment1: initialData?.payment_1 || 0,
      payment2: initialData?.payment_2 || 0
    }
  });

  // Watch form values for calculations
  const watchedValues = form.watch();
  
  // Use useProductSearch hook
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const searchResult = useProductSearch(products, debouncedSearchTerm);

  useEffect(() => {
    fetchPriceLists();
    fetchProducts();
    
    if (initialData?.quote_items) {
      const items = initialData.quote_items.map((item: any) => ({
        id: item.id || `${item.product_id}-${Date.now()}`,
        name: item.product_name || item.name,
        sku: item.product_sku || item.sku || '',
        price: item.unit_price || item.price || 0,
        quantity: item.quantity || 1,
        total: (item.unit_price || item.price || 0) * (item.quantity || 1),
        originalProductId: item.product_id,
        description: item.description || '',
        specifications: item.specifications || '',
        discount: item.discount || 0,
        selectedImage: item.selected_image || ''
      }));
      setSelectedProducts(items);
    }
  }, [initialData]);

  const fetchPriceLists = async () => {
    try {
      const { data, error } = await supabase
        .from('price_lists')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setPriceLists(data || []);
    } catch (error) {
      console.error('Error fetching price lists:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách bảng giá"
      });
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách sản phẩm"
      });
    }
  };

  const addProduct = () => {
    const newProduct: QuoteItem = {
      id: `new-${Date.now()}`,
      name: "",
      sku: "",
      price: 0,
      quantity: 1,
      total: 0,
      description: "",
      specifications: ""
    };
    setSelectedProducts([...selectedProducts, newProduct]);
  };

  const addRowAfter = (index: number) => {
    const newProduct: QuoteItem = {
      id: `new-${Date.now()}`,
      name: "",
      sku: "",
      price: 0,
      quantity: 1,
      total: 0,
      description: "",
      specifications: ""
    };
    
    const newProducts = [...selectedProducts];
    newProducts.splice(index + 1, 0, newProduct);
    setSelectedProducts(newProducts);
    
    toast({
      title: "Thành công",
      description: "Đã thêm dòng sản phẩm mới"
    });
  };

  const handleProductSelect = (product: Product, index: number) => {
    const newProducts = [...selectedProducts];
    newProducts[index] = {
      id: `${product.id}-${Date.now()}`,
      name: product.name,
      sku: product.sku || '',
      price: product.price || 0,
      quantity: newProducts[index]?.quantity || 1,
      total: (product.price || 0) * (newProducts[index]?.quantity || 1),
      originalProductId: product.id,
      description: product.description || '',
      specifications: product.specifications || ''
    };
    setSelectedProducts(newProducts);
    recalculateAllTotals();
  };

  const updateQuantity = (index: number, quantity: number) => {
    const newProducts = [...selectedProducts];
    newProducts[index] = {
      ...newProducts[index],
      quantity,
      total: newProducts[index].price * quantity
    };
    setSelectedProducts(newProducts);
  };

  const updatePrice = (index: number, price: number) => {
    const newProducts = [...selectedProducts];
    newProducts[index] = {
      ...newProducts[index],
      price,
      total: price * newProducts[index].quantity
    };
    setSelectedProducts(newProducts);
  };

  const updateDiscount = (index: number, discount: number) => {
    const newProducts = [...selectedProducts];
    const item = newProducts[index];
    const discountedPrice = item.price * (1 - discount / 100);
    newProducts[index] = {
      ...item,
      discount,
      total: discountedPrice * item.quantity
    };
    setSelectedProducts(newProducts);
  };

  const recalculateAllTotals = () => {
    setSelectedProducts(prev => prev.map(item => ({
      ...item,
      total: item.quantity * item.price
    })));
  };
  const removeProduct = (productId: string) => {
    setSelectedProducts(prev => prev.filter(item => item.id !== productId));
  };

  // React Beautiful DnD handler
  const handleOnDragEnd = (result: any) => {
    if (!result.destination) return;
    
    const items = Array.from(selectedProducts);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setSelectedProducts(items);
  };

  const handleImageSelect = (imageUrl: string, index: number) => {
    const newProducts = [...selectedProducts];
    newProducts[index] = {
      ...newProducts[index],
      selectedImage: imageUrl
    };
    setSelectedProducts(newProducts);
    
    // Close the image dialog for this row
    setImageDialogOpen(prev => ({
      ...prev,
      [index]: false
    }));
    
    toast({
      title: "Thành công",
      description: "Đã chọn hình ảnh cho sản phẩm"
    });
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateProductLoading(true);

    try {
      const { data, error } = await supabase
        .from('products')
        .insert([
          {
            name: newProductName,
            description: newProductDescription,
            price: parseFloat(newProductPrice) || 0,
            cost_price: parseFloat(newProductCostPrice) || 0,
            sku: newProductSku,
            category: newProductCategory,
            specifications: newProductSpecifications,
            in_stock: newProductInStock
          }
        ])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã tạo sản phẩm mới"
      });

      // Reset form
      setNewProductName('');
      setNewProductDescription('');
      setNewProductPrice('');
      setNewProductCostPrice('');
      setNewProductSku('');
      setNewProductCategory('');
      setNewProductSpecifications('');
      setNewProductInStock(true);
      
      // Refresh products list
      fetchProducts();
      
      // Close dialog
      setShowCreateProduct(false);
    } catch (error) {
      console.error('Error creating product:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tạo sản phẩm mới"
      });
    } finally {
      setCreateProductLoading(false);
    }
  };

  const handleSubmit = async (data: QuoteFormData) => {
    setIsLoading(true);
    try {
      const quoteData = {
        title: data.title,
        quote_number: data.quoteNumber,
        quote_date: data.quoteDate.toISOString(),
        expiry_date: data.expiryDate.toISOString(),
        customer_name: data.customerName,
        customer_phone: data.phone,
        customer_email: data.email,
        customer_address: data.address,
        price_list: data.priceList,
        responsible: data.responsible,
        include_vat: data.includeVAT,
        vat_rate: data.vatRate,
        payment_1: data.payment1,
        payment_2: data.payment2,
        subtotal: subtotal,
        vat_amount: vatAmount,
        total: total,
        status: 'draft'
      };

      let quoteId: string;

      if (initialData?.id) {
        // Update existing quote
        const { data: updatedQuote, error: quoteError } = await supabase
          .from('quotes')
          .update(quoteData)
          .eq('id', initialData.id)
          .select()
          .single();

        if (quoteError) throw quoteError;
        quoteId = updatedQuote.id;

        // Delete existing quote items
        await supabase
          .from('quote_items' as any)
          .delete()
          .eq('quote_id', quoteId);
      } else {
        // Create new quote
        const { data: newQuote, error: quoteError } = await supabase
          .from('quotes')
          .insert([quoteData])
          .select()
          .single();

        if (quoteError) throw quoteError;
        quoteId = newQuote.id;
      }

      // Insert quote items
      if (selectedProducts.length > 0) {
        const quoteItems = selectedProducts.map(item => ({
          quote_id: quoteId,
          product_id: item.originalProductId,
          product_name: item.name,
          product_sku: item.sku,
          unit_price: item.price,
          quantity: item.quantity,
          total: item.total,
          description: item.description,
          specifications: item.specifications,
          discount: item.discount || 0,
          selected_image: item.selectedImage
        }));

        const { error: itemsError } = await supabase
          .from('quote_items' as any)
          .insert(quoteItems as any);

        if (itemsError) throw itemsError;
      }

      toast({
        title: "Thành công",
        description: initialData ? "Đã cập nhật báo giá" : "Đã tạo báo giá mới"
      });

      onSubmit?.();
      onClose?.();
    } catch (error) {
      console.error('Error saving quote:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể lưu báo giá"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate totals
  const rawSubtotal = selectedProducts.reduce((sum, item) => {
    const itemPrice = item.discount ? item.price * (1 - item.discount / 100) : item.price;
    return sum + (itemPrice * item.quantity);
  }, 0);
  
  const subtotal = Math.round(rawSubtotal);
  const vatAmount = watchedValues.includeVAT ? Math.round(subtotal * (watchedValues.vatRate / 100)) : 0;
  const total = subtotal + vatAmount;
  const remaining = total - (watchedValues.payment1 || 0) - (watchedValues.payment2 || 0);

  // Debug function
  const debugQuoteCalculation = () => {
    console.log('=== QUOTE CALCULATION DEBUG ===');
    console.log('Selected Products:', selectedProducts.map(item => ({
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      discount: item.discount,
      total: item.total
    })));
    console.log('Raw Subtotal:', rawSubtotal);
    console.log('Rounded Subtotal:', subtotal);
    console.log('VAT Amount:', vatAmount);
    console.log('Total:', total);
    console.log('Include VAT:', watchedValues.includeVAT);
    console.log('VAT Rate:', watchedValues.vatRate);
  };

  // Call this when form is submitted
  console.log('Quote summary for submission:', {
    items: selectedProducts.map(p => ({
      name: p.name,
      sku: p.sku,
      price: p.price,
      quantity: p.quantity,
      discount: p.discount,
      total: p.total
    })),
    rawSubtotal,
    subtotal,
    vatAmount,
    total,
    includeVAT: watchedValues.includeVAT,
    vatRate: watchedValues.vatRate
  });

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tiêu đề báo giá *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Nhập tiêu đề báo giá" />
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
                        <FormLabel>Số báo giá *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="VD: BG-001" />
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
                        <FormLabel>Ngày báo giá *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? format(field.value, "dd/MM/yyyy") : <span>Chọn ngày</span>}
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
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expiryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ngày hết hạn *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? format(field.value, "dd/MM/yyyy") : <span>Chọn ngày</span>}
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
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tên khách hàng *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Nhập tên khách hàng" />
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
                          <Input {...field} placeholder="Nhập số điện thoại" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="Nhập email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Địa chỉ</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Nhập địa chỉ" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="priceList"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bảng giá *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Chọn bảng giá" />
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
                          <FormControl>
                            <Input {...field} placeholder="Nhập tên người phụ trách" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Danh sách sản phẩm */}
            <Card>
              <CardHeader className="bg-green-50">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-green-700">Danh sách sản phẩm</CardTitle>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={addProduct}>
                      <Plus className="h-4 w-4 mr-2" />
                      Thêm sản phẩm
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowCreateProduct(true)}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Tạo sản phẩm mới
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="w-full border-collapse border border-gray-200">
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-bold text-base w-32 min-w-32">Chọn sản phẩm</TableHead>
                        <TableHead className="font-bold text-base w-48 min-w-48">Tên sản phẩm</TableHead>
                        <TableHead className="font-bold text-base w-20 min-w-20">Hình ảnh</TableHead>
                        <TableHead className="font-bold text-base w-40 min-w-40">Mô tả sản phẩm</TableHead>
                        <TableHead className="font-bold text-base w-32 min-w-32">Quy cách</TableHead>
                        <TableHead className="font-bold text-base text-right w-28 min-w-28">Đơn giá</TableHead>
                        <TableHead className="font-bold text-base text-center w-24 min-w-24">Số lượng</TableHead>
                        <TableHead className="font-bold text-base text-right w-32 min-w-32">Thành tiền</TableHead>
                        <TableHead className="font-bold text-base text-center w-20 min-w-20">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <DragDropContext onDragEnd={handleOnDragEnd}>
                      <Droppable droppableId="products">
                        {(provided) => (
                          <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                            {selectedProducts.map((item, index) => (
                              <Draggable key={item.id} draggableId={item.id} index={index}>
                                {(provided, snapshot) => (
                                  <TableRow 
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`h-24 border border-gray-200 relative ${snapshot.isDragging ? 'opacity-75 bg-blue-50 shadow-lg' : 'hover:bg-gray-50'}`}
                                    onMouseEnter={() => setHoveredRowIndex(index)}
                                    onMouseLeave={() => setHoveredRowIndex(null)}
                                  >
                                    {/* Add Row Button - appears on hover at end of row */}
                                    {hoveredRowIndex === index && (
                                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-8 w-8 p-0 rounded-full bg-green-500 hover:bg-green-600 text-white border-green-500 shadow-lg"
                                          onClick={() => addRowAfter(index)}
                                        >
                                          <Plus className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )}
                           
                                    <TableCell className="w-32 min-w-32 p-4">
                                      <Dialog>
                                        <DialogTrigger asChild>
                                          <Button variant="outline" className="w-full h-12 text-left justify-start gap-2 border-2 border-dashed border-blue-300 bg-blue-50" onClick={() => setCurrentEditingIndex2(index)}>
                                            <Search className="h-4 w-4 text-blue-600" />
                                            <span className="text-blue-600">
                                              {item.sku ? item.sku : item.name ? `${item.name.substring(0, 15)}...` : 'Chọn sản phẩm từ danh sách'}
                                            </span>
                                          </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-y-auto w-full">
                                          <DialogHeader>
                                            <DialogTitle className="flex items-center gap-2">
                                              <Search className="h-5 w-5" />
                                              Chọn sản phẩm từ danh sách
                                            </DialogTitle>
                                          </DialogHeader>
                                          <div className="space-y-4">
                                            {/* Search Input */}
                                            <div className="relative">
                                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                                              <Input placeholder="Tìm kiếm theo tên, mã sản phẩm..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-12 text-base border-2 focus:border-blue-500" />
                                            </div>
                                            
                                            {/* Search Results Summary */}
                                            {debouncedSearchTerm && (
                                              <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-md">
                                                <p className="text-sm text-blue-700">
                                                  Tìm thấy <strong>{searchResult.resultCount}</strong> sản phẩm cho "{debouncedSearchTerm}"
                                                </p>
                                              </div>
                                            )}

                                            {/* Products List */}
                                            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                                              {Object.entries(searchResult.groupedResults).map(([category, categoryProducts]) => (
                                                <div key={category} className="space-y-2">
                                                  <div className="sticky top-0 bg-blue-100 px-3 py-2 rounded-md border-l-4 border-blue-500 z-10">
                                                    <h4 className="font-semibold text-blue-800 text-sm flex items-center gap-2">
                                                      <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                                                        {categoryProducts.length}
                                                      </span>
                                                      {category}
                                                    </h4>
                                                  </div>
                                                  <div className="space-y-1 pl-2">
                                                    {categoryProducts.map(product => (
                                                      <Card key={product.id} className="cursor-pointer hover:shadow-md transition-all border hover:border-blue-300 hover:bg-blue-50" onClick={() => {
                                                        console.log('Selected product data:', product);
                                                        const newProducts = [...selectedProducts];
                                                        newProducts[index] = {
                                                          id: `${product.id}-${Date.now()}-${Math.random()}`,
                                                          name: product.name,
                                                          sku: product.sku || '',
                                                          price: product.price || 0,
                                                          quantity: item.quantity,
                                                          total: (product.price || 0) * item.quantity,
                                                          originalProductId: product.id,
                                                          description: product.description || '',
                                                          specifications: product.specifications || ''
                                                        };
                                                        console.log('New product item:', newProducts[index]);
                                                        setSelectedProducts(newProducts);
                                                        setSearchTerm("");
                                                        toast({
                                                          title: "Thành công",
                                                          description: `Đã chọn ${product.name}`
                                                        });
                                                      }}>
                                                        <CardContent className="p-3">
                                                          <div className="flex items-center justify-between">
                                                            <div className="flex-1">
                                                              <div className="flex items-center gap-4">
                                                                <div className="min-w-0 flex-1">
                                                                  <div className="flex items-center gap-2 mb-1">
                                                                    <h3 className="font-bold text-blue-800 text-sm">
                                                                      {product.sku || 'NO-SKU'}
                                                                    </h3>
                                                                  </div>
                                                                  <p className="text-gray-700 font-medium text-sm truncate">
                                                                    {product.name}
                                                                  </p>
                                                                  {(product.description || product.specifications) && (
                                                                    <p className="text-gray-500 text-xs mt-1 line-clamp-2">
                                                                      {product.description || product.specifications || ''}
                                                                    </p>
                                                                  )}
                                                                </div>
                                                                <div className="text-right">
                                                                  <p className="text-green-600 font-bold text-sm">{(product.price || 0).toLocaleString()}đ</p>
                                                                </div>
                                                              </div>
                                                            </div>
                                                          </div>
                                                        </CardContent>
                                                      </Card>
                                                    ))}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                            
                                            {searchResult.resultCount === 0 && debouncedSearchTerm && (
                                              <div className="text-center py-8 text-gray-500">
                                                <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                                <p>Không tìm thấy sản phẩm nào với từ khóa "{debouncedSearchTerm}"</p>
                                                <p className="text-xs mt-2">Hãy thử tìm kiếm với từ khóa khác hoặc kiểm tra chính tả</p>
                                              </div>
                                            )}
                                          </div>
                                        </DialogContent>
                                      </Dialog>
                                    </TableCell>
                                    <TableCell className="w-48 min-w-48 p-2">
                                      <Textarea value={item.name} onChange={e => {
                                        const newProducts = [...selectedProducts];
                                        newProducts[index] = {
                                          ...item,
                                          name: e.target.value
                                        };
                                        setSelectedProducts(newProducts);
                                      }} placeholder="Tên sản phẩm" className="border-gray-200 focus:border-blue-500 font-medium text-sm w-full min-h-[2.5rem] resize-none" rows={2} />
                                    </TableCell>
                                    <TableCell className="w-20 min-w-20 p-2">
                                      <Dialog open={imageDialogOpen[index] || false} onOpenChange={open => {
                                        setImageDialogOpen(prev => ({
                                          ...prev,
                                          [index]: open
                                        }));
                                      }}>
                                        <DialogTrigger asChild>
                                          <Button variant="outline" size="sm" className="h-12 w-16 border-2 border-dashed border-gray-300 hover:border-blue-500 flex flex-col items-center justify-center gap-1" type="button">
                                            {item.selectedImage ? (
                                              <img src={item.selectedImage} alt="Selected" className="w-12 h-12 object-cover rounded" />
                                            ) : (
                                              <>
                                                <Image className="h-4 w-4 text-gray-400" />
                                                <span className="text-xs text-gray-500">Chọn ảnh</span>
                                              </>
                                            )}
                                          </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
                                          <DialogHeader>
                                            <DialogTitle>Chọn hình ảnh sản phẩm</DialogTitle>
                                          </DialogHeader>
                                          <div className="overflow-y-auto max-h-[70vh]">
                                             <ProductImageLibrary
                                               onSelectImage={(imageUrl) => handleImageSelect(imageUrl, index)}
                                               hideDeleteButton={true}
                                             />
                                          </div>
                                        </DialogContent>
                                      </Dialog>
                                    </TableCell>
                                    <TableCell className="w-40 min-w-40 p-2">
                                      <Textarea value={item.description || ''} onChange={e => {
                                        const newProducts = [...selectedProducts];
                                        newProducts[index] = {
                                          ...item,
                                          description: e.target.value
                                        };
                                        setSelectedProducts(newProducts);
                                      }} placeholder="Mô tả sản phẩm" className="border-gray-200 focus:border-blue-500 text-sm w-full min-h-[2.5rem] resize-none" rows={2} />
                                    </TableCell>
                                    <TableCell className="w-32 min-w-32 p-2">
                                      <Textarea value={item.specifications || ''} onChange={e => {
                                        const newProducts = [...selectedProducts];
                                        newProducts[index] = {
                                          ...item,
                                          specifications: e.target.value
                                        };
                                        setSelectedProducts(newProducts);
                                      }} placeholder="Quy cách" className="border-gray-200 focus:border-blue-500 text-sm w-full min-h-[2.5rem] resize-none" rows={2} />
                                    </TableCell>
                                    <TableCell className="w-28 min-w-28 p-2">
                                      <Input
                                        type="number"
                                        value={item.price} 
                                        onChange={(e) => {
                                          const numericValue = parseFloat(e.target.value) || 0;
                                          updatePrice(index, numericValue);
                                        }} 
                                        placeholder="0"
                                        className="border-gray-200 focus:border-blue-500 text-right text-sm w-full h-10"
                                      />
                                    </TableCell>
                                    <TableCell className="w-24 min-w-24 p-2">
                                      <Input
                                        type="number"
                                        min="1"
                                        value={item.quantity}
                                        onChange={e => updateQuantity(index, parseInt(e.target.value) || 1)}
                                        className="border-gray-200 focus:border-blue-500 text-center text-sm w-full h-10"
                                      />
                                    </TableCell>
                                    <TableCell className="w-32 min-w-32 p-2 text-right">
                                      <div className="font-semibold text-green-600 text-sm">
                                        {item.total.toLocaleString()}đ
                                      </div>
                                    </TableCell>
                                    <TableCell className="w-20 min-w-20 p-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeProduct(item.id)}
                                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                            {selectedProducts.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                  Chưa có sản phẩm nào. Nhấn "Thêm sản phẩm" để bắt đầu.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        )}
                      </Droppable>
                    </DragDropContext>
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
                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
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
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
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
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
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
                    <span className="text-blue-600 font-bold">{subtotal.toLocaleString()}đ</span>
                  </div>
                  {watchedValues.includeVAT && (
                    <>
                      <div className="flex justify-between text-sm font-medium">
                        <span>GTGT ({watchedValues.vatRate}%):</span>
                        <span className="text-orange-600">{vatAmount.toLocaleString()}đ</span>
                      </div>
                      <div className="flex justify-between text-sm font-medium">
                        <span>TỔNG TIỀN ĐÃ BAO GỒM GTGT:</span>
                        <span className="text-green-600 font-bold">{total.toLocaleString()}đ</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm font-medium">
                    <span>THANH TOÁN LẦN 1:</span>
                    <span className="text-purple-600">{(watchedValues.payment1 || 0).toLocaleString()}đ</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium text-red-600">
                    <span>CÒN LẠI:</span>
                    <span className="font-bold">{remaining.toLocaleString()}đ</span>
                  </div>
                  
                  {/* Debug button */}
                  <div className="pt-2 border-t">
                    <Button type="button" variant="outline" size="sm" onClick={recalculateAllTotals} className="w-full text-xs">
                      🔄 Tính lại tổng tiền
                    </Button>
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

      {/* Create New Product Dialog */}
      <Dialog open={showCreateProduct} onOpenChange={setShowCreateProduct}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Tạo sản phẩm mới
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newSku">Mã SP *</Label>
                <Input id="newSku" value={newProductSku} onChange={e => setNewProductSku(e.target.value)} placeholder="VD: SP001" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newName">Tên sản phẩm *</Label>
                <Input id="newName" value={newProductName} onChange={e => setNewProductName(e.target.value)} required placeholder="Tên sản phẩm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newCategory">Danh mục</Label>
                <Input id="newCategory" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} placeholder="Danh mục" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newSpecifications">Quy cách</Label>
                <Input id="newSpecifications" value={newProductSpecifications} onChange={e => setNewProductSpecifications(e.target.value)} placeholder="Quy cách" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newCostPrice">Giá gốc (VND)</Label>
                <Input id="newCostPrice" type="number" step="1000" value={newProductCostPrice} onChange={e => setNewProductCostPrice(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPrice">Giá bán (VND)</Label>
                <Input id="newPrice" type="number" step="1000" value={newProductPrice} onChange={e => setNewProductPrice(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newInStock">Tình trạng</Label>
                <div className="flex items-center space-x-2 h-10">
                  <Switch id="newInStock" checked={newProductInStock} onCheckedChange={setNewProductInStock} />
                  <Label htmlFor="newInStock" className="text-sm">
                    {newProductInStock ? 'Còn hàng' : 'Hết hàng'}
                  </Label>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newDescription">Mô tả</Label>
              <Textarea id="newDescription" value={newProductDescription} onChange={e => setNewProductDescription(e.target.value)} rows={2} placeholder="Mô tả chi tiết sản phẩm..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateProduct(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={createProductLoading}>
                {createProductLoading ? 'Đang tạo...' : 'Tạo sản phẩm'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}