import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Settings, X, Plus, Trash2, Search, Image } from "lucide-react";
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
    if (initialData) {
      try {
        // Parse items
        const items = typeof initialData.items === 'string' ? JSON.parse(initialData.items) : initialData.items || [];
        setSelectedProducts(items);

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
      // Clear products if no price list is selected
      setProducts([]);
      setSelectedProducts([]);
    }
  }, [form.watch("priceList")]);

  // Filter selected products when products change
  useEffect(() => {
    if (products.length > 0) {
      setSelectedProducts(prevSelected => prevSelected.filter(selectedItem => products.some(product => product.id === selectedItem.id)));
    }
  }, [products]);
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
    const existingItem = selectedProducts.find(item => item.id === product.id);
    if (existingItem) {
      setSelectedProducts(prev => prev.map(item => item.id === product.id ? {
        ...item,
        quantity: item.quantity + 1,
        total: (item.quantity + 1) * item.price
      } : item));
    } else {
      const newItem: QuoteItem = {
        id: product.id,
        name: product.name,
        sku: product.sku || '',
        price: product.price || 0,
        quantity: 1,
        total: product.price || 0
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
    setSelectedProducts(prev => prev.map(item => item.id === productId ? {
      ...item,
      quantity,
      total: quantity * item.price
    } : item));
  };

  // Function to update price
  const updatePrice = (productId: string, price: number) => {
    setSelectedProducts(prev => prev.map(item => item.id === productId ? {
      ...item,
      price,
      total: item.quantity * price
    } : item));
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

      // Refresh products list
      if (selectedPriceList) {
        const {
          data: updatedProducts
        } = await supabase.from('products').select('*').eq('price_list_id', selectedPriceList).order('name');
        if (updatedProducts) {
          setProducts(updatedProducts);
        }
      }
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
  const handleSubmit = async (data: QuoteFormData) => {
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
      // Get current user
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();

      // Calculate total
      const subtotal = selectedProducts.reduce((sum, item) => sum + item.total, 0);
      const vatAmount = watchedValues.includeVAT ? subtotal * watchedValues.vatRate / 100 : 0;
      const calculatedTotal = subtotal + vatAmount;
      const quoteData = {
        quote_number: data.quoteNumber,
        customer_id: null,
        // Would need customer selection
        total_amount: calculatedTotal,
        subtotal: subtotal,
        vat_amount: vatAmount,
        include_vat: data.includeVAT,
        vat_rate: data.vatRate,
        price_list_id: data.priceList || null,
        assignee_id: data.responsible || null,
        status: initialData ? initialData.status : "draft",
        // Keep original status when editing
        notes: `Khách hàng: ${data.customerName}\nĐiện thoại: ${data.phone}\nEmail: ${data.email}\nĐịa chỉ: ${data.address}\nNgày hết hạn: ${data.expiryDate && !isNaN(data.expiryDate.getTime()) ? format(data.expiryDate, "dd/MM/yyyy") : ""}`,
        items: JSON.stringify(selectedProducts),
        quote_data: JSON.stringify({
          includeVAT: data.includeVAT,
          vatRate: data.vatRate,
          payment1: data.payment1 || 0,
          payment2: data.payment2 || 0
        }),
        tenant_id: "default",
        manager_id: user?.id ? user.id.toString() : null
      };
      if (initialData) {
        // Update existing quote
        const {
          error
        } = await supabase.from("quotes").update(quoteData).eq('id', initialData.id);
        if (error) throw error;

        // Automatically push to orders if quote is approved
        if (initialData.status === 'approved') {
          console.log('🚀 Tự động đẩy báo giá đã duyệt sang đơn hàng...');

          // Find existing order by quote_id first
          let relatedOrders = null;
          const {
            data: ordersByQuoteId,
            error: quoteIdError
          } = await supabase.from("orders").select("*").eq("quote_id", initialData.id);
          if (!quoteIdError && ordersByQuoteId && ordersByQuoteId.length > 0) {
            relatedOrders = ordersByQuoteId;
            console.log('✅ Tìm thấy đơn hàng qua quote_id:', relatedOrders);
          } else {
            console.log('⚠️ Không tìm thấy đơn hàng qua quote_id, tìm qua notes...');

            // Fallback: Find by quote number in notes
            const {
              data: ordersByNotes,
              error: notesError
            } = await supabase.from("orders").select("*").ilike("notes", `%${data.quoteNumber}%`);
            if (!notesError && ordersByNotes && ordersByNotes.length > 0) {
              relatedOrders = ordersByNotes;
              console.log('✅ Tìm thấy đơn hàng qua notes:', relatedOrders);

              // Update these orders to have quote_id for future reference
              for (const order of relatedOrders) {
                await supabase.from("orders").update({
                  quote_id: initialData.id
                }).eq("id", order.id);
              }
            }
          }
          if (relatedOrders && relatedOrders.length > 0) {
            // Update existing order
            const order = relatedOrders[0];
            console.log('📝 Cập nhật đơn hàng hiện có:', order.order_number);

            // Always use total with VAT when VAT is included, subtotal when not
            const orderTotal = calculatedTotal; // This is always correct: subtotal + VAT (if included)

            const orderUpdateData = {
              items: JSON.stringify(selectedProducts),
              total_amount: orderTotal,
              notes: `Được cập nhật từ báo giá ${data.quoteNumber} (${new Date().toLocaleString('vi-VN')})\nKhách hàng: ${data.customerName}\nĐiện thoại: ${data.phone}`,
              updated_at: new Date().toISOString(),
              quote_id: initialData.id // Ensure quote_id is set
            };
            const {
              error: updateError
            } = await supabase.from("orders").update(orderUpdateData).eq('id', order.id);
            if (updateError) {
              console.error("❌ Lỗi cập nhật đơn hàng:", updateError);
            } else {
              console.log('✅ Đã cập nhật đơn hàng thành công');
            }
          } else {
            // Create new order if none exists
            console.log('➕ Tạo đơn hàng mới từ báo giá cập nhật');

            // Always use total with VAT when VAT is included, subtotal when not
            const orderTotal = calculatedTotal; // This is always correct: subtotal + VAT (if included)

            const orderNumber = `ORD-${Date.now()}`;
            const {
              error: createError
            } = await supabase.from("orders").insert({
              order_number: orderNumber,
              customer_id: initialData.customer_id,
              manager_id: user?.id ? user.id.toString() : null,
              assignee_id: data.responsible || null,
              total_amount: orderTotal,
              status: 'pending',
              items: JSON.stringify(selectedProducts),
              notes: `Được tạo từ báo giá ${data.quoteNumber} (${new Date().toLocaleString('vi-VN')})\nKhách hàng: ${data.customerName}\nĐiện thoại: ${data.phone}`,
              tenant_id: 'default',
              quote_id: initialData.id
            });
            if (createError) {
              console.error("❌ Lỗi tạo đơn hàng mới:", createError);
            } else {
              console.log('✅ Đã tạo đơn hàng mới:', orderNumber);
            }
          }
        }
        toast({
          title: "Thành công",
          description: initialData.status === 'approved' ? "Đã cập nhật báo giá và đẩy sang đơn hàng tự động" : "Báo giá đã được cập nhật thành công"
        });
      } else {
        // Create new quote
        const {
          error
        } = await supabase.from("quotes").insert([quoteData]);
        if (error) throw error;
        toast({
          title: "Thành công",
          description: "Báo giá đã được tạo thành công"
        });
      }
      onSubmit?.();
    } catch (error) {
      console.error("Error creating quote:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tạo báo giá",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  const watchedValues = form.watch();

  // Ensure all totals are correctly calculated
  const correctedProducts = selectedProducts.map(item => ({
    ...item,
    total: item.quantity * item.price // Always recalculate to ensure accuracy
  }));
  const rawSubtotal = correctedProducts.reduce((sum, item) => sum + item.total, 0);

  // Calculate VAT according to user requirements
  const subtotal = rawSubtotal; // This is "TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT"
  const vatAmount = watchedValues.includeVAT ? subtotal * watchedValues.vatRate / 100 : 0;
  const total = subtotal + vatAmount; // This is "TỔNG TIỀN ĐÃ BAO GỒM GTGT"
  const remaining = total - (watchedValues.payment1 + watchedValues.payment2);

  // Add debugging info
  console.log('CreateQuoteForm calculation debug:', {
    selectedProducts: selectedProducts.length,
    correctedProducts: correctedProducts.map(p => ({
      name: p.name,
      quantity: p.quantity,
      price: p.price,
      total: p.total
    })),
    rawSubtotal,
    subtotal,
    vatAmount,
    total,
    includeVAT: watchedValues.includeVAT,
    vatRate: watchedValues.vatRate
  });
  return <div className="min-h-screen bg-background">
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="title" render={({
                  field
                }) => <FormItem>
                        <FormLabel>
                          Tiêu đề báo giá <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="BẢNG BÁO GIÁ" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />

                  <FormField control={form.control} name="quoteNumber" render={({
                  field
                }) => <FormItem>
                        <FormLabel>
                          Số báo giá <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="BG-20250721-627" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />

                  <FormField control={form.control} name="quoteDate" render={({
                  field
                }) => <FormItem>
                        <FormLabel>
                          Ngày báo giá <span className="text-red-500">*</span>
                        </FormLabel>
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
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={date => date < new Date("1900-01-01")} initialFocus className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="expiryDate" render={({
                  field
                }) => <FormItem>
                        <FormLabel>
                          Ngày hết hạn <span className="text-red-500">*</span>
                        </FormLabel>
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
                      </FormItem>} />

                  <FormField control={form.control} name="priceList" render={({
                  field
                }) => <FormItem>
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
                             {priceLists.map(priceList => <SelectItem key={priceList.id} value={priceList.id}>
                                 {priceList.name} ({priceList.year})
                               </SelectItem>)}
                           </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>} />

                  <FormField control={form.control} name="responsible" render={({
                  field
                }) => <FormItem>
                        <FormLabel>Người phụ trách</FormLabel>
                        <AssigneeManagement value={field.value} onChange={field.onChange} placeholder="Chọn người phụ trách" />
                        <FormMessage />
                      </FormItem>} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="customerName" render={({
                  field
                }) => <FormItem>
                        <FormLabel>
                          Tên khách hàng <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Nhập tên khách hàng..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />

                  <FormField control={form.control} name="phone" render={({
                  field
                }) => <FormItem>
                        <FormLabel>Số điện thoại</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="VD: 0123456789" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="email" render={({
                  field
                }) => <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="VD: email@example.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />

                  <FormField control={form.control} name="address" render={({
                  field
                }) => <FormItem>
                        <FormLabel>Địa chỉ</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="VD: 123 Đường ABC, TP.HCM" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />
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
                  <div className="flex gap-2">
                    <Button type="button" className="bg-green-600 hover:bg-green-700" onClick={() => {
                    const newItem: QuoteItem = {
                      id: `temp-${Date.now()}`,
                      name: '',
                      sku: '',
                      price: 0,
                      quantity: 1,
                      total: 0
                    };
                    setSelectedProducts(prev => [...prev, newItem]);
                  }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Thêm sản phẩm
                    </Button>
                    <Button type="button" variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50" onClick={() => setShowCreateProduct(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Tạo sản phẩm mới
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                     <TableHeader>
                       <TableRow className="bg-gray-50">
                         <TableHead className="font-bold text-base w-32">Chọn sản phẩm</TableHead>
                         <TableHead className="font-bold text-base w-48">Tên sản phẩm</TableHead>
                         <TableHead className="font-bold text-base w-20">Hình ảnh</TableHead>
                         <TableHead className="font-bold text-base w-40">Mô tả sản phẩm</TableHead>
                         <TableHead className="font-bold text-base w-32">Quy cách</TableHead>
                         <TableHead className="font-bold text-base text-right w-28">Đơn giá</TableHead>
                         <TableHead className="font-bold text-base text-center w-24">Số lượng</TableHead>
                         <TableHead className="font-bold text-base text-right w-32">Thành tiền</TableHead>
                         <TableHead className="font-bold text-base text-center w-20">Thao tác</TableHead>
                       </TableRow>
                     </TableHeader>
                    <TableBody>
                      {selectedProducts.map((item, index) => <TableRow key={item.id} className="h-24">
                          <TableCell className="p-4">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" className="w-full h-12 text-left justify-start gap-2 border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50 hover:bg-blue-100" onClick={() => setCurrentEditingIndex(index)}>
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
                                    {debouncedSearchTerm && <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-md">
                                        <p className="text-sm text-blue-700">
                                          Tìm thấy <strong>{searchResult.resultCount}</strong> sản phẩm cho "{debouncedSearchTerm}"
                                        </p>
                                      </div>}

                                    {/* Products List */}
                                    <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                                      {Object.entries(searchResult.groupedResults).map(([category, categoryProducts]) => <div key={category} className="space-y-2">
                                          <div className="sticky top-0 bg-blue-100 px-3 py-2 rounded-md border-l-4 border-blue-500 z-10">
                                            <h4 className="font-semibold text-blue-800 text-sm flex items-center gap-2">
                                              <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                                                {categoryProducts.length}
                                              </span>
                                              {category}
                                            </h4>
                                          </div>
                                          <div className="space-y-1 pl-2">
                                            {categoryProducts.map(product => <Card key={product.id} className="cursor-pointer hover:shadow-md transition-all border hover:border-blue-300 hover:bg-blue-50" onClick={() => {
                                      console.log('Selected product data:', product);
                                      const newProducts = [...selectedProducts];
                                      newProducts[index] = {
                                        id: product.id,
                                        name: product.name,
                                        sku: product.sku || '',
                                        price: product.price || 0,
                                        quantity: item.quantity,
                                        total: (product.price || 0) * item.quantity,
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
                                                            <h3 className="font-bold text-blue-800 text-sm" dangerouslySetInnerHTML={{
                                                    __html: highlightSearchTerms(product.sku || 'NO-SKU', debouncedSearchTerm)
                                                  }} />
                                                          </div>
                                                          <p className="text-gray-700 font-medium text-sm truncate" dangerouslySetInnerHTML={{
                                                  __html: highlightSearchTerms(product.name, debouncedSearchTerm)
                                                }} />
                                                          {(product.description || product.specifications) && <p className="text-gray-500 text-xs mt-1 line-clamp-2" dangerouslySetInnerHTML={{
                                                  __html: highlightSearchTerms(product.description || product.specifications || '', debouncedSearchTerm)
                                                }} />}
                                                        </div>
                                                        <div className="text-right">
                                                          <p className="text-green-600 font-bold text-sm">{(product.price || 0).toLocaleString()}đ</p>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </CardContent>
                                              </Card>)}
                                          </div>
                                        </div>)}
                                   </div>
                                  
                                   {searchResult.resultCount === 0 && debouncedSearchTerm && <div className="text-center py-8 text-gray-500">
                                       <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                       <p>Không tìm thấy sản phẩm nào với từ khóa "{debouncedSearchTerm}"</p>
                                       <p className="text-xs mt-2">Hãy thử tìm kiếm với từ khóa khác hoặc kiểm tra chính tả</p>
                                     </div>}
                                </div>
                              </DialogContent>
                            </Dialog>
                           </TableCell>
                            <TableCell className="min-w-48 p-2">
                             <Textarea value={item.name} onChange={e => {
                          const newProducts = [...selectedProducts];
                          newProducts[index] = {
                            ...item,
                            name: e.target.value
                          };
                          setSelectedProducts(newProducts);
                        }} placeholder="Tên sản phẩm" className="border-gray-200 focus:border-blue-500 font-medium text-sm w-full min-h-[2.5rem] resize-none" rows={2} />
                           </TableCell>
                           <TableCell className="w-20 p-2">
                             <Dialog open={imageDialogOpen[index] || false} onOpenChange={open => {
                          setImageDialogOpen(prev => ({
                            ...prev,
                            [index]: open
                          }));
                        }}>
                              <DialogTrigger asChild>
                                 <Button variant="outline" size="sm" className="h-12 w-16 border-2 border-dashed border-gray-300 hover:border-blue-500 flex flex-col items-center justify-center gap-1" type="button">
                                  {item.selectedImage ? <img src={item.selectedImage} alt="Selected" className="w-12 h-12 object-cover rounded" /> : <>
                                      <Image className="h-4 w-4 text-gray-400" />
                                      <span className="text-xs text-gray-500">Chọn ảnh</span>
                                    </>}
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
                                <DialogHeader>
                                  <DialogTitle>Chọn hình ảnh sản phẩm</DialogTitle>
                                </DialogHeader>
                                <div className="h-[70vh] overflow-y-auto">
                                  <ProductImageLibrary hideDeleteButton={true} onSelectImage={imageUrl => {
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
                              }} />
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                            <TableCell className="min-w-40 p-2">
                              <div className="flex items-start space-x-1">
                               <Textarea value={item.description || ''} onChange={e => {
                            const newProducts = [...selectedProducts];
                            newProducts[index] = {
                              ...item,
                              description: e.target.value
                            };
                            setSelectedProducts(newProducts);
                          }} placeholder="Mô tả sản phẩm" className="border-gray-200 focus:border-blue-500 flex-1 min-h-[2.5rem] resize-none" rows={2} />
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
                                      <Textarea id={`description-${index}`} value={item.description || ''} onChange={e => {
                                    const newProducts = [...selectedProducts];
                                    newProducts[index] = {
                                      ...item,
                                      description: e.target.value
                                    };
                                    setSelectedProducts(newProducts);
                                  }} placeholder="Nhập mô tả chi tiết sản phẩm..." className="min-h-32 resize-none" />
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                            <TableCell className="min-w-32 p-2">
                              <div className="flex items-start space-x-1">
                               <Textarea value={(item as any).specifications || ''} onChange={e => {
                            const newProducts = [...selectedProducts];
                            newProducts[index] = {
                              ...item,
                              specifications: e.target.value
                            };
                            setSelectedProducts(newProducts);
                          }} placeholder="Quy cách" className="border-gray-200 focus:border-blue-500 flex-1 min-h-[2.5rem] resize-none" rows={2} />
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
                                      <Textarea id={`specifications-${index}`} value={(item as any).specifications || ''} onChange={e => {
                                    const newProducts = [...selectedProducts];
                                    newProducts[index] = {
                                      ...item,
                                      specifications: e.target.value
                                    };
                                    setSelectedProducts(newProducts);
                                  }} placeholder="Nhập quy cách chi tiết sản phẩm..." className="min-h-32 resize-none" />
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                          <TableCell className="w-28 p-2">
                            <Input type="number" value={item.price} onChange={e => {
                          const price = parseFloat(e.target.value) || 0;
                          updatePrice(item.id, price);
                        }} className="w-24 text-right font-mono text-blue-600 font-semibold border-gray-200 focus:border-blue-500" min="0" step="1000" placeholder="0" />
                          </TableCell>
                           <TableCell className="w-24 p-2">
                             <Input type="number" value={item.quantity} onChange={e => {
                          const quantity = parseInt(e.target.value) || 1;
                          updateQuantity(item.id, quantity);
                        }} className="w-20 h-10 text-center border-2 focus:border-blue-500 text-sm font-semibold" min="1" />
                          </TableCell>
                           <TableCell className="w-32 text-right font-mono font-bold text-green-600 text-sm p-2">
                             {item.total.toLocaleString()}đ
                          </TableCell>
                           <TableCell className="w-20 text-center p-2">
                             <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 h-8 w-8" onClick={() => removeProduct(item.id)}>
                              <Trash2 className="w-5 h-5" />
                            </Button>
                          </TableCell>
                        </TableRow>)}
                      {selectedProducts.length === 0 && <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            Chưa có sản phẩm nào. Nhấn "Thêm sản phẩm" để bắt đầu.
                          </TableCell>
                        </TableRow>}
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
                    <FormField control={form.control} name="includeVAT" render={({
                    field
                  }) => <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="text-sm font-normal">
                            Bao gồm VAT
                          </FormLabel>
                        </FormItem>} />
                  </div>

                  <FormField control={form.control} name="vatRate" render={({
                  field
                }) => <FormItem>
                        <FormLabel>Thuế VAT (%)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} placeholder="8" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="payment1" render={({
                  field
                }) => <FormItem>
                        <FormLabel>Thanh toán lần 1 (VNĐ)</FormLabel>
                        <FormControl>
                          <CurrencyInput value={field.value} onChange={field.onChange} placeholder="0" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />

                  <FormField control={form.control} name="payment2" render={({
                  field
                }) => <FormItem>
                        <FormLabel>Thanh toán lần 2 (VNĐ)</FormLabel>
                        <FormControl>
                          <CurrencyInput value={field.value} onChange={field.onChange} placeholder="0" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />
                </div>

                 {/* Calculation Summary */}
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span>TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT:</span>
                    <span className="text-blue-600 font-bold">{subtotal.toLocaleString()}đ</span>
                  </div>
                  {watchedValues.includeVAT && <>
                      <div className="flex justify-between text-sm font-medium">
                        <span>GTGT ({watchedValues.vatRate}%):</span>
                        <span className="text-orange-600">{vatAmount.toLocaleString()}đ</span>
                      </div>
                      <div className="flex justify-between text-sm font-medium">
                        <span>TỔNG TIỀN ĐÃ BAO GỒM GTGT:</span>
                        <span className="text-green-600 font-bold">{total.toLocaleString()}đ</span>
                      </div>
                    </>}
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
    </div>;
}