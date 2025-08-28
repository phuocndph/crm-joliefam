import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Settings, X, Plus, Trash2, Search, Image, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "react-beautiful-dnd";
import { ProductSelectionForm } from './ProductSelectionForm';
import ProductImageLibrary from './ProductImageLibrary';
import { AssigneeManagement } from './AssigneeManagement';
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
  manager_id: string | null;
  tenant_id: string;
  price_list_id: string | null;
  created_at: string;
  updated_at: string;
}

interface QuoteItem {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  total: number;
  description?: string;
  specifications?: string;
  selectedImage?: string; // URL của hình ảnh đã chọn
  originalProductId?: string; // Reference to original product ID
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
  
  // Drag and drop functionality
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(selectedProducts);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setSelectedProducts(items);
  };
  
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
  const parseDate = (dateString: string | Date): Date => {
    if (!dateString) {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    if (dateString instanceof Date) {
      return dateString;
    }

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
    // Extract from notes format (Ngày hết hạn: dd/MM/yyyy)
    () => {
      const match = dateString.match(/Ngày hết hạn:\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (match) {
        const parts = match[1].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (parts) {
          return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
        }
      }
      return null;
    }];
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
      expiryDate: initialData ? parseDate(initialData.expiryDate || initialData.notes) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      customerName: initialData?.customerName || "",
      phone: initialData?.customerPhone || "",
      email: initialData?.customerEmail || "",
      address: initialData?.customerAddress || "",
      priceList: initialData?.price_list_id || "",
      responsible: initialData?.assignee_id || "",
      includeVAT: initialData?.include_vat || false,
      vatRate: initialData?.vat_rate || 8,
      payment1: (() => {
        if (initialData?.quote_data) {
          try {
            const quoteData = typeof initialData.quote_data === 'string' ? JSON.parse(initialData.quote_data) : initialData.quote_data;
            return quoteData.payment1 || 0;
          } catch {
            return 0;
          }
        }
        return 0;
      })(),
      payment2: (() => {
        if (initialData?.quote_data) {
          try {
            const quoteData = typeof initialData.quote_data === 'string' ? JSON.parse(initialData.quote_data) : initialData.quote_data;
            return quoteData.payment2 || 0;
          } catch {
            return 0;
          }
        }
        return 0;
      })()
    }
  });

  // Debounce search term for better performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Use the enhanced search utilities
  const searchResult = useProductSearch(products, debouncedSearchTerm);

  // Load price lists and products
  useEffect(() => {
    loadPriceLists();
  }, []);

  // Update form when initialData changes
  useEffect(() => {
    console.log('CreateQuoteForm useEffect triggered with initialData:', initialData);
    if (initialData) {
      try {
        console.log('Processing initialData:', initialData);
        // Parse items
        const items = typeof initialData.items === 'string' ? JSON.parse(initialData.items) : initialData.items || [];
        console.log('Parsed items:', items, 'items length:', items.length);
        
        // Ensure each item has unique ID and required fields for editing
        const processedItems = items.map((item: any) => ({
          ...item,
          id: item.id || `${item.originalProductId || item.id}-${Date.now()}-${Math.random()}`, // Ensure unique ID
          originalProductId: item.originalProductId || item.id, // Keep reference to original product
          description: item.description || '',
          specifications: item.specifications || ''
        }));
        
        console.log('Processed items for selectedProducts:', processedItems);
        setSelectedProducts(processedItems);

        // Parse quote_data for payment info
        let paymentData = {
          payment1: 0,
          payment2: 0
        };
        if (initialData.quote_data) {
          try {
            const quoteData = typeof initialData.quote_data === 'string' ? JSON.parse(initialData.quote_data) : initialData.quote_data;
            paymentData = {
              payment1: quoteData.payment1 || 0,
              payment2: quoteData.payment2 || 0
            };
          } catch (error) {
            console.error('Error parsing quote_data:', error);
          }
        }

        // Reset form with new data
        form.reset({
          title: initialData.title || "BẢNG BÁO GIÁ",
          quoteNumber: initialData.quote_number || `BG-${format(new Date(), "yyyyMMdd")}-${Math.floor(Math.random() * 1000)}`,
          quoteDate: initialData.created_at ? new Date(initialData.created_at) : new Date(),
          expiryDate: parseDate(initialData.expiryDate || initialData.notes),
          customerName: initialData.customerName || "",
          phone: initialData.customerPhone || "",
          email: initialData.customerEmail || "",
          address: initialData.customerAddress || "",
          priceList: initialData.price_list_id || "",
          responsible: initialData.assignee_id || "",
          includeVAT: initialData.include_vat || false,
          vatRate: initialData.vat_rate || 8,
          payment1: paymentData.payment1,
          payment2: paymentData.payment2
        });
      } catch (error) {
        console.error('Error parsing initial data:', error);
      }
    }
  }, [initialData, form]);

  useEffect(() => {
    const selectedPriceList = form.watch("priceList");
    if (selectedPriceList) {
      loadProducts(selectedPriceList);
    } else {
      // Clear products if no price list is selected, but don't clear selectedProducts when editing
      setProducts([]);
      // Only clear selectedProducts if we're not editing an existing quote
      if (!initialData) {
        setSelectedProducts([]);
      }
    }
  }, [form.watch("priceList"), initialData]);

  // Filter selected products when products change - but don't filter when editing existing quote
  useEffect(() => {
    console.log('Products filter useEffect triggered, products.length:', products.length, 'selectedProducts.length:', selectedProducts.length, 'initialData:', !!initialData);
    if (products.length > 0 && !initialData) {
      // Only filter when creating new quotes, not when editing existing ones
      setSelectedProducts(prevSelected => {
        const filtered = prevSelected.filter(selectedItem => 
          products.some(product => product.id === (selectedItem.originalProductId || selectedItem.id))
        );
        console.log('Filtered selectedProducts from', prevSelected.length, 'to', filtered.length);
        return filtered;
      });
    }
  }, [products, initialData]);

  const loadPriceLists = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("price_lists").select("*").eq("status", "active").order("year", {
        ascending: false
      });
      if (error) throw error;
      setPriceLists(data || []);
    } catch (error) {
      console.error("Error loading price lists:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách bảng giá",
        variant: "destructive"
      });
    }
  };

  const loadProducts = async (priceListId: string) => {
    try {
      const {
        data,
        error
      } = await supabase.from("products").select("*").eq("price_list_id", priceListId).eq("in_stock", true).order("name");
      if (error) throw error;

      // Explicit typing and debugging
      const products = data as unknown as Product[] || [];
      console.log('Loaded products with descriptions:', products.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description
      })));
      setProducts(products);
    } catch (error) {
      console.error("Error loading products:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách sản phẩm",
        variant: "destructive"
      });
    }
  };

  const addProduct = (product: Product) => {
    // Always create a new item with unique ID to allow multiple instances of same product
    const newItem: QuoteItem = {
      id: `${product.id}-${Date.now()}-${Math.random()}`, // Create unique ID for each instance
      name: product.name,
      sku: product.sku || '',
      price: product.price || 0,
      quantity: 1,
      total: product.price || 0,
      originalProductId: product.id, // Keep reference to original product
      description: product.description || '',
      specifications: product.specifications || ''
    };
    setSelectedProducts(prev => [...prev, newItem]);
    setShowProductDialog(false);
  };
  
  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeProduct(productId);
      return;
    }
    setSelectedProducts(prev => prev.map(item => {
      if (item.id === productId) {
        return {
          ...item,
          quantity,
          total: quantity * item.price
        };
      }
      return item;
    }));
  };

  // Function to update price
  const updatePrice = (productId: string, price: number) => {
    setSelectedProducts(prev => prev.map(item => {
      if (item.id === productId) {
        return {
          ...item,
          price,
          total: item.quantity * price
        };
      }
      return item;
    }));
  };

  // Function to recalculate all totals to fix any inconsistencies
  const recalculateAllTotals = () => {
    setSelectedProducts(prev => prev.map(item => ({
      ...item,
      total: item.quantity * item.price
    })));
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts(prev => prev.filter(item => item.id !== productId));
  };

  // Handle creating new product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập tên sản phẩm",
        variant: "destructive"
      });
      return;
    }
    const selectedPriceList = watchedValues.priceList;
    if (!selectedPriceList) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn bảng giá trong form báo giá trước",
        variant: "destructive"
      });
      return;
    }
    setCreateProductLoading(true);
    try {
      const {
        data,
        error
      } = await supabase.from('products').insert({
        name: newProductName,
        description: newProductDescription || null,
        price: newProductPrice ? parseFloat(newProductPrice) : null,
        cost_price: newProductCostPrice ? parseFloat(newProductCostPrice) : null,
        sku: newProductSku || null,
        category: newProductCategory || null,
        specifications: newProductSpecifications || null,
        in_stock: newProductInStock,
        price_list_id: selectedPriceList
      }).select().single();
      if (error) throw error;
      toast({
        title: "Thành công",
        description: "Đã tạo sản phẩm thành công"
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
      setShowCreateProduct(false);

      // Add the new product to the list and select it
      const newProduct = data as Product;
      setProducts(prev => [...prev, newProduct]);
      addProduct(newProduct);
    } catch (error: any) {
      console.error('Error creating product:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tạo sản phẩm",
        variant: "destructive"
      });
    } finally {
      setCreateProductLoading(false);
    }
  };

  const handleSubmit = async (formData: QuoteFormData) => {
    if (selectedProducts.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một sản phẩm",
        variant: "destructive"
      });
      return;
    }
    setIsLoading(true);
    try {
      // Prepare quote data
      const quoteData = {
        title: formData.title,
        quote_number: formData.quoteNumber,
        customerName: formData.customerName,
        customerPhone: formData.phone,
        customerEmail: formData.email,
        customerAddress: formData.address,
        created_at: formData.quoteDate.toISOString(),
        expiryDate: formData.expiryDate ? format(formData.expiryDate, 'dd/MM/yyyy') : '',
        notes: `Ngày hết hạn: ${format(formData.expiryDate, 'dd/MM/yyyy')}`,
        price_list_id: formData.priceList,
        assignee_id: formData.responsible || null,
        include_vat: formData.includeVAT,
        vat_rate: formData.vatRate,
        items: JSON.stringify(selectedProducts.map(item => ({
          id: item.id,
          originalProductId: item.originalProductId,
          name: item.name,
          sku: item.sku,
          price: item.price,
          quantity: item.quantity,
          total: item.total,
          description: item.description,
          specifications: item.specifications,
          selectedImage: item.selectedImage
        }))),
        quote_data: JSON.stringify({
          payment1: formData.payment1,
          payment2: formData.payment2,
          includeVAT: formData.includeVAT,
          vatRate: formData.vatRate
        })
      };

      let result;
      if (initialData) {
        // Update existing quote
        const { data, error } = await supabase
          .from('quotes')
          .update(quoteData)
          .eq('id', initialData.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
        toast({
          title: "Thành công",
          description: "Báo giá đã được cập nhật thành công"
        });
      } else {
        // Create new quote
        const { data, error } = await supabase
          .from('quotes')
          .insert([quoteData])
          .select()
          .single();
        if (error) throw error;
        result = data;
        toast({
          title: "Thành công",
          description: "Báo giá đã được tạo thành công"
        });
      }

      onSubmit?.();
      onClose?.();
    } catch (error: any) {
      console.error('Error saving quote:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể lưu báo giá",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate totals
  const watchedValues = form.watch();
  const subtotal = selectedProducts.reduce((sum, item) => sum + item.total, 0);
  const vatAmount = watchedValues.includeVAT ? subtotal * (watchedValues.vatRate / 100) : 0;
  const total = subtotal + vatAmount;
  const remaining = total - (watchedValues.payment1 || 0) - (watchedValues.payment2 || 0);

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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="title" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Tiêu đề báo giá <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="BẢNG BÁO GIÁ" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="quoteNumber" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Số báo giá <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={`BG-${format(new Date(), "yyyyMMdd")}-001`} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="quoteDate" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Ngày báo giá <span className="text-red-500">*</span></FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                              {field.value ? format(field.value, "dd/MM/yyyy") : <span>Chọn ngày</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="expiryDate" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Ngày hết hạn <span className="text-red-500">*</span></FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                              {field.value ? format(field.value, "dd/MM/yyyy") : <span>Chọn ngày</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={date => date < new Date()} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="priceList" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Bảng giá <span className="text-red-500">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Bảng Báo Giá Tháng 6 (2025)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {priceLists.map(priceList => (
                            <SelectItem key={priceList.id} value={priceList.id}>
                              {priceList.name} ({priceList.year})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="responsible" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Người phụ trách</FormLabel>
                      <AssigneeManagement value={field.value} onChange={field.onChange} placeholder="Chọn người phụ trách" />
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="customerName" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Tên khách hàng <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nhập tên khách hàng" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="phone" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Số điện thoại</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nhập số điện thoại" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="email" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="Nhập email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="address" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Địa chỉ</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Nhập địa chỉ" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            {/* Danh sách sản phẩm */}
            <Card>
              <CardHeader className="bg-green-50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-green-700">Danh sách sản phẩm</CardTitle>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateProduct(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Tạo sản phẩm mới
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowProductDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Thêm sản phẩm
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="w-full border-collapse border border-gray-200">
                    <TableHeader>
                      <TableRow className="bg-gray-50 border-b-2 border-gray-200">
                        <TableHead className="font-bold text-center w-16 min-w-16 text-gray-700">STT</TableHead>
                        <TableHead className="font-bold text-center w-32 min-w-32 text-gray-700">Chọn sản phẩm</TableHead>
                        <TableHead className="font-bold w-48 min-w-48 text-gray-700">Tên sản phẩm</TableHead>
                        <TableHead className="font-bold text-center w-20 min-w-20 text-gray-700">Hình ảnh</TableHead>
                        <TableHead className="font-bold w-40 min-w-40 text-gray-700">Mô tả sản phẩm</TableHead>
                        <TableHead className="font-bold w-32 min-w-32 text-gray-700">Quy cách</TableHead>
                        <TableHead className="font-bold text-right w-28 min-w-28 text-gray-700">Đơn giá</TableHead>
                        <TableHead className="font-bold text-center w-24 min-w-24 text-gray-700">Số lượng</TableHead>
                        <TableHead className="font-bold text-right w-32 min-w-32 text-gray-700">Thành tiền</TableHead>
                        <TableHead className="font-bold text-center w-20 min-w-20 text-gray-700">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <DragDropContext onDragEnd={handleDragEnd}>
                      <Droppable droppableId="products">
                        {(provided, snapshot) => (
                          <TableBody 
                            {...provided.droppableProps} 
                            ref={provided.innerRef}
                            className={snapshot.isDraggingOver ? "bg-accent/20" : ""}
                          >
                            {selectedProducts.map((item, index) => (
                              <Draggable key={item.id} draggableId={item.id} index={index}>
                                {(provided, snapshot) => (
                                  <TableRow 
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className={cn(
                                      "h-20 border-b hover:bg-accent/20",
                                      snapshot.isDragging && "bg-card shadow-md border-primary/20 z-50"
                                    )}
                                    style={provided.draggableProps.style}
                                  >
                                    <TableCell className="w-16 min-w-16 p-3 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        <div 
                                          {...provided.dragHandleProps}
                                          className="cursor-grab active:cursor-grabbing p-2 rounded hover:bg-accent/30"
                                        >
                                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <span className="text-sm font-medium text-muted-foreground/70 min-w-[1.5rem]">
                                          {index + 1}
                                        </span>
                                      </div>
                                    </TableCell>

                                    <TableCell className="w-32 min-w-32 p-2 text-center">
                                      <Dialog>
                                        <DialogTrigger asChild>
                                          <Button variant="outline" size="sm" className="h-12 w-28 border-2 border-dashed border-blue-300 hover:border-blue-500 text-blue-600 hover:bg-blue-50 flex flex-col items-center justify-center gap-1" type="button">
                                            <Plus className="h-4 w-4" />
                                            <span className="text-xs">Đổi SP</span>
                                          </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                                          <DialogHeader>
                                            <DialogTitle className="flex items-center gap-2">
                                              <Search className="h-5 w-5" />
                                              Chọn sản phẩm thay thế
                                            </DialogTitle>
                                          </DialogHeader>
                                          <div className="space-y-4">
                                            <div className="relative">
                                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                                              <Input
                                                placeholder="Tìm kiếm sản phẩm theo tên, mô tả, SKU, quy cách..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="pl-10"
                                              />
                                            </div>
                                            
            <ProductSelectionForm 
              products={searchResult.results} 
              onAddProduct={(product) => {
                const newProducts = [...selectedProducts];
                newProducts[index] = {
                  ...newProducts[index],
                  ...product,
                  id: `${product.id}-${Date.now()}-${Math.random()}`,
                  originalProductId: product.id,
                  quantity: newProducts[index].quantity,
                  total: newProducts[index].quantity * (product.price || 0),
                  name: product.name,
                  sku: product.sku || '',
                  price: product.price || 0,
                  description: product.description || '',
                  specifications: product.specifications || ''
                };
                setSelectedProducts(newProducts);
              }} 
            />
                                            
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
                                      <Textarea 
                                        value={item.name} 
                                        onChange={e => {
                                          const newProducts = [...selectedProducts];
                                          newProducts[index] = {
                                            ...item,
                                            name: e.target.value
                                          };
                                          setSelectedProducts(newProducts);
                                        }} 
                                        placeholder="Tên sản phẩm" 
                                        className="border-gray-200 focus:border-blue-500 font-medium text-sm w-full min-h-[2.5rem] resize-none" 
                                        rows={2} 
                                      />
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
                                          <div className="h-[70vh] overflow-y-auto">
                                            <ProductImageLibrary 
                                              hideDeleteButton={true} 
                                              onSelectImage={imageUrl => {
                                                const newProducts = [...selectedProducts];
                                                newProducts[index] = {
                                                  ...newProducts[index],
                                                  selectedImage: imageUrl
                                                };
                                                setSelectedProducts(newProducts);

                                                // Đóng dialog ngay lập tức
                                                setImageDialogOpen(prev => ({
                                                  ...prev,
                                                  [index]: false
                                                }));
                                                toast({
                                                  title: "Thành công",
                                                  description: "Đã chọn hình ảnh cho sản phẩm"
                                                });
                                              }} 
                                            />
                                          </div>
                                        </DialogContent>
                                      </Dialog>
                                    </TableCell>

                                    <TableCell className="w-40 min-w-40 p-2">
                                      <div className="flex items-start space-x-1">
                                        <Textarea 
                                          value={item.description || ''} 
                                          onChange={e => {
                                            const newProducts = [...selectedProducts];
                                            newProducts[index] = {
                                              ...item,
                                              description: e.target.value
                                            };
                                            setSelectedProducts(newProducts);
                                          }} 
                                          placeholder="Mô tả sản phẩm" 
                                          className="border-gray-200 focus:border-blue-500 flex-1 min-h-[2.5rem] resize-none" 
                                          rows={2} 
                                        />
                                        <Dialog>
                                          <DialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-50 p-2" title="Chỉnh sửa mô tả chi tiết">
                                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                                <path d="M12 20h9" />
                                                <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
                                              </svg>
                                            </Button>
                                          </DialogTrigger>
                                          <DialogContent className="sm:max-w-md">
                                            <DialogHeader>
                                              <DialogTitle>Chỉnh sửa mô tả sản phẩm</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-4">
                                              <div>
                                                <Label htmlFor={`description-${index}`}>Mô tả chi tiết</Label>
                                                <Textarea 
                                                  id={`description-${index}`} 
                                                  value={item.description || ''} 
                                                  onChange={e => {
                                                    const newProducts = [...selectedProducts];
                                                    newProducts[index] = {
                                                      ...item,
                                                      description: e.target.value
                                                    };
                                                    setSelectedProducts(newProducts);
                                                  }} 
                                                  placeholder="Nhập mô tả chi tiết sản phẩm..." 
                                                  className="min-h-32 resize-none" 
                                                />
                                              </div>
                                            </div>
                                          </DialogContent>
                                        </Dialog>
                                      </div>
                                    </TableCell>

                                    <TableCell className="w-32 min-w-32 p-2">
                                      <div className="flex items-start space-x-1">
                                        <Textarea 
                                          value={(item as any).specifications || ''} 
                                          onChange={e => {
                                            const newProducts = [...selectedProducts];
                                            newProducts[index] = {
                                              ...item,
                                              specifications: e.target.value
                                            };
                                            setSelectedProducts(newProducts);
                                          }} 
                                          placeholder="Quy cách" 
                                          className="border-gray-200 focus:border-blue-500 flex-1 min-h-[2.5rem] resize-none" 
                                          rows={2} 
                                        />
                                        <Dialog>
                                          <DialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-50 p-2" title="Chỉnh sửa quy cách chi tiết">
                                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                                <path d="M12 20h9" />
                                                <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
                                              </svg>
                                            </Button>
                                          </DialogTrigger>
                                          <DialogContent className="sm:max-w-md">
                                            <DialogHeader>
                                              <DialogTitle>Chỉnh sửa quy cách sản phẩm</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-4">
                                              <div>
                                                <Label htmlFor={`specifications-${index}`}>Quy cách chi tiết</Label>
                                                <Textarea 
                                                  id={`specifications-${index}`} 
                                                  value={(item as any).specifications || ''} 
                                                  onChange={e => {
                                                    const newProducts = [...selectedProducts];
                                                    newProducts[index] = {
                                                      ...item,
                                                      specifications: e.target.value
                                                    };
                                                    setSelectedProducts(newProducts);
                                                  }} 
                                                  placeholder="Nhập quy cách chi tiết sản phẩm..." 
                                                  className="min-h-32 resize-none" 
                                                />
                                              </div>
                                            </div>
                                          </DialogContent>
                                        </Dialog>
                                      </div>
                                    </TableCell>

                                    <TableCell className="w-28 min-w-28 text-right p-2">
                                      <Input 
                                        type="text" 
                                        value={item.price.toLocaleString('vi-VN')} 
                                        onChange={e => {
                                          const value = e.target.value.replace(/[^\d]/g, ''); // Remove non-digits
                                          const price = parseFloat(value) || 0;
                                          updatePrice(item.id, price);
                                        }} 
                                        className="w-24 text-right font-mono text-blue-600 font-semibold border-gray-200 focus:border-blue-500" 
                                        placeholder="0" 
                                      />
                                    </TableCell>

                                    <TableCell className="w-24 min-w-24 text-center p-2">
                                      <Input 
                                        type="number" 
                                        value={item.quantity} 
                                        onChange={e => {
                                          const quantity = parseInt(e.target.value) || 1;
                                          updateQuantity(item.id, quantity);
                                        }} 
                                        className="w-20 h-10 text-center border-2 focus:border-blue-500 text-sm font-semibold" 
                                        min="1" 
                                      />
                                    </TableCell>

                                    <TableCell className="w-32 min-w-32 text-right font-mono font-bold text-green-600 text-sm p-2">
                                      {item.total.toLocaleString('vi-VN')}đ
                                    </TableCell>

                                    <TableCell className="w-20 min-w-20 text-center p-2">
                                      <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 h-8 w-8" onClick={() => removeProduct(item.id)}>
                                        <Trash2 className="w-5 h-5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                            {selectedProducts.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
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
                    <FormField control={form.control} name="includeVAT" render={({
                    field
                  }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">
                          Bao gồm VAT
                        </FormLabel>
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="vatRate" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Thuế VAT (%)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} placeholder="8" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="payment1" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Thanh toán lần 1 (VNĐ)</FormLabel>
                      <FormControl>
                        <CurrencyInput value={field.value} onChange={field.onChange} placeholder="0" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="payment2" render={({
                  field
                }) => (
                    <FormItem>
                      <FormLabel>Thanh toán lần 2 (VNĐ)</FormLabel>
                      <FormControl>
                        <CurrencyInput value={field.value} onChange={field.onChange} placeholder="0" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
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

      {/* Product Selection Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Chọn sản phẩm
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Tìm kiếm sản phẩm theo tên, mô tả, SKU, quy cách..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <ProductSelectionForm 
              products={searchResult.results} 
              onAddProduct={addProduct} 
            />
            
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
    </div>
  );
}