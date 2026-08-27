import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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

interface ProductSelectionFormProps {
  products: Product[];
  onAddProduct: (product: Product) => void;
}

export const ProductSelectionForm = ({ products, onAddProduct }: ProductSelectionFormProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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
            <div className="text-center text-muted-foreground">
              Không tìm thấy sản phẩm nào với từ khóa "{searchTerm}"
            </div>
          </div>
        )}
      </div>

      {/* Hướng dẫn sử dụng */}
      {!searchTerm && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="text-sm text-blue-700">
              💡 <strong>Hướng dẫn:</strong> Gõ tên sản phẩm hoặc mã SKU để tìm kiếm, sau đó ấn vào sản phẩm muốn thêm vào báo giá
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};