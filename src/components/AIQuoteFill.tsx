import React, { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Loader2, Check, X, AlertTriangle, ImageIcon, ImageOff, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

// Module-level image cache — persists across re-renders and re-mounts
let cachedImageFiles: { name: string; folder: string }[] | null = null;
let imageCachePromise: Promise<{ name: string; folder: string }[]> | null = null;

async function loadImageFiles(): Promise<{ name: string; folder: string }[]> {
  if (cachedImageFiles) return cachedImageFiles;
  if (imageCachePromise) return imageCachePromise;

  imageCachePromise = (async () => {
    const result: { name: string; folder: string }[] = [];
    const { data: folders } = await supabase.storage.from('product-images').list('', { limit: 200 });
    if (!folders) return result;

    const topLevelFiles = folders.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name));
    const directories = folders.filter(f => !f.name.includes('.'));
    for (const file of topLevelFiles) {
      result.push({ name: file.name, folder: '' });
    }

    // Fetch all subdirectories in parallel
    const subResults = await Promise.all(
      directories.map(async (dir) => {
        const { data: files } = await supabase.storage.from('product-images').list(dir.name, { limit: 200 });
        return (files || [])
          .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
          .map(f => ({ name: f.name, folder: dir.name }));
      })
    );
    for (const sub of subResults) result.push(...sub);

    cachedImageFiles = result;
    imageCachePromise = null;
    return result;
  })();

  return imageCachePromise;
}

export function AIQuoteFill({ products, onProductsSelected }: AIQuoteFillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<AIMatchedItem[] | null>(null);
  const [includeImages, setIncludeImages] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Preload image cache when component opens
  useEffect(() => {
    if (isOpen && includeImages) {
      loadImageFiles();
    }
  }, [isOpen, includeImages]);

  const normalize = (text: string) => text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');

  const extractKeywords = (text: string) => {
    const norm = normalize(text);
    return norm.match(/[a-z0-9]{3,}/g) || [];
  };

  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: "Chỉ hỗ trợ file hình ảnh", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Ảnh quá lớn (tối đa 10MB)", variant: "destructive" });
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageSelect(file);
        return;
      }
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const compressImage = (file: File, maxDim = 1200, quality = 0.7): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")),
            "image/jpeg",
            quality
          );
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const findPreviewImage = async (items: AIMatchedItem[]) => {
    try {
      const allImageFiles = await loadImageFiles();

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
    if (!request.trim() && !imageFile) {
      toast({ title: "Vui lòng nhập yêu cầu hoặc gửi hình ảnh", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setPreviewItems(null);

    try {
      const bodyData: any = { request: request.trim() };

      // Compress and convert image to base64 if present
      if (imageFile) {
        const compressed = await compressImage(imageFile);
        bodyData.imageBase64 = await blobToBase64(compressed);
        bodyData.imageMimeType = "image/jpeg";
      }

      // Run AI call and image preload in parallel
      const [aiResult] = await Promise.all([
        supabase.functions.invoke("lookup-tax-code", {
          body: { type: "ai_quote_fill", data: bodyData },
        }),
        includeImages ? loadImageFiles() : Promise.resolve(null),
      ]);

      const { data, error } = aiResult;
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
      removeImage();
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
            <div className="relative">
              <Textarea
                placeholder="Mô tả yêu cầu khách hàng hoặc dán ảnh (Ctrl+V)... VD: Khách cần 2 bộ drap giường 1m8 cao 12cm, 3 gối ôm"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                onPaste={handlePaste}
                className="bg-white min-h-[80px]"
                disabled={isLoading}
              />
            </div>

            {/* Image preview */}
            {imagePreview && (
              <div className="flex items-start gap-2">
                <div className="relative group">
                  <img src={imagePreview} alt="Preview" className="w-24 h-24 object-cover rounded-lg border-2 border-purple-300" />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-80 hover:opacity-100 transition-opacity"
                    disabled={isLoading}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-xs text-muted-foreground mt-1">
                  {imageFile?.name}
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <Button type="button" onClick={handleAIFill} disabled={isLoading || (!request.trim() && !imageFile)} className="bg-purple-600 hover:bg-purple-700 gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isLoading ? "Đang phân tích..." : "AI tự chọn sản phẩm"}
              </Button>

              {/* Upload image button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Camera className="h-4 w-4" />
                Gửi ảnh
              </Button>

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
