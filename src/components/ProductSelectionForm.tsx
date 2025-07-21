import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  sku: string | null;
  category: string | null;
  specifications: string | null;
}

interface ProductData {
  product_id?: string;
  name: string;
  description: string;
  specifications: string;
  unit_price: number;
  quantity: number;
}

interface ProductSelectionFormProps {
  products: Product[];
  onAddProduct: (productData: ProductData) => void;
}

export const ProductSelectionForm = ({ products, onAddProduct }: ProductSelectionFormProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    specifications: '',
    unit_price: 0,
    quantity: 1,
  });

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

  const selectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearchTerm(product.name);
    setFormData({
      name: product.name,
      description: product.description || '',
      specifications: product.specifications || '',
      unit_price: product.price || 0,
      quantity: 1,
    });
    setShowSuggestions(false);
  };

  const clearSelection = () => {
    setSelectedProduct(null);
    setSearchTerm('');
    setFormData({
      name: '',
      description: '',
      specifications: '',
      unit_price: 0,
      quantity: 1,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    onAddProduct({
      product_id: selectedProduct?.id,
      name: formData.name,
      description: formData.description,
      specifications: formData.specifications,
      unit_price: formData.unit_price,
      quantity: formData.quantity,
    });

    clearSelection();
  };

  const calculateTotal = () => {
    return formData.unit_price * formData.quantity;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header với thông tin tổng quan */}
      <div className="bg-muted/30 p-4 rounded-lg">
        <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
          <div>Tìm kiếm sản phẩm</div>
          <div>Tên sản phẩm</div>
          <div>Mô tả sản phẩm</div>
          <div>Quy cách</div>
          <div>Đơn giá</div>
          <div>Số lượng</div>
          <div>Thành tiền</div>
        </div>
      </div>

      {/* Form input */}
      <div className="grid grid-cols-7 gap-4 items-start">
        {/* Tìm kiếm sản phẩm */}
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Gõ tên hoặc mã sản phẩm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => searchTerm && setShowSuggestions(true)}
              className="pl-10"
            />
          </div>
          
          {/* Suggestions dropdown */}
          {showSuggestions && filteredProducts.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => selectProduct(product)}
                  className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                >
                  <div className="font-medium">{product.name}</div>
                  <div className="text-sm text-muted-foreground">
                    SKU: {product.sku || 'N/A'} | {formatCurrency(product.price || 0)}
                  </div>
                  {product.category && (
                    <Badge variant="secondary" className="text-xs mt-1">
                      {product.category}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tên sản phẩm */}
        <div>
          <Input
            placeholder="Tên sản phẩm"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            required
          />
        </div>

        {/* Mô tả sản phẩm */}
        <div>
          <Textarea
            placeholder="Mô tả sản phẩm"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            rows={1}
            className="resize-none"
          />
        </div>

        {/* Quy cách */}
        <div>
          <Input
            placeholder="Quy cách"
            value={formData.specifications}
            onChange={(e) => setFormData(prev => ({ ...prev, specifications: e.target.value }))}
          />
        </div>

        {/* Đơn giá */}
        <div>
          <Input
            type="number"
            placeholder="Đơn giá"
            value={formData.unit_price}
            onChange={(e) => setFormData(prev => ({ ...prev, unit_price: parseFloat(e.target.value) || 0 }))}
            min="0"
            step="1000"
          />
        </div>

        {/* Số lượng */}
        <div>
          <Input
            type="number"
            placeholder="Số lượng"
            value={formData.quantity}
            onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
            min="1"
            required
          />
        </div>

        {/* Thành tiền (readonly) */}
        <div>
          <Input
            value={formatCurrency(calculateTotal())}
            readOnly
            className="bg-muted font-medium"
          />
        </div>
      </div>

      {/* Selected product info */}
      {selectedProduct && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-green-800">Đã chọn sản phẩm:</div>
                <div className="text-sm text-green-700">
                  {selectedProduct.name} (SKU: {selectedProduct.sku || 'N/A'})
                </div>
                {selectedProduct.category && (
                  <Badge variant="secondary" className="mt-1">
                    {selectedProduct.category}
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="text-green-700 hover:text-green-800"
              >
                Xóa lựa chọn
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={clearSelection}
        >
          Xóa form
        </Button>
        <Button
          type="submit"
          className="bg-green-600 hover:bg-green-700"
          disabled={!formData.name.trim()}
        >
          <Plus className="h-4 w-4 mr-2" />
          Thêm vào báo giá
        </Button>
      </div>
    </form>
  );
};