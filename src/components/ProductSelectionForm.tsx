import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Search, Plus, Package } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  sku: string | null;
  category: string | null;
  specifications: string | null;
}

interface ProductSelectionFormProps {
  products: Product[];
  onAddProduct: (product: Product) => void;
  selectedPriceListId?: string;
}

export const ProductSelectionForm = ({ products, onAddProduct, selectedPriceListId }: ProductSelectionFormProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAddManualDialog, setShowAddManualDialog] = useState(false);
  const [manualProduct, setManualProduct] = useState({
    name: '',
    description: '',
    price: '',
    sku: '',
    category: '',
    specifications: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    if (searchTerm.length > 0) {
      const filtered = products.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProducts(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredProducts([]);
      setShowSuggestions(false);
    }
  }, [searchTerm, products]);

  const handleSelectProduct = (product: Product) => {
    onAddProduct(product);
    setSearchTerm('');
    setShowSuggestions(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  const handleAddManualProduct = async () => {
    if (!manualProduct.name || !manualProduct.price) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập tên sản phẩm và giá",
        variant: "destructive",
      });
      return;
    }

    if (!selectedPriceListId) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn bảng giá trước khi thêm sản phẩm",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create new product in the products table
      const { data: productData, error: productError } = await supabase
        .from('products')
        .insert({
          name: manualProduct.name,
          description: manualProduct.description || null,
          price: parseFloat(manualProduct.price),
          sku: manualProduct.sku || null,
          category: manualProduct.category || null,
          specifications: manualProduct.specifications || null,
          price_list_id: selectedPriceListId
        })
        .select()
        .single();

      if (productError) throw productError;

      // Add the new product to the quote
      onAddProduct(productData);

      // Clear the form and close dialog
      setManualProduct({
        name: '',
        description: '',
        price: '',
        sku: '',
        category: '',
        specifications: ''
      });
      setShowAddManualDialog(false);

      toast({
        title: "Thành công",
        description: "Sản phẩm đã được thêm vào bảng giá và báo giá",
      });
    } catch (error) {
      console.error('Error adding manual product:', error);
      toast({
        title: "Lỗi",
        description: "Không thể thêm sản phẩm mới",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Tìm kiếm sản phẩm */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm sản phẩm theo tên hoặc mã SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => searchTerm && setShowSuggestions(true)}
            className="pl-10 text-lg py-3"
          />
        </div>
        
        {/* Danh sách sản phẩm tìm được */}
        {showSuggestions && filteredProducts.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border rounded-md shadow-lg max-h-80 overflow-y-auto">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                className="p-4 hover:bg-muted cursor-pointer border-b last:border-b-0 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="font-medium text-lg">{product.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    SKU: <span className="font-mono font-medium text-blue-600">{product.sku || 'N/A'}</span>
                  </div>
                  {product.specifications && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {product.specifications}
                    </div>
                  )}
                  {product.category && (
                    <Badge variant="secondary" className="text-xs mt-2">
                      {product.category}
                    </Badge>
                  )}
                </div>
                <div className="text-right ml-4">
                  <div className="font-bold text-lg text-green-600">
                    {formatCurrency(product.price || 0)}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground mt-1">
                    <Plus className="h-4 w-4 mr-1" />
                    Ấn để thêm
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Thông báo không tìm thấy */}
        {showSuggestions && searchTerm && filteredProducts.length === 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border rounded-md shadow-lg p-4">
            <div className="text-center space-y-3">
              <div className="text-muted-foreground">
                Không tìm thấy sản phẩm nào với từ khóa "{searchTerm}"
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setManualProduct(prev => ({ ...prev, name: searchTerm }));
                  setShowAddManualDialog(true);
                  setShowSuggestions(false);
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Thêm sản phẩm mới "{searchTerm}"
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Hướng dẫn sử dụng */}
      {!searchTerm && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="text-sm text-blue-700 space-y-2">
              <div>💡 <strong>Hướng dẫn:</strong> Gõ tên sản phẩm hoặc mã SKU để tìm kiếm, sau đó ấn vào sản phẩm muốn thêm vào báo giá</div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span>Không tìm thấy sản phẩm? Bạn có thể thêm sản phẩm mới ngay trong quá trình tạo báo giá</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nút thêm sản phẩm thủ công */}
      <Card className="border-dashed border-2 border-primary/30 hover:border-primary/50 transition-colors">
        <CardContent className="p-4">
          <Dialog open={showAddManualDialog} onOpenChange={setShowAddManualDialog}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="w-full h-auto p-4 flex flex-col gap-2 text-muted-foreground hover:text-primary">
                <Plus className="h-6 w-6" />
                <span className="font-medium">Thêm sản phẩm thủ công</span>
                <span className="text-xs">Tạo sản phẩm mới và thêm vào báo giá</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Thêm sản phẩm mới</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productName">Tên sản phẩm *</Label>
                  <Input
                    id="productName"
                    value={manualProduct.name}
                    onChange={(e) => setManualProduct(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Nhập tên sản phẩm..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productPrice">Đơn giá (VNĐ) *</Label>
                  <Input
                    id="productPrice"
                    type="number"
                    value={manualProduct.price}
                    onChange={(e) => setManualProduct(prev => ({ ...prev, price: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productSku">Mã SKU</Label>
                  <Input
                    id="productSku"
                    value={manualProduct.sku}
                    onChange={(e) => setManualProduct(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="Nhập mã SKU..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productCategory">Danh mục</Label>
                  <Input
                    id="productCategory"
                    value={manualProduct.category}
                    onChange={(e) => setManualProduct(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="Nhập danh mục..."
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="productDescription">Mô tả</Label>
                  <Textarea
                    id="productDescription"
                    value={manualProduct.description}
                    onChange={(e) => setManualProduct(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Nhập mô tả sản phẩm..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="productSpecs">Thông số kỹ thuật</Label>
                  <Textarea
                    id="productSpecs"
                    value={manualProduct.specifications}
                    onChange={(e) => setManualProduct(prev => ({ ...prev, specifications: e.target.value }))}
                    placeholder="Nhập thông số kỹ thuật..."
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowAddManualDialog(false)}>
                  Hủy
                </Button>
                <Button onClick={handleAddManualProduct}>
                  Thêm sản phẩm
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
};