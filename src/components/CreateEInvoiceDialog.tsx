import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Send, Loader2, Building2, User, Plus, Trash2, Search, Save } from "lucide-react";

interface CreateEInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any | null; // null = standalone mode
}

interface InvoiceItem {
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
}

export const CreateEInvoiceDialog = ({ open, onOpenChange, contract }: CreateEInvoiceDialogProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [templateCode, setTemplateCode] = useState("");
  const [invoiceSeries, setInvoiceSeries] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("TM/CK");

  // Standalone mode state
  const [buyerName, setBuyerName] = useState("");
  const [buyerCompany, setBuyerCompany] = useState("");
  const [buyerTaxCode, setBuyerTaxCode] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [vatRate, setVatRate] = useState(0);
  const [standaloneItems, setStandaloneItems] = useState<InvoiceItem[]>([
    { name: "", unit: "Cái", quantity: 1, unit_price: 0 },
  ]);

  const [lookingUp, setLookingUp] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const isStandalone = !contract;

  // Derived data
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

  const handleLookupTaxCode = async () => {
    if (!buyerTaxCode.trim()) {
      toast.error("Vui lòng nhập mã số thuế");
      return;
    }
    setLookingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "tax_code", data: buyerTaxCode.trim() },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error("Không tìm thấy", { description: data.error });
        return;
      }
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
    const invoiceContract = isStandalone
      ? {
          id: null,
          title: "",
          seller_info: sellerInfo,
          buyer_info: {
            name: buyerName,
            company_name: buyerCompany,
            tax_code: buyerTaxCode,
            address: buyerAddress,
            phone: buyerPhone,
            email: buyerEmail,
            representative: buyerName,
          },
          items: standaloneItems.map(i => ({
            name: i.name, unit: i.unit, quantity: i.quantity, unit_price: i.unit_price,
          })),
          vat_rate: vatRate,
          subtotal: computedSubtotal,
          vat_amount: computedVatAmount,
          total_amount: computedTotal,
        }
      : contract;
    return invoiceContract;
  };

  const handleCreateInvoice = async () => {
    if (!templateCode || !invoiceSeries) {
      toast.error("Vui lòng nhập Mã mẫu và Ký hiệu hoá đơn");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("vinvoice-api", {
        body: {
          action: "create_invoice",
          contract: buildInvoicePayload(),
          options: { templateCode, invoiceSeries, paymentMethod, invoiceType: "01GTKT" },
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Phát hành hoá đơn thành công!", {
          description: `Số HĐ: ${data.invoice?.invoice_number || "Đang xử lý"}`,
        });
        queryClient.invalidateQueries({ queryKey: ["einvoices"] });
        onOpenChange(false);
      } else {
        const errMsg = data?.error || data?.apiResponse?.errorCode || "Lỗi không xác định";
        toast.error("Phát hành hoá đơn thất bại", { description: errMsg });
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!templateCode || !invoiceSeries) {
      toast.error("Vui lòng nhập Mã mẫu và Ký hiệu hoá đơn");
      return;
    }
    setSavingDraft(true);
    try {
      const { data, error } = await supabase.functions.invoke("vinvoice-api", {
        body: {
          action: "create_draft",
          contract: buildInvoicePayload(),
          options: { templateCode, invoiceSeries, paymentMethod, invoiceType: "01GTKT" },
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Đã lưu hoá đơn nháp");
        queryClient.invalidateQueries({ queryKey: ["einvoices"] });
        onOpenChange(false);
      } else {
        const errMsg = data?.error || "Lỗi không xác định";
        toast.error("Lưu nháp thất bại", { description: errMsg });
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối", { description: err.message });
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {isStandalone ? "Tạo hoá đơn điện tử" : `Xuất hoá đơn - ${contract?.contract_number}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template config */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Cấu hình hoá đơn</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Mã mẫu HĐ *</Label>
                <Input placeholder="VD: 01GTKT0/001" value={templateCode} onChange={e => setTemplateCode(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Ký hiệu HĐ *</Label>
                <Input placeholder="VD: C24TAA" value={invoiceSeries} onChange={e => setInvoiceSeries(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Hình thức thanh toán</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TM/CK">Tiền mặt/Chuyển khoản</SelectItem>
                    <SelectItem value="TM">Tiền mặt</SelectItem>
                    <SelectItem value="CK">Chuyển khoản</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Seller & Buyer info */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-1">
                  <Building2 className="h-4 w-4" /> Bên bán
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Công ty:</span> {sellerInfo.company_name || sellerInfo.name || "Theo cấu hình"}</p>
                <p><span className="text-muted-foreground">MST:</span> Theo cấu hình hệ thống</p>
                <p><span className="text-muted-foreground">Địa chỉ:</span> {sellerInfo.address || "—"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-1">
                  <User className="h-4 w-4" /> Bên mua
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isStandalone ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Tên công ty</Label>
                        <Input value={buyerCompany} onChange={e => setBuyerCompany(e.target.value)} placeholder="Công ty ABC" />
                      </div>
                      <div>
                        <Label className="text-xs">Mã số thuế</Label>
                        <div className="flex gap-1">
                          <Input value={buyerTaxCode} onChange={e => setBuyerTaxCode(e.target.value)} placeholder="0123456789" />
                          <Button type="button" size="sm" variant="outline" onClick={handleLookupTaxCode} disabled={lookingUp} className="shrink-0">
                            {lookingUp ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Người mua hàng</Label>
                      <Input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Họ tên" />
                    </div>
                    <div>
                      <Label className="text-xs">Địa chỉ</Label>
                      <Input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="Địa chỉ" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">SĐT</Label>
                        <Input value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Email</Label>
                        <Input value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Công ty:</span> {contractBuyerInfo.company_name || contractBuyerInfo.name || "—"}</p>
                    <p><span className="text-muted-foreground">MST:</span> {contractBuyerInfo.tax_code || "—"}</p>
                    <p><span className="text-muted-foreground">Địa chỉ:</span> {contractBuyerInfo.address || "—"}</p>
                    <p><span className="text-muted-foreground">Người mua:</span> {contractBuyerInfo.representative || "—"}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Items table */}
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Hàng hoá / Dịch vụ</CardTitle>
              {isStandalone && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-muted-foreground">VAT %:</Label>
                    <Input
                      type="number"
                      className="w-16 h-7 text-xs"
                      value={vatRate}
                      onChange={e => setVatRate(Number(e.target.value) || 0)}
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={addItem}>
                    <Plus className="h-3 w-3 mr-1" /> Thêm dòng
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">STT</TableHead>
                    <TableHead>Tên hàng hoá</TableHead>
                    <TableHead className="w-20">ĐVT</TableHead>
                    <TableHead className="text-right w-20">SL</TableHead>
                    <TableHead className="text-right w-32">Đơn giá</TableHead>
                    <TableHead className="text-right w-32">Thành tiền</TableHead>
                    {isStandalone && <TableHead className="w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isStandalone ? (
                    standaloneItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>
                          <Input className="h-8 text-sm" value={item.name} onChange={e => updateItem(idx, "name", e.target.value)} placeholder="Tên SP" />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-sm w-16" value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-sm text-right" type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-sm text-right" type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(item.quantity * item.unit_price)}</TableCell>
                        <TableCell>
                          {standaloneItems.length > 1 && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : displayItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">Không có sản phẩm</TableCell>
                    </TableRow>
                  ) : (
                    displayItems.map((item: any, idx: number) => {
                      const qty = Number(item.quantity) || 1;
                      const price = Number(item.unit_price || item.price) || 0;
                      return (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>{item.name || item.product_name || "—"}</TableCell>
                          <TableCell>{item.unit || "—"}</TableCell>
                          <TableCell className="text-right">{qty}</TableCell>
                          <TableCell className="text-right">{formatCurrency(price)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(qty * price)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardContent className="py-3">
              <div className="flex justify-end">
                <div className="space-y-1 text-sm w-64">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cộng tiền hàng:</span>
                    <span>{formatCurrency(computedSubtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Thuế GTGT ({activeVatRate}%):</span>
                    <span>{formatCurrency(computedVatAmount)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Tổng thanh toán:</span>
                    <span className="text-primary">{formatCurrency(computedTotal)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading || savingDraft}>Huỷ</Button>
            <Button variant="secondary" onClick={handleSaveDraft} disabled={loading || savingDraft}>
              {savingDraft ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Đang lưu...</>
              ) : (
                <><Save className="h-4 w-4 mr-1" /> Lưu nháp</>
              )}
            </Button>
            <Button onClick={handleCreateInvoice} disabled={loading || savingDraft}>
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Đang xử lý...</>
              ) : (
                <><Send className="h-4 w-4 mr-1" /> Phát hành hoá đơn</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
