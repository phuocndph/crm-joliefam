import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GripVertical, Trash2, Image, Plus, Copy, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface ProductCardProps {
  item: QuoteItem;
  index: number;
  isDragging?: boolean;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onUpdatePrice: (id: string, price: number) => void;
  onRemove: (id: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onAddAfter: (index: number) => void;
  onDuplicate?: (index: number) => void;
  onImageSelect?: (index: number) => void;
  className?: string;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  item,
  index,
  isDragging,
  onUpdateQuantity,
  onUpdatePrice,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onAddAfter,
  onDuplicate,
  onImageSelect,
  className
}) => {
  const [isEditing, setIsEditing] = useState(!item.name); // Auto-edit for empty items
  const [localName, setLocalName] = useState(item.name);
  const [isHovered, setIsHovered] = useState(false);

  const handleNameSave = () => {
    // You can add logic here to update the product name if needed
    setIsEditing(false);
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('vi-VN').format(price);
  };

  return (
    <div className="relative group">
      <Card 
        className={cn(
          "transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 border-2",
          "bg-gradient-to-br from-background to-background/50",
          isDragging && "shadow-2xl shadow-primary/20 scale-[1.02] rotate-1 z-50",
          !item.name && "border-dashed border-muted-foreground/30 bg-muted/20",
          className
        )}
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, index)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Drag Handle */}
        <div className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* Quick Actions */}
        <div className={cn(
          "absolute right-2 top-2 flex gap-1 transition-all duration-200",
          isHovered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
        )}>
          {onImageSelect && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-primary/10"
              onClick={() => onImageSelect(index)}
            >
              <Image className="h-3 w-3" />
            </Button>
          )}
          {onDuplicate && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-primary/10"
              onClick={() => onDuplicate(index)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-destructive/10 text-destructive"
            onClick={() => onRemove(item.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>

        <CardContent className="p-4 pt-8">
          {/* Product Header */}
          <div className="space-y-3">
            {/* Product Name & SKU */}
            <div className="space-y-2">
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    placeholder="Tên sản phẩm..."
                    className="flex-1"
                    onBlur={handleNameSave}
                    onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                    autoFocus
                  />
                  <Button size="sm" onClick={handleNameSave}>
                    <Edit3 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div 
                  className="cursor-pointer hover:bg-muted/50 p-2 rounded-md transition-colors"
                  onClick={() => setIsEditing(true)}
                >
                  <h3 className="font-semibold text-foreground leading-tight">
                    {item.name || "Chưa có tên sản phẩm"}
                  </h3>
                  {item.sku && (
                    <Badge variant="outline" className="text-xs mt-1">
                      {item.sku}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Product Image */}
            {item.selectedImage && (
              <div className="relative">
                <img 
                  src={item.selectedImage} 
                  alt={item.name}
                  className="w-full h-24 object-cover rounded-md border"
                />
              </div>
            )}

            {/* Description */}
            {item.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {item.description}
              </p>
            )}

            {/* Price & Quantity Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Đơn giá
                </label>
                <CurrencyInput
                  value={item.price}
                  onChange={(value) => onUpdatePrice(item.id, value || 0)}
                  placeholder="0"
                  className="text-sm font-mono"
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Số lượng
                </label>
                <Input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => onUpdateQuantity(item.id, parseInt(e.target.value) || 0)}
                  min="0"
                  className="text-sm font-mono"
                />
              </div>
            </div>

            {/* Total */}
            <div className="pt-2 border-t border-border/50">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">
                  Thành tiền
                </span>
                <span className="text-lg font-bold text-primary bg-primary/10 px-3 py-1 rounded-md">
                  {formatPrice(item.total)}đ
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Button - appears between cards */}
      <div className="flex justify-center -mb-2 relative z-10">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-full w-8 h-8 bg-background border-2 border-primary/20 hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200 shadow-sm",
            "opacity-0 group-hover:opacity-100 hover:opacity-100 hover:scale-110"
          )}
          onClick={() => onAddAfter(index)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};