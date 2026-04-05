import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Loader2, Check, X, AlertTriangle, ImageIcon } from "lucide-react";
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
  previewImageUrl?: string;
}

interface AIQuoteFillProps {
  products: Product[];
  onProductsSelected: (items: AIMatchedItem[]) => void;
}

// Fabric name mappings - equivalent names
const FABRIC_MAPPINGS: Record<string, string[]> = {
  'lth': ['t225'],
  't225': ['lth'],
};

const normalize = (text: string) => text.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'd')
  .replace(/[^a-z0-9]/g, '');

const extractKeywords = (text: string): string[] => {
  const norm = normalize(text);
  return norm.match(/[a-z0-9]{2,}/g) || [];
};

/**
 * Extract meaningful search terms from user request text.
 * Returns keywords + mapped fabric equivalents.
 */
function extractSearchTerms(request: string): string[] {
  const lower = request.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd');

  // Extract product category keywords (Vietnamese)
  const categoryPatterns = [
    /ga\s*chun/g, /ga\s*goi/g, /ga\s*giuong/g,
    /vo\s*goi/g, /ruot\s*goi/g, /goi\s*om/g,
    /drap/g, /chan/g, /rem/g, /man/g,
    /tui\s*ngu/g, /nem/g, /topper/g,
    /khan/g, /ao/g, /khac/g,
  ];

  const terms: Set<string> = new Set();

  // Extract category matches
  for (const pattern of categoryPatterns) {
    const matches = lower.match(pattern);
    if (matches) {
      for (const m of matches) terms.add(m.replace(/\s+/g, ''));
    }
  }

  // Extract fabric types (e.g., LTH, T225, cotton, tencel, satin)
  const fabricPattern = /\b(lth|t225|t300|t400|t500|cotton|tencel|satin|lua|poly|bamboo|modal|microfiber|micro)\b/gi;
  const fabricMatches = lower.match(fabricPattern);
  if (fabricMatches) {
    for (const f of fabricMatches) {
      const fn = f.toLowerCase();
      terms.add(fn);
      // Add mapped equivalents
      if (FABRIC_MAPPINGS[fn]) {
        for (const eq of FABRIC_MAPPINGS[fn]) terms.add(eq);
      }
    }
  }

  // Extract color keywords
  const colorPattern = /\b(trang|den|xam|xanh|do|vang|hong|tim|nau|be|kem|soc|hoa|ke)\b/g;
  const colorMatches = lower.match(colorPattern);
  if (colorMatches) {
    for (const c of colorMatches) terms.add(c);
  }

  // Extract size patterns (e.g., 160x200, 60x80, 1m8)
  const sizePattern = /\d+x\d+(?:x\d+)?|\d+m\d*/g;
  const sizeMatches = lower.match(sizePattern);
  if (sizeMatches) {
    for (const s of sizeMatches) terms.add(s.replace(/\s/g, ''));
  }

  return Array.from(terms);
}

/**
 * Pre-filter products based on extracted search terms.
 * Returns only products that match at least one search term.
 */
function preFilterProducts(products: Product[], searchTerms: string[]): Product[] {
  if (searchTerms.length === 0) return products;

  const scored = products.map(p => {
    const normalizedName = normalize(p.name);
    const normalizedSpec = normalize(p.specifications || '');
    const normalizedDesc = normalize(p.description || '');
    const combined = `${normalizedName} ${normalizedSpec} ${normalizedDesc}`;

    let score = 0;
    for (const term of searchTerms) {
      const normTerm = normalize(term);
      if (combined.includes(normTerm)) score++;
    }
    return { product: p, score };
  });

  // Keep products with score >= 1
  const matched = scored.filter(s => s.score >= 1);

  // If too few results, return all (let AI handle it)
  if (matched.length < 3) return products;

  // If still too many (>60), take top scored ones
  if (matched.length > 60) {
    matched.sort((a, b) => b.score - a.score);
    return matched.slice(0, 60).map(s => s.product);
  }

  return matched.map(s => s.product);
}

interface CachedImage {
  name: string;
  folder: string;
}

export function AIQuoteFill({ products, onProductsSelected }: AIQuoteFillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<AIMatchedItem[] | null>(null);
  const { toast } = useToast();

  // Image cache - loaded once
  const imageCache = useRef<CachedImage[] | null>(null);
  const imageCacheLoading = useRef(false);

  // Load image list once when component opens
  useEffect(() => {
    if (isOpen && !imageCache.current && !imageCacheLoading.current) {
      loadImageCache();
    }
  }, [isOpen]);

  const loadImageCache = async () => {
    imageCacheLoading.current = true;
    try {
      const allFiles: CachedImage[] = [];
      const { data: folders } = await supabase.storage.from('product-images').list('', { limit: 200 });
      if (folders) {
        const topFiles = folders.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name));
        const dirs = folders.filter(f => !f.name.includes('.'));
        for (const file of topFiles) allFiles.push({ name: file.name, folder: '' });
        for (const dir of dirs) {
          const { data: files } = await supabase.storage.from('product-images').list(dir.name, { limit: 200 });
          if (files) {
            for (const file of files) {
              if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) {
                allFiles.push({ name: file.name, folder: dir.name });
              }
            }
          }
        }
      }
      imageCache.current = allFiles;
    } catch (e) {
      console.error('Error loading image cache:', e);
    } finally {
      imageCacheLoading.current = false;
    }
  };

  const findPreviewImages = (items: AIMatchedItem[]): AIMatchedItem[] => {
    const allImageFiles = imageCache.current;
    if (!allImageFiles || allImageFiles.length === 0) return items;

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
      // Pre-filter products based on request keywords
      const searchTerms = extractSearchTerms(request);
      const filteredProducts = preFilterProducts(products, searchTerms);

      console.log(`[AIQuoteFill] Pre-filter: ${products.length} → ${filteredProducts.length} products (terms: ${searchTerms.join(', ')})`);

      const productList = filteredProducts.map(p => ({
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

      // Find preview images from cache (sync, no API call)
      items = findPreviewImages(items);
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
                        <TableHead className="w-[60px]">Ảnh</TableHead>
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
                          <TableCell>
                            {item.previewImageUrl ? (
                              <img src={item.previewImageUrl} alt="" className="w-10 h-10 object-cover rounded border" />
                            ) : (
                              <div className="w-10 h-10 bg-muted rounded border flex items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
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
