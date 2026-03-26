import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Send, Loader2, Plus, Trash2, Search, Save, RotateCcw, Eye, Eraser } from "lucide-react";

interface CreateEInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any | null;
}

interface InvoiceItem {
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
}

interface InvoiceTemplate {
  templateCode: string;
  templateName?: string;
  invoiceSeries?: string[];
  [key: string]: any;
}

export const CreateEInvoiceDialog = ({ open, onOpenChange, contract }: CreateEInvoiceDialogProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Templates from API
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [seriesList, setSeriesList] = useState<string[]>([]);

  // Invoice config
  const [templateCode, setTemplateCode] = useState("");
  const [invoiceSeries, setInvoiceSeries] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("TM/CK");
  const [paymentDetail, setPaymentDetail] = useState("");
  const [currency, setCurrency] = useState("VND");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [copyCount, setCopyCount] = useState(1);

  // Buyer info
  const [noInvoiceBuyer, setNoInvoiceBuyer] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerCompany, setBuyerCompany] = useState("");
  const [buyerTaxCode, setBuyerTaxCode] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [buyerIdType, setBuyerIdType] = useState("");
  const [buyerIdNumber, setBuyerIdNumber] = useState("");
  const [buyerBankName, setBuyerBankName] = useState("");
  const [buyerBankAccount, setBuyerBankAccount] = useState("");

  // Items & VAT
  const [vatRate, setVatRate] = useState(0);
  const [standaloneItems, setStandaloneItems] = useState<InvoiceItem[]>([
    { name: "", unit: "Cái", quantity: 1, unit_price: 0 },
  ]);

  const isStandalone = !contract;

  const sellerInfo = contract?.seller_info || {};
  const contractBuyerInfo = contract?.buyer_info || {};
  const contractItems = (contract?.items || []) as any[];
  const activeVatRate = isStandalone ? vatRate : (contract?.vat_rate || 0);

  const displayItems = isStandalone ? standaloneItems : contractItems;
  const computedSubtotal = isStandalone
    ? standaloneItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
    : (Number(contract?.subtotal) || 0);
  const computedVatAmount = computedSubtotal * (activeVatRate / 100);
  const computedTotal = isStandalone
    ? computedSubtotal + computedVatAmount
    : (Number(contract?.total_amount) || 0);

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";

  const addItem = () => setStandaloneItems(prev => [...prev, { name: "", unit: "Cái", quantity: 1, unit_price: 0 }]);
  const removeItem = (idx: number) => setStandaloneItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof InvoiceItem, value: any) => {
    setStandaloneItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleClearForm = () => {
    setBuyerName(""); setBuyerCompany(""); setBuyerTaxCode(""); setBuyerAddress("");
    setBuyerPhone(""); setBuyerEmail(""); setContractNumber("");
    setBuyerIdType(""); setBuyerIdNumber(""); setBuyerBankName(""); setBuyerBankAccount("");
    setNoInvoiceBuyer(false);
    setStandaloneItems([{ name: "", unit: "Cái", quantity: 1, unit_price: 0 }]);
    setVatRate(0);
  };

  const handleLookupTaxCode = async () => {
    if (!buyerTaxCode.trim()) { toast.error("Vui lòng nhập mã số thuế"); return; }
    setLookingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "tax_code", data: buyerTaxCode.trim() },
      });
      if (error) throw error;
      if (data?.error) { toast.error("Không tìm thấy", { description: data.error }); return; }
      if (data?.company_name) {
        setBuyerCompany(data.company_name);
        if (data.address) setBuyerAddress(data.address);
        if (data.representative) setBuyerName(data.representative);
        if (data.phone) setBuyerPhone(data.phone);
        toast.success("Đã tìm thấy thông tin doanh nghiệp", { description: data.company_name });
      } else {
        toast.error("Không tìm thấy doanh nghiệp với MST này");
      }
    } catch (err: any) {
      toast.error("Lỗi tra cứu MST", { description: err.message });
    } finally {
      setLookingUp(false);
    }
  };

  const buildInvoicePayload = () => {
    if (isStandalone) {
      return {
        id: null, title: "", seller_info: sellerInfo,
        buyer_info: {
          name: buyerName, company_name: buyerCompany, tax_code: buyerTaxCode,
          address: buyerAddress, phone: buyerPhone, email: buyerEmail,
          representative: buyerName, bank_name: buyerBankName, bank_account: buyerBankAccount,
          id_type: buyerIdType, id_number: buyerIdNumber,
        },
        items: standaloneItems.map(i => ({ name: i.name, unit: i.unit, quantity: i.quantity, unit_price: i.unit_price })),
        vat_rate: vatRate, subtotal: computedSubtotal, vat_amount: computedVatAmount, total_amount: computedTotal,
      };
    }
    return contract;
  };

  const handleCreateInvoice = async () => {
    if (!templateCode || !invoiceSeries) { toast.error("Vui lòng nhập Mã mẫu và Ký hiệu hoá đơn"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("vinvoice-api", {
        body: { action: "create_invoice", contract: buildInvoicePayload(), options: { templateCode, invoiceSeries, paymentMethod, invoiceType: "01GTKT" } },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Phát hành hoá đơn thành công!", { description: `Số HĐ: ${data.invoice?.invoice_number || "Đang xử lý"}` });
        queryClient.invalidateQueries({ queryKey: ["einvoices"] });
        onOpenChange(false);
      } else {
        toast.error("Phát hành hoá đơn thất bại", { description: data?.error || data?.apiResponse?.errorCode || "Lỗi không xác định" });
      }
    } catch (err: any) { toast.error("Lỗi kết nối", { description: err.message }); }
    finally { setLoading(false); }
  };

  const handleSaveDraft = async () => {
    if (!templateCode || !invoiceSeries) { toast.error("Vui lòng nhập Mã mẫu và Ký hiệu hoá đơn"); return; }
    setSavingDraft(true);
    try {
      const { data, error } = await supabase.functions.invoke("vinvoice-api", {
        body: { action: "create_draft", contract: buildInvoicePayload(), options: { templateCode, invoiceSeries, paymentMethod, invoiceType: "01GTKT" } },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Đã lưu hoá đơn nháp");
        queryClient.invalidateQueries({ queryKey: ["einvoices"] });
        onOpenChange(false);
      } else { toast.error("Lưu nháp thất bại", { description: data?.error || "Lỗi không xác định" }); }
    } catch (err: any) { toast.error("Lỗi kết nối", { description: err.message }); }
    finally { setSavingDraft(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            {isStandalone ? "Tạo hoá đơn điện tử" : `Xuất hoá đơn - ${contract?.contract_number}`}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {/* Two-column layout */}
          <div className="grid grid-cols-2 gap-6">
            {/* LEFT: THÔNG TIN KHÁCH HÀNG */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wide border-b border-border pb-2">
                Thông tin khách hàng
              </h3>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="noInvoiceBuyer"
                  checked={noInvoiceBuyer}
                  onCheckedChange={(v) => setNoInvoiceBuyer(!!v)}
                />
                <Label htmlFor="noInvoiceBuyer" className="text-xs cursor-pointer">
                  Người mua không lấy hoá đơn
                </Label>
              </div>

              {/* Tax code lookup */}
              <div>
                <Label className="text-xs text-muted-foreground">Tìm kiếm (MST / Tên)</Label>
                <div className="flex gap-1">
                  <Input
                    value={buyerTaxCode}
                    onChange={e => setBuyerTaxCode(e.target.value)}
                    placeholder="Nhập MST để tra cứu"
                    className="h-8 text-sm"
                    disabled={noInvoiceBuyer}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={handleLookupTaxCode} disabled={lookingUp || noInvoiceBuyer} className="shrink-0 h-8">
                    {lookingUp ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Tên người mua hàng</Label>
                <Input value={buyerName} onChange={e => setBuyerName(e.target.value)} className="h-8 text-sm" disabled={noInvoiceBuyer} />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Địa chỉ</Label>
                <Input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} className="h-8 text-sm" disabled={noInvoiceBuyer} />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Tên đơn vị (công ty)</Label>
                <Input value={buyerCompany} onChange={e => setBuyerCompany(e.target.value)} className="h-8 text-sm" disabled={noInvoiceBuyer} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Mã số thuế</Label>
                  <Input value={buyerTaxCode} onChange={e => setBuyerTaxCode(e.target.value)} className="h-8 text-sm" disabled={noInvoiceBuyer} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Hợp đồng số</Label>
                  <Input value={contractNumber} onChange={e => setContractNumber(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Số điện thoại</Label>
                  <Input value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} className="h-8 text-sm" disabled={noInvoiceBuyer} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} className="h-8 text-sm" disabled={noInvoiceBuyer} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Loại giấy tờ</Label>
                  <Select value={buyerIdType} onValueChange={setBuyerIdType} disabled={noInvoiceBuyer}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Chọn..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CMND">CMND</SelectItem>
                      <SelectItem value="CCCD">CCCD</SelectItem>
                      <SelectItem value="HC">Hộ chiếu</SelectItem>
                      <SelectItem value="KHAC">Khác</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Số giấy tờ</Label>
                  <Input value={buyerIdNumber} onChange={e => setBuyerIdNumber(e.target.value)} className="h-8 text-sm" disabled={noInvoiceBuyer} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Tên ngân hàng</Label>
                  <Input value={buyerBankName} onChange={e => setBuyerBankName(e.target.value)} className="h-8 text-sm" disabled={noInvoiceBuyer} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Số tài khoản</Label>
                  <Input value={buyerBankAccount} onChange={e => setBuyerBankAccount(e.target.value)} className="h-8 text-sm" disabled={noInvoiceBuyer} />
                </div>
              </div>
            </div>

            {/* RIGHT: THÔNG TIN HOÁ ĐƠN */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wide border-b border-border pb-2">
                Thông tin hoá đơn
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Hình thức thanh toán</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TM/CK">Tiền mặt/Chuyển khoản</SelectItem>
                      <SelectItem value="TM">Tiền mặt</SelectItem>
                      <SelectItem value="CK">Chuyển khoản</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Chi tiết hình thức TT</Label>
                  <Input value={paymentDetail} onChange={e => setPaymentDetail(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Loại tiền</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VND">VND</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tỷ giá</Label>
                  <Input type="number" value={exchangeRate} onChange={e => setExchangeRate(Number(e.target.value) || 1)} className="h-8 text-sm" />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Mẫu hoá đơn *</Label>
                <Input placeholder="VD: 01GTKT0/001" value={templateCode} onChange={e => setTemplateCode(e.target.value)} className="h-8 text-sm" />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Ký hiệu hoá đơn *</Label>
                <Input placeholder="VD: C24TAA" value={invoiceSeries} onChange={e => setInvoiceSeries(e.target.value)} className="h-8 text-sm" />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Số lượng nhân bản</Label>
                <Input type="number" value={copyCount} onChange={e => setCopyCount(Number(e.target.value) || 1)} className="h-8 text-sm" min={1} />
              </div>

              {isStandalone && (
                <div>
                  <Label className="text-xs text-muted-foreground">Thuế suất VAT (%)</Label>
                  <Input type="number" value={vatRate} onChange={e => setVatRate(Number(e.target.value) || 0)} className="h-8 text-sm" />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Items table - full width */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wide">
                Hàng hoá / Dịch vụ
              </h3>
              {isStandalone && (
                <Button size="sm" variant="outline" onClick={addItem} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> Thêm dòng
                </Button>
              )}
            </div>
            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10 text-xs">STT</TableHead>
                    <TableHead className="text-xs">Tên hàng hoá / dịch vụ</TableHead>
                    <TableHead className="w-20 text-xs">ĐVT</TableHead>
                    <TableHead className="text-right w-20 text-xs">Số lượng</TableHead>
                    <TableHead className="text-right w-32 text-xs">Đơn giá</TableHead>
                    <TableHead className="text-right w-32 text-xs">Thành tiền</TableHead>
                    {isStandalone && <TableHead className="w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isStandalone ? (
                    standaloneItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <Input className="h-7 text-xs" value={item.name} onChange={e => updateItem(idx, "name", e.target.value)} placeholder="Tên SP/DV" />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 text-xs w-16" value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 text-xs text-right" type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 text-xs text-right" type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell className="text-right text-xs">{formatCurrency(item.quantity * item.unit_price)}</TableCell>
                        <TableCell>
                          {standaloneItems.length > 1 && (
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : displayItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-6">Không có sản phẩm</TableCell>
                    </TableRow>
                  ) : (
                    displayItems.map((item: any, idx: number) => {
                      const qty = Number(item.quantity) || 1;
                      const price = Number(item.unit_price || item.price) || 0;
                      return (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{idx + 1}</TableCell>
                          <TableCell className="text-xs">{item.name || item.product_name || "—"}</TableCell>
                          <TableCell className="text-xs">{item.unit || "—"}</TableCell>
                          <TableCell className="text-right text-xs">{qty}</TableCell>
                          <TableCell className="text-right text-xs">{formatCurrency(price)}</TableCell>
                          <TableCell className="text-right text-xs">{formatCurrency(qty * price)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Summary */}
          <div className="flex justify-end">
            <div className="space-y-1 text-sm w-72 bg-muted/30 rounded-md p-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Cộng tiền hàng:</span>
                <span className="text-xs">{formatCurrency(computedSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Thuế GTGT ({activeVatRate}%):</span>
                <span className="text-xs">{formatCurrency(computedVatAmount)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span className="text-sm">Tổng thanh toán:</span>
                <span className="text-sm text-primary">{formatCurrency(computedTotal)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between border-t border-border pt-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading || savingDraft} className="text-xs h-9">
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Quay lại
              </Button>
              {isStandalone && (
                <Button variant="ghost" onClick={handleClearForm} disabled={loading || savingDraft} className="text-xs h-9 text-destructive hover:text-destructive">
                  <Eraser className="h-3.5 w-3.5 mr-1" /> Xoá dữ liệu nhập
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleSaveDraft} disabled={loading || savingDraft} className="text-xs h-9">
                {savingDraft ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Đang lưu...</> : <><Save className="h-3.5 w-3.5 mr-1" /> Lập HĐ nháp</>}
              </Button>
              <Button onClick={handleCreateInvoice} disabled={loading || savingDraft} className="text-xs h-9">
                {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Đang xử lý...</> : <><Send className="h-3.5 w-3.5 mr-1" /> Phát hành hoá đơn</>}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
