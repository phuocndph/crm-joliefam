import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Edit, Trash2, Package } from "lucide-react";

interface Props {
  products: any[];
  formatPrice: (n: number) => string;
  onEdit: (p: any) => void;
  onDelete: (p: any) => void;
}

export const MobileProductList: React.FC<Props> = ({ products, formatPrice, onEdit, onDelete }) => {
  if (!products?.length) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground flex flex-col items-center gap-2">
        <Package className="h-8 w-8" />
        Không có sản phẩm
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {products.map((p) => (
        <Card
          key={p.id}
          className={cn(
            "p-3 space-y-2 border-l-4",
            p.in_stock ? "border-l-sidebar-primary" : "border-l-red-500",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs text-muted-foreground">{p.sku || "—"}</div>
              <div className="font-semibold line-clamp-2 mt-0.5">{p.name}</div>
            </div>
            <Badge variant={p.in_stock ? "default" : "destructive"} className="text-[10px] shrink-0">
              {p.in_stock ? "Còn" : "Hết"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs pt-1 border-t border-border/60">
            <div>
              <span className="text-[10px] text-muted-foreground">Danh mục</span>
              <div className="truncate">{p.category || "—"}</div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground">Quy cách</span>
              <div className="truncate">{p.specifications || "—"}</div>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Giá gốc</span>
              <div className="font-semibold text-muted-foreground">{p.cost_price ? formatPrice(p.cost_price) : "—"}</div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground">Giá bán</span>
              <div className="font-semibold text-primary">{p.price ? formatPrice(p.price) : "—"}</div>
            </div>
          </div>

          {p.description && (
            <div className="text-xs text-muted-foreground line-clamp-2 pt-1 border-t border-border/60">
              {p.description}
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-1 border-t border-border/60">
            <Button size="sm" variant="outline" className="flex-1 h-9 gap-1" onClick={() => onEdit(p)}>
              <Edit className="h-3.5 w-3.5" /> Sửa
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 gap-1 text-destructive hover:text-destructive"
              onClick={() => onDelete(p)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Xóa
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default MobileProductList;