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
import { Package, Plus, Edit, Trash2, Search, Filter, FileSpreadsheet, Users, Calendar, Settings, Image } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ColumnMappingDialog } from '@/components/ColumnMappingDialog';
import ProductImageLibrary from '@/components/ProductImageLibrary';

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
  const [createProductLoading, setCreateProductLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [selectedPriceList, setSelectedPriceList] = useState<string>('');
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
    filterProducts();
  }, [products, searchTerm, categoryFilter, stockFilter, selectedPriceList]);

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
    try {
      let query = supabase
        .from('products' as any)
        .select('*');

      // RLS sẽ tự động filter dữ liệu theo role, không cần thêm filter manual
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setProducts((data as unknown as Product[]) || []);
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

  const filterProducts = () => {
    let filtered = products;

    if (selectedPriceList) {
      filtered = filtered.filter(product => product.price_list_id === selectedPriceList);
    }

    if (searchTerm) {
      filtered = filtered.filter(product => 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (categoryFilter && categoryFilter !== 'all') {
      filtered = filtered.filter(product => product.category === categoryFilter);
    }

    if (stockFilter && stockFilter !== 'all') {
      if (stockFilter === 'in-stock') {
        filtered = filtered.filter(product => product.in_stock);
      } else if (stockFilter === 'out-of-stock') {
        filtered = filtered.filter(product => !product.in_stock);
      }
    }

    setFilteredProducts(filtered);
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

  const getUniqueCategories = () => {
    const categories = products
      .map(p => p.category)
      .filter(Boolean)
      .filter((value, index, self) => self.indexOf(value) === index);
    return categories;
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
                            onClick={() => openEditDialog}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingProduct}
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
            <Card className="lg:col-span-2 bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary"></div>
                  Chọn bảng giá để xem sản phẩm
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedPriceList} onValueChange={setSelectedPriceList}>
                  <SelectTrigger className="w-full h-12 bg-background/80 hover:bg-background transition-colors border-2 hover:border-primary/30">
                    <SelectValue placeholder="Chọn bảng giá..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-2 border-border/50 shadow-lg">
                    {priceLists.map((priceList) => (
                      <SelectItem 
                        key={priceList.id} 
                        value={priceList.id}
                        className="hover:bg-accent/80 cursor-pointer py-3"
                      >
                        <div className="flex items-center justify-between w-full min-w-0">
                          <div className="flex flex-col items-start min-w-0 flex-1">
                            <span className="font-semibold text-foreground truncate">{priceList.name}</span>
                            <span className="text-xs text-muted-foreground">Năm {priceList.year}</span>
                          </div>
                          <Badge 
                            variant={priceList.status === 'active' ? 'default' : 'secondary'} 
                            className="text-xs shrink-0 ml-2"
                          >
                            {priceList.status === 'active' ? 'Đang dùng' : 'Nháp'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Thống kê sản phẩm</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tổng sản phẩm:</span>
                  <span className="font-bold text-primary">{filteredProducts.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Còn hàng:</span>
                  <span className="font-medium text-success">{filteredProducts.filter(p => p.in_stock).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Hết hàng:</span>
                  <span className="font-medium text-warning">{filteredProducts.filter(p => !p.in_stock).length}</span>
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
                      onClick={() => document.getElementById('create-product-form')?.scrollIntoView({ behavior: 'smooth' })}
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
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Thêm sản phẩm mới
                  </CardTitle>
                  <CardDescription>
                    Điền thông tin để tạo sản phẩm mới trong bảng giá đã chọn
                  </CardDescription>
                </CardHeader>
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
                    <Badge variant="outline" className="text-sm">
                      {filteredProducts.length} sản phẩm
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredProducts.length === 0 ? (
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
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b bg-muted/50">
                            <TableHead className="w-20 font-semibold">Mã SP</TableHead>
                            <TableHead className="w-24 font-semibold">Danh mục</TableHead>
                            <TableHead className="w-48 font-semibold">Tên sản phẩm</TableHead>
                            <TableHead className="w-32 font-semibold">Quy cách</TableHead>
                            <TableHead className="w-24 text-right font-semibold">Giá gốc</TableHead>
                            <TableHead className="w-24 text-right font-semibold">Giá bán</TableHead>
                            <TableHead className="w-16 text-center font-semibold">Kho</TableHead>
                            <TableHead className="w-48 font-semibold">Mô tả</TableHead>
                            <TableHead className="w-20 text-center font-semibold">Thao tác</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProducts.map((product) => (
                            <TableRow key={product.id} className="hover:bg-muted/30 transition-colors">
                              <TableCell className="font-mono text-sm font-medium">
                                {product.sku || '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {product.category || 'Chưa phân loại'}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="line-clamp-2 max-w-48">
                                  {product.name}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                <div className="line-clamp-1 max-w-32">
                                  {product.specifications || '-'}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium text-muted-foreground">
                                {product.cost_price ? formatPrice(product.cost_price) : '-'}
                              </TableCell>
                              <TableCell className="text-right font-bold text-primary">
                                {product.price ? formatPrice(product.price) : '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={product.in_stock ? 'default' : 'destructive'} className="text-xs">
                                  {product.in_stock ? 'Còn' : 'Hết'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                <div className="line-clamp-2 max-w-48">
                                  {product.description || '-'}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(product)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeletingProduct(product)}
                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
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