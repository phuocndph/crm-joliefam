import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUpdateContract } from "@/hooks/useContracts";
import { useCustomers } from "@/hooks/useCustomers";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Search, Sparkles, ImagePlus, Link } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRef } from "react";
import { AIOrderAnalysis } from "@/components/AIOrderAnalysis";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

const emptyItem = { name: "", specifications: "", quantity: 1, price: 0 };

export const EditContractDialog = ({ open, onOpenChange, contract }: Props) => {
  const updateContract = useUpdateContract();
  const { data: customers } = useCustomers();
  const { toast } = useToast();

  const [lookingUpTax, setLookingUpTax] = useState(false);
  const [parsingText, setParsingText] = useState(false);
  const [parsingImage, setParsingImage] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showLinkCustomer, setShowLinkCustomer] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title: "",
    contract_number: "",
    customer_id: "",
    status: "draft",
    contract_date: "",
    start_date: "",
    end_date: "",
    notes: "",
    include_vat: false,
    vat_rate: 8,
    deposit_percentage: 70,
    deposit_mode: "percent" as "percent" | "amount",
    deposit_fixed_amount: 0,
    seller_representative: "",
    seller_position: "Giám đốc",
  });

  const [items, setItems] = useState<any[]>([{ ...emptyItem }]);

  const [buyerInfo, setBuyerInfo] = useState({
    company_name: "",
    representative: "",
    position: "Giám đốc",
    address: "",
    tax_code: "",
    phone: "",
    bank_name: "",
    bank_account: "",
    bank_holder: "",
  });

  useEffect(() => {
    if (contract) {
      setFormData({
        title: contract.title || "",
        contract_number: contract.contract_number || "",
        customer_id: contract.customer_id || "",
        status: contract.status || "draft",
        contract_date: contract.contract_date?.slice(0, 10) || "",
        start_date: contract.start_date?.slice(0, 10) || "",
        end_date: contract.end_date?.slice(0, 10) || "",
        notes: contract.notes || "",
        include_vat: contract.include_vat || false,
        vat_rate: contract.vat_rate || 8,
        deposit_percentage: contract.deposit_percentage || 70,
        deposit_mode: (contract.deposit_amount && !contract.deposit_percentage) ? "amount" as const : "percent" as const,
        deposit_fixed_amount: contract.deposit_amount || 0,
      });

      // Load buyer info
      const bi = contract.buyer_info || {};
      setBuyerInfo({
        company_name: bi.company_name || "",
        representative: bi.representative || "",
        position: bi.position || "Giám đốc",
        address: bi.address || "",
        tax_code: bi.tax_code || "",
        phone: bi.phone || "",
        bank_name: bi.bank_name || "",
        bank_account: bi.bank_account || "",
        bank_holder: bi.bank_holder || "",
      });

      // Load items
      const contractItems = contract.items;
      if (Array.isArray(contractItems) && contractItems.length > 0) {
        setItems(contractItems.map((it: any) => ({
          name: it.name || "",
          specifications: it.specifications || "",
          quantity: it.quantity || 1,
          price: it.price || 0,
        })));
      } else {
        setItems([{ ...emptyItem }]);
      }

      setShowLinkCustomer(!!contract.customer_id);
    }
  }, [contract]);

  // AI helpers (same as CreateContractForm)
  const processImageFile = async (file: File) => {
    setParsingImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/png";

      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "parse_image", data: { base64, mimeType } },
      });
      if (error) throw error;
      if (data && !data.error) {
        setBuyerInfo(prev => ({
          ...prev,
          company_name: data.company_name || prev.company_name,
          representative: data.representative || prev.representative,
          position: data.position || prev.position,
          address: data.address || prev.address,
          tax_code: data.tax_code || prev.tax_code,
          phone: data.phone || prev.phone,
          bank_name: data.bank_name || prev.bank_name,
          bank_account: data.bank_account || prev.bank_account,
          bank_holder: data.bank_holder || prev.bank_holder,
        }));
        toast({ title: "AI đã điền thông tin từ ảnh!" });
      } else {
        toast({ title: data?.error || "Không trích xuất được", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Lỗi phân tích ảnh", description: e.message, variant: "destructive" });
    } finally {
      setParsingImage(false);
    }
  };

  const handlePasteImage = async (e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (const item of Array.from(clipItems)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await processImageFile(file);
        return;
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processImageFile(file);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const analyzeImageFromPreview = async () => {
    if (!imagePreview) return;
    setParsingImage(true);
    try {
      const base64 = imagePreview.split(",")[1];
      const mimeMatch = imagePreview.match(/^data:(.*?);/);
      const mimeType = mimeMatch?.[1] || "image/png";
      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "parse_image", data: { base64, mimeType } },
      });
      if (error) throw error;
      if (data && !data.error) {
        setBuyerInfo(prev => ({
          ...prev,
          company_name: data.company_name || prev.company_name,
          representative: data.representative || prev.representative,
          position: data.position || prev.position,
          address: data.address || prev.address,
          tax_code: data.tax_code || prev.tax_code,
          phone: data.phone || prev.phone,
          bank_name: data.bank_name || prev.bank_name,
          bank_account: data.bank_account || prev.bank_account,
          bank_holder: data.bank_holder || prev.bank_holder,
        }));
        toast({ title: "AI đã điền thông tin từ ảnh!" });
      } else {
        toast({ title: data?.error || "Không trích xuất được", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Lỗi", description: e.message, variant: "destructive" });
    } finally {
      setParsingImage(false);
    }
  };

  const handleAIAnalyze = async () => {
    if (imagePreview) {
      await analyzeImageFromPreview();
      return;
    }
    if (!pasteText.trim()) return;
    setParsingText(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "parse_text", data: pasteText },
      });
      if (error) throw error;
      if (data && !data.error && !data.raw) {
        setBuyerInfo(prev => ({
          ...prev,
          company_name: data.company_name || prev.company_name,
          representative: data.representative || prev.representative,
          position: data.position || prev.position,
          address: data.address || prev.address,
          tax_code: data.tax_code || prev.tax_code,
          phone: data.phone || prev.phone,
          bank_name: data.bank_name || prev.bank_name,
          bank_account: data.bank_account || prev.bank_account,
          bank_holder: data.bank_holder || prev.bank_holder,
        }));
        toast({ title: "AI đã điền thông tin!" });
        setPasteText("");
      }
    } catch (e: any) {
      toast({ title: "Lỗi AI", description: e.message, variant: "destructive" });
    } finally {
      setParsingText(false);
    }
  };

  const handleTaxLookup = async () => {
    if (!buyerInfo.tax_code.trim()) return;
    setLookingUpTax(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "tax_code", data: buyerInfo.tax_code.trim() },
      });
      if (error) throw error;
      if (data && !data.error) {
        setBuyerInfo(prev => ({
          ...prev,
          company_name: data.company_name || prev.company_name,
          representative: data.representative || prev.representative,
          address: data.address || prev.address,
        }));
        toast({ title: "Đã tìm thấy thông tin doanh nghiệp!" });
      } else {
        toast({ title: data?.error || "Không tìm thấy", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Lỗi tra cứu", description: e.message, variant: "destructive" });
    } finally {
      setLookingUpTax(false);
    }
  };

  // Calculations
  const subtotal = items.reduce((s, it) => s + (it.quantity || 0) * (it.price || 0), 0);
  const vatAmount = formData.include_vat ? subtotal * formData.vat_rate / 100 : 0;
  const totalAmount = subtotal + vatAmount;
  const depositAmount = formData.deposit_mode === "percent"
    ? totalAmount * formData.deposit_percentage / 100
    : formData.deposit_fixed_amount;

  const addItem = () => setItems([...items, { ...emptyItem }]);
  const removeItem = (i: number) => setItems(items.filter((_, j) => j !== i));
  const updateItem = (i: number, field: string, value: any) => {
    const u = [...items];
    u[i] = { ...u[i], [field]: value };
    setItems(u);
  };

  const formatCurrency = (val: number) => val.toLocaleString("vi-VN") + " ₫";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerInfo.company_name.trim()) {
      toast({ title: "Vui lòng nhập tên công ty/cá nhân Bên B", variant: "destructive" });
      return;
    }

    try {
      await updateContract.mutateAsync({
        id: contract.id,
        title: formData.title,
        customer_id: formData.customer_id || null,
        total_amount: totalAmount,
        subtotal,
        vat_amount: vatAmount,
        include_vat: formData.include_vat,
        vat_rate: formData.vat_rate,
        deposit_amount: depositAmount,
        deposit_percentage: formData.deposit_percentage,
        contract_date: formData.contract_date,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        notes: formData.notes || null,
        status: formData.status,
        items: items.map((it, i) => ({ ...it, total: it.quantity * it.price, stt: i + 1 })),
        buyer_info: buyerInfo,
      });
      toast({ title: "Cập nhật hợp đồng thành công!" });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Lỗi cập nhật", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa hợp đồng {contract?.contract_number}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 max-h-[75vh] overflow-y-auto pr-2">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tiêu đề</Label>
              <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <Label>Trạng thái</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Nháp</SelectItem>
                  <SelectItem value="active">Đang hiệu lực</SelectItem>
                  <SelectItem value="completed">Hoàn thành</SelectItem>
                  <SelectItem value="cancelled">Đã hủy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* BUYER INFO */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <Label className="text-base font-semibold">THÔNG TIN BÊN B (Bên mua)</Label>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Dán thông tin hoặc tải ảnh để AI tự động điền</Label>
              <div className="flex gap-2">
                <Textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  onPaste={handlePasteImage}
                  placeholder="Dán text hoặc Ctrl+V ảnh..."
                  rows={2}
                  className="text-sm"
                />
                <div className="flex flex-col gap-1 shrink-0">
                  <Button type="button" variant="outline" size="sm" onClick={handleAIAnalyze} disabled={parsingText || parsingImage}>
                    {(parsingText || parsingImage) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">AI</span>
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()} disabled={parsingImage}>
                    {parsingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">Ảnh</span>
                  </Button>
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>
              </div>
              {imagePreview && (
                <div className="relative mt-2 inline-block">
                  <img src={imagePreview} alt="Preview" className="max-h-32 rounded-md border border-border object-contain" />
                  <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-5 w-5 rounded-full" onClick={() => setImagePreview(null)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label>Tên công ty / Cá nhân *</Label>
              <Input value={buyerInfo.company_name} onChange={e => setBuyerInfo(p => ({ ...p, company_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Người đại diện</Label>
                <Input value={buyerInfo.representative} onChange={e => setBuyerInfo(p => ({ ...p, representative: e.target.value }))} />
              </div>
              <div>
                <Label>Chức vụ</Label>
                <Input value={buyerInfo.position} onChange={e => setBuyerInfo(p => ({ ...p, position: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Địa chỉ</Label>
              <Input value={buyerInfo.address} onChange={e => setBuyerInfo(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mã số thuế</Label>
                <div className="flex gap-1">
                  <Input value={buyerInfo.tax_code} onChange={e => setBuyerInfo(p => ({ ...p, tax_code: e.target.value }))} />
                  <Button type="button" size="icon" variant="outline" onClick={handleTaxLookup} disabled={lookingUpTax}>
                    {lookingUpTax ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label>Số điện thoại</Label>
                <Input value={buyerInfo.phone} onChange={e => setBuyerInfo(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Ngân hàng</Label>
                <Input value={buyerInfo.bank_name} onChange={e => setBuyerInfo(p => ({ ...p, bank_name: e.target.value }))} />
              </div>
              <div>
                <Label>Số tài khoản</Label>
                <Input value={buyerInfo.bank_account} onChange={e => setBuyerInfo(p => ({ ...p, bank_account: e.target.value }))} />
              </div>
              <div>
                <Label>Chủ tài khoản</Label>
                <Input value={buyerInfo.bank_holder} onChange={e => setBuyerInfo(p => ({ ...p, bank_holder: e.target.value }))} />
              </div>
            </div>

            {/* Link customer */}
            <div className="pt-2 border-t">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowLinkCustomer(!showLinkCustomer)} className="text-xs text-muted-foreground">
                <Link className="h-3 w-3 mr-1" />
                {showLinkCustomer ? "Ẩn" : "Liên kết KH trong hệ thống"}
              </Button>
              {showLinkCustomer && (
                <div className="mt-2">
                  <Select value={formData.customer_id} onValueChange={v => setFormData(p => ({ ...p, customer_id: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Chọn khách hàng" /></SelectTrigger>
                    <SelectContent>
                      {customers?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} {c.company ? `- ${c.company}` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Product table */}
          <div>
            <Label className="text-base font-semibold">Bảng sản phẩm / dịch vụ</Label>
            
            {/* AI Order Analysis */}
            <div className="mt-2 mb-2">
              <AIOrderAnalysis onItemsExtracted={(extractedItems) => {
                const newItems = extractedItems.map(it => ({
                  name: it.name || "",
                  specifications: it.specifications || "",
                  quantity: it.quantity || 1,
                  price: it.price || 0,
                }));
                // Always replace old items with new extracted items
                setItems(newItems);
              }} />
            </div>

            <div className="mt-2 border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-2 text-left w-8">TT</th>
                    <th className="p-2 text-left">Sản phẩm</th>
                    <th className="p-2 text-left"><th className="p-2 text-left">Kích thước</th></th>
                    <th className="p-2 text-right w-16">SL</th>
                    <th className="p-2 text-right w-28">Đơn giá</th>
                    <th className="p-2 text-right w-28">Thành tiền</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-1"><Input value={item.name} onChange={e => updateItem(i, "name", e.target.value)} placeholder="Tên SP" className="h-8" /></td>
                      <td className="p-1"><Input value={item.specifications} onChange={e => updateItem(i, "specifications", e.target.value)} placeholder="Kích thước" className="h-8" /></td>
                      <td className="p-1"><Input type="number" value={item.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))} className="h-8 text-right" /></td>
                      <td className="p-1"><Input type="number" value={item.price} onChange={e => updateItem(i, "price", Number(e.target.value))} className="h-8 text-right" /></td>
                      <td className="p-2 text-right font-medium">{formatCurrency(item.quantity * item.price)}</td>
                      <td className="p-1">
                        {items.length > 1 && (
                          <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(i)} className="h-7 w-7 text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-2 border-t">
                <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Thêm SP</Button>
              </div>
            </div>

            {/* Totals */}
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Tổng cộng:</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
              <div className="flex items-center gap-3">
                <Switch checked={formData.include_vat} onCheckedChange={v => setFormData(p => ({ ...p, include_vat: v }))} />
                <span>VAT</span>
                {formData.include_vat && (
                  <>
                    <Input type="number" value={formData.vat_rate} onChange={e => setFormData(p => ({ ...p, vat_rate: Number(e.target.value) }))} className="h-7 w-16" />
                    <span>% = {formatCurrency(vatAmount)}</span>
                  </>
                )}
              </div>
              <div className="flex justify-between text-base font-bold text-primary">
                <span>TỔNG GIÁ TRỊ:</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span>Đặt cọc</span>
                <select
                  value={formData.deposit_mode}
                  onChange={e => setFormData(p => ({ ...p, deposit_mode: e.target.value as "percent" | "amount" }))}
                  className="h-7 rounded border border-input bg-background px-2 text-sm"
                >
                  <option value="percent">%</option>
                  <option value="amount">Số tiền</option>
                </select>
                {formData.deposit_mode === "percent" ? (
                  <>
                    <Input type="number" value={formData.deposit_percentage} onChange={e => setFormData(p => ({ ...p, deposit_percentage: Number(e.target.value) }))} className="h-7 w-16" />
                    <span>% = <strong>{formatCurrency(depositAmount)}</strong></span>
                  </>
                ) : (
                  <>
                    <Input type="number" value={formData.deposit_fixed_amount || ""} onChange={e => setFormData(p => ({ ...p, deposit_fixed_amount: Number(e.target.value) }))} className="h-7 w-32" placeholder="Nhập số tiền" />
                    <span>= <strong>{formatCurrency(depositAmount)}</strong></span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Ngày ký</Label>
              <Input type="date" value={formData.contract_date} onChange={e => setFormData(p => ({ ...p, contract_date: e.target.value }))} />
            </div>
            <div>
              <Label>Ngày bắt đầu</Label>
              <Input type="date" value={formData.start_date} onChange={e => setFormData(p => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div>
              <Label>Ngày kết thúc</Label>
              <Input type="date" value={formData.end_date} onChange={e => setFormData(p => ({ ...p, end_date: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>Ghi chú</Label>
            <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} />
          </div>

          <Button type="submit" className="w-full" disabled={updateContract.isPending}>
            {updateContract.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Lưu thay đổi
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
