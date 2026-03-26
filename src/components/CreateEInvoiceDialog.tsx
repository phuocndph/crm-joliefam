import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Send, Loader2, Building2, User } from "lucide-react";

interface CreateEInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

export const CreateEInvoiceDialog = ({ open, onOpenChange, contract }: CreateEInvoiceDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [templateCode, setTemplateCode] = useState("");
  const [invoiceSeries, setInvoiceSeries] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("TM/CK");

  const sellerInfo = contract?.seller_info || {};
  const buyerInfo = contract?.buyer_info || {};
  const items = (contract?.items || []) as any[];
  const vatRate = contract?.vat_rate || 0;
  const subtotal = Number(contract?.subtotal) || 0;
  const vatAmount = Number(contract?.vat_amount) || 0;
  const totalAmount = Number(contract?.total_amount) || 0;

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";

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
          contract,
          options: {
            templateCode,
            invoiceSeries,
            paymentMethod,
            invoiceType: "01GTKT",
          },
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Phát hành hoá đơn thành công!", {
          description: `Số HĐ: ${data.invoice?.invoice_number || "Đang xử lý"}`,
        });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Xuất hoá đơn điện tử - {contract?.contract_number}
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
                <Input
                  placeholder="VD: 01GTKT0/001"
                  value={templateCode}
                  onChange={(e) => setTemplateCode(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Ký hiệu HĐ *</Label>
                <Input
                  placeholder="VD: C24TAA"
                  value={invoiceSeries}
                  onChange={(e) => setInvoiceSeries(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Hình thức thanh toán</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                <p><span className="text-muted-foreground">Công ty:</span> {sellerInfo.company_name || sellerInfo.name || "—"}</p>
                <p><span className="text-muted-foreground">MST:</span> Theo cấu hình hệ thống</p>
                <p><span className="text-muted-foreground">Địa chỉ:</span> {sellerInfo.address || "—"}</p>
                <p><span className="text-muted-foreground">SĐT:</span> {sellerInfo.phone || "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-1">
                  <User className="h-4 w-4" /> Bên mua
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Công ty:</span> {buyerInfo.company_name || buyerInfo.name || "—"}</p>
                <p><span className="text-muted-foreground">MST:</span> {buyerInfo.tax_code || "—"}</p>
                <p><span className="text-muted-foreground">Địa chỉ:</span> {buyerInfo.address || "—"}</p>
                <p><span className="text-muted-foreground">Người mua:</span> {buyerInfo.representative || "—"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Items table */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Hàng hoá / Dịch vụ</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">STT</TableHead>
                    <TableHead>Tên hàng hoá</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Không có sản phẩm
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item: any, idx: number) => {
                      const qty = Number(item.quantity) || 1;
                      const price = Number(item.unit_price || item.price) || 0;
                      return (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>{item.name || item.product_name || "—"}</TableCell>
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
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Thuế GTGT ({vatRate}%):</span>
                    <span>{formatCurrency(vatAmount)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Tổng thanh toán:</span>
                    <span className="text-primary">{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Huỷ
            </Button>
            <Button onClick={handleCreateInvoice} disabled={loading}>
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
