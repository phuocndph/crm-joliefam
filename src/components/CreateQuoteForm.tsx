import { quoteCalendarDate, quoteCalendarDateIso, resolveQuoteDates } from '@/lib/quote-dates';
import React, { lazy, Suspense, useState, useEffect, useRef, useCallback, useId } from "react";
import { parseQuotePriceInput, quoteFormPreview } from '@/lib/quote-form-preview';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon, Settings, X, Plus, Trash2, Search, Image, GripVertical, Save, Eye } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "react-beautiful-dnd";
import { ProductSelectionForm } from './ProductSelectionForm';
import { transformImageUrl } from '@/lib/imageUrl';
import { AIQuoteFill, loadImageFiles } from './AIQuoteFill';
import { AssigneeManagement } from './AssigneeManagement';
import { AuthStatusBadge } from './AuthStatusBadge';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QuoteProductPicker } from "./QuoteProductPicker";
import { QuotePreviewDialog } from "./QuotePreviewDialog";
import type { SearchableProduct } from "@/lib/searchUtils";
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
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi, LocalApiError, type QuoteCustomerCandidate } from "@/lib/local-api";
import { getLocalMe, type LocalMe } from "@/lib/local-auth";
import { calculateQuote, quoteLineAmount, quoteObject } from '@/lib/quote-calculation';

const localQuoteManagerId = (me: LocalMe): string => {
  if (!me.user_id || !me.role || !['admin','manager','employee','accountant','team_leader'].includes(me.role)) {
    throw new Error('Chưa xác định được tài khoản hoặc vai trò local. Vui lòng thử tải lại quyền.');
  }
  // Preserve the current assignment policy; module permissions remain enforced by the API.
  return (me.role === 'employee' || me.role === 'accountant') && me.assigned_by
    ? me.assigned_by : me.user_id;
};

const ProductImageLibrary = lazy(() => import('./ProductImageLibrary'));
const initialQuoteData = (value: unknown) => { try { return quoteObject(value); } catch { return {}; } };
const draftLineAmount = (quantity: number, price: number) => { try { return quoteLineAmount(quantity, price); } catch { return 0; } };
const createEmptyQuoteLine = (): QuoteItem => ({
  id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  sku: '',
  price: 0,
  quantity: 1,
  total: 0,
  description: '',
  specifications: ''
});
const isBlankQuoteLine = (item: QuoteItem) =>
  !item.name?.trim() &&
  !item.sku?.trim() &&
  !item.description?.trim() &&
  !item.specifications?.trim() &&
  !item.selectedImage &&
  typeof item.price === 'number' && item.price === 0;
const customerNameKey = (value: string) => value.trim().normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase('vi');
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
  const quoteFormId = useId();
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [priceListsLoading, setPriceListsLoading] = useState(true);
  const [priceListsError, setPriceListsError] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsPriceListId, setProductsPriceListId] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const productsRequest = useRef(0);
  const productsMounted = useRef(true);
  const invalidateProductsRequest = useCallback(() => { productsRequest.current++; }, []);
  const [selectedProducts, setSelectedProducts] = useState<QuoteItem[]>(() => initialData ? [] : [createEmptyQuoteLine()]);
  // Keep intermediate decimal input (for example "1,") until the editor blurs.
  const [priceEditing, setPriceEditing] = useState<Record<string, string>>({});
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const creationKey = useRef(crypto.randomUUID());
  const [productPickerTarget, setProductPickerTarget] = useState<{ lineId: string; priceListId: string; catalog: Product[]; initialSearch: string } | null>(null);
  const productPickerTrigger = useRef<HTMLButtonElement | null>(null);
  const productPickerFallback = useRef<HTMLDivElement | null>(null);
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [currentImageEditingIndex, setCurrentImageEditingIndex] = useState<number>(-1);
  const [imageDialogOpen, setImageDialogOpen] = useState<{
    [key: number]: boolean;
  }>({});
  
  // Auto-save draft states
  const [showDraftRecovery, setShowDraftRecovery] = useState(false);
  const [savedDraft, setSavedDraft] = useState<any>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  
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

  // User and role state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true); // Track user data loading
  const DRAFT_KEY = `quote-draft-autosave:${currentUser?.id || 'pending'}`;
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialData?.customer_id || null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>(initialData?.customers?.name || initialData?.customer_name || initialData?.customerName || '');
  const selectedIdentityName = useRef(initialData?.customerName || '');
  const customerSection = useRef<HTMLDivElement>(null);
  const [customerConflict, setCustomerConflict] = useState<{ message: string; candidates: QuoteCustomerCandidate[] } | null>(null);
  const customerAccount = useRef<string | null>(null);
  const [formAccountInvalidated, setFormAccountInvalidated] = useState(false);
  const accountChanged = formAccountInvalidated || Boolean(currentUser?.id && customerAccount.current && customerAccount.current !== currentUser.id);
  const [identityError, setIdentityError] = useState('');
  const [identityAttempt, setIdentityAttempt] = useState(0);
  const identityRequest = useRef(0);
  const invalidateIdentityRequest = useCallback(() => { identityRequest.current++; }, []);

  // Customer search states
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<QuoteCustomerCandidate[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState('');
  const [customerSearchAttempt, setCustomerSearchAttempt] = useState(0);
  const customerSearchRequest = useRef(0);
  const invalidateCustomerSearch = useCallback(() => { customerSearchRequest.current++; }, []);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearchField, setCustomerSearchField] = useState<'name' | 'phone' | 'address'>('name');
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

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

  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      title: initialData?.title || initialQuoteData(initialData?.quote_data).title as string || "BẢNG BÁO GIÁ",
      quoteNumber: initialData?.quote_number || `BG-${format(new Date(), "yyyyMMdd")}-${Math.floor(Math.random() * 1000)}`,
      quoteDate: initialData ? quoteCalendarDate(resolveQuoteDates(initialData).quoteDate) : new Date(),
      expiryDate: initialData ? quoteCalendarDate(resolveQuoteDates(initialData).expiryDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      customerName: initialData?.customerName || "",
      phone: initialData?.customerPhone || "",
      email: initialData?.customerEmail || "",
      address: initialData?.customerAddress || "",
      priceList: initialData?.price_list_id || "",
      responsible: initialData?.assignee_id || "",
      includeVAT: initialData?.include_vat || false,
      vatRate: Number(initialData?.vat_rate ?? 8),
      payment1: (() => {
        if (initialData?.quote_data) {
          try {
            const quoteData = typeof initialData.quote_data === 'string' ? JSON.parse(initialData.quote_data) : initialData.quote_data;
            return Number(quoteData.payment1 ?? 0);
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
            return Number(quoteData.payment2 ?? 0);
          } catch {
            return 0;
          }
        }
        return 0;
      })()
    }
  });
  const selectedPriceListId = form.watch('priceList');
  const catalogReady = Boolean(selectedPriceListId && productsPriceListId === selectedPriceListId && !productsLoading && !productsError);
  const savedPriceListLabel = priceListsLoading ? 'Bảng giá đã lưu (đang kiểm tra)' : priceListsError ? 'Bảng giá đã lưu (chưa xác minh)' : `Bảng giá ${selectedPriceListId} (không còn hoạt động)`;
  const selectedPriceListLabel = priceLists.find(row => row.id === selectedPriceListId)?.name || (selectedPriceListId ? savedPriceListLabel : 'Chưa chọn');

  useEffect(() => {
    setSelectedCustomerId(initialData?.customer_id || null);
    setSelectedCustomerName(initialData?.customers?.name || initialData?.customer_name || initialData?.customerName || '');
    selectedIdentityName.current = initialData?.customerName || '';
    setCustomerConflict(null);
  }, [initialData?.id, initialData?.customer_id, initialData?.customerName, initialData?.customer_name, initialData?.customers?.name]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (customerAccount.current && customerAccount.current !== currentUser.id) {
      setSelectedCustomerId(null);
      setSelectedCustomerName('');
      setCustomerConflict(null);
      customerSearchRequest.current++;
      setSavedDraft(null);
      setShowDraftRecovery(false);
      setCustomerResults([]);
      setFormAccountInvalidated(true);
      // Keep the original owner guard. Even without onClose, no old form values
      // may be saved into the new account's draft or submitted as its quote.
      if (!formAccountInvalidated) onClose?.();
      return;
    }
    if (!customerAccount.current) customerAccount.current = currentUser.id;
  }, [currentUser?.id, formAccountInvalidated, onClose]);

  useEffect(() => {
    const subscription = form.watch((_values, { name, type }) => {
      if (type === 'change' && name === 'customerName' && customerNameKey(_values.customerName || '') !== customerNameKey(selectedIdentityName.current)) {
        setSelectedCustomerId(null);
        setSelectedCustomerName('');
      }
      if (type === 'change' && ['customerName', 'phone', 'email'].includes(name || '')) setCustomerConflict(null);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const productPickerReady = Boolean(productPickerTarget && catalogReady && productPickerTarget.priceListId === selectedPriceListId && productPickerTarget.catalog === products && selectedProducts.some(line => line.id === productPickerTarget.lineId));
  useEffect(() => {
    if (productPickerTarget && !productPickerReady) setProductPickerTarget(null);
  }, [productPickerTarget, productPickerReady]);
  const selectCatalogProduct = (product: SearchableProduct) => {
    if (!productPickerReady || !productPickerTarget) return;
    const current = products.find(row => row.id === product.id);
    if (!current) return;
    const targetId = productPickerTarget.lineId;
    setPriceEditing(previous => { const next = { ...previous }; delete next[targetId]; return next; });
    setSelectedProducts(previous => previous.map(line => line.id !== targetId ? line : {
      id: line.id,
      name: current.name,
      sku: current.sku || '',
      price: current.price || 0,
      quantity: line.quantity,
      total: (current.price || 0) * line.quantity,
      originalProductId: current.id,
      description: current.description || '',
      specifications: current.specifications || ''
    }));
    setProductPickerTarget(null);
    toast({ title: "Thành công", description: "Đã chọn " + current.name });
  };

  // Load user, role, and manager ID
  useEffect(() => {
    const request = ++identityRequest.current;
    const fetchUserAndRole = async () => {
      setIsLoadingUser(true); // Start loading
      if (isLocalBackend()) {
        setCurrentUser(null);setUserRole(null);setManagerId(null);setIdentityError('');
        try {
          const me = await getLocalMe(true);
          if (request !== identityRequest.current) return;
          const assignedManager = localQuoteManagerId(me);
          setCurrentUser({id:me.user_id});setUserRole(me.role);setManagerId(assignedManager);
        } catch (error) {
          if (request === identityRequest.current) setIdentityError(error instanceof Error ? error.message : 'Không tải được quyền tạo báo giá local. Vui lòng thử lại.');
        } finally {
          if (request === identityRequest.current) setIsLoadingUser(false);
        }
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);
        
        if (user) {
          // Get user role
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role, assigned_by')
            .eq('user_id', user.id)
            .single();
          
          if (roleData) {
            setUserRole(roleData.role);
            
            // If employee or accountant, use manager's ID (assigned_by), else use own ID
            if ((roleData.role === 'employee' || roleData.role === 'accountant') && roleData.assigned_by) {
              setManagerId(roleData.assigned_by);
            } else {
              setManagerId(user.id);
            }
          }
        }
      } finally {
        setIsLoadingUser(false); // End loading
      }
    };
    
    fetchUserAndRole();
    return invalidateIdentityRequest;
  }, [identityAttempt, invalidateIdentityRequest]);

  // Load price lists and products
  useEffect(() => {
    loadPriceLists();
  }, []);

  // Search customers from database
  useEffect(() => {
    const request = ++customerSearchRequest.current;
    if (debouncedCustomerSearch !== customerSearch) { setCustomerSearchLoading(customerSearch.trim().length >= 2);return; }
    if (!debouncedCustomerSearch || debouncedCustomerSearch.length < 2 || accountChanged || (isLocalBackend() && (isLoadingUser || !currentUser?.id || !managerId))) {
      setCustomerResults([]);
      setCustomerSearchLoading(false);
      return;
    }
    setCustomerResults([]);setCustomerSearchLoading(true);setCustomerSearchError('');
    const searchCustomers = async () => {
      try {
        if (isLocalBackend()) {
          const rows = await localApi.quoteCustomerSuggestions({ search: debouncedCustomerSearch, managerId, quoteId: initialData?.id });
          if (request === customerSearchRequest.current) setCustomerResults(rows);
          return;
        }
        let query = supabase.from('customers').select('id, name, phone, email, address, company').limit(10);
        const term = `%${debouncedCustomerSearch}%`;
        if (customerSearchField === 'name') {
          query = query.ilike('name', term);
        } else if (customerSearchField === 'phone') {
          query = query.ilike('phone', term);
        } else {
          query = query.ilike('address', term);
        }
        const { data } = await query;
        if (request === customerSearchRequest.current) setCustomerResults((data || []).map(row => ({ ...row, phone: row.phone || '', email: row.email || '', address: row.address || '', is_active: true })));
      } catch (e) {
        if (request === customerSearchRequest.current) setCustomerSearchError(e instanceof Error ? e.message : 'Không tìm được khách hàng. Hãy nhập lại để thử.');
      } finally {
        if (request === customerSearchRequest.current) setCustomerSearchLoading(false);
      }
    };
    searchCustomers();
    return invalidateCustomerSearch;
  }, [debouncedCustomerSearch, customerSearch, customerSearchAttempt, customerSearchField, currentUser?.id, managerId, initialData?.id, isLoadingUser, accountChanged, invalidateCustomerSearch]);

  const beginCustomerSearch = (field: 'name' | 'phone' | 'address', value: string) => {
    customerSearchRequest.current++;
    setCustomerResults([]);setCustomerSearchError('');
    setCustomerSearchAttempt(value => value + 1);
    setCustomerSearchLoading(value.trim().length >= 2);
    setCustomerSearch(value);setCustomerSearchField(field);setShowCustomerDropdown(true);
  };
  const chooseCustomer = (customer: QuoteCustomerCandidate, preserveSnapshot = false) => {
    // Conflict resolution preserves the delivery details already entered.
    form.setValue('customerName', customer.name, { shouldValidate: true });
    if (!preserveSnapshot) {
      form.setValue('phone', customer.phone || '');form.setValue('email', customer.email || '');form.setValue('address', customer.address || '');
    }
    selectedIdentityName.current = customer.name;
    setSelectedCustomerId(customer.id);setSelectedCustomerName(customer.name);
    setCustomerConflict(null);setShowCustomerDropdown(false);setCustomerSearch('');
    customerSearchRequest.current++;
  };
  const customerDropdown = (field: 'name' | 'phone' | 'address') => !customerConflict && showCustomerDropdown && customerSearchField === field && customerSearch.trim().length >= 2 ? (
    <div data-quote-customer-candidates className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
      {customerSearchLoading ? <p role="status" className="p-3 text-sm text-muted-foreground">Đang tìm khách hàng…</p> : customerSearchError ? <p role="alert" className="p-3 text-sm text-destructive">{customerSearchError}</p> : !customerResults.length ? <p className="p-3 text-sm text-muted-foreground">Không tìm thấy khách hàng. Có thể tiếp tục nhập khách mới.</p> : customerResults.map(customer => (
        <button key={customer.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent flex flex-col" onMouseDown={event => event.preventDefault()} onClick={() => chooseCustomer(customer)}>
          <span className="font-medium">{customer.name}{!customer.is_active && ' (ngừng hoạt động)'}</span>
          <span className="text-xs text-muted-foreground">{[customer.phone, customer.email, customer.address].filter(Boolean).join(' • ')}</span>
        </button>
      ))}
    </div>
  ) : null;
  const leaveCustomerSearch = (event: React.FocusEvent<HTMLInputElement>) => {
    if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.closest('[data-quote-customer-candidates]')) setShowCustomerDropdown(false);
  };

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
          price: Number(item.price ?? 0),
          quantity: Number(item.quantity ?? 1),
          total: Number(item.total ?? 0),
          id: item.id || `${item.originalProductId || item.id}-${Date.now()}-${Math.random()}`, // Ensure unique ID
          originalProductId: item.originalProductId || item.id, // Keep reference to original product
          description: item.description || '',
          specifications: item.specifications || ''
        }));
        
        console.log('Processed items for selectedProducts:', processedItems);
        setSelectedProducts(processedItems);
        setPriceEditing({});

        // Parse quote_data for payment info
        let paymentData = {
          payment1: 0,
          payment2: 0
        };
        if (initialData.quote_data) {
          try {
            const quoteData = typeof initialData.quote_data === 'string' ? JSON.parse(initialData.quote_data) : initialData.quote_data;
            paymentData = {
              payment1: Number(quoteData.payment1 ?? 0),
              payment2: Number(quoteData.payment2 ?? 0)
            };
          } catch (error) {
            console.error('Error parsing quote_data:', error);
          }
        }

        // Reset form with new data
        form.reset({
          title: initialData.title || initialQuoteData(initialData.quote_data).title as string || "BẢNG BÁO GIÁ",
          quoteNumber: initialData.quote_number || `BG-${format(new Date(), "yyyyMMdd")}-${Math.floor(Math.random() * 1000)}`,
          quoteDate: quoteCalendarDate(resolveQuoteDates(initialData).quoteDate),
          expiryDate: quoteCalendarDate(resolveQuoteDates(initialData).expiryDate),
          customerName: initialData.customerName || "",
          phone: initialData.customerPhone || "",
          email: initialData.customerEmail || "",
          address: initialData.customerAddress || "",
          priceList: initialData.price_list_id || "",
          responsible: initialData.assignee_id || "",
          includeVAT: initialData.include_vat || false,
          vatRate: Number(initialData.vat_rate ?? 8),
          payment1: paymentData.payment1,
          payment2: paymentData.payment2
        });
      } catch (error) {
        console.error('Error parsing initial data:', error);
      }
    }
  }, [initialData, form]);
  const loadPriceLists = async () => {
    setPriceListsLoading(true);
    setPriceListsError(false);
    try {
      if (isLocalBackend()) {
        setPriceLists((await localApi.catalogPriceLists() as PriceList[]).filter(row => row.status === 'active'));
        return;
      }
      const { data, error } = await supabase.from("price_lists").select("id, name, year, status").eq("status", "active").order("year", { ascending: false });
      if (error) throw error;
      setPriceLists(data || []);
    } catch (error) {
      setPriceListsError(true);
      toast({ title: "Lỗi", description: "Không thể tải danh sách bảng giá", variant: "destructive" });
    } finally {
      setPriceListsLoading(false);
    }
  };

  const loadProducts = useCallback(async (priceListId: string) => {
    // A delayed create-product refresh must not invalidate the catalog for a newer selection.
    if (!productsMounted.current || form.getValues('priceList') !== priceListId) return;
    const request = ++productsRequest.current;
    const isCurrent = () => productsMounted.current && request === productsRequest.current && form.getValues('priceList') === priceListId;
    setProducts([]);
    setProductsPriceListId(priceListId);
    setProductsLoading(Boolean(priceListId));
    setProductsError('');
    if (!priceListId) return;
    try {
      if (isLocalBackend()) {
        const data = await localApi.catalogProducts({ priceListId });
        if (isCurrent()) setProducts(data as unknown as Product[]);
        return;
      }
      let { data, error } = await supabase.from("products").select("id, name, description, price, cost_price, sku, category, specifications, in_stock, price_list_id").eq("price_list_id", priceListId).eq("in_stock", true).order("name");
      if (error) throw error;
      if (!isCurrent()) return;
      // Preserve the existing safe catalog fallback when RLS hides another manager's products.
      if (!data || data.length === 0) {
        const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_products_catalog', {
          _price_list_id: priceListId, _in_stock: true, _limit: 10000, _offset: 0,
        });
        if (rpcError) throw rpcError;
        if (Array.isArray(rpcData)) data = rpcData.map((row: Product) => ({ ...row, cost_price: null }));
      }
      if (isCurrent()) setProducts((data as unknown as Product[]) || []);
    } catch (error) {
      if (isCurrent()) setProductsError('Không thể tải danh sách sản phẩm. Các dòng đã nhập được giữ nguyên.');
    } finally {
      if (isCurrent()) setProductsLoading(false);
    }
  }, [form]);

  useEffect(() => {
    productsMounted.current = true;
    return () => { productsMounted.current = false; invalidateProductsRequest(); };
  }, [invalidateProductsRequest]);

  useEffect(() => {
    // Catalog requests never own quote lines, including manual and restored draft lines.
    void loadProducts(selectedPriceListId);
    return invalidateProductsRequest;
  }, [selectedPriceListId, loadProducts, invalidateProductsRequest]);
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
    setSelectedProducts(prev => prev.map(item => {
      if (item.id === productId) {
        return {
          ...item,
          quantity,
          total: draftLineAmount(quantity, item.price)
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
          total: draftLineAmount(item.quantity, price)
        };
      }
      return item;
    }));
  };

  // Function to recalculate all totals to fix any inconsistencies
  const recalculateAllTotals = () => {
    setSelectedProducts(prev => prev.map(item => ({
      ...item,
      total: draftLineAmount(item.quantity, item.price)
    })));
  };
  const removeProduct = (productId: string) => {
    setSelectedProducts(prev => prev.filter(item => item.id !== productId));
    setPriceEditing(previous => { const next = { ...previous }; delete next[productId]; return next; });
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
      if (isLocalBackend()) {
        await localApi.createCatalogProduct({
          name: newProductName,
          description: newProductDescription || null,
          price: newProductPrice ? parseFloat(newProductPrice) : null,
          cost_price: newProductCostPrice ? parseFloat(newProductCostPrice) : null,
          sku: newProductSku || null,
          category: newProductCategory || null,
          specifications: newProductSpecifications || null,
          in_stock: newProductInStock,
          price_list_id: selectedPriceList,
        });
        toast({ title: "Thành công", description: "Đã tạo sản phẩm thành công" });
        setNewProductName(''); setNewProductDescription(''); setNewProductPrice(''); setNewProductCostPrice(''); setNewProductSku(''); setNewProductCategory(''); setNewProductSpecifications(''); setNewProductInStock(true); setShowCreateProduct(false);
        await loadProducts(selectedPriceList);
        return;
      }
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

      await loadProducts(selectedPriceList);

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
    if (accountChanged || (customerAccount.current && customerAccount.current !== currentUser?.id)) return;
    const submitRequest = identityRequest.current;
    // CRITICAL: Validate managerId before submit to prevent race condition
    if (!managerId || (isLocalBackend() && (isLoading || isLoadingUser))) {
      toast({
        title: "Lỗi xác thực",
        description: "⚠️ Đang tải thông tin người dùng. Vui lòng đợi vài giây và thử lại.",
        variant: "destructive"
      });
      return;
    }

    let submitManagerId = managerId;
    if (isLocalBackend()) {
      const request = identityRequest.current;
      setIsLoading(true);
      try {
        const me = await getLocalMe(true);
        if (request !== identityRequest.current) return;
        submitManagerId = localQuoteManagerId(me);
        if (me.user_id !== currentUser?.id) throw new Error('Tài khoản đăng nhập đã thay đổi. Vui lòng tải lại quyền trước khi lưu báo giá.');
        setUserRole(me.role);setManagerId(submitManagerId);setIdentityError('');
      } catch (error) {
        if (request === identityRequest.current) {
          const message = error instanceof Error ? error.message : 'Không xác thực được tài khoản local. Vui lòng thử lại.';
          setCurrentUser(null);setUserRole(null);setManagerId(null);setIdentityError(message);
          toast({title:'Không thể xác thực quyền lưu báo giá',description:message,variant:'destructive'});
        }
        return;
      } finally {
        if (request === identityRequest.current) setIsLoading(false);
      }
    } else {
      // The public Supabase authentication path is unchanged.
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast({
          title: "⚠️ Phiên đăng nhập đã hết hạn",
          description: "Vui lòng đăng nhập lại để tiếp tục tạo báo giá.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }
    }

    const nonBlankProducts = selectedProducts.filter(item => !isBlankQuoteLine(item));
    if (nonBlankProducts.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một sản phẩm",
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    try {

      // Calculate total
      if (isLocalBackend() && initialData?.status === 'approved') throw new Error('Báo giá đã duyệt không thể sửa. Hãy nhân bản thành bản nháp mới.');
      const calculation = calculateQuote({ items: nonBlankProducts, includeVAT: data.includeVAT, vatRate: data.vatRate, payment1: data.payment1, payment2: data.payment2 });
      const { subtotal, vatAmount, total: calculatedTotal } = calculation;
      // Prepare quote data
      const baseQuoteData = {
        quote_number: data.quoteNumber,
        customer_id: selectedCustomerId,
        total_amount: calculatedTotal,
        subtotal: subtotal,
        vat_amount: vatAmount,
        include_vat: data.includeVAT,
        vat_rate: data.vatRate,
        price_list_id: data.priceList || null,
        assignee_id: data.responsible || null,
        status: initialData ? initialData.status : "draft",
        notes: `Khách hàng: ${data.customerName}\nĐiện thoại: ${data.phone}\nEmail: ${data.email}\nĐịa chỉ: ${data.address}\nNgày hết hạn: ${data.expiryDate && !isNaN(data.expiryDate.getTime()) ? format(data.expiryDate, "dd/MM/yyyy", { locale: vi }) : ""}`,
        items: JSON.stringify(calculation.items),
        quote_data: JSON.stringify({
          title: data.title,
          customerName: data.customerName, customerPhone: data.phone, customerEmail: data.email, customerAddress: data.address,
          includeVAT: data.includeVAT,
          vatRate: data.vatRate,
          payment1: data.payment1 || 0,
          payment2: data.payment2 || 0,
        quoteDate: quoteCalendarDateIso(data.quoteDate) // Lưu ngày báo giá vào quote_data thay vì created_at
      }),
      tenant_id: "default",
      manager_id: managerId // CRITICAL: Include manager_id for RLS validation during updates
    };

      if (isLocalBackend()) {
        const localData: Record<string, unknown> = {
          ...baseQuoteData,
          manager_id: submitManagerId,
          customer: { name: data.customerName, phone: data.phone, email: data.email, address: data.address },
          items: calculation.items,
          quote_data: JSON.parse(baseQuoteData.quote_data),
          created_at: quoteCalendarDateIso(data.quoteDate),
        };
        if (initialData) {
          delete localData.manager_id; // Editing never reassigns the persisted owner, including null.
          await localApi.updateQuote(initialData.id, localData);
        } else {
          await localApi.createQuote({ ...localData, idempotency_key: creationKey.current });
          creationKey.current = crypto.randomUUID();
        }
        if (submitRequest !== identityRequest.current) return;
        toast({ title: "Thành công", description: initialData ? "Báo giá đã được cập nhật thành công" : "Báo giá đã được tạo thành công" });
        localStorage.removeItem(DRAFT_KEY);
        setLastSavedAt(null);
        onSubmit?.();
        return;
      }

      if (initialData) {
        // Update existing quote - also sync created_at with quoteDate
        const adjustedQuoteDate = quoteCalendarDateIso(data.quoteDate);
        const {
          error
        } = await supabase.from("quotes").update({
          ...baseQuoteData,
          created_at: adjustedQuoteDate,
        }).eq('id', initialData.id);
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
              items: JSON.stringify(calculation.items),
              total_amount: orderTotal,
              notes: `Được cập nhật từ báo giá ${data.quoteNumber} (${new Date().toLocaleString('vi-VN')})\nKhách hàng: ${data.customerName}\nĐiện thoại: ${data.phone}`,
              updated_at: new Date().toISOString(),
              // Không update created_at của order để tránh lỗi
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
              customer_id: selectedCustomerId,
              manager_id: managerId, // Use correct manager_id
              assignee_id: data.responsible || null,
              // Sử dụng ngày hiện tại cho created_at, lưu quoteDate vào notes
              total_amount: orderTotal,
              status: 'pending',
              items: JSON.stringify(calculation.items),
              notes: null,
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
        // Create new quote - chỉ khi tạo mới mới set created_at và manager_id
        const quoteDataWithCreatedAt = {
          ...baseQuoteData,
          created_at: quoteCalendarDateIso(data.quoteDate),
          manager_id: managerId // Use correct manager_id based on role
        };
        const {
          error
        } = await supabase.from("quotes").insert([quoteDataWithCreatedAt]);
        if (error) throw error;
        toast({
          title: "Thành công",
          description: "Báo giá đã được tạo thành công"
        });
      }
      // Clear draft after successful submit
      localStorage.removeItem(DRAFT_KEY);
      setLastSavedAt(null);
      onSubmit?.();
    } catch (error: any) {
      if (isLocalBackend() && submitRequest !== identityRequest.current) return;
      if (error instanceof LocalApiError && error.status === 409 && error.details?.code === 'QUOTE_CUSTOMER_CONFLICT') {
        setCustomerConflict({ message: error.message, candidates: error.details.candidates });
        requestAnimationFrame(() => {
          customerSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          form.setFocus('customerName');
        });
        return;
      }
      console.error("Error creating quote:", error);
      
      // Parse specific error types
      let errorMessage = "Không thể tạo báo giá. Vui lòng thử lại.";
      
      if (error.message?.includes('row-level security')) {
        errorMessage = "⚠️ Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
      } else if (error.message?.includes('JWT')) {
        errorMessage = "🔐 Token không hợp lệ. Vui lòng đăng nhập lại.";
      } else if (error.message?.includes('Authentication required')) {
        errorMessage = "🔒 Yêu cầu xác thực. Vui lòng đăng nhập.";
      } else if (error.message) {
        errorMessage = `Lỗi: ${error.message}`;
      }
      
      toast({
        title: "Lỗi tạo báo giá",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      if (!isLocalBackend() || submitRequest === identityRequest.current) setIsLoading(false);
    }
  };
  const watchedValues = form.watch();

  // Auto-save draft to localStorage (only for new quotes, not editing)
  const debouncedFormData = useDebounce(JSON.stringify(watchedValues), 3000);
  const debouncedProducts = useDebounce(JSON.stringify(selectedProducts), 3000);

  useEffect(() => {
    if (accountChanged || initialData || !currentUser?.id || isLoadingUser || customerAccount.current !== currentUser.id) return; // Never mix account drafts
    const hasMeaningfulProducts = selectedProducts.some(item => !isBlankQuoteLine(item));
    if (!watchedValues.customerName && !hasMeaningfulProducts) return; // Don't save empty forms
    
    try {
      const draft = {
        formData: {
          ...watchedValues,
          quoteDate: watchedValues.quoteDate ? quoteCalendarDateIso(watchedValues.quoteDate) : null,
          expiryDate: watchedValues.expiryDate ? quoteCalendarDateIso(watchedValues.expiryDate) : null,
        },
        customerId: selectedCustomerId,
        customerName: selectedCustomerName,
        accountId: currentUser.id,
        selectedProducts,
        savedAt: new Date().toISOString(),
      };

      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setLastSavedAt(format(new Date(), 'HH:mm:ss'));
    } catch (e) {
      console.warn('Failed to save draft:', e);
    }
  }, [debouncedFormData, debouncedProducts, initialData, selectedCustomerId, selectedCustomerName, DRAFT_KEY, currentUser?.id, isLoadingUser, accountChanged]);

  // Check for saved draft on mount (only for new quotes)
  useEffect(() => {
    if (accountChanged || initialData || !currentUser?.id || isLoadingUser || customerAccount.current !== currentUser.id) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.accountId === currentUser.id) {
          setSavedDraft(draft);
          setShowDraftRecovery(true);
        }
      }
    } catch (e) {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [initialData, DRAFT_KEY, currentUser?.id, isLoadingUser, accountChanged]);

  const restoreDraft = () => {
    if (accountChanged || customerAccount.current !== currentUser?.id || !savedDraft || savedDraft.accountId !== currentUser?.id || initialData) return;
    setPriceEditing({});
    try {
      const { formData, selectedProducts: draftProducts } = savedDraft;
      form.reset({
        ...formData,
        quoteDate: quoteCalendarDate(formData.quoteDate),
        expiryDate: quoteCalendarDate(formData.expiryDate),
      });
      setSelectedCustomerId(savedDraft.customerId || null);
      setSelectedCustomerName(savedDraft.customerName || formData.customerName || '');
      selectedIdentityName.current = formData.customerName || '';
      if (draftProducts && draftProducts.length > 0) {
        setSelectedProducts(draftProducts);
      }
      toast({ title: "Đã khôi phục", description: "Bản nháp đã được khôi phục thành công" });
    } catch (e) {
      console.error('Failed to restore draft:', e);
      toast({ title: "Lỗi", description: "Không thể khôi phục bản nháp", variant: "destructive" });
    }
    setShowDraftRecovery(false);
    setSavedDraft(null);
  };

  const discardDraft = () => {
    if (accountChanged || customerAccount.current !== currentUser?.id) return;
    localStorage.removeItem(DRAFT_KEY);
    setShowDraftRecovery(false);
    setSavedDraft(null);
  };

  // Ensure all totals are correctly calculated
  // Incomplete new rows may exist while typing; submit always validates the full list.
  const activeLinesForDisplay = selectedProducts.filter(item => !isBlankQuoteLine(item));
  const { lineErrors, validLineCount, calculationError, calculation: displayCalculation } = quoteFormPreview(
    selectedProducts.flatMap((item, index) => isBlankQuoteLine(item) ? [] : [{ item, index, id: item.id }]), {
      includeVAT: watchedValues.includeVAT,
      vatRate: watchedValues.vatRate,
      payment1: watchedValues.payment1,
      payment2: watchedValues.payment2
    });
  const { subtotal, vatAmount, total, remaining } = displayCalculation ?? { subtotal: null, vatAmount: null, total: null, remaining: null };
  const [showLivePreview, setShowLivePreview] = useState(false);
  const previewAmount = (value: number | null) => value === null ? 'Chưa thể tính' : `${value.toLocaleString('vi-VN')} đ`;
  const canOpenLivePreview = Boolean(displayCalculation && validLineCount > 0 && !calculationError);
  const livePreviewQuote = canOpenLivePreview && displayCalculation ? {
    id: initialData?.id || 'draft-preview',
    quote_number: watchedValues.quoteNumber || initialData?.quote_number || 'NHAP',
    status: initialData?.status || 'draft',
    created_at: watchedValues.quoteDate ? quoteCalendarDateIso(watchedValues.quoteDate) : new Date().toISOString(),
    notes: watchedValues.expiryDate ? `Ngày hết hạn: ${format(watchedValues.expiryDate, 'dd/MM/yyyy')}` : '',
    include_vat: Boolean(watchedValues.includeVAT),
    vat_rate: Number(watchedValues.vatRate ?? 8),
    subtotal: displayCalculation.subtotal,
    vat_amount: displayCalculation.vatAmount,
    total_amount: displayCalculation.total,
    items: activeLinesForDisplay,
    quote_data: {
      title: watchedValues.title || 'BẢNG BÁO GIÁ',
      customerName: (watchedValues.customerName || '').trim() || 'Khách hàng (Bản nháp)',
      customerPhone: (watchedValues.phone || '').trim(),
      customerEmail: (watchedValues.email || '').trim(),
      customerAddress: (watchedValues.address || '').trim(),
      includeVAT: Boolean(watchedValues.includeVAT),
      vatRate: Number(watchedValues.vatRate ?? 8),
      subtotal: displayCalculation.subtotal,
      vatAmount: displayCalculation.vatAmount,
      total: displayCalculation.total,
      payment1: Number(watchedValues.payment1 ?? 0),
      payment2: Number(watchedValues.payment2 ?? 0),
      remaining: displayCalculation.remaining,
      items: activeLinesForDisplay,
    },
  } : null;

  return (
    <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-clip bg-background text-foreground">
      {productPickerTarget && (
        <QuoteProductPicker
          key={productPickerTarget.lineId}
          products={products}
          ready={productPickerReady}
          initialSearch={productPickerTarget.initialSearch}
          onSelect={selectCatalogProduct}
          onClose={() => setProductPickerTarget(null)}
          onRestoreFocus={() => {
            const trigger = productPickerTrigger.current;
            if (trigger?.isConnected) trigger.focus();
            else productPickerFallback.current?.focus();
          }}
        />
      )}

      {/* Sticky Header */}
      <div className="z-20 shrink-0 border-b bg-background px-4 sm:px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
            <h1 className="text-base font-semibold text-foreground truncate">
              {initialData ? 'Chỉnh sửa báo giá' : 'Tạo báo giá mới'}
            </h1>
            {watchedValues.quoteNumber && (
              <span className="max-w-full truncate text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border/60">
                {watchedValues.quoteNumber}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastSavedAt && !initialData && (
              <span className="text-xs text-muted-foreground hidden sm:inline-flex items-center gap-1">
                <Save className="h-3 w-3" />
                Đã lưu nháp {lastSavedAt}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Draft recovery banner */}
      {showDraftRecovery && savedDraft && (
        <div className="shrink-0 border-b bg-muted/50 px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs sm:text-sm text-foreground">
            Bạn có bản nháp chưa lưu từ{' '}
            <span className="font-medium">
              {savedDraft.savedAt ? format(new Date(savedDraft.savedAt), 'HH:mm dd/MM/yyyy', { locale: vi }) : 'trước đó'}
            </span>
            . Bạn có muốn khôi phục không?
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="default" className="h-7 text-xs px-2.5" onClick={restoreDraft}>
              Khôi phục
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={discardDraft}>
              Bỏ qua
            </Button>
          </div>
        </div>
      )}

      <div ref={productPickerFallback} tabIndex={-1} className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-4">
        <Form {...form}>
          <form id={quoteFormId} onSubmit={form.handleSubmit(handleSubmit)} className="min-w-0 space-y-4">
            {/* Khối 1: Thông tin chứng từ & Khách hàng */}
            <Card className="border shadow-none">
              <CardHeader className="py-2.5 px-4 border-b bg-muted/30">
                <CardTitle className="text-sm font-semibold text-foreground">Thông tin chung & Khách hàng</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Hàng 1: Thông tin chứng từ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  <FormField control={form.control} name="quoteNumber" render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium text-muted-foreground">
                        Số báo giá <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="BG-20261027-001" className="h-9 text-sm font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="quoteDate" render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium text-muted-foreground">
                        Ngày báo giá <span className="text-destructive">*</span>
                      </FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              className={cn("w-full h-9 pl-3 text-left font-normal text-sm", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "dd/MM/yyyy", { locale: vi }) : <span>Chọn ngày</span>}
                              <CalendarIcon className="ml-auto h-3.5 w-3.5 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => {
                              if (date) {
                                field.onChange(date);
                              }
                            }}
                            disabled={date => date < new Date("1900-01-01")}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="expiryDate" render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium text-muted-foreground">
                        Ngày hết hạn <span className="text-destructive">*</span>
                      </FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              className={cn("w-full h-9 pl-3 text-left font-normal text-sm", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "dd/MM/yyyy", { locale: vi }) : <span>Chọn ngày</span>}
                              <CalendarIcon className="ml-auto h-3.5 w-3.5 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => {
                              if (date) {
                                field.onChange(date);
                              }
                            }}
                            disabled={date => date < new Date()}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="priceList" render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium text-muted-foreground">
                        Bảng giá <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select onValueChange={value => { if (value) field.onChange(value); }} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Chọn bảng giá" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {field.value && !priceLists.some(row => row.id === field.value) && <SelectItem value={field.value} disabled>{savedPriceListLabel}</SelectItem>}
                          {priceLists.map(priceList => <SelectItem key={priceList.id} value={priceList.id}>
                              {priceList.name} ({priceList.year})
                            </SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="responsible" render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium text-muted-foreground">Người phụ trách</FormLabel>
                      <AssigneeManagement value={field.value} onChange={field.onChange} placeholder="Chọn người phụ trách" />
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium text-muted-foreground">
                        Tiêu đề báo giá <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="BẢNG BÁO GIÁ" className="h-9 text-sm" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Cảnh báo hoặc liên kết khách hàng */}
                <div ref={customerSection} className="space-y-2.5 empty:hidden">
                  {selectedCustomerId && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs sm:text-sm">
                      <span>
                        Đã liên kết khách hàng: <strong>{selectedCustomerName || form.getValues('customerName')}</strong>. Số điện thoại, email và địa chỉ đang nhập chỉ áp dụng cho báo giá này.
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setSelectedCustomerId(null);
                          setSelectedCustomerName('');
                          setCustomerConflict(null);
                          form.setFocus('customerName');
                        }}
                      >
                        Đổi khách hàng
                      </Button>
                    </div>
                  )}
                  {customerConflict && (
                    <div role="alert" className="space-y-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
                      <p>{customerConflict.message}</p>
                      <p>Chọn đúng hồ sơ để liên kết. Sản phẩm và thông tin giao hàng đã nhập được giữ lại.</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {customerConflict.candidates.map(customer => (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => chooseCustomer(customer, true)}
                            className="min-w-0 rounded-md border border-amber-300 bg-background p-2.5 text-left hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="block font-medium">{customer.name}{!customer.is_active && ' (ngừng hoạt động)'}</span>
                            <span className="block break-words text-xs">{[customer.phone, customer.email, customer.address].filter(Boolean).join(' • ') || 'Chưa có thông tin liên hệ'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Hàng 2: Thông tin khách hàng */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-3 border-t border-border/60">
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem className="relative space-y-1 lg:col-span-4">
                      <FormLabel className="text-xs font-medium text-muted-foreground">
                        Tên khách hàng <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            {...field}
                            aria-label="Tên khách hàng"
                            placeholder="Nhập tên khách hàng để tìm..."
                            className="pl-8 h-9 text-sm"
                            onChange={(e) => {
                              field.onChange(e);
                              beginCustomerSearch('name', e.target.value);
                            }}
                            onFocus={() => {
                              if (field.value && field.value.length >= 2) {
                                beginCustomerSearch('name', field.value);
                              }
                            }}
                            onBlur={leaveCustomerSearch}
                          />
                        </div>
                      </FormControl>
                      {customerDropdown('name')}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem className="relative space-y-1 lg:col-span-2">
                      <FormLabel className="text-xs font-medium text-muted-foreground">Số điện thoại</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            {...field}
                            aria-label="Số điện thoại khách hàng"
                            placeholder="Nhập SĐT..."
                            className="pl-8 h-9 text-sm"
                            onChange={(e) => {
                              field.onChange(e);
                              beginCustomerSearch('phone', e.target.value);
                            }}
                            onFocus={() => {
                              if (field.value && field.value.length >= 2) {
                                beginCustomerSearch('phone', field.value);
                              }
                            }}
                            onBlur={leaveCustomerSearch}
                          />
                        </div>
                      </FormControl>
                      {customerDropdown('phone')}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem className="relative space-y-1 lg:col-span-4">
                      <FormLabel className="text-xs font-medium text-muted-foreground">Địa chỉ</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            {...field}
                            aria-label="Địa chỉ khách hàng"
                            placeholder="Nhập địa chỉ giao hàng / tìm KH..."
                            className="pl-8 h-9 text-sm"
                            onChange={(e) => {
                              field.onChange(e);
                              beginCustomerSearch('address', e.target.value);
                            }}
                            onFocus={() => {
                              if (field.value && field.value.length >= 2) {
                                beginCustomerSearch('address', field.value);
                              }
                            }}
                            onBlur={leaveCustomerSearch}
                          />
                        </div>
                      </FormControl>
                      {customerDropdown('address')}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem className="space-y-1 lg:col-span-2">
                      <FormLabel className="text-xs font-medium text-muted-foreground">Email</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="email@congty.com" className="h-9 text-sm" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            {/* Khối 2: Danh sách sản phẩm */}
            <Card className="border shadow-none">
              <CardHeader className="py-2.5 px-4 border-b bg-muted/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <CardTitle className="text-sm font-semibold text-foreground">Danh sách sản phẩm</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      Bảng giá: <strong className="font-medium text-foreground">{selectedPriceListLabel}</strong>
                      {catalogReady && ` • ${products.length} sản phẩm trong danh mục`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!catalogReady}
                      className="h-8 text-xs"
                      onClick={() => setShowCreateProduct(true)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Tạo sản phẩm mới
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setSelectedProducts(prev => [...prev, createEmptyQuoteLine()]);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Thêm sản phẩm
                    </Button>
                  </div>
                </div>

                {catalogReady && products.length > 0 && (
                  <div className="pt-2">
                    <AIQuoteFill
                      products={products}
                      priceListId={watchedValues.priceList}
                      onProductsSelected={async (items) => {
                        const request = productsRequest.current;
                        const allImageFiles = await loadImageFiles();
                        if (!productsMounted.current || request !== productsRequest.current || form.getValues('priceList') !== selectedPriceListId) return;

                        const normalize = (text: string) => text.toLowerCase()
                          .normalize('NFD').replace(/[̀-ͯ]/g, '')
                          .replace(/đ/g, 'd').replace(/Đ/g, 'd')
                          .replace(/[^a-z0-9]/g, '');

                        const extractKeywords = (text: string) => {
                          const norm = normalize(text);
                          return norm.match(/[a-z0-9]{3,}/g) || [];
                        };

                        const newItems = items.map((item) => {
                          const originalProduct = products.find(p => p.id === item.matchedProductId);
                          let selectedImage = '';
                          const productName = originalProduct?.name || item.customName;
                          const normalizedProductName = normalize(productName);
                          const normalizedCustomName = normalize(item.customName);
                          const productKeywords = extractKeywords(productName);
                          const customKeywords = extractKeywords(item.customName);
                          const allSearchKeywords = [...new Set([...productKeywords, ...customKeywords])];

                          if (allImageFiles.length > 0 && normalizedProductName) {
                            let bestMatch: { name: string; folder: string; score: number } | null = null;
                            for (const img of allImageFiles) {
                              const normalizedFileName = normalize(img.name.replace(/.[^.]+$/, ''));
                              const normalizedFullPath = normalize(img.folder ? `${img.folder}/${img.name}` : img.name);
                              const normalizedFolder = normalize(img.folder || '');
                              let score = 0;

                              if (normalizedFileName === normalizedProductName || normalizedFileName === normalizedCustomName) {
                                score = 100;
                              } else if (normalizedFullPath.includes(normalizedProductName) && normalizedProductName.length > 5) {
                                score = 85;
                              } else if (normalizedFileName.includes(normalizedProductName) && normalizedProductName.length > 5) {
                                score = 80;
                              } else if (normalizedProductName.includes(normalizedFileName) && normalizedFileName.length > 8) {
                                score = 65;
                              } else {
                                const fileKeywords = extractKeywords(img.name.replace(/.[^.]+$/, ''));
                                const folderKeywords = extractKeywords(img.folder || '');
                                const allFileKeywords = [...fileKeywords, ...folderKeywords];

                                let overlap = 0;
                                for (const kw of allSearchKeywords) {
                                  if (allFileKeywords.some(fk => fk.includes(kw) || kw.includes(fk))) {
                                    overlap++;
                                  }
                                }
                                if (overlap >= 2) score = Math.min(overlap * 20, 60);
                                else if (overlap === 1 && allSearchKeywords.length <= 3) score = 15;
                              }

                              if (normalizedFolder && score > 0) {
                                if (normalizedProductName.includes(normalizedFolder) || normalizedFolder.includes(normalize(originalProduct?.category || ''))) {
                                  score += 5;
                                }
                              }

                              if (score >= 15 && (!bestMatch || score > bestMatch.score)) {
                                bestMatch = { ...img, score };
                              }
                            }

                            if (bestMatch) {
                              const imgPath = bestMatch.folder ? `${bestMatch.folder}/${bestMatch.name}` : bestMatch.name;
                              const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(imgPath);
                              selectedImage = urlData.publicUrl;
                            }
                          }

                          return {
                            id: `${item.matchedProductId}-${Date.now()}-${Math.random()}`,
                            name: item.customName,
                            sku: originalProduct?.sku || '',
                            price: item.price,
                            quantity: item.quantity,
                            total: item.price * item.quantity,
                            description: originalProduct?.description || '',
                            specifications: item.specifications,
                            selectedImage,
                            originalProductId: item.matchedProductId,
                          };
                        });
                        setSelectedProducts(prev => [...prev.filter(row => !isBlankQuoteLine(row)), ...newItems]);
                      }}
                    />
                  </div>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {productsLoading && (
                  <p role="status" className="px-4 py-2.5 text-xs text-muted-foreground border-b bg-muted/10">
                    Đang tải danh sách sản phẩm… Các dòng đã nhập được giữ nguyên.
                  </p>
                )}
                {productsError && (
                  <div role="alert" className="flex items-center gap-3 px-4 py-2.5 text-xs text-destructive border-b bg-destructive/5">
                    <span>{productsError}</span>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void loadProducts(selectedPriceListId)}>
                      Thử tải lại sản phẩm
                    </Button>
                  </div>
                )}
                {!selectedPriceListId && (
                  <p className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/10">
                    Chọn bảng giá ở trên để tra cứu từ danh mục, hoặc nhập trực tiếp sản phẩm vào bảng bên dưới.
                  </p>
                )}

                <div className="max-w-full min-w-0 overflow-x-auto bg-background" role="region" aria-label="Bảng sản phẩm, có thể cuộn ngang" tabIndex={0}>
                  <Table disableWrapper className="w-full border-collapse">
                    <TableHeader>
                      <TableRow className="bg-muted/40 border-b">
                        <TableHead className="font-medium text-xs text-center w-12 min-w-[48px] text-muted-foreground border-r px-2 py-2 h-9">#</TableHead>
                        <TableHead className="font-medium text-xs min-w-[260px] text-muted-foreground border-r px-2.5 py-2 h-9">Sản phẩm / Mã SP</TableHead>
                        <TableHead className="font-medium text-xs text-center w-14 min-w-[56px] text-muted-foreground border-r px-2 py-2 h-9">Ảnh</TableHead>
                        <TableHead className="font-medium text-xs min-w-[180px] text-muted-foreground border-r px-2.5 py-2 h-9">Mô tả</TableHead>
                        <TableHead className="font-medium text-xs min-w-[150px] text-muted-foreground border-r px-2.5 py-2 h-9">Quy cách</TableHead>
                        <TableHead className="font-medium text-xs text-right w-32 min-w-[128px] text-muted-foreground border-r px-2.5 py-2 h-9">Đơn giá</TableHead>
                        <TableHead className="font-medium text-xs text-center w-20 min-w-[84px] text-muted-foreground border-r px-2 py-2 h-9">SL</TableHead>
                        <TableHead className="font-medium text-xs text-right w-32 min-w-[128px] text-muted-foreground border-r px-2.5 py-2 h-9">Thành tiền</TableHead>
                        <TableHead className="font-medium text-xs text-center w-10 min-w-[40px] text-muted-foreground px-1.5 py-2 h-9"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <DragDropContext onDragEnd={handleDragEnd}>
                      <Droppable droppableId="products">
                        {(provided, snapshot) => (
                          <TableBody
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className={snapshot.isDraggingOver ? "bg-muted/20" : ""}
                          >
                            {selectedProducts.map((item, index) => (
                              <Draggable key={item.id} draggableId={item.id} index={index}>
                                {(provided, snapshot) => (
                                  <TableRow
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className={cn(
                                      "border-b hover:bg-muted/15 align-middle",
                                      snapshot.isDragging && "bg-background shadow-md border-primary/30 z-50"
                                    )}
                                    style={provided.draggableProps.style}
                                  >
                                    {/* STT + Drag */}
                                    <TableCell className="w-12 min-w-[48px] px-1.5 py-1.5 text-center border-r bg-muted/10">
                                      <div className="flex items-center justify-center gap-0.5">
                                        <div
                                          {...provided.dragHandleProps}
                                          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground"
                                          title="Kéo để đổi thứ tự"
                                        >
                                          <GripVertical className="h-3.5 w-3.5" />
                                        </div>
                                        <span className="text-xs font-mono text-muted-foreground min-w-[1.25rem]">
                                          {index + 1}
                                        </span>
                                      </div>
                                    </TableCell>

                                    {/* Gộp Chọn SP + Tên sản phẩm */}
                                    <TableCell className="min-w-[260px] p-1.5 border-r">
                                      <div className="flex items-center gap-1.5">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          disabled={!catalogReady}
                                          title={catalogReady ? "Chọn sản phẩm từ bảng giá" : "Chọn bảng giá trước để tra cứu danh mục"}
                                          className="h-8 px-2 text-xs font-normal shrink-0 gap-1 bg-muted/20 hover:bg-muted"
                                          onClick={event => {
                                            productPickerTrigger.current = event.currentTarget;
                                            setProductPickerTarget({
                                              lineId: item.id,
                                              priceListId: selectedPriceListId,
                                              catalog: products,
                                              initialSearch: item.sku || item.name || ''
                                            });
                                          }}
                                        >
                                          <Search className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className={cn("max-w-[84px] truncate", item.sku ? "font-mono font-medium text-foreground" : "text-muted-foreground")}>
                                            {item.sku ? item.sku : "Danh mục"}
                                          </span>
                                        </Button>
                                        <Input
                                          value={item.name}
                                          aria-label={`Tên sản phẩm dòng ${index + 1}`}
                                          aria-invalid={Boolean(lineErrors[item.id])}
                                          aria-describedby={lineErrors[item.id] ? `${quoteFormId}-line-${item.id}` : undefined}
                                          onChange={e => {
                                            const newProducts = [...selectedProducts];
                                            newProducts[index] = {
                                              ...item,
                                              name: e.target.value
                                            };
                                            setSelectedProducts(newProducts);
                                          }}
                                          placeholder="Nhập tên sản phẩm..."
                                          className="h-8 text-sm flex-1 min-w-[140px]"
                                        />
                                      </div>
                                      {lineErrors[item.id] && <p id={`${quoteFormId}-line-${item.id}`} className="mt-1 max-w-[260px] whitespace-normal text-xs text-destructive" role="alert">{lineErrors[item.id]}</p>}
                                    </TableCell>

                                    {/* Hình ảnh */}
                                    <TableCell className="w-14 min-w-[56px] p-1.5 text-center border-r">
                                      <Dialog
                                        open={imageDialogOpen[index] || false}
                                        onOpenChange={open => {
                                          setImageDialogOpen(prev => ({
                                            ...prev,
                                            [index]: open
                                          }));
                                        }}
                                      >
                                        <DialogTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 w-10 p-0 border-dashed mx-auto flex items-center justify-center"
                                            type="button"
                                            title="Chọn hình ảnh sản phẩm"
                                          >
                                            {item.selectedImage ? (
                                              <img
                                                src={transformImageUrl(item.selectedImage, { width: 80, quality: 70 })}
                                                alt="Selected"
                                                className="w-full h-full object-cover rounded-sm"
                                                loading="lazy"
                                              />
                                            ) : (
                                              <Image className="h-3.5 w-3.5 text-muted-foreground" />
                                            )}
                                          </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
                                          <DialogHeader>
                                            <DialogTitle>Chọn hình ảnh sản phẩm</DialogTitle>
                                          </DialogHeader>
                                          <div className="h-[70vh] overflow-y-auto">
                                            <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Đang tải thư viện hình ảnh...</div>}>
                                              <ProductImageLibrary
                                                hideDeleteButton={true}
                                                onSelectImage={imageUrl => {
                                                  const newProducts = [...selectedProducts];
                                                  newProducts[index] = {
                                                    ...newProducts[index],
                                                    selectedImage: imageUrl
                                                  };
                                                  setSelectedProducts(newProducts);
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
                                            </Suspense>
                                          </div>
                                        </DialogContent>
                                      </Dialog>
                                    </TableCell>

                                    {/* Mô tả */}
                                    <TableCell className="min-w-[180px] p-1.5 border-r">
                                      <div className="flex items-center gap-1">
                                        <Input
                                          value={item.description || ''}
                                          aria-label={`Mô tả dòng ${index + 1}`}
                                          onChange={e => {
                                            const newProducts = [...selectedProducts];
                                            newProducts[index] = {
                                              ...item,
                                              description: e.target.value
                                            };
                                            setSelectedProducts(newProducts);
                                          }}
                                          placeholder="Mô tả..."
                                          className="h-8 text-sm flex-1"
                                        />
                                        <Dialog>
                                          <DialogTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                                              title="Chỉnh sửa mô tả chi tiết"
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                                <path d="M12 20h9" />
                                                <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
                                              </svg>
                                            </Button>
                                          </DialogTrigger>
                                          <DialogContent className="sm:max-w-md">
                                            <DialogHeader>
                                              <DialogTitle>Chỉnh sửa mô tả sản phẩm</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-3">
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
                                                  className="min-h-32 resize-y mt-1.5"
                                                />
                                              </div>
                                            </div>
                                          </DialogContent>
                                        </Dialog>
                                      </div>
                                    </TableCell>

                                    {/* Quy cách */}
                                    <TableCell className="min-w-[150px] p-1.5 border-r">
                                      <div className="flex items-center gap-1">
                                        <Input
                                          value={(item as any).specifications || ''}
                                          aria-label={`Quy cách dòng ${index + 1}`}
                                          onChange={e => {
                                            const newProducts = [...selectedProducts];
                                            newProducts[index] = {
                                              ...item,
                                              specifications: e.target.value
                                            };
                                            setSelectedProducts(newProducts);
                                          }}
                                          placeholder="Quy cách..."
                                          className="h-8 text-sm flex-1"
                                        />
                                        <Dialog>
                                          <DialogTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                                              title="Chỉnh sửa quy cách chi tiết"
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                                <path d="M12 20h9" />
                                                <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
                                              </svg>
                                            </Button>
                                          </DialogTrigger>
                                          <DialogContent className="sm:max-w-md">
                                            <DialogHeader>
                                              <DialogTitle>Chỉnh sửa quy cách sản phẩm</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-3">
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
                                                  className="min-h-32 resize-y mt-1.5"
                                                />
                                              </div>
                                            </div>
                                          </DialogContent>
                                        </Dialog>
                                      </div>
                                    </TableCell>

                                    {/* Đơn giá */}
                                    <TableCell className="w-32 min-w-[128px] text-right p-1.5 border-r">
                                      <Input
                                        type="text"
                                        aria-label={`Đơn giá dòng ${index + 1}`}
                                        inputMode="decimal"
                                        value={priceEditing[item.id] ?? (Number.isFinite(item.price) ? item.price.toLocaleString('vi-VN', { maximumFractionDigits: 6 }) : '')}
                                        onChange={e => {
                                          const raw = e.target.value;
                                          setPriceEditing(previous => ({ ...previous, [item.id]: raw }));
                                          const price = parseQuotePriceInput(raw);
                                          updatePrice(item.id, price);
                                        }}
                                        onBlur={() => setPriceEditing(previous => { const next = { ...previous }; delete next[item.id]; return next; })}
                                        className="w-full h-8 text-right font-mono tabular-nums text-sm"
                                        placeholder="0"
                                      />
                                    </TableCell>

                                    {/* Số lượng */}
                                    <TableCell className="w-20 min-w-[84px] text-center p-1.5 border-r">
                                      <Input
                                        type="number"
                                        aria-label={`Số lượng dòng ${index + 1}`}
                                        value={item.quantity}
                                        onChange={e => {
                                          const quantity = Number(e.target.value);
                                          updateQuantity(item.id, quantity);
                                        }}
                                        className="w-full h-8 text-center font-mono tabular-nums text-sm"
                                        min="0.000001"
                                        step="any"
                                      />
                                    </TableCell>

                                    {/* Thành tiền */}
                                    <TableCell className="w-32 min-w-[128px] text-right font-mono tabular-nums font-semibold text-sm text-foreground px-2.5 py-1.5 border-r whitespace-nowrap">
                                      {lineErrors[item.id] ? '—' : `${item.total.toLocaleString('vi-VN')} đ`}
                                    </TableCell>

                                    {/* Xóa */}
                                    <TableCell className="w-10 min-w-[40px] text-center p-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:text-destructive h-7 w-7"
                                        onClick={() => removeProduct(item.id)}
                                        title="Xóa dòng"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                            {selectedProducts.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={9} className="text-center py-6 text-xs text-muted-foreground">
                                  Chưa có sản phẩm nào. Nhấn "Thêm dòng sản phẩm" để bắt đầu.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        )}
                      </Droppable>
                    </DragDropContext>
                  </Table>
                </div>

                {/* Thanh chân bảng sản phẩm */}
                <div className="px-3 py-2 border-t bg-muted/15 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedProducts(prev => [...prev, createEmptyQuoteLine()])}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm dòng sản phẩm
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {validLineCount}/{activeLinesForDisplay.length} dòng hợp lệ
                  </span>
                </div>
              </CardContent>
            </Card>

            {calculationError && <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{calculationError}</div>}

            {/* Khối 3: Tổng kết thanh toán (2 cột Trái - Phải) */}
            <Card className="border shadow-none">
              <CardHeader className="py-2.5 px-4 border-b bg-muted/30">
                <CardTitle className="text-sm font-semibold text-foreground">Thanh toán & Tổng kết giá trị</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Cột trái: Thiết lập VAT & Kế hoạch tạm ứng */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/15 px-3.5 py-2.5">
                      <FormField control={form.control} name="includeVAT" render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-2.5 space-y-0">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="text-sm font-medium cursor-pointer">
                            Bao gồm thuế GTGT (VAT)
                          </FormLabel>
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="vatRate" render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0 ml-auto">
                          <FormLabel className="text-xs text-muted-foreground whitespace-nowrap">Thuế VAT (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.001"
                              {...field}
                              disabled={!watchedValues.includeVAT}
                              onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                              placeholder="8"
                              className="h-8 w-24 text-right font-mono tabular-nums text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField control={form.control} name="payment1" render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-xs font-medium text-muted-foreground">Dự kiến thanh toán lần 1 (VNĐ)</FormLabel>
                          <FormControl>
                            <CurrencyInput value={field.value} onChange={field.onChange} placeholder="0" className="h-9 text-sm font-mono tabular-nums" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="payment2" render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-xs font-medium text-muted-foreground">Dự kiến thanh toán lần 2 (VNĐ)</FormLabel>
                          <FormControl>
                            <CurrencyInput value={field.value} onChange={field.onChange} placeholder="0" className="h-9 text-sm font-mono tabular-nums" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Đây là kế hoạch thanh toán dự kiến trên báo giá, không phải khoản thực thu. Tiền thực nhận được ghi nhận qua phiếu thu riêng.
                    </p>
                  </div>

                  {/* Cột phải: Bảng tổng hợp kiểu hóa đơn */}
                  <div className="lg:col-span-5 rounded-lg border bg-muted/20 p-3.5 space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Tạm tính (chưa GTGT):</span>
                      <span className="font-mono tabular-nums font-medium">{previewAmount(subtotal)}</span>
                    </div>
                    {watchedValues.includeVAT && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Thuế GTGT ({watchedValues.vatRate}%):</span>
                        <span className="font-mono tabular-nums font-medium">{previewAmount(vatAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline border-t pt-2.5">
                      <span className="font-semibold text-foreground">Tổng cộng thanh toán:</span>
                      <span className="font-mono tabular-nums text-base font-bold text-foreground">{previewAmount(total)}</span>
                    </div>
                    <div className="border-t pt-2 space-y-1 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Dự kiến thanh toán lần 1:</span>
                        <span className="font-mono tabular-nums">{(watchedValues.payment1 || 0).toLocaleString('vi-VN')} đ</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Dự kiến thanh toán lần 2:</span>
                        <span className="font-mono tabular-nums">{(watchedValues.payment2 || 0).toLocaleString('vi-VN')} đ</span>
                      </div>
                      <div className="flex justify-between font-medium text-foreground pt-1">
                        <span>Còn lại theo kế hoạch:</span>
                        <span className="font-mono tabular-nums font-semibold">{previewAmount(remaining)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cảnh báo tài khoản / quyền */}
            {accountChanged && (
              <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
                <p>Tài khoản đăng nhập đã thay đổi. Vui lòng đóng và mở lại biểu mẫu trước khi lưu báo giá.</p>
                {!onClose && <Button type="button" variant="outline" className="mt-2" onClick={() => window.location.reload()}>Tải lại trang</Button>}
              </div>
            )}
            {!accountChanged && isLocalBackend() && identityError && (
              <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
                <p>{identityError}</p>
                <Button type="button" variant="outline" className="mt-2" disabled={isLoadingUser || isLoading} onClick={() => setIdentityAttempt(attempt => attempt + 1)}>Thử tải lại quyền</Button>
              </div>
            )}

          </form>
        </Form>
      </div>

            {/* Sticky Footer */}
            <div className="z-20 shrink-0 min-w-0 border-t bg-background px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="text-muted-foreground">Tổng thanh toán:</span>
                <span className="font-mono tabular-nums text-base font-bold text-foreground">
                  {previewAmount(total)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({validLineCount}/{activeLinesForDisplay.length} dòng hợp lệ)
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button type="button" variant="outline" size="sm" className="h-9 px-3.5" onClick={onClose}>
                  Hủy
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3.5"
                  disabled={!canOpenLivePreview}
                  onClick={() => setShowLivePreview(true)}
                  title="Xem trước bản in báo giá ngay khi đang soạn"
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Xem trước
                </Button>
                <Button
                  type="submit"
                  form={quoteFormId}
                  size="sm"
                  className="h-9 px-5"
                  disabled={accountChanged || isLoading || isLoadingUser || !managerId || Boolean(calculationError)}
                >
                  {isLoadingUser ? 'Đang tải...' : isLoading ? 'Đang lưu...' : initialData ? 'Cập nhật báo giá' : 'Tạo báo giá'}
                </Button>
              </div>
            </div>

      {/* Create New Product Dialog */}
      <Dialog open={showCreateProduct} onOpenChange={setShowCreateProduct}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              Tạo sản phẩm mới vào bảng giá
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="newSku" className="text-xs">Mã SP *</Label>
                <Input id="newSku" value={newProductSku} onChange={e => setNewProductSku(e.target.value)} placeholder="VD: SP001" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newName" className="text-xs">Tên sản phẩm *</Label>
                <Input id="newName" value={newProductName} onChange={e => setNewProductName(e.target.value)} required placeholder="Tên sản phẩm" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newCategory" className="text-xs">Danh mục</Label>
                <Input id="newCategory" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} placeholder="Danh mục" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newSpecifications" className="text-xs">Quy cách</Label>
                <Input id="newSpecifications" value={newProductSpecifications} onChange={e => setNewProductSpecifications(e.target.value)} placeholder="Quy cách" className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="newCostPrice" className="text-xs">Giá gốc (VND)</Label>
                <Input id="newCostPrice" type="number" step="1000" value={newProductCostPrice} onChange={e => setNewProductCostPrice(e.target.value)} placeholder="0" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPrice" className="text-xs">Giá bán (VND)</Label>
                <Input id="newPrice" type="number" step="1000" value={newProductPrice} onChange={e => setNewProductPrice(e.target.value)} placeholder="0" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newInStock" className="text-xs">Tình trạng</Label>
                <div className="flex items-center space-x-2 h-9">
                  <Switch id="newInStock" checked={newProductInStock} onCheckedChange={setNewProductInStock} />
                  <Label htmlFor="newInStock" className="text-sm font-normal">
                    {newProductInStock ? 'Còn hàng' : 'Hết hàng'}
                  </Label>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newDescription" className="text-xs">Mô tả</Label>
              <Textarea id="newDescription" value={newProductDescription} onChange={e => setNewProductDescription(e.target.value)} rows={2} placeholder="Mô tả chi tiết sản phẩm..." className="text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateProduct(false)}>
                Hủy
              </Button>
              <Button type="submit" size="sm" disabled={createProductLoading}>
                {createProductLoading ? 'Đang tạo...' : 'Tạo sản phẩm'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {showLivePreview && livePreviewQuote && (
        <QuotePreviewDialog
          open={showLivePreview}
          onOpenChange={setShowLivePreview}
          quote={livePreviewQuote}
        />
      )}
    </div>
  );
}
