import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCustomers } from "@/hooks/useCustomers";
import { useCreateContract, generateContractNumber } from "@/hooks/useContracts";
import { useContractTemplates, defaultArticles } from "@/hooks/useContractTemplates";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Trash2, Search, Sparkles, Link, ImagePlus } from "lucide-react";
import { useRef } from "react";
import { AIOrderAnalysis } from "@/components/AIOrderAnalysis";

interface CreateContractFormProps {
  onSuccess: () => void;
  prefillData?: {
    customer_id?: string;
    quote_id?: string;
    order_id?: string;
    items?: any[];
    total_amount?: number;
    title?: string;
  };
}

const emptyItem = { name: "", specifications: "", quantity: 1, price: 0 };

export const CreateContractForm = ({ onSuccess, prefillData }: CreateContractFormProps) => {
  const { data: customers } = useCustomers();
  const { data: templates } = useContractTemplates();
  const { settings: companySettings } = useTemplateSettings();
  const createContract = useCreateContract();
  const { toast } = useToast();

  const [templateId, setTemplateId] = useState("");
  const [lookingUpTax, setLookingUpTax] = useState(false);
  const [parsingText, setParsingText] = useState(false);
  const [parsingImage, setParsingImage] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showLinkCustomer, setShowLinkCustomer] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    contract_number: generateContractNumber(),
    customer_id: prefillData?.customer_id || "",
    quote_id: prefillData?.quote_id || "",
    order_id: prefillData?.order_id || "",
    title: prefillData?.title || "HỢP ĐỒNG KINH TẾ",
    contract_date: new Date().toISOString().slice(0, 10),
    start_date: "",
    end_date: "",
    notes: "",
    include_vat: false,
    vat_rate: 8,
    deposit_percentage: 70,
    legal_basis: [
      "Căn cứ Luật Thương mại số 36/2005/QH11 ngày 14/06/2005;",
      "Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015;",
      "Căn cứ vào nhu cầu và khả năng của hai bên."
    ],
    articles: defaultArticles,
  });

  const [items, setItems] = useState<any[]>(
    prefillData?.items?.length ? prefillData.items.map((it: any) => ({
      name: it.name || "",
      specifications: it.specifications || it.description || "",
      quantity: it.quantity || 1,
      price: it.price || 0,
    })) : [{ ...emptyItem }]
  );

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

  // When template is selected, apply its settings
  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const tmpl = templates?.find(t => t.id === id);
    if (!tmpl) return;
    setFormData(prev => ({
      ...prev,
      include_vat: tmpl.include_vat,
      vat_rate: tmpl.vat_rate,
      deposit_percentage: tmpl.payment_terms?.deposit_percentage || 70,
      legal_basis: tmpl.legal_basis || prev.legal_basis,
      articles: tmpl.articles?.length ? tmpl.articles : prev.articles,
    }));
  };

  // Auto-fill buyer info from linked customer
  useEffect(() => {
    if (formData.customer_id && customers) {
      const c = customers.find((cust: any) => cust.id === formData.customer_id);
      if (c) {
        setBuyerInfo(prev => ({
          ...prev,
          company_name: prev.company_name || c.company || c.name || "",
          address: prev.address || c.address || "",
          phone: prev.phone || c.phone || "",
        }));
      }
    }
  }, [formData.customer_id, customers]);

  // AI Tax Code Lookup
  const handleTaxLookup = async () => {
    if (!buyerInfo.tax_code.trim()) {
      toast({ title: "Vui lòng nhập mã số thuế", variant: "destructive" });
      return;
    }
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
          position: data.position || prev.position,
          address: data.address || prev.address,
          phone: data.phone || prev.phone,
          bank_name: data.bank_name || prev.bank_name,
          bank_account: data.bank_account || prev.bank_account,
          bank_holder: data.bank_holder || prev.bank_holder,
        }));
        toast({ title: "Đã tìm thấy thông tin doanh nghiệp!" });
      } else {
        toast({ title: "Không tìm thấy thông tin", description: data?.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Lỗi tra cứu MST", description: err.message, variant: "destructive" });
    } finally {
      setLookingUpTax(false);
    }
  };

  // AI Parse Text
  const analyzeImageFromPreview = async () => {
    if (!imagePreview) return;
    setParsingImage(true);
    try {
      const base64 = imagePreview.split(",")[1];
      const mimeMatch = imagePreview.match(/^data:(image\/\w+);/);
      const mimeType = mimeMatch?.[1] || "image/png";
      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "parse_image", data: { base64, mimeType } },
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
        toast({ title: "Đã phân tích hình ảnh và điền thông tin!" });
      } else {
        toast({ title: "Không thể phân tích hình ảnh", description: data?.error || data?.raw, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Lỗi phân tích hình ảnh", description: err.message, variant: "destructive" });
    } finally {
      setParsingImage(false);
    }
  };

  const handleAIAnalyze = async () => {
    if (imagePreview) {
      await analyzeImageFromPreview();
      return;
    }
    if (!pasteText.trim()) {
      toast({ title: "Vui lòng dán thông tin hoặc ảnh doanh nghiệp", variant: "destructive" });
      return;
    }
    setParsingText(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "parse_text", data: pasteText.trim() },
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
        setPasteText("");
        toast({ title: "Đã phân tích và điền thông tin!" });
      } else {
        toast({ title: "Không thể phân tích", description: data?.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Lỗi phân tích", description: err.message, variant: "destructive" });
    } finally {
      setParsingText(false);
    }
  };

  // Shared image analysis logic
  const processImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Vui lòng chọn file hình ảnh", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Hình ảnh quá lớn (tối đa 5MB)", variant: "destructive" });
      return;
    }

    setParsingImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];

      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "parse_image", data: { base64, mimeType: file.type } },
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
        toast({ title: "Đã phân tích hình ảnh và điền thông tin!" });
      } else {
        toast({ title: "Không thể phân tích hình ảnh", description: data?.error || data?.raw, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Lỗi phân tích hình ảnh", description: err.message, variant: "destructive" });
    } finally {
      setParsingImage(false);
    }
  };

  // File input handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImageFile(file);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  // Ctrl+V paste image handler
  const handlePasteImage = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await processImageFile(file);
        return;
      }
    }
  };

  // Calculations
  const subtotal = items.reduce((s, it) => s + (it.quantity || 0) * (it.price || 0), 0);
  const vatAmount = formData.include_vat ? subtotal * formData.vat_rate / 100 : 0;
  const totalAmount = subtotal + vatAmount;
  const depositAmount = totalAmount * formData.deposit_percentage / 100;

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
    if (items.every(it => !it.name.trim())) {
      toast({ title: "Vui lòng nhập ít nhất 1 sản phẩm", variant: "destructive" });
      return;
    }

    const sellerInfo = {
      company_name: companySettings.companyName,
      address: companySettings.address,
      headquarters: companySettings.headquarters,
      phone: companySettings.phone,
      tax_code: companySettings.taxCode,
      bank_info: companySettings.bankInfo,
    };

    try {
      await createContract.mutateAsync({
        contract_number: formData.contract_number,
        customer_id: formData.customer_id || null,
        quote_id: formData.quote_id || null,
        order_id: formData.order_id || null,
        title: formData.title,
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
        items: items.map((it, i) => ({ ...it, total: it.quantity * it.price, stt: i + 1 })),
        terms: formData.articles.map(a => `${a.title}\n${a.content}`),
        legal_basis: formData.legal_basis,
        seller_info: sellerInfo,
        buyer_info: buyerInfo,
        articles: formData.articles,
        template_id: templateId || null,
        status: "draft",
      });
      toast({ title: "Tạo hợp đồng thành công!" });
      onSuccess();
    } catch (error: any) {
      toast({ title: "Lỗi tạo hợp đồng", description: error.message, variant: "destructive" });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[75vh] overflow-y-auto pr-2">
      {/* Template selection */}
      {templates && templates.length > 0 && (
        <div>
          <Label>Chọn mẫu hợp đồng</Label>
          <Select value={templateId} onValueChange={handleTemplateChange}>
            <SelectTrigger><SelectValue placeholder="-- Chọn mẫu (tùy chọn) --" /></SelectTrigger>
            <SelectContent>
              {templates.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Số hợp đồng</Label>
          <Input value={formData.contract_number} onChange={e => setFormData(p => ({ ...p, contract_number: e.target.value }))} />
        </div>
        <div>
          <Label>Tiêu đề hợp đồng</Label>
          <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} />
        </div>
      </div>

      {/* BUYER INFO - BÊN B */}
      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <Label className="text-base font-semibold">THÔNG TIN BÊN B (Bên mua)</Label>

        {/* AI Paste & Parse + Image Upload */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Dán thông tin hoặc tải ảnh chứa thông tin doanh nghiệp để AI tự động điền</Label>
          <div className="flex gap-2">
            <Textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              onPaste={handlePasteImage}
              placeholder="Dán text hoặc Ctrl+V ảnh chứa thông tin công ty, MST, địa chỉ, ngân hàng..."
              rows={2}
              className="text-sm"
            />
            <div className="flex flex-col gap-1 shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={handleAIAnalyze} disabled={parsingText || parsingImage} title={imagePreview ? "AI phân tích ảnh" : "AI phân tích text"}>
                {(parsingText || parsingImage) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-1 hidden sm:inline">AI</span>
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()} disabled={parsingImage} title="Tải ảnh chứa thông tin DN">
                {parsingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                <span className="ml-1 hidden sm:inline">Ảnh</span>
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
          </div>
          {imagePreview && (
            <div className="relative mt-2 inline-block">
              <img src={imagePreview} alt="Preview" className="max-h-32 rounded-md border border-border object-contain" />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
                onClick={() => setImagePreview(null)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label>Tên công ty / Cá nhân *</Label>
            <Input value={buyerInfo.company_name} onChange={e => setBuyerInfo(p => ({ ...p, company_name: e.target.value }))} placeholder="Tên doanh nghiệp hoặc cá nhân" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Người đại diện</Label>
            <Input value={buyerInfo.representative} onChange={e => setBuyerInfo(p => ({ ...p, representative: e.target.value }))} placeholder="Ông/Bà..." />
          </div>
          <div>
            <Label>Chức vụ</Label>
            <Input value={buyerInfo.position} onChange={e => setBuyerInfo(p => ({ ...p, position: e.target.value }))} placeholder="Giám đốc" />
          </div>
        </div>

        <div>
          <Label>Địa chỉ</Label>
          <Input value={buyerInfo.address} onChange={e => setBuyerInfo(p => ({ ...p, address: e.target.value }))} placeholder="Địa chỉ doanh nghiệp" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Mã số thuế</Label>
            <div className="flex gap-1">
              <Input value={buyerInfo.tax_code} onChange={e => setBuyerInfo(p => ({ ...p, tax_code: e.target.value }))} placeholder="MST" />
              <Button type="button" size="icon" variant="outline" onClick={handleTaxLookup} disabled={lookingUpTax} title="Tra cứu MST">
                {lookingUpTax ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label>Số điện thoại</Label>
            <Input value={buyerInfo.phone} onChange={e => setBuyerInfo(p => ({ ...p, phone: e.target.value }))} placeholder="SĐT" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Ngân hàng</Label>
            <Input value={buyerInfo.bank_name} onChange={e => setBuyerInfo(p => ({ ...p, bank_name: e.target.value }))} placeholder="Tên ngân hàng" />
          </div>
          <div>
            <Label>Số tài khoản</Label>
            <Input value={buyerInfo.bank_account} onChange={e => setBuyerInfo(p => ({ ...p, bank_account: e.target.value }))} placeholder="STK" />
          </div>
          <div>
            <Label>Chủ tài khoản</Label>
            <Input value={buyerInfo.bank_holder} onChange={e => setBuyerInfo(p => ({ ...p, bank_holder: e.target.value }))} placeholder="Chủ TK" />
          </div>
        </div>

        {/* Optional: Link to CRM customer */}
        <div className="pt-2 border-t">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowLinkCustomer(!showLinkCustomer)} className="text-xs text-muted-foreground">
            <Link className="h-3 w-3 mr-1" />
            {showLinkCustomer ? "Ẩn" : "Liên kết KH trong hệ thống (tùy chọn)"}
          </Button>
          {showLinkCustomer && (
            <div className="mt-2">
              <Select value={formData.customer_id} onValueChange={v => setFormData(p => ({ ...p, customer_id: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Chọn khách hàng (tùy chọn)" /></SelectTrigger>
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
        <div className="mt-2 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="p-2 text-left w-8">TT</th>
                <th className="p-2 text-left">Sản phẩm</th>
                <th className="p-2 text-left">Kích thước/Quy cách</th>
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
            <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Thêm sản phẩm</Button>
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
            <span>TỔNG GIÁ TRỊ HỢP ĐỒNG:</span>
            <span>{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Đặt cọc</span>
            <Input type="number" value={formData.deposit_percentage} onChange={e => setFormData(p => ({ ...p, deposit_percentage: Number(e.target.value) }))} className="h-7 w-16" />
            <span>% = <strong>{formatCurrency(depositAmount)}</strong></span>
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

      <Button type="submit" className="w-full" disabled={createContract.isPending}>
        {createContract.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Tạo hợp đồng
      </Button>
    </form>
  );
};
