import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyProductCardProps {
  onAddProduct: () => void;
  className?: string;
}

export const EmptyProductCard: React.FC<EmptyProductCardProps> = ({
  onAddProduct,
  className
}) => {
  return (
    <Card className={cn(
      "border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10 transition-all duration-300",
      className
    )}>
      <CardContent className="p-8 text-center">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <ShoppingCart className="h-8 w-8 text-primary" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-semibold text-lg text-foreground">
              Chưa có sản phẩm nào
            </h3>
            <p className="text-muted-foreground text-sm">
              Thêm sản phẩm đầu tiên để bắt đầu tạo báo giá
            </p>
          </div>

          <Button 
            onClick={onAddProduct}
            className="mt-4"
            size="lg"
          >
            <Plus className="h-4 w-4 mr-2" />
            Thêm sản phẩm
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};