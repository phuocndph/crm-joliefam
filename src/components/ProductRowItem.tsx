import React from "react";
import { ChevronUp, ChevronDown, GripVertical, Trash2, Search, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TableCell, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import ProductImageLibrary from './ProductImageLibrary';
import { useToast } from "@/hooks/use-toast";

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

interface ProductRowItemProps {
  item: QuoteItem;
  index: number;
  totalItems: number;
  onUpdate: (updatedItem: QuoteItem) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOpenProductSelector: () => void;
}

export function ProductRowItem({
  item,
  index,
  totalItems,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onOpenProductSelector
}: ProductRowItemProps) {
  const { toast } = useToast();

  const updatePrice = (price: number) => {
    onUpdate({
      ...item,
      price,
      total: item.quantity * price
    });
  };

  const updateQuantity = (quantity: number) => {
    if (quantity <= 0) {
      onRemove();
      return;
    }
    onUpdate({
      ...item,
      quantity,
      total: quantity * item.price
    });
  };

  return (
    <TableRow className="h-24 border border-gray-200 hover:bg-gray-50">
      {/* Drag Handle Column */}
      <TableCell className="w-12 min-w-12 p-2 text-center">
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className={`p-1 rounded hover:bg-gray-200 ${index === 0 ? 'opacity-30 cursor-not-allowed' : 'text-gray-600 hover:text-blue-600'}`}
            title="Di chuyển lên"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <GripVertical className="w-4 h-4 text-gray-400" />
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === totalItems - 1}
            className={`p-1 rounded hover:bg-gray-200 ${index === totalItems - 1 ? 'opacity-30 cursor-not-allowed' : 'text-gray-600 hover:text-blue-600'}`}
            title="Di chuyển xuống"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </TableCell>

      {/* Product Selector */}
      <TableCell className="w-32 min-w-32 p-4">
        <Button 
          variant="outline" 
          className="w-full h-12 text-left justify-start gap-2 border-2 border-dashed border-blue-300 bg-blue-50" 
          onClick={onOpenProductSelector}
          type="button"
        >
          <Search className="h-4 w-4 text-blue-600" />
          <span className="text-blue-600">
            {item.sku ? item.sku : item.name ? `${item.name.substring(0, 15)}...` : 'Chọn sản phẩm từ danh sách'}
          </span>
        </Button>
      </TableCell>

      {/* Product Name */}
      <TableCell className="w-48 min-w-48 p-2">
        <Textarea 
          value={item.name} 
          onChange={e => onUpdate({ ...item, name: e.target.value })}
          placeholder="Tên sản phẩm" 
          className="border-gray-200 focus:border-blue-500 font-medium text-sm w-full min-h-[2.5rem] resize-none" 
          rows={2} 
        />
      </TableCell>

      {/* Image */}
      <TableCell className="w-20 min-w-20 p-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-12 w-16 border-2 border-dashed border-gray-300 hover:border-blue-500 flex flex-col items-center justify-center gap-1" 
              type="button"
            >
              {item.selectedImage ? (
                <img src={item.selectedImage} alt="Selected" className="w-12 h-12 object-cover rounded" />
              ) : (
                <>
                  <Image className="h-4 w-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Chọn ảnh</span>
                </>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Chọn hình ảnh sản phẩm</DialogTitle>
            </DialogHeader>
            <div className="h-[70vh] overflow-y-auto">
              <ProductImageLibrary 
                hideDeleteButton={true} 
                onSelectImage={imageUrl => {
                  onUpdate({ ...item, selectedImage: imageUrl });
                  toast({
                    title: "Thành công",
                    description: "Đã chọn hình ảnh cho sản phẩm"
                  });
                }} 
              />
            </div>
          </DialogContent>
        </Dialog>
      </TableCell>

      {/* Description */}
      <TableCell className="w-40 min-w-40 p-2">
        <div className="flex items-start space-x-1">
          <Textarea 
            value={item.description || ''} 
            onChange={e => onUpdate({ ...item, description: e.target.value })}
            placeholder="Mô tả sản phẩm" 
            className="border-gray-200 focus:border-blue-500 flex-1 min-h-[2.5rem] resize-none" 
            rows={2} 
          />
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-50 p-2" title="Chỉnh sửa mô tả chi tiết">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M12 20h9" />
                  <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
                </svg>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Chỉnh sửa mô tả sản phẩm</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor={`description-${index}`}>Mô tả chi tiết</Label>
                  <Textarea 
                    id={`description-${index}`} 
                    value={item.description || ''} 
                    onChange={e => onUpdate({ ...item, description: e.target.value })}
                    placeholder="Nhập mô tả chi tiết sản phẩm..." 
                    className="min-h-32 resize-none" 
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>

      {/* Specifications */}
      <TableCell className="w-32 min-w-32 p-2">
        <div className="flex items-start space-x-1">
          <Textarea 
            value={item.specifications || ''} 
            onChange={e => onUpdate({ ...item, specifications: e.target.value })}
            placeholder="Quy cách" 
            className="border-gray-200 focus:border-blue-500 flex-1 min-h-[2.5rem] resize-none" 
            rows={2} 
          />
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-50 p-2" title="Chỉnh sửa quy cách chi tiết">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M12 20h9" />
                  <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
                </svg>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Chỉnh sửa quy cách sản phẩm</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor={`specifications-${index}`}>Quy cách chi tiết</Label>
                  <Textarea 
                    id={`specifications-${index}`} 
                    value={item.specifications || ''} 
                    onChange={e => onUpdate({ ...item, specifications: e.target.value })}
                    placeholder="Nhập quy cách chi tiết sản phẩm..." 
                    className="min-h-32 resize-none" 
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>

      {/* Price */}
      <TableCell className="w-28 min-w-28 text-right p-2">
        <Input 
          type="text" 
          value={item.price.toLocaleString('vi-VN')} 
          onChange={e => {
            const value = e.target.value.replace(/[^\d]/g, '');
            const price = parseFloat(value) || 0;
            updatePrice(price);
          }} 
          className="w-24 text-right font-mono text-blue-600 font-semibold border-gray-200 focus:border-blue-500" 
          placeholder="0" 
        />
      </TableCell>

      {/* Quantity */}
      <TableCell className="w-24 min-w-24 text-center p-2">
        <Input 
          type="number" 
          value={item.quantity} 
          onChange={e => {
            const quantity = parseInt(e.target.value) || 1;
            updateQuantity(quantity);
          }} 
          className="w-20 h-10 text-center border-2 focus:border-blue-500 text-sm font-semibold" 
          min="1" 
        />
      </TableCell>

      {/* Total */}
      <TableCell className="w-32 min-w-32 text-right font-mono font-bold text-green-600 text-sm p-2">
        {item.total.toLocaleString('vi-VN')}đ
      </TableCell>

      {/* Actions */}
      <TableCell className="w-20 min-w-20 text-center p-2">
        <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 h-8 w-8" onClick={onRemove}>
          <Trash2 className="w-5 h-5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}