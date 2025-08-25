import React from "react";
import { Badge } from "@/components/ui/badge";
import MobileCard from "./MobileCard";
import { Package, DollarSign, Hash, Ruler, Palette } from "lucide-react";

interface Product {
  id: string;
  name: string;
  code?: string;
  price?: number;
  cost_price?: number;
  category?: string;
  stock_quantity?: number;
  description?: string;
  color?: string;
  size?: string;
  status?: string;
}

interface MobileProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onView: (product: Product) => void;
}

export const MobileProductCard: React.FC<MobileProductCardProps> = ({
  product,
  onEdit,
  onDelete,
  onView
}) => {
  const getStatusVariant = (status?: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'inactive': return 'secondary';
      case 'discontinued': return 'destructive';
      default: return 'outline';
    }
  };

  const getStockStatus = (quantity?: number) => {
    if (!quantity || quantity === 0) return { label: "Hết hàng", variant: "destructive" as const };
    if (quantity < 10) return { label: "Sắp hết", variant: "outline" as const };
    return { label: "Còn hàng", variant: "default" as const };
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return "0 VNĐ";
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  const calculateMargin = () => {
    if (!product.price || !product.cost_price) return 0;
    return Math.round(((product.price - product.cost_price) / product.price) * 100);
  };

  const stockStatus = getStockStatus(product.stock_quantity);

  return (
    <MobileCard
      title={product.name}
      subtitle={product.code ? `Mã: ${product.code}` : undefined}
      status={{
        label: stockStatus.label,
        variant: stockStatus.variant
      }}
      value={{
        amount: formatCurrency(product.price),
        unit: ""
      }}
      onClick={() => onView(product)}
      actions={[
        {
          label: "Sửa",
          onClick: () => onEdit(product),
          variant: "outline"
        },
        {
          label: "Xóa",
          onClick: () => onDelete(product),
          variant: "destructive"
        }
      ]}
    >
      <div className="space-y-3">
        {/* Product Details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {product.category && (
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{product.category}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span>Kho: {product.stock_quantity || 0}</span>
          </div>
        </div>

        {/* Attributes */}
        {(product.color || product.size) && (
          <div className="flex gap-2 flex-wrap">
            {product.color && (
              <div className="flex items-center gap-1 bg-muted rounded-full px-2 py-1">
                <Palette className="h-3 w-3" />
                <span className="text-xs">{product.color}</span>
              </div>
            )}
            {product.size && (
              <div className="flex items-center gap-1 bg-muted rounded-full px-2 py-1">
                <Ruler className="h-3 w-3" />
                <span className="text-xs">{product.size}</span>
              </div>
            )}
          </div>
        )}

        {/* Financial Info */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Giá vốn</div>
            <div className="font-semibold text-red-600">
              {formatCurrency(product.cost_price)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Lợi nhuận</div>
            <div className="font-semibold text-green-600">
              {calculateMargin()}%
            </div>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div className="text-xs text-muted-foreground pt-2 border-t line-clamp-2">
            {product.description}
          </div>
        )}
      </div>
    </MobileCard>
  );
};

export default MobileProductCard;