import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Package, Plus, Edit, Trash2, Search, Filter, FileSpreadsheet, Users, Calendar, Settings, Image, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { ColumnMappingDialog } from '@/components/ColumnMappingDialog';
import ProductImageLibrary from '@/components/ProductImageLibrary';
import { useDebounce } from '@/hooks/useDebounce';

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
  const [user, setUser] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const itemsPerPage = 50;
  const [createProductLoading, setCreateProductLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [selectedPriceList, setSelectedPriceList] = useState<string>('');
  
  // Debounced search for performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [importLoading, setImportLoading] = useState(false);
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState('');
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const { role: currentUserRole, loading: roleLoading } = useUserRole(user);
  const { toast } = useToast();

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

  // Product Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [specifications, setSpecifications] = useState('');
  const [inStock, setInStock] = useState(true);

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
    });
  }, []);

  useEffect(() => {
    if (currentUserRole && !roleLoading) {
      fetchPriceLists();
      fetchProducts();
    }
  }, [currentUserRole, roleLoading]);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
    fetchProducts();
  }, [debouncedSearchTerm, categoryFilter, stockFilter, selectedPriceList]);

  useEffect(() => {
    fetchProducts();
  }, [currentPage]);

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
        .select('*')
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
    setLoading(true);
    try {
      const offset = (currentPage - 1) * itemsPerPage;
      
      let query = supabase
        .from('products' as any)
        .select('*', { count: 'exact' });

      // Apply filters at database level
      if (selectedPriceList) {
        query = query.eq('price_list_id', selectedPriceList);
      }

      if (debouncedSearchTerm) {
        query = query.or(`name.ilike.%${debouncedSearchTerm}%,sku.ilike.%${debouncedSearchTerm}%,description.ilike.%${debouncedSearchTerm}%`);
      }

      if (categoryFilter && categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      if (stockFilter && stockFilter !== 'all') {
        const inStock = stockFilter === 'in-stock';
        query = query.eq('in_stock', inStock);
      }

      // Add pagination
      query = query
        .range(offset, offset + itemsPerPage - 1)
        .order('category', { ascending: true })
        .order('sku', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;
      
      setProducts((data as unknown as Product[]) || []);
      setTotalProducts(count || 0);
      setTotalPages(Math.ceil((count || 0) / itemsPerPage));
      
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách sản phẩm",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Get unique categories for filter dropdown
  const getUniqueCategories = () => {
    const categories = products
      .map(p => p.category)
      .filter(Boolean)
      .filter((value, index, self) => self.indexOf(value) === index);
    return categories;
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
        toast({
          title: "Thành công",
          description: data.message,
        });
        setGoogleSheetsUrl('');
        // Force refresh products to show updated data
        setCurrentPage(1);
        await fetchProducts();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error importing products:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể import sản phẩm",
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
      fetchProducts();
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
      fetchProducts();
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
      fetchProducts();
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
      fetchProducts();
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

  // Remove this function as it's now handled by getUniqueCategories async function above

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
      <div className="bg-gradient-subtle rounded-lg border p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">Quản lý sản phẩm</h1>
            <p className="text-muted-foreground">
              Quản lý bảng giá và sản phẩm
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="products" className="space-y-6">
        <TabsList>
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
        </TabsList>

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
              <ProductImageLibrary 
                onSelectImage={(imageUrl) => {
                  navigator.clipboard.writeText(imageUrl);
                  toast({
                    title: "Đã sao chép",
                    description: "Đường dẫn hình ảnh đã được sao chép vào clipboard",
                  });
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          {/* Price List Selection & Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  Chọn bảng giá để xem sản phẩm
                </CardTitle>
                <CardDescription className="text-sm">
                  Chọn bảng giá để hiển thị danh sách sản phẩm tương ứng
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={selectedPriceList} onValueChange={setSelectedPriceList}>
                  <SelectTrigger className="w-full h-14 bg-muted/30 hover:bg-muted/50 transition-all duration-200 border-2 hover:border-primary/40 focus:border-primary">
                    <SelectValue placeholder="Chọn bảng giá để bắt đầu..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg max-h-[300px] z-50">
                    {priceLists.map((priceList) => (
                      <SelectItem 
                        key={priceList.id} 
                        value={priceList.id}
                        className="hover:bg-accent/60 focus:bg-accent/60 cursor-pointer py-4 px-3 transition-colors"
                      >
                        <div className="flex items-center justify-between w-full min-w-0">
                          <div className="flex flex-col items-start min-w-0 flex-1 mr-3">
                            <div className="flex items-center gap-2 w-full">
                              <span className="font-semibold text-foreground text-base truncate">
                                {priceList.name}
                              </span>
                              <Badge 
                                variant={priceList.status === 'active' ? 'default' : 'secondary'} 
                                className="text-xs font-medium shrink-0"
                              >
                                {priceList.status === 'active' ? 'Đang dùng' : 'Nháp'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">Năm {priceList.year}</span>
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedPriceList && (
                  <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/10">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                      <span className="text-sm font-medium text-primary">
                        Đang hiển thị sản phẩm từ: {priceLists.find(p => p.id === selectedPriceList)?.name}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Thống kê sản phẩm</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tổng sản phẩm:</span>
                  <span className="font-bold text-primary">{totalProducts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Trang hiện tại:</span>
                  <span className="font-medium text-accent">{products.length} sản phẩm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Trang:</span>
                  <span className="font-medium text-muted-foreground">{currentPage}/{totalPages}</span>
                </div>
                {selectedPriceList && (
                  <div className="pt-2 border-t">
                    <span className="text-xs text-muted-foreground">
                      Bảng giá: {priceLists.find(p => p.id === selectedPriceList)?.name}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Import and Actions */}
          {selectedPriceList && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Import & Quản lý
                </CardTitle>
                <CardDescription>
                  Import sản phẩm từ Google Sheets hoặc thêm thủ công
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Nhập link Google Sheets để import..."
                      value={googleSheetsUrl}
                      onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Định dạng: Mã SP | Danh mục | Tên SP | Quy cách | Giá gốc | Giá bán | Mô tả
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setShowColumnMapping(true)}
                      disabled={!googleSheetsUrl}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      Import
                    </Button>
                    <Button
                      onClick={() => {
                        setShowCreateForm(true);
                        document.getElementById('create-product-form')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Thêm SP
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedPriceList && (
            <>
              {/* Create Product Form */}
              <Card id="create-product-form">
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setShowCreateForm(!showCreateForm)}
                >
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plus className="h-5 w-5" />
                      Thêm sản phẩm mới
                    </div>
                    <Button variant="ghost" size="sm" type="button">
                      {showCreateForm ? 'Thu gọn' : 'Mở rộng'}
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    Điền thông tin để tạo sản phẩm mới trong bảng giá đã chọn
                  </CardDescription>
                </CardHeader>
                {showCreateForm && (
                  <CardContent>
                    <form onSubmit={handleCreateProduct} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="sku">Mã SP *</Label>
                          <Input
                            id="sku"
                            value={sku}
                            onChange={(e) => setSku(e.target.value)}
                            required
                            placeholder="VD: SP001"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="name">Tên sản phẩm *</Label>
                          <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            placeholder="Tên sản phẩm"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="category">Danh mục</Label>
                          <Input
                            id="category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            placeholder="Danh mục"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="specifications">Quy cách</Label>
                          <Input
                            id="specifications"
                            value={specifications}
                            onChange={(e) => setSpecifications(e.target.value)}
                            placeholder="Quy cách"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="costPrice">Giá gốc (VND)</Label>
                          <Input
                            id="costPrice"
                            type="number"
                            step="1000"
                            value={costPrice}
                            onChange={(e) => setCostPrice(e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="price">Giá bán (VND)</Label>
                          <Input
                            id="price"
                            type="number"
                            step="1000"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="inStock">Tình trạng</Label>
                          <div className="flex items-center space-x-2 h-10">
                            <Switch
                              id="inStock"
                              checked={inStock}
                              onCheckedChange={setInStock}
                            />
                            <Label htmlFor="inStock" className="text-sm">
                              {inStock ? 'Còn hàng' : 'Hết hàng'}
                            </Label>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Mô tả</Label>
                        <Textarea
                          id="description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={2}
                          placeholder="Mô tả chi tiết sản phẩm..."
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" disabled={createProductLoading}>
                          {createProductLoading ? 'Đang tạo...' : 'Tạo sản phẩm'}
                        </Button>
                        <Button 
                          type="button" 
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
                          Xóa form
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                )}
              </Card>

              {/* Search and Filter */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Tìm kiếm và lọc
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="search">Tìm kiếm</Label>
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="search"
                          placeholder="Tìm sản phẩm, mã SP..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Danh mục</Label>
                      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Tất cả danh mục" />
                        </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="all">Tất cả danh mục</SelectItem>
                           {getUniqueCategories().map((cat) => (
                             <SelectItem key={cat} value={cat!}>
                               {cat}
                             </SelectItem>
                           ))}
                         </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tình trạng</Label>
                      <Select value={stockFilter} onValueChange={setStockFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Tất cả" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả</SelectItem>
                          <SelectItem value="in-stock">Còn hàng</SelectItem>
                          <SelectItem value="out-of-stock">Hết hàng</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                       <Button 
                         variant="outline" 
                         onClick={() => {
                           setSearchTerm('');
                           setCategoryFilter('all');
                           setStockFilter('all');
                           setCurrentPage(1);
                         }}
                         className="w-full"
                       >
                         Xóa bộ lọc
                       </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Products List */}
              <Card>
                <CardHeader>
                   <CardTitle className="flex items-center justify-between">
                     <div className="flex items-center gap-2">
                       <Package className="h-5 w-5" />
                       Danh sách sản phẩm
                     </div>
                     <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-sm">
                          Trang {currentPage}/{totalPages} - {products.length}/{totalProducts} sản phẩm
                        </Badge>
                        {products.length > 0 && (
                         <Button
                           variant="destructive"
                           size="sm"
                           onClick={() => setShowDeleteAllDialog(true)}
                           className="flex items-center gap-2"
                         >
                           <Trash2 className="h-4 w-4" />
                           Xóa toàn bộ
                         </Button>
                       )}
                     </div>
                   </CardTitle>
                </CardHeader>
                 <CardContent className="p-0">
                   {loading ? (
                     <div className="text-center py-12 px-6">
                       <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                       <p className="text-muted-foreground">Đang tải sản phẩm...</p>
                     </div>
                   ) : products.length === 0 ? (
                     <div className="text-center py-12 px-6 text-muted-foreground">
                       <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                       <p className="text-lg font-medium mb-2">Không có sản phẩm</p>
                       <p className="text-sm">
                         {selectedPriceList 
                           ? `Không có sản phẩm nào trong bảng giá "${priceLists.find(p => p.id === selectedPriceList)?.name}"`
                           : "Vui lòng chọn bảng giá để xem sản phẩm"
                         }
                       </p>
                     </div>
                   ) : (
                     <>
                       <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-b border-border bg-muted/30">
                                <TableHead className="h-12 px-4 text-left align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0 w-[100px]">
                                  Mã SP
                                </TableHead>
                                <TableHead className="h-12 px-4 text-left align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0 w-[120px]">
                                  Danh mục
                                </TableHead>
                                <TableHead className="h-12 px-4 text-left align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0 min-w-[200px]">
                                  Tên sản phẩm
                                </TableHead>
                                <TableHead className="h-12 px-4 text-left align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0 w-[140px]">
                                  Quy cách
                                </TableHead>
                                <TableHead className="h-12 px-4 text-right align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0 w-[120px]">
                                  Giá gốc
                                </TableHead>
                                <TableHead className="h-12 px-4 text-right align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0 w-[120px]">
                                  Giá bán
                                </TableHead>
                                <TableHead className="h-12 px-4 text-center align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0 w-[80px]">
                                  Kho
                                </TableHead>
                                <TableHead className="h-12 px-4 text-left align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0 min-w-[180px]">
                                  Mô tả
                                </TableHead>
                                <TableHead className="h-12 px-4 text-center align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0 w-[100px]">
                                  Thao tác
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {products.map((product) => (
                                <TableRow 
                                  key={product.id} 
                                  className="border-b border-border hover:bg-white hover:text-accent transition-colors duration-200 group"
                                >
                                  <TableCell className="p-4 align-middle font-mono text-sm font-medium">
                                    {product.sku || '-'}
                                  </TableCell>
                                  <TableCell className="p-4 align-middle">
                                    <Badge variant="outline" className="text-xs bg-muted/50 group-hover:bg-accent/10 group-hover:text-accent group-hover:border-accent/30">
                                      {product.category || 'Chưa phân loại'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="p-4 align-middle font-medium">
                                    <div className="line-clamp-2 leading-relaxed">
                                      {product.name}
                                    </div>
                                  </TableCell>
                                  <TableCell className="p-4 align-middle text-sm text-muted-foreground group-hover:text-accent/80">
                                    <div className="line-clamp-1">
                                      {product.specifications || '-'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="p-4 align-middle text-right font-medium text-muted-foreground group-hover:text-accent/80">
                                    {product.cost_price ? formatPrice(product.cost_price) : '-'}
                                  </TableCell>
                                  <TableCell className="p-4 align-middle text-right font-bold text-primary group-hover:text-accent">
                                    {product.price ? formatPrice(product.price) : '-'}
                                  </TableCell>
                                  <TableCell className="p-4 align-middle text-center">
                                    <Badge 
                                      variant={product.in_stock ? 'default' : 'destructive'} 
                                      className="text-xs group-hover:bg-accent/10 group-hover:text-accent group-hover:border-accent/30"
                                    >
                                      {product.in_stock ? 'Còn' : 'Hết'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="p-4 align-middle text-sm text-muted-foreground group-hover:text-accent/80">
                                    <div className="line-clamp-2 leading-relaxed">
                                      {product.description || '-'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="p-4 align-middle text-center">
                                    <div className="flex justify-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openEditDialog(product)}
                                        className="h-8 w-8 p-0 hover:bg-accent/10 hover:text-accent"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setDeletingProduct(product)}
                                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                       </div>
                       
                       {/* Pagination Controls */}
                       {totalPages > 1 && (
                         <div className="flex items-center justify-between px-6 py-4 border-t">
                           <div className="text-sm text-muted-foreground">
                             Hiển thị {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalProducts)} của {totalProducts} sản phẩm
                           </div>
                           
                           <Pagination>
                             <PaginationContent>
                               <PaginationItem>
                                 <PaginationPrevious 
                                   onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                   className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                 />
                               </PaginationItem>
                               
                               {/* Page numbers */}
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
                                       className="cursor-pointer"
                                     >
                                       {pageNum}
                                     </PaginationLink>
                                   </PaginationItem>
                                 );
                               })}
                               
                               <PaginationItem>
                                 <PaginationNext 
                                   onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                   className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
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
        onImportComplete={fetchProducts}
      />
    </div>
  );
};

export default ProductManagement;