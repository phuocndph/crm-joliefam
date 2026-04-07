import React, { useState, useMemo } from "react";
import { Sparkles, Loader2, Check, X, AlertTriangle, ImageIcon, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const AI_MODELS = [
  { value: "fast", label: "⚡ Nhanh & Tiết kiệm", desc: "Báo giá đơn giản, ít SP", model: "google/gemini-2.5-flash-lite" },
  { value: "balanced", label: "⚖️ Cân bằng", desc: "Đa số báo giá thông thường", model: "google/gemini-2.5-flash" },
  { value: "accurate", label: "🎯 Chính xác cao", desc: "Báo giá phức tạp, nhiều SP", model: "google/gemini-3-flash-preview" },
  { value: "premium", label: "💎 Cao cấp nhất", desc: "Phân tích sâu, yêu cầu đặc biệt", model: "google/gemini-2.5-pro" },
] as const;

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
  previewImageUrl?: string;
}

interface AIQuoteFillProps {
  products: Product[];
  onProductsSelected: (items: AIMatchedItem[]) => void;
}
const normalize = (text: string) => text.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'd')
  .replace(/[^a-z0-9]/g, '');

const extractKeywords = (text: string) => {
  const norm = normalize(text);
  return norm.match(/[a-z0-9]{2,}/g) || [];
};

const preFilterProducts = (allProducts: Product[], userRequest: string): Product[] => {
  const requestKeywords = extractKeywords(userRequest);
  const sizeMap: Record<string, string[]> = {};
  const sizePatterns = userRequest.match(/(\d+)[mM](\d*)/g) || [];
  for (const sp of sizePatterns) {
    const match = sp.match(/(\d+)[mM](\d*)/);
    if (match) {
      const meters = parseInt(match[1]);
      const decimals = match[2] || "0";
      const cm = meters * 100 + parseInt(decimals.padEnd(1, "0")) * 10;
      sizeMap[sp.toLowerCase()] = [cm.toString(), `${meters}m${match[2] || ""}`];
    }
  }
  const allSizeVariants = Object.values(sizeMap).flat();
  const scored = allProducts.map(p => {
    const pNorm = normalize(p.name);
    let score = 0;
    for (const kw of requestKeywords) {
      if (pNorm.includes(kw)) score += kw.length >= 4 ? 3 : 1;
    }
    for (const sv of allSizeVariants) {
      if (pNorm.includes(sv)) score += 2;
    }
    return { product: p, score };
  });
  const filtered = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 150).map(s => s.product);
  if (filtered.length < 5) return allProducts.slice(0, 200);
  return filtered;
};

export function AIQuoteFill({ products, onProductsSelected }: AIQuoteFillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<AIMatchedItem[] | null>(null);
  const [includeImages, setIncludeImages] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>("balanced");
  const [catalogCache, setCatalogCache] = useState<{ text: string; builtAt: string } | null>(null);
  const [isBuildingCatalog, setIsBuildingCatalog] = useState(false);
  const { toast } = useToast();

  // Auto-suggest model based on request complexity
  const suggestedModel = useMemo(() => {
    if (!request.trim()) return "balanced";
    if (request.length < 80) return "fast";
    if (request.length > 200) return "accurate";
    return "balanced";
  }, [request]);

  const findPreviewImage = async (items: AIMatchedItem[]) => {
    try {
      let allImageFiles: { name: string; folder: string }[] = [];
      const { data: folders } = await supabase.storage.from('product-images').list('', { limit: 200 });
      if (folders) {
        const topLevelFiles = folders.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name));
        const directories = folders.filter(f => !f.name.includes('.'));
        for (const file of topLevelFiles) {
          allImageFiles.push({ name: file.name, folder: '' });
        }
        for (const dir of directories) {
          const { data: files } = await supabase.storage.from('product-images').list(dir.name, { limit: 200 });
          if (files) {
            for (const file of files) {
              if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) {
                allImageFiles.push({ name: file.name, folder: dir.name });
              }
            }
          }
        }
      }

      return items.map(item => {
        const originalProduct = products.find(p => p.id === item.matchedProductId);
        const productName = originalProduct?.name || item.customName;
        const normalizedProductName = normalize(productName);
        const allSearchKeywords = [...new Set([...extractKeywords(productName), ...extractKeywords(item.customName)])];

        let bestMatch: { name: string; folder: string; score: number } | null = null;
        for (const img of allImageFiles) {
          const normalizedFileName = normalize(img.name.replace(/\.[^.]+$/, ''));
          const normalizedFullPath = normalize(img.folder ? `${img.folder}/${img.name}` : img.name);
          let score = 0;
          if (normalizedFileName === normalizedProductName) score = 100;
          else if (normalizedFullPath.includes(normalizedProductName) && normalizedProductName.length > 5) score = 85;
          else if (normalizedFileName.includes(normalizedProductName) && normalizedProductName.length > 5) score = 80;
          else if (normalizedProductName.includes(normalizedFileName) && normalizedFileName.length > 8) score = 65;
          else {
            const fileKeywords = extractKeywords(img.name.replace(/\.[^.]+$/, ''));
            const folderKeywords = extractKeywords(img.folder || '');
            const allFileKeywords = [...fileKeywords, ...folderKeywords];
            let overlap = 0;
            for (const kw of allSearchKeywords) {
              if (allFileKeywords.some(fk => fk.includes(kw) || kw.includes(fk))) overlap++;
            }
            if (overlap >= 2) score = Math.min(overlap * 20, 60);
          }
          if (score >= 15 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { ...img, score };
          }
        }

        if (bestMatch) {
          const path = bestMatch.folder ? `${bestMatch.folder}/${bestMatch.name}` : bestMatch.name;
          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
          return { ...item, previewImageUrl: urlData.publicUrl };
        }
        return item;
      });
    } catch (e) {
      console.error('Error finding preview images:', e);
      return items;
    }
  };

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
      // Try to load/build catalog
      let catalogText: string | null = null;
      
      if (catalogCache) {
        catalogText = catalogCache.text;
        console.log(`AI Quote: using cached catalog (${catalogText.length} chars)`);
      } else {
        // Try to load from storage
        try {
          const { data: fileData } = await supabase.storage
            .from("product-images")
            .download("catalog/product-catalog.json");
          if (fileData) {
            const catalogData = JSON.parse(await fileData.text());
            catalogText = catalogData.text;
            setCatalogCache({ text: catalogData.text, builtAt: catalogData.builtAt });
            console.log(`AI Quote: loaded catalog from storage (${catalogText!.length} chars, built ${catalogData.builtAt})`);
          }
        } catch (e) {
          console.log("No cached catalog found, will build one");
        }

        // If no catalog, build it
        if (!catalogText) {
          setIsBuildingCatalog(true);
          toast({ title: "Đang xây dựng danh mục sản phẩm...", description: "Lần đầu sẽ mất vài giây" });
          try {
            const { data: buildResult, error: buildError } = await supabase.functions.invoke("build-product-catalog");
            if (buildError) throw buildError;
            console.log("Catalog built:", buildResult);
            
            // Re-download the catalog
            const { data: fileData } = await supabase.storage
              .from("product-images")
              .download("catalog/product-catalog.json");
            if (fileData) {
              const catalogData = JSON.parse(await fileData.text());
              catalogText = catalogData.text;
              setCatalogCache({ text: catalogData.text, builtAt: catalogData.builtAt });
            }
          } catch (e) {
            console.warn("Failed to build catalog, falling back to raw products:", e);
          } finally {
            setIsBuildingCatalog(false);
          }
        }
      }

      const modelConfig = AI_MODELS.find(m => m.value === selectedModel);
      
      // Build request body - use catalog if available, otherwise fallback to raw products
      const requestBody: any = {
        request: request.trim(),
        includeImages,
        model: modelConfig?.model,
      };
      
      if (catalogText) {
        requestBody.catalogText = catalogText;
      } else {
        // Fallback: send raw products
        console.log(`AI Quote: fallback - sending all ${products.length} products`);
        requestBody.products = products.map(p => ({
          id: p.id,
          name: p.name,
          price: p.price || 0,
          specifications: p.specifications || "",
          ...(includeImages ? { description: p.description || "" } : {}),
        }));
      }

      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "ai_quote_fill", data: requestBody },
      });

      if (error) throw error;

      if (data?.error) {
        toast({ title: "Lỗi AI", description: data.error, variant: "destructive" });
        return;
      }

      // Handle clarification request from AI
      if (data?.clarification) {
        toast({ 
          title: "⚠️ Cần bổ sung thông tin", 
          description: data.clarification,
          duration: 10000,
        });
        return;
      }

      let items: AIMatchedItem[] = data?.items || [];
      if (items.length === 0) {
        toast({ title: "Không tìm thấy sản phẩm phù hợp", description: "AI không thể so khớp yêu cầu với bảng giá hiện tại" });
        return;
      }

      // Find preview images for display (only if enabled)
      if (includeImages) {
        items = await findPreviewImage(items);
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
            <div className="flex items-center gap-4 flex-wrap">
              <Button type="button" onClick={handleAIFill} disabled={isLoading || !request.trim()} className="bg-purple-600 hover:bg-purple-700 gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isLoading ? "Đang phân tích..." : "AI tự chọn sản phẩm"}
              </Button>
              <div className="flex items-center gap-2">
                <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isLoading}>
                  <SelectTrigger className="w-[200px] h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map(m => (
                      <SelectItem key={m.value} value={m.value}>
                        <div className="flex items-center gap-2">
                          <span>{m.label}</span>
                          {m.value === suggestedModel && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Gợi ý</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="include-images"
                  checked={includeImages}
                  onCheckedChange={setIncludeImages}
                  disabled={isLoading}
                />
                <Label htmlFor="include-images" className="text-sm text-muted-foreground flex items-center gap-1 cursor-pointer">
                  {includeImages ? <ImageIcon className="h-3.5 w-3.5" /> : <ImageOff className="h-3.5 w-3.5" />}
                  {includeImages ? "Có hình ảnh" : "Không hình ảnh"}
                </Label>
              </div>
            </div>

            {previewItems && previewItems.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-purple-800">Kết quả AI ({previewItems.length} sản phẩm):</p>
                <div className="rounded-md border border-purple-200 bg-white overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">#</TableHead>
                        {includeImages && <TableHead className="w-[60px]">Ảnh</TableHead>}
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
                          {includeImages && (
                            <TableCell>
                              {item.previewImageUrl ? (
                                <img src={item.previewImageUrl} alt="" className="w-10 h-10 object-cover rounded border" />
                              ) : (
                                <div className="w-10 h-10 bg-muted rounded border flex items-center justify-center">
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </TableCell>
                          )}
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