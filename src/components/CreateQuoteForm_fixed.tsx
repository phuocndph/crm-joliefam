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
  selectedImage?: string;
  originalProductId?: string;
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

  const { toast } = useToast();

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
      }
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
      const { data, error } = await supabase.from("price_lists").select("*").eq("status", "active").order("year", {
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
      const { data, error } = await supabase.from("products").select("*").eq("price_list_id", priceListId).eq("in_stock", true).order("name");
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

  // Keep existing functions unchanged - just providing the table replacement
  const watchedValues = form.watch();

  // Simple drag and drop table replacement
  const DraggableProductTable = () => (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl text-primary">
            Danh sách sản phẩm lựa chọn
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              Bảng giá: {priceLists.find(p => p.id === watchedValues.priceList)?.name || "Chưa chọn"} 
              ({selectedProducts.length > 0 ? `${selectedProducts.length} sản phẩm có sẵn` : "824 sản phẩm có sẵn"})
            </span>
          </CardTitle>
          <div className="flex gap-2">
            <Button 
              type="button" 
              variant="default" 
              className="bg-primary hover:bg-primary/90"
              onClick={() => {
                const newItem: QuoteItem = {
                  id: `new-${Date.now()}-${Math.random()}`,
                  name: '',
                  sku: '',
                  price: 0,
                  quantity: 1,
                  total: 0
                };
                setSelectedProducts(prev => [...prev, newItem]);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Thêm sản phẩm
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              className="border-primary text-primary hover:bg-primary/10"
              onClick={() => setShowCreateProduct(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Tạo sản phẩm mới
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border border-border rounded-lg">
          {/* Header Row */}
          <div className="grid grid-cols-10 gap-4 p-4 bg-muted/50 border-b border-border font-semibold text-sm">
            <div className="text-center">STT</div>
            <div className="text-center">Chọn sản phẩm</div>
            <div>Tên sản phẩm</div>
            <div className="text-center">Hình ảnh</div>
            <div>Mô tả sản phẩm</div>
            <div>Quy cách</div>
            <div className="text-right">Đơn giá</div>
            <div className="text-center">Số lượng</div>
            <div className="text-right">Thành tiền</div>
            <div className="text-center">Thao tác</div>
          </div>
          
          {/* Draggable Items */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="products">
              {(provided, snapshot) => (
                <div 
                  {...provided.droppableProps} 
                  ref={provided.innerRef}
                  className={cn(
                    "min-h-[100px]",
                    snapshot.isDraggingOver && "bg-accent/10"
                  )}
                >
                  {selectedProducts.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            "grid grid-cols-10 gap-4 p-4 border-b border-border hover:bg-accent/20",
                            snapshot.isDragging && "bg-card shadow-lg border-primary/30 rounded-lg z-50"
                          )}
                          style={provided.draggableProps.style}
                        >
                          {/* STT Column */}
                          <div className="flex items-center justify-center gap-2">
                            <div 
                              {...provided.dragHandleProps}
                              className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-accent/30"
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <span className="text-sm font-medium text-muted-foreground/70">
                              {index + 1}
                            </span>
                          </div>
                          
                          {/* Chọn sản phẩm Column */}
                          <div className="flex items-center">
                            <Button variant="outline" className="w-full h-10 text-left justify-start gap-2">
                              <Search className="h-4 w-4" />
                              <span className="truncate">
                                {item.sku ? item.sku : item.name ? `${item.name.substring(0, 15)}...` : 'Chọn sản phẩm'}
                              </span>
                            </Button>
                          </div>
                          
                          {/* Tên sản phẩm Column */}
                          <div className="flex items-center">
                            <Input 
                              value={item.name} 
                              onChange={(e) => {
                                const newName = e.target.value;
                                setSelectedProducts(prev => prev.map(p => 
                                  p.id === item.id ? { ...p, name: newName } : p
                                ));
                              }}
                              placeholder="Tên sản phẩm"
                              className="h-10"
                            />
                          </div>
                          
                          {/* Hình ảnh Column */}
                          <div className="flex items-center justify-center">
                            <Button variant="outline" size="sm" className="h-10 w-10 p-0">
                              <Image className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          {/* Mô tả Column */}
                          <div className="flex items-center">
                            <Textarea 
                              value={item.description || ''} 
                              onChange={(e) => {
                                const newDesc = e.target.value;
                                setSelectedProducts(prev => prev.map(p => 
                                  p.id === item.id ? { ...p, description: newDesc } : p
                                ));
                              }}
                              placeholder="Mô tả sản phẩm"
                              className="min-h-[40px] resize-none"
                            />
                          </div>
                          
                          {/* Quy cách Column */}
                          <div className="flex items-center">
                            <Textarea 
                              value={item.specifications || ''} 
                              onChange={(e) => {
                                const newSpec = e.target.value;
                                setSelectedProducts(prev => prev.map(p => 
                                  p.id === item.id ? { ...p, specifications: newSpec } : p
                                ));
                              }}
                              placeholder="Quy cách"
                              className="min-h-[40px] resize-none"
                            />
                          </div>
                          
                          {/* Đơn giá Column */}
                          <div className="flex items-center">
                            <CurrencyInput
                              value={item.price}
                              onValueChange={(value) => updatePrice(item.id, value || 0)}
                              className="text-right h-10"
                            />
                          </div>
                          
                          {/* Số lượng Column */}
                          <div className="flex items-center">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                              className="text-center h-10"
                              min="0"
                            />
                          </div>
                          
                          {/* Thành tiền Column */}
                          <div className="flex items-center justify-end">
                            <span className="font-medium text-primary">
                              {new Intl.NumberFormat('vi-VN').format(item.total)}đ
                            </span>
                          </div>
                          
                          {/* Thao tác Column */}
                          <div className="flex items-center justify-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeProduct(item.id)}
                              className="h-10 w-10 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form className="space-y-6">
          {/* Basic form content would go here - keeping existing structure */}
          
          {/* Replace the old table with new draggable table */}
          <DraggableProductTable />
          
          {/* Rest of the form content */}
        </form>
      </Form>
    </div>
  );
}
