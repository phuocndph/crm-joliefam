import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collectProductCategories } from '@/lib/product-categories';
import { supabase } from '@/integrations/supabase/client';
import { isLocalBackend } from '@/lib/runtime-config';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Package, Plus, Edit, Trash2, Search, Filter, FileSpreadsheet, Users, Calendar, Settings, Image, ChevronLeft, ChevronRight, Download, Factory } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { ColumnMappingDialog } from '@/components/ColumnMappingDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileProductList } from '@/components/MobileProductList';

const ProductImageLibrary = lazy(() => import('@/components/ProductImageLibrary'));
const ProductManufacturingStandards = lazy(() => import('@/components/ProductManufacturingStandards'));
const ProductSupplyClassification = lazy(() => import('@/components/ProductSupplyClassification'));
const ProductTechnicalProfiles = lazy(() => import('@/components/ProductTechnicalProfiles'));

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
  image_url: string | null;
  images: any[] | null;
  created_at: string;
  updated_at: string;
}

interface PriceList {
  id: string;
  name: string;
  year: number;
  status: string;
  manager_id: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

const ProductManagement = () => {
  const productListColumns = 'id, name, description, price, cost_price, sku, category, specifications, in_stock, manager_id, tenant_id, price_list_id, created_at, updated_at';
  const [user, setUser] = useState<any>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const productsRequest = useRef(0);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // True when current rows come from products_public view (no cost_price visible)
  const [usingPublicView, setUsingPublicView] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const itemsPerPage = 50;
  const [createProductLoading, setCreateProductLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [selectedPriceList, setSelectedPriceList] = useState<string>('');
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState('');
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const { role: currentUserRole, loading: roleLoading } = useUserRole(user);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const categoryQueryKey = ['product-categories', isLocalBackend() ? 'local' : 'hosted', user?.id, selectedPriceList];
  const { data: categories = [], isFetching: categoriesLoading, isError: categoriesFailed, refetch: refetchCategories } = useQuery({
    queryKey: categoryQueryKey,
    enabled: Boolean(user?.id && selectedPriceList),
    retry: false,
    queryFn: ({ signal }) => {
      let usePublicCatalog = false;
      return collectProductCategories(async (offset, pageSize) => {
        if (!usePublicCatalog) {
          const result = await supabase.from('products').select('id, category')
            .eq('price_list_id', selectedPriceList).order('id', { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (result.error || offset !== 0 || result.data?.length || isLocalBackend()) return result;
          usePublicCatalog = true;
        }
        // Project only public category/id fields. Outer ordering and range paginate
        // by unique id instead of the RPC's nonunique category/SKU ordering.
        return supabase.rpc('get_products_catalog', {
          _price_list_id: selectedPriceList, _search: null, _category: null, _in_stock: null,
          _limit: 2147483647, _offset: 0,
        }).select('id, category').order('id', { ascending: true }).range(offset, offset + pageSize - 1);
      }, signal);
    },
  });
  const refreshProductData = async () => {
    await Promise.all([
      fetchProducts(),
      queryClient.invalidateQueries({ queryKey: categoryQueryKey }),
    ]);
  };

  // Price List Form state
  const [priceListName, setPriceListName] = useState('');
  const [priceListYear, setPriceListYear] = useState(new Date().getFullYear().toString());
  const [createPriceListLoading, setCreatePriceListLoading] = useState(false);
  const [showCreatePriceListDialog, setShowCreatePriceListDialog] = useState(false);
  
  // Edit Price List state
  const [editingPriceList, setEditingPriceList] = useState<PriceList | null>(null);
  const [editPriceListName, setEditPriceListName] = useState('');
  const [editPriceListYear, setEditPriceListYear] = useState('');
  const [editPriceListLoading, setEditPriceListLoading] = useState(false);
  
  // Delete Price List state
  const [deletingPriceList, setDeletingPriceList] = useState<PriceList | null>(null);
  const [deletePriceListLoading, setDeletePriceListLoading] = useState(false);

  // Delete All Products state
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);

  // Create form collapse state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportSheetBar, setShowImportSheetBar] = useState(false);
  const [productParams,setProductParams] = useSearchParams();
  const canManageLocalProductSetup = isLocalBackend() && ['admin','manager'].includes(currentUserRole || '');
  const requestedProductTab = productParams.get('tab') || 'products';
  const productTabAllowed = (tab:string) => ['products','price-lists','image-library','manufacturing-standards'].includes(tab)
    || (canManageLocalProductSetup && ['supply-classification','technical-profiles'].includes(tab));
  const activeProductTab = productTabAllowed(requestedProductTab) ? requestedProductTab : 'products';
  const setActiveProductTab = (tab:string) => {
    const next = new URLSearchParams(productParams);
    next.set('tab',productTabAllowed(tab)?tab:'products');
    setProductParams(next);
  };
  useEffect(()=>{
    if(!authResolved || roleLoading || requestedProductTab===activeProductTab)return;
    const next=new URLSearchParams(productParams);next.set('tab','products');setProductParams(next,{replace:true});
  },[authResolved,roleLoading,requestedProductTab,activeProductTab,productParams,setProductParams]);

  // Product Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [specifications, setSpecifications] = useState('');
  const [inStock, setInStock] = useState(true);

  // Bulk paste state
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [bulkPasteLoading, setBulkPasteLoading] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCostPrice, setEditCostPrice] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSpecifications, setEditSpecifications] = useState('');
  const [editInStock, setEditInStock] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setAuthResolved(true);
    });
  }, []);

  useEffect(() => {
    if (user) {
      fetchPriceLists();
    }
  }, [user]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeSearchTerm, categoryFilter, stockFilter, selectedPriceList]);

  useEffect(() => {
    setCategoryFilter('all');
  }, [selectedPriceList]);

  useEffect(() => {
    if (user) fetchProducts();
    return () => { productsRequest.current++; };
  }, [user, currentPage, activeSearchTerm, categoryFilter, stockFilter, selectedPriceList]);

  // Tự động chọn bảng giá đầu tiên khi có dữ liệu
  useEffect(() => {
    if (priceLists.length > 0 && !selectedPriceList) {
      console.log('Auto-selecting first price list:', priceLists[0]);
      setSelectedPriceList(priceLists[0].id);
    }
  }, [priceLists, selectedPriceList]);

  const fetchPriceLists = async () => {
    try {
      // RLS sẽ tự động filter dữ liệu theo role, không cần thêm filter manual
      const { data, error } = await supabase
        .from('price_lists' as any)
        .select('id, name, year, status, manager_id, tenant_id, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPriceLists((data as unknown as PriceList[]) || []);
    } catch (error) {
      console.error('Error fetching price lists:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách bảng giá",
        variant: "destructive",
      });
    }
  };

  const fetchProducts = async () => {
    const request = ++productsRequest.current;
    // Do not issue a broad products query while the price-list selection is
    // still being resolved. The first price list is selected asynchronously.
    if (!selectedPriceList) {
      setProducts([]);
      setTotalProducts(0);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const buildQuery = (page: number) => {
        const offset = (page - 1) * itemsPerPage;
        let q = supabase
          .from('products')
          .select(productListColumns, { count: 'exact' });
        if (selectedPriceList) q = q.eq('price_list_id', selectedPriceList);
        if (activeSearchTerm) {
          q = q.or(`name.ilike.%${activeSearchTerm}%,sku.ilike.%${activeSearchTerm}%,description.ilike.%${activeSearchTerm}%`);
        }
        if (categoryFilter && categoryFilter !== 'all') q = q.eq('category', categoryFilter);
        if (stockFilter && stockFilter !== 'all') {
          q = q.eq('in_stock', stockFilter === 'in-stock');
        }
        return q
          .range(offset, offset + itemsPerPage - 1)
          .order('category', { ascending: true })
          .order('sku', { ascending: true });
      };

      let { data, error, count } = await buildQuery(currentPage);
      if (request !== productsRequest.current) return;
      let fromPublic = false;

      // Fallback: nếu RLS ẩn sản phẩm (khác manager), dùng RPC catalog an toàn
      // để vẫn hiển thị danh sách (không trả cost_price).
      if (!isLocalBackend() && !error && selectedPriceList && (count ?? 0) === 0) {
        const offset = (currentPage - 1) * itemsPerPage;
        const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_products_catalog', {
          _price_list_id: selectedPriceList,
          _search: activeSearchTerm || null,
          _category: categoryFilter && categoryFilter !== 'all' ? categoryFilter : null,
          _in_stock: stockFilter && stockFilter !== 'all' ? stockFilter === 'in-stock' : null,
          _limit: itemsPerPage,
          _offset: offset,
        });
        if (request !== productsRequest.current) return;
        if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
          // Lấy lại giá gốc cho các role được phép (admin/manager/accountant)
          let costMap: Record<string, number | null> = {};
          const { data: costRows } = await (supabase as any).rpc('get_products_cost_prices', {
            _ids: rpcData.map((r: any) => r.id),
          });
          if (request !== productsRequest.current) return;
          if (Array.isArray(costRows)) {
            costMap = Object.fromEntries(costRows.map((c: any) => [c.id, c.cost_price]));
          }
          data = rpcData.map((r: any) => ({ ...r, cost_price: costMap[r.id] ?? null })) as any;
          count = Number(rpcData[0]?.total_count ?? rpcData.length);
          fromPublic = true;
        }
      }

      // If we requested a page beyond the available range, retry on the last valid page
      if (error && (error as any).code === 'PGRST103') {
        const headCheck = await supabase
          .from('products' as any)
          .select('id', { count: 'exact', head: true })
          .eq('price_list_id', selectedPriceList || '');
        if (request !== productsRequest.current) return;
        const realCount = headCheck.count || 0;
        const lastPage = Math.max(1, Math.ceil(realCount / itemsPerPage));
        if (lastPage !== currentPage) {
          setCurrentPage(lastPage);
          return;
        }
        ({ data, error, count } = await buildQuery(1));
        if (request !== productsRequest.current) return;
        if (!error) setCurrentPage(1);
      }

      if (error) throw error;

      setProducts((data as unknown as Product[]) || []);
      setUsingPublicView(fromPublic);
      setTotalProducts(count || 0);
      const newTotalPages = Math.max(1, Math.ceil((count || 0) / itemsPerPage));
      setTotalPages(newTotalPages);
      if (currentPage > newTotalPages) {
        setCurrentPage(newTotalPages);
      }
    } catch (error: any) {
      if (request !== productsRequest.current) return;
      console.error('Error fetching products:', error);
      const detail = [error?.message, error?.hint, error?.code].filter(Boolean).join(' | ');
      toast({
        title: "Lỗi tải sản phẩm",
        description: detail || "Không thể tải danh sách sản phẩm",
        variant: "destructive",
      });
    } finally {
      if (request === productsRequest.current) setLoading(false);
    }
  };

  const fetchAllProductsByScope = async (scope: 'selected' | 'all'): Promise<Product[]> => {
    let allProducts: Product[] = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      let query = supabase
        .from('products' as any)
        .select('id, name, description, price, cost_price, sku, category, specifications, in_stock, price_list_id, created_at, updated_at');
      if (scope === 'selected' && selectedPriceList) {
        query = query.eq('price_list_id', selectedPriceList);
      }
      const { data, error } = await query
        .order('category', { ascending: true })
        .order('sku', { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) throw error;
      const batch = (data as unknown as Product[]) || [];
      allProducts = [...allProducts, ...batch];
      if (batch.length < batchSize) break;
      offset += batchSize;
    }

    // Fallback to catalog RPC when hosted RLS hides products owned by another manager
    if (!isLocalBackend() && allProducts.length === 0 && scope === 'selected' && selectedPriceList) {
      const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_products_catalog', {
        _price_list_id: selectedPriceList,
        _search: null,
        _category: null,
        _in_stock: null,
        _limit: 10000,
        _offset: 0,
      });
      if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
        let costMap: Record<string, number | null> = {};
        const { data: costRows } = await (supabase as any).rpc('get_products_cost_prices', {
          _ids: rpcData.map((r: any) => r.id),
        });
        if (Array.isArray(costRows)) {
          costMap = Object.fromEntries(costRows.map((c: any) => [c.id, c.cost_price]));
        }
        allProducts = rpcData.map((r: any) => ({ ...r, cost_price: costMap[r.id] ?? null })) as Product[];
      }
    }

    return allProducts;
  };

  const stripProductDimensions = (rawName: string, sku = '', category = ''): string => {
    const name = String(rawName ?? '').trim();
    if (!name) return name;

    const pureDimRegex = /^[\d.,]+(?:\s*(?:m|mm|cm|f|g|kg))?(?:\s*[xX*×-]\s*[\d.,]+(?:\s*(?:m|mm|cm|f|g|kg))?)+$/i;
    if (pureDimRegex.test(name)) {
      const skuCleaned = stripProductDimensions(sku, '', '');
      if (skuCleaned && !pureDimRegex.test(skuCleaned)) return skuCleaned;
      if (category) return String(category).trim();
    }

    const cleaned = name
      .replace(/\(\s*(?:dùng\s+cho\s+)?(?:đệm|giường|nệm|size|cỡ|kích\s+thước)[^)]*\)/giu, ' ')
      .replace(/\b(?:cho\s+(?:giường|đệm|nệm)|(?<!váy\s)(?:giường|đệm|nệm))\s+\d+(?:[.,]\d+)?\s*(?:m\d*|[xX*×]\d+(?:[.,]\d+)?)?\b/giu, ' ')
      .replace(/\bdưới\s+\d+(?:[.,]\d+)?\s*(?:m|mm)\d*\b/giu, ' ')
      .replace(/\bsize\s+(?:\d+(?:[.,]\d+)?(?:\s*[xX*×-]\s*\d+(?:[.,]\d+)?)*(?:\s*(?:cm|mm|m|f|g))?|s|m|l|xl|xxl)\b/giu, ' ')
      .replace(/\b[sS]?\d+(?:[.,]\d+)?\s*(?:cm|mm|m|f)?(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?\s*(?:cm|mm|m|f|g|kg)?)+\b/giu, ' ')
      .replace(/\b\d{2,3}\s*-\s*\d{2,3}(?:\s*cm)?\b/giu, ' ')
      .replace(/\bD\d{2,4}(?:\s*cm)?\b/giu, ' ')
      .replace(/\b\d+\s*(?:m|mm)(?:\s*\d+)?\b/giu, ' ')
      .replace(/\b(?:diễu\s+)?\d+\s*f\b/giu, (m) => (m.toLowerCase().startsWith('diễu') ? 'diễu' : ' '))
      .replace(/\b(Tấm\s+trang\s+trí)\s+\d{2,3}\s*:?/giu, '$1')
      .replace(/\b(Ga\s+chun\s+lụa\s+tổng\s+hợp)\s+\d{1,2}\b/giu, '$1')
      .replace(/\s+\b(?:S|M|L|XL|XXL|2XL|3XL)\b\s*$/u, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/[\s,:-]+$/g, '')
      .trim();

    return cleaned || name;
  };

  const populateProductWorksheet = (
    sheet: any,
    items: Product[],
    priceListMap: Map<string, PriceList>,
    includePriceListCol: boolean
  ) => {
    sheet.columns = [
      { header: 'STT', key: 'stt', width: 7 },
      ...(includePriceListCol ? [{ header: 'Bảng giá', key: 'price_list_name', width: 26 }] : []),
      { header: 'Mã SP', key: 'sku', width: 18 },
      { header: 'Danh mục', key: 'category', width: 28 },
      { header: 'Tên sản phẩm', key: 'name', width: 44 },
      { header: 'Quy cách', key: 'specifications', width: 22 },
      { header: 'Giá gốc', key: 'cost_price', width: 16 },
      { header: 'Giá bán', key: 'price', width: 16 },
      { header: 'Kho', key: 'in_stock', width: 10 },
      { header: 'Mô tả', key: 'description', width: 42 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 26;

    items.forEach((p, i) => {
      const pl = p.price_list_id ? priceListMap.get(p.price_list_id) : undefined;
      sheet.addRow({
        stt: i + 1,
        ...(includePriceListCol ? { price_list_name: pl ? `${pl.name} (${pl.year})` : 'Chưa gán bảng giá' } : {}),
        sku: p.sku || '',
        category: p.category || '',
        name: stripProductDimensions(p.name || '', p.sku || '', p.category || ''),
        specifications: p.specifications || '',
        cost_price: Number(p.cost_price || 0),
        price: Number(p.price || 0),
        in_stock: p.in_stock ? 'Còn' : 'Hết',
        description: p.description || '',
      });
    });

    sheet.getColumn('cost_price').numFmt = '#,##0';
    sheet.getColumn('price').numFmt = '#,##0';

    for (let i = 2; i <= items.length + 1; i++) {
      const row = sheet.getRow(i);
      if (i % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      row.alignment = { vertical: 'middle', wrapText: true };
    }
  };

  const triggerWorkbookDownload = async (workbook: any, fileName: string) => {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const exportToExcel = async () => {
    if (!selectedPriceList) {
      await exportAllProductsToExcel();
      return;
    }
    setExportLoading(true);
    try {
      toast({ title: "Đang xuất Excel...", description: "Đang tải toàn bộ sản phẩm của bảng giá hiện tại" });
      const allProducts = await fetchAllProductsByScope('selected');
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const priceListMap = new Map(priceLists.map((pl) => [pl.id, pl]));
      const priceListName = (priceLists.find(p => p.id === selectedPriceList)?.name || 'Bảng giá').replace(/[*?:\\/\[\]]/g, '-');
      const sheet = workbook.addWorksheet(priceListName.substring(0, 31) || 'SanPham');

      populateProductWorksheet(sheet, allProducts, priceListMap, false);

      const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9À-ỹ\s-_]/g, '').trim().replace(/\s+/g, '-');
      const fileName = `SanPham-${sanitize(priceListName) || 'BangGia'}.xlsx`;
      await triggerWorkbookDownload(workbook, fileName);

      toast({ title: "Thành công", description: `Đã tải xuống ${allProducts.length} sản phẩm ra file ${fileName}` });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: "Lỗi", description: "Không thể xuất file Excel", variant: "destructive" });
    } finally {
      setExportLoading(false);
    }
  };

  const exportAllProductsToExcel = async () => {
    setExportLoading(true);
    try {
      toast({ title: "Đang xuất toàn bộ sản phẩm...", description: "Đang tổng hợp sản phẩm từ tất cả bảng giá" });
      const allProducts = await fetchAllProductsByScope('all');
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const priceListMap = new Map(priceLists.map((pl) => [pl.id, pl]));

      // Sheet 1: Toàn bộ sản phẩm
      const masterSheet = workbook.addWorksheet('Toàn bộ sản phẩm');
      populateProductWorksheet(masterSheet, allProducts, priceListMap, true);

      // Các sheet tiếp theo: tách theo từng bảng giá có sản phẩm
      const usedSheetNames = new Set<string>(['Toàn bộ sản phẩm']);
      for (const pl of priceLists) {
        const listProducts = allProducts.filter((p) => p.price_list_id === pl.id);
        if (listProducts.length === 0) continue;
        let baseName = pl.name.replace(/[*?:\\/\[\]]/g, '-').trim().substring(0, 28) || 'BangGia';
        let sheetName = baseName;
        let counter = 2;
        while (usedSheetNames.has(sheetName)) {
          sheetName = `${baseName.substring(0, 25)} (${counter++})`;
        }
        usedSheetNames.add(sheetName);
        const plSheet = workbook.addWorksheet(sheetName);
        populateProductWorksheet(plSheet, listProducts, priceListMap, false);
      }

      const today = new Date().toISOString().slice(0, 10);
      const fileName = `ToanBoSanPham-${today}.xlsx`;
      await triggerWorkbookDownload(workbook, fileName);

      toast({
        title: "Thành công",
        description: `Đã tải xuống toàn bộ ${allProducts.length} sản phẩm ra file ${fileName}`,
      });
    } catch (error) {
      console.error('Export all products error:', error);
      toast({ title: "Lỗi", description: "Không thể xuất toàn bộ sản phẩm ra Excel", variant: "destructive" });
    } finally {
      setExportLoading(false);
    }
  };


  const handleCreatePriceList = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatePriceListLoading(true);

    try {
      const { error } = await (supabase as any)
        .from('price_lists')
        .insert({
          name: priceListName,
          year: parseInt(priceListYear),
          status: 'active',
          manager_id: user?.id || null,
        });

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã tạo bảng giá thành công",
      });

      setPriceListName('');
      setPriceListYear(new Date().getFullYear().toString());
      setShowCreatePriceListDialog(false);
      fetchPriceLists();
    } catch (error: any) {
      console.error('Error creating price list:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tạo bảng giá",
        variant: "destructive",
      });
    } finally {
      setCreatePriceListLoading(false);
    }
  };

  const openEditPriceListDialog = (priceList: PriceList) => {
    setEditingPriceList(priceList);
    setEditPriceListName(priceList.name);
    setEditPriceListYear(priceList.year.toString());
  };

  const handleEditPriceList = async () => {
    if (!editingPriceList) return;
    
    setEditPriceListLoading(true);

    try {
      const { error } = await (supabase as any)
        .from('price_lists')
        .update({
          name: editPriceListName,
          year: parseInt(editPriceListYear),
        })
        .eq('id', editingPriceList.id);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã cập nhật bảng giá thành công",
      });

      setEditingPriceList(null);
      setEditPriceListName('');
      setEditPriceListYear('');
      fetchPriceLists();
    } catch (error: any) {
      console.error('Error updating price list:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật bảng giá",
        variant: "destructive",
      });
    } finally {
      setEditPriceListLoading(false);
    }
  };

  const handleDeletePriceList = async () => {
    if (!deletingPriceList) return;
    
    setDeletePriceListLoading(true);

    try {
      // Check if price list has products
      const { data: productsData, error: productsError } = await supabase
        .from('products' as any)
        .select('id')
        .eq('price_list_id', deletingPriceList.id)
        .limit(1);

      if (productsError) throw productsError;

      if (productsData && productsData.length > 0) {
        toast({
          title: "Không thể xóa",
          description: "Không thể xóa bảng giá đang có sản phẩm. Vui lòng xóa tất cả sản phẩm trước.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await (supabase as any)
        .from('price_lists')
        .delete()
        .eq('id', deletingPriceList.id);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã xóa bảng giá thành công",
      });

      setDeletingPriceList(null);
      
      // If deleted price list was selected, clear selection
      if (selectedPriceList === deletingPriceList.id) {
        setSelectedPriceList('');
      }
      
      fetchPriceLists();
    } catch (error: any) {
      console.error('Error deleting price list:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa bảng giá",
        variant: "destructive",
      });
    } finally {
      setDeletePriceListLoading(false);
    }
  };

  const handleImportFromGoogleSheets = async () => {
    if (!googleSheetsUrl || !selectedPriceList) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn bảng giá và nhập link Google Sheets",
        variant: "destructive",
      });
      return;
    }

    setImportLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('import-products', {
        body: {
          googleSheetsUrl,
          priceListId: selectedPriceList
        }
      });

      if (error) throw error;

      if (data.success) {
        const stats = data.stats;
        const lossy = stats && (stats.totalDataRows !== stats.savedProducts);
        toast({
          title: lossy ? "Dữ liệu nhập có chênh lệch" : "Thành công",
          description: data.message,
          variant: lossy ? "destructive" : "default",
        });
        setGoogleSheetsUrl('');
        // Force refresh products to show updated data
        setCurrentPage(1);
        await refreshProductData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error importing products:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể nhập sản phẩm",
        variant: "destructive",
      });
    } finally {
      setImportLoading(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPriceList) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn bảng giá trước khi tạo sản phẩm",
        variant: "destructive",
      });
      return;
    }

    setCreateProductLoading(true);

    try {
      const { error } = await (supabase as any)
        .from('products')
        .insert({
          name,
          description: description || null,
          price: price ? parseFloat(price) : null,
          cost_price: costPrice ? parseFloat(costPrice) : null,
          sku: sku || null,
          category: category || null,
          specifications: specifications || null,
          in_stock: inStock,
          manager_id: user?.id || null,
          price_list_id: selectedPriceList,
        });

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã tạo sản phẩm thành công",
      });

      // Reset form
      setName('');
      setDescription('');
      setPrice('');
      setCostPrice('');
      setSku('');
      setCategory('');
      setSpecifications('');
      setInStock(true);
      
      setCurrentPage(1);
      void refreshProductData();
    } catch (error: any) {
      console.error('Error creating product:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tạo sản phẩm",
        variant: "destructive",
      });
    } finally {
      setCreateProductLoading(false);
    }
  };

  const handleBulkPaste = async () => {
    if (!selectedPriceList) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn bảng giá trước khi thêm sản phẩm",
        variant: "destructive",
      });
      return;
    }

    if (!bulkPasteText.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập dữ liệu sản phẩm",
        variant: "destructive",
      });
      return;
    }

    setBulkPasteLoading(true);

    try {
      const lines = bulkPasteText.trim().split('\n').filter(line => line.trim());
      const products = [];
      let errorLines = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Support both tab-separated (from Excel) and pipe-separated
        const parts = line.includes('\t') 
          ? line.split('\t').map(p => p.trim())
          : line.split('|').map(p => p.trim());

        if (parts.length < 2) {
          errorLines.push(`Dòng ${i + 1}: Không đủ thông tin (cần ít nhất Mã SP và Tên SP)`);
          continue;
        }

        const [
          sku,
          name,
          category = null,
          specifications = null,
          costPrice = null,
          price = null,
          description = null,
          inStock = '1'
        ] = parts;

        if (!sku || !name) {
          errorLines.push(`Dòng ${i + 1}: Thiếu Mã SP hoặc Tên SP`);
          continue;
        }

        products.push({
          sku,
          name,
          category: category || null,
          specifications: specifications || null,
          cost_price: costPrice && !isNaN(parseFloat(costPrice)) ? parseFloat(costPrice) : null,
          price: price && !isNaN(parseFloat(price)) ? parseFloat(price) : null,
          description: description || null,
          in_stock: inStock === '1' || inStock.toLowerCase() === 'true' || inStock.toLowerCase() === 'còn hàng',
          manager_id: user?.id || null,
          price_list_id: selectedPriceList,
        });
      }

      if (errorLines.length > 0) {
        toast({
          title: "Cảnh báo",
          description: `Có ${errorLines.length} dòng lỗi:\n${errorLines.slice(0, 3).join('\n')}${errorLines.length > 3 ? '\n...' : ''}`,
          variant: "destructive",
        });
      }

      if (products.length === 0) {
        toast({
          title: "Lỗi",
          description: "Không có sản phẩm hợp lệ nào để thêm",
          variant: "destructive",
        });
        return;
      }

      const { error } = await (supabase as any)
        .from('products')
        .insert(products);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: `Đã thêm ${products.length} sản phẩm thành công${errorLines.length > 0 ? ` (${errorLines.length} dòng lỗi)` : ''}`,
      });

      setBulkPasteText('');
      setCurrentPage(1);
      void refreshProductData();
    } catch (error: any) {
      console.error('Error bulk creating products:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thêm sản phẩm",
        variant: "destructive",
      });
    } finally {
      setBulkPasteLoading(false);
    }
  };

  const handleDeleteAllProducts = async () => {
    if (!selectedPriceList) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn bảng giá trước",
        variant: "destructive",
      });
      return;
    }

    setDeleteAllLoading(true);

    try {
      const { error } = await (supabase as any)
        .from('products')
        .delete()
        .eq('price_list_id', selectedPriceList);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: `Đã xóa toàn bộ sản phẩm trong bảng giá thành công`,
      });

      setShowDeleteAllDialog(false);
      setCurrentPage(1);
      void refreshProductData();
    } catch (error: any) {
      console.error('Error deleting all products:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa toàn bộ sản phẩm",
        variant: "destructive",
      });
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const handleEditProduct = async () => {
    if (!editingProduct) return;

    try {
      const { error } = await (supabase as any)
        .from('products')
        .update({
          name: editName,
          description: editDescription || null,
          price: editPrice ? parseFloat(editPrice) : null,
          cost_price: editCostPrice ? parseFloat(editCostPrice) : null,
          sku: editSku || null,
          category: editCategory || null,
          specifications: editSpecifications || null,
          in_stock: editInStock,
        })
        .eq('id', editingProduct.id);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã cập nhật sản phẩm thành công",
      });

      setEditingProduct(null);
      void refreshProductData();
    } catch (error: any) {
      console.error('Error updating product:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật sản phẩm",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProduct = async () => {
    if (!deletingProduct) return;

    try {
      const { error } = await (supabase as any)
        .from('products')
        .delete()
        .eq('id', deletingProduct.id);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã xóa sản phẩm thành công",
      });

      setDeletingProduct(null);
      void refreshProductData();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa sản phẩm",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setEditName(product.name);
    setEditDescription(product.description || '');
    setEditPrice(product.price?.toString() || '');
    setEditCostPrice(product.cost_price?.toString() || '');
    setEditSku(product.sku || '');
    setEditCategory(product.category || '');
    setEditSpecifications(product.specifications || '');
    setEditInStock(product.in_stock);
  };

  const formatPrice = (price: number | null) => {
    if (!price) return 'Chưa có giá';
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price);
  };


  if (roleLoading || loading) {
    return <div className="flex justify-center items-center h-64">Đang tải...</div>;
  }

  if (!currentUserRole) {
    return (
      <div className="flex justify-center items-center h-64">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Vui lòng đăng nhập</CardTitle>
            <CardDescription>
              Bạn cần đăng nhập để truy cập trang này
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Quản lý sản phẩm</h1>
          <p className="text-sm text-muted-foreground">
            Tra cứu, chỉnh sửa sản phẩm và bảng giá theo chuẩn bảng tính gọn gàng
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedPriceList && (
            <Button
              size="sm"
              onClick={exportToExcel}
              disabled={exportLoading}
              variant="outline"
              className="h-9 flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              {exportLoading ? 'Đang xuất...' : `Tải Excel bảng giá (${totalProducts})`}
            </Button>
          )}
          <Button
            size="sm"
            onClick={exportAllProductsToExcel}
            disabled={exportLoading}
            variant="secondary"
            className="h-9 flex items-center gap-1.5"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exportLoading ? 'Đang xuất...' : 'Tải toàn bộ SP (Excel)'}
          </Button>
        </div>
      </div>

      <Tabs value={activeProductTab} onValueChange={setActiveProductTab} className="space-y-6">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Sản phẩm
          </TabsTrigger>
          <TabsTrigger value="price-lists" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Bảng giá
          </TabsTrigger>
          <TabsTrigger value="image-library" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            Thư viện hình ảnh
          </TabsTrigger>
          <TabsTrigger value="manufacturing-standards" className="flex items-center gap-2">
            <Factory className="h-4 w-4" />
            Định mức sản xuất
          </TabsTrigger>
          {isLocalBackend() && ['admin','manager'].includes(currentUserRole || '') && <TabsTrigger value="supply-classification" className="min-h-11">Phân loại sản phẩm</TabsTrigger>}
          {isLocalBackend() && ['admin','manager'].includes(currentUserRole || '') && <TabsTrigger value="technical-profiles" className="min-h-11">Đặc điểm sản phẩm</TabsTrigger>}
        </TabsList>
        {isLocalBackend() && ['admin','manager'].includes(currentUserRole || '') && <TabsContent value="supply-classification"><Suspense fallback={<div role="status">Đang tải phân loại…</div>}>{activeProductTab === 'supply-classification' && <ProductSupplyClassification userId={user?.id || ''}/>}</Suspense></TabsContent>}
        {isLocalBackend() && ['admin','manager'].includes(currentUserRole || '') && <TabsContent value="technical-profiles"><Suspense fallback={<div role="status">Đang tải đặc điểm…</div>}>{activeProductTab === 'technical-profiles' && <ProductTechnicalProfiles userId={user?.id || ''}/>}</Suspense></TabsContent>}

        <TabsContent value="manufacturing-standards" className="space-y-6">
          <Suspense fallback={<div className="flex min-h-64 items-center justify-center">Đang tải định mức sản xuất...</div>}>
            {activeProductTab === 'manufacturing-standards' && <ProductManufacturingStandards currentUser={user} />}
          </Suspense>
        </TabsContent>

        <TabsContent value="price-lists" className="space-y-6">
          {/* Create Price List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Thêm bảng giá mới
              </CardTitle>
              <CardDescription>
                Tạo bảng giá để quản lý sản phẩm theo từng năm
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreatePriceList} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="priceListName">Tên bảng giá *</Label>
                    <Input
                      id="priceListName"
                      value={priceListName}
                      onChange={(e) => setPriceListName(e.target.value)}
                      placeholder="Bảng giá bán lẻ"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priceListYear">Năm *</Label>
                    <Input
                      id="priceListYear"
                      type="number"
                      value={priceListYear}
                      onChange={(e) => setPriceListYear(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" disabled={createPriceListLoading}>
                  {createPriceListLoading ? 'Đang tạo...' : 'Tạo bảng giá'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Price Lists Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Danh sách bảng giá ({priceLists.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên bảng giá</TableHead>
                    <TableHead>Năm</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceLists.map((priceList) => (
                    <TableRow key={priceList.id}>
                      <TableCell className="font-medium">{priceList.name}</TableCell>
                      <TableCell>{priceList.year}</TableCell>
                      <TableCell>
                        {new Date(priceList.created_at).toLocaleDateString('vi-VN')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={priceList.status === 'active' ? 'default' : 'secondary'}>
                          {priceList.status === 'active' ? 'Đang sử dụng' : priceList.status === 'draft' ? 'Nháp' : 'Không hoạt động'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => openEditPriceListDialog(priceList)}
                           >
                             <Edit className="h-4 w-4" />
                           </Button>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => setDeletingPriceList(priceList)}
                           >
                             <Trash2 className="h-4 w-4" />
                           </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="image-library" className="space-y-6">
          <Card>
            <CardContent className="p-6">
              {activeProductTab === 'image-library' && (
                <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Đang tải thư viện hình ảnh...</div>}>
                  <ProductImageLibrary
                    onSelectImage={(imageUrl) => {
                      navigator.clipboard.writeText(imageUrl);
                      toast({
                        title: "Đã sao chép",
                        description: "Đường dẫn hình ảnh đã được sao chép vào clipboard",
                      });
                    }}
                  />
                </Suspense>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          {/* Unified Toolbar: Price List + Search & Filters + Quick Actions */}
          <Card className="border-border shadow-none">
            <CardContent className="p-4 space-y-3">
              {/* Row 1: Price List Selector + Stats + Primary Actions */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 min-w-0">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Bảng giá:
                  </Label>
                  <Select value={selectedPriceList} onValueChange={setSelectedPriceList}>
                    <SelectTrigger className="w-full sm:w-[320px] h-9 bg-background">
                      <SelectValue placeholder="Chọn bảng giá để bắt đầu..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg max-h-[320px] z-50">
                      {priceLists.map((priceList) => (
                        <SelectItem
                          key={priceList.id}
                          value={priceList.id}
                          className="cursor-pointer py-2 px-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-foreground">
                              {priceList.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({priceList.year})
                            </span>
                            <Badge
                              variant={priceList.status === 'active' ? 'default' : 'secondary'}
                              className="text-[10px] px-1.5 py-0 h-4"
                            >
                              {priceList.status === 'active' ? 'Đang dùng' : 'Nháp'}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedPriceList && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-normal text-xs">
                        Tổng: <strong className="ml-1 text-foreground">{totalProducts}</strong> mã
                      </Badge>
                      <span>•</span>
                      <span>Trang {currentPage}/{totalPages}</span>
                    </div>
                  )}
                </div>

                {selectedPriceList && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setShowCreateForm(!showCreateForm)}
                      variant={showCreateForm ? "secondary" : "default"}
                      className="h-9 gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      {showCreateForm ? 'Đóng form thêm SP' : 'Thêm sản phẩm'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowImportSheetBar(!showImportSheetBar)}
                      className="h-9 gap-1.5"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      Nhập Google Sheets
                    </Button>
                    {products.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowDeleteAllDialog(true)}
                        className="h-9 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Xóa bảng giá này
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Collapsible Google Sheets Import Bar */}
              {selectedPriceList && showImportSheetBar && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-border/60">
                  <Input
                    placeholder="Dán liên kết Google Sheets (Mã SP | Danh mục | Tên SP | Quy cách | Giá gốc | Giá bán | Mô tả)..."
                    value={googleSheetsUrl}
                    onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                    className="h-9 text-sm flex-1"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => setShowColumnMapping(true)}
                      disabled={!googleSheetsUrl}
                      className="h-9 gap-1.5"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Cấu hình & Nhập
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowImportSheetBar(false)}
                      className="h-9"
                    >
                      Đóng
                    </Button>
                  </div>
                </div>
              )}

              {/* Row 2: Search & Filter Bar */}
              {selectedPriceList && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-border/60">
                  <div className="sm:col-span-6 flex gap-1.5">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search"
                        placeholder="Tìm theo mã SP, tên sản phẩm, mô tả..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setActiveSearchTerm(searchTerm);
                          }
                        }}
                        className="pl-8 h-9 text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setActiveSearchTerm(searchTerm)}
                      className="h-9 px-3 shrink-0"
                    >
                      Tìm
                    </Button>
                  </div>

                  <div className="sm:col-span-3">
                    <select
                      aria-label="Lọc theo danh mục"
                      value={categoryFilter}
                      onChange={event => setCategoryFilter(event.target.value)}
                      disabled={categoriesLoading && categories.length === 0}
                      className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      <option value="all">{categoriesLoading && categories.length === 0 ? 'Đang tải danh mục…' : 'Tất cả danh mục'}</option>
                      {categoryFilter !== 'all' && !categories.includes(categoryFilter) && <option value={categoryFilter}>{categoryFilter}</option>}
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    {categoriesFailed && <div role="alert" className="mt-1 text-xs text-destructive">
                      Không tải được đầy đủ danh mục.
                      <Button type="button" variant="link" size="sm" className="h-auto px-1 py-0 text-xs" disabled={categoriesLoading} onClick={() => void refetchCategories()}>Thử lại</Button>
                    </div>}
                  </div>

                  <div className="sm:col-span-2">
                    <Select value={stockFilter} onValueChange={setStockFilter}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Tất cả kho" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả kho</SelectItem>
                        <SelectItem value="in-stock">Còn hàng</SelectItem>
                        <SelectItem value="out-of-stock">Hết hàng</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchTerm('');
                        setActiveSearchTerm('');
                        setCategoryFilter('all');
                        setStockFilter('all');
                        setCurrentPage(1);
                      }}
                      disabled={!searchTerm && !activeSearchTerm && categoryFilter === 'all' && stockFilter === 'all'}
                      className="w-full h-9 text-xs text-muted-foreground hover:text-foreground px-2"
                      title="Xóa bộ lọc"
                    >
                      Đặt lại
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedPriceList && (
            <>
              {/* Collapsible Create Product Form */}
              {showCreateForm && (
                <Card id="create-product-form" className="border-border shadow-none">
                  <CardHeader className="py-3 px-4 border-b bg-muted/30">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Thêm sản phẩm vào bảng giá "{priceLists.find(p => p.id === selectedPriceList)?.name}"
                      </CardTitle>
                      <Button variant="ghost" size="sm" type="button" onClick={() => setShowCreateForm(false)} className="h-7 text-xs">
                        Đóng
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <Tabs defaultValue="single" className="w-full">
                      <TabsList className="grid w-full max-w-md grid-cols-2 h-9">
                        <TabsTrigger value="single" className="text-xs">Thêm từng sản phẩm</TabsTrigger>
                        <TabsTrigger value="bulk" className="text-xs">Dán hàng loạt từ Excel</TabsTrigger>
                      </TabsList>

                      <TabsContent value="single" className="mt-4">
                        <form onSubmit={handleCreateProduct} className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="sku" className="text-xs">Mã SP *</Label>
                              <Input
                                id="sku"
                                value={sku}
                                onChange={(e) => setSku(e.target.value)}
                                required
                                placeholder="VD: SP001"
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="name" className="text-xs">Tên sản phẩm *</Label>
                              <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                placeholder="Tên sản phẩm"
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="category" className="text-xs">Danh mục</Label>
                              <Input
                                id="category"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                placeholder="Danh mục"
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="specifications" className="text-xs">Quy cách</Label>
                              <Input
                                id="specifications"
                                value={specifications}
                                onChange={(e) => setSpecifications(e.target.value)}
                                placeholder="VD: 160x200cm"
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="costPrice" className="text-xs">Giá gốc (VND)</Label>
                              <Input
                                id="costPrice"
                                type="number"
                                step="1000"
                                value={costPrice}
                                onChange={(e) => setCostPrice(e.target.value)}
                                placeholder="0"
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="price" className="text-xs">Giá bán (VND)</Label>
                              <Input
                                id="price"
                                type="number"
                                step="1000"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="0"
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="inStock" className="text-xs">Tình trạng</Label>
                              <div className="flex items-center space-x-2 h-9">
                                <Switch
                                  id="inStock"
                                  checked={inStock}
                                  onCheckedChange={setInStock}
                                />
                                <Label htmlFor="inStock" className="text-sm font-normal">
                                  {inStock ? 'Còn hàng' : 'Hết hàng'}
                                </Label>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="description" className="text-xs">Mô tả</Label>
                            <Textarea
                              id="description"
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              rows={2}
                              placeholder="Mô tả chất liệu, thông số sản phẩm..."
                              className="text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" disabled={createProductLoading}>
                              {createProductLoading ? 'Đang tạo...' : 'Lưu sản phẩm'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setName('');
                                setDescription('');
                                setPrice('');
                                setCostPrice('');
                                setSku('');
                                setCategory('');
                                setSpecifications('');
                                setInStock(true);
                              }}
                            >
                              Xóa trắng
                            </Button>
                          </div>
                        </form>
                      </TabsContent>

                      <TabsContent value="bulk" className="mt-4">
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Thứ tự cột khi dán từ Excel: <strong>Mã SP* | Tên SP* | Danh mục | Quy cách | Giá gốc | Giá bán | Mô tả | Tình trạng (1/0)</strong>
                          </p>
                          <Textarea
                            id="bulkPaste"
                            value={bulkPasteText}
                            onChange={(e) => setBulkPasteText(e.target.value)}
                            rows={8}
                            placeholder={"SP001	Chăn hè T250	Chăn hè	190x235cm	350000	425000	Vải T250	1"}
                            className="font-mono text-xs resize-none"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              Đã dán {bulkPasteText.trim().split('\n').filter(l => l.trim()).length} dòng
                            </span>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setBulkPasteText('')}
                              >
                                Xóa
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleBulkPaste}
                                disabled={bulkPasteLoading || !bulkPasteText.trim()}
                              >
                                {bulkPasteLoading ? 'Đang xử lý...' : 'Thêm tất cả'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}

              {/* Clean Spreadsheet-style Products Table */}
              <Card className="border-border shadow-none overflow-hidden">
                <CardContent className="p-0">
                  {loading ? (
                    <div className="text-center py-12 px-6">
                      <div className="animate-spin h-7 w-7 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3"></div>
                      <p className="text-sm text-muted-foreground">Đang tải danh sách sản phẩm...</p>
                    </div>
                  ) : products.length === 0 ? (
                    <div className="text-center py-12 px-6 text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-base font-medium text-foreground mb-1">Không tìm thấy sản phẩm</p>
                      <p className="text-xs">
                        {selectedPriceList
                          ? `Chưa có sản phẩm phù hợp trong bảng giá "${priceLists.find(p => p.id === selectedPriceList)?.name}"`
                          : "Vui lòng chọn bảng giá để xem sản phẩm"}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        {isMobile ? (
                          <div className="p-2">
                            <MobileProductList
                              products={products.map((p) => ({
                                ...p,
                                name: stripProductDimensions(p.name || '', p.sku || '', p.category || ''),
                              }))}
                              formatPrice={formatPrice}
                              onEdit={openEditDialog}
                              onDelete={setDeletingProduct}
                            />
                          </div>
                        ) : (
                          <Table className="w-full text-sm">
                            <TableHeader>
                              <TableRow className="border-b border-border bg-muted/50 hover:bg-muted/50">
                                <TableHead className="h-9 px-3 text-center font-semibold text-xs text-muted-foreground w-[48px]">
                                  STT
                                </TableHead>
                                <TableHead className="h-9 px-3 text-left font-semibold text-xs text-muted-foreground w-[140px]">
                                  Mã SP
                                </TableHead>
                                <TableHead className="h-9 px-3 text-left font-semibold text-xs text-muted-foreground min-w-[240px]">
                                  Tên sản phẩm
                                </TableHead>
                                <TableHead className="h-9 px-3 text-left font-semibold text-xs text-muted-foreground w-[180px]">
                                  Danh mục
                                </TableHead>
                                <TableHead className="h-9 px-3 text-left font-semibold text-xs text-muted-foreground w-[140px]">
                                  Quy cách
                                </TableHead>
                                <TableHead className="h-9 px-3 text-right font-semibold text-xs text-muted-foreground w-[120px]">
                                  Giá gốc
                                </TableHead>
                                <TableHead className="h-9 px-3 text-right font-semibold text-xs text-muted-foreground w-[120px]">
                                  Giá bán
                                </TableHead>
                                <TableHead className="h-9 px-3 text-center font-semibold text-xs text-muted-foreground w-[76px]">
                                  Kho
                                </TableHead>
                                <TableHead className="h-9 px-3 text-left font-semibold text-xs text-muted-foreground min-w-[200px] max-w-[280px]">
                                  Mô tả
                                </TableHead>
                                <TableHead className="h-9 px-3 text-right font-semibold text-xs text-muted-foreground w-[84px]">
                                  Thao tác
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {products.map((product, index) => {
                                const cleanedName = stripProductDimensions(
                                  product.name || '',
                                  product.sku || '',
                                  product.category || ''
                                );
                                const rowNumber = (currentPage - 1) * itemsPerPage + index + 1;
                                return (
                                  <TableRow
                                    key={product.id}
                                    className="border-b border-border/60 even:bg-muted/15 hover:bg-muted/40 transition-colors"
                                  >
                                    <TableCell className="py-2 px-3 text-center text-xs text-muted-foreground tabular-nums">
                                      {rowNumber}
                                    </TableCell>
                                    <TableCell className="py-2 px-3 align-middle font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                                      {product.sku || '—'}
                                    </TableCell>
                                    <TableCell className="py-2 px-3 align-middle font-medium text-foreground">
                                      <div className=" truncate max-w-[300px]" title={cleanedName}>
                                        {cleanedName}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-2 px-3 align-middle text-xs text-muted-foreground">
                                      <div className="truncate max-w-[180px]" title={product.category || 'Chưa phân loại'}>
                                        {product.category || '—'}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-2 px-3 align-middle font-mono text-xs text-foreground whitespace-nowrap">
                                      {product.specifications || '—'}
                                    </TableCell>
                                    <TableCell className="py-2 px-3 align-middle text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                                      {product.cost_price ? formatPrice(product.cost_price) : '—'}
                                    </TableCell>
                                    <TableCell className="py-2 px-3 align-middle text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                                      {product.price ? formatPrice(product.price) : '—'}
                                    </TableCell>
                                    <TableCell className="py-2 px-3 align-middle text-center">
                                      <span
                                        className={
                                          product.in_stock
                                            ? 'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                            : 'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-destructive/10 text-destructive'
                                        }
                                      >
                                        {product.in_stock ? 'Còn' : 'Hết'}
                                      </span>
                                    </TableCell>
                                    <TableCell className="py-2 px-3 align-middle text-xs text-muted-foreground max-w-[280px]">
                                      <div className="truncate" title={product.description || ''}>
                                        {product.description || '—'}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-2 px-3 align-middle text-right whitespace-nowrap">
                                      <div className="inline-flex items-center justify-end gap-0.5">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => openEditDialog(product)}
                                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                          title="Chỉnh sửa"
                                        >
                                          <Edit className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setDeletingProduct(product)}
                                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                          title="Xóa"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        )}
                      </div>

                      {/* Compact Pagination Footer */}
                      {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2.5 border-t bg-muted/20">
                          <div className="text-xs text-muted-foreground">
                            Hiển thị <strong>{(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, totalProducts)}</strong> / <strong>{totalProducts}</strong> sản phẩm
                          </div>

                          <Pagination className="mx-0 w-auto">
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious
                                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                  className={currentPage === 1 ? 'pointer-events-none opacity-50 h-8 text-xs' : 'cursor-pointer h-8 text-xs'}
                                />
                              </PaginationItem>

                              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                  pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                  pageNum = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                  pageNum = totalPages - 4 + i;
                                } else {
                                  pageNum = currentPage - 2 + i;
                                }

                                return (
                                  <PaginationItem key={pageNum}>
                                    <PaginationLink
                                      onClick={() => setCurrentPage(pageNum)}
                                      isActive={pageNum === currentPage}
                                      className="cursor-pointer h-8 w-8 text-xs"
                                    >
                                      {pageNum}
                                    </PaginationLink>
                                  </PaginationItem>
                                );
                              })}

                              <PaginationItem>
                                <PaginationNext
                                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                  className={currentPage === totalPages ? 'pointer-events-none opacity-50 h-8 text-xs' : 'cursor-pointer h-8 text-xs'}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Product Dialog */}
      {editingProduct && (
        <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Chỉnh sửa sản phẩm</DialogTitle>
              <DialogDescription>
                Cập nhật thông tin sản phẩm
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editSku">Mã SP</Label>
                  <Input
                    id="editSku"
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editName">Tên sản phẩm</Label>
                  <Input
                    id="editName"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editCategory">Danh mục</Label>
                  <Input
                    id="editCategory"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editSpecifications">Quy cách</Label>
                  <Input
                    id="editSpecifications"
                    value={editSpecifications}
                    onChange={(e) => setEditSpecifications(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editCostPrice">Giá gốc</Label>
                  <Input
                    id="editCostPrice"
                    type="number"
                    step="0.01"
                    value={editCostPrice}
                    onChange={(e) => setEditCostPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editPrice">Giá bán</Label>
                  <Input
                    id="editPrice"
                    type="number"
                    step="0.01"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDescription">Mô tả</Label>
                <Textarea
                  id="editDescription"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editInStock">Còn hàng</Label>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="editInStock"
                    checked={editInStock}
                    onCheckedChange={setEditInStock}
                  />
                  <Label htmlFor="editInStock">
                    {editInStock ? 'Còn hàng' : 'Hết hàng'}
                  </Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingProduct(null)}>
                Hủy
              </Button>
              <Button onClick={handleEditProduct}>
                Cập nhật
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Product Dialog */}
      {deletingProduct && (
        <Dialog open={!!deletingProduct} onOpenChange={() => setDeletingProduct(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Xác nhận xóa</DialogTitle>
              <DialogDescription>
                Bạn có chắc chắn muốn xóa sản phẩm "{deletingProduct.name}"? 
                Hành động này không thể hoàn tác.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingProduct(null)}>
                Hủy
              </Button>
              <Button variant="destructive" onClick={handleDeleteProduct}>
                Xóa
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Price List Dialog */}
      {editingPriceList && (
        <Dialog open={!!editingPriceList} onOpenChange={() => setEditingPriceList(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Chỉnh sửa bảng giá</DialogTitle>
              <DialogDescription>
                Cập nhật thông tin bảng giá
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editPriceListName">Tên bảng giá *</Label>
                <Input
                  id="editPriceListName"
                  value={editPriceListName}
                  onChange={(e) => setEditPriceListName(e.target.value)}
                  placeholder="Bảng giá bán lẻ"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPriceListYear">Năm *</Label>
                <Input
                  id="editPriceListYear"
                  type="number"
                  value={editPriceListYear}
                  onChange={(e) => setEditPriceListYear(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPriceList(null)}>
                Hủy
              </Button>
              <Button onClick={handleEditPriceList} disabled={editPriceListLoading}>
                {editPriceListLoading ? 'Đang cập nhật...' : 'Cập nhật'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Price List Dialog */}
      {deletingPriceList && (
        <Dialog open={!!deletingPriceList} onOpenChange={() => setDeletingPriceList(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Xác nhận xóa</DialogTitle>
               <DialogDescription>
                 Bạn có chắc chắn muốn xóa bảng giá "{deletingPriceList.name}"? 
                 Hành động này sẽ xóa bảng giá và không thể hoàn tác.
               </DialogDescription>
               {priceLists.length > 0 && (
                 <div className="mt-2 p-2 bg-warning/10 rounded text-sm">
                   <strong>Lưu ý:</strong> Bảng giá chỉ có thể xóa khi không còn sản phẩm nào.
                 </div>
               )}
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingPriceList(null)}>
                Hủy
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeletePriceList}
                disabled={deletePriceListLoading}
              >
                {deletePriceListLoading ? 'Đang xóa...' : 'Xóa'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete All Products Dialog */}
      {showDeleteAllDialog && (
        <Dialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Xác nhận xóa toàn bộ sản phẩm</DialogTitle>
              <DialogDescription>
                Bạn có chắc chắn muốn xóa <strong>toàn bộ {filteredProducts.length} sản phẩm</strong> trong bảng giá này?
                <div className="mt-3 p-3 bg-destructive/10 rounded text-sm">
                  <strong>⚠️ Cảnh báo:</strong> Hành động này sẽ xóa vĩnh viễn tất cả sản phẩm và không thể hoàn tác.
                </div>
                {selectedPriceList && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Bảng giá: <strong>{priceLists.find(p => p.id === selectedPriceList)?.name}</strong>
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteAllDialog(false)}>
                Hủy
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteAllProducts}
                disabled={deleteAllLoading}
              >
                {deleteAllLoading ? 'Đang xóa...' : 'Xóa toàn bộ'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Column Mapping Dialog */}
      <ColumnMappingDialog
        open={showColumnMapping}
        onOpenChange={setShowColumnMapping}
        googleSheetsUrl={googleSheetsUrl}
        priceListId={selectedPriceList}
        onImportComplete={refreshProductData}
      />
    </div>
  );
};

export default ProductManagement;
