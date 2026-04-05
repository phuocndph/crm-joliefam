import React, { useState } from "react";
import { Sparkles, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Product {
  id: string;
  name: string;
  price: number | null;
  specifications: string | null;
  description: string | null;
}

interface AIMatchedItem {
  matchedProductId: string;
  customName: string;
  quantity: number;
  price: number;
  specifications: string;
  note: string;
}

interface AIQuoteFillProps {
  products: Product[];
  onProductsSelected: (items: AIMatchedItem[]) => void;
}

export function AIQuoteFill({ products, onProductsSelected }: AIQuoteFillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<AIMatchedItem[] | null>(null);
  const { toast } = useToast();

  const handleAIFill = async () => {
    if (!request.trim()) {
      toast({ title: "Vui lòng nhập yêu cầu khách hàng", variant: "destructive" });
      return;
    }
    if (products.length === 0) {
      toast({ title: "Bảng giá chưa có sản phẩm", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setPreviewItems(null);

    try {
      const productList = products.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price || 0,
        specifications: p.specifications || "",
        description: p.description || "",
      }));

      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "ai_quote_fill", data: { products: productList, request: request.trim() } },
      });

      if (error) throw error;

      if (data?.error) {
        toast({ title: "Lỗi AI", description: data.error, variant: "destructive" });
        return;
      }

      const items: AIMatchedItem[] = data?.items || [];
      if (items.length === 0) {
        toast({ title: "Không tìm thấy sản phẩm phù hợp", description: "AI không thể so khớp yêu cầu với bảng giá hiện tại" });
        return;
      }

      setPreviewItems(items);
    } catch (err) {
      console.error("AI quote fill error:", err);
      toast({ title: "Lỗi", description: "Không thể xử lý yêu cầu AI", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (previewItems) {
      onProductsSelected(previewItems);
      setPreviewItems(null);
      setRequest("");
      setIsOpen(false);
      toast({ title: "Đã áp dụng", description: `${previewItems.length} sản phẩm đã được thêm vào báo giá` });
    }
  };

  const handleCancel = () => {
    setPreviewItems(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("vi-VN").format(value);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50">
          <Sparkles className="h-4 w-4" />
          AI tự chọn sản phẩm
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="pt-4 space-y-3">
            <div>
              <Textarea
                placeholder="Mô tả yêu cầu khách hàng... VD: Khách cần 2 bộ drap giường 1m8 cao 12cm, 3 gối ôm, 1 bộ rèm cửa phòng khách"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                className="bg-white min-h-[80px]"
                disabled={isLoading}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={handleAIFill} disabled={isLoading || !request.trim()} className="bg-purple-600 hover:bg-purple-700 gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isLoading ? "Đang phân tích..." : "AI tự chọn sản phẩm"}
              </Button>
            </div>

            {previewItems && previewItems.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-purple-800">Kết quả AI ({previewItems.length} sản phẩm):</p>
                <div className="rounded-md border border-purple-200 bg-white overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">#</TableHead>
                        <TableHead>Tên sản phẩm</TableHead>
                        <TableHead>Quy cách</TableHead>
                        <TableHead className="text-right">SL</TableHead>
                        <TableHead className="text-right">Đơn giá</TableHead>
                        <TableHead className="text-right">Thành tiền</TableHead>
                        <TableHead>Ghi chú</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell className="font-medium">{item.customName}</TableCell>
                          <TableCell>{item.specifications}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.price * item.quantity)}</TableCell>
                          <TableCell>
                            {item.note && (
                              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50 whitespace-normal">
                                <AlertTriangle className="h-3 w-3 mr-1 inline" />
                                {item.note}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex gap-2">
                  <Button type="button" onClick={handleApply} className="bg-green-600 hover:bg-green-700 gap-2">
                    <Check className="h-4 w-4" /> Áp dụng
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancel} className="gap-2">
                    <X className="h-4 w-4" /> Hủy
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
