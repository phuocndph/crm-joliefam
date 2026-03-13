import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, FileUp, Trash2, X } from "lucide-react";

interface OrderItem {
  name: string;
  specifications: string;
  quantity: number;
  price: number;
}

interface AIOrderAnalysisProps {
  onItemsExtracted: (items: OrderItem[]) => void;
}

export const AIOrderAnalysis = ({ onItemsExtracted }: AIOrderAnalysisProps) => {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orderText, setOrderText] = useState("");
  const [orderImagePreview, setOrderImagePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const orderFileRef = useRef<HTMLInputElement>(null);

  const handleExtractFromText = async () => {
    if (!orderText.trim()) {
      toast({ title: "Vui lòng dán nội dung đơn hàng/báo giá", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "parse_order_text", data: orderText.trim() },
      });
      if (error) throw error;
      if (data?.items?.length) {
        onItemsExtracted(data.items);
        setOrderText("");
        toast({ title: `Đã trích xuất ${data.items.length} sản phẩm!` });
      } else {
        toast({ title: "Không tìm thấy sản phẩm trong nội dung", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Lỗi phân tích", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleExtractFromImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Hình ảnh quá lớn (tối đa 5MB)", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setOrderImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];

      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "parse_order_image", data: { base64, mimeType: file.type } },
      });
      if (error) throw error;
      if (data?.items?.length) {
        onItemsExtracted(data.items);
        toast({ title: `Đã trích xuất ${data.items.length} sản phẩm từ ảnh!` });
      } else {
        toast({ title: "Không tìm thấy sản phẩm trong ảnh", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Lỗi phân tích ảnh", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleExtractFromFile = async (file: File) => {
    const allowedExtensions = [".pdf", ".xlsx", ".xls", ".csv"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      toast({ title: "Chỉ hỗ trợ file PDF, Excel (.xlsx, .xls), CSV", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File quá lớn (tối đa 10MB)", variant: "destructive" });
      return;
    }
    setLoading(true);
    setFileName(file.name);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "parse_order_file", data: { base64, mimeType: file.type, fileName: file.name } },
      });
      if (error) throw error;
      if (data?.items?.length) {
        onItemsExtracted(data.items);
        toast({ title: `Đã trích xuất ${data.items.length} sản phẩm từ file!` });
      } else {
        toast({ title: "Không tìm thấy sản phẩm trong file", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Lỗi phân tích file", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setFileName(null);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (const item of Array.from(clipItems)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await handleExtractFromImage(file);
        return;
      }
    }
  };

  const reset = () => {
    setExpanded(false);
    setOrderText("");
    setOrderImagePreview(null);
    setFileName(null);
  };

  return (
    <div className="border rounded-lg p-3 bg-accent/30 space-y-2">
      <div className="flex items-center justify-between">
        <Label
          className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer"
          onClick={() => !expanded && setExpanded(true)}
        >
          <Sparkles className="h-3 w-3" />
          AI phân tích đơn hàng — dán text/ảnh hoặc tải file
        </Label>
        {expanded && (
          <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={reset}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {!expanded && (
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)} className="text-xs">
          <Sparkles className="h-3 w-3 mr-1" />Mở AI phân tích
        </Button>
      )}

      {expanded && (
        <div className="space-y-2">
          {/* Image preview */}
          {orderImagePreview && (
            <div className="relative inline-block">
              <img src={orderImagePreview} alt="Preview" className="max-h-32 rounded-md border border-border object-contain" />
              <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-5 w-5 rounded-full" onClick={() => setOrderImagePreview(null)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Textarea - always visible, supports paste text + Ctrl+V image */}
          <Textarea
            value={orderText}
            onChange={e => setOrderText(e.target.value)}
            onPaste={handlePaste}
            placeholder="Dán text đơn hàng hoặc Ctrl+V ảnh báo giá vào đây..."
            rows={3}
            className="text-sm"
            disabled={loading}
          />

          {/* File upload status */}
          {fileName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileUp className="h-4 w-4" />
              <span>{fileName}</span>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          )}

          {/* Loading for image */}
          {loading && !fileName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang phân tích...
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleExtractFromText} disabled={loading || !orderText.trim()}>
              {loading && !fileName ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Trích xuất
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => orderFileRef.current?.click()}
              disabled={loading}
              className="text-xs"
            >
              <FileUp className="h-3 w-3 mr-1" />File Excel/PDF
            </Button>
          </div>
        </div>
      )}

      <input
        ref={orderFileRef}
        type="file"
        accept=".pdf,.xlsx,.xls,.csv"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleExtractFromFile(file);
          if (orderFileRef.current) orderFileRef.current.value = "";
        }}
      />
    </div>
  );
};
